/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

function setup() {
  return convexTest(schema, modules);
}

async function signIn(t: ReturnType<typeof setup>, subject: string, role?: "shopper" | "ops") {
  const as = t.withIdentity({ subject, phoneNumber: "+2348031234567", tokenIdentifier: `test|${subject}` });
  const userId = await as.mutation(api.users.ensureUser, {});
  if (role) await t.run(async (ctx) => ctx.db.patch(userId, { role }));
  return { as, userId };
}

// Saturday 3 Oct 2026, 08:00 WAT.
const SAT_8AM = Date.UTC(2026, 9, 3, 7, 0);

const AKURE = { lat: 7.2507, lng: 5.195 };
const ONDO_TOWN = { lat: 7.0932, lng: 4.8353 };

const address = (p: { lat: number; lng: number }) => ({
  label: "Home",
  formatted: "12 Oyemekun Road, Akure",
  landmark: "Opposite the blue church",
  ...p,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(SAT_8AM);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("seed", () => {
  it("creates reference data once and is safe to re-run", async () => {
    const t = setup();
    const first = await t.mutation(internal.seed.run, {});
    expect(first.markets).toBe(5);
    expect(first.templates).toBe(2);
    expect(first.catalog.created).toBeGreaterThan(20);
    // Saturday has both windows today; Sunday has none (Mon–Sat).
    expect(first.slots).toBe(2);

    const again = await t.mutation(internal.seed.run, {});
    expect(again).toMatchObject({ settings: "exists", markets: 0, templates: 0, slots: 0 });
    expect(again.catalog.created).toBe(0);
  });
});

describe("slots", () => {
  it("shows only open slots before cutoff with capacity, and closes at cutoff", async () => {
    const t = setup();
    await t.mutation(internal.seed.run, {});
    const { as } = await signIn(t, "cust");

    let days = await as.query(api.slots.available, {});
    expect(days.map((d) => d.date)).toEqual(["2026-10-03", "2026-10-04"]);
    expect(days[0]!.slots.map((s) => s.label)).toEqual(["Afternoon", "Evening"]);
    expect(days[0]!.slots[0]!.remaining).toBe(8); // 4 per shopper × 2 expected shoppers
    expect(days[1]!.slots).toEqual([]); // Sunday

    // 10:00 WAT: the afternoon cutoff passes and its scheduled close runs.
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    await t.finishInProgressScheduledFunctions();
    const afternoon = await t.run(async (ctx) => ctx.db.query("slots").collect());
    expect(afternoon.map((s) => s.status).sort()).toEqual(["closed", "open"]);
    days = await as.query(api.slots.available, {});
    expect(days[0]!.slots.map((s) => s.label)).toEqual(["Evening"]);
  });

  it("hides full slots", async () => {
    const t = setup();
    await t.mutation(internal.seed.run, {});
    await t.run(async (ctx) => {
      const slots = await ctx.db.query("slots").collect();
      for (const s of slots) await ctx.db.patch(s._id, { reserved: s.capacity });
    });
    const { as } = await signIn(t, "cust");
    const days = await as.query(api.slots.available, {});
    expect(days.flatMap((d) => d.slots)).toEqual([]);
  });

  it("lets ops change capacity but never below what's booked", async () => {
    const t = setup();
    await t.mutation(internal.seed.run, {});
    const { as: ops } = await signIn(t, "ops", "ops");
    const [slot] = await ops.query(api.ops.slots.listSlots, {});
    await t.run(async (ctx) => ctx.db.patch(slot!._id, { reserved: 3 }));

    await expect(
      ops.mutation(api.ops.slots.updateSlot, { slotId: slot!._id, capacity: 2, reason: "short-staffed" }),
    ).rejects.toThrow(/below the 3/);
    await ops.mutation(api.ops.slots.updateSlot, { slotId: slot!._id, capacity: 3, reason: "short-staffed" });
    const after = await t.run(async (ctx) => ctx.db.get(slot!._id));
    expect(after?.capacity).toBe(3);
  });

  it("validates templates and makes new ones bookable straight away", async () => {
    const t = setup();
    const { as: ops } = await signIn(t, "ops", "ops");
    const base = {
      label: "Late",
      cutoffMin: 15 * 60,
      windowStartMin: 18 * 60,
      windowEndMin: 20 * 60,
      capacityPerShopper: 3,
      daysOfWeek: [6],
      active: true,
      reason: "trial",
    };
    await expect(ops.mutation(api.ops.slots.upsertTemplate, { ...base, cutoffMin: 19 * 60 })).rejects.toThrow(
      /cutoff must be before/,
    );
    await ops.mutation(api.ops.slots.upsertTemplate, base);
    vi.advanceTimersByTime(1);
    await t.finishInProgressScheduledFunctions();

    const { as } = await signIn(t, "cust");
    const days = await as.query(api.slots.available, {});
    expect(days[0]!.slots.map((s) => s.label)).toEqual(["Late"]);
  });

  it("is ops-only to manage", async () => {
    const t = setup();
    const { as } = await signIn(t, "cust");
    await expect(as.query(api.ops.slots.listTemplates, {})).rejects.toThrow(/access/);
  });
});

describe("addresses", () => {
  it("accepts an Akure address and rejects one in Ondo town", async () => {
    const t = setup();
    const { as } = await signIn(t, "cust");
    const id = await as.mutation(api.addresses.create, address(AKURE));
    await expect(as.mutation(api.addresses.create, address(ONDO_TOWN))).rejects.toThrow(/within Akure/);
    const list = await as.query(api.addresses.list, {});
    expect(list.map((a) => a._id)).toEqual([id]);
  });

  it("requires a landmark", async () => {
    const t = setup();
    const { as } = await signIn(t, "cust");
    await expect(as.mutation(api.addresses.create, { ...address(AKURE), landmark: " " })).rejects.toThrow(/landmark/);
  });

  it("only lets the owner edit or archive, and clears cached distances when the pin moves", async () => {
    const t = setup();
    await t.mutation(internal.seed.run, {});
    const { as: a } = await signIn(t, "a");
    const { as: b } = await signIn(t, "b");
    const id = await a.mutation(api.addresses.create, address(AKURE));

    await expect(b.mutation(api.addresses.archive, { id })).rejects.toThrow(/not found/);

    await t.run(async (ctx) => {
      const market = (await ctx.db.query("markets").first())!;
      await ctx.db.insert("distanceCache", {
        addressId: id as Id<"addresses">,
        marketId: market._id,
        distanceMeters: 1000,
        durationSec: 300,
        calculatedAt: Date.now(),
      });
    });
    await a.mutation(api.addresses.update, { id, ...address({ lat: 7.255, lng: 5.2 }) });
    const cached = await t.run(async (ctx) => ctx.db.query("distanceCache").collect());
    expect(cached).toEqual([]);

    await a.mutation(api.addresses.archive, { id });
    expect(await a.query(api.addresses.list, {})).toEqual([]);
  });

  it("is customer-only", async () => {
    const t = setup();
    const { as } = await signIn(t, "shop", "shopper");
    await expect(as.mutation(api.addresses.create, address(AKURE))).rejects.toThrow(/access/);
  });
});

describe("markets and catalogue", () => {
  it("lists active markets in order and rejects duplicate names", async () => {
    const t = setup();
    await t.mutation(internal.seed.run, {});
    const { as: ops } = await signIn(t, "ops", "ops");
    const markets = await ops.query(api.markets.listActive, {});
    expect(markets[0]!.name).toBe("Oja Oba");

    await expect(
      ops.mutation(api.ops.markets.upsert, {
        name: "oja  oba",
        lat: 7.25,
        lng: 5.19,
        opensAtMin: 420,
        closesAtMin: 1080,
        sortOrder: 9,
        active: true,
        reason: "dupe",
      }),
    ).rejects.toThrow(/already exists/);

    await ops.mutation(api.ops.markets.upsert, {
      id: markets[0]!._id,
      name: "Oja Oba",
      lat: 7.25,
      lng: 5.19,
      opensAtMin: 420,
      closesAtMin: 1080,
      sortOrder: 0,
      active: false,
      reason: "renovation",
    });
    expect((await ops.query(api.markets.listActive, {})).map((m) => m.name)).not.toContain("Oja Oba");
  });

  it("imports catalogue rows by name and keeps ops' on/off choice", async () => {
    const t = setup();
    const { as: ops } = await signIn(t, "ops", "ops");
    const row = { name: "Tomatoes", aliases: ["tomato"], category: "Vegetables", presetPreferences: [] };
    expect(await ops.mutation(api.ops.catalog.importItems, { rows: [row], reason: "init" })).toEqual({
      created: 1,
      updated: 0,
    });
    const [item] = await ops.query(api.ops.catalog.list, {});
    await ops.mutation(api.ops.catalog.setActive, { id: item!._id, active: false, reason: "out of season" });
    expect(await ops.mutation(api.ops.catalog.importItems, { rows: [row], reason: "refresh" })).toEqual({
      created: 0,
      updated: 1,
    });
    const [after] = await ops.query(api.ops.catalog.list, {});
    expect(after!.active).toBe(false);
  });
});
