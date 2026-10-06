/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { ledgerBalance, postWalletEntry } from "./lib/wallet";
import { transitionOrder } from "./lib/stateMachine";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

function setup() {
  return convexTest(schema, modules);
}

async function signIn(t: ReturnType<typeof setup>, subject: string, phone = "+2348031234567") {
  const as = t.withIdentity({ subject, phoneNumber: phone, tokenIdentifier: `test|${subject}` });
  const userId = await as.mutation(api.users.ensureUser, {});
  return { as, userId };
}

async function makeRole(t: ReturnType<typeof setup>, userId: Id<"users">, role: "shopper" | "ops") {
  await t.run(async (ctx) => ctx.db.patch(userId, { role }));
}

describe("users", () => {
  it("creates a customer on first sign-in and is idempotent", async () => {
    const t = setup();
    const { as, userId } = await signIn(t, "clerk_a", "08031234567");
    expect(await as.mutation(api.users.ensureUser, {})).toBe(userId);
    const me = await as.query(api.users.me, {});
    expect(me).toMatchObject({ role: "customer", phone: "+2348031234567", walletBalance: 0, needsProfile: true });
  });

  it("returns null for signed-out callers", async () => {
    const t = setup();
    expect(await t.query(api.users.me, {})).toBeNull();
  });

  it("creates an email sign-up without a phone and asks for one in profile setup", async () => {
    const t = setup();
    const as = t.withIdentity({ subject: "clerk_e", email: "ADE@Example.com", tokenIdentifier: "test|clerk_e" });
    await as.mutation(api.users.ensureUser, {});
    expect(await as.query(api.users.me, {})).toMatchObject({ email: "ade@example.com", phone: null, needsProfile: true });
  });

  it("validates profile input and requires a unique Nigerian phone", async () => {
    const t = setup();
    const { as } = await signIn(t, "clerk_a");
    const other = t.withIdentity({ subject: "clerk_b", email: "b@example.com", tokenIdentifier: "test|clerk_b" });
    await other.mutation(api.users.ensureUser, {});

    await expect(as.mutation(api.users.updateProfile, { name: " ", phone: "08031234567" })).rejects.toThrow();
    await expect(other.mutation(api.users.updateProfile, { name: "Bola", phone: "+18155550100" })).rejects.toThrow(
      /Nigerian/,
    );
    // clerk_a already holds +2348031234567.
    await expect(other.mutation(api.users.updateProfile, { name: "Bola", phone: "0803 123 4567" })).rejects.toThrow(
      /another/,
    );

    await other.mutation(api.users.updateProfile, { name: "  Bola Ade ", phone: "0805 555 0100" });
    expect(await other.query(api.users.me, {})).toMatchObject({
      name: "Bola Ade",
      phone: "+2348055550100",
      needsProfile: false,
    });
  });
});

