import { v } from "convex/values";
import { formatNaira, roundUpTo } from "@ojarun/shared";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { opsMutation, opsQuery } from "../lib/auth";
import { audit } from "../lib/audit";
import { appError, ErrorCode } from "../lib/errors";
import { getSettings } from "../lib/settings";
import { advanceSpent } from "../cash";
import { orderCode } from "../orders";

/** Advances are suggested in whole ₦1,000s, since they're handed over as notes. */
const SUGGEST_ROUND = 1_000_00;

export function suggestedAdvance(orders: Doc<"orders">[], pct: number): number {
  const budgets = orders.reduce((s, o) => s + o.totals.budgets, 0);
  return roundUpTo(Math.ceil((budgets * pct) / 100), SUGGEST_ROUND);
}

/** The batch's cash advance at a glance, for the dispatch board. */
export async function cashSummary(ctx: QueryCtx, batchId: Id<"batches">, orders: Doc<"orders">[], pct: number) {
  const advances = await ctx.db
    .query("cashAdvances")
    .withIndex("by_batch", (q) => q.eq("batchId", batchId))
    .collect();
  const a = advances.sort((x, y) => y.issuedAt - x.issuedAt)[0];
  return {
    suggested: suggestedAdvance(orders, pct),
    advance: a
      ? {
          _id: a._id,
          amount: a.amount,
          status: a.status,
          receivedAt: a.receivedAt ?? null,
          spent: await advanceSpent(ctx, a._id),
          returnedAmount: a.returnedAmount ?? null,
          variance: a.variance ?? null,
          note: a.note ?? null,
        }
      : null,
  };
}

/** Every cash spend on a batch's advance, with the trader photos, for checking at reconcile. */
export const forBatch = opsQuery({
  args: { batchId: v.id("batches") },
  handler: async (ctx, { batchId }) => {
    const advances = await ctx.db
      .query("cashAdvances")
      .withIndex("by_batch", (q) => q.eq("batchId", batchId))
      .collect();
    const out = [];
    for (const a of advances.sort((x, y) => y.issuedAt - x.issuedAt)) {
      const spends = await ctx.db
        .query("cashSpends")
        .withIndex("by_advance", (q) => q.eq("advanceId", a._id))
        .collect();
      out.push({
        _id: a._id,
        amount: a.amount,
        status: a.status,
        issuedAt: a.issuedAt,
        receivedAt: a.receivedAt ?? null,
        returnedAmount: a.returnedAmount ?? null,
        variance: a.variance ?? null,
        note: a.note ?? null,
        spends: await Promise.all(
          spends
            .sort((x, y) => x.at - y.at)
            .map(async (s) => {
              const item = await ctx.db.get(s.itemId);
              return {
                _id: s._id,
                amount: s.amount,
                at: s.at,
                traderLabel: s.traderLabel ?? null,
                itemName: item?.name ?? "Item",
                orderCode: orderCode(s.orderId),
                traderPhotoUrl: await ctx.storage.getUrl(s.traderPhotoId),
                itemPhotoUrl: item?.photoStorageId ? await ctx.storage.getUrl(item.photoStorageId) : null,
              };
            }),
        ),
      });
    }
    return out;
  },
});

/** Hands the batch's shopper cash for cash-only traders (05 §6.5 step 1). One open advance per batch. */
export const issueAdvance = opsMutation({
  args: { batchId: v.id("batches"), amount: v.number(), reason: v.optional(v.string()) },
  handler: async (ctx, { batchId, amount, reason }) => {
    if (!Number.isSafeInteger(amount) || amount <= 0) throw appError(ErrorCode.INVALID_INPUT, "Enter the cash amount.");
    const batch = await ctx.db.get(batchId);
    if (!batch) throw appError(ErrorCode.NOT_FOUND, "Batch not found.");
    if (!batch.shopperId || (batch.status !== "assigned" && batch.status !== "in_progress")) {
      throw appError(ErrorCode.INVALID_INPUT, "Confirm the batch with a shopper before issuing cash.");
    }
    const existing = await ctx.db
      .query("cashAdvances")
      .withIndex("by_batch", (q) => q.eq("batchId", batchId))
      .collect();
    if (existing.some((a) => a.status === "issued")) {
      throw appError(ErrorCode.INVALID_INPUT, "This batch already has cash out. Reconcile it first.");
    }
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_batch", (q) => q.eq("batchId", batchId))
      .collect();
    const budgets = orders.reduce((s, o) => s + o.totals.budgets, 0);
    if (amount > budgets) {
      throw appError(ErrorCode.INVALID_INPUT, `That's more than the batch's item budgets (${formatNaira(budgets)}).`);
    }
    const { cashAdvanceSuggestPct } = await getSettings(ctx);
    const suggested = suggestedAdvance(orders, cashAdvanceSuggestPct);
    const id = await ctx.db.insert("cashAdvances", {
      batchId,
      shopperId: batch.shopperId,
      amount,
      issuedBy: ctx.user._id,
      issuedAt: Date.now(),
      status: "issued",
    });
    await audit(ctx, {
      actorId: ctx.user._id,
      action: "cash.issueAdvance",
      targetTable: "cashAdvances",
      targetId: id,
      reason: reason?.trim() || `Cash advance for the batch (suggested ${formatNaira(suggested)}).`,
      after: { amount, shopperId: batch.shopperId },
    });
    return id;
  },
});

/**
 * End of the run (05 §6.5 step 4): ops counts the cash handed back. variance = advance − spends −
 * returned. Anything but zero needs a note and flags the advance as disputed on the shopper.
 */
export const reconcile = opsMutation({
  args: { advanceId: v.id("cashAdvances"), returnedAmount: v.number(), note: v.optional(v.string()) },
  handler: async (ctx, { advanceId, returnedAmount, note }) => {
    if (!Number.isSafeInteger(returnedAmount) || returnedAmount < 0) {
      throw appError(ErrorCode.INVALID_INPUT, "Enter the cash handed back (₦0 if none).");
    }
    const a = await ctx.db.get(advanceId);
    if (!a) throw appError(ErrorCode.NOT_FOUND, "Cash advance not found.");
    if (a.status !== "issued") throw appError(ErrorCode.INVALID_TRANSITION, "This advance is already reconciled.");
    const spent = await advanceSpent(ctx, advanceId);
    const variance = a.amount - spent - returnedAmount;
    const cleanNote = note?.trim();
    if (variance !== 0 && (!cleanNote || cleanNote.length < 3)) {
      throw appError(
        ErrorCode.INVALID_INPUT,
        variance > 0
          ? `${formatNaira(variance)} is missing. Add a note on what the shopper said.`
          : `${formatNaira(-variance)} more came back than expected. Add a note.`,
      );
    }
    const status = variance === 0 ? "reconciled" : "disputed";
    await ctx.db.patch(advanceId, {
      returnedAmount,
      variance,
      status,
      reconciledBy: ctx.user._id,
      note: cleanNote || undefined,
    });
    await audit(ctx, {
      actorId: ctx.user._id,
      action: "cash.reconcile",
      targetTable: "cashAdvances",
      targetId: advanceId,
      reason: cleanNote || "Balanced",
      before: { status: a.status },
      after: { returnedAmount, spent, variance, status },
    });
    return { spent, variance, status };
  },
});
