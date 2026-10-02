import { roundUpTo, sumKobo, type Kobo } from "./money";
import { paystackGrossUp } from "./paystackFee";
import type { DeliveryFeeConfig, Settings } from "./settings";
import type { ItemStatus } from "./statuses";

export function deliveryFee(distanceMeters: number, cfg: DeliveryFeeConfig): Kobo {
  const km = Math.ceil(Math.max(0, distanceMeters) / 1000);
  const raw = cfg.baseKobo + km * cfg.perKmKobo;
  const clamped = Math.min(Math.max(raw, cfg.minKobo), cfg.maxKobo);
  return Math.min(roundUpTo(clamped, cfg.roundToKobo), cfg.maxKobo);
}

export function bufferAmount(budgets: Kobo, pct: number, roundTo: Kobo): Kobo {
  if (pct <= 0 || budgets <= 0) return 0;
  return roundUpTo(Math.ceil((budgets * pct) / 100), roundTo);
}

export type OrderTotals = {
  budgets: Kobo;
  buffer: Kobo;
  serviceFee: Kobo;
  deliveryFee: Kobo;
  /** Paystack fee passed on to the customer; 0 when the wallet covers everything. */
  paystackCharge: Kobo;
  walletApplied: Kobo;
  /** Amount charged through Paystack. */
  chargeAmount: Kobo;
  /** Everything the customer pays (wallet + Paystack). */
  grandTotal: Kobo;
};

export function orderTotals(input: {
  itemBudgets: readonly Kobo[];
  bufferPct: number;
  deliveryFee: Kobo;
  walletBalance: Kobo;
  applyWallet: boolean;
  settings: Pick<Settings, "serviceFeeKobo" | "paystackFee" | "bufferRoundToKobo">;
}): OrderTotals {
  const budgets = sumKobo(input.itemBudgets);
  const buffer = bufferAmount(budgets, input.bufferPct, input.settings.bufferRoundToKobo);
  const serviceFee = input.settings.serviceFeeKobo;
  const subtotal = budgets + buffer + serviceFee + input.deliveryFee;

  const walletApplied = input.applyWallet ? Math.min(Math.max(0, input.walletBalance), subtotal) : 0;
  const { gross, charge } = paystackGrossUp(subtotal - walletApplied, input.settings.paystackFee);

  return {
    budgets,
    buffer,
    serviceFee,
    deliveryFee: input.deliveryFee,
    paystackCharge: charge,
    walletApplied,
    chargeAmount: gross,
    grandTotal: walletApplied + gross,
  };
}

export type CreditItem = {
  budget: Kobo;
  approvedExtra: Kobo;
  amountSpent: Kobo;
  status: ItemStatus;
};

/**
 * Wallet credits written when an order completes (05 §5.4). Every item returns what it was funded
 * with minus what was spent on it; rejected items also return what was spent. Unused buffer returns.
 */
export function completionCredits(
  items: readonly CreditItem[],
  buffer: { buffer: Kobo; bufferUsed: Kobo },
): { leftover: Kobo; rejection: Kobo } {
  let leftover = 0;
  let rejection = 0;
  for (const item of items) {
    leftover += item.budget + item.approvedExtra - item.amountSpent;
    if (item.status === "rejected") rejection += item.amountSpent;
  }
  leftover += Math.max(0, buffer.buffer - buffer.bufferUsed);
  return { leftover: Math.max(0, leftover), rejection };
}

/** Refund to the wallet when a customer cancels. The Paystack charge is kept unless configured. */
export function cancellationRefund(
  totals: Pick<OrderTotals, "chargeAmount" | "paystackCharge" | "walletApplied">,
  refundPaystackCharge: boolean,
): Kobo {
  const paid = totals.chargeAmount + totals.walletApplied;
  return refundPaystackCharge ? paid : paid - totals.paystackCharge;
}

/** Fund a price-check approval from the buffer first, then the wallet. Null if unaffordable. */
export function fundExtra(
  extra: Kobo,
  bufferLeft: Kobo,
  walletBalance: Kobo,
): { fromBuffer: Kobo; fromWallet: Kobo } | null {
  if (extra <= 0) return null;
  const fromBuffer = Math.min(extra, Math.max(0, bufferLeft));
  const fromWallet = extra - fromBuffer;
  if (fromWallet > Math.max(0, walletBalance)) return null;
  return { fromBuffer, fromWallet };
}
