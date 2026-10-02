"use client";

import { useQuery } from "convex/react";
import { api } from "@ojarun/convex/api";
import { formatNaira } from "@ojarun/shared";
import { PageHeader } from "@/components/ui";

/** Read-only in M0; the editable settings form lands in M1 (05 §9). */
export default function SettingsPage() {
  const s = useQuery(api.settings.get);

  if (s === undefined) return <div className="h-64 max-w-3xl animate-pulse rounded-card bg-surface-sunken" aria-busy="true" />;

  const rows: [string, string][] = [
    ["Service fee", formatNaira(s.serviceFeeKobo)],
    [
      "Delivery fee",
      `${formatNaira(s.deliveryFee.baseKobo)} + ${formatNaira(s.deliveryFee.perKmKobo)}/km, ${formatNaira(s.deliveryFee.minKobo)}–${formatNaira(s.deliveryFee.maxKobo)}`,
    ],
    ["Buffer options", s.bufferPresets.map((p) => `${p}%`).join(" · ") + ` (default ${s.defaultBufferPct}%)`],
    ["Price-check timeout", `${Math.round(s.priceCheckTimeoutSec / 60)} min`],
    ["Minimum withdrawal", formatNaira(s.minWithdrawalKobo)],
    ["Paystack charge on cancel", s.refundPaystackChargeOnCancel ? "Refunded" : "Kept"],
    ["Orders per batch", String(s.maxOrdersPerBatch)],
    ["Payment hold", `${s.paymentHoldMinutes} min`],
    ["Price guide", s.showPriceGuide ? "Shown to customers" : "Collecting silently"],
    ["Support WhatsApp", s.supportWhatsapp || "Not set"],
    ["Support phone", s.supportPhone || "Not set"],
  ];

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" description="Fees, timings and support contacts. Editing arrives with markets and slots in the next milestone." />
      <dl className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[220px_1fr] gap-4 px-5 py-3.5">
            <dt className="text-small text-ink-muted">{k}</dt>
            <dd className="tabular text-small font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
