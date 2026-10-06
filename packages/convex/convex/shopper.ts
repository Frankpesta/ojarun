import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { shopperMutation, shopperQuery } from "./lib/auth";
import { appError, ErrorCode } from "./lib/errors";
import { transitionOrder } from "./lib/stateMachine";
import { orderCode } from "./orders";

async function profileFor(ctx: QueryCtx, userId: Id<"users">) {
  return await ctx.db
    .query("shopperProfiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

async function activeBatches(ctx: QueryCtx, shopperId: Id<"users">) {
  const out: Doc<"batches">[] = [];
  for (const status of ["in_progress", "assigned"] as const) {
    out.push(
      ...(await ctx.db
        .query("batches")
        .withIndex("by_shopper_status", (q) => q.eq("shopperId", shopperId).eq("status", status))
        .collect()),
    );
  }
  return out;
}

export const profile = shopperQuery({
  args: {},
  handler: async (ctx) => {
    const p = await profileFor(ctx, ctx.user._id);
    if (!p) return null;
    return { legalName: p.legalName, active: p.active, onShift: p.onShift };
  },
});

/** The shopper's own shift switch. Going off shift mid-batch isn't allowed; ops reassigns instead. */
export const setOnShift = shopperMutation({
  args: { onShift: v.boolean() },
  handler: async (ctx, { onShift }) => {
    const p = await profileFor(ctx, ctx.user._id);
    if (!p || !p.active) throw appError(ErrorCode.FORBIDDEN, "Your shopper account isn't active. Call ops.");
    if (!onShift) {
      const shopping = await ctx.db
        .query("batches")
        .withIndex("by_shopper_status", (q) => q.eq("shopperId", ctx.user._id).eq("status", "in_progress"))
        .first();
      if (shopping) throw appError(ErrorCode.INVALID_INPUT, "Finish your current market run before going off shift.");
    }
    await ctx.db.patch(p._id, { onShift });
  },
});

/** Confirmed and in-progress market runs, soonest first. */
export const today = shopperQuery({
  args: {},
  handler: async (ctx) => {
    const out = [];
    for (const b of await activeBatches(ctx, ctx.user._id)) {
      const [market, slot, orders] = await Promise.all([
        ctx.db.get(b.marketId),
        ctx.db.get(b.slotId),
        ctx.db
          .query("orders")
          .withIndex("by_batch", (q) => q.eq("batchId", b._id))
          .collect(),
      ]);
      let items = 0;
      let done = 0;
      let budgets = 0;
      for (const o of orders) {
        const rows = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", o._id))
          .collect();
        items += rows.length;
        done += rows.filter((i) => i.status !== "pending").length;
        budgets += o.totals.budgets;
      }
      out.push({
        _id: b._id,
        status: b.status,
        marketName: market?.name ?? "Market",
        window: slot ? { start: slot.windowStart, end: slot.windowEnd, date: slot.date } : null,
        orderCount: orders.length,
        itemCount: items,
        doneCount: done,
        budgets,
      });
    }
    return out.sort((a, b) => (a.window?.start ?? 0) - (b.window?.start ?? 0));
  },
});

/** Everything the shopper needs at the market: orders, addresses, and every item to buy. */
export const batch = shopperQuery({
  args: { batchId: v.id("batches") },
  handler: async (ctx, { batchId }) => {
    const b = await ctx.db.get(batchId);
    if (!b || b.shopperId !== ctx.user._id) return null;
    const [market, slot, orders] = await Promise.all([
      ctx.db.get(b.marketId),
      ctx.db.get(b.slotId),
      ctx.db
        .query("orders")
        .withIndex("by_batch", (q) => q.eq("batchId", batchId))
        .collect(),
    ]);
    const outOrders = [];
    for (const o of orders.sort((x, y) => x._creationTime - y._creationTime)) {
      const [customer, items] = await Promise.all([
        ctx.db.get(o.customerId),
        ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", o._id))
          .collect(),
      ]);
      outOrders.push({
        _id: o._id,
        code: orderCode(o._id),
        status: o.status,
        customer: {
          firstName: customer?.name?.split(/\s+/)[0] ?? "Customer",
          phone: customer?.phone ?? null,
        },
        address: o.addressSnapshot,
        items: await Promise.all(
          items
            .sort((x, y) => x.position - y.position)
            .map(async (i) => ({
              _id: i._id,
              name: i.name,
              budget: i.budget,
              approvedExtra: i.approvedExtra,
              amountSpent: i.amountSpent,
              preferences: i.preferences,
              note: i.note ?? null,
              status: i.status,
              photoUrl: i.photoStorageId ? await ctx.storage.getUrl(i.photoStorageId) : null,
              shopperNote: i.shopperNote ?? null,
              quantityNote: i.quantityNote ?? null,
            })),
        ),
      });
    }
    return {
      _id: b._id,
      status: b.status,
      market: market ? { name: market.name, lat: market.lat, lng: market.lng } : null,
      window: slot ? { start: slot.windowStart, end: slot.windowEnd, date: slot.date } : null,
      orders: outOrders,
    };
  },
});

/**
 * "Start shopping" for a whole market run (05 §9 M3): every order in the batch moves to
 * "shopping", which ends free cancellation, and the shopper's location is recorded. Safe to
 * replay from the offline queue: a batch already in progress is left as it is.
 */
export const startShopping = shopperMutation({
  args: {
    batchId: v.id("batches"),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
  },
  handler: async (ctx, { batchId, lat, lng }) => {
    const b = await ctx.db.get(batchId);
    if (!b || b.shopperId !== ctx.user._id) {
      throw appError(ErrorCode.NOT_FOUND, "This market run isn't assigned to you.");
    }
    if (b.status === "in_progress") return;
    if (b.status !== "assigned") throw appError(ErrorCode.INVALID_TRANSITION, "This market run can't start now.");
    const loc =
      lat !== undefined && lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_batch", (q) => q.eq("batchId", batchId))
      .collect();
    for (const o of orders) {
      if (o.status === "assigned") await transitionOrder(ctx, o, "shopping", { actorId: ctx.user._id, ...loc });
    }
    await ctx.db.patch(batchId, { status: "in_progress" });
    if (loc) {
      const p = await profileFor(ctx, ctx.user._id);
      if (p) await ctx.db.patch(p._id, { lastLocation: { ...loc, at: Date.now() } });
    }
  },
});
