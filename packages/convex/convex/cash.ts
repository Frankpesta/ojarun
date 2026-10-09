import { v } from "convex/values";
import { formatNaira } from "@ojarun/shared";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { shopperMutation, shopperQuery } from "./lib/auth";
import { appError, ErrorCode } from "./lib/errors";
import { committedSpend, itemCap } from "./lib/spend";
import { itemForShopping } from "./items";

/**
 * Cash for traders who won't take a transfer (05 §6.5). Ops hands the shopper an advance per
 * batch; the shopper confirms they got it, then records each cash spend with a photo of the
 * trader. Cash counts towards amountSpent straight away, since there's no bank to confirm it.
 */

/** The advance on a batch that the shopper can still spend from, if any. */
export async function openAdvance(ctx: QueryCtx, batchId: Id<"batches">, shopperId: Id<"users">) {
  const rows = await ctx.db
    .query("cashAdvances")
    .withIndex("by_batch", (q) => q.eq("batchId", batchId))
    .collect();
  return rows.find((a) => a.shopperId === shopperId && a.status === "issued") ?? null;
}

export async function advanceSpent(ctx: QueryCtx, advanceId: Id<"cashAdvances">) {
  const spends = await ctx.db
    .query("cashSpends")
    .withIndex("by_advance", (q) => q.eq("advanceId", advanceId))
    .collect();
  return spends.reduce((s, c) => s + c.amount, 0);
}

/** The shopper's cash for a market run: how much, whether they've confirmed it, what's left. */
export const myAdvance = shopperQuery({
  args: { batchId: v.id("batches") },
  handler: async (ctx, { batchId }) => {
    const a = await openAdvance(ctx, batchId, ctx.user._id);
    if (!a) return null;
    const spent = await advanceSpent(ctx, a._id);
    return {
      _id: a._id,
      amount: a.amount,
      issuedAt: a.issuedAt,
      receivedAt: a.receivedAt ?? null,
      spent,
      left: a.amount - spent,
    };
  },
});

/** "I've received the cash". Timestamped once; tapping again changes nothing. */
export const confirmReceipt = shopperMutation({
  args: { advanceId: v.id("cashAdvances") },
  handler: async (ctx, { advanceId }) => {
    const a = await ctx.db.get(advanceId);
    if (!a || a.shopperId !== ctx.user._id) throw appError(ErrorCode.NOT_FOUND, "Cash advance not found.");
    if (a.status !== "issued") throw appError(ErrorCode.INVALID_TRANSITION, "This cash advance is already closed.");
    if (!a.receivedAt) await ctx.db.patch(advanceId, { receivedAt: Date.now() });
  },
});

/**
 * Records cash handed to a trader. Same checks as a transfer (photo first, within the item's
 * budget), plus the cash must fit in what's left of the advance. Idempotent on clientRequestId.
 */
export const recordCashSpend = shopperMutation({
  args: {
    clientRequestId: v.string(),
    itemId: v.id("orderItems"),
    amount: v.number(),
    traderPhotoId: v.id("_storage"),
    traderLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!/^[A-Za-z0-9-]{8,64}$/.test(args.clientRequestId)) throw appError(ErrorCode.INVALID_INPUT, "Bad request id.");
    const seen = await ctx.db
      .query("cashSpends")
      .withIndex("by_clientRequestId", (q) => q.eq("clientRequestId", args.clientRequestId))
      .unique();
    if (seen) {
      if (seen.shopperId !== ctx.user._id) throw appError(ErrorCode.INVALID_INPUT, "Bad request id.");
      return seen._id;
    }

    const item = await itemForShopping(ctx, ctx.user, args.itemId);
    const order = (await ctx.db.get(item.orderId))!;
    if (!Number.isSafeInteger(args.amount) || args.amount <= 0) throw appError(ErrorCode.INVALID_INPUT, "Enter the amount you paid.");
    if (item.status === "skipped") throw appError(ErrorCode.INVALID_INPUT, "This item is marked not available.");
    if (!item.photoStorageId) throw appError(ErrorCode.INVALID_INPUT, "Take a photo of the item before paying.");
    if (args.traderPhotoId === item.photoStorageId) {
      throw appError(ErrorCode.INVALID_INPUT, "Take a separate photo of the trader and their stall.");
    }
    const meta = await ctx.db.system.get(args.traderPhotoId);
    if (!meta || (meta.contentType && !meta.contentType.startsWith("image/"))) {
      throw appError(ErrorCode.INVALID_INPUT, "The trader photo didn't upload. Try again.");
    }

    const advance = order.batchId ? await openAdvance(ctx, order.batchId, ctx.user._id) : null;
    if (!advance) throw appError(ErrorCode.INVALID_INPUT, "You don't have cash for this run. Call ops.");
    if (!advance.receivedAt) throw appError(ErrorCode.INVALID_INPUT, "Confirm you've received the cash first.");
    const cashLeft = advance.amount - (await advanceSpent(ctx, advance._id));
    if (args.amount > cashLeft) {
      throw appError(ErrorCode.INVALID_INPUT, `You only have ${formatNaira(Math.max(0, cashLeft))} of cash left.`);
    }
    const spend = await committedSpend(ctx, item._id);
    const left = itemCap(item) - spend.total;
    if (args.amount > left) {
      throw appError(
        ErrorCode.INVALID_INPUT,
        left > 0
          ? `That's more than this item's budget. You can pay up to ${formatNaira(left)}.`
          : "This item's budget is used up. Send the customer a price check for more.",
      );
    }

    const label = args.traderLabel?.trim().replace(/\s+/g, " ").slice(0, 80) || undefined;
    const id = await ctx.db.insert("cashSpends", {
      advanceId: advance._id,
      orderId: order._id,
      itemId: item._id,
      shopperId: ctx.user._id,
      amount: args.amount,
      traderPhotoId: args.traderPhotoId,
      traderLabel: label,
      clientRequestId: args.clientRequestId,
      at: Date.now(),
    });
    await ctx.db.patch(item._id, { amountSpent: item.amountSpent + args.amount });
    return id;
  },
});
