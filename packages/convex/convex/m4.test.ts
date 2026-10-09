/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { paystackSignature } from "./http";

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

async function pay(s: Run, account: string, amount: number, itemId = s.tomatoes, clientRequestId = rid()) {
  await s.ada.as.action(api.traders.resolveAccount, { accountNumber: account, bankCode: GTB });
  return await s.ada.as.mutation(api.transfers.requestTraderTransfer, {
    clientRequestId,
    itemId,
    recipient: { bankCode: GTB, accountNumber: account },
    amount,
  });
}

const settle = (t: T) => t.finishAllScheduledFunctions(vi.runAllTimers);
const item = (t: T, id: Id<"orderItems">) => t.run((ctx) => ctx.db.get(id));
const openAlerts = (t: T) =>
  t.run((ctx) =>
    ctx.db
      .query("opsAlerts")
      .withIndex("by_resolvedAt", (q) => q.eq("resolvedAt", undefined))
      .collect(),
  );

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(SAT_8AM);
  // Development with no Paystack key: bank lookups and transfers are simulated (lib/paystack.ts).
  vi.stubEnv("APP_ENV", "development");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("bank lookups", () => {
  it("lists banks and resolves an account name, refusing bad numbers", async () => {
    const t = setup();
    const s = await shopping(t);
    const { banks } = await s.ada.as.query(api.traders.banks, {});
    expect(banks.find((b) => b.code === GTB)?.name).toBe("Guaranty Trust Bank");
    expect(await s.ada.as.action(api.traders.resolveAccount, { accountNumber: KEMI, bankCode: GTB })).toEqual({
      accountNumber: KEMI,
      accountName: "KEMI ALAO",
      bankName: "Guaranty Trust Bank",
    });
    await expect(s.ada.as.action(api.traders.resolveAccount, { accountNumber: "12345", bankCode: GTB })).rejects.toThrow(/10 digits/);
    await expect(s.ada.as.action(api.traders.resolveAccount, { accountNumber: "0000000000", bankCode: GTB })).rejects.toThrow(/couldn't find/);
    await expect(s.ada.as.action(api.traders.resolveAccount, { accountNumber: KEMI, bankCode: "nope" })).rejects.toThrow(/Pick the bank/);
    // Customers can look up accounts too (for their own payout account, M6).
    expect((await s.c1.as.action(api.traders.resolveAccount, { accountNumber: KEMI, bankCode: GTB })).accountName).toBe("KEMI ALAO");
  });
});

describe("trader transfers", () => {
  it("pays a trader within budget: queued, then success, and the item's spend updates", async () => {
    const t = setup();
    const s = await shopping(t);
    const res = await pay(s, KEMI, 2_500_00);
    expect(res.status).toBe("queued");
    expect((await item(t, s.tomatoes))!.amountSpent).toBe(0);

    await settle(t);
    const tr = await t.run((ctx) => ctx.db.get(res.transferId));
    expect(tr).toMatchObject({ status: "success", newRecipient: true, amount: 2_500_00 });
    expect(tr!.reference).toMatch(/^ojt_[a-z0-9]+_[A-Za-z0-9]+$/);
    expect((await item(t, s.tomatoes))!.amountSpent).toBe(2_500_00);

    const view = await s.ada.as.query(api.transfers.forItem, { itemId: s.tomatoes });
    expect(view).toMatchObject({ cap: 3_000_00, committed: 2_500_00, spent: 2_500_00, left: 500_00 });
    expect(view!.transfers[0]).toMatchObject({ traderName: "KEMI ALAO", status: "success", account: "•••• 7890" });

    // A new recipient waits for ops review but wasn't blocked; it now shows as a recent trader.
    const flagged = await s.w.ops.as.query(api.ops.transfers.flaggedTraders, {});
    expect(flagged).toMatchObject([{ name: "KEMI ALAO", review: "pending", flagReason: "New recipient", paidCount: 1 }]);
    const recent = await s.ada.as.query(api.traders.recentForMarket, { marketId: s.w.marketId });
    expect(recent).toMatchObject([{ resolvedName: "KEMI ALAO", transferCount: 1 }]);

    // Paying a recent trader by id skips the lookup.
    const again = await s.ada.as.mutation(api.transfers.requestTraderTransfer, {
      clientRequestId: rid(),
      itemId: s.plantain,
      recipient: { traderId: recent[0]!._id },
      amount: 1_000_00,
    });
    await settle(t);
    expect(await t.run((ctx) => ctx.db.get(again.transferId))).toMatchObject({ status: "success", newRecipient: false });
  });

  it("refuses more than the item's budget, counting pending transfers and cash", async () => {
    const t = setup();
    const s = await shopping(t);
    await expect(pay(s, KEMI, 3_000_01)).rejects.toThrow(/up to ₦3,000/);
    await pay(s, KEMI, 2_000_00); // still queued: it holds the budget too
    await expect(pay(s, IFEOMA, 1_500_00)).rejects.toThrow(/up to ₦1,000/);
    await pay(s, IFEOMA, 1_000_00);
    await settle(t);
    await expect(pay(s, IFEOMA, 1)).rejects.toThrow(/budget is used up/);
    // An approved price-check extra raises the cap.
    await t.run((ctx) => ctx.db.patch(s.tomatoes, { approvedExtra: 500_00 }));
    expect((await pay(s, IFEOMA, 500_00)).status).toBe("queued");
  });

  it("refuses to pay before the item has a photo, or for items marked not available", async () => {
    const t = setup();
    const s = await shopping(t, { photos: false });
    await expect(pay(s, KEMI, 1_000_00)).rejects.toThrow(/photo of the item/);
    await s.ada.as.mutation(api.items.setOutcome, { itemId: s.plantain, status: "skipped", shopperNote: "None today" });
    await expect(pay(s, KEMI, 1_000_00, s.plantain)).rejects.toThrow(/not available/);
  });

  it("blocks paying a shopper's own saved account and alerts ops", async () => {
    const t = setup();
    const s = await shopping(t);
    await s.w.ops.as.action(api.ops.shoppers.addBankAccount, {
      userId: s.ada.userId,
      accountNumber: CHINEDU,
      bankCode: GTB,
      reason: "Onboarding",
    });
    const res = await pay(s, CHINEDU, 1_000_00);
    expect(res.status).toBe("blocked");
    await settle(t);
    const tr = await t.run((ctx) => ctx.db.get(res.transferId));
    expect(tr).toMatchObject({ status: "blocked" });
    expect(tr!.failureReason).toMatch(/Ops has been told/);
    expect(tr!.failureReason).not.toMatch(/ada/i); // the shopper isn't told why
    expect((await item(t, s.tomatoes))!.amountSpent).toBe(0);

    const alerts = await s.w.ops.as.query(api.ops.transfers.alerts, {});
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: "transfer_blocked", severity: "critical" });
    expect(alerts[0]!.message).toMatch(/saved as shopper ada Shopper's own/);
    expect(await s.w.ops.as.query(api.ops.transfers.list, { status: "blocked" })).toHaveLength(1);
    // A blocked attempt doesn't hold any of the budget.
    expect((await pay(s, KEMI, 3_000_00)).status).toBe("queued");
  });

  it("blocks a trader sharing two name parts with any shopper; one shared part only flags", async () => {
    const t = setup();
    const s = await shopping(t);
    const kemi = await signIn(t, "kemi");
    await s.w.ops.as.mutation(api.ops.shoppers.createShopper, { userId: kemi.userId, legalName: "Kemi Alao", reason: "Hired" });
    expect((await pay(s, KEMI, 1_000_00)).status).toBe("blocked");

    // "IFEOMA NWOSU" shares only "Ifeoma" with this shopper: paid, but flagged for review.
    const ife = await signIn(t, "ife");
    await s.w.ops.as.mutation(api.ops.shoppers.createShopper, { userId: ife.userId, legalName: "Ifeoma Bello", reason: "Hired" });
    expect((await pay(s, IFEOMA, 1_000_00)).status).toBe("queued");
    await settle(t);
    const flagged = await s.w.ops.as.query(api.ops.transfers.flaggedTraders, {});
    expect(flagged.find((f) => f.name === "IFEOMA NWOSU")?.flagReason).toMatch(/Shares a name with shopper Ifeoma Bello/);
  });

  it("sends a replayed request once, and keeps other shoppers out", async () => {
    const t = setup();
    const s = await shopping(t);
    const id = rid();
    const a = await pay(s, KEMI, 1_000_00, s.tomatoes, id);
    const b = await pay(s, KEMI, 1_000_00, s.tomatoes, id);
    expect(b.transferId).toBe(a.transferId);
    await settle(t);
    expect(await t.run((ctx) => ctx.db.query("traderTransfers").collect())).toHaveLength(1);
    expect((await item(t, s.tomatoes))!.amountSpent).toBe(1_000_00);

    const bayo = await shopper(t, s.w, "bayo");
    await expect(
      bayo.as.mutation(api.transfers.requestTraderTransfer, {
        clientRequestId: id,
        itemId: s.tomatoes,
        recipient: { bankCode: GTB, accountNumber: KEMI },
        amount: 1_000_00,
      }),
    ).rejects.toThrow(/Bad request id/);
    expect(await bayo.as.query(api.transfers.forItem, { itemId: s.tomatoes })).toBeNull();
  });

  it("shows a failed transfer with Retry; the retry is a new transfer with a new reference", async () => {
    const t = setup();
    const s = await shopping(t);
    const first = await pay(s, FAILS, 1_000_00);
    await settle(t);
    let view = await s.ada.as.query(api.transfers.forItem, { itemId: s.tomatoes });
    expect(view!.transfers[0]).toMatchObject({ status: "failed", canRetry: true });
    expect(view!.committed).toBe(0); // a failed transfer frees the budget
    expect((await openAlerts(t)).map((a) => a.kind)).toEqual(["transfer_failed"]);

    const retryId = rid();
    const retried = await s.ada.as.mutation(api.transfers.retry, { clientRequestId: retryId, transferId: first.transferId });
    expect(await s.ada.as.mutation(api.transfers.retry, { clientRequestId: retryId, transferId: first.transferId })).toEqual(retried);
    await expect(s.ada.as.mutation(api.transfers.retry, { clientRequestId: rid(), transferId: first.transferId })).rejects.toThrow(
      /already tried again/,
    );
    const [a, b] = await t.run(async (ctx) => [await ctx.db.get(first.transferId), await ctx.db.get(retried.transferId)]);
    expect(b!.reference).not.toBe(a!.reference);
    expect(b!.retryOf).toBe(a!._id);

    // The simulated bank fails it again; then, say, a later attempt succeeds and clears the alert.
    await settle(t);
    expect((await openAlerts(t)).map((x) => x.kind)).toEqual(["transfer_failed"]);
    await t.run((ctx) => ctx.db.patch(retried.transferId, { status: "pending" }));
    await t.mutation(internal.transfers.applyResult, { reference: b!.reference, status: "success" });
    expect(await openAlerts(t)).toHaveLength(0);
    view = await s.ada.as.query(api.transfers.forItem, { itemId: s.tomatoes });
    expect(view!.spent).toBe(1_000_00);
  });

  it("applies results once, and a reversal takes the money back out of the item", async () => {
    const t = setup();
    const s = await shopping(t);
    const res = await pay(s, KEMI, 2_000_00);
    await settle(t);
    const { reference } = (await t.run((ctx) => ctx.db.get(res.transferId)))!;
    expect(await t.mutation(internal.transfers.applyResult, { reference, status: "success" })).toBe("duplicate");
    expect(await t.mutation(internal.transfers.applyResult, { reference, status: "failed" })).toBe("ignored");
    expect((await item(t, s.tomatoes))!.amountSpent).toBe(2_000_00);

    expect(await t.mutation(internal.transfers.applyResult, { reference, status: "reversed" })).toBe("reversed");
    expect((await item(t, s.tomatoes))!.amountSpent).toBe(0);
    expect((await openAlerts(t)).map((a) => a.kind)).toEqual(["transfer_reversed"]);
  });

  it("blocks payments to a trader ops marked suspicious", async () => {
    const t = setup();
    const s = await shopping(t);
    await pay(s, KEMI, 1_000_00);
    await settle(t);
    const [kemi] = await s.w.ops.as.query(api.ops.transfers.flaggedTraders, {});
    await expect(
      s.w.ops.as.mutation(api.ops.transfers.reviewTrader, { traderId: kemi!._id, decision: "suspicious", reason: " " }),
    ).rejects.toThrow(/reason/);
    await s.w.ops.as.mutation(api.ops.transfers.reviewTrader, { traderId: kemi!._id, decision: "suspicious", reason: "Shopper's cousin" });
    expect((await pay(s, KEMI, 1_000_00)).status).toBe("blocked");
    expect(await s.ada.as.query(api.traders.recentForMarket, { marketId: s.w.marketId })).toEqual([]);
  });

  it("approving a trader clears it from the review queue", async () => {
    const t = setup();
    const s = await shopping(t);
    await pay(s, KEMI, 1_000_00);
    await settle(t);
    const [kemi] = await s.w.ops.as.query(api.ops.transfers.flaggedTraders, {});
    await s.w.ops.as.mutation(api.ops.transfers.reviewTrader, { traderId: kemi!._id, decision: "approved", reason: "Known tomato seller" });
    expect(await s.w.ops.as.query(api.ops.transfers.flaggedTraders, {})).toEqual([]);
  });

  it("flags a shopper's account that was already paid as a trader once ops saves it", async () => {
    const t = setup();
    const s = await shopping(t);
    await pay(s, CHINEDU, 1_000_00);
    await settle(t);
    await s.w.ops.as.action(api.ops.shoppers.addBankAccount, { userId: s.ada.userId, accountNumber: CHINEDU, bankCode: GTB, reason: "Onboarding" });
    const alerts = await s.w.ops.as.query(api.ops.transfers.alerts, {});
    expect(alerts[0]!.message).toMatch(/was paid 1 time\(s\) as a trader/);
    const shoppers = await s.w.ops.as.query(api.ops.shoppers.list, {});
    expect(shoppers.find((x) => x._id === s.ada.userId)!.bankAccounts).toMatchObject([
      { accountNumber: CHINEDU, resolvedName: "CHINEDU OKAFOR" },
    ]);
    await expect(
      s.w.ops.as.action(api.ops.shoppers.addBankAccount, { userId: s.ada.userId, accountNumber: CHINEDU, bankCode: GTB, reason: "Again" }),
    ).rejects.toThrow(/already saved/);
  });
});

