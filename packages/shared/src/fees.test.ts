import { describe, expect, it } from "vitest";
import {
  bufferAmount,
  cancellationRefund,
  completionCredits,
  deliveryFee,
  fundExtra,
  orderTotals,
} from "./fees";
import { paystackFeeFor, paystackGrossUp } from "./paystackFee";
import { DEFAULT_SETTINGS } from "./settings";
import { bearingDegrees, isInsidePolygon } from "./geofence";
import { canTransitionOrder } from "./statuses";

const S = DEFAULT_SETTINGS;

describe("deliveryFee", () => {
  it("applies the minimum for short trips", () => {
    expect(deliveryFee(0, S.deliveryFee)).toBe(500_00);
    expect(deliveryFee(1_500, S.deliveryFee)).toBe(500_00); // 300 + 2×100 = 500
  });
  it("charges per started km and rounds up to ₦50", () => {
    expect(deliveryFee(4_200, S.deliveryFee)).toBe(800_00); // 300 + 5×100
    expect(deliveryFee(4_200, { ...S.deliveryFee, perKmKobo: 110_00 })).toBe(850_00); // 850 exactly
    expect(deliveryFee(4_200, { ...S.deliveryFee, perKmKobo: 111_00 })).toBe(900_00); // 855 → 900
  });
  it("caps long trips", () => {
    expect(deliveryFee(40_000, S.deliveryFee)).toBe(2_000_00);
  });
});

describe("paystack fees", () => {
  const cfg = S.paystackFee;

  it("waives the flat fee under ₦2,500", () => {
    expect(paystackFeeFor(2_000_00, cfg)).toBe(30_00);
  });
  it("adds the flat fee from ₦2,500", () => {
    expect(paystackFeeFor(10_000_00, cfg)).toBe(250_00);
  });
  it("caps at ₦2,000", () => {
    expect(paystackFeeFor(500_000_00, cfg)).toBe(2_000_00);
  });

  it.each([1, 99_00, 2_000_00, 2_400_00, 2_463_00, 2_500_00, 10_000_00, 50_000_00, 125_000_00, 500_000_00])(
    "grossing up %i kobo nets exactly that amount, minimally",
    (net) => {
      const { gross, charge } = paystackGrossUp(net, cfg);
      expect(gross - charge).toBe(net);
      expect(gross - paystackFeeFor(gross, cfg)).toBeGreaterThanOrEqual(net);
      expect(gross - 1 - paystackFeeFor(gross - 1, cfg)).toBeLessThan(net);
    },
  );

  it("charges nothing on a zero net", () => {
    expect(paystackGrossUp(0, cfg)).toEqual({ gross: 0, charge: 0 });
  });
});

describe("bufferAmount", () => {
  it("rounds 10% up to ₦50", () => {
    expect(bufferAmount(12_300_00, 10, 50_00)).toBe(1_250_00);
    expect(bufferAmount(10_000_00, 10, 50_00)).toBe(1_000_00);
  });
  it("is zero for 0%", () => {
    expect(bufferAmount(10_000_00, 0, 50_00)).toBe(0);
  });
});

describe("orderTotals", () => {
  const base = {
    itemBudgets: [3_000_00, 2_500_00, 4_500_00],
    bufferPct: 10,
    deliveryFee: 800_00,
    walletBalance: 0,
    applyWallet: false,
    settings: S,
  };

  it("adds budgets, buffer, fees and grosses up for Paystack", () => {
    const t = orderTotals(base);
    expect(t.budgets).toBe(10_000_00);
    expect(t.buffer).toBe(1_000_00);
    const net = 10_000_00 + 1_000_00 + 500_00 + 800_00;
    expect(t.chargeAmount - t.paystackCharge).toBe(net);
    expect(t.grandTotal).toBe(t.chargeAmount);
  });

  it("applies the wallet before Paystack", () => {
    const t = orderTotals({ ...base, walletBalance: 5_000_00, applyWallet: true });
    expect(t.walletApplied).toBe(5_000_00);
    expect(t.chargeAmount - t.paystackCharge).toBe(12_300_00 - 5_000_00);
  });

  it("skips Paystack entirely when the wallet covers it", () => {
    const t = orderTotals({ ...base, walletBalance: 50_000_00, applyWallet: true });
    expect(t.walletApplied).toBe(12_300_00);
    expect(t.chargeAmount).toBe(0);
    expect(t.paystackCharge).toBe(0);
  });

  it("ignores the wallet when not applied", () => {
    expect(orderTotals({ ...base, walletBalance: 50_000_00 }).walletApplied).toBe(0);
  });
});

describe("completionCredits", () => {
  it("returns leftovers, rejections and unused buffer", () => {
    const credits = completionCredits(
      [
        { budget: 3_000_00, approvedExtra: 500_00, amountSpent: 3_500_00, status: "adjusted" },
        { budget: 2_000_00, approvedExtra: 0, amountSpent: 1_800_00, status: "bought" },
        { budget: 1_500_00, approvedExtra: 0, amountSpent: 0, status: "skipped" },
        { budget: 4_000_00, approvedExtra: 0, amountSpent: 3_900_00, status: "rejected" },
      ],
      { buffer: 1_100_00, bufferUsed: 500_00 },
    );
    expect(credits.rejection).toBe(3_900_00);
    // 0 + 200 + 1,500 + 100 leftover on items, + 600 unused buffer
    expect(credits.leftover).toBe(2_400_00);
  });

  it("never credits below zero", () => {
    expect(
      completionCredits([{ budget: 1_000_00, approvedExtra: 0, amountSpent: 1_000_00, status: "bought" }], {
        buffer: 0,
        bufferUsed: 0,
      }),
    ).toEqual({ leftover: 0, rejection: 0 });
  });
});

describe("cancellationRefund", () => {
  const totals = { chargeAmount: 12_587_00, paystackCharge: 287_00, walletApplied: 1_000_00 };
  it("keeps the Paystack charge by default", () => {
    expect(cancellationRefund(totals, false)).toBe(12_587_00 + 1_000_00 - 287_00);
  });
  it("refunds everything when configured", () => {
    expect(cancellationRefund(totals, true)).toBe(13_587_00);
  });
});

describe("fundExtra", () => {
  it("uses buffer first, then wallet", () => {
    expect(fundExtra(1_500_00, 1_000_00, 2_000_00)).toEqual({ fromBuffer: 1_000_00, fromWallet: 500_00 });
  });
  it("uses only buffer when it covers the extra", () => {
    expect(fundExtra(800_00, 1_000_00, 0)).toEqual({ fromBuffer: 800_00, fromWallet: 0 });
  });
  it("refuses when buffer and wallet together fall short", () => {
    expect(fundExtra(1_500_00, 1_000_00, 400_00)).toBeNull();
  });
});

describe("geofence", () => {
  it("accepts central Akure and rejects Ondo town", () => {
    expect(isInsidePolygon({ lat: 7.2526, lng: 5.1931 }, S.geofence)).toBe(true); // Oja Oba area
    expect(isInsidePolygon({ lat: 7.0932, lng: 4.8353 }, S.geofence)).toBe(false); // Ondo town
  });
  it("computes bearings", () => {
    expect(Math.round(bearingDegrees({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }))).toBe(0);
    expect(Math.round(bearingDegrees({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }))).toBe(90);
  });
});

describe("order transitions", () => {
  it("blocks cancellation after shopping starts", () => {
    expect(canTransitionOrder("assigned", "cancelled")).toBe(true);
    expect(canTransitionOrder("shopping", "cancelled")).toBe(false);
  });
});
