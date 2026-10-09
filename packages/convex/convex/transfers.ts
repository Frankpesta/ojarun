import { v } from "convex/values";
import { formatNaira, isNuban, maskAccount, nameMatch } from "@ojarun/shared";
import { internalAction, internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { shopperMutation, shopperQuery } from "./lib/auth";
import { raiseAlert, resolveAlert } from "./lib/alerts";
import { appError, ErrorCode } from "./lib/errors";
import { paystack, paystackSimulated } from "./lib/paystack";
import { getSettings } from "./lib/settings";
import { committedSpend, itemCap } from "./lib/spend";
import { itemForShopping } from "./items";
import { orderCode } from "./orders";
import { bankName, RESOLUTION_TTL } from "./traders";

/**
 * Paying traders by bank transfer (05 §6.2). The shopper sends intent; the server checks the
 * photo, the budget cap and the fraud rules, then Paystack moves the money. Only Paystack's
 * answer (webhook, verification or the transfer call itself) marks a transfer successful, and
 * only a successful transfer adds to the item's amountSpent.
 */

const MINUTE = 60_000;
/** Pending this long without an answer → ask Paystack directly (05 §5.6). */
const RECONCILE_AFTER = 10 * MINUTE;
/** Queued this long means initiate never ran to the end; run it again. */
const REQUEUE_AFTER = 2 * MINUTE;

/** What the shopper sees on a blocked transfer. The reason itself is for ops only. */
const BLOCKED_COPY = "This account can't be paid from OjaRun. Ops has been told and will call you.";

function cleanRequestId(id: string): string {
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) throw appError(ErrorCode.INVALID_INPUT, "Bad request id.");
  return id;
}

/**
 * Paystack references are 16–50 chars of letters, digits, "-" and "_". The time prefix keeps short
 * request ids over the minimum; the request id keeps it unique.
 */
function referenceFor(clientRequestId: string): string {
  return `ojt_${Date.now().toString(36)}_${clientRequestId.replace(/-/g, "")}`.slice(0, 50);
}

type Recipient = { traderId: Id<"traders"> } | { bankCode: string; accountNumber: string };

/** The trader row for this account, created on first payment as a new recipient for ops review. */
async function traderFor(ctx: MutationCtx, recipient: Recipient, marketId: Id<"markets">) {
  if ("traderId" in recipient) {
    const t = await ctx.db.get(recipient.traderId);
    if (!t) throw appError(ErrorCode.NOT_FOUND, "That trader isn't saved any more. Enter their account.");
    return { trader: t, isNew: false };
  }
  const accountNumber = recipient.accountNumber.replace(/\s+/g, "");
  if (!isNuban(accountNumber)) throw appError(ErrorCode.INVALID_INPUT, "Account numbers are 10 digits.");
  const existing = await ctx.db
    .query("traders")
    .withIndex("by_account", (q) => q.eq("bankCode", recipient.bankCode).eq("accountNumber", accountNumber))
    .unique();
  if (existing) return { trader: existing, isNew: false };

  // The name must come from our own Paystack lookup, never from the app.
  const resolution = await ctx.db
    .query("accountResolutions")
    .withIndex("by_account", (q) => q.eq("bankCode", recipient.bankCode).eq("accountNumber", accountNumber))
    .unique();
  if (!resolution || Date.now() - resolution.resolvedAt > RESOLUTION_TTL) {
    throw appError(ErrorCode.INVALID_INPUT, "Check the account name again before paying.");
  }
  const traderId = await ctx.db.insert("traders", {
    accountNumber,
    bankCode: recipient.bankCode,
    resolvedName: resolution.resolvedName,
    marketId,
    firstSeenAt: Date.now(),
    transferCount: 0,
    flagged: true,
    flagReason: "New recipient",
    review: "pending",
  });
  return { trader: (await ctx.db.get(traderId))!, isNew: true };
}

/**
 * Checks the account against every shopper (05 §6.2): one of their saved accounts, or a name
 * sharing enough parts with theirs, blocks the payment. A single shared part only flags it.
 */
