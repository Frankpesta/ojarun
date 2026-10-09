/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

// Saturday 3 Oct 2026, 08:00 WAT. The first slot's cutoff is 10:00 WAT (09:00 UTC).
const SAT_8AM = Date.UTC(2026, 9, 3, 7, 0);
const AFTER_CUTOFF = Date.UTC(2026, 9, 3, 9, 1);

// Isikan Market is at 7.2617, 5.2049; this customer lives north of it.
const NORTH = { lat: 7.3, lng: 5.205 };

// Simulated names come from the digit sum: 1234567890 → KEMI ALAO, 2234567890 → IFEOMA NWOSU,
// 1111111111 → CHINEDU OKAFOR. Numbers ending 9999 fail at the "bank".
const KEMI = "1234567890";
const IFEOMA = "2234567890";
const CHINEDU = "1111111111";
const FAILS = "1234569999";
const GTB = "058";

type T = ReturnType<typeof setup>;

function setup() {
  return convexTest(schema, modules);
}

async function signIn(t: T, subject: string) {
  const as = t.withIdentity({ subject, email: `${subject}@example.com`, tokenIdentifier: `test|${subject}` });
  const userId = await as.mutation(api.users.ensureUser, {});
  await t.run((ctx) => ctx.db.patch(userId, { name: `${subject} Test` }));
  return { as, userId };
}

async function world(t: T) {
  await t.mutation(internal.seed.run, {});
  const ops = await signIn(t, "ops");
  await t.run((ctx) => ctx.db.patch(ops.userId, { role: "ops" }));
  const { market, slot } = await t.run(async (ctx) => ({
    market: (await ctx.db.query("markets").collect()).find((m) => m.slug === "isikan-market")!,
    slot: (await ctx.db.query("slots").collect()).sort((a, b) => a.windowStart - b.windowStart)[0]!,
  }));
  return { ops, marketId: market._id, slotId: slot._id };
}

async function shopper(t: T, w: Awaited<ReturnType<typeof world>>, subject: string) {
  const s = await signIn(t, subject);
  await w.ops.as.mutation(api.ops.shoppers.createShopper, {
    userId: s.userId,
    legalName: `${subject} Shopper`,
    reason: "Hired",
  });
  await s.as.mutation(api.shopper.setOnShift, { onShift: true });
  return s;
}

/** A paid order (the wallet covers it, so no Paystack round trip). */
async function paidOrder(t: T, w: Awaited<ReturnType<typeof world>>, subject: string) {
  const c = await signIn(t, subject);
  const addressId = await c.as.mutation(api.addresses.create, {
    label: "Home",
    formatted: `${subject} Street, Akure`,
    landmark: "By the big mango tree",
    ...NORTH,
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("walletEntries", { userId: c.userId, type: "adjustment", amount: 100_000_00, dedupeKey: `seed:${subject}` });
    await ctx.db.patch(c.userId, { walletBalance: 100_000_00 });
  });
  const res = await c.as.mutation(api.orders.create, {
    clientRequestId: `req-${subject}-0001`,
    addressId,
    marketId: w.marketId,
    slotId: w.slotId,
    items: [
      { name: "Tomatoes", budget: 3_000_00, preferences: ["Firm"] },
      { name: "Plantain", budget: 2_000_00, preferences: [] },
    ],
    bufferPct: 10,
    applyWallet: true,
  });
  expect(res.status).toBe("paid");
  return { ...c, orderId: res.orderId };
}

async function photo(t: T) {
  return await t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" })));
}

let seq = 0;
const rid = () => `req-${String(++seq).padStart(8, "0")}`;