describe("with a Paystack key", () => {
  const SECRET = "sk_test_m4";

  it("creates the recipient once, sends from the balance, and settles on a verified webhook", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", SECRET);
    const calls: { path: string; body?: Record<string, unknown> }[] = [];
    let transferState = "pending";
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      const { pathname } = new URL(url);
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
      calls.push({ path: pathname, body });
      const ok = (data: unknown) => new Response(JSON.stringify({ status: true, data, meta: {} }));
      if (pathname === "/bank") return ok([{ code: GTB, name: "Guaranty Trust Bank", active: true }]);
      if (pathname === "/bank/resolve") return ok({ account_name: "KEMI ALAO" });
      if (pathname === "/transferrecipient") return ok({ recipient_code: "RCP_kemi" });
      if (pathname === "/transfer") return ok({ status: "pending", transfer_code: "TRF_1" });
      if (pathname.startsWith("/transfer/verify/")) return ok({ status: transferState });
      return new Response(JSON.stringify({ status: false, message: "not mocked" }), { status: 404 });
    });

    const t = setup();
    const s = await shopping(t);
    const first = await pay(s, KEMI, 1_000_00);
    await settle(t);
    const tr = (await t.run((ctx) => ctx.db.get(first.transferId)))!;
    expect(tr).toMatchObject({ status: "pending", transferCode: "TRF_1" });
    const sent = calls.find((c) => c.path === "/transfer")!.body!;
    expect(sent).toMatchObject({ source: "balance", amount: 1_000_00, recipient: "RCP_kemi", reference: tr.reference, currency: "NGN" });
    expect((await item(t, s.tomatoes))!.amountSpent).toBe(0); // pending money isn't spent yet

    // Signed webhook → the server re-verifies with Paystack before applying.
    transferState = "success";
    const body = JSON.stringify({ event: "transfer.success", data: { reference: tr.reference } });
    const res = await t.fetch("/paystack/webhook", {
      method: "POST",
      body,
      headers: { "x-paystack-signature": await paystackSignature(body, SECRET) },
    });
    expect(res.status).toBe(200);
    await settle(t);
    expect((await t.run((ctx) => ctx.db.get(first.transferId)))!.status).toBe("success");
    expect((await item(t, s.tomatoes))!.amountSpent).toBe(1_000_00);

    // A second payment to the same trader reuses the saved recipient code.
    transferState = "pending";
    await pay(s, KEMI, 500_00, s.plantain);
    await settle(t);
    expect(calls.filter((c) => c.path === "/transferrecipient")).toHaveLength(1);
  });

  it("fails cleanly and alerts ops when the Paystack balance is too low", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", SECRET);
    vi.stubGlobal("fetch", async (url: string) => {
      const { pathname } = new URL(url);
      const ok = (data: unknown) => new Response(JSON.stringify({ status: true, data, meta: {} }));
      if (pathname === "/bank") return ok([{ code: GTB, name: "Guaranty Trust Bank", active: true }]);
      if (pathname === "/bank/resolve") return ok({ account_name: "KEMI ALAO" });
      if (pathname === "/transferrecipient") return ok({ recipient_code: "RCP_kemi" });
      return new Response(JSON.stringify({ status: false, message: "Your balance is not enough to fulfil this request" }), {
        status: 400,
      });
    });
    const t = setup();
    const s = await shopping(t);
    const r = await pay(s, KEMI, 1_000_00);
    await settle(t);
    const tr = (await t.run((ctx) => ctx.db.get(r.transferId)))!;
    expect(tr.status).toBe("failed");
    expect(tr.failureReason).toMatch(/payout balance is low/);
    expect((await openAlerts(t)).map((a) => a.kind).sort()).toEqual(["low_balance", "transfer_failed"]);
  });
});

