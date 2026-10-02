import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { appError, ErrorCode } from "./errors";

/** Every ops change records who did it and why (doc 02 §14). */
export async function audit(
  ctx: MutationCtx,
  entry: {
    actorId: Id<"users">;
    action: string;
    targetTable: string;
    targetId: string;
    reason: string;
    before?: unknown;
    after?: unknown;
  },
): Promise<void> {
  if (!entry.reason.trim()) throw appError(ErrorCode.INVALID_INPUT, "A reason is required.");
  await ctx.db.insert("auditLog", { ...entry, reason: entry.reason.trim(), at: Date.now() });
}
