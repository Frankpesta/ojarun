import { v } from "convex/values";
import { formatNaira, maskAccount } from "@ojarun/shared";
import { opsMutation, opsQuery } from "../lib/auth";
import { audit } from "../lib/audit";
import { cancelOrder, refundFor } from "../lib/cancel";
import { completeOrder } from "../lib/complete";
import { appError, ErrorCode } from "../lib/errors";
import { resolveAlert } from "../lib/alerts";
import { postWalletEntry } from "../lib/wallet";
import { orderStatus } from "../schema";
import { orderCode } from "../orders";
import type { Doc } from "../_generated/dataModel";

const LIST_LIMIT = 150;

/** The order board: newest first, optionally one status. */
export const list = opsQuery({
  args: { status: v.optional(orderStatus) },
  handler: async (ctx, { status }) => {
    const rows: Doc<"orders">[] = status
      ? await ctx.db
          .query("orders")
          .withIndex("by_status", (q) => q.eq("status", status))
          .order("desc")
          .take(LIST_LIMIT)
      : await ctx.db.query("orders").order("desc").take(LIST_LIMIT);
    return await Promise.all(
      rows.map(async (o) => {
        const [customer, shopper, market, slot] = await Promise.all([
          ctx.db.get(o.customerId),
          o.shopperId ? ctx.db.get(o.shopperId) : null,
          ctx.db.get(o.marketId),
          ctx.db.get(o.slotId),
        ]);
        return {
          _id: o._id,
          at: o._creationTime,
          code: orderCode(o._id),
          status: o.status,
          customerName: customer?.name ?? "Customer",
          shopperName: shopper?.name ?? null,
          marketName: market?.name ?? "Market",
          window: slot ? { start: slot.windowStart, end: slot.windowEnd, date: slot.date } : null,
          total: o.totals.walletApplied + o.totals.chargeAmount,
          unavailable: !!o.unavailableAt && o.status === "arrived",
        };
      }),
    );
  },
});

/** Everything about one order for support: items, money, timeline, flags. */
export const detail = opsQuery({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const o = await ctx.db.get(orderId);
    if (!o) return null;
    const [customer, shopper, market, items, events, entries, transfers] = await Promise.all([
      ctx.db.get(o.customerId),
      o.shopperId ? ctx.db.get(o.shopperId) : null,
      ctx.db.get(o.marketId),
      ctx.db
        .query("orderItems")
        .withIndex("by_order", (q) => q.eq("orderId", orderId))
        .collect(),
      ctx.db
        .query("statusEvents")
        .withIndex("by_order", (q) => q.eq("orderId", orderId))
        .collect(),
      ctx.db
        .query("walletEntries")
        .withIndex("by_user", (q) => q.eq("userId", o.customerId))
        .filter((q) => q.eq(q.field("orderId"), orderId))
        .collect(),
      ctx.db
        .query("traderTransfers")
        .filter((q) => q.eq(q.field("orderId"), orderId))
        .collect(),
    ]);
    const quote = await refundFor(ctx, o, true);
    return {
      _id: o._id,
      code: orderCode(o._id),
      status: o.status,
      marketName: market?.name ?? "Market",
      address: o.addressSnapshot,
      customer: customer ? { _id: customer._id, name: customer.name ?? "Customer", phone: customer.phone ?? null, walletBalance: customer.walletBalance } : null,
      shopper: shopper ? { name: shopper.name ?? "Shopper", phone: shopper.phone ?? null } : null,
      totals: o.totals,
      bufferUsed: o.bufferUsed,
      cancelReason: o.cancelReason ?? null,
      completedReason: o.completedReason ?? null,
      arrivedDistanceMeters: o.arrivedDistanceMeters ?? null,
      unavailableAt: o.unavailableAt ?? null,
      cancelRefund: quote.refund + quote.chargeRefund,
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
            shopperNote: i.shopperNote ?? null,
            rejectionReason: i.rejectionReason ?? null,
            rejectionOutcome: i.rejectionOutcome ?? null,
            photoUrl: i.photoStorageId ? await ctx.storage.getUrl(i.photoStorageId) : null,
          })),
      ),
      timeline: events.sort((a, b) => a.at - b.at).map((e) => ({ status: e.status, at: e.at })),
      wallet: entries.sort((a, b) => a._creationTime - b._creationTime).map((e) => ({ type: e.type, amount: e.amount, note: e.note ?? null, at: e._creationTime })),
      transfers: transfers.map((t) => ({ _id: t._id, amount: t.amount, status: t.status })),
    };
  },
});

/**
 * Ops cancels (05 §2): allowed until shopping starts. With refundCharge the Paystack charge comes
 * back too, as its own adjustment (e.g. no shopper available, which is our fault). Audited.
 */
