import { v } from "convex/values";
import { addDays, compassPoint, haversineMeters, lagosDate } from "@ojarun/shared";
import { opsMutation, opsQuery } from "../lib/auth";
import { audit } from "../lib/audit";
import { appError, ErrorCode } from "../lib/errors";
import { getSettings } from "../lib/settings";
import { transitionOrder } from "../lib/stateMachine";
import { bearingOf, onShiftShoppers, proposeBatches } from "../batching";
import { orderCode } from "../orders";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

/** Slots from yesterday to tomorrow, for the board's slot picker, with paid-order counts. */
export const slots = opsQuery({
  args: {},
  handler: async (ctx) => {
    const today = lagosDate(Date.now());
    const out = [];
    for (const date of [addDays(today, -1), today, addDays(today, 1)]) {
      const rows = await ctx.db
        .query("slots")
        .withIndex("by_date", (q) => q.eq("date", date))
        .collect();
      for (const s of rows) {
        const template = await ctx.db.get(s.templateId);
        const batches = await ctx.db
          .query("batches")
          .withIndex("by_slot", (q) => q.eq("slotId", s._id))
          .collect();
        out.push({
          _id: s._id,
          date: s.date,
          label: template?.label ?? "Slot",
          cutoffAt: s.cutoffAt,
          windowStart: s.windowStart,
          windowEnd: s.windowEnd,
          status: s.status,
          reserved: s.reserved,
          proposed: batches.filter((b) => b.status === "proposed").length,
          batches: batches.length,
        });
      }
    }
    return out.sort((a, b) => a.windowStart - b.windowStart);
  },
});

async function orderCard(ctx: QueryCtx, order: Doc<"orders">, market: Doc<"markets">) {
  const [customer, items] = await Promise.all([
    ctx.db.get(order.customerId),
    ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect(),
  ]);
  return {
    _id: order._id,
    code: orderCode(order._id),
    status: order.status,
    customerName: customer?.name ?? "Customer",
    landmark: order.addressSnapshot.landmark,
    formatted: order.addressSnapshot.formatted,
    itemCount: items.length,
    budgets: order.totals.budgets,
    direction: compassPoint(bearingOf(market, order)),
    km: Math.round(haversineMeters(market, order.addressSnapshot) / 100) / 10,
  };
}

/**
 * Everything for one slot: per market, its batches (proposed or confirmed) and any paid orders
 * not yet in a batch, plus the shoppers ops can assign.
 */
export const board = opsQuery({
  args: { slotId: v.id("slots") },
  handler: async (ctx, { slotId }) => {
    const slot = await ctx.db.get(slotId);
    if (!slot) return null;
    const settings = await getSettings(ctx);
    const batches = await ctx.db
      .query("batches")
      .withIndex("by_slot", (q) => q.eq("slotId", slotId))
      .collect();

    const markets = [];
    let awaitingPayment = 0;
    for (const market of (await ctx.db.query("markets").collect()).sort((a, b) => a.sortOrder - b.sortOrder)) {
      const marketBatches = [];
      for (const b of batches.filter((b) => b.marketId === market._id)) {
        const orders = await ctx.db
          .query("orders")
          .withIndex("by_batch", (q) => q.eq("batchId", b._id))
          .collect();
        const shopper = b.shopperId ? await ctx.db.get(b.shopperId) : null;
        marketBatches.push({
          _id: b._id,
          _creationTime: b._creationTime,
          status: b.status,
          shopper: shopper ? { _id: shopper._id, name: shopper.name ?? "Shopper" } : null,
          orders: await Promise.all(orders.map((o) => orderCard(ctx, o, market))),
        });
      }
      const unbatched = [];
      for (const status of ["paid", "pending_payment"] as const) {
        const rows = await ctx.db
          .query("orders")
          .withIndex("by_slot_market_status", (q) =>
            q.eq("slotId", slotId).eq("marketId", market._id).eq("status", status),
          )
          .collect();
        if (status === "pending_payment") awaitingPayment += rows.length;
        else for (const o of rows.filter((o) => !o.batchId)) unbatched.push(await orderCard(ctx, o, market));
      }
      if (marketBatches.length || unbatched.length) {
        markets.push({
          _id: market._id,
          name: market.name,
          batches: marketBatches.sort((a, b) => a._creationTime - b._creationTime),
          unbatched,
        });
      }
    }

    const shopperRows = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "shopper"))
      .collect();
    const onShift = new Set((await onShiftShoppers(ctx)).map((u) => u._id));
    const shoppers = shopperRows
      .filter((u) => u.status === "active")
      .map((u) => ({
        _id: u._id,
        name: u.name ?? "Shopper",
        onShift: onShift.has(u._id),
        batchCount: batches.filter((b) => b.shopperId === u._id).length,
      }))
      .sort((a, b) => Number(b.onShift) - Number(a.onShift) || a.name.localeCompare(b.name));

    const template = await ctx.db.get(slot.templateId);
    return {
      slot: {
        _id: slot._id,
        label: template?.label ?? "Slot",
        date: slot.date,
        cutoffAt: slot.cutoffAt,
        windowStart: slot.windowStart,
        windowEnd: slot.windowEnd,
        status: slot.status,
      },
      maxPerBatch: settings.maxOrdersPerBatch,
      awaitingPayment,
      markets,
      shoppers,
    };
  },
});

