import { v } from "convex/values";
import { formatNaira, maskAccount, nameTokens } from "@ojarun/shared";
import { action, internalMutation, type QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { opsMutation, opsQuery } from "../lib/auth";
import { requireCallerInAction } from "../lib/actionAuth";
import { raiseAlert } from "../lib/alerts";
import { audit } from "../lib/audit";
import { appError, ErrorCode } from "../lib/errors";
import { bankName } from "../traders";

/**
 * Fraud signals for the shopper's row (05 §6.5 step 5): their share of spend paid in cash,
 * the most times one cash amount repeats, and reconciled advances that didn't balance.
 */
async function moneySignals(ctx: QueryCtx, shopperId: Id<"users">) {
  const [transfers, cash, disputed] = await Promise.all([
    ctx.db
      .query("traderTransfers")
      .withIndex("by_shopper", (q) => q.eq("shopperId", shopperId))
      .collect(),
    ctx.db
      .query("cashSpends")
      .withIndex("by_shopper", (q) => q.eq("shopperId", shopperId))
      .collect(),
    ctx.db
      .query("cashAdvances")
      .withIndex("by_shopper_status", (q) => q.eq("shopperId", shopperId).eq("status", "disputed"))
      .collect(),
  ]);
  const transferTotal = transfers.filter((t) => t.status === "success").reduce((s, t) => s + t.amount, 0);
  const cashTotal = cash.reduce((s, c) => s + c.amount, 0);
  const counts = new Map<number, number>();
  for (const c of cash) counts.set(c.amount, (counts.get(c.amount) ?? 0) + 1);
  return {
    transferTotal,
    cashTotal,
    cashSharePct: transferTotal + cashTotal > 0 ? Math.round((cashTotal / (transferTotal + cashTotal)) * 100) : 0,
    maxRepeatedCashAmount: Math.max(0, ...counts.values()),
    blockedTransfers: transfers.filter((t) => t.status === "blocked").length,
    varianceCount: disputed.length,
    varianceTotal: disputed.reduce((s, a) => s + (a.variance ?? 0), 0),
  };
}

/** Every shopper with their profile and whether they're on shift. */
export const list = opsQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "shopper"))
      .collect();
    const out = [];
    for (const u of users) {
      const profile = await ctx.db
        .query("shopperProfiles")
        .withIndex("by_user", (q) => q.eq("userId", u._id))
        .unique();
      out.push({
        _id: u._id,
        name: u.name ?? null,
        phone: u.phone ?? null,
        email: u.email ?? null,
        status: u.status,
        legalName: profile?.legalName ?? null,
        active: profile?.active ?? false,
        onShift: profile?.onShift ?? false,
        lastLocation: profile?.lastLocation ?? null,
        bankAccounts: await Promise.all(
          (profile?.bankAccounts ?? []).map(async (a) => ({ ...a, bankName: await bankName(ctx, a.bankCode) })),
        ),
        money: await moneySignals(ctx, u._id),
      });
    }
    return out.sort(
      (a, b) => Number(b.onShift) - Number(a.onShift) || (a.legalName ?? "").localeCompare(b.legalName ?? ""),
    );
  },
});

/**
 * Makes an existing account a shopper (05 §5.2). The legal name must match their bank account:
 * it's what trader transfers are checked against to block a shopper paying themselves. Audited.
 */
export const createShopper = opsMutation({
  args: { userId: v.id("users"), legalName: v.string(), reason: v.string() },
  handler: async (ctx, { userId, legalName, reason }) => {
    const target = await ctx.db.get(userId);
    if (!target) throw appError(ErrorCode.NOT_FOUND, "User not found.");
    if (target.role === "ops") throw appError(ErrorCode.INVALID_INPUT, "Ops accounts can't also be shoppers.");
    const name = legalName.trim().replace(/\s+/g, " ");
    const tokens = nameTokens(name);
    if (tokens.length < 2) {
      throw appError(
        ErrorCode.INVALID_INPUT,
        "Enter the shopper's full legal name, as it appears on their bank account.",
      );
    }

    const profile = await ctx.db
      .query("shopperProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    await audit(ctx, {
      actorId: ctx.user._id,
      action: "shopper.create",
      targetTable: "users",
      targetId: userId,
      reason,
      before: { role: target.role, legalName: profile?.legalName },
      after: { role: "shopper", legalName: name },
    });
    if (profile) {
      await ctx.db.patch(profile._id, {
        legalName: name,
        nameTokens: tokens,
        active: true,
      });
    } else {
      await ctx.db.insert("shopperProfiles", {
        userId,
        active: true,
        onShift: false,
        legalName: name,
        nameTokens: tokens,
        bankAccounts: [],
      });
    }
    if (target.role !== "shopper") await ctx.db.patch(userId, { role: "shopper" });
  },
});

