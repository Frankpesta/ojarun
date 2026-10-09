import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { opsMutation, opsQuery } from "../lib/auth";
import { requireCallerInAction } from "../lib/actionAuth";
import { audit } from "../lib/audit";
import { appError, ErrorCode } from "../lib/errors";
import { getSettings } from "../lib/settings";
import { transferStatus } from "../schema";
import { orderCode } from "../orders";
import { bankName } from "../traders";

const LIST_LIMIT = 150;

/** Transfer history, newest first, optionally one status (05 §9 M4 ops). */
export const list = opsQuery({
  args: { status: v.optional(transferStatus) },
  handler: async (ctx, { status }) => {
    const rows: Doc<"traderTransfers">[] = status
      ? await ctx.db
          .query("traderTransfers")
          .withIndex("by_status", (q) => q.eq("status", status))
          .order("desc")
          .take(LIST_LIMIT)
      : await ctx.db.query("traderTransfers").order("desc").take(LIST_LIMIT);
    return await Promise.all(
      rows.map(async (t) => {
        const [trader, shopper, item] = await Promise.all([
          ctx.db.get(t.traderId),
          ctx.db.get(t.shopperId),
          ctx.db.get(t.itemId),
        ]);
        return {
          _id: t._id,
          at: t._creationTime,
          amount: t.amount,
          status: t.status,
          reference: t.reference,
          failureReason: t.failureReason ?? null,
          newRecipient: t.newRecipient,
          isRetry: !!t.retryOf,
          orderCode: orderCode(t.orderId),
          itemName: item?.name ?? "Item",
          shopperName: shopper?.name ?? "Shopper",
          trader: trader
            ? {
                _id: trader._id,
                name: trader.resolvedName,
                bankName: await bankName(ctx, trader.bankCode),
                accountNumber: trader.accountNumber,
                review: trader.review ?? null,
              }
            : null,
        };
      }),
    );
  },
});

/** Traders waiting for review (new recipients, partial name matches, blocked) and suspicious ones. */
export const flaggedTraders = opsQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("traders")
      .withIndex("by_flagged", (q) => q.eq("flagged", true))
      .collect();
    return await Promise.all(
      rows
        .sort((a, b) => b.firstSeenAt - a.firstSeenAt)
        .map(async (t) => {
          const market = t.marketId ? await ctx.db.get(t.marketId) : null;
          const transfers = await ctx.db
            .query("traderTransfers")
            .withIndex("by_trader", (q) => q.eq("traderId", t._id))
            .collect();
          const paid = transfers.filter((x) => x.status === "success");
          const shopperIds = [...new Set(transfers.map((x) => x.shopperId))];
          const shoppers = await Promise.all(shopperIds.map((id) => ctx.db.get(id)));
          return {
            _id: t._id,
            name: t.resolvedName,
            bankName: await bankName(ctx, t.bankCode),
            accountNumber: t.accountNumber,
            marketName: market?.name ?? null,
            firstSeenAt: t.firstSeenAt,
            review: t.review ?? "pending",
            flagReason: t.flagReason ?? null,
            paidCount: paid.length,
            paidTotal: paid.reduce((s, x) => s + x.amount, 0),
            blockedCount: transfers.filter((x) => x.status === "blocked").length,
            shoppers: shoppers.map((s) => s?.name ?? "Shopper"),
          };
        }),
    );
  },
});

/** Approve a trader into the registry, or mark them suspicious (which blocks future payments). */
export const reviewTrader = opsMutation({
  args: {
    traderId: v.id("traders"),
    decision: v.union(v.literal("approved"), v.literal("suspicious")),
    reason: v.string(),
  },
  handler: async (ctx, { traderId, decision, reason }) => {
    const t = await ctx.db.get(traderId);
    if (!t) throw appError(ErrorCode.NOT_FOUND, "Trader not found.");
    await audit(ctx, {
      actorId: ctx.user._id,
      action: "trader.review",
      targetTable: "traders",
      targetId: traderId,
      reason,
      before: { review: t.review, flagged: t.flagged },
      after: { review: decision },
    });
    await ctx.db.patch(traderId, {
      review: decision,
      flagged: decision === "suspicious",
      flagReason: decision === "suspicious" ? `Marked suspicious: ${reason.trim()}` : undefined,
      reviewedBy: ctx.user._id,
      reviewedAt: Date.now(),
    });
  },
});

/** Open alerts for the dashboard banner, critical first. */
export const alerts = opsQuery({
  args: {},
  handler: async (ctx) => {
    const open = await ctx.db
      .query("opsAlerts")
      .withIndex("by_resolvedAt", (q) => q.eq("resolvedAt", undefined))
      .collect();
    return open
      .sort((a, b) => Number(a.severity !== "critical") - Number(b.severity !== "critical") || b._creationTime - a._creationTime)
      .map((a) => ({ _id: a._id, kind: a.kind, severity: a.severity, message: a.message, at: a._creationTime }));
  },
});

export const dismissAlert = opsMutation({
  args: { alertId: v.id("opsAlerts") },
  handler: async (ctx, { alertId }) => {
    const a = await ctx.db.get(alertId);
    if (a && !a.resolvedAt) await ctx.db.patch(alertId, { resolvedAt: Date.now(), resolvedBy: ctx.user._id });
  },
});

/** The last Paystack balance check and the alert level, for the Transfers page header. */
export const balance = opsQuery({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("paystackBalance")
      .withIndex("by_key", (q) => q.eq("key", "NGN"))
      .unique();
    const { paystackLowBalanceKobo } = await getSettings(ctx);
    return {
      balance: row?.balance ?? null,
      checkedAt: row?.checkedAt ?? null,
      threshold: paystackLowBalanceKobo,
      configured: !!process.env.PAYSTACK_SECRET_KEY,
    };
  },
});

export const refreshBalance = action({
  args: {},
  handler: async (ctx): Promise<void> => {
    await requireCallerInAction(ctx, ["ops"]);
    await ctx.runAction(internal.transfers.checkBalance, {});
  },
});