describe("paystack balance", () => {
  it("alerts below the threshold and clears when topped up", async () => {
    const t = setup();
    await t.mutation(internal.seed.run, {});
    await t.mutation(internal.transfers.saveBalance, { balance: 99_999_99 });
    expect((await openAlerts(t)).map((a) => a.kind)).toEqual(["low_balance"]);
    await t.mutation(internal.transfers.saveBalance, { balance: 50_000_00 });
    expect(await openAlerts(t)).toHaveLength(1); // still one alert, not two
    await t.mutation(internal.transfers.saveBalance, { balance: 250_000_00 });
    expect(await openAlerts(t)).toHaveLength(0);
  });
});

describe("cash advances", () => {
  it("issues, confirms, spends within limits and reconciles with a flagged variance", async () => {
    const t = setup();
    const s = await shopping(t);
    const board = await s.w.ops.as.query(api.ops.dispatch.board, { slotId: s.w.slotId });
    const batch = board!.markets.flatMap((m) => m.batches).find((b) => b._id === s.batchId)!;
    expect(batch.cash).toEqual({ suggested: 2_000_00, advance: null }); // 30% of ₦5,000, up to whole ₦1,000s

    const advanceId = await s.w.ops.as.mutation(api.ops.cash.issueAdvance, { batchId: s.batchId, amount: 4_000_00 });
    await expect(s.w.ops.as.mutation(api.ops.cash.issueAdvance, { batchId: s.batchId, amount: 1_000_00 })).rejects.toThrow(
      /already has cash/,
    );

    const traderPhoto = await photo(t);
    const spend = (amount: number, itemId = s.tomatoes, clientRequestId = rid()) =>
      s.ada.as.mutation(api.cash.recordCashSpend, {
        clientRequestId,
        itemId,
        amount,
        traderPhotoId: traderPhoto,
        traderLabel: "Mama Bisi, pepper row",
      });

    await expect(spend(1_000_00)).rejects.toThrow(/Confirm you've received/);
    await s.ada.as.mutation(api.cash.confirmReceipt, { advanceId });
    const tomatoes = (await item(t, s.tomatoes))!;
    await expect(
      s.ada.as.mutation(api.cash.recordCashSpend, {
        clientRequestId: rid(),
        itemId: s.tomatoes,
        amount: 100_00,
        traderPhotoId: tomatoes.photoStorageId!,
      }),
    ).rejects.toThrow(/separate photo/);

    const id = rid();
    await spend(2_500_00, s.tomatoes, id);
    await spend(2_500_00, s.tomatoes, id); // replay: recorded once
    expect((await item(t, s.tomatoes))!.amountSpent).toBe(2_500_00);
    await expect(spend(1_000_00)).rejects.toThrow(/up to ₦500/); // the item's budget
    await expect(spend(2_000_00, s.plantain)).rejects.toThrow(/only have ₦1,500 of cash left/); // the advance
    await spend(1_000_00, s.plantain);
    expect(await s.ada.as.query(api.cash.myAdvance, { batchId: s.batchId })).toMatchObject({
      amount: 4_000_00,
      spent: 3_500_00,
      left: 500_00,
    });

    // Transfers and cash share one budget.
    await expect(pay(s, KEMI, 1_000_01, s.plantain)).rejects.toThrow(/up to ₦1,000/);

    // ₦500 should come back; the shopper returns nothing.
    await expect(s.w.ops.as.mutation(api.ops.cash.reconcile, { advanceId, returnedAmount: 0 })).rejects.toThrow(/₦500 is missing/);
    const r = await s.w.ops.as.mutation(api.ops.cash.reconcile, { advanceId, returnedAmount: 0, note: "Says a note fell out" });
    expect(r).toEqual({ spent: 3_500_00, variance: 500_00, status: "disputed" });
    const ada = (await s.w.ops.as.query(api.ops.shoppers.list, {})).find((x) => x._id === s.ada.userId)!;
    expect(ada.money).toMatchObject({ cashTotal: 3_500_00, cashSharePct: 100, varianceCount: 1, varianceTotal: 500_00 });
    expect(await s.ada.as.query(api.cash.myAdvance, { batchId: s.batchId })).toBeNull();
    await expect(spend(100_00, s.plantain)).rejects.toThrow(/don't have cash/);
  });

  it("reconciles a balanced advance without a note, and won't issue more than the budgets", async () => {
    const t = setup();
    const s = await shopping(t);
    await expect(s.w.ops.as.mutation(api.ops.cash.issueAdvance, { batchId: s.batchId, amount: 9_000_00 })).rejects.toThrow(
      /more than the batch's item budgets/,
    );
    const advanceId = await s.w.ops.as.mutation(api.ops.cash.issueAdvance, { batchId: s.batchId, amount: 2_000_00 });
    const r = await s.w.ops.as.mutation(api.ops.cash.reconcile, { advanceId, returnedAmount: 2_000_00 });
    expect(r.status).toBe("reconciled");
    await expect(s.w.ops.as.mutation(api.ops.cash.reconcile, { advanceId, returnedAmount: 2_000_00 })).rejects.toThrow(/already reconciled/);
  });
});