/** A shopper mid-run on one order (Tomatoes ₦3,000, Plantain ₦2,000), photos taken unless told not to. */
async function shopping(t: T, opts: { photos?: boolean } = {}) {
  const w = await world(t);
  const ada = await shopper(t, w, "ada");
  const c1 = await paidOrder(t, w, "c1");
  vi.setSystemTime(AFTER_CUTOFF);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const [batch] = await t.run((ctx) =>
    ctx.db
      .query("batches")
      .withIndex("by_slot", (q) => q.eq("slotId", w.slotId))
      .collect(),
  );
  await w.ops.as.mutation(api.ops.dispatch.confirmBatch, { batchId: batch!._id });
  await ada.as.mutation(api.shopper.startShopping, { batchId: batch!._id });
  await t.action(internal.traders.refreshBanks, {});
  const detail = await ada.as.query(api.shopper.batch, { batchId: batch!._id });
  const items = detail!.orders[0]!.items;
  if (opts.photos !== false) {
    for (const i of items) await ada.as.mutation(api.items.attachPhoto, { itemId: i._id, storageId: await photo(t) });
  }
  return { w, ada, c1, batchId: batch!._id, tomatoes: items[0]!._id, plantain: items[1]!._id };
}


type Run = Awaited<ReturnType<typeof shopping>>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(SAT_8AM);
  vi.stubEnv("APP_ENV", "development");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const settle = (t: T) => t.finishAllScheduledFunctions(vi.runAllTimers);
const getOrder = (t: T, s: Run) => t.run((ctx) => ctx.db.get(s.c1.orderId));
const balance = async (t: T, id: Id<"users">) => (await t.run((ctx) => ctx.db.get(id)))!.walletBalance;
const entries = (t: T, id: Id<"users">) =>
  t.run((ctx) =>
    ctx.db
      .query("walletEntries")
      .withIndex("by_user", (q) => q.eq("userId", id))
      .collect(),
  );

async function payTrader(t: T, s: Run, itemId: Id<"orderItems">, amount: number, account = KEMI) {
  await s.ada.as.action(api.traders.resolveAccount, { accountNumber: account, bankCode: GTB });
  return await s.ada.as.mutation(api.transfers.requestTraderTransfer, {
    clientRequestId: rid(),
    itemId,
    recipient: { bankCode: GTB, accountNumber: account },
    amount,
  });
}

/** Tomatoes: ₦800 extra approved (₦500 buffer + ₦300 wallet), ₦3,700 paid, bought. Plantain: skipped. */
async function shopped(t: T) {
  const s = await shopping(t);
  const messageId = await s.ada.as.mutation(api.priceChecks.send, {
    clientRequestId: rid(),
    itemId: s.tomatoes,
    quoted: 3_800_00,
    budgetGets: "about 1½ paint rubbers",
    extraRequested: 800_00,
  });
  await s.c1.as.mutation(api.priceChecks.respond, { messageId, decision: "approve" });
  await payTrader(t, s, s.tomatoes, 3_700_00);
  await s.ada.as.mutation(api.items.setOutcome, { itemId: s.tomatoes, status: "bought", quantityNote: "2 paint rubbers" });
  await s.ada.as.mutation(api.items.setOutcome, { itemId: s.plantain, status: "skipped", shopperNote: "No plantain today" });
  return s;
}

