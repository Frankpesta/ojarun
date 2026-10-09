"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@ojarun/convex/api";
import { formatLagosDay, formatLagosTime, formatNaira, lagosDate } from "@ojarun/shared";
import { Drawer } from "@/components/Drawer";
import { Button, EmptyState, PageHeader, Pill } from "@/components/ui";
import { errorMessage, FormError, ReasonField, reasonOk, Skeleton } from "@/components/form";

type Trader = FunctionReturnType<typeof api.ops.transfers.flaggedTraders>[number];
type Status = "queued" | "pending" | "success" | "failed" | "reversed" | "blocked";
type Review = { trader: Trader; decision: "approved" | "suspicious" };

const STATUS: Record<Status, { label: string; tone: "brand" | "muted" | "accent" | "error" }> = {
  queued: { label: "Queued", tone: "muted" },
  pending: { label: "Sending", tone: "accent" },
  success: { label: "Paid", tone: "brand" },
  failed: { label: "Failed", tone: "error" },
  reversed: { label: "Reversed", tone: "error" },
  blocked: { label: "Blocked", tone: "error" },
};

const FILTERS: { value: Status | undefined; label: string }[] = [
  { value: undefined, label: "All" },
  { value: "pending", label: "Sending" },
  { value: "failed", label: "Failed" },
  { value: "blocked", label: "Blocked" },
  { value: "reversed", label: "Reversed" },
  { value: "success", label: "Paid" },
];

/** "13:05" today, "Fri 2 Oct 13:05" otherwise, in Lagos time. */
function stamp(ms: number) {
  const day = lagosDate(ms);
  return day === lagosDate(Date.now()) ? formatLagosTime(ms) : `${formatLagosDay(day, Date.now())} ${formatLagosTime(ms)}`;
}