export const cancel = opsMutation({
  args: { orderId: v.id("orders"), reason: v.string(), refundCharge: v.boolean() },
  handler: async (ctx, { orderId, reason, refundCharge }) => {
    const order = await ctx.db.get(orderId);
    if (!order) throw appError(ErrorCode.NOT_FOUND, "Order not found.");
    const clean = reason.trim();
    await audit(ctx, { actorId: ctx.user._id, action: "order.cancel", targetTable: "orders", targetId: orderId, reason: clean, before: { status: order.status }, after: { status: "cancelled", refundCharge } });
    return await cancelOrder(ctx, order, { actorId: ctx.user._id, reason: clean, refundCharge, byOps: true });
  },
});

/** Customer not answering at the door: ops completes for them, with a reason (05 §2). Audited. */
export const completeOnBehalf = opsMutation({
  args: { orderId: v.id("orders"), reason: v.string() },
  handler: async (ctx, { orderId, reason }) => {
    const order = await ctx.db.get(orderId);
    if (!order) throw appError(ErrorCode.NOT_FOUND, "Order not found.");
    if (order.status !== "arrived") throw appError(ErrorCode.INVALID_TRANSITION, "Only orders at the door can be completed.");
    const clean = reason.trim();
    await audit(ctx, { actorId: ctx.user._id, action: "order.completeOnBehalf", targetTable: "orders", targetId: orderId, reason: clean, before: { status: order.status }, after: { status: "completed" } });
    const credits = await completeOrder(ctx, order, { actorId: ctx.user._id, reason: clean });
    await resolveAlert(ctx, `unavailable:${orderId}`, ctx.user._id);
    return credits;
  },
});

/** What happened to a rejected item after the shopper brought it back. Audited. */
export const setRejectionOutcome = opsMutation({
  args: {
    itemId: v.id("orderItems"),
    outcome: v.union(v.literal("returned_to_trader"), v.literal("staff"), v.literal("discarded")),
    reason: v.string(),
  },
  handler: async (ctx, { itemId, outcome, reason }) => {
    const item = await ctx.db.get(itemId);
    if (!item || item.status !== "rejected") throw appError(ErrorCode.INVALID_INPUT, "Only rejected items get an outcome.");
    await audit(ctx, { actorId: ctx.user._id, action: "item.rejectionOutcome", targetTable: "orderItems", targetId: itemId, reason, before: { outcome: item.rejectionOutcome }, after: { outcome } });
    await ctx.db.patch(itemId, { rejectionOutcome: outcome });
  },
});

/** Credit or debit a customer's wallet by hand. Reason required, audited (05 §5.5). */
export const adjustWallet = opsMutation({
  args: { userId: v.id("users"), amount: v.number(), reason: v.string(), orderId: v.optional(v.id("orders")) },
  handler: async (ctx, { userId, amount, reason, orderId }) => {
    const clean = reason.trim();
    if (clean.length < 3) throw appError(ErrorCode.INVALID_INPUT, "A reason is required.");
    if (!Number.isSafeInteger(amount) || amount === 0) throw appError(ErrorCode.INVALID_INPUT, "Enter an amount.");
    const user = await ctx.db.get(userId);
    if (!user) throw appError(ErrorCode.NOT_FOUND, "User not found.");
    await audit(ctx, { actorId: ctx.user._id, action: "wallet.adjust", targetTable: "users", targetId: userId, reason: clean, before: { balance: user.walletBalance }, after: { balance: user.walletBalance + amount } });
    await postWalletEntry(ctx, {
      userId,
      type: "adjustment",
      amount,
      orderId,
      note: clean,
      createdBy: ctx.user._id,
      // Every ops adjustment is its own entry; Math.random is seeded per mutation in Convex.
      dedupeKey: `adjust:${userId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
    });
    return { balance: user.walletBalance + amount, formatted: formatNaira(user.walletBalance + amount) };
  },
});

/** Withdrawal queue: newest first, failures easy to find. */
export const withdrawals = opsQuery({
  args: { status: v.optional(v.union(v.literal("requested"), v.literal("pending"), v.literal("success"), v.literal("failed"), v.literal("reversed"))) },
  handler: async (ctx, { status }) => {
    const rows = status
      ? await ctx.db
          .query("withdrawals")
          .withIndex("by_status", (q) => q.eq("status", status))
          .order("desc")
          .take(LIST_LIMIT)
      : await ctx.db.query("withdrawals").order("desc").take(LIST_LIMIT);
    return await Promise.all(
      rows.map(async (w) => {
        const user = await ctx.db.get(w.userId);
        return {
          _id: w._id,
          at: w._creationTime,
          amount: w.amount,
          status: w.status,
          name: w.resolvedName,
          account: maskAccount(w.accountNumber),
          customerName: user?.name ?? "Deleted account",
          reference: w.reference,
          failureReason: w.failureReason ?? null,
        };
      }),
    );
  },
});