describe("delivery and the door", () => {
  it("runs the happy path with one rejected and one skipped item, crediting exactly the hand-worked amounts", async () => {
    const t = setup();
    const s = await shopped(t);

    // The transfer is still settling, so the shopper can't head out yet.
    await expect(s.ada.as.mutation(api.delivery.enRoute, { batchId: s.batchId })).rejects.toThrow(/Wait for the payment for Tomatoes/);
    await settle(t);
    await s.ada.as.mutation(api.delivery.enRoute, { batchId: s.batchId, lat: 7.26, lng: 5.2 });
    expect((await getOrder(t, s))!.status).toBe("en_route");

    // Arrived ~4 km from the pin: recorded, not blocked.
    const { distanceMeters } = await s.ada.as.mutation(api.delivery.arrived, { orderId: s.c1.orderId, lat: 7.264, lng: 5.205 });
    expect(distanceMeters).toBeGreaterThan(500);
    expect((await getOrder(t, s))!.arrivedDistanceMeters).toBe(distanceMeters);

    // The customer rejects the tomatoes, changes their mind, then rejects them again.
    await expect(s.c1.as.mutation(api.delivery.rejectItem, { itemId: s.plantain, reason: "Not here" })).rejects.toThrow(/Only items your shopper bought/);
    await s.c1.as.mutation(api.delivery.rejectItem, { itemId: s.tomatoes, reason: "Too soft" });
    await s.c1.as.mutation(api.delivery.undoReject, { itemId: s.tomatoes });
    expect((await t.run((ctx) => ctx.db.get(s.tomatoes)))!.status).toBe("bought");
    await s.c1.as.mutation(api.delivery.rejectItem, { itemId: s.tomatoes, reason: "Too soft for stew" });

    const before = await balance(t, s.c1.userId);
    expect(await s.c1.as.mutation(api.delivery.accept, { orderId: s.c1.orderId })).toEqual({ leftover: 2_100_00, rejection: 3_700_00 });
    expect(await s.c1.as.mutation(api.delivery.accept, { orderId: s.c1.orderId })).toBeNull(); // replay

    // Hand calculation:
    //   Tomatoes  funded 3,000 + 800 = 3,800, spent 3,700 → leftover 100; rejected → 3,700 back
    //   Plantain  skipped, funded 2,000 → leftover 2,000
    //   Buffer    500, all used by the approval → 0
    // Leftover 2,100 + rejection 3,700 = 5,800.
    expect(await balance(t, s.c1.userId)).toBe(before + 5_800_00);
    const credits = (await entries(t, s.c1.userId)).filter((e) => e.orderId === s.c1.orderId && e.amount > 0);
    expect(credits.map((e) => [e.type, e.amount]).sort()).toEqual([
      ["leftover_credit", 2_100_00],
      ["rejection_credit", 3_700_00],
    ]);

    expect((await getOrder(t, s))!.status).toBe("completed");
    expect((await t.run((ctx) => ctx.db.get(s.batchId)))!.status).toBe("done");
    // Rejected items don't feed the price guide.
    expect(await t.run((ctx) => ctx.db.query("priceGuide").collect())).toEqual([]);
    await expect(s.c1.as.mutation(api.delivery.rejectItem, { itemId: s.tomatoes, reason: "Again" })).rejects.toThrow(/at the door/);

    const receipt = await s.c1.as.query(api.orders.receipt, { orderId: s.c1.orderId });
    expect(receipt).toMatchObject({ extras: 300_00, back: 5_800_00 });
    expect(receipt!.net).toBe(receipt!.paid + 300_00 - 5_800_00);
  });

  it("won't head out with items left, and records kept items in the price guide", async () => {
    const t = setup();
    const s = await shopping(t);
    await expect(s.ada.as.mutation(api.delivery.enRoute, { batchId: s.batchId })).rejects.toThrow(/Finish every item first/);
    await payTrader(t, s, s.plantain, 1_800_00);
    await settle(t);
    await s.ada.as.mutation(api.items.setOutcome, { itemId: s.plantain, status: "bought" });
    await s.ada.as.mutation(api.items.setOutcome, { itemId: s.tomatoes, status: "skipped", shopperNote: "None" });
    await s.ada.as.mutation(api.delivery.enRoute, { batchId: s.batchId });
    await expect(s.c1.as.mutation(api.delivery.accept, { orderId: s.c1.orderId })).rejects.toThrow(/at the door/);
    await s.ada.as.mutation(api.delivery.arrived, { orderId: s.c1.orderId });
    await s.c1.as.mutation(api.delivery.accept, { orderId: s.c1.orderId });
    const guide = await t.run((ctx) => ctx.db.query("priceGuide").collect());
    expect(guide).toHaveLength(1);
    expect(guide[0]).toMatchObject({ itemKey: "name:plantain", samples: [{ amount: 1_800_00 }] });
  });

  it("alerts ops when the customer can't be reached, and ops can complete for them", async () => {
    const t = setup();
    const s = await shopping(t);
    await s.ada.as.mutation(api.items.setOutcome, { itemId: s.tomatoes, status: "skipped", shopperNote: "None" });
    await s.ada.as.mutation(api.items.setOutcome, { itemId: s.plantain, status: "skipped", shopperNote: "None" });
    await s.ada.as.mutation(api.delivery.enRoute, { batchId: s.batchId });
    await s.ada.as.mutation(api.delivery.arrived, { orderId: s.c1.orderId });
    await s.ada.as.mutation(api.delivery.customerUnavailable, { orderId: s.c1.orderId, note: "Gate locked" });
    const alerts = await s.w.ops.as.query(api.ops.transfers.alerts, {});
    expect(alerts[0]).toMatchObject({ kind: "customer_unavailable" });
    expect(alerts[0]!.message).toMatch(/Gate locked/);

    await expect(s.w.ops.as.mutation(api.ops.orders.completeOnBehalf, { orderId: s.c1.orderId, reason: " " })).rejects.toThrow(/reason/);
    const before = await balance(t, s.c1.userId);
    await s.w.ops.as.mutation(api.ops.orders.completeOnBehalf, { orderId: s.c1.orderId, reason: "Customer asked by phone to leave it with the gateman" });
    expect(await balance(t, s.c1.userId)).toBe(before + 5_500_00); // both budgets + unused buffer
    expect(await s.w.ops.as.query(api.ops.transfers.alerts, {})).toEqual([]);
    expect((await getOrder(t, s))!.completedReason).toMatch(/gateman/);
  });
});

