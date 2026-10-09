import { v } from "convex/values";
import { formatNaira } from "@ojarun/shared";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { customerMutation, customerQuery, shopperMutation, shopperQuery } from "./lib/auth";
import { postSystem } from "./lib/chat";
import { notifyUser } from "./lib/notify";
import { hit, LIMITS } from "./lib/rateLimit";
import { appError, ErrorCode } from "./lib/errors";
import { getSettings } from "./lib/settings";
import { itemCap } from "./lib/spend";
import { postWalletEntry } from "./lib/wallet";
import { itemForShopping } from "./items";

/**
 * Price checks (05 §6.3). The shopper asks for extra when an item costs more than its budget;
 * the customer approves (paid from leftover buffer, then wallet) or keeps the budget. No answer
 * within the timeout means "buy within budget".
 */

const GETS_MAX = 140;

const firstName = (u: Doc<"users"> | null, fallback: string) => u?.name?.split(/\s+/)[0] ?? fallback;

export const send = shopperMutation({
  args: {
    clientRequestId: v.string(),
    itemId: v.id("orderItems"),
    /** Today's price for what the customer asked for. */
    quoted: v.number(),
    /** What the budget buys instead, e.g. "about 1½ paint rubbers". */
    budgetGets: v.string(),
    extraRequested: v.number(),
  },
  handler: async (ctx, args) => {
    if (!/^[A-Za-z0-9-]{8,64}$/.test(args.clientRequestId)) throw appError(ErrorCode.INVALID_INPUT, "Bad request id.");
    const seen = await ctx.db
      .query("messages")
      .withIndex("by_clientRequestId", (q) => q.eq("clientRequestId", args.clientRequestId))
      .first();
    if (seen) return seen._id;

    const item = await itemForShopping(ctx, ctx.user, args.itemId);
    await hit(ctx, `priceCheck:${ctx.user._id}`, LIMITS.priceCheck.windowMs, LIMITS.priceCheck.max);
    const cap = itemCap(item);
    for (const [n, label] of [[args.quoted, "today's price"], [args.extraRequested, "the extra"]] as const) {
      if (!Number.isSafeInteger(n) || n <= 0) throw appError(ErrorCode.INVALID_INPUT, `Enter ${label}.`);
    }
    if (args.quoted <= cap) {
      throw appError(ErrorCode.INVALID_INPUT, `That's within the ${formatNaira(cap)} budget. Just buy it.`);
    }
    if (args.extraRequested > args.quoted - cap) {
      throw appError(ErrorCode.INVALID_INPUT, `Ask for at most ${formatNaira(args.quoted - cap)} extra (today's price minus the budget).`);
    }
    const budgetGets = args.budgetGets.trim().replace(/\s+/g, " ");
    if (budgetGets.length < 3) throw appError(ErrorCode.INVALID_INPUT, "Say what the budget gets instead.");
    if (budgetGets.length > GETS_MAX) throw appError(ErrorCode.INVALID_INPUT, `Keep it under ${GETS_MAX} characters.`);
    if (item.status === "skipped") throw appError(ErrorCode.INVALID_INPUT, "This item is marked not available.");

    const pending = await ctx.db
      .query("messages")
      .withIndex("by_item_state", (q) => q.eq("priceCheck.itemId", item._id).eq("priceCheck.state", "pending"))
      .first();
    if (pending) throw appError(ErrorCode.INVALID_INPUT, "You're already waiting on a price check for this item.");

    const { priceCheckTimeoutSec } = await getSettings(ctx);
    const expiresAt = Date.now() + priceCheckTimeoutSec * 1000;
    const messageId = await ctx.db.insert("messages", {
      orderId: item.orderId,
      senderId: ctx.user._id,
      type: "price_check",
      clientRequestId: args.clientRequestId,
      priceCheck: {
        itemId: item._id,
        budget: cap,
        quoted: args.quoted,
        budgetGets,
        extraRequested: args.extraRequested,
        state: "pending",
        expiresAt,
      },
    });
    await ctx.scheduler.runAt(expiresAt, internal.priceChecks.timeout, { messageId });
    const order = (await ctx.db.get(item.orderId))!;
    await notifyUser(ctx, order.customerId, {
      event: "price_check",
      title: `${item.name} costs more today`,
      body: `${firstName(ctx.user, "Your shopper")} asks for ${formatNaira(args.extraRequested)} more. Answer in ${Math.round(priceCheckTimeoutSec / 60)} minutes or they'll buy within your budget.`,
      url: `/chat/${order._id}`,
      orderId: order._id,
      sms: true,
      dedupeKey: `price_check:${messageId}`,
    });
    return messageId;
  },
});

async function settle(ctx: MutationCtx, message: Doc<"messages">, state: "buy_within_budget" | "timed_out") {
  const pc = message.priceCheck!;
  await ctx.db.patch(message._id, { priceCheck: { ...pc, state, respondedAt: Date.now() } });
  const [item, order] = await Promise.all([ctx.db.get(pc.itemId), ctx.db.get(message.orderId)]);
  const shopper = order?.shopperId ? await ctx.db.get(order.shopperId) : null;
  const name = item?.name ?? "this item";
  const body =
    state === "timed_out"
      ? `No answer in time, so ${firstName(shopper, "your shopper")} will buy ${formatNaira(pc.budget)} worth of ${name}: ${pc.budgetGets}.`
      : `${name} costs more today, so ${firstName(shopper, "your shopper")} will buy ${formatNaira(pc.budget)} worth: ${pc.budgetGets}.`;
  await postSystem(ctx, message.orderId, body, `pc:${message._id}`);
  if (order?.shopperId) {
    await notifyUser(ctx, order.shopperId, {
      event: "price_check_answered",
      title: state === "timed_out" ? `No answer on ${name}` : `Keep ${name} within budget`,
      body: `Buy ${formatNaira(pc.budget)} worth: ${pc.budgetGets}.`,
      url: `/chat/${message.orderId}`,
      dedupeKey: `pc_answer:${message._id}`,
    });
  }
}

