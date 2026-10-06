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

// Isikan Market is at 7.2617, 5.2049. These sit north, north-east, south and west of it.
const NORTH = { lat: 7.3, lng: 5.205 };
const NORTH_EAST = { lat: 7.29, lng: 5.225 };
const SOUTH = { lat: 7.21, lng: 5.2 };
const SOUTH_2 = { lat: 7.22, lng: 5.205 };
const WEST = { lat: 7.262, lng: 5.15 };

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

async function shopper(t: T, w: Awaited<ReturnType<typeof world>>, subject: string, onShift = true) {
  const s = await signIn(t, subject);
  await w.ops.as.mutation(api.ops.shoppers.createShopper, {
    userId: s.userId,
    legalName: `${subject} Shopper`,
    reason: "Hired",
  });
  if (onShift) await s.as.mutation(api.shopper.setOnShift, { onShift: true });
  return s;
}

/** A paid order (the wallet covers it, so no Paystack round trip). */
async function paidOrder(t: T, w: Awaited<ReturnType<typeof world>>, subject: string, at: { lat: number; lng: number }) {
  const c = await signIn(t, subject);
  const addressId = await c.as.mutation(api.addresses.create, {
    label: "Home",
    formatted: `${subject} Street, Akure`,
    landmark: "By the big mango tree",
    ...at,
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

async function cutoff(t: T) {
  vi.setSystemTime(AFTER_CUTOFF);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

const batchesOf = (t: T, slotId: Id<"slots">) =>
  t.run((ctx) =>
    ctx.db
      .query("batches")
      .withIndex("by_slot", (q) => q.eq("slotId", slotId))
      .collect(),
  );

const ordersIn = (t: T, batchId: Id<"batches">) =>
  t.run((ctx) =>
    ctx.db
      .query("orders")
      .withIndex("by_batch", (q) => q.eq("batchId", batchId))
      .collect(),
  );

async function photo(t: T) {
  return await t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" })));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(SAT_8AM);
  vi.stubEnv("APP_ENV", "development");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("batching at cutoff", () => {
  it("turns three paid orders into one proposed batch for the on-shift shopper", async () => {
    const t = setup();
    const w = await world(t);
    const ada = await shopper(t, w, "ada");
    await shopper(t, w, "bayo", false);
    for (const [s, at] of [["c1", NORTH], ["c2", SOUTH], ["c3", WEST]] as const) await paidOrder(t, w, s, at);

    expect(await batchesOf(t, w.slotId)).toHaveLength(0);
    await cutoff(t);

    const batches = await batchesOf(t, w.slotId);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({ status: "proposed", shopperId: ada.userId, marketId: w.marketId });
    const orders = await ordersIn(t, batches[0]!._id);
    expect(orders).toHaveLength(3);
    // Proposed, not yet confirmed: the orders stay paid and the shopper sees nothing.
    expect(orders.every((o) => o.status === "paid")).toBe(true);
    expect(await ada.as.query(api.shopper.today, {})).toEqual([]);
  });

  it("splits by direction into batches of at most four, spreading them across shoppers", async () => {
    const t = setup();
    const w = await world(t);
    const ada = await shopper(t, w, "ada");
    const bayo = await shopper(t, w, "bayo");
    const points = [NORTH, NORTH_EAST, NORTH, SOUTH, SOUTH_2];
    for (const [i, at] of points.entries()) await paidOrder(t, w, `c${i}`, at);
    await cutoff(t);

    const batches = await batchesOf(t, w.slotId);
    expect(batches).toHaveLength(2);
    expect(new Set(batches.map((b) => b.shopperId))).toEqual(new Set([ada.userId, bayo.userId]));
    const groups = await Promise.all(batches.map(async (b) => (await ordersIn(t, b._id)).map((o) => o.addressSnapshot.lat)));
    const southGroup = groups.find((g) => g.includes(SOUTH.lat))!;
    expect(southGroup.sort()).toEqual([SOUTH.lat, SOUTH_2.lat].sort());
  });

  it("leaves batches unassigned when nobody is on shift", async () => {
    const t = setup();
    const w = await world(t);
    await paidOrder(t, w, "c1", NORTH);
    await cutoff(t);
    const [batch] = await batchesOf(t, w.slotId);
    expect(batch!.status).toBe("proposed");
    expect(batch!.shopperId).toBeUndefined();
  });

  it("adds an order paid after cutoff to the open proposal", async () => {
    const t = setup();
    const w = await world(t);
    await shopper(t, w, "ada");
    await paidOrder(t, w, "c1", NORTH);

    const late = await signIn(t, "late");
    const addressId = await late.as.mutation(api.addresses.create, {
      label: "Home",
      formatted: "Late Street, Akure",
      landmark: "Near the junction",
      ...NORTH_EAST,
    });
    const res = await late.as.mutation(api.orders.create, {
      clientRequestId: "req-late-00001",
      addressId,
      marketId: w.marketId,
      slotId: w.slotId,
      items: [{ name: "Rice", budget: 5_000_00, preferences: [] }],
      bufferPct: 0,
      applyWallet: false,
    });
    await t.mutation(internal.checkout.startAttempt, { orderId: res.orderId, userId: late.userId });
    await cutoff(t);

    expect(
      await t.mutation(internal.checkout.markPaid, {
        reference: `ojr_${res.orderId}_1`,
        amount: res.chargeAmount,
        currency: "NGN",
        paidAt: Date.now(),
      }),
    ).toBe("paid");
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const batches = await batchesOf(t, w.slotId);
    expect(batches).toHaveLength(1);
    expect(await ordersIn(t, batches[0]!._id)).toHaveLength(2);
  });
});

describe("dispatch board", () => {
  async function proposed(t: T) {
    const w = await world(t);
    const ada = await shopper(t, w, "ada");
    const bayo = await shopper(t, w, "bayo");
    const c1 = await paidOrder(t, w, "c1", NORTH);
    const c2 = await paidOrder(t, w, "c2", NORTH_EAST);
    await cutoff(t);
    const [batch] = await batchesOf(t, w.slotId);
    return { w, ada, bayo, c1, c2, batchId: batch!._id };
  }

  it("shows the slot's batches and is ops-only", async () => {
    const t = setup();
    const { w, c1, batchId } = await proposed(t);
    const board = await w.ops.as.query(api.ops.dispatch.board, { slotId: w.slotId });
    expect(board!.markets).toHaveLength(1);
    expect(board!.markets[0]!.batches[0]).toMatchObject({ _id: batchId, status: "proposed", shopper: { name: "ada Test" } });
    expect(board!.markets[0]!.batches[0]!.orders[0]).toMatchObject({ itemCount: 2, budgets: 5_000_00, direction: "N" });
    expect(board!.shoppers.map((s) => s.name)).toEqual(["ada Test", "bayo Test"]);
    await expect(c1.as.query(api.ops.dispatch.board, { slotId: w.slotId })).rejects.toThrow(/access/);
  });

  it("confirms a batch: orders become assigned and reach the shopper's app", async () => {
    const t = setup();
    const { w, ada, c1, batchId } = await proposed(t);
    await w.ops.as.mutation(api.ops.dispatch.confirmBatch, { batchId });

    const orders = await ordersIn(t, batchId);
    expect(orders.every((o) => o.status === "assigned" && o.shopperId === ada.userId)).toBe(true);
    const [run] = await ada.as.query(api.shopper.today, {});
    expect(run).toMatchObject({ _id: batchId, status: "assigned", orderCount: 2, itemCount: 4, doneCount: 0 });
    expect((await c1.as.query(api.orders.get, { orderId: c1.orderId }))!).toMatchObject({
      status: "assigned",
      shopperName: "ada",
    });
    await expect(w.ops.as.mutation(api.ops.dispatch.confirmBatch, { batchId })).rejects.toThrow(/already confirmed/);
  });

  it("needs a shopper before confirming", async () => {
    const t = setup();
    const { w, batchId } = await proposed(t);
    await w.ops.as.mutation(api.ops.dispatch.assignShopper, { batchId, shopperId: undefined });
    await expect(w.ops.as.mutation(api.ops.dispatch.confirmBatch, { batchId })).rejects.toThrow(/Choose a shopper/);
  });

  it("moves orders between batches and drops empty ones", async () => {
    const t = setup();
    const { w, c1, c2, batchId } = await proposed(t);
    await w.ops.as.mutation(api.ops.dispatch.moveOrder, { orderId: c2.orderId });
    let batches = await batchesOf(t, w.slotId);
    expect(batches).toHaveLength(2);
    const fresh = batches.find((b) => b._id !== batchId)!;
    expect(fresh.status).toBe("proposed");
    expect(fresh.shopperId).toBeUndefined();

    await w.ops.as.mutation(api.ops.dispatch.moveOrder, { orderId: c1.orderId, toBatchId: fresh._id });
    batches = await batchesOf(t, w.slotId);
    expect(batches.map((b) => b._id)).toEqual([fresh._id]);
    expect(await ordersIn(t, fresh._id)).toHaveLength(2);
  });

  it("needs a reason to reassign a confirmed batch, and moves every order to the new shopper", async () => {
    const t = setup();
    const { w, bayo, batchId } = await proposed(t);
    await w.ops.as.mutation(api.ops.dispatch.confirmBatch, { batchId });
    await expect(
      w.ops.as.mutation(api.ops.dispatch.assignShopper, { batchId, shopperId: bayo.userId }),
    ).rejects.toThrow(/reason/);
    await w.ops.as.mutation(api.ops.dispatch.assignShopper, { batchId, shopperId: bayo.userId, reason: "Ada is sick" });
    expect((await ordersIn(t, batchId)).every((o) => o.shopperId === bayo.userId)).toBe(true);
    expect(await bayo.as.query(api.shopper.today, {})).toHaveLength(1);
  });

  it("re-proposes unconfirmed batches only after cutoff, leaving confirmed ones alone", async () => {
    const t = setup();
    const w = await world(t);
    await expect(w.ops.as.mutation(api.ops.dispatch.reproposeSlot, { slotId: w.slotId })).rejects.toThrow(
      /still taking orders/,
    );
    await shopper(t, w, "ada");
    for (const [i, at] of [NORTH, NORTH, NORTH, NORTH, SOUTH].entries()) await paidOrder(t, w, `c${i}`, at);
    await cutoff(t);
    const [first] = await batchesOf(t, w.slotId);
    await w.ops.as.mutation(api.ops.dispatch.confirmBatch, { batchId: first!._id });

    await w.ops.as.mutation(api.ops.dispatch.reproposeSlot, { slotId: w.slotId });
    const after = await batchesOf(t, w.slotId);
    expect(after.find((b) => b._id === first!._id)?.status).toBe("assigned");
    expect(after.filter((b) => b.status === "proposed")).toHaveLength(1);
  });
});

describe("shopping", () => {
  async function assigned(t: T) {
    const w = await world(t);
    const ada = await shopper(t, w, "ada");
    const c1 = await paidOrder(t, w, "c1", NORTH);
    await cutoff(t);
    const [batch] = await batchesOf(t, w.slotId);
    await w.ops.as.mutation(api.ops.dispatch.confirmBatch, { batchId: batch!._id });
    const detail = await ada.as.query(api.shopper.batch, { batchId: batch!._id });
    return { w, ada, c1, batchId: batch!._id, items: detail!.orders[0]!.items };
  }

  it("shows the batch only to its shopper, with the customer's phone and list", async () => {
    const t = setup();
    const { w, ada, batchId, items } = await assigned(t);
    expect(items.map((i) => i.name)).toEqual(["Tomatoes", "Plantain"]);
    const detail = await ada.as.query(api.shopper.batch, { batchId });
    expect(detail!.orders[0]!.customer.firstName).toBe("c1");
    const other = await shopper(t, w, "bayo");
    expect(await other.as.query(api.shopper.batch, { batchId })).toBeNull();
  });

  it("refuses outcomes before Start shopping", async () => {
    const t = setup();
    const { ada, items } = await assigned(t);
    await expect(
      ada.as.mutation(api.items.setOutcome, { itemId: items[0]!._id, status: "skipped", shopperNote: "None today" }),
    ).rejects.toThrow(/Start shopping/);
  });

  it("starts shopping for the whole batch once, recording where", async () => {
    const t = setup();
    const { ada, c1, batchId } = await assigned(t);
    await ada.as.mutation(api.shopper.startShopping, { batchId, lat: 7.2617, lng: 5.2049 });
    await ada.as.mutation(api.shopper.startShopping, { batchId, lat: 7.2617, lng: 5.2049 });

    const order = await c1.as.query(api.orders.get, { orderId: c1.orderId });
    expect(order!.status).toBe("shopping");
    expect(order!.timeline.filter((e) => e.status === "shopping")).toHaveLength(1);
    const events = await t.run((ctx) => ctx.db.query("statusEvents").collect());
    expect(events.find((e) => e.status === "shopping")).toMatchObject({ lat: 7.2617, lng: 5.2049, actorId: ada.userId });
    await expect(ada.as.mutation(api.shopper.setOnShift, { onShift: false })).rejects.toThrow(/Finish/);
  });

  it("needs a photo to mark bought, a note to skip or adjust, and shows the customer the result live", async () => {
    const t = setup();
    const { ada, c1, batchId, items } = await assigned(t);
    await ada.as.mutation(api.shopper.startShopping, { batchId });
    const [tomatoes, plantain] = items;

    await expect(ada.as.mutation(api.items.setOutcome, { itemId: tomatoes!._id, status: "bought" })).rejects.toThrow(
      /photo/,
    );
    const storageId = await photo(t);
    await ada.as.mutation(api.items.attachPhoto, { itemId: tomatoes!._id, storageId });
    await ada.as.mutation(api.items.attachPhoto, { itemId: tomatoes!._id, storageId });
    await expect(
      ada.as.mutation(api.items.setOutcome, { itemId: tomatoes!._id, status: "adjusted" }),
    ).rejects.toThrow(/what you changed/);
    await ada.as.mutation(api.items.setOutcome, {
      itemId: tomatoes!._id,
      status: "adjusted",
      shopperNote: "Firm ones were small, got a bigger paint",
      quantityNote: "1 paint rubber",
    });

    await expect(ada.as.mutation(api.items.setOutcome, { itemId: plantain!._id, status: "skipped" })).rejects.toThrow(
      /why it isn't available/,
    );
    await ada.as.mutation(api.items.setOutcome, { itemId: plantain!._id, status: "skipped", shopperNote: "None ripe" });

    const order = await c1.as.query(api.orders.get, { orderId: c1.orderId });
    expect(order!.items[0]).toMatchObject({ status: "adjusted", quantityNote: "1 paint rubber" });
    expect(order!.items[0]!.photoUrl).toEqual(expect.any(String));
    expect(order!.items[1]).toMatchObject({ status: "skipped", shopperNote: "None ripe", photoUrl: null });

    const [run] = await ada.as.query(api.shopper.today, {});
    expect(run).toMatchObject({ status: "in_progress", doneCount: 2, itemCount: 2 });
  });

  it("won't skip an item that already has money spent on it", async () => {
    const t = setup();
    const { ada, batchId, items } = await assigned(t);
    await ada.as.mutation(api.shopper.startShopping, { batchId });
    await t.run((ctx) => ctx.db.patch(items[0]!._id, { amountSpent: 1_000_00 }));
    await expect(
      ada.as.mutation(api.items.setOutcome, { itemId: items[0]!._id, status: "skipped", shopperNote: "None today" }),
    ).rejects.toThrow(/already been paid/);
  });

  it("keeps other shoppers and customers out of item updates", async () => {
    const t = setup();
    const { w, c1, batchId, items, ada } = await assigned(t);
    await ada.as.mutation(api.shopper.startShopping, { batchId });
    const bayo = await shopper(t, w, "bayo");
    await expect(
      bayo.as.mutation(api.items.setOutcome, { itemId: items[0]!._id, status: "skipped", shopperNote: "None today" }),
    ).rejects.toThrow(/isn't on one of your orders/);
    await expect(
      c1.as.mutation(api.items.setOutcome, { itemId: items[0]!._id, status: "skipped", shopperNote: "None today" }),
    ).rejects.toThrow(/access/);
    await expect(bayo.as.mutation(api.shopper.startShopping, { batchId })).rejects.toThrow(/isn't assigned to you/);
  });
});
