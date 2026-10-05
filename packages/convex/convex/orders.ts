import { v } from "convex/values";
import { deliveryFee, isInsidePolygon, itemProblem, orderTotals } from "@ojarun/shared";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { customerMutation, customerQuery } from "./lib/auth";
import { deliveryDistance } from "./lib/distance";
import { appError, ErrorCode } from "./lib/errors";
import { getSettings } from "./lib/settings";
import { transitionOrder } from "./lib/stateMachine";
import { postWalletEntry } from "./lib/wallet";

const draftItem = v.object({
  name: v.string(),
  catalogItemId: v.optional(v.id("catalogItems")),
  budget: v.number(),
  preferences: v.array(v.string()),
  note: v.optional(v.string()),
});

/**
 * Step 2 of checkout (05 §6.1): validates everything, holds a slot place, prices the order with
 * packages/shared, and debits any wallet share. Idempotent on clientRequestId. If the wallet covers
 * the whole order it is paid immediately and Paystack is skipped.
 */
export const create = customerMutation({
  args: {
    clientRequestId: v.string(),
    addressId: v.id("addresses"),
    marketId: v.id("markets"),
    slotId: v.id("slots"),
    items: v.array(draftItem),
    bufferPct: v.number(),
    applyWallet: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = ctx.user;
    if (!/^[A-Za-z0-9-]{8,64}$/.test(args.clientRequestId)) {
      throw appError(ErrorCode.INVALID_INPUT, "Invalid request.");
    }
    const duplicate = await ctx.db
      .query("orders")
      .withIndex("by_clientRequestId", (q) => q.eq("clientRequestId", args.clientRequestId))
      .unique();
    if (duplicate) {
      if (duplicate.customerId !== user._id) throw appError(ErrorCode.INVALID_INPUT, "Invalid request.");
      return { orderId: duplicate._id, status: duplicate.status, chargeAmount: duplicate.totals.chargeAmount };
    }

    const settings = await getSettings(ctx);
    if (args.items.length === 0) throw appError(ErrorCode.INVALID_INPUT, "Add at least one item to your list.");
    if (args.items.length > settings.maxItemsPerOrder) {
      throw appError(ErrorCode.INVALID_INPUT, `One order can have up to ${settings.maxItemsPerOrder} items.`);
    }
    for (const item of args.items) {
      const problem = itemProblem(item);
      if (problem) throw appError(ErrorCode.INVALID_INPUT, `${item.name.trim() || "An item"}: ${problem}`);
    }
    if (!settings.bufferPresets.includes(args.bufferPct)) {
      throw appError(ErrorCode.INVALID_INPUT, "Choose one of the buffer options.");
    }

    const address = await ctx.db.get(args.addressId);
    if (!address || address.userId !== user._id || address.archived) {
      throw appError(ErrorCode.NOT_FOUND, "Choose a delivery address.");
    }
    if (!isInsidePolygon(address, settings.geofence)) {
      throw appError(ErrorCode.OUTSIDE_DELIVERY_AREA, "We only deliver within Akure for now.");
    }
    const market = await ctx.db.get(args.marketId);
    if (!market || !market.active) throw appError(ErrorCode.NOT_FOUND, "That market isn't available. Pick another.");

    const now = Date.now();
    const slot = await ctx.db.get(args.slotId);
    if (!slot || slot.status !== "open" || slot.cutoffAt <= now) {
      throw appError(ErrorCode.SLOT_CLOSED, "That delivery time has closed. Pick another.");
    }
    if (slot.reserved >= slot.capacity) {
      throw appError(ErrorCode.SLOT_FULL, "That delivery time just filled up. Pick another.");
    }

    const { distanceMeters } = await deliveryDistance(ctx, address, market);
    const totals = orderTotals({
      itemBudgets: args.items.map((i) => i.budget),
      bufferPct: args.bufferPct,
      deliveryFee: deliveryFee(distanceMeters, settings.deliveryFee),
      walletBalance: user.walletBalance,
      applyWallet: args.applyWallet,
      settings,
    });
    const { grandTotal: _grandTotal, ...stored } = totals;

    const orderId = await ctx.db.insert("orders", {
      customerId: user._id,
      marketId: market._id,
      addressId: address._id,
      addressSnapshot: { formatted: address.formatted, landmark: address.landmark, lat: address.lat, lng: address.lng },
      slotId: slot._id,
      status: "pending_payment",
      clientRequestId: args.clientRequestId,
      totals: stored,
      bufferPct: args.bufferPct,
      bufferUsed: 0,
      paymentAttempts: 0,
      holdExpiresAt: now + settings.paymentHoldMinutes * 60_000,
    });
    await ctx.db.insert("statusEvents", { orderId, status: "pending_payment", actorId: user._id, at: now });
    for (const [position, item] of args.items.entries()) {
      const note = item.note?.trim();
      await ctx.db.insert("orderItems", {
        orderId,
        position,
        name: item.name.trim(),
        catalogItemId: item.catalogItemId,
        budget: item.budget,
        preferences: item.preferences.map((p) => p.trim()),
        note: note || undefined,
        status: "pending",
        approvedExtra: 0,
        amountSpent: 0,
      });
    }
    await ctx.db.patch(slot._id, { reserved: slot.reserved + 1 });

    if (totals.walletApplied > 0) {
      await postWalletEntry(ctx, {
        userId: user._id,
        type: "checkout_debit",
        amount: -totals.walletApplied,
        dedupeKey: `checkout:${orderId}`,
        orderId,
      });
    }
    if (totals.chargeAmount === 0) {
      await transitionOrder(ctx, (await ctx.db.get(orderId))!, "paid");
      return { orderId, status: "paid" as const, chargeAmount: 0 };
    }
    return { orderId, status: "pending_payment" as const, chargeAmount: totals.chargeAmount };
  },
});

