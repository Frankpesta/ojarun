import { z } from "zod";

const kobo = z.number().int().nonnegative();

export const deliveryFeeConfigSchema = z.object({
  baseKobo: kobo,
  perKmKobo: kobo,
  minKobo: kobo,
  maxKobo: kobo,
  roundToKobo: kobo,
});

export const paystackFeeConfigSchema = z.object({
  /** Percentage in basis points (1.5% = 150). */
  percentBps: z.number().int().min(0).max(10_000),
  flatKobo: kobo,
  /** The flat fee is waived for charges below this amount. */
  flatWaivedBelowKobo: kobo,
  capKobo: kobo,
});

export const settingsSchema = z.object({
  serviceFeeKobo: kobo,
  deliveryFee: deliveryFeeConfigSchema,
  paystackFee: paystackFeeConfigSchema,
  /** Buffer presets as whole percentages of item budgets. */
  bufferPresets: z.array(z.number().int().min(0).max(100)).min(1),
  defaultBufferPct: z.number().int().min(0).max(100),
  bufferRoundToKobo: kobo,
  priceCheckTimeoutSec: z.number().int().positive(),
  minWithdrawalKobo: kobo,
  refundPaystackChargeOnCancel: z.boolean(),
  maxOrdersPerBatch: z.number().int().positive(),
  cashAdvanceSuggestPct: z.number().int().min(0).max(100),
  paymentHoldMinutes: z.number().int().positive(),
  /** Stand-in for shift data: slot capacity = template capacityPerShopper × this. */
  expectedShoppersPerSlot: z.number().int().min(0),
  /** Customers can book today plus this many days ahead. */
  bookingDaysAhead: z.number().int().min(0).max(6),
  showPriceGuide: z.boolean(),
  /** No minimum order; this caps one order so a shopper can finish it inside the window. */
  maxItemsPerOrder: z.number().int().positive(),
  /** Budget chips for free-text items and catalogue items without their own suggestions. */
  genericBudgetChipsKobo: z.array(kobo).min(1).max(4),
  supportWhatsapp: z.string(),
  supportPhone: z.string(),
  /** Akure delivery area as a [lng, lat] ring (GeoJSON order). */
  geofence: z.array(z.tuple([z.number(), z.number()])).min(3),
});

export type Settings = z.infer<typeof settingsSchema>;
export type DeliveryFeeConfig = z.infer<typeof deliveryFeeConfigSchema>;
export type PaystackFeeConfig = z.infer<typeof paystackFeeConfigSchema>;

/**
 * Working defaults from docs/05-build-plan.md §2. Business-approved values replace these before
 * the pilot. The geofence is a rough placeholder box around Akure and must be redrawn by ops.
 */
export const DEFAULT_SETTINGS: Settings = {
  serviceFeeKobo: 500_00,
  deliveryFee: {
    baseKobo: 300_00,
    perKmKobo: 100_00,
    minKobo: 500_00,
    maxKobo: 2_000_00,
    roundToKobo: 50_00,
  },
  paystackFee: {
    percentBps: 150,
    flatKobo: 100_00,
    flatWaivedBelowKobo: 2_500_00,
    capKobo: 2_000_00,
  },
  bufferPresets: [0, 10, 20],
  defaultBufferPct: 10,
  bufferRoundToKobo: 50_00,
  priceCheckTimeoutSec: 300,
  minWithdrawalKobo: 1_000_00,
  refundPaystackChargeOnCancel: false,
  maxOrdersPerBatch: 4,
  cashAdvanceSuggestPct: 30,
  paymentHoldMinutes: 30,
  expectedShoppersPerSlot: 2,
  bookingDaysAhead: 1,
  showPriceGuide: false,
  maxItemsPerOrder: 25,
  genericBudgetChipsKobo: [1_000_00, 2_000_00, 5_000_00],
  supportWhatsapp: "",
  supportPhone: "",
  geofence: [
    [5.12, 7.19],
    [5.27, 7.19],
    [5.27, 7.33],
    [5.12, 7.33],
  ],
};
