"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { WarningOctagon, Warning, X } from "@phosphor-icons/react";
import { api } from "@ojarun/convex/api";
import type { Id } from "@ojarun/convex/dataModel";
import { formatLagosTime } from "@ojarun/shared";

const SHOWN = 3;

/**
 * Open ops alerts (blocked or failed transfers, low Paystack balance) on every page until someone
 * deals with them. SMS and email for the same alerts arrive with notifications in M7.
 */
export function AlertsBanner() {
  const alerts = useQuery(api.ops.transfers.alerts);
  const dismiss = useMutation(api.ops.transfers.dismissAlert);
  const [busy, setBusy] = useState<Id<"opsAlerts"> | null>(null);
  const [expanded, setExpanded] = useState(false);
  if (!alerts?.length) return null;
  const shown = expanded ? alerts : alerts.slice(0, SHOWN);

  return (
    <section aria-label="Alerts" className="mb-8 flex flex-col gap-2">
      {shown.map((a) => {
        const critical = a.severity === "critical";
        const Icon = critical ? WarningOctagon : Warning;
        return (
          <div
            key={a._id}
            role={critical ? "alert" : "status"}
            className={`flex items-start gap-3 rounded-card px-4 py-3 ring-1 ${
              critical ? "bg-error-tint ring-error/30" : "bg-accent-tint ring-accent/30"
            }`}
          >
            <Icon size={20} weight="fill" className={`mt-0.5 shrink-0 ${critical ? "text-error" : "text-accent-strong"}`} />
            <p className="min-w-0 flex-1 text-small">
              {a.message}
              <span className="tabular ml-2 text-caption text-ink-muted">{formatLagosTime(a.at)}</span>
            </p>
            {a.kind !== "low_balance" ? (
              <Link href={a.kind === "customer_unavailable" ? "/orders?status=arrived" : "/transfers"} className="shrink-0 text-small font-semibold text-brand hover:underline">
                Review
              </Link>
            ) : null}
            <button
              type="button"
              aria-label="Dismiss"
              disabled={busy === a._id}
              onClick={async () => {
                setBusy(a._id);
                try {
                  await dismiss({ alertId: a._id });
                } finally {
                  setBusy(null);
                }
              }}
              className="-m-1 shrink-0 rounded-input p-1 text-ink-muted hover:bg-surface/60 hover:text-ink disabled:opacity-40"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
      {alerts.length > SHOWN ? (
        <button type="button" onClick={() => setExpanded((e) => !e)} className="self-start text-small font-medium text-brand hover:underline">
          {expanded ? "Show fewer" : `Show all ${alerts.length} alerts`}
        </button>
      ) : null}
    </section>
  );
}