async function orderView(ctx: QueryCtx, order: Doc<"orders">) {
  const [market, slot, items, events] = await Promise.all([
    ctx.db.get(order.marketId),
    ctx.db.get(order.slotId),
    ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect(),
    ctx.db
      .query("statusEvents")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect(),
  ]);
  return {
    _id: order._id,
    _creationTime: order._creationTime,
    code: orderCode(order._id),
    status: order.status,
    marketName: market?.name ?? "Market",
    address: order.addressSnapshot,
    window: slot ? { start: slot.windowStart, end: slot.windowEnd, date: slot.date } : null,
    totals: order.totals,
    bufferPct: order.bufferPct,
    holdExpiresAt: order.holdExpiresAt,
    items: items
      .sort((a, b) => a.position - b.position)
      .map((i) => ({
        _id: i._id,
        name: i.name,
        catalogItemId: i.catalogItemId ?? null,
        budget: i.budget,
        preferences: i.preferences,
        note: i.note ?? null,
        status: i.status,
        amountSpent: i.amountSpent,
        approvedExtra: i.approvedExtra,
      })),
    timeline: events.sort((a, b) => a.at - b.at).map((e) => ({ status: e.status, at: e.at })),
  };
}

/** Short, speakable reference for support calls ("Order K7Q2"). Not a secret. */
export function orderCode(id: Id<"orders">): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += alphabet[h % alphabet.length];
    h = Math.floor(h / alphabet.length);
  }
  return out;
}

export const get = customerQuery({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const order = await ctx.db.get(orderId);
    if (!order || order.customerId !== ctx.user._id) return null;
    return await orderView(ctx, order);
  },
});

/** Newest first. Unpaid attempts that expired are hidden; they never became orders. */
export const listMine = customerQuery({
  args: {},
  handler: async (ctx) => {
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_customer", (q) => q.eq("customerId", ctx.user._id))
      .order("desc")
      .take(50);
    const out = [];
    for (const order of orders) {
      if (order.status === "expired") continue;
      const [market, slot, items] = await Promise.all([
        ctx.db.get(order.marketId),
        ctx.db.get(order.slotId),
        ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect(),
      ]);
      out.push({
        _id: order._id,
        _creationTime: order._creationTime,
        code: orderCode(order._id),
        status: order.status,
        marketName: market?.name ?? "Market",
        window: slot ? { start: slot.windowStart, end: slot.windowEnd, date: slot.date } : null,
        itemCount: items.length,
        itemNames: items.sort((a, b) => a.position - b.position).map((i) => i.name),
        catalogItemIds: items.map((i) => i.catalogItemId ?? null),
        total: order.totals.chargeAmount + order.totals.walletApplied,
      });
    }
    return out;
  },
});

/** Unpaid orders whose payment hold has run out, for the expiry sweep. */
export const staleUnpaid = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const pending = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "pending_payment"))
      .collect();
    const stale = pending.filter((o) => o.holdExpiresAt <= now).slice(0, 50);
    const out = [];
    for (const o of stale) {
      const payments = await ctx.db
        .query("payments")
        .withIndex("by_order", (q) => q.eq("orderId", o._id))
        .collect();
      out.push({ orderId: o._id, references: payments.map((p) => p.reference) });
    }
    return out;
  },
});

/**
 * Ends an unpaid order whose hold ran out: frees the slot place and returns any wallet share.
 * Run only after Paystack confirmed nothing was paid. No-op if the order moved on meanwhile.
 */
export const expire = internalMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const order = await ctx.db.get(orderId);
    if (!order || order.status !== "pending_payment" || order.holdExpiresAt > Date.now()) return false;
    await transitionOrder(ctx, order, "expired");
    const slot = await ctx.db.get(order.slotId);
    if (slot) await ctx.db.patch(slot._id, { reserved: Math.max(0, slot.reserved - 1) });
    if (order.totals.walletApplied > 0) {
      await postWalletEntry(ctx, {
        userId: order.customerId,
        type: "cancellation_refund",
        amount: order.totals.walletApplied,
        dedupeKey: `expire:${orderId}`,
        orderId,
        note: "Payment wasn't completed, so your wallet credit is back.",
      });
    }
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .collect();
    for (const p of payments) if (p.status === "initialized") await ctx.db.patch(p._id, { status: "abandoned" });
    return true;
  },
});
