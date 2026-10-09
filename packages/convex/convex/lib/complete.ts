import { completionCredits } from "@ojarun/shared";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { postSystem } from "./chat";
import { transitionOrder } from "./stateMachine";
import { postWalletEntry } from "./wallet";

/** Samples kept per item and market; older ones drop off. */
const GUIDE_SAMPLES = 50;

/** Catalogue items share a key; free-text items match on their lower-cased name. */
export function priceGuideKey(item: Pick<Doc<"orderItems">, "catalogItemId" | "name">): string {
  return item.catalogItemId ?? `name:${item.name.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

/** If every order in the batch is finished, the batch is done. */
export async function closeBatchIfDone(ctx: MutationCtx, batchId: Id<"batches"> | undefined): Promise<void> {
  if (!batchId) return;
  const orders = await ctx.db
    .query("orders")
    .withIndex("by_batch", (q) => q.eq("batchId", batchId))
    .collect();
  if (orders.every((o) => o.status === "completed" || o.status === "cancelled")) {
    const batch = await ctx.db.get(batchId);
    if (batch && batch.status !== "done") await ctx.db.patch(batchId, { status: "done" });
  }
}

/**
 * Finishes an accepted order in one mutation (05 §6.4 step 3): completed status, leftover and
 * rejection credits (deduped per order and per item), price-guide samples for kept items, the
 * batch closed when it's the last order, and a closing chat line.
 */
export async function completeOrder(
  ctx: MutationCtx,
  order: Doc<"orders">,
  opts: { actorId: Id<"users">; reason?: string },
): Promise<{ leftover: number; rejection: number }> {
  await transitionOrder(ctx, order, "completed", { actorId: opts.actorId });
  await ctx.db.patch(order._id, { completedBy: opts.actorId, completedReason: opts.reason });

  const items = await ctx.db
    .query("orderItems")
    .withIndex("by_order", (q) => q.eq("orderId", order._id))
    .collect();
  const credits = completionCredits(items, { buffer: order.totals.buffer, bufferUsed: order.bufferUsed });

  if (credits.leftover > 0) {
    await postWalletEntry(ctx, {
      userId: order.customerId,
      type: "leftover_credit",
      amount: credits.leftover,
      orderId: order._id,
      dedupeKey: `leftover:${order._id}`,
      note: "Unspent budget and buffer",
    });
  }
  for (const item of items) {
    if (item.status === "rejected" && item.amountSpent > 0) {
      await postWalletEntry(ctx, {
        userId: order.customerId,
        type: "rejection_credit",
        amount: item.amountSpent,
        orderId: order._id,
        dedupeKey: `reject:${item._id}`,
        note: item.name,
      });
    }
  }

  // Price guide (collected silently, 05 §2): what kept items actually cost at this market.
  const now = Date.now();
  for (const item of items) {
    if ((item.status !== "bought" && item.status !== "adjusted") || item.amountSpent <= 0) continue;
    const itemKey = priceGuideKey(item);
    const sample = { amount: item.amountSpent, quantityNote: item.quantityNote, at: now };
    const row = await ctx.db
      .query("priceGuide")
      .withIndex("by_item_market", (q) => q.eq("itemKey", itemKey).eq("marketId", order.marketId))
      .unique();
    if (row) await ctx.db.patch(row._id, { samples: [...row.samples, sample].slice(-GUIDE_SAMPLES), updatedAt: now });
    else await ctx.db.insert("priceGuide", { itemKey, marketId: order.marketId, samples: [sample], updatedAt: now });
  }

  await closeBatchIfDone(ctx, order.batchId);
  await postSystem(ctx, order._id, opts.reason ? "OjaRun completed this order for you" : "Delivered and accepted. Thank you!", `completed:${order._id}`);
  return { leftover: credits.leftover, rejection: items.filter((i) => i.status === "rejected").reduce((s, i) => s + i.amountSpent, 0) };
}