async function requireBatch(ctx: QueryCtx, batchId: Id<"batches">) {
  const batch = await ctx.db.get(batchId);
  if (!batch) throw appError(ErrorCode.NOT_FOUND, "That batch no longer exists.");
  return batch;
}

async function requireAssignableShopper(ctx: QueryCtx, shopperId: Id<"users">) {
  const user = await ctx.db.get(shopperId);
  const profile = await ctx.db
    .query("shopperProfiles")
    .withIndex("by_user", (q) => q.eq("userId", shopperId))
    .unique();
  if (!user || user.role !== "shopper" || user.status !== "active" || !profile?.active) {
    throw appError(ErrorCode.INVALID_INPUT, "That person isn't an active shopper.");
  }
  return user;
}

async function deleteIfEmpty(ctx: MutationCtx, batchId: Id<"batches">) {
  const any = await ctx.db
    .query("orders")
    .withIndex("by_batch", (q) => q.eq("batchId", batchId))
    .first();
  if (!any) await ctx.db.delete(batchId);
}

/**
 * Moves an order into another batch for the same market and slot, or into a new batch when
 * `toBatchId` is omitted. Orders already confirmed with a shopper can only move to another
 * confirmed batch, because an order never goes back from "assigned" to "paid".
 */
export const moveOrder = opsMutation({
  args: {
    orderId: v.id("orders"),
    toBatchId: v.optional(v.id("batches")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { orderId, toBatchId, reason }) => {
    const order = await ctx.db.get(orderId);
    if (!order) throw appError(ErrorCode.NOT_FOUND, "Order not found.");
    if (order.status !== "paid" && order.status !== "assigned") {
      throw appError(ErrorCode.INVALID_INPUT, "Only orders that haven't started shopping can move.");
    }
    const from = order.batchId ? await ctx.db.get(order.batchId) : null;
    if (from?.status === "in_progress" || from?.status === "done") {
      throw appError(ErrorCode.INVALID_INPUT, "That batch has already started.");
    }

    let to: Doc<"batches">;
    if (toBatchId) {
      if (toBatchId === order.batchId) return;
      to = await requireBatch(ctx, toBatchId);
      if (to.slotId !== order.slotId || to.marketId !== order.marketId) {
        throw appError(ErrorCode.INVALID_INPUT, "Orders can only move between batches for the same market and slot.");
      }
      if (to.status !== "proposed" && to.status !== "assigned") {
        throw appError(ErrorCode.INVALID_INPUT, "That batch has already started.");
      }
    } else {
      const id = await ctx.db.insert("batches", {
        marketId: order.marketId,
        slotId: order.slotId,
        status: "proposed",
      });
      to = (await ctx.db.get(id))!;
    }
    if (order.status === "assigned" && to.status === "proposed") {
      throw appError(
        ErrorCode.INVALID_INPUT,
        "This order is confirmed with a shopper. Move it to another confirmed batch.",
      );
    }

    if (order.status === "assigned" || to.status === "assigned") {
      await audit(ctx, {
        actorId: ctx.user._id,
        action: "dispatch.moveOrder",
        targetTable: "orders",
        targetId: orderId,
        reason: reason ?? "",
        before: { batchId: order.batchId, shopperId: order.shopperId },
        after: { batchId: to._id, shopperId: to.shopperId },
      });
    }
    await ctx.db.patch(orderId, {
      batchId: to._id,
      shopperId: to.status === "assigned" ? to.shopperId : undefined,
    });
    if (to.status === "assigned" && order.status === "paid") {
      await transitionOrder(ctx, (await ctx.db.get(orderId))!, "assigned", {
        actorId: ctx.user._id,
      });
    }
    if (from) await deleteIfEmpty(ctx, from._id);
  },
});

/**
 * Sets a batch's shopper. Before confirmation this is a free choice; after it, every order moves
 * to the new shopper and a reason is required (audited). Not allowed once shopping starts.
 */
export const assignShopper = opsMutation({
  args: {
    batchId: v.id("batches"),
    shopperId: v.optional(v.id("users")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { batchId, shopperId, reason }) => {
    const batch = await requireBatch(ctx, batchId);
    if (batch.status === "in_progress" || batch.status === "done") {
      throw appError(ErrorCode.INVALID_INPUT, "Shopping has started, so the shopper can't change.");
    }
    if (shopperId) await requireAssignableShopper(ctx, shopperId);
    if (batch.status === "proposed") {
      await ctx.db.patch(batchId, { shopperId });
      return;
    }
    if (!shopperId) throw appError(ErrorCode.INVALID_INPUT, "A confirmed batch needs a shopper.");
    if (shopperId === batch.shopperId) return;
    await audit(ctx, {
      actorId: ctx.user._id,
      action: "dispatch.reassign",
      targetTable: "batches",
      targetId: batchId,
      reason: reason ?? "",
      before: { shopperId: batch.shopperId },
      after: { shopperId },
    });
    await ctx.db.patch(batchId, { shopperId });
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_batch", (q) => q.eq("batchId", batchId))
      .collect();
    for (const o of orders) await ctx.db.patch(o._id, { shopperId });
  },
});

async function confirm(ctx: MutationCtx & { user: Doc<"users"> }, batch: Doc<"batches">) {
  if (batch.status !== "proposed") throw appError(ErrorCode.INVALID_INPUT, "This batch is already confirmed.");
  if (!batch.shopperId) throw appError(ErrorCode.INVALID_INPUT, "Choose a shopper first.");
  await requireAssignableShopper(ctx, batch.shopperId);
  const orders = await ctx.db
    .query("orders")
    .withIndex("by_batch", (q) => q.eq("batchId", batch._id))
    .collect();
  let kept = 0;
  for (const o of orders) {
    if (o.status !== "paid") {
      // Cancelled since the proposal was made.
      await ctx.db.patch(o._id, { batchId: undefined });
      continue;
    }
    await ctx.db.patch(o._id, { shopperId: batch.shopperId });
    await transitionOrder(ctx, { ...o, shopperId: batch.shopperId }, "assigned", { actorId: ctx.user._id });
    kept++;
  }
  if (kept === 0) {
    await ctx.db.delete(batch._id);
    return 0;
  }
  await ctx.db.patch(batch._id, { status: "assigned" });
  return kept;
}

/** Confirms one batch: its orders become "assigned" and appear in the shopper's app. */
export const confirmBatch = opsMutation({
  args: { batchId: v.id("batches") },
  handler: async (ctx, { batchId }) => confirm(ctx, await requireBatch(ctx, batchId)),
});

/** Confirms every proposed batch in the slot that has a shopper. Returns how many it confirmed. */
export const confirmSlot = opsMutation({
  args: { slotId: v.id("slots") },
  handler: async (ctx, { slotId }) => {
    const batches = await ctx.db
      .query("batches")
      .withIndex("by_slot", (q) => q.eq("slotId", slotId))
      .collect();
    let confirmed = 0;
    for (const b of batches) {
      if (b.status !== "proposed" || !b.shopperId) continue;
      if ((await confirm(ctx, b)) > 0) confirmed++;
    }
    return confirmed;
  },
});

/**
 * Throws away the unconfirmed proposals and builds them again, e.g. after more shoppers come on
 * shift. Confirmed batches are left alone.
 */
export const reproposeSlot = opsMutation({
  args: { slotId: v.id("slots") },
  handler: async (ctx, { slotId }) => {
    const slot = await ctx.db.get(slotId);
    if (!slot) throw appError(ErrorCode.NOT_FOUND, "Slot not found.");
    if (slot.status === "open") {
      throw appError(ErrorCode.INVALID_INPUT, "This slot is still taking orders. Batches are proposed at cutoff.");
    }
    const batches = await ctx.db
      .query("batches")
      .withIndex("by_slot", (q) => q.eq("slotId", slotId))
      .collect();
    for (const b of batches.filter((b) => b.status === "proposed")) {
      const orders = await ctx.db
        .query("orders")
        .withIndex("by_batch", (q) => q.eq("batchId", b._id))
        .collect();
      for (const o of orders) await ctx.db.patch(o._id, { batchId: undefined, shopperId: undefined });
      await ctx.db.delete(b._id);
    }
    return await proposeBatches(ctx, slotId);
  },
});
