/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, deliveryFee, estimatedRoadMeters, orderTotals } from "@ojarun/shared";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { paystackSignature } from "./http";

const modules = import.meta.glob("./**/*.ts");

// Saturday 3 Oct 2026, 08:00 WAT: both of today's windows are still open.
const SAT_8AM = Date.UTC(2026, 9, 3, 7, 0);
const AKURE = { lat: 7.2507, lng: 5.195 };
const SECRET = "sk_test_unit";

function setup() {
  return convexTest(schema, modules);
}

async function customer(t: ReturnType<typeof setup>, subject = "cust") {
  const as = t.withIdentity({ subject, email: `${subject}@example.com`, tokenIdentifier: `test|${subject}` });
  const userId = await as.mutation(api.users.ensureUser, {});
  const addressId = await as.mutation(api.addresses.create, {
    label: "Home",
    formatted: "12 Oyemekun Road, Akure",
    landmark: "Opposite the blue church",
    ...AKURE,
  });
  return { as, userId, addressId };
}

async function world(t: ReturnType<typeof setup>) {
  await t.mutation(internal.seed.run, {});
  const { market, slot } = await t.run(async (ctx) => ({
    market: (await ctx.db.query("markets").collect()).find((m) => m.slug === "isikan-market")!,
    slot: (await ctx.db.query("slots").collect()).sort((a, b) => a.windowStart - b.windowStart)[0]!,
  }));
  return { marketId: market._id, market, slotId: slot._id };
}

const items = [
  { name: "Tomatoes", budget: 3_000_00, preferences: ["Firm"], note: "for stew" },
  { name: "Plantain", budget: 2_000_00, preferences: [] },
];

function orderArgs(w: { marketId: Id<"markets">; slotId: Id<"slots"> }, addressId: Id<"addresses">, extra = {}) {
  return {
    clientRequestId: "req-0000-0001",
    addressId,
    marketId: w.marketId,
    slotId: w.slotId,
    items,
    bufferPct: 10,
    applyWallet: false,
    ...extra,
  };
}

