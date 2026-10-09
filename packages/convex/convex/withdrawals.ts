import { v } from "convex/values";
import { formatNaira, maskAccount } from "@ojarun/shared";
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireCallerInAction } from "./lib/actionAuth";
import { raiseAlert } from "./lib/alerts";
import { audit } from "./lib/audit";
import { appError, ErrorCode } from "./lib/errors";
import { paystack, paystackSimulated } from "./lib/paystack";
import { getSettings } from "./lib/settings";
import { postWalletEntry } from "./lib/wallet";
import { customerMutation, customerQuery } from "./lib/auth";
import { bankName } from "./traders";

/**
 * Wallet withdrawals to the customer's saved bank account (05 §9 M6). The wallet is debited
 * when the request is made; a failed or reversed transfer puts the money back with a
 * withdrawal_reversal entry. OjaRun absorbs Paystack's transfer fee.
 */

const RECONCILE_AFTER = 15 * 60_000;
const REQUEUE_AFTER = 2 * 60_000;
const SIMULATED_FAIL = /9999$/;

/** The Wallet tab's withdraw section: saved account, minimum and recent withdrawals. */
export const payout = customerQuery({
  args: {},
  handler: async (ctx) => {
    const { minWithdrawalKobo } = await getSettings(ctx);
    const a = ctx.user.payoutAccount;
    const recent = await ctx.db
      .query("withdrawals")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .order("desc")
      .take(10);
    return {
      balance: ctx.user.walletBalance,
      minimum: minWithdrawalKobo,
      account: a ? { name: a.resolvedName, bankName: await bankName(ctx, a.bankCode), account: maskAccount(a.accountNumber) } : null,
      recent: recent.map((w) => ({
        _id: w._id,
        at: w._creationTime,
        amount: w.amount,
        status: w.status,
        account: maskAccount(w.accountNumber),
        failureReason: w.failureReason ?? null,
      })),
    };
  },
});

export const savePayoutAccount = internalMutation({
  args: { userId: v.id("users"), accountNumber: v.string(), bankCode: v.string(), resolvedName: v.string() },
  handler: async (ctx, { userId, ...account }) => {
    const user = await ctx.db.get(userId);
    if (!user) throw appError(ErrorCode.NOT_FOUND, "User not found.");
    await audit(ctx, {
      actorId: userId,
      action: "wallet.setPayoutAccount",
      targetTable: "users",
      targetId: userId,
      reason: "Customer changed their withdrawal account",
      before: user.payoutAccount ? { ...user.payoutAccount, accountNumber: maskAccount(user.payoutAccount.accountNumber) } : null,
      after: { ...account, accountNumber: maskAccount(account.accountNumber) },
    });
    await ctx.db.patch(userId, { payoutAccount: account });
  },
});

/** Saves (or changes) where withdrawals go. The name comes from the bank. */
export const setPayoutAccount = action({
  args: { accountNumber: v.string(), bankCode: v.string() },
  handler: async (ctx, args): Promise<{ accountName: string; bankName: string }> => {
    const caller = await requireCallerInAction(ctx, ["customer"]);
    const resolved = await ctx.runAction(internal.traders.resolve, args);
    await ctx.runMutation(internal.withdrawals.savePayoutAccount, {
      userId: caller._id,
      accountNumber: resolved.accountNumber,
      bankCode: args.bankCode,
      resolvedName: resolved.accountName,
    });
    return { accountName: resolved.accountName, bankName: resolved.bankName };
  },
});

/** "Withdraw". Debits the wallet now; idempotent on clientRequestId. */
export const request = customerMutation({
  args: { clientRequestId: v.string(), amount: v.number() },
  handler: async (ctx, { clientRequestId, amount }) => {
    if (!/^[A-Za-z0-9-]{8,64}$/.test(clientRequestId)) throw appError(ErrorCode.INVALID_INPUT, "Bad request id.");
    const seen = await ctx.db
      .query("withdrawals")
      .withIndex("by_clientRequestId", (q) => q.eq("clientRequestId", clientRequestId))
      .unique();
    if (seen) {
      if (seen.userId !== ctx.user._id) throw appError(ErrorCode.INVALID_INPUT, "Bad request id.");
      return seen._id;
    }
    const { minWithdrawalKobo } = await getSettings(ctx);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw appError(ErrorCode.INVALID_INPUT, "Enter an amount.");
    if (amount < minWithdrawalKobo) throw appError(ErrorCode.INVALID_INPUT, `The minimum withdrawal is ${formatNaira(minWithdrawalKobo)}.`);
    if (amount > ctx.user.walletBalance) throw appError(ErrorCode.INSUFFICIENT_BALANCE, `You have ${formatNaira(ctx.user.walletBalance)} in your wallet.`);
    const account = ctx.user.payoutAccount;
    if (!account) throw appError(ErrorCode.INVALID_INPUT, "Add your bank account first.");

    const withdrawalId = await ctx.db.insert("withdrawals", {
      userId: ctx.user._id,
      amount,
      accountNumber: account.accountNumber,
      bankCode: account.bankCode,
      resolvedName: account.resolvedName,
      recipientCode: account.recipientCode,
      reference: `ojw_${Date.now().toString(36)}_${clientRequestId.replace(/-/g, "")}`.slice(0, 50),
      clientRequestId,
      status: "requested",
    });
    await postWalletEntry(ctx, {
      userId: ctx.user._id,
      type: "withdrawal_debit",
      amount: -amount,
      withdrawalId,
      dedupeKey: `withdraw:${withdrawalId}`,
      note: `To ${account.resolvedName}`,
    });
    await ctx.scheduler.runAfter(0, internal.withdrawals.initiate, { withdrawalId });
    return withdrawalId;
  },
});

