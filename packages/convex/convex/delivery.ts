import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { canTransitionItem, formatNaira, haversineMeters } from "@ojarun/shared";
import { customerMutation, customerQuery, shopperMutation } from "./lib/auth";
import { raiseAlert } from "./lib/alerts";
import { postSystem } from "./lib/chat";
import { notifyOrderEvent } from "./lib/notify";
import { completeOrder } from "./lib/complete";
import { appError, ErrorCode } from "./lib/errors";
import { transitionOrder } from "./lib/stateMachine";
import { orderCode } from "./orders";

/**
 * Delivery and the door (05 §6.4): the shopper heads out and arrives; the customer checks each
 * item, rejects any they won't keep, and accepts. Accepting is final and writes the credits.
 */

/** Past this, Arrived still works but the shopper is warned and ops can see the distance. */
export const ARRIVED_WARN_METERS = 500;
const REASON_MAX = 200;

const loc = (lat?: number, lng?: number) =>
  lat !== undefined && lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;

/**
 * "Head out to deliver" for the whole run. Every item must have an outcome and no transfer may
 * still be settling, so the customer's change is worked out from final numbers.
 */
export const enRoute = shopperMutation({
  args: { batchId: v.id("batches"), lat: v.optional(v.number()), lng: v.optional(v.number()) },
  handler: async (ctx, { batchId, lat, lng }) => {
    const batch = await ctx.db.get(batchId);
    if (!batch || batch.shopperId !== ctx.user._id) throw appError(ErrorCode.NOT_FOUND, "This market run isn't assigned to you.");
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_batch", (q) => q.eq("batchId", batchId))
      .collect();
    const shopping = orders.filter((o) => o.status === "shopping");
    if (shopping.length === 0) return; // replay, or nothing left to take out

    for (const o of shopping) {
      const items = await ctx.db
        .query("orderItems")
        .withIndex("by_order", (q) => q.eq("orderId", o._id))
        .collect();
      const open = items.find((i) => i.status === "pending");
      if (open) throw appError(ErrorCode.INVALID_INPUT, `Finish every item first (${open.name} for #${orderCode(o._id)}).`);
      for (const i of items) {
        const settling = await ctx.db
          .query("traderTransfers")
          .withIndex("by_item", (q) => q.eq("itemId", i._id))
          .filter((q) => q.or(q.eq(q.field("status"), "queued"), q.eq(q.field("status"), "pending")))
          .first();
        if (settling) throw appError(ErrorCode.INVALID_INPUT, `Wait for the payment for ${i.name} to go through.`);
      }
    }
    const first = ctx.user.name?.split(/\s+/)[0] ?? "Your shopper";
    for (const o of shopping) {
      await transitionOrder(ctx, o, "en_route", { actorId: ctx.user._id, ...loc(lat, lng) });
      await notifyOrderEvent(ctx, o, "en_route");
      await postSystem(ctx, o._id, `${first} is on the way with your shopping`, `en_route:${o._id}`);
    }
  },
});

/** At one customer's door. Records where; warns (doesn't block) if it's far from the pin. */
export const arrived = shopperMutation({
  args: { orderId: v.id("orders"), lat: v.optional(v.number()), lng: v.optional(v.number()) },
  handler: async (ctx, { orderId, lat, lng }) => {
    const order = await ctx.db.get(orderId);
    if (!order || order.shopperId !== ctx.user._id) throw appError(ErrorCode.NOT_FOUND, "This order isn't yours.");
    if (order.status === "arrived") return { distanceMeters: order.arrivedDistanceMeters ?? null };
    if (order.status !== "en_route") throw appError(ErrorCode.INVALID_TRANSITION, "Head out to deliver first.");
    const here = loc(lat, lng);
    const distanceMeters = here ? Math.round(haversineMeters(here, order.addressSnapshot)) : null;
    await transitionOrder(ctx, order, "arrived", { actorId: ctx.user._id, ...here });
    await notifyOrderEvent(ctx, order, "arrived");
    if (distanceMeters !== null) await ctx.db.patch(orderId, { arrivedDistanceMeters: distanceMeters });
    await postSystem(ctx, orderId, `${ctx.user.name?.split(/\s+/)[0] ?? "Your shopper"} is at your door. Check your items, then accept.`, `arrived:${orderId}`);
    return { distanceMeters };
  },
});