describe("cancellation", () => {
  it("refunds a wallet-paid order in full and frees the slot, but not once shopping starts", async () => {
    const t = setup();
    const w = await world(t);
    const c = await paidOrder(t, w, "c1");
    const slotBefore = (await t.run((ctx) => ctx.db.get(w.slotId)))!.reserved;
    const quote = await c.as.query(api.orders.cancelQuote, { orderId: c.orderId });
    const order = (await t.run((ctx) => ctx.db.get(c.orderId)))!;
    expect(quote).toMatchObject({ cancellable: true, refund: order.totals.walletApplied, keptCharge: 0 });
    const before = await balance(t, c.userId);
    await c.as.mutation(api.orders.cancel, { orderId: c.orderId });
    await c.as.mutation(api.orders.cancel, { orderId: c.orderId }); // replay
    expect(await balance(t, c.userId)).toBe(before + order.totals.walletApplied);
    expect((await t.run((ctx) => ctx.db.get(w.slotId)))!.reserved).toBe(slotBefore - 1);

    const t2 = setup();
    const s = await shopping(t2);
    expect(await s.c1.as.query(api.orders.cancelQuote, { orderId: s.c1.orderId })).toEqual({ cancellable: false });
    await expect(s.c1.as.mutation(api.orders.cancel, { orderId: s.c1.orderId })).rejects.toThrow(/Shopping has started/);
  });

  it("keeps the Paystack charge when the customer cancels a card order, and refunds it when ops does", async () => {
    const t = setup();
    const w = await world(t);
    const a = await paidOrder(t, w, "c1");
    const b = await paidOrder(t, w, "c2");
    // Pretend both were card payments: ₦6,300 charged including a ₦200 Paystack charge.
    const card = { walletApplied: 0, chargeAmount: 6_300_00, paystackCharge: 200_00 };
    for (const o of [a, b]) {
      await t.run(async (ctx) => {
        const row = (await ctx.db.get(o.orderId))!;
        await ctx.db.patch(o.orderId, { totals: { ...row.totals, ...card } });
      });
    }
    const aBefore = await balance(t, a.userId);
    expect(await a.as.query(api.orders.cancelQuote, { orderId: a.orderId })).toMatchObject({ refund: 6_100_00, keptCharge: 200_00 });
    await a.as.mutation(api.orders.cancel, { orderId: a.orderId });
    expect(await balance(t, a.userId)).toBe(aBefore + 6_100_00);

    const bBefore = await balance(t, b.userId);
    await expect(w.ops.as.mutation(api.ops.orders.cancel, { orderId: b.orderId, reason: "", refundCharge: true })).rejects.toThrow(/reason/);
    await w.ops.as.mutation(api.ops.orders.cancel, { orderId: b.orderId, reason: "No shopper available", refundCharge: true });
    expect(await balance(t, b.userId)).toBe(bBefore + 6_300_00);
    const types = (await entries(t, b.userId)).filter((e) => e.orderId === b.orderId).map((e) => [e.type, e.amount]);
    expect(types).toContainEqual(["cancellation_refund", 6_100_00]);
    expect(types).toContainEqual(["adjustment", 200_00]);
  });

  it("only returns wallet money for an order that was never paid", async () => {
    const t = setup();
    const w = await world(t);
    const c = await signIn(t, "c1");
    const addressId = await c.as.mutation(api.addresses.create, { label: "Home", formatted: "c1 Street", landmark: "By the mango tree", ...NORTH });
    await t.run(async (ctx) => {
      await ctx.db.insert("walletEntries", { userId: c.userId, type: "adjustment", amount: 1_000_00, dedupeKey: "seed:c1", note: "seed" });
      await ctx.db.patch(c.userId, { walletBalance: 1_000_00 });
    });
    const res = await c.as.mutation(api.orders.create, {
      clientRequestId: "req-c1-unpaid1",
      addressId,
      marketId: w.marketId,
      slotId: w.slotId,
      items: [{ name: "Tomatoes", budget: 3_000_00, preferences: [] }],
      bufferPct: 0,
      applyWallet: true,
    });
    expect(res.status).toBe("pending_payment");
    expect(await balance(t, c.userId)).toBe(0);
    expect(await c.as.query(api.orders.cancelQuote, { orderId: res.orderId })).toMatchObject({ refund: 1_000_00, unpaid: true });
    await c.as.mutation(api.orders.cancel, { orderId: res.orderId });
    expect(await balance(t, c.userId)).toBe(1_000_00);
  });

  it("takes a cancelled order out of its batch", async () => {
    const t = setup();
    const w = await world(t);
    await shopper(t, w, "ada");
    const c = await paidOrder(t, w, "c1");
    vi.setSystemTime(AFTER_CUTOFF);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const [batch] = await t.run((ctx) => ctx.db.query("batches").collect());
    await w.ops.as.mutation(api.ops.dispatch.confirmBatch, { batchId: batch!._id });
    await c.as.mutation(api.orders.cancel, { orderId: c.orderId });
    expect((await t.run((ctx) => ctx.db.get(c.orderId)))!.batchId).toBeUndefined();
    expect(await t.run((ctx) => ctx.db.get(batch!._id))).toBeNull(); // empty, no cash: removed
  });
});

