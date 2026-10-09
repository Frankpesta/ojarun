import { cancellationRefund, formatNaira } from "@ojarun/shared";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { postSystem } from "./chat";
import { appError, ErrorCode } from "./errors";
import { getSettings } from "./settings";
import { transitionOrder } from "./stateMachine";
import { postWalletEntry } from "./wallet";

export const CANCELLABLE = new Set<Doc<"orders">["status"]>(["pending_payment", "paid", "assigned"]);

/**
 * What a cancellation gives back (05 §6.4 step 4). Unpaid orders only return wallet money used at
 * checkout. Paid ones return everything except the Paystack charge, unless ops refunds that too.
 */
export async function refundFor(ctx: QueryCtx, order: Doc<"orders">, refundCharge: boolean) {
  const { refundPaystackChargeOnCancel } = await getSettings(ctx);
  if (order.status === "pending_payment") return { refund: order.totals.walletApplied, chargeRefund: 0, keptCharge: 0 };
  const base = cancellationRefund(order.totals, refundPaystackChargeOnCancel);
  const keptCharge = order.totals.chargeAmount + order.totals.walletApplied - base;
  return refundCharge ? { refund: base, chargeRefund: keptCharge, keptCharge: 0 } : { refund: base, chargeRefund: 0, keptCharge };
}

export async function cancelOrder(
  ctx: MutationCtx,
  order: Doc<"orders">,
  opts: { actorId: Id<"users">; reason: string; refundCharge: boolean; byOps: boolean },
) {
  if (!CANCELLABLE.has(order.status)) {
    throw appError(ErrorCode.INVALID_TRANSITION, "Shopping has started, so this order can't be cancelled.");
  }
  const { refund, chargeRefund } = await refundFor(ctx, order, opts.refundCharge);
  const wasUnpaid = order.status === "pending_payment";
  await transitionOrder(ctx, order, "cancelled", { actorId: opts.actorId });

  const slot = await ctx.db.get(order.slotId);
  if (slot) await ctx.db.patch(slot._id, { reserved: Math.max(0, slot.reserved - 1) });

  // Out of its batch, so the shopper's run no longer shows it.
  const batchId = order.batchId;
  await ctx.db.patch(order._id, { cancelReason: opts.reason, cancelledBy: opts.actorId, batchId: undefined });
  if (batchId) {
    const left = await ctx.db
      .query("orders")
      .withIndex("by_batch", (q) => q.eq("batchId", batchId))
      .first();
    const advance = await ctx.db
      .query("cashAdvances")
      .withIndex("by_batch", (q) => q.eq("batchId", batchId))
      .first();
    if (!left && !advance) await ctx.db.delete(batchId);
  }

  if (wasUnpaid) {
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();
    for (const p of payments) if (p.status === "initialized") await ctx.db.patch(p._id, { status: "abandoned" });
  }
  if (refund > 0) {
    await postWalletEntry(ctx, {
      userId: order.customerId,
      type: "cancellation_refund",
      amount: refund,
      orderId: order._id,
      dedupeKey: `cancel:${order._id}`,
      note: opts.byOps ? opts.reason : "You cancelled this order",
    });
  }
  if (chargeRefund > 0) {
    await postWalletEntry(ctx, {
      userId: order.customerId,
      type: "adjustment",
      amount: chargeRefund,
      orderId: order._id,
      dedupeKey: `cancel_charge:${order._id}`,
      note: `Paystack charge refunded: ${opts.reason}`,
      createdBy: opts.actorId,
    });
  }
  await postSystem(
    ctx,
    order._id,
    opts.byOps ? `OjaRun cancelled this order: ${opts.reason}. ${formatNaira(refund + chargeRefund)} is in your wallet.` : "You cancelled this order",
    `cancel:${order._id}`,
  );
  return { refund: refund + chargeRefund };
}
