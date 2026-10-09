import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

/** Transfers that hold part of an item's budget: sent or on their way. */
export const COMMITTED_TRANSFER: ReadonlySet<Doc<"traderTransfers">["status"]> = new Set(["queued", "pending", "success"]);

/** Most a shopper can pay for an item: its budget plus any extra the customer approved. */
export function itemCap(item: Doc<"orderItems">): number {
  return item.budget + item.approvedExtra;
}

/**
 * Money already committed against an item (05 §6.2): transfers that are queued, pending or
 * successful, plus recorded cash spends. A new payment must fit in `itemCap − total`.
 */
export async function committedSpend(ctx: QueryCtx, itemId: Id<"orderItems">) {
  const [transfers, cash] = await Promise.all([
    ctx.db
      .query("traderTransfers")
      .withIndex("by_item", (q) => q.eq("itemId", itemId))
      .collect(),
    ctx.db
      .query("cashSpends")
      .withIndex("by_item", (q) => q.eq("itemId", itemId))
      .collect(),
  ]);
  const transferTotal = transfers.filter((t) => COMMITTED_TRANSFER.has(t.status)).reduce((s, t) => s + t.amount, 0);
  const cashTotal = cash.reduce((s, c) => s + c.amount, 0);
  return { transfers, cash, transferTotal, cashTotal, total: transferTotal + cashTotal };
}
