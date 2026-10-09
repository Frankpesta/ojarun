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


beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(SAT_8AM);
  vi.stubEnv("APP_ENV", "development");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const settle = (t: T) => t.finishAllScheduledFunctions(vi.runAllTimers);
const outbox = (t: T) => t.run((ctx) => ctx.db.query("notifications").collect());

describe("notifications", () => {
  it("queues the customer's order events and delivers push to their phone", async () => {
    const pushes: unknown[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (url.includes("exp.host")) {
        const body = JSON.parse(String(init?.body)) as unknown[];
        pushes.push(...body);
        return new Response(JSON.stringify({ data: body.map(() => ({ status: "ok" })) }));
      }
      return new Response("{}", { status: 404 });
    });
    const t = setup();
    const w = await world(t);
    const c = await signIn(t, "c1");
    await c.as.mutation(api.users.registerPushToken, { token: "ExponentPushToken[c1]", platform: "android" });
    const ada = await shopper(t, w, "ada");
    await ada.as.mutation(api.users.registerPushToken, { token: "ExponentPushToken[ada]", platform: "android" });

    // A wallet-paid order is confirmed straight away.
    const addressId = await c.as.mutation(api.addresses.create, { label: "Home", formatted: "c1 Street", landmark: "By the mango tree", ...NORTH });
    await t.run(async (ctx) => {
      await ctx.db.insert("walletEntries", { userId: c.userId, type: "adjustment", amount: 100_000_00, dedupeKey: "seed", note: "seed" });
      await ctx.db.patch(c.userId, { walletBalance: 100_000_00, phone: "+2348031234567" });
    });
    const { orderId } = await c.as.mutation(api.orders.create, {
      clientRequestId: "req-c1-notify1",
      addressId,
      marketId: w.marketId,
      slotId: w.slotId,
      items: [{ name: "Tomatoes", budget: 3_000_00, preferences: [] }],
      bufferPct: 0,
      applyWallet: true,
    });
    vi.setSystemTime(AFTER_CUTOFF);
    await settle(t);
    const [batch] = await t.run((ctx) => ctx.db.query("batches").collect());
    await w.ops.as.mutation(api.ops.dispatch.confirmBatch, { batchId: batch!._id });
    await ada.as.mutation(api.shopper.startShopping, { batchId: batch!._id });
    await settle(t);

    const rows = await outbox(t);
    expect(rows.map((r) => r.event).sort()).toEqual(["payment_confirmed", "run_assigned", "shopper_assigned", "shopping_started"]);
    const confirmed = rows.find((r) => r.event === "payment_confirmed")!;
    expect(confirmed).toMatchObject({ url: `/order/${orderId}`, channels: { push: "sent 1/1", email: "skipped: not configured" } });
    expect(confirmed.email!.html).toMatch(/Order confirmed/);
    expect(rows.find((r) => r.event === "run_assigned")).toMatchObject({ userId: ada.userId, url: `/run/${batch!._id}` });
    expect(pushes).toContainEqual(expect.objectContaining({ to: "ExponentPushToken[c1]", title: "ada is your shopper", data: { url: `/order/${orderId}` } }));
  });

  it("sends price checks by SMS too once Termii is configured, and drops dead push tokens", async () => {
    vi.stubEnv("TERMII_API_KEY", "tk_test");
    vi.stubEnv("TERMII_SENDER_ID", "OjaRun");
    const sms: { to: string; sms: string }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (url.includes("termii")) {
        sms.push(JSON.parse(String(init?.body)));
        return new Response("{}");
      }
      if (url.includes("exp.host")) {
        return new Response(JSON.stringify({ data: [{ status: "error", details: { error: "DeviceNotRegistered" } }] }));
      }
      return new Response("{}", { status: 404 });
    });
    const t = setup();
    const s = await shopping(t);
    await t.run((ctx) => ctx.db.patch(s.c1.userId, { phone: "+2348031234567" }));
    await s.c1.as.mutation(api.users.registerPushToken, { token: "ExponentPushToken[old]", platform: "android" });
    await s.ada.as.mutation(api.priceChecks.send, {
      clientRequestId: rid(),
      itemId: s.tomatoes,
      quoted: 3_800_00,
      budgetGets: "about 1½ paint rubbers",
      extraRequested: 800_00,
    });
    await settle(t);
    const pc = (await outbox(t)).find((r) => r.event === "price_check")!;
    expect(pc.channels).toMatchObject({ sms: "sent", push: "sent 0/1" });
    expect(sms[0]).toMatchObject({ to: "2348031234567", from: "OjaRun" });
    expect(sms[0]!.sms).toMatch(/Tomatoes costs more today/);
    expect(await t.run((ctx) => ctx.db.query("pushTokens").collect())).toEqual([]);
  });

  it("pushes chat messages to the other person and emails the final receipt", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const emails: { to: string[]; subject: string; html: string }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (url.includes("resend")) {
        emails.push(JSON.parse(String(init?.body)));
        return new Response("{}");
      }
      return new Response("{}", { status: 404 });
    });
    const t = setup();
    const s = await shopping(t);
    await s.c1.as.mutation(api.chat.send, { clientRequestId: rid(), orderId: s.c1.orderId, body: "Firm ones please" });
    for (const id of [s.tomatoes, s.plantain]) await s.ada.as.mutation(api.items.setOutcome, { itemId: id, status: "skipped", shopperNote: "None today" });
    await s.ada.as.mutation(api.delivery.enRoute, { batchId: s.batchId });
    await s.ada.as.mutation(api.delivery.arrived, { orderId: s.c1.orderId });
    await s.c1.as.mutation(api.delivery.accept, { orderId: s.c1.orderId });
    await settle(t);

    const rows = await outbox(t);
    expect(rows.find((r) => r.event === "chat_message")).toMatchObject({ userId: s.ada.userId, title: "c1", body: "Firm ones please" });
    expect(rows.find((r) => r.event === "arrived")).toMatchObject({ url: `/door/${s.c1.orderId}` });
    const done = rows.find((r) => r.event === "order_completed")!;
    expect(done.title).toBe("Delivered. ₦5,500 is back in your wallet");
    const receipt = emails.find((e) => e.subject === "Your OjaRun receipt")!;
    expect(receipt.to).toEqual(["c1@example.com"]);
    expect(receipt.html).toMatch(/Tomatoes \(not available\)/);
  });

  it("sends critical ops alerts to the on-call contacts in settings", async () => {
    vi.stubEnv("TERMII_API_KEY", "tk_test");
    const sms: { to: string }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (url.includes("termii")) sms.push(JSON.parse(String(init?.body)));
      return new Response("{}");
    });
    const t = setup();
    const w = await world(t);
    const current = await w.ops.as.query(api.settings.get, {});
    await w.ops.as.mutation(api.settings.update, { value: { ...current, opsAlertPhone: "08031112222" }, reason: "On-call rota" });
    await t.mutation(internal.transfers.saveBalance, { balance: 1_000_00 });
    await settle(t);
    expect(sms.map((m) => m.to)).toEqual(["2348031112222"]);
  });
});

