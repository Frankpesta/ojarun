import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

type AlertInput = Pick<Doc<"opsAlerts">, "key" | "kind" | "severity" | "message"> & {
  transferId?: Id<"traderTransfers">;
  orderId?: Id<"orders">;
  withdrawalId?: Id<"withdrawals">;
};

async function openAlert(ctx: MutationCtx, key: string) {
  return await ctx.db
    .query("opsAlerts")
    .withIndex("by_key", (q) => q.eq("key", key))
    .filter((q) => q.eq(q.field("resolvedAt"), undefined))
    .first();
}

/**
 * Raises a dashboard alert for ops. One open alert per key: raising it again refreshes the
 * message instead of stacking duplicates. SMS and email delivery arrive with M7.
 */
export async function raiseAlert(ctx: MutationCtx, alert: AlertInput): Promise<Id<"opsAlerts">> {
  console.error({ evt: "ops.alert", kind: alert.kind, key: alert.key, message: alert.message });
  const open = await openAlert(ctx, alert.key);
  if (open) {
    await ctx.db.patch(open._id, { message: alert.message, severity: alert.severity });
    return open._id;
  }
  return await ctx.db.insert("opsAlerts", alert);
}

/** Closes the open alert for a key, e.g. when the balance recovers or a retry succeeds. */
export async function resolveAlert(ctx: MutationCtx, key: string, by?: Id<"users">): Promise<void> {
  const open = await openAlert(ctx, key);
  if (open) await ctx.db.patch(open._id, { resolvedAt: Date.now(), resolvedBy: by });
}