/** The customer's answer. Approving pays from leftover buffer first, then the wallet, atomically. */
export const respond = customerMutation({
  args: { messageId: v.id("messages"), decision: v.union(v.literal("approve"), v.literal("within_budget")) },
  handler: async (ctx, { messageId, decision }) => {
    const message = await ctx.db.get(messageId);
    const order = message ? await ctx.db.get(message.orderId) : null;
    if (!message?.priceCheck || !order || order.customerId !== ctx.user._id) {
      throw appError(ErrorCode.NOT_FOUND, "Price check not found.");
    }
    const pc = message.priceCheck;
    // Already answered (a replay or a second tap) or timed out: report the state, change nothing.
    if (pc.state !== "pending") return pc.state;
    if (Date.now() >= pc.expiresAt) {
      // The scheduled timeout hasn't run yet; settle it now. Returned, not thrown, so it sticks.
      await settle(ctx, message, "timed_out");
      return "timed_out";
    }
    if (order.status !== "shopping") throw appError(ErrorCode.INVALID_TRANSITION, "Shopping has finished for this order.");

    if (decision === "within_budget") {
      await settle(ctx, message, "buy_within_budget");
      return "buy_within_budget";
    }

    const item = (await ctx.db.get(pc.itemId))!;
    const extra = pc.extraRequested;
    const bufferLeft = order.totals.buffer - order.bufferUsed;
    if (bufferLeft + ctx.user.walletBalance < extra) {
      throw appError(ErrorCode.INSUFFICIENT_BALANCE, "There isn't enough left in your buffer and wallet for that.");
    }
    const fromBuffer = Math.min(extra, bufferLeft);
    const fromWallet = extra - fromBuffer;
    if (fromWallet > 0) {
      await postWalletEntry(ctx, {
        userId: ctx.user._id,
        type: "price_check_debit",
        amount: -fromWallet,
        orderId: order._id,
        dedupeKey: `pc:${messageId}`,
        note: `Extra for ${item.name}`,
      });
    }
    if (fromBuffer > 0) await ctx.db.patch(order._id, { bufferUsed: order.bufferUsed + fromBuffer });
    await ctx.db.patch(item._id, { approvedExtra: item.approvedExtra + extra });
    await ctx.db.patch(messageId, { priceCheck: { ...pc, state: "approved", respondedAt: Date.now() } });
    await postSystem(
      ctx,
      order._id,
      `${firstName(ctx.user, "The customer")} approved ${formatNaira(extra)} extra for ${item.name}. The budget is now ${formatNaira(itemCap(item) + extra)}.`,
      `pc:${messageId}`,
    );
    if (order.shopperId) {
      await notifyUser(ctx, order.shopperId, {
        event: "price_check_answered",
        title: `${item.name}: ${formatNaira(extra)} extra approved`,
        body: `You can now pay up to ${formatNaira(itemCap(item) + extra)} for it.`,
        url: `/chat/${order._id}`,
        dedupeKey: `pc_answer:${messageId}`,
      });
    }
    return "approved";
  },
});

/** Scheduled at expiresAt. Does nothing unless the check is still pending. */
export const timeout = internalMutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const message = await ctx.db.get(messageId);
    if (message?.priceCheck?.state !== "pending") return;
    await settle(ctx, message, "timed_out");
  },
});

/** The newest price check on an item, for the shopper's item screen. */
export const latestForItem = shopperQuery({
  args: { itemId: v.id("orderItems") },
  handler: async (ctx, { itemId }) => {
    const item = await ctx.db.get(itemId);
    const order = item ? await ctx.db.get(item.orderId) : null;
    if (!item || !order || order.shopperId !== ctx.user._id) return null;
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .filter((q) => q.eq(q.field("type"), "price_check"))
      .collect();
    const latest = rows.filter((m) => m.priceCheck?.itemId === itemId).at(-1);
    return latest?.priceCheck ? { _id: latest._id, ...latest.priceCheck } : null;
  },
});

/** Price checks waiting on the customer, for the banner on their order screen. */
export const pendingForOrder = customerQuery({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const order = await ctx.db.get(orderId);
    if (!order || order.customerId !== ctx.user._id) return [];
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .filter((q) => q.eq(q.field("type"), "price_check"))
      .collect();
    const out = [];
    for (const m of rows) {
      if (m.priceCheck?.state !== "pending" || m.priceCheck.expiresAt <= Date.now()) continue;
      const item = await ctx.db.get(m.priceCheck.itemId);
      out.push({ _id: m._id, itemName: item?.name ?? "An item", extraRequested: m.priceCheck.extraRequested, expiresAt: m.priceCheck.expiresAt });
    }
    return out;
  },
});