export const load = internalQuery({
  args: { withdrawalId: v.id("withdrawals") },
  handler: async (ctx, { withdrawalId }) => await ctx.db.get(withdrawalId),
});

export const saveRecipient = internalMutation({
  args: { withdrawalId: v.id("withdrawals"), recipientCode: v.string() },
  handler: async (ctx, { withdrawalId, recipientCode }) => {
    const w = await ctx.db.get(withdrawalId);
    if (!w) return;
    await ctx.db.patch(withdrawalId, { recipientCode });
    // Reuse it next time if the customer still has the same account saved.
    const user = await ctx.db.get(w.userId);
    const a = user?.payoutAccount;
    if (a && a.accountNumber === w.accountNumber && a.bankCode === w.bankCode) {
      await ctx.db.patch(w.userId, { payoutAccount: { ...a, recipientCode } });
    }
  },
});

export const markSending = internalMutation({
  args: { withdrawalId: v.id("withdrawals"), transferCode: v.optional(v.string()) },
  handler: async (ctx, { withdrawalId, transferCode }) => {
    const w = await ctx.db.get(withdrawalId);
    if (!w) return false;
    if (transferCode) await ctx.db.patch(withdrawalId, { transferCode });
    if (w.status !== "requested") return false;
    await ctx.db.patch(withdrawalId, { status: "pending", sentAt: Date.now() });
    return true;
  },
});

/** Same safety as trader transfers: pending before the call, so a crash can't send twice. */
export const initiate = internalAction({
  args: { withdrawalId: v.id("withdrawals") },
  handler: async (ctx, { withdrawalId }) => {
    const w = await ctx.runQuery(internal.withdrawals.load, { withdrawalId });
    if (!w || w.status !== "requested") return;

    if (paystackSimulated()) {
      if (!(await ctx.runMutation(internal.withdrawals.markSending, { withdrawalId }))) return;
      const fail = SIMULATED_FAIL.test(w.accountNumber);
      await ctx.scheduler.runAfter(3_000, internal.withdrawals.applyResult, {
        reference: w.reference,
        status: fail ? "failed" : "success",
        reason: fail ? "The bank declined it (simulated)." : undefined,
      });
      return;
    }

    let recipientCode = w.recipientCode;
    if (!recipientCode) {
      const res = await paystack("/transferrecipient", {
        method: "POST",
        body: JSON.stringify({ type: "nuban", name: w.resolvedName, account_number: w.accountNumber, bank_code: w.bankCode, currency: "NGN" }),
      });
      recipientCode = (res.data as { recipient_code?: string } | undefined)?.recipient_code;
      if (!res.status || !recipientCode) {
        if (res.httpStatus >= 500) return;
        await ctx.runMutation(internal.withdrawals.applyResult, { reference: w.reference, status: "failed", reason: "The bank account couldn't be set up for payouts." });
        return;
      }
      await ctx.runMutation(internal.withdrawals.saveRecipient, { withdrawalId, recipientCode });
    }

    if (!(await ctx.runMutation(internal.withdrawals.markSending, { withdrawalId }))) return;
    let res;
    try {
      res = await paystack("/transfer", {
        method: "POST",
        body: JSON.stringify({ source: "balance", amount: w.amount, currency: "NGN", recipient: recipientCode, reference: w.reference, reason: "OjaRun wallet withdrawal" }),
      });
    } catch {
      return; // unknown outcome; reconcile verifies the reference
    }
    const data = res.data as { status?: string; transfer_code?: string } | undefined;
    if (data?.transfer_code) await ctx.runMutation(internal.withdrawals.markSending, { withdrawalId, transferCode: data.transfer_code });
    if (res.status) {
      if (data?.status === "success" || data?.status === "failed" || data?.status === "reversed") {
        await ctx.runMutation(internal.withdrawals.applyResult, { reference: w.reference, status: data.status });
      } else if (data?.status === "otp") {
        await ctx.runMutation(internal.withdrawals.applyResult, { reference: w.reference, status: "failed", reason: "Payouts are paused. Try again later." });
      }
      return;
    }
    if (res.httpStatus >= 500) return;
    await ctx.runMutation(internal.withdrawals.applyResult, {
      reference: w.reference,
      status: "failed",
      reason: /balance/i.test(res.message ?? "") ? "Payouts are delayed. Try again in a few hours." : "The bank didn't accept the transfer.",
    });
  },
});

