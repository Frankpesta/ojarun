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

const order = (t: T, s: Run) => t.run((ctx) => ctx.db.get(s.c1.orderId));
const getItem = (t: T, id: Id<"orderItems">) => t.run((ctx) => ctx.db.get(id));

/** Tomatoes have a ₦3,000 budget; the order's buffer is 10% of ₦5,000 = ₦500. */
async function check(s: Run, opts: { quoted?: number; extra?: number; id?: string } = {}) {
  return await s.ada.as.mutation(api.priceChecks.send, {
    clientRequestId: opts.id ?? rid(),
    itemId: s.tomatoes,
    quoted: opts.quoted ?? 3_800_00,
    budgetGets: "about 1½ paint rubbers",
    extraRequested: opts.extra ?? 800_00,
  });
}

describe("chat", () => {
  it("lets the customer and shopper talk, with a system line when shopping starts", async () => {
    const t = setup();
    const s = await shopping(t);
    await s.c1.as.mutation(api.chat.send, { clientRequestId: rid(), orderId: s.c1.orderId, body: "  Firm ones please  " });
    const id = rid();
    await s.ada.as.mutation(api.chat.send, { clientRequestId: id, orderId: s.c1.orderId, body: "Okay!" });
    await s.ada.as.mutation(api.chat.send, { clientRequestId: id, orderId: s.c1.orderId, body: "Okay!" }); // replay

    const mine = await s.c1.as.query(api.chat.list, { orderId: s.c1.orderId });
    expect(mine!.messages.map((m) => [m.type, m.mine, m.body])).toEqual([
      ["system", false, "ada started shopping at Isikan Market"],
      ["text", true, "Firm ones please"],
      ["text", false, "Okay!"],
    ]);
    expect(mine).toMatchObject({ side: "customer", open: true, other: { name: "ada" }, funding: { bufferLeft: 500_00 } });

    // Unread for the customer until they open the chat; "Seen" for the shopper after.
    expect(await s.c1.as.query(api.chat.unread, { orderId: s.c1.orderId })).toBe(2);
    await s.c1.as.mutation(api.chat.markRead, { orderId: s.c1.orderId });
    expect(await s.c1.as.query(api.chat.unread, { orderId: s.c1.orderId })).toBe(0);
    expect((await s.ada.as.query(api.chat.list, { orderId: s.c1.orderId }))!.otherReadAt).not.toBeNull();
  });

  it("keeps outsiders out and refuses empty messages", async () => {
    const t = setup();
    const s = await shopping(t);
    const bayo = await shopper(t, s.w, "bayo");
    expect(await bayo.as.query(api.chat.list, { orderId: s.c1.orderId })).toBeNull();
    await expect(bayo.as.mutation(api.chat.send, { clientRequestId: rid(), orderId: s.c1.orderId, body: "hi" })).rejects.toThrow(/isn't yours/);
    await expect(s.c1.as.mutation(api.chat.send, { clientRequestId: rid(), orderId: s.c1.orderId, body: "   " })).rejects.toThrow(/Write a message/);
  });

  it("shows phone numbers only while the order is active, and closes the chat after", async () => {
    const t = setup();
    const s = await shopping(t);
    await t.run((ctx) => ctx.db.patch(s.ada.userId, { phone: "+2348031234567" }));
    expect((await s.c1.as.query(api.chat.list, { orderId: s.c1.orderId }))!.other!.phone).toBe("+2348031234567");
    await t.run((ctx) => ctx.db.patch(s.c1.orderId, { status: "completed" }));
    const after = await s.c1.as.query(api.chat.list, { orderId: s.c1.orderId });
    expect(after).toMatchObject({ open: false, other: { phone: null } });
    await expect(s.c1.as.mutation(api.chat.send, { clientRequestId: rid(), orderId: s.c1.orderId, body: "Thanks" })).rejects.toThrow(/closed/);
  });

  it("sends a photo message", async () => {
    const t = setup();
    const s = await shopping(t);
    const imageId = await photo(t);
    await s.c1.as.mutation(api.chat.send, { clientRequestId: rid(), orderId: s.c1.orderId, imageId });
    const last = (await s.ada.as.query(api.chat.list, { orderId: s.c1.orderId }))!.messages.at(-1)!;
    expect(last.type).toBe("image");
    expect(last.imageUrl).toBeTruthy();
  });
});

describe("price checks", () => {
  it("validates the check: over budget, extra no more than the gap, one at a time", async () => {
    const t = setup();
    const s = await shopping(t);
    await expect(check(s, { quoted: 3_000_00 })).rejects.toThrow(/within the ₦3,000 budget/);
    await expect(check(s, { extra: 900_00 })).rejects.toThrow(/at most ₦800 extra/);
    const id = rid();
    const first = await check(s, { id });
    expect(await check(s, { id })).toBe(first); // replay
    await expect(check(s)).rejects.toThrow(/already waiting/);
  });

  it("approving takes the leftover buffer first, then the wallet, and raises the transfer cap", async () => {
    const t = setup();
    const s = await shopping(t);
    const walletBefore = (await t.run((ctx) => ctx.db.get(s.c1.userId)))!.walletBalance;
    const messageId = await check(s); // ₦800 extra: ₦500 from buffer, ₦300 from wallet

    expect(await s.c1.as.mutation(api.priceChecks.respond, { messageId, decision: "approve" })).toBe("approved");
    expect(await s.c1.as.mutation(api.priceChecks.respond, { messageId, decision: "approve" })).toBe("approved"); // replay
    expect((await order(t, s))!.bufferUsed).toBe(500_00);
    expect((await t.run((ctx) => ctx.db.get(s.c1.userId)))!.walletBalance).toBe(walletBefore - 300_00);
    expect((await getItem(t, s.tomatoes))!.approvedExtra).toBe(800_00);

    // The shopper can now pay up to ₦3,800 for tomatoes.
    await t.action(internal.traders.refreshBanks, {});
    await s.ada.as.action(api.traders.resolveAccount, { accountNumber: "1234567890", bankCode: "058" });
    const pay = (amount: number) =>
      s.ada.as.mutation(api.transfers.requestTraderTransfer, {
        clientRequestId: rid(),
        itemId: s.tomatoes,
        recipient: { bankCode: "058", accountNumber: "1234567890" },
        amount,
      });
    await expect(pay(3_800_01)).rejects.toThrow(/up to ₦3,800/);
    expect((await pay(3_800_00)).status).toBe("queued");

    const chat = await s.ada.as.query(api.chat.list, { orderId: s.c1.orderId });
    expect(chat!.messages.at(-2)!.priceCheck).toMatchObject({ state: "approved", itemName: "Tomatoes" });
    expect(chat!.messages.at(-1)!.body).toMatch(/c1 approved ₦800 extra for Tomatoes\. The budget is now ₦3,800/);
  });

  it("can't approve without enough buffer and wallet; buying within budget still works", async () => {
    const t = setup();
    const s = await shopping(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(s.c1.userId, { walletBalance: 0 });
      await ctx.db.patch(s.c1.orderId, { bufferUsed: 400_00 }); // ₦100 buffer left
    });
    const messageId = await check(s);
    await expect(s.c1.as.mutation(api.priceChecks.respond, { messageId, decision: "approve" })).rejects.toThrow(/isn't enough/);
    expect(await s.c1.as.mutation(api.priceChecks.respond, { messageId, decision: "within_budget" })).toBe("buy_within_budget");
    expect((await getItem(t, s.tomatoes))!.approvedExtra).toBe(0);
    const last = (await s.ada.as.query(api.chat.list, { orderId: s.c1.orderId }))!.messages.at(-1)!;
    expect(last).toMatchObject({ type: "system" });
    expect(last.body).toMatch(/Tomatoes costs more today, so ada will buy ₦3,000 worth: about 1½ paint rubbers/);
  });

  it("times out after 5 minutes into 'buy within budget', on both sides", async () => {
    const t = setup();
    const s = await shopping(t);
    const messageId = await check(s);
    vi.advanceTimersByTime(300_000);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    for (const who of [s.c1, s.ada]) {
      const msgs = (await who.as.query(api.chat.list, { orderId: s.c1.orderId }))!.messages;
      expect(msgs.find((m) => m._id === messageId)!.priceCheck!.state).toBe("timed_out");
      expect(msgs.at(-1)!.body).toMatch(/No answer in time, so ada will buy ₦3,000 worth of Tomatoes/);
    }
    // A late tap changes nothing.
    expect(await s.c1.as.mutation(api.priceChecks.respond, { messageId, decision: "approve" })).toBe("timed_out");
    expect((await getItem(t, s.tomatoes))!.approvedExtra).toBe(0);
    // A new check can go out now.
    await check(s);
  });

  it("is customer-only to answer and shopper-only to send", async () => {
    const t = setup();
    const s = await shopping(t);
    const messageId = await check(s);
    await expect(s.ada.as.mutation(api.priceChecks.respond, { messageId, decision: "approve" })).rejects.toThrow(/access/);
    const other = await signIn(t, "c2");
    await expect(other.as.mutation(api.priceChecks.respond, { messageId, decision: "approve" })).rejects.toThrow(/not found/);
    await expect(
      s.c1.as.mutation(api.priceChecks.send, { clientRequestId: rid(), itemId: s.tomatoes, quoted: 3_800_00, budgetGets: "x y z", extraRequested: 800_00 }),
    ).rejects.toThrow(/access/);
  });
});