async function credit(t: ReturnType<typeof setup>, userId: Id<"users">, amount: number) {
  await t.run(async (ctx) => {
    await ctx.db.insert("walletEntries", { userId, type: "leftover_credit", amount, dedupeKey: `seed:${amount}` });
    await ctx.db.patch(userId, { walletBalance: amount });
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(SAT_8AM);
  vi.stubEnv("APP_ENV", "development");
  vi.stubEnv("PAYSTACK_SECRET_KEY", SECRET);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("pricing", () => {
  it("quotes every market cheapest first, estimating distances in development", async () => {
    const t = setup();
    const w = await world(t);
    const { as, addressId } = await customer(t);
    const quotes = await as.action(api.pricing.quoteMarkets, { addressId });
    expect(quotes).toHaveLength(5);
    expect(quotes.every((q) => q.estimated)).toBe(true);
    const fees = quotes.map((q) => q.deliveryFee);
    expect([...fees].sort((a, b) => a - b)).toEqual(fees);
    const isikan = quotes.find((q) => q.marketId === w.marketId)!;
    expect(isikan.deliveryFee).toBe(deliveryFee(estimatedRoadMeters(AKURE, w.market), DEFAULT_SETTINGS.deliveryFee));
  });

  it("refuses to guess fees in production without the Routes key", async () => {
    vi.stubEnv("APP_ENV", "production");
    const t = setup();
    await world(t);
    const { as, addressId } = await customer(t);
    await expect(as.action(api.pricing.quoteMarkets, { addressId })).rejects.toThrow(/aren't available/);
  });

  it("caches Routes API distances per address and market", async () => {
    vi.stubEnv("GOOGLE_MAPS_SERVER_KEY", "test-key");
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { origins: unknown[] };
      return new Response(
        JSON.stringify(body.origins.map((_, i) => ({ originIndex: i, destinationIndex: 0, distanceMeters: 2_000 + i * 1_000, duration: "300s", condition: "ROUTE_EXISTS" }))),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const t = setup();
    await world(t);
    const { as, addressId } = await customer(t);
    const first = await as.action(api.pricing.quoteMarkets, { addressId });
    expect(first.some((q) => q.estimated)).toBe(false);
    await as.action(api.pricing.quoteMarkets, { addressId });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("orders.create", () => {
  it("prices the order, holds a slot place and is idempotent", async () => {
    const t = setup();
    const w = await world(t);
    const { as, addressId } = await customer(t);
    const res = await as.mutation(api.orders.create, orderArgs(w, addressId));
    expect(res.status).toBe("pending_payment");

    const expected = orderTotals({
      itemBudgets: [3_000_00, 2_000_00],
      bufferPct: 10,
      deliveryFee: deliveryFee(estimatedRoadMeters(AKURE, w.market), DEFAULT_SETTINGS.deliveryFee),
      walletBalance: 0,
      applyWallet: false,
      settings: DEFAULT_SETTINGS,
    });
    const order = await as.query(api.orders.get, { orderId: res.orderId });
    expect(order!.totals.chargeAmount).toBe(expected.chargeAmount);
    expect(order!.totals.buffer).toBe(500_00);
    expect(order!.items.map((i) => i.name)).toEqual(["Tomatoes", "Plantain"]);

    const again = await as.mutation(api.orders.create, orderArgs(w, addressId));
    expect(again.orderId).toBe(res.orderId);
    const slot = await t.run(async (ctx) => ctx.db.get(w.slotId));
    expect(slot!.reserved).toBe(1);
  });

  it("enforces the item cap, buffer presets and item rules", async () => {
    const t = setup();
    const w = await world(t);
    const { as, addressId } = await customer(t);
    const many = Array.from({ length: 26 }, (_, i) => ({ name: `Item ${i}`, budget: 500_00, preferences: [] }));
    await expect(as.mutation(api.orders.create, orderArgs(w, addressId, { items: many }))).rejects.toThrow(/up to 25/);
    await expect(as.mutation(api.orders.create, orderArgs(w, addressId, { bufferPct: 15 }))).rejects.toThrow(/buffer/);
    await expect(
      as.mutation(api.orders.create, orderArgs(w, addressId, { items: [{ name: "Rice", budget: 50_00, preferences: [] }] })),
    ).rejects.toThrow(/at least ₦100/);
    await expect(as.mutation(api.orders.create, orderArgs(w, addressId, { items: [] }))).rejects.toThrow(/at least one/);
  });

  it("refuses a full slot", async () => {
    const t = setup();
    const w = await world(t);
    await t.run(async (ctx) => ctx.db.patch(w.slotId, { capacity: 1, reserved: 1 }));
    const { as, addressId } = await customer(t);
    await expect(as.mutation(api.orders.create, orderArgs(w, addressId))).rejects.toThrow(/filled up/);
  });

  it("debits the wallet share, and skips Paystack when the wallet covers everything", async () => {
    const t = setup();
    const w = await world(t);
    const { as, userId, addressId } = await customer(t);
    await credit(t, userId, 50_000_00);
    const res = await as.mutation(api.orders.create, orderArgs(w, addressId, { applyWallet: true }));
    expect(res).toMatchObject({ status: "paid", chargeAmount: 0 });
    const user = await t.run(async (ctx) => ctx.db.get(userId));
    const order = await as.query(api.orders.get, { orderId: res.orderId });
    expect(user!.walletBalance).toBe(50_000_00 - order!.totals.walletApplied);
    expect(order!.timeline.map((e) => e.status)).toEqual(["pending_payment", "paid"]);
  });

  it("only shows customers their own orders", async () => {
    const t = setup();
    const w = await world(t);
    const a = await customer(t, "a");
    const b = await customer(t, "b");
    const res = await a.as.mutation(api.orders.create, orderArgs(w, a.addressId));
    expect(await b.as.query(api.orders.get, { orderId: res.orderId })).toBeNull();
    expect(await b.as.query(api.orders.listMine, {})).toHaveLength(0);
    expect(await a.as.query(api.orders.listMine, {})).toHaveLength(1);
    await expect(b.as.mutation(api.orders.create, orderArgs(w, a.addressId, { clientRequestId: "req-other-01" }))).rejects.toThrow(/address/);
  });
});

describe("payment", () => {
  async function pendingOrder(t: ReturnType<typeof setup>, applyWallet = false) {
    const w = await world(t);
    const c = await customer(t);
    if (applyWallet) await credit(t, c.userId, 1_000_00);
    const res = await c.as.mutation(api.orders.create, orderArgs(w, c.addressId, { applyWallet }));
    const reference = `ojr_${res.orderId}_1`;
    await t.mutation(internal.checkout.startAttempt, { orderId: res.orderId, userId: c.userId });
    return { ...c, ...w, orderId: res.orderId, chargeAmount: res.chargeAmount, reference };
  }

  it("marks the order paid once, and ignores repeats", async () => {
    const t = setup();
    const o = await pendingOrder(t);
    const args = { reference: o.reference, amount: o.chargeAmount, currency: "NGN", paidAt: Date.now() };
    expect(await t.mutation(internal.checkout.markPaid, args)).toBe("paid");
    expect(await t.mutation(internal.checkout.markPaid, args)).toBe("duplicate");
    const order = await o.as.query(api.orders.get, { orderId: o.orderId });
    expect(order!.status).toBe("paid");
  });

  it("rejects a tampered amount", async () => {
    const t = setup();
    const o = await pendingOrder(t);
    const res = await t.mutation(internal.checkout.markPaid, { reference: o.reference, amount: 100, currency: "NGN", paidAt: Date.now() });
    expect(res).toBe("rejected");
    expect((await o.as.query(api.orders.get, { orderId: o.orderId }))!.status).toBe("pending_payment");
  });

  it("expires an abandoned order after 30 min, freeing the slot and returning wallet credit", async () => {
    const t = setup();
    const o = await pendingOrder(t, true);
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ status: true, data: { status: "abandoned" } })));
    vi.setSystemTime(SAT_8AM + 31 * 60_000);
    await t.action(internal.checkout.expireStale, {});
    const order = await t.run(async (ctx) => ctx.db.get(o.orderId));
    const slot = await t.run(async (ctx) => ctx.db.get(o.slotId));
    const user = await t.run(async (ctx) => ctx.db.get(o.userId));
    expect(order!.status).toBe("expired");
    expect(slot!.reserved).toBe(0);
    expect(user!.walletBalance).toBe(1_000_00);
  });

  it("pays instead of expiring when Paystack says the charge succeeded", async () => {
    const t = setup();
    const o = await pendingOrder(t);
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ status: true, data: { status: "success", amount: o.chargeAmount, currency: "NGN", paid_at: new Date().toISOString() } })),
    );
    vi.setSystemTime(SAT_8AM + 31 * 60_000);
    await t.action(internal.checkout.expireStale, {});
    expect((await t.run(async (ctx) => ctx.db.get(o.orderId)))!.status).toBe("paid");
  });

  it("keeps a late payment as wallet credit", async () => {
    const t = setup();
    const o = await pendingOrder(t);
    vi.setSystemTime(SAT_8AM + 31 * 60_000);
    await t.mutation(internal.orders.expire, { orderId: o.orderId });
    const res = await t.mutation(internal.checkout.markPaid, { reference: o.reference, amount: o.chargeAmount, currency: "NGN", paidAt: Date.now() });
    expect(res).toBe("credited");
    expect((await t.run(async (ctx) => ctx.db.get(o.userId)))!.walletBalance).toBe(o.chargeAmount);
  });
});

describe("paystack webhook", () => {
  async function post(t: ReturnType<typeof setup>, body: string, signature: string) {
    return await t.fetch("/paystack/webhook", { method: "POST", body, headers: { "x-paystack-signature": signature } });
  }

  it("rejects a bad signature and handles each event once", async () => {
    const t = setup();
    const body = JSON.stringify({ event: "charge.success", data: { reference: "ojr_x_1" } });
    expect((await post(t, body, "deadbeef")).status).toBe(401);

    const sig = await paystackSignature(body, SECRET);
    expect((await post(t, body, sig)).status).toBe(200);
    expect((await post(t, body, sig)).status).toBe(200);
    const events = await t.run(async (ctx) => ctx.db.query("webhookEvents").collect());
    expect(events).toHaveLength(1);
  });
});