async function fraudCheck(ctx: MutationCtx, trader: Doc<"traders">) {
  const { nameMatchBlockTokens } = await getSettings(ctx);
  const profiles = await ctx.db.query("shopperProfiles").collect();
  let flag: string | null = null;
  for (const p of profiles) {
    if (p.bankAccounts.some((a) => a.accountNumber === trader.accountNumber && a.bankCode === trader.bankCode)) {
      return { block: `Account ${maskAccount(trader.accountNumber)} is saved as shopper ${p.legalName}'s own.`, flag };
    }
    const match = nameMatch(trader.resolvedName, p.nameTokens, nameMatchBlockTokens);
    if (match === "block") return { block: `"${trader.resolvedName}" matches shopper ${p.legalName}.`, flag };
    if (match === "flag" && !flag) flag = `Shares a name with shopper ${p.legalName}`;
  }
  return { block: null, flag };
}

/**
 * Validates and records one transfer, then schedules the send. Blocked attempts are recorded
 * (not thrown) so ops can see them and the offline queue doesn't retry them forever.
 */
async function createTransfer(
  ctx: MutationCtx & { user: Doc<"users"> },
  args: { clientRequestId: string; itemId: Id<"orderItems">; recipient: Recipient; amount: number; retryOf?: Id<"traderTransfers"> },
) {
  const item = await itemForShopping(ctx, ctx.user, args.itemId);
  const order = (await ctx.db.get(item.orderId))!;
  if (!Number.isSafeInteger(args.amount) || args.amount <= 0) {
    throw appError(ErrorCode.INVALID_INPUT, "Enter the amount to pay.");
  }
  if (item.status === "skipped") throw appError(ErrorCode.INVALID_INPUT, "This item is marked not available.");
  if (!item.photoStorageId) throw appError(ErrorCode.INVALID_INPUT, "Take a photo of the item before paying.");
  const spend = await committedSpend(ctx, item._id);
  const left = itemCap(item) - spend.total;
  if (args.amount > left) {
    throw appError(
      ErrorCode.INVALID_INPUT,
      left > 0
        ? `That's more than this item's budget. You can pay up to ${formatNaira(left)}.`
        : "This item's budget is used up. Send the customer a price check for more.",
    );
  }

  const { trader, isNew } = await traderFor(ctx, args.recipient, order.marketId);
  const fraud = await fraudCheck(ctx, trader);
  const block = fraud.block ?? (trader.review === "suspicious" ? "Ops marked this account suspicious." : null);
  const reference = referenceFor(args.clientRequestId);
  const base = {
    orderId: order._id,
    itemId: item._id,
    shopperId: ctx.user._id,
    traderId: trader._id,
    amount: args.amount,
    clientRequestId: args.clientRequestId,
    reference,
    newRecipient: isNew,
    retryOf: args.retryOf,
  };

  if (block) {
    const transferId = await ctx.db.insert("traderTransfers", { ...base, status: "blocked", failureReason: BLOCKED_COPY });
    await ctx.db.patch(trader._id, {
      flagged: true,
      flagReason: `Blocked: ${block}`,
      review: trader.review === "approved" ? "pending" : (trader.review ?? "pending"),
    });
    await raiseAlert(ctx, {
      key: `transfer_blocked:${transferId}`,
      kind: "transfer_blocked",
      severity: "critical",
      transferId,
      message: `${ctx.user.name ?? "A shopper"} tried to pay ${formatNaira(args.amount)} to ${trader.resolvedName} for ${item.name} (order ${orderCode(order._id)}). ${block}`,
    });
    return { transferId, status: "blocked" as const };
  }

  if (fraud.flag && trader.review !== "approved") {
    await ctx.db.patch(trader._id, { flagged: true, flagReason: fraud.flag, review: "pending" });
  }
  const transferId = await ctx.db.insert("traderTransfers", { ...base, status: "queued" });
  await ctx.scheduler.runAfter(0, internal.transfers.initiate, { transferId });
  return { transferId, status: "queued" as const };
}

const recipientArg = v.union(
  v.object({ traderId: v.id("traders") }),
  v.object({ bankCode: v.string(), accountNumber: v.string() }),
);