describe("withdrawals", () => {
  async function customerWithMoney(t: T, amount: number) {
    await t.mutation(internal.seed.run, {});
    await t.action(internal.traders.refreshBanks, {});
    const c = await signIn(t, "c1");
    await t.run(async (ctx) => {
      await ctx.db.insert("walletEntries", { userId: c.userId, type: "adjustment", amount, dedupeKey: "seed:c1", note: "seed" });
      await ctx.db.patch(c.userId, { walletBalance: amount });
    });
    return c;
  }

  it("saves a payout account, enforces the minimum, and pays out", async () => {
    const t = setup();
    const c = await customerWithMoney(t, 5_000_00);
    await expect(c.as.mutation(api.withdrawals.request, { clientRequestId: rid(), amount: 1_000_00 })).rejects.toThrow(/Add your bank/);
    expect(await c.as.action(api.withdrawals.setPayoutAccount, { accountNumber: KEMI, bankCode: GTB })).toEqual({
      accountName: "KEMI ALAO",
      bankName: "Guaranty Trust Bank",
    });
    await expect(c.as.mutation(api.withdrawals.request, { clientRequestId: rid(), amount: 999_00 })).rejects.toThrow(/minimum withdrawal is ₦1,000/);
    await expect(c.as.mutation(api.withdrawals.request, { clientRequestId: rid(), amount: 6_000_00 })).rejects.toThrow(/You have ₦5,000/);

    const id = rid();
    await c.as.mutation(api.withdrawals.request, { clientRequestId: id, amount: 1_000_00 });
    await c.as.mutation(api.withdrawals.request, { clientRequestId: id, amount: 1_000_00 }); // replay
    expect(await balance(t, c.userId)).toBe(4_000_00);
    await settle(t);
    const payout = await c.as.query(api.withdrawals.payout, {});
    expect(payout).toMatchObject({ balance: 4_000_00, account: { name: "KEMI ALAO", account: "•••• 7890" } });
    expect(payout.recent).toMatchObject([{ amount: 1_000_00, status: "success" }]);
  });

  it("puts the money back when the bank fails the transfer", async () => {
    const t = setup();
    const c = await customerWithMoney(t, 3_000_00);
    await c.as.action(api.withdrawals.setPayoutAccount, { accountNumber: FAILS, bankCode: GTB });
    await c.as.mutation(api.withdrawals.request, { clientRequestId: rid(), amount: 2_000_00 });
    expect(await balance(t, c.userId)).toBe(1_000_00);
    await settle(t);
    expect(await balance(t, c.userId)).toBe(3_000_00);
    const rows = (await entries(t, c.userId)).map((e) => [e.type, e.amount]);
    expect(rows).toContainEqual(["withdrawal_debit", -2_000_00]);
    expect(rows).toContainEqual(["withdrawal_reversal", 2_000_00]);
    const [w] = await c.as.query(api.withdrawals.payout, {}).then((p) => p.recent);
    expect(w).toMatchObject({ status: "failed" });
    // A repeated failure report doesn't refund twice.
    const ref = (await t.run((ctx) => ctx.db.query("withdrawals").collect()))[0]!.reference;
    expect(await t.mutation(internal.withdrawals.applyResult, { reference: ref, status: "failed" })).toBe("duplicate");
    expect(await balance(t, c.userId)).toBe(3_000_00);
    expect((await t.run((ctx) => ctx.db.query("opsAlerts").collect())).map((a) => a.kind)).toEqual(["withdrawal_failed"]);
  });
});

