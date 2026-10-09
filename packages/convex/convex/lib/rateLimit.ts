import type { MutationCtx } from "../_generated/server";
import { appError, ErrorCode } from "./errors";

/**
 * Fixed-window counter (05 §9 M7). Returns the count in the current window after this hit.
 * With `throwOver`, refuses with RATE_LIMITED once the window's budget is spent.
 */
export async function hit(ctx: MutationCtx, key: string, windowMs: number, throwOver?: number): Promise<number> {
  const now = Date.now();
  const row = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  let count = 1;
  if (!row) await ctx.db.insert("rateLimits", { key, windowStart: now, count });
  else if (now - row.windowStart >= windowMs) await ctx.db.patch(row._id, { windowStart: now, count });
  else {
    count = row.count + 1;
    if (throwOver !== undefined && count > throwOver) {
      throw appError(ErrorCode.RATE_LIMITED, "You're doing that too often. Wait a minute and try again.");
    }
    await ctx.db.patch(row._id, { count });
  }
  return count;
}

export const LIMITS = {
  chat: { windowMs: 60_000, max: 30 },
  priceCheck: { windowMs: 10 * 60_000, max: 10 },
  resolveAccount: { windowMs: 10 * 60_000, max: 20 },
  placesSearch: { windowMs: 60_000, max: 60 },
  withdrawal: { windowMs: 60 * 60_000, max: 5 },
} as const;