/** The shopper's "Hold to send". Idempotent on clientRequestId so the offline queue can replay it. */
export const requestTraderTransfer = shopperMutation({
  args: { clientRequestId: v.string(), itemId: v.id("orderItems"), recipient: recipientArg, amount: v.number() },
  handler: async (ctx, args) => {
    const clientRequestId = cleanRequestId(args.clientRequestId);
    const seen = await ctx.db
      .query("traderTransfers")
      .withIndex("by_clientRequestId", (q) => q.eq("clientRequestId", clientRequestId))
      .unique();
    if (seen) {
      if (seen.shopperId !== ctx.user._id) throw appError(ErrorCode.INVALID_INPUT, "Bad request id.");
      return { transferId: seen._id, status: seen.status };
    }
    return await createTransfer(ctx, { ...args, clientRequestId });
  },
});

/** "Try again" on a failed transfer: same item, trader and amount, a new reference. */
export const retry = shopperMutation({
  args: { clientRequestId: v.string(), transferId: v.id("traderTransfers") },
  handler: async (ctx, args) => {
    const clientRequestId = cleanRequestId(args.clientRequestId);
    const seen = await ctx.db
      .query("traderTransfers")
      .withIndex("by_clientRequestId", (q) => q.eq("clientRequestId", clientRequestId))
      .unique();
    if (seen) return { transferId: seen._id, status: seen.status };
    const failed = await ctx.db.get(args.transferId);
    if (!failed || failed.shopperId !== ctx.user._id) throw appError(ErrorCode.NOT_FOUND, "Transfer not found.");
    if (failed.status !== "failed") throw appError(ErrorCode.INVALID_TRANSITION, "Only failed transfers can be tried again.");
    if (failed.retriedBy) throw appError(ErrorCode.INVALID_TRANSITION, "This transfer was already tried again.");
    const res = await createTransfer(ctx, {
      clientRequestId,
      itemId: failed.itemId,
      recipient: { traderId: failed.traderId },
      amount: failed.amount,
      retryOf: failed._id,
    });
    await ctx.db.patch(failed._id, { retriedBy: res.transferId });
    return res;
  },
});

/** Payments on one item, for the shopper's pay sheet and item screen. */
export const forItem = shopperQuery({
  args: { itemId: v.id("orderItems") },
  handler: async (ctx, { itemId }) => {
    const item = await ctx.db.get(itemId);
    const order = item ? await ctx.db.get(item.orderId) : null;
    if (!item || !order || order.shopperId !== ctx.user._id) return null;
    const spend = await committedSpend(ctx, itemId);
    const transfers = await Promise.all(
      spend.transfers
        .sort((a, b) => b._creationTime - a._creationTime)
        .map(async (t) => {
          const trader = await ctx.db.get(t.traderId);
          return {
            _id: t._id,
            amount: t.amount,
            status: t.status,
            failureReason: t.failureReason ?? null,
            canRetry: t.status === "failed" && !t.retriedBy,
            traderName: trader?.resolvedName ?? "Trader",
            bankName: trader ? await bankName(ctx, trader.bankCode) : "",
            account: trader ? maskAccount(trader.accountNumber) : "",
            at: t._creationTime,
          };
        }),
    );
    const cash = spend.cash
      .sort((a, b) => b.at - a.at)
      .map((c) => ({ _id: c._id, amount: c.amount, traderLabel: c.traderLabel ?? null, at: c.at }));
    return {
      cap: itemCap(item),
      committed: spend.total,
      spent: item.amountSpent,
      left: Math.max(0, itemCap(item) - spend.total),
      transfers,
      cash,
    };
  },
});

// ---------------------------------------------------------------------------------------------
// Sending, results and reconciliation
// ---------------------------------------------------------------------------------------------

export const load = internalQuery({
  args: { transferId: v.id("traderTransfers") },
  handler: async (ctx, { transferId }) => {
    const transfer = await ctx.db.get(transferId);
    if (!transfer) return null;
    const [trader, item] = await Promise.all([ctx.db.get(transfer.traderId), ctx.db.get(transfer.itemId)]);
    return { transfer, trader: trader!, itemName: item?.name ?? "item", code: orderCode(transfer.orderId) };
  },
});