export default function TransfersPage() {
  const [status, setStatus] = useState<Status | undefined>(undefined);
  const transfers = useQuery(api.ops.transfers.list, { status });
  const flagged = useQuery(api.ops.transfers.flaggedTraders);
  const [review, setReview] = useState<Review | null>(null);
  const toReview = flagged?.filter((t) => t.review !== "suspicious") ?? [];
  const suspicious = flagged?.filter((t) => t.review === "suspicious") ?? [];

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Transfers"
        description="Money shoppers send to traders. New recipients are paid straight away and wait here for a look; blocked attempts never left the account."
        actions={<BalanceCard />}
      />

      <section aria-labelledby="review" className="mb-12">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="review" className="text-heading font-semibold">
            Traders to review
          </h2>
          {toReview.length ? <span className="text-small text-ink-muted">{toReview.length} waiting</span> : null}
        </div>
        {flagged === undefined ? (
          <Skeleton className="h-28" />
        ) : toReview.length === 0 ? (
          <EmptyState title="Nothing to review" body="New traders show up here after a shopper pays them for the first time." />
        ) : (
          <TraderTable traders={toReview} onReview={setReview} />
        )}
        {suspicious.length ? (
          <details className="mt-4">
            <summary className="cursor-pointer text-small font-medium text-ink-muted hover:text-ink">
              {suspicious.length} marked suspicious (payments to them are blocked)
            </summary>
            <div className="mt-3">
              <TraderTable traders={suspicious} onReview={setReview} />
            </div>
          </details>
        ) : null}
      </section>

      <section aria-labelledby="history">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="history" className="text-heading font-semibold">
            History
          </h2>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Status">
            {FILTERS.map((f) => (
              <button
                key={f.label}
                role="tab"
                aria-selected={status === f.value}
                onClick={() => setStatus(f.value)}
                className={`h-9 rounded-chip px-3 text-small font-medium transition-colors ${
                  status === f.value ? "bg-brand-tint text-ink ring-1 ring-brand" : "bg-surface text-ink-muted ring-1 ring-line-strong hover:text-ink"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {transfers === undefined ? (
          <Skeleton />
        ) : transfers.length === 0 ? (
          <EmptyState title={status ? `No ${STATUS[status].label.toLowerCase()} transfers` : "No transfers yet"} body="Transfers appear as shoppers pay traders at the market." />
        ) : (
          <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full text-left text-small">
              <thead className="border-b border-line text-caption uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 font-medium">Trader</th>
                  <th className="px-4 py-3 font-medium">Shopper</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {transfers.map((t) => (
                  <tr key={t._id} className="align-top hover:bg-surface-sunken/60">
                    <td className="tabular whitespace-nowrap px-4 py-3 text-ink-muted">{stamp(t.at)}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium">{t.itemName}</span>
                      <span className="block font-mono text-caption text-ink-faint">{t.orderCode}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium">{t.trader?.name ?? "—"}</span>
                      {t.trader ? (
                        <span className="block text-caption text-ink-muted">
                          {t.trader.bankName} · <span className="tabular">{t.trader.accountNumber}</span>
                        </span>
                      ) : null}
                      {t.newRecipient ? <span className="mt-1 inline-block"><Pill tone="accent">New recipient</Pill></span> : null}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{t.shopperName}</td>
                    <td className="tabular px-4 py-3 text-right font-medium">{formatNaira(t.amount)}</td>
                    <td className="px-4 py-3">
                      <Pill tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Pill>
                      {t.isRetry ? <span className="ml-1.5 text-caption text-ink-faint">retry</span> : null}
                      {t.failureReason && t.status !== "blocked" ? (
                        <span className="mt-1 block max-w-56 text-caption text-ink-muted">{t.failureReason}</span>
                      ) : null}
                      <span className="mt-1 block font-mono text-[11px] text-ink-faint">{t.reference}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Withdrawals />
      {review ? <ReviewDrawer review={review} onClose={() => setReview(null)} /> : null}
    </div>
  );
}

function TraderTable({ traders, onReview }: { traders: Trader[]; onReview: (r: Review) => void }) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface">
      <table className="w-full text-left text-small">
        <thead className="border-b border-line text-caption uppercase tracking-wider text-ink-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Account name</th>
            <th className="px-4 py-3 font-medium">Why</th>
            <th className="px-4 py-3 font-medium">Paid</th>
            <th className="px-4 py-3 font-medium">By</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {traders.map((t) => {
            const blocked = t.flagReason?.startsWith("Blocked") || t.review === "suspicious";
            return (
              <tr key={t._id} className="align-top hover:bg-surface-sunken/60">
                <td className="px-4 py-3">
                  <span className="font-semibold">{t.name}</span>
                  <span className="block text-caption text-ink-muted">
                    {t.bankName} · <span className="tabular">{t.accountNumber}</span>
                    {t.marketName ? ` · ${t.marketName}` : ""}
                  </span>
                </td>
                <td className="max-w-72 px-4 py-3">
                  <Pill tone={blocked ? "error" : "accent"}>{blocked ? (t.review === "suspicious" ? "Suspicious" : "Blocked") : "Check"}</Pill>
                  <span className="mt-1 block text-caption text-ink-muted">{t.flagReason ?? "New recipient"}</span>
                </td>
                <td className="tabular px-4 py-3">
                  {t.paidCount ? (
                    <>
                      {formatNaira(t.paidTotal)}
                      <span className="block text-caption text-ink-muted">
                        {t.paidCount} {t.paidCount === 1 ? "transfer" : "transfers"}
                      </span>
                    </>
                  ) : (
                    <span className="text-ink-faint">Nothing yet</span>
                  )}
                  {t.blockedCount ? <span className="block text-caption text-error">{t.blockedCount} blocked</span> : null}
                </td>
                <td className="px-4 py-3 text-ink-muted">{t.shoppers.join(", ") || "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    {t.review !== "suspicious" ? (
                      <Button size="sm" variant="secondary" onClick={() => onReview({ trader: t, decision: "suspicious" })}>
                        Suspicious
                      </Button>
                    ) : null}
                    <Button size="sm" onClick={() => onReview({ trader: t, decision: "approved" })}>
                      Approve
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ReviewDrawer({ review, onClose }: { review: Review; onClose: () => void }) {
  const reviewTrader = useMutation(api.ops.transfers.reviewTrader);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const approve = review.decision === "approved";

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await reviewTrader({ traderId: review.trader._id, decision: review.decision, reason });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={approve ? `Approve ${review.trader.name}?` : `Mark ${review.trader.name} suspicious?`}
      description={
        approve
          ? "They join the trader registry and stop showing here. Shoppers can keep paying them."
          : "Every future payment to this account is blocked and shows up as an alert. Shoppers won't see them in recent traders."
      }
      footer={
        <>
          <Button onClick={save} loading={saving} disabled={!reasonOk(reason)} variant={approve ? "primary" : "danger"}>
            {approve ? "Approve trader" : "Mark suspicious"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-[8rem_1fr] gap-y-1.5 rounded-card bg-surface-sunken px-4 py-3 text-small">
          <dt className="text-ink-muted">Account</dt>
          <dd className="tabular">
            {review.trader.bankName} · {review.trader.accountNumber}
          </dd>
          <dt className="text-ink-muted">Flagged for</dt>
          <dd>{review.trader.flagReason ?? "New recipient"}</dd>
          <dt className="text-ink-muted">Paid so far</dt>
          <dd className="tabular">{formatNaira(review.trader.paidTotal)}</dd>
        </dl>
        <ReasonField
          value={reason}
          onChange={setReason}
          placeholder={approve ? "e.g. Called the trader; sells peppers at Isikan" : "e.g. Account is the shopper's sister's"}
        />
        <FormError message={error} />
      </div>
    </Drawer>
  );
}

function BalanceCard() {
  const balance = useQuery(api.ops.transfers.balance);
  const refresh = useAction(api.ops.transfers.refreshBalance);
  const [busy, setBusy] = useState(false);
  if (!balance) return <Skeleton className="h-16 w-64" />;
  const low = balance.balance !== null && balance.balance < balance.threshold;

  return (
    <div className={`flex items-center gap-5 rounded-card px-4 py-3 ring-1 ${low ? "bg-error-tint ring-error/30" : "bg-surface ring-line"}`}>
      <div>
        <p className="text-caption font-medium uppercase tracking-wider text-ink-muted">Paystack balance</p>
        {!balance.configured ? (
          <p className="text-small text-ink-muted">No key set · transfers are simulated</p>
        ) : balance.balance === null ? (
          <p className="text-small text-ink-muted">Not checked yet</p>
        ) : (
          <p className="tabular text-heading font-semibold">
            {formatNaira(balance.balance)}
            <span className="ml-2 text-caption font-normal text-ink-muted">
              at {formatLagosTime(balance.checkedAt!)} · alert below {formatNaira(balance.threshold)}
            </span>
          </p>
        )}
      </div>
      {balance.configured ? (
        <Button
          size="sm"
          variant="secondary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await refresh();
            } finally {
              setBusy(false);
            }
          }}
        >
          Check now
        </Button>
      ) : null}
    </div>
  );
}

const W_STATUS = {
  requested: { label: "Queued", tone: "muted" },
  pending: { label: "Sending", tone: "accent" },
  success: { label: "Paid", tone: "brand" },
  failed: { label: "Failed · refunded", tone: "error" },
  reversed: { label: "Reversed · refunded", tone: "error" },
} as const;

/** Customer wallet withdrawals. Failures refund the wallet automatically; this is for follow-up. */
function Withdrawals() {
  const [onlyFailed, setOnlyFailed] = useState(false);
  const rows = useQuery(api.ops.orders.withdrawals, onlyFailed ? { status: "failed" } : {});
  return (
    <section aria-labelledby="withdrawals" className="mt-12">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="withdrawals" className="text-heading font-semibold">
          Withdrawals
        </h2>
        <label className="flex items-center gap-2 text-small text-ink-muted">
          <input type="checkbox" checked={onlyFailed} onChange={(e) => setOnlyFailed(e.target.checked)} className="h-4 w-4" />
          Failed only
        </label>
      </div>
      {rows === undefined ? (
        <Skeleton className="h-28" />
      ) : rows.length === 0 ? (
        <EmptyState title="No withdrawals" body="Customers withdraw wallet money to their saved bank account." />
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full text-left text-small">
            <thead className="border-b border-line text-caption uppercase tracking-wider text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">To</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((w) => (
                <tr key={w._id} className="align-top">
                  <td className="tabular whitespace-nowrap px-4 py-3 text-ink-muted">{stamp(w.at)}</td>
                  <td className="px-4 py-3">{w.customerName}</td>
                  <td className="px-4 py-3">
                    {w.name}
                    <span className="tabular block text-caption text-ink-muted">{w.account}</span>
                  </td>
                  <td className="tabular px-4 py-3 text-right font-medium">{formatNaira(w.amount)}</td>
                  <td className="px-4 py-3">
                    <Pill tone={W_STATUS[w.status].tone}>{W_STATUS[w.status].label}</Pill>
                    {w.failureReason ? <span className="mt-1 block max-w-56 text-caption text-ink-muted">{w.failureReason}</span> : null}
                    <span className="mt-1 block font-mono text-[11px] text-ink-faint">{w.reference}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