describe("role enforcement", () => {
  it("blocks non-ops from ops functions", async () => {
    const t = setup();
    const { as, userId } = await signIn(t, "clerk_a");
    await expect(as.mutation(api.ops.users.setRole, { userId, role: "ops", reason: "x" })).rejects.toThrow(
      /access/,
    );
    await expect(as.query(api.settings.get, {})).rejects.toThrow(/access/);
  });

  it("blocks signed-out callers from authed functions", async () => {
    const t = setup();
    await expect(t.query(api.settings.publicSettings, {})).rejects.toThrow(/Sign in/);
  });

  it("lets ops make a shopper with a legal name and an audited reason", async () => {
    const t = setup();
    const ops = await signIn(t, "clerk_ops", "08030000001");
    await makeRole(t, ops.userId, "ops");
    const cust = await signIn(t, "clerk_b", "08030000002");

    await expect(
      ops.as.mutation(api.ops.users.setRole, { userId: cust.userId, role: "shopper", reason: "Hired 2 Oct" }),
    ).rejects.toThrow(/Add shopper/);
    await expect(
      ops.as.mutation(api.ops.shoppers.createShopper, { userId: cust.userId, legalName: "Ada Okafor", reason: "  " }),
    ).rejects.toThrow(/reason/);
    await expect(
      ops.as.mutation(api.ops.shoppers.createShopper, { userId: cust.userId, legalName: "Ada", reason: "Hired 2 Oct" }),
    ).rejects.toThrow(/full legal name/);

    await ops.as.mutation(api.ops.shoppers.createShopper, {
      userId: cust.userId,
      legalName: " Adá  Okafor ",
      reason: "Hired 2 Oct",
    });
    expect(await cust.as.query(api.users.me, {})).toMatchObject({ role: "shopper" });
    const profile = await t.run((ctx) => ctx.db.query("shopperProfiles").unique());
    expect(profile).toMatchObject({ legalName: "Adá Okafor", nameTokens: ["ada", "okafor"], active: true, onShift: false });

    const log = await t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ action: "shopper.create", reason: "Hired 2 Oct", actorId: ops.userId });

    await ops.as.mutation(api.ops.users.setRole, { userId: cust.userId, role: "customer", reason: "Left" });
    expect(await t.run((ctx) => ctx.db.query("shopperProfiles").unique())).toMatchObject({ active: false, onShift: false });
  });

  it("stops suspended users", async () => {
    const t = setup();
    const { as, userId } = await signIn(t, "clerk_a");
    await t.run((ctx) => ctx.db.patch(userId, { status: "suspended" }));
    await expect(as.query(api.settings.publicSettings, {})).rejects.toThrow(/not active/);
  });

  it("ensureUser can never escalate a role", async () => {
    const t = setup();
    const { as, userId } = await signIn(t, "clerk_a");
    await makeRole(t, userId, "shopper");
    await as.mutation(api.users.ensureUser, {});
    expect(await as.query(api.users.me, {})).toMatchObject({ role: "shopper" });
  });
});

describe("bootstrap", () => {
  it("promotes the first admin by phone", async () => {
    const t = setup();
    const { as } = await signIn(t, "clerk_a", "+2348039999999");
    await t.mutation(internal.admin.bootstrapOps, { phone: "0803 999 9999" });
    expect(await as.query(api.users.me, {})).toMatchObject({ role: "ops" });
  });
});

describe("settings", () => {
  it("falls back to defaults and validates updates", async () => {
    const t = setup();
    const ops = await signIn(t, "clerk_ops");
    await makeRole(t, ops.userId, "ops");
    const s = await ops.as.query(api.settings.get, {});
    expect(s.serviceFeeKobo).toBe(500_00);

    await expect(
      ops.as.mutation(api.settings.update, { value: { ...s, serviceFeeKobo: 10.5 }, reason: "test" }),
    ).rejects.toThrow(/serviceFeeKobo/);

    await ops.as.mutation(api.settings.update, { value: { ...s, serviceFeeKobo: 600_00 }, reason: "Pilot price" });
    expect((await ops.as.query(api.settings.get, {})).serviceFeeKobo).toBe(600_00);
  });
});

describe("wallet ledger", () => {
  it("keeps the cached balance equal to the ledger and dedupes", async () => {
    const t = setup();
    const { userId } = await signIn(t, "clerk_a");
    await t.run(async (ctx) => {
      await postWalletEntry(ctx, { userId, type: "leftover_credit", amount: 1_500_00, dedupeKey: "leftover:o1" });
      await postWalletEntry(ctx, { userId, type: "leftover_credit", amount: 1_500_00, dedupeKey: "leftover:o1" });
      await postWalletEntry(ctx, { userId, type: "checkout_debit", amount: -1_000_00, dedupeKey: "checkout:o2" });
      const user = await ctx.db.get(userId);
      expect(user!.walletBalance).toBe(500_00);
      expect(await ledgerBalance(ctx, userId)).toBe(500_00);
    });
  });

  it("lists the caller's own activity, newest first", async () => {
    const t = setup();
    const { as, userId } = await signIn(t, "clerk_a");
    const { userId: otherId } = await signIn(t, "clerk_b", "+2348055550100");
    await t.run(async (ctx) => {
      await postWalletEntry(ctx, { userId, type: "leftover_credit", amount: 1_250_00, dedupeKey: "l:1" });
      await postWalletEntry(ctx, { userId, type: "checkout_debit", amount: -500_00, dedupeKey: "c:2" });
      await postWalletEntry(ctx, { userId: otherId, type: "leftover_credit", amount: 900_00, dedupeKey: "l:3" });
    });
    const rows = await as.query(api.wallet.activity, {});
    expect(rows.map((r) => r.amount)).toEqual([-500_00, 1_250_00]);
  });

  it("refuses overdrafts, wrong signs, fractional kobo and unexplained adjustments", async () => {
    const t = setup();
    const { userId } = await signIn(t, "clerk_a");
    await t.run(async (ctx) => {
      await expect(
        postWalletEntry(ctx, { userId, type: "checkout_debit", amount: -1, dedupeKey: "a" }),
      ).rejects.toThrow(/Not enough/);
      await expect(
        postWalletEntry(ctx, { userId, type: "checkout_debit", amount: 100, dedupeKey: "b" }),
      ).rejects.toThrow(/negative/);
      await expect(
        postWalletEntry(ctx, { userId, type: "leftover_credit", amount: -100, dedupeKey: "c" }),
      ).rejects.toThrow(/positive/);
      await expect(
        postWalletEntry(ctx, { userId, type: "leftover_credit", amount: 10.5, dedupeKey: "d" }),
      ).rejects.toThrow(/integer/);
      await expect(
        postWalletEntry(ctx, { userId, type: "adjustment", amount: 100, dedupeKey: "e" }),
      ).rejects.toThrow(/reason/);
      expect((await ctx.db.get(userId))!.walletBalance).toBe(0);
    });
  });
});