export const saveRecipient = internalMutation({
  args: { traderId: v.id("traders"), recipientCode: v.string() },
  handler: async (ctx, { traderId, recipientCode }) => {
    await ctx.db.patch(traderId, { recipientCode });
  },
});

/** queued → pending, exactly once. Returns false if another run already sent it. */
export const markSending = internalMutation({
  args: { transferId: v.id("traderTransfers") },
  handler: async (ctx, { transferId }) => {
    const t = await ctx.db.get(transferId);
    if (!t || t.status !== "queued") return false;
    await ctx.db.patch(transferId, { status: "pending", sentAt: Date.now() });
    return true;
  },
});

export const saveTransferCode = internalMutation({
  args: { transferId: v.id("traderTransfers"), transferCode: v.string() },
  handler: async (ctx, { transferId, transferCode }) => {
    await ctx.db.patch(transferId, { transferCode });
  },
});

/** Account numbers ending 9999 fail in simulation, to demo the retry path. */
const SIMULATED_FAIL = /9999$/;

/**
 * Sends a queued transfer: creates the Paystack recipient on first use, then calls `/transfer`
 * from the balance. The status moves to pending *before* the call, so a crash mid-call can never
 * lead to a second send: reconcilePending asks Paystack what happened to the reference instead.
 */
export const initiate = internalAction({
  args: { transferId: v.id("traderTransfers") },
  handler: async (ctx, { transferId }) => {
    const loaded = await ctx.runQuery(internal.transfers.load, { transferId });
    if (!loaded || loaded.transfer.status !== "queued") return;
    const { transfer, trader } = loaded;

    if (paystackSimulated()) {
      if (!(await ctx.runMutation(internal.transfers.markSending, { transferId }))) return;
      const fail = SIMULATED_FAIL.test(trader.accountNumber);
      await ctx.scheduler.runAfter(3_000, internal.transfers.applyResult, {
        reference: transfer.reference,
        status: fail ? "failed" : "success",
        reason: fail ? "The trader's bank declined it (simulated)." : undefined,
      });
      return;
    }

    let recipientCode = trader.recipientCode;
    if (!recipientCode) {
      const res = await paystack("/transferrecipient", {
        method: "POST",
        body: JSON.stringify({
          type: "nuban",
          name: trader.resolvedName,
          account_number: trader.accountNumber,
          bank_code: trader.bankCode,
          currency: "NGN",
        }),
      });
      recipientCode = (res.data as { recipient_code?: string } | undefined)?.recipient_code;
      if (!res.status || !recipientCode) {
        // 5xx: leave it queued for the next sweep. 4xx: Paystack refused the account.
        if (res.httpStatus >= 500) return;
        await ctx.runMutation(internal.transfers.applyResult, {
          reference: transfer.reference,
          status: "failed",
          reason: "Paystack couldn't add this account. Check it with the trader.",
        });
        return;
      }
      await ctx.runMutation(internal.transfers.saveRecipient, { traderId: trader._id, recipientCode });
    }

    if (!(await ctx.runMutation(internal.transfers.markSending, { transferId }))) return;
    let res;
    try {
      res = await paystack("/transfer", {
        method: "POST",
        body: JSON.stringify({
          source: "balance",
          amount: transfer.amount,
          currency: "NGN",
          recipient: recipientCode,
          reference: transfer.reference,
          reason: `OjaRun ${loaded.code}: ${loaded.itemName}`.slice(0, 100),
        }),
      });
    } catch {
      return; // Unreachable: the outcome is unknown, so reconcilePending verifies the reference later.
    }
    const data = res.data as { status?: string; transfer_code?: string } | undefined;
    if (data?.transfer_code) {
      await ctx.runMutation(internal.transfers.saveTransferCode, { transferId, transferCode: data.transfer_code });
    }
    if (res.status) {
      if (data?.status === "success") {
        await ctx.runMutation(internal.transfers.applyResult, { reference: transfer.reference, status: "success" });
      } else if (data?.status === "otp") {
        await ctx.runMutation(internal.transfers.applyResult, {
          reference: transfer.reference,
          status: "failed",
          reason: "Paystack is asking for an OTP. Ops needs to turn transfer OTP off.",
          configProblem: true,
        });
      } else if (data?.status === "failed" || data?.status === "reversed") {
        await ctx.runMutation(internal.transfers.applyResult, { reference: transfer.reference, status: data.status });
      }
      return; // "pending"/"received": the webhook or the reconcile sweep finishes it.
    }
    if (res.httpStatus >= 500) return; // Unknown outcome; reconcile.
    await ctx.runMutation(internal.transfers.applyResult, {
      reference: transfer.reference,
      status: "failed",
      reason: /balance/i.test(res.message ?? "") ? "OjaRun's payout balance is low. Ops is topping it up." : "Paystack refused the transfer.",
      lowBalance: /balance/i.test(res.message ?? ""),
    });
  },
});