/** Put a shopper on or off shift from the dashboard, e.g. when they call in sick. Audited. */
export const setShift = opsMutation({
  args: { userId: v.id("users"), onShift: v.boolean(), reason: v.string() },
  handler: async (ctx, { userId, onShift, reason }) => {
    const profile = await ctx.db
      .query("shopperProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) throw appError(ErrorCode.NOT_FOUND, "Shopper profile not found.");
    if (onShift && !profile.active) throw appError(ErrorCode.INVALID_INPUT, "Reactivate this shopper first.");
    await audit(ctx, {
      actorId: ctx.user._id,
      action: "shopper.setShift",
      targetTable: "shopperProfiles",
      targetId: profile._id,
      reason,
      before: { onShift: profile.onShift },
      after: { onShift },
    });
    await ctx.db.patch(profile._id, { onShift });
  },
});

/** Stop (or restart) giving a shopper batches without removing their history. Audited. */
export const setActive = opsMutation({
  args: { userId: v.id("users"), active: v.boolean(), reason: v.string() },
  handler: async (ctx, { userId, active, reason }) => {
    const profile = await ctx.db
      .query("shopperProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) throw appError(ErrorCode.NOT_FOUND, "Shopper profile not found.");
    await audit(ctx, {
      actorId: ctx.user._id,
      action: "shopper.setActive",
      targetTable: "shopperProfiles",
      targetId: profile._id,
      reason,
      before: { active: profile.active },
      after: { active },
    });
    await ctx.db.patch(profile._id, {
      active,
      onShift: active ? profile.onShift : false,
    });
  },
});

/**
 * Saves one of the shopper's own bank accounts, looked up with Paystack so the name is real
 * (05 §9 M4). Transfers to any saved shopper account are blocked, and the account name's parts
 * join the shopper's name tokens for matching. Audited.
 */
export const addBankAccount = action({
  args: { userId: v.id("users"), accountNumber: v.string(), bankCode: v.string(), reason: v.string() },
  handler: async (ctx, args): Promise<{ accountName: string; bankName: string }> => {
    const caller = await requireCallerInAction(ctx, ["ops"]);
    if (!args.reason.trim()) throw appError(ErrorCode.INVALID_INPUT, "A reason is required.");
    const resolved = await ctx.runAction(internal.traders.resolve, {
      accountNumber: args.accountNumber,
      bankCode: args.bankCode,
    });
    await ctx.runMutation(internal.ops.shoppers.saveBankAccount, {
      actorId: caller._id,
      userId: args.userId,
      accountNumber: resolved.accountNumber,
      bankCode: args.bankCode,
      resolvedName: resolved.accountName,
      reason: args.reason,
    });
    return { accountName: resolved.accountName, bankName: resolved.bankName };
  },
});

export const saveBankAccount = internalMutation({
  args: {
    actorId: v.id("users"),
    userId: v.id("users"),
    accountNumber: v.string(),
    bankCode: v.string(),
    resolvedName: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("shopperProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (!profile) throw appError(ErrorCode.NOT_FOUND, "Shopper profile not found.");
    if (profile.bankAccounts.some((a) => a.accountNumber === args.accountNumber && a.bankCode === args.bankCode)) {
      throw appError(ErrorCode.INVALID_INPUT, "That account is already saved.");
    }
    const account = { accountNumber: args.accountNumber, bankCode: args.bankCode, resolvedName: args.resolvedName };
    const tokens = [...new Set([...profile.nameTokens, ...nameTokens(args.resolvedName)])];
    await audit(ctx, {
      actorId: args.actorId,
      action: "shopper.addBankAccount",
      targetTable: "shopperProfiles",
      targetId: profile._id,
      reason: args.reason,
      after: { ...account, accountNumber: maskAccount(account.accountNumber) },
    });
    await ctx.db.patch(profile._id, { bankAccounts: [...profile.bankAccounts, account], nameTokens: tokens });

    // The account may already have been paid as a "trader" before ops knew it was the shopper's.
    const trader = await ctx.db
      .query("traders")
      .withIndex("by_account", (q) => q.eq("bankCode", args.bankCode).eq("accountNumber", args.accountNumber))
      .unique();
    if (trader) {
      const paid = (
        await ctx.db
          .query("traderTransfers")
          .withIndex("by_trader", (q) => q.eq("traderId", trader._id))
          .collect()
      ).filter((t) => t.status === "success");
      await ctx.db.patch(trader._id, { flagged: true, review: "suspicious", flagReason: `Saved as shopper ${profile.legalName}'s own account` });
      if (paid.length) {
        await raiseAlert(ctx, {
          key: `shopper_account_paid:${trader._id}`,
          kind: "transfer_blocked",
          severity: "critical",
          message: `${profile.legalName}'s own account (${maskAccount(args.accountNumber)}) was paid ${paid.length} time(s) as a trader, ${formatNaira(paid.reduce((s, t) => s + t.amount, 0))} in total. Investigate.`,
        });
      }
    }
  },
});

export const removeBankAccount = opsMutation({
  args: { userId: v.id("users"), accountNumber: v.string(), bankCode: v.string(), reason: v.string() },
  handler: async (ctx, { userId, accountNumber, bankCode, reason }) => {
    const profile = await ctx.db
      .query("shopperProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) throw appError(ErrorCode.NOT_FOUND, "Shopper profile not found.");
    const keep = profile.bankAccounts.filter((a) => !(a.accountNumber === accountNumber && a.bankCode === bankCode));
    if (keep.length === profile.bankAccounts.length) throw appError(ErrorCode.NOT_FOUND, "Account not found.");
    await audit(ctx, {
      actorId: ctx.user._id,
      action: "shopper.removeBankAccount",
      targetTable: "shopperProfiles",
      targetId: profile._id,
      reason,
      before: { accountNumber: maskAccount(accountNumber), bankCode },
    });
    // Name tokens stay: a name that once matched should keep matching.
    await ctx.db.patch(profile._id, { bankAccounts: keep });
  },
});