describe("rate limits and ops alerts", () => {
  it("refuses a 31st chat message in a minute", async () => {
    const t = setup();
    const s = await shopping(t);
    for (let i = 0; i < 30; i++) await s.c1.as.mutation(api.chat.send, { clientRequestId: rid(), orderId: s.c1.orderId, body: `m${i}` });
    await expect(s.c1.as.mutation(api.chat.send, { clientRequestId: rid(), orderId: s.c1.orderId, body: "one more" })).rejects.toThrow(/too often/);
    vi.advanceTimersByTime(61_000);
    await s.c1.as.mutation(api.chat.send, { clientRequestId: rid(), orderId: s.c1.orderId, body: "after a minute" });
  });

  it("alerts ops after repeated bad webhook signatures", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test");
    const t = setup();
    for (let i = 0; i < 4; i++) {
      const res = await t.fetch("/paystack/webhook", { method: "POST", body: "{}", headers: { "x-paystack-signature": "bad" } });
      expect(res.status).toBe(401);
    }
    const alerts = await t.run((ctx) => ctx.db.query("opsAlerts").collect());
    expect(alerts.map((a) => a.key)).toEqual(["webhook_bad_signature"]);
  });

  it("flags a paid order with no shopper 30 minutes before its window", async () => {
    const t = setup();
    const w = await world(t);
    const c = await paidOrder(t, w, "c1");
    const slot = (await t.run((ctx) => ctx.db.get(w.slotId)))!;
    vi.setSystemTime(slot.windowStart - 60 * 60_000);
    expect(await t.mutation(internal.orders.flagUnassigned, {})).toBe(0);
    vi.setSystemTime(slot.windowStart - 20 * 60_000);
    expect(await t.mutation(internal.orders.flagUnassigned, {})).toBe(1);
    expect(await t.mutation(internal.orders.flagUnassigned, {})).toBe(1); // same alert, not a second one
    const alerts = await t.run((ctx) => ctx.db.query("opsAlerts").collect());
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: "order_unassigned", orderId: c.orderId });
  });
});