/**
 * The single place a transfer's outcome is applied. Idempotent. Success adds to the item's
 * amountSpent and the trader's count; a reversal of a successful transfer takes it back out.
 */
export const applyResult = internalMutation({
  args: {
    reference: v.string(),
    status: v.union(v.literal("success"), v.literal("failed"), v.literal("reversed")),
    reason: v.optional(v.string()),
    lowBalance: v.optional(v.boolean()),
    configProblem: v.optional(v.boolean()),
  },
  handler: async (ctx, { reference, status, reason, lowBalance, configProblem }) => {
    const t = await ctx.db
      .query("traderTransfers")
      .withIndex("by_reference", (q) => q.eq("reference", reference))
      .unique();
    if (!t) {
      console.error({ evt: "transfer.unknown_reference", reference });
      return "unknown";
    }
    if (t.status === status || t.status === "blocked" || t.status === "reversed") return "duplicate";
    const [item, trader] = await Promise.all([ctx.db.get(t.itemId), ctx.db.get(t.traderId)]);
    const code = orderCode(t.orderId);
    const now = Date.now();

    if (status === "success") {
      // A "failed" here was our own guess (Paystack never answered); the money did move.
      await ctx.db.patch(t._id, { status: "success", settledAt: now, failureReason: undefined });
      if (item) await ctx.db.patch(item._id, { amountSpent: item.amountSpent + t.amount });
      if (trader) await ctx.db.patch(trader._id, { transferCount: trader.transferCount + 1, lastPaidAt: now });
      await resolveAlert(ctx, `transfer_failed:${t.retryOf ?? t._id}`);
      if (t.status === "failed" && t.retriedBy) {
        await raiseAlert(ctx, {
          key: `transfer_double:${t._id}`,
          kind: "transfer_failed",
          severity: "critical",
          transferId: t._id,
          message: `A transfer for ${item?.name ?? "an item"} (order ${code}) that looked failed went through after it was retried. Check whether ${trader?.resolvedName ?? "the trader"} was paid twice.`,
        });
      }
      console.log({ evt: "transfer.success", reference, amount: t.amount });
      return "success";
    }

    if (status === "reversed" && t.status === "success") {
      await ctx.db.patch(t._id, { status: "reversed", settledAt: now, failureReason: reason ?? "The bank sent the money back." });
      if (item) await ctx.db.patch(item._id, { amountSpent: Math.max(0, item.amountSpent - t.amount) });
      if (trader) await ctx.db.patch(trader._id, { transferCount: Math.max(0, trader.transferCount - 1) });
      await raiseAlert(ctx, {
        key: `transfer_reversed:${t._id}`,
        kind: "transfer_reversed",
        severity: "critical",
        transferId: t._id,
        message: `${formatNaira(t.amount)} to ${trader?.resolvedName ?? "a trader"} for ${item?.name ?? "an item"} (order ${code}) was reversed by the bank.`,
      });
      return "reversed";
    }

    if (t.status === "success") return "ignored"; // A late "failed" can't undo a confirmed success.
    await ctx.db.patch(t._id, {
      status: status === "reversed" ? "reversed" : "failed",
      settledAt: now,
      failureReason: reason ?? "The transfer didn't go through.",
    });
    if (lowBalance) {
      await raiseAlert(ctx, {
        key: "low_balance",
        kind: "low_balance",
        severity: "critical",
        message: "Trader transfers are failing because the Paystack balance is too low. Top it up now.",
      });
    } else if (configProblem) {
      await raiseAlert(ctx, {
        key: "paystack_otp",
        kind: "paystack_config",
        severity: "critical",
        message: "Paystack is asking for an OTP on transfers. Turn off transfer OTP in the Paystack dashboard.",
      });
    }
    await raiseAlert(ctx, {
      key: `transfer_failed:${t.retryOf ?? t._id}`,
      kind: "transfer_failed",
      severity: "warning",
      transferId: t._id,
      message: `${formatNaira(t.amount)} to ${trader?.resolvedName ?? "a trader"} for ${item?.name ?? "an item"} (order ${code}) failed: ${reason ?? "no reason given"}.`,
    });
    return "failed";
  },
});