/** Nobody answers at the door: ops is alerted to call the customer (05 §2). */
export const customerUnavailable = shopperMutation({
  args: { orderId: v.id("orders"), note: v.optional(v.string()) },
  handler: async (ctx, { orderId, note }) => {
    const order = await ctx.db.get(orderId);
    if (!order || order.shopperId !== ctx.user._id) throw appError(ErrorCode.NOT_FOUND, "This order isn't yours.");
    if (order.status !== "arrived") throw appError(ErrorCode.INVALID_TRANSITION, "Tap Arrived first.");
    const clean = note?.trim().slice(0, REASON_MAX);
    await ctx.db.patch(orderId, { unavailableAt: Date.now() });
    const customer = await ctx.db.get(order.customerId);
    await raiseAlert(ctx, {
      key: `unavailable:${orderId}`,
      kind: "customer_unavailable",
      severity: "critical",
      orderId,
      message: `${ctx.user.name ?? "A shopper"} is at the door for order ${orderCode(orderId)} but can't reach ${customer?.name ?? "the customer"} (${customer?.phone ?? "no phone"}).${clean ? ` "${clean}"` : ""} Call them, or complete the order for them.`,
    });
    await postSystem(ctx, orderId, "Your shopper is at your door and couldn't reach you. OjaRun will call you now.", `unavailable:${orderId}:${Date.now()}`);
  },
});

/** The door check: items with photos, what was spent, and what comes back if rejected. */
export const inspect = customerQuery({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const order = await ctx.db.get(orderId);
    if (!order || order.customerId !== ctx.user._id) return null;
    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .collect();
    const shopper = order.shopperId ? await ctx.db.get(order.shopperId) : null;
    return {
      status: order.status,
      shopperName: shopper?.name?.split(/\s+/)[0] ?? "Your shopper",
      buffer: order.totals.buffer,
      bufferUsed: order.bufferUsed,
      items: await Promise.all(
        items
          .sort((a, b) => a.position - b.position)
          .map(async (i) => ({
            _id: i._id,
            name: i.name,
            status: i.status,
            budget: i.budget,
            approvedExtra: i.approvedExtra,
            amountSpent: i.amountSpent,
            quantityNote: i.quantityNote ?? null,
            shopperNote: i.shopperNote ?? null,
            rejectionReason: i.rejectionReason ?? null,
            photoUrl: i.photoStorageId ? await ctx.storage.getUrl(i.photoStorageId) : null,
          })),
      ),
    };
  },
});

async function itemAtDoor(ctx: MutationCtx, userId: Id<"users">, itemId: Id<"orderItems">) {
  const item = await ctx.db.get(itemId);
  const order = item ? await ctx.db.get(item.orderId) : null;
  if (!item || !order || order.customerId !== userId) throw appError(ErrorCode.NOT_FOUND, "Item not found.");
  if (order.status !== "arrived") throw appError(ErrorCode.INVALID_TRANSITION, "You can only reject items while your shopper is at the door.");
  return { item, order };
}

/** Reject an item at the door. Reversible until the customer accepts. */
export const rejectItem = customerMutation({
  args: { itemId: v.id("orderItems"), reason: v.string() },
  handler: async (ctx, { itemId, reason }) => {
    const { item, order } = await itemAtDoor(ctx, ctx.user._id, itemId);
    const clean = reason.trim().replace(/\s+/g, " ");
    if (clean.length < 3) throw appError(ErrorCode.INVALID_INPUT, "Say what's wrong with it.");
    if (clean.length > REASON_MAX) throw appError(ErrorCode.INVALID_INPUT, `Keep it under ${REASON_MAX} characters.`);
    if (item.status === "rejected") {
      await ctx.db.patch(itemId, { rejectionReason: clean });
      return;
    }
    if ((item.status !== "bought" && item.status !== "adjusted") || !canTransitionItem(item.status, "rejected")) {
      throw appError(ErrorCode.INVALID_INPUT, "Only items your shopper bought can be rejected.");
    }
    await ctx.db.patch(itemId, { status: "rejected", statusBeforeReject: item.status, rejectionReason: clean });
    await postSystem(ctx, order._id, `${item.name} rejected: ${clean}. Please take it back.`, `reject:${itemId}:${Date.now()}`);
  },
});

export const undoReject = customerMutation({
  args: { itemId: v.id("orderItems") },
  handler: async (ctx, { itemId }) => {
    const { item, order } = await itemAtDoor(ctx, ctx.user._id, itemId);
    if (item.status !== "rejected") return;
    await ctx.db.patch(itemId, { status: item.statusBeforeReject ?? "bought", statusBeforeReject: undefined, rejectionReason: undefined });
    await postSystem(ctx, order._id, `${item.name} kept after all`, `unreject:${itemId}:${Date.now()}`);
  },
});

/** "Accept delivery". Final: the order completes and credits land in the wallet. */
export const accept = customerMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const order = await ctx.db.get(orderId);
    if (!order || order.customerId !== ctx.user._id) throw appError(ErrorCode.NOT_FOUND, "Order not found.");
    if (order.status === "completed") return null; // replay
    if (order.status !== "arrived") throw appError(ErrorCode.INVALID_TRANSITION, "You can accept once your shopper is at the door.");
    const credits = await completeOrder(ctx, order, { actorId: ctx.user._id });
    console.log({ evt: "order.completed", orderId, ...credits, credited: formatNaira(credits.leftover + credits.rejection) });
    return credits;
  },
});
