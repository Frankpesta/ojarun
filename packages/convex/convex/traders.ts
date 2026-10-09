import { v } from "convex/values";
import { isNuban, maskAccount } from "@ojarun/shared";
import { action, internalAction, internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { authedQuery, shopperQuery } from "./lib/auth";
import { requireCallerInAction } from "./lib/actionAuth";
import { appError, ErrorCode } from "./lib/errors";
import { paystack, paystackSimulated } from "./lib/paystack";

const DAY = 24 * 60 * 60 * 1000;
/** A resolved account name is trusted for this long before a transfer needs a fresh lookup. */
export const RESOLUTION_TTL = 30 * DAY;
const RECENT_LIMIT = 8;

type Bank = { code: string; name: string };

/** Development stand-in for Paystack's list when no key is set. Codes are Paystack's. */
const SIMULATED_BANKS: Bank[] = [
  { code: "044", name: "Access Bank" },
  { code: "023", name: "Citibank Nigeria" },
  { code: "050", name: "Ecobank Nigeria" },
  { code: "070", name: "Fidelity Bank" },
  { code: "011", name: "First Bank of Nigeria" },
  { code: "214", name: "First City Monument Bank" },
  { code: "058", name: "Guaranty Trust Bank" },
  { code: "50211", name: "Kuda Bank" },
  { code: "999992", name: "OPay Digital Services Limited (OPay)" },
  { code: "999991", name: "PalmPay" },
  { code: "50515", name: "Moniepoint MFB" },
  { code: "076", name: "Polaris Bank" },
  { code: "221", name: "Stanbic IBTC Bank" },
  { code: "232", name: "Sterling Bank" },
  { code: "032", name: "Union Bank of Nigeria" },
  { code: "033", name: "United Bank For Africa" },
  { code: "035", name: "Wema Bank" },
  { code: "057", name: "Zenith Bank" },
];

const SIMULATED_NAMES = [
  "AISHAT BELLO",
  "FOLAKE OGUNLEYE",
  "CHINEDU OKAFOR",
  "MUSA IBRAHIM",
  "BOSE ADEBAYO",
  "KEMI ALAO",
  "IFEOMA NWOSU",
  "SEGUN AKINOLA",
];

/** "0000000000" doesn't resolve; every other number gets a stable made-up trader name. */
function simulatedName(accountNumber: string): string | null {
  if (/^0+$/.test(accountNumber)) return null;
  const sum = [...accountNumber].reduce((s, d) => s + Number(d), 0);
  return SIMULATED_NAMES[sum % SIMULATED_NAMES.length]!;
}

async function bankRow(ctx: QueryCtx) {
  return await ctx.db
    .query("bankList")
    .withIndex("by_key", (q) => q.eq("key", "NG"))
    .unique();
}

export async function bankName(ctx: QueryCtx, code: string): Promise<string> {
  return (await bankRow(ctx))?.banks.find((b) => b.code === code)?.name ?? `Bank ${code}`;
}

/** Banks for the pickers, A–Z. Empty until the first refresh; the app then calls ensureBanks. */
export const banks = authedQuery({
  args: {},
  handler: async (ctx) => {
    const row = await bankRow(ctx);
    return { banks: row?.banks ?? [], fetchedAt: row?.fetchedAt ?? null };
  },
});

export const saveBanks = internalMutation({
  args: { banks: v.array(v.object({ code: v.string(), name: v.string() })) },
  handler: async (ctx, { banks }) => {
    const row = await bankRow(ctx);
    const value = { banks, fetchedAt: Date.now() };
    if (row) await ctx.db.patch(row._id, value);
    else await ctx.db.insert("bankList", { key: "NG", ...value });
  },
});

/** Daily (05 §9 M4): Paystack's Nigerian NUBAN banks, de-duplicated by code. */
export const refreshBanks = internalAction({
  args: {},
  handler: async (ctx) => {
    let list: Bank[];
    if (paystackSimulated()) {
      list = SIMULATED_BANKS;
    } else {
      const byCode = new Map<string, Bank>();
      let cursor = "";
      for (let page = 0; page < 10; page++) {
        const res = await paystack(
          `/bank?country=nigeria&currency=NGN&type=nuban&use_cursor=true&perPage=100${cursor ? `&next=${encodeURIComponent(cursor)}` : ""}`,
        );
        if (!res.status) throw appError(ErrorCode.UNAVAILABLE, "We couldn't load the bank list. Try again.");
        for (const b of (res.data as { code?: string; name?: string; active?: boolean; is_deleted?: boolean }[]) ?? []) {
          if (b.code && b.name && b.active !== false && !b.is_deleted && !byCode.has(b.code)) {
            byCode.set(b.code, { code: b.code, name: b.name.trim() });
          }
        }
        const next = res.meta?.next ?? "";
        if (!next) break;
        cursor = next;
      }
      list = [...byCode.values()];
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    if (list.length) await ctx.runMutation(internal.traders.saveBanks, { banks: list });
    return list.length;
  },
});

/** Loads the bank list on demand when it's missing or more than a day old. */
export const ensureBanks = action({
  args: {},
  handler: async (ctx): Promise<void> => {
    await requireCallerInAction(ctx);
    const fetchedAt = await ctx.runQuery(internal.traders.banksFetchedAt, {});
    if (fetchedAt === null || Date.now() - fetchedAt > DAY) await ctx.runAction(internal.traders.refreshBanks, {});
  },
});

export const banksFetchedAt = internalQuery({
  args: {},
  handler: async (ctx) => (await bankRow(ctx))?.fetchedAt ?? null,
});

export const cachedResolution = internalQuery({
  args: { bankCode: v.string(), accountNumber: v.string() },
  handler: async (ctx, { bankCode, accountNumber }) => {
    const row = await ctx.db
      .query("accountResolutions")
      .withIndex("by_account", (q) => q.eq("bankCode", bankCode).eq("accountNumber", accountNumber))
      .unique();
    const fresh = row && Date.now() - row.resolvedAt < RESOLUTION_TTL ? row.resolvedName : null;
    return { resolvedName: fresh, bankName: await bankName(ctx, bankCode), known: !!(await bankRow(ctx))?.banks.some((b) => b.code === bankCode) };
  },
});

export const saveResolution = internalMutation({
  args: { bankCode: v.string(), accountNumber: v.string(), resolvedName: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("accountResolutions")
      .withIndex("by_account", (q) => q.eq("bankCode", args.bankCode).eq("accountNumber", args.accountNumber))
      .unique();
    if (row) await ctx.db.patch(row._id, { resolvedName: args.resolvedName, resolvedAt: Date.now() });
    else await ctx.db.insert("accountResolutions", { ...args, resolvedAt: Date.now() });
  },
});

/**
 * Looks up an account's name with Paystack (`/bank/resolve`), for shoppers paying a trader and ops
 * saving a shopper's own accounts. The name is stored server-side; transfers read it from there.
 */
export const resolveAccount = action({
  args: { accountNumber: v.string(), bankCode: v.string() },
  handler: async (ctx, args): Promise<{ accountNumber: string; accountName: string; bankName: string }> => {
    // Customers look up their own payout account; shoppers, traders; ops, shoppers' accounts.
    await requireCallerInAction(ctx, ["customer", "shopper", "ops"]);
    return await ctx.runAction(internal.traders.resolve, args);
  },
});

export const resolve = internalAction({
  args: { accountNumber: v.string(), bankCode: v.string() },
  handler: async (ctx, { accountNumber, bankCode }): Promise<{ accountNumber: string; accountName: string; bankName: string }> => {
    const number = accountNumber.replace(/\s+/g, "");
    if (!isNuban(number)) throw appError(ErrorCode.INVALID_INPUT, "Account numbers are 10 digits.");
    const cached = await ctx.runQuery(internal.traders.cachedResolution, { bankCode, accountNumber: number });
    if (!cached.known) throw appError(ErrorCode.INVALID_INPUT, "Pick the bank from the list.");
    if (cached.resolvedName) return { accountNumber: number, accountName: cached.resolvedName, bankName: cached.bankName };

    let name: string | null;
    if (paystackSimulated()) {
      name = simulatedName(number);
    } else {
      const res = await paystack(
        `/bank/resolve?account_number=${encodeURIComponent(number)}&bank_code=${encodeURIComponent(bankCode)}`,
      );
      name = res.status ? ((res.data as { account_name?: string } | undefined)?.account_name?.trim() ?? null) : null;
      if (!res.status && res.httpStatus >= 500) {
        throw appError(ErrorCode.UNAVAILABLE, "The bank didn't answer. Try again in a moment.");
      }
    }
    if (!name) {
      throw appError(ErrorCode.INVALID_INPUT, "We couldn't find that account. Check the number and the bank.");
    }
    await ctx.runMutation(internal.traders.saveResolution, { bankCode, accountNumber: number, resolvedName: name });
    return { accountNumber: number, accountName: name, bankName: cached.bankName };
  },
});

/** Traders this market's shoppers paid recently, newest first, for one-tap repeat payments. */
export const recentForMarket = shopperQuery({
  args: { marketId: v.id("markets") },
  handler: async (ctx, { marketId }) => {
    const rows = await ctx.db
      .query("traders")
      .withIndex("by_market", (q) => q.eq("marketId", marketId))
      .collect();
    const recent = rows
      .filter((t) => t.review !== "suspicious" && t.transferCount > 0)
      .sort((a, b) => (b.lastPaidAt ?? 0) - (a.lastPaidAt ?? 0))
      .slice(0, RECENT_LIMIT);
    return await Promise.all(
      recent.map(async (t) => ({
        _id: t._id,
        resolvedName: t.resolvedName,
        bankName: await bankName(ctx, t.bankCode),
        account: maskAccount(t.accountNumber),
        transferCount: t.transferCount,
      })),
    );
  },
});
