import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireCallerInAction } from "./lib/actionAuth";
import { appError, ErrorCode } from "./lib/errors";
import { transitionOrder } from "./lib/stateMachine";
import { postWalletEntry } from "./lib/wallet";

/**
 * Paystack checkout (05 §6.1). Only the webhook and server-side verification change payment
 * state; the app's "browser closed" callback just asks the server to verify sooner.
 */
const PAYSTACK = "https://api.paystack.co";

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw appError(ErrorCode.UNAVAILABLE, "Payments aren't available right now. Try again shortly.");
  return key;
}

async function paystack(path: string, init: RequestInit = {}): Promise<{ status: boolean; message?: string; data?: unknown }> {
  let res: Response;
  try {
    res = await fetch(`${PAYSTACK}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${secretKey()}`, "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw appError(ErrorCode.UNAVAILABLE, "We couldn't reach Paystack. Check your connection and try again.");
  }
  const body = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: unknown };
  if (!res.ok || !body.status) {
    console.error({ evt: "paystack.error", path: path.split("?")[0], status: res.status, message: body.message });
  }
  return { status: res.ok && !!body.status, message: body.message, data: body.data };
}

/** Starts a payment attempt: a fresh reference per attempt so a retry never reuses a dead one. */
export const startAttempt = internalMutation({
  args: { orderId: v.id("orders"), userId: v.id("users") },
  handler: async (ctx, { orderId, userId }) => {
    const order = await ctx.db.get(orderId);
    if (!order || order.customerId !== userId) throw appError(ErrorCode.NOT_FOUND, "Order not found.");
    if (order.status !== "pending_payment") {
      throw appError(ErrorCode.INVALID_TRANSITION, "This order doesn't need paying.");
    }
    if (order.holdExpiresAt <= Date.now()) {
      throw appError(ErrorCode.SLOT_CLOSED, "This checkout timed out. Go back to your list and try again.");
    }
    const user = (await ctx.db.get(userId))!;
    const attempt = order.paymentAttempts + 1;
    const reference = `ojr_${orderId}_${attempt}`;
    await ctx.db.patch(orderId, { paymentAttempts: attempt, paystackReference: reference });
    await ctx.db.insert("payments", { orderId, reference, amount: order.totals.chargeAmount, status: "initialized" });
    return {
      reference,
      amount: order.totals.chargeAmount,
      email: user.email ?? `${userId}@customers.ojarun.ng`,
    };
  },
});

export const initPayment = action({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }): Promise<{ authorizationUrl: string; reference: string }> => {
    const caller = await requireCallerInAction(ctx, ["customer"]);
    const attempt = await ctx.runMutation(internal.checkout.startAttempt, { orderId, userId: caller._id });
    const res = await paystack("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: attempt.email,
        amount: attempt.amount,
        currency: "NGN",
        reference: attempt.reference,
        callback_url: process.env.PAYSTACK_CALLBACK_URL,
        channels: ["card", "bank", "ussd", "bank_transfer"],
        metadata: { orderId },
      }),
    });
    const data = res.data as { authorization_url?: string } | undefined;
    if (!res.status || !data?.authorization_url) {
      throw appError(ErrorCode.UNAVAILABLE, "We couldn't start the payment. Try again.");
    }
    console.log({ evt: "payment.init", orderId, reference: attempt.reference });
    return { authorizationUrl: data.authorization_url, reference: attempt.reference };
  },
});

export const ownsReference = internalQuery({
  args: { reference: v.string(), userId: v.id("users") },
  handler: async (ctx, { reference, userId }) => {
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_reference", (q) => q.eq("reference", reference))
      .unique();
    if (!payment) return false;
    const order = await ctx.db.get(payment.orderId);
    return order?.customerId === userId;
  },
});

/** Fast path when the payment browser closes. Same checks as the webhook path. */
export const verifyAndApply = action({
  args: { reference: v.string() },
  handler: async (ctx, { reference }): Promise<string> => {
    const caller = await requireCallerInAction(ctx, ["customer"]);
    if (!(await ctx.runQuery(internal.checkout.ownsReference, { reference, userId: caller._id }))) {
      throw appError(ErrorCode.NOT_FOUND, "Payment not found.");
    }
    return await ctx.runAction(internal.checkout.verifyReference, { reference });
  },
});

