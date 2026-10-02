import type { Kobo } from "./money";
import type { PaystackFeeConfig } from "./settings";

/** Paystack's fee on a charge of `gross` kobo (local cards). */
export function paystackFeeFor(gross: Kobo, cfg: PaystackFeeConfig): Kobo {
  if (gross <= 0) return 0;
  const percent = Math.ceil((gross * cfg.percentBps) / 10_000);
  const flat = gross < cfg.flatWaivedBelowKobo ? 0 : cfg.flatKobo;
  return Math.min(percent + flat, cfg.capKobo);
}

/**
 * The smallest charge that leaves the business with at least `net` after Paystack's fee.
 * Starts from the closed-form estimate, then settles exactly under integer rounding.
 */
export function paystackGrossUp(net: Kobo, cfg: PaystackFeeConfig): { gross: Kobo; charge: Kobo } {
  if (net <= 0) return { gross: 0, charge: 0 };
  const rate = 1 - cfg.percentBps / 10_000;

  let gross = Math.ceil((net + cfg.flatKobo) / rate);
  if (gross < cfg.flatWaivedBelowKobo) gross = Math.ceil(net / rate);
  if (gross - net > cfg.capKobo) gross = net + cfg.capKobo;

  while (gross - paystackFeeFor(gross, cfg) < net) gross += 1;
  while (gross - 1 >= net && gross - 1 - paystackFeeFor(gross - 1, cfg) >= net) gross -= 1;

  return { gross, charge: gross - net };
}