describe("order state machine", () => {
  it("records legal transitions and rejects illegal ones", async () => {
    const t = setup();
    const { userId } = await signIn(t, "clerk_a");
    await t.run(async (ctx) => {
      const marketId = await ctx.db.insert("markets", {
        name: "Oja Oba",
        slug: "oja-oba",
        lat: 7.2526,
        lng: 5.1931,
        opensAtMin: 420,
        closesAtMin: 1140,
        active: true,
        sortOrder: 1,
      });
      const addressId = await ctx.db.insert("addresses", {
        userId,
        label: "Home",
        lat: 7.25,
        lng: 5.2,
        formatted: "Alagbaka, Akure",
        landmark: "Opposite the filling station",
        insideGeofence: true,
        archived: false,
      });
      const templateId = await ctx.db.insert("slotTemplates", {
        label: "Afternoon",
        cutoffMin: 600,
        windowStartMin: 780,
        windowEndMin: 900,
        capacityPerShopper: 8,
        daysOfWeek: [1, 2, 3, 4, 5, 6],
        active: true,
      });
      const slotId = await ctx.db.insert("slots", {
        templateId,
        date: "2026-10-02",
        cutoffAt: 0,
        windowStart: 0,
        windowEnd: 0,
        capacity: 8,
        reserved: 1,
        status: "open",
      });
      const orderId = await ctx.db.insert("orders", {
        customerId: userId,
        marketId,
        addressId,
        addressSnapshot: { formatted: "Alagbaka", landmark: "", lat: 7.25, lng: 5.2 },
        slotId,
        status: "paid",
        clientRequestId: "req-1",
        totals: {
          budgets: 0,
          buffer: 0,
          serviceFee: 0,
          deliveryFee: 0,
          paystackCharge: 0,
          walletApplied: 0,
          chargeAmount: 0,
        },
        bufferPct: 0,
        bufferUsed: 0,
        paymentAttempts: 0,
        holdExpiresAt: 0,
      });

      const order = (await ctx.db.get(orderId))!;
      await expect(transitionOrder(ctx, order, "shopping")).rejects.toThrow(/can't move/);
      await transitionOrder(ctx, order, "assigned", { actorId: userId });
      const assigned = (await ctx.db.get(orderId))!;
      await transitionOrder(ctx, assigned, "shopping", { lat: 7.25, lng: 5.19 });
      const shopping = (await ctx.db.get(orderId))!;
      await expect(transitionOrder(ctx, shopping, "cancelled")).rejects.toThrow(/can't move/);

      const events = await ctx.db
        .query("statusEvents")
        .withIndex("by_order", (q) => q.eq("orderId", orderId))
        .collect();
      expect(events.map((e) => e.status)).toEqual(["assigned", "shopping"]);
      expect(events[1]).toMatchObject({ lat: 7.25, lng: 5.19 });
    });
  });
});