type VerifyData = { status?: string; amount?: number; currency?: string; reference?: string; paid_at?: string; channel?: string };

/** Asks Paystack what happened to a reference and applies the result. Returns Paystack's status. */
export const verifyReference = internalAction({
  args: { reference: v.string() },
  handler: async (ctx, { reference }): Promise<string> => {
    const res = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
    const data = res.data as VerifyData | undefined;
    if (!res.status || !data?.status) return "unknown";
    if (data.status === "success") {
      await ctx.runMutation(internal.checkout.markPaid, {
        reference,
        amount: data.amount ?? -1,
        currency: data.currency ?? "",
        paidAt: data.paid_at ? Date.parse(data.paid_at) : Date.now(),
        channel: data.channel,
      });
    } else if (data.status === "failed" || data.status === "abandoned") {
      await ctx.runMutation(internal.checkout.markAttemptEnded, { reference, status: data.status });
    }
    return data.status;
  },
});

export const markAttemptEnded = internalMutation({
  args: { reference: v.string(), status: v.union(v.literal("failed"), v.literal("abandoned")) },
  handler: async (ctx, { reference, status }) => {
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_reference", (q) => q.eq("reference", reference))
      .unique();
    if (payment?.status === "initialized") await ctx.db.patch(payment._id, { status });
  },
});

/**
 * Applies a verified successful charge (05 §6.1 steps 6–7). Idempotent: a repeat does nothing.
 * The amount must match the order exactly. A payment that lands after the order expired is kept
 * as wallet credit for the customer and flagged for ops.
 */
export const markPaid = internalMutation({
  args: {
    reference: v.string(),
    amount: v.number(),
    currency: v.string(),
    paidAt: v.number(),
    channel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_reference", (q) => q.eq("reference", args.reference))
      .unique();
    if (!payment) {
      console.error({ evt: "payment.unknown_reference", reference: args.reference });
      return "unknown";
    }
    if (payment.status === "success") return "duplicate";
    const order = (await ctx.db.get(payment.orderId))!;
    if (args.currency !== "NGN" || args.amount !== payment.amount || payment.amount !== order.totals.chargeAmount) {
      console.error({ evt: "payment.amount_mismatch", orderId: order._id, reference: args.reference, amount: args.amount, expected: order.totals.chargeAmount });
      return "rejected";
    }

    await ctx.db.patch(payment._id, { status: "success", paidAt: args.paidAt, channel: args.channel });
    if (order.status === "pending_payment") {
      await transitionOrder(ctx, order, "paid");
      console.log({ evt: "payment.paid", orderId: order._id, reference: args.reference });
      return "paid";
    }

    // Paid after the order expired or was cancelled, or a second attempt also succeeded.
    await postWalletEntry(ctx, {
      userId: order.customerId,
      type: "adjustment",
      amount: args.amount,
      dedupeKey: `late_payment:${args.reference}`,
      orderId: order._id,
      note: "Late payment kept as wallet credit (order was no longer awaiting payment).",
    });
    console.error({ evt: "payment.late", orderId: order._id, reference: args.reference, orderStatus: order.status });
    return "credited";
  },
});

/** Every 5 min (05 §5.6): verify stale unpaid orders with Paystack before expiring them. */
export const expireStale = internalAction({
  args: {},
  handler: async (ctx) => {
    const stale = await ctx.runQuery(internal.orders.staleUnpaid, { now: Date.now() });
    for (const { orderId, references } of stale) {
      let paid = false;
      for (const reference of references) {
        try {
          if ((await ctx.runAction(internal.checkout.verifyReference, { reference })) === "success") paid = true;
        } catch (e) {
          // Paystack unreachable: leave the order for the next sweep rather than expiring a possible payment.
          console.error({ evt: "expire.verify_failed", orderId, reference, error: String(e) });
          paid = true;
        }
      }
      if (!paid) await ctx.runMutation(internal.orders.expire, { orderId });
    }
  },
});

/** Webhook dedupe (05 §6.1 step 5). Returns false when this event was already handled. */
export const recordWebhook = internalMutation({
  args: { key: v.string(), event: v.string() },
  handler: async (ctx, { key, event }) => {
    const seen = await ctx.db
      .query("webhookEvents")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (seen) return false;
    await ctx.db.insert("webhookEvents", { key, event, receivedAt: Date.now() });
    return true;
  },
});