describe("wallet ledger and ops adjustments", () => {
  it("pages the ledger and lets ops adjust with a reason", async () => {
    const t = setup();
    const w = await world(t);
    const c = await signIn(t, "c1");
    await expect(w.ops.as.mutation(api.ops.orders.adjustWallet, { userId: c.userId, amount: 500_00, reason: "" })).rejects.toThrow(/reason/);
    for (let i = 0; i < 3; i++) {
      await w.ops.as.mutation(api.ops.orders.adjustWallet, { userId: c.userId, amount: 500_00, reason: `Goodwill ${i}` });
      vi.advanceTimersByTime(1000);
    }
    await w.ops.as.mutation(api.ops.orders.adjustWallet, { userId: c.userId, amount: -200_00, reason: "Correction" });
    expect(await balance(t, c.userId)).toBe(1_300_00);
    const page = await c.as.query(api.wallet.ledger, { paginationOpts: { numItems: 2, cursor: null } });
    expect(page.page.map((e) => e.amount)).toEqual([-200_00, 500_00]);
    expect(page.isDone).toBe(false);
    await expect(w.ops.as.mutation(api.ops.orders.adjustWallet, { userId: c.userId, amount: -5_000_00, reason: "Too much" })).rejects.toThrow(/Not enough/);
  });
});

describe("account deletion", () => {
  it("is blocked by money or an active order, then wipes personal details", async () => {
    const t = setup();
    const w = await world(t);
    const c = await paidOrder(t, w, "c1");
    const blockers = (await c.as.query(api.users.deletionCheck, {})).blockers;
    expect(blockers.join(" ")).toMatch(/order in progress/);
    expect(blockers.join(" ")).toMatch(/wallet still has money/);
    await expect(c.as.mutation(api.users.deleteAccount, {})).rejects.toThrow(/order in progress/);

    await c.as.mutation(api.orders.cancel, { orderId: c.orderId });
    await t.run((ctx) => ctx.db.patch(c.userId, { walletBalance: 0 }));
    expect((await c.as.query(api.users.deletionCheck, {})).blockers).toEqual([]);
    await c.as.mutation(api.users.deleteAccount, {});
    const user = (await t.run((ctx) => ctx.db.get(c.userId)))!;
    expect(user).toMatchObject({ status: "deleted", clerkId: `deleted:${c.userId}` });
    expect(user.name).toBeUndefined();
    expect(user.email).toBeUndefined();
    // Ledger rows stay for accounting.
    expect((await entries(t, c.userId)).length).toBeGreaterThan(0);
    // Signing in again starts a fresh account.
    expect(await c.as.query(api.users.me, {})).toBeNull();
  });
});