/** The one place a withdrawal's outcome lands. Failures and reversals refund the wallet once. */
export const applyResult = internalMutation({
  args: {
    reference: v.string(),
    status: v.union(v.literal("success"), v.literal("failed"), v.literal("reversed")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { reference, status, reason }) => {
    const w = await ctx.db
      .query("withdrawals")
      .withIndex("by_reference", (q) => q.eq("reference", reference))
      .unique();
    if (!w) return "unknown";
    if (w.status === status || w.status === "reversed" || (w.status === "failed" && status !== "success")) return "duplicate";
    const now = Date.now();
    if (status === "success") {
      if (w.status === "failed") {
        // We guessed failed and refunded, but the money did go: take the refund back and flag it.
        await raiseAlert(ctx, {
          key: `withdrawal_late_success:${w._id}`,
          kind: "withdrawal_failed",
          severity: "critical",
          withdrawalId: w._id,
          message: `A ${formatNaira(w.amount)} withdrawal marked failed went through after the wallet was refunded. Check the customer's wallet.`,
        });
      }
      await ctx.db.patch(w._id, { status: "success", settledAt: now, failureReason: undefined });
      return "success";
    }
    await ctx.db.patch(w._id, { status, settledAt: now, failureReason: reason ?? (status === "reversed" ? "The bank sent it back." : "The transfer didn't go through.") });
    await postWalletEntry(ctx, {
      userId: w.userId,
      type: "withdrawal_reversal",
      amount: w.amount,
      withdrawalId: w._id,
      dedupeKey: `withdraw_back:${w._id}`,
      note: reason ?? "Withdrawal didn't go through",
    });
    await raiseAlert(ctx, {
      key: `withdrawal_failed:${w._id}`,
      kind: "withdrawal_failed",
      severity: "warning",
      withdrawalId: w._id,
      message: `A ${formatNaira(w.amount)} withdrawal to ${w.resolvedName} ${status}: ${reason ?? "no reason given"}. The wallet was refunded.`,
    });
    return status;
  },
});

export const verify = internalAction({
  args: { reference: v.string() },
  handler: async (ctx, { reference }) => {
    if (paystackSimulated()) return;
    const res = await paystack(`/transfer/verify/${encodeURIComponent(reference)}`);
    const status = (res.data as { status?: string } | undefined)?.status;
    if (res.status && (status === "success" || status === "failed" || status === "reversed")) {
      await ctx.runMutation(internal.withdrawals.applyResult, { reference, status });
    } else if (res.httpStatus === 404) {
      await ctx.runMutation(internal.withdrawals.applyResult, { reference, status: "failed", reason: "The transfer never reached the bank." });
    }
  },
});

export const stuck = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const pending = await ctx.db
      .query("withdrawals")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    const requested = await ctx.db
      .query("withdrawals")
      .withIndex("by_status", (q) => q.eq("status", "requested"))
      .collect();
    return {
      verify: pending.filter((w) => now - (w.sentAt ?? w._creationTime) > RECONCILE_AFTER).map((w) => w.reference),
      resend: requested.filter((w) => now - w._creationTime > REQUEUE_AFTER).map((w) => w._id),
    };
  },
});

/** Every 15 min (05 §5.6). */
export const reconcile = internalAction({
  args: {},
  handler: async (ctx) => {
    const { verify, resend } = await ctx.runQuery(internal.withdrawals.stuck, { now: Date.now() });
    for (const reference of verify) {
      try {
        await ctx.runAction(internal.withdrawals.verify, { reference });
      } catch (e) {
        console.error({ evt: "withdrawal.reconcile_failed", reference, error: String(e) });
      }
    }
    for (const withdrawalId of resend) await ctx.runAction(internal.withdrawals.initiate, { withdrawalId });
  },
});