/** Asks Paystack for a transfer's real state (webhook follow-up and the reconcile sweep). */
export const verify = internalAction({
  args: { reference: v.string() },
  handler: async (ctx, { reference }) => {
    if (paystackSimulated()) return;
    const res = await paystack(`/transfer/verify/${encodeURIComponent(reference)}`);
    const status = (res.data as { status?: string } | undefined)?.status;
    if (res.status && (status === "success" || status === "failed" || status === "reversed")) {
      await ctx.runMutation(internal.transfers.applyResult, { reference, status });
    } else if (res.httpStatus === 404) {
      // Paystack has no transfer with this reference, so nothing was sent.
      await ctx.runMutation(internal.transfers.applyResult, {
        reference,
        status: "failed",
        reason: "The transfer didn't reach Paystack. Try again.",
      });
    }
  },
});

export const stuck = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const pending = await ctx.db
      .query("traderTransfers")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    const queued = await ctx.db
      .query("traderTransfers")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .collect();
    return {
      verify: pending.filter((t) => now - (t.sentAt ?? t._creationTime) > RECONCILE_AFTER).map((t) => t.reference),
      resend: queued.filter((t) => now - t._creationTime > REQUEUE_AFTER).map((t) => t._id),
    };
  },
});

/** Every 10 min (05 §5.6): verify transfers Paystack hasn't answered, re-run stalled sends. */
export const reconcilePending = internalAction({
  args: {},
  handler: async (ctx) => {
    const { verify, resend } = await ctx.runQuery(internal.transfers.stuck, { now: Date.now() });
    for (const reference of verify) {
      try {
        await ctx.runAction(internal.transfers.verify, { reference });
      } catch (e) {
        console.error({ evt: "transfer.reconcile_failed", reference, error: String(e) });
      }
    }
    for (const transferId of resend) await ctx.runAction(internal.transfers.initiate, { transferId });
  },
});

export const saveBalance = internalMutation({
  args: { balance: v.number() },
  handler: async (ctx, { balance }) => {
    const row = await ctx.db
      .query("paystackBalance")
      .withIndex("by_key", (q) => q.eq("key", "NGN"))
      .unique();
    if (row) await ctx.db.patch(row._id, { balance, checkedAt: Date.now() });
    else await ctx.db.insert("paystackBalance", { key: "NGN", balance, checkedAt: Date.now() });
    const { paystackLowBalanceKobo } = await getSettings(ctx);
    if (balance < paystackLowBalanceKobo) {
      await raiseAlert(ctx, {
        key: "low_balance",
        kind: "low_balance",
        severity: "critical",
        message: `The Paystack balance is ${formatNaira(balance)}, below the ${formatNaira(paystackLowBalanceKobo)} alert level. Top it up so trader payments don't fail.`,
      });
    } else {
      await resolveAlert(ctx, "low_balance");
    }
  },
});

/** Every 30 min (05 §9 M4): the Paystack balance, with an ops alert when it's low. */
export const checkBalance = internalAction({
  args: {},
  handler: async (ctx) => {
    if (!process.env.PAYSTACK_SECRET_KEY) return;
    const res = await paystack("/balance");
    const ngn = (res.data as { currency?: string; balance?: number }[] | undefined)?.find((b) => b.currency === "NGN");
    if (res.status && ngn && Number.isSafeInteger(ngn.balance)) {
      await ctx.runMutation(internal.transfers.saveBalance, { balance: ngn.balance! });
    }
  },
});
