import type { Infer } from "convex/values";
import { assertKobo } from "@ojarun/shared";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { walletEntryType } from "../schema";
import { appError, ErrorCode } from "./errors";

type WalletEntryType = Infer<typeof walletEntryType>;

const DEBIT_TYPES: ReadonlySet<WalletEntryType> = new Set([
  "checkout_debit",
  "price_check_debit",
  "withdrawal_debit",
]);

/**
 * The only writer of walletEntries and users.walletBalance (05 §1.6). Idempotent on dedupeKey:
 * a repeated key returns the existing entry and changes nothing.
 */
export async function postWalletEntry(
  ctx: MutationCtx,
  entry: {
    userId: Id<"users">;
    type: WalletEntryType;
    amount: number;
    dedupeKey: string;
    orderId?: Id<"orders">;
    withdrawalId?: Id<"withdrawals">;
    note?: string;
    createdBy?: Id<"users">;
  },
): Promise<Doc<"walletEntries">> {
  assertKobo(entry.amount, "wallet amount");
  if (entry.amount === 0) throw appError(ErrorCode.INVALID_INPUT, "Wallet entries can't be zero.");
  if (DEBIT_TYPES.has(entry.type) && entry.amount > 0) {
    throw appError(ErrorCode.INVALID_INPUT, `${entry.type} must be negative.`);
  }
  if (!DEBIT_TYPES.has(entry.type) && entry.type !== "adjustment" && entry.amount < 0) {
    throw appError(ErrorCode.INVALID_INPUT, `${entry.type} must be positive.`);
  }
  if (entry.type === "adjustment" && !entry.note?.trim()) {
    throw appError(ErrorCode.INVALID_INPUT, "Adjustments need a reason.");
  }

  const existing = await ctx.db
    .query("walletEntries")
    .withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", entry.dedupeKey))
    .unique();
  if (existing) return existing;

  const user = await ctx.db.get(entry.userId);
  if (!user) throw appError(ErrorCode.NOT_FOUND, "User not found.");
  const next = user.walletBalance + entry.amount;
  if (next < 0) throw appError(ErrorCode.INSUFFICIENT_BALANCE, "Not enough in your wallet.");

  const id = await ctx.db.insert("walletEntries", entry);
  await ctx.db.patch(user._id, { walletBalance: next });
  return (await ctx.db.get(id))!;
}

/** Recompute a balance from the ledger. Used by the nightly invariant check and tests. */
export async function ledgerBalance(ctx: MutationCtx, userId: Id<"users">): Promise<number> {
  const entries = await ctx.db
    .query("walletEntries")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return entries.reduce((sum, e) => sum + e.amount, 0);
}
