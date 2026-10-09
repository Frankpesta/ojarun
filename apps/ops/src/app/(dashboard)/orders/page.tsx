"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@ojarun/convex/api";
import type { Id } from "@ojarun/convex/dataModel";
import { formatLagosDay, formatLagosTime, formatNaira, lagosDate, ORDER_STATUS_LABEL, parseNairaInput, type OrderStatus } from "@ojarun/shared";
import { Drawer } from "@/components/Drawer";
import { Button, EmptyState, PageHeader, Pill } from "@/components/ui";
import { errorMessage, Field, FormError, ReasonField, reasonOk, Skeleton, TextInput } from "@/components/form";

type Detail = NonNullable<FunctionReturnType<typeof api.ops.orders.detail>>;
type Action = "cancel" | "complete" | "adjust" | null;

const TONE: Record<OrderStatus, "brand" | "muted" | "accent" | "error"> = {
  pending_payment: "muted",
  paid: "accent",
  assigned: "accent",
  shopping: "brand",
  en_route: "brand",
  arrived: "brand",
  completed: "muted",
  cancelled: "error",
  expired: "muted",
};

const FILTERS: { value?: OrderStatus; label: string }[] = [
  { label: "All" },
  { value: "paid", label: "Paid" },
  { value: "assigned", label: "Assigned" },
  { value: "shopping", label: "Shopping" },
  { value: "en_route", label: "On the way" },
  { value: "arrived", label: "At the door" },
  { value: "completed", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

const OUTCOMES = [
  { value: "returned_to_trader", label: "Returned to trader" },
  { value: "staff", label: "Given to staff" },
  { value: "discarded", label: "Discarded" },
] as const;

function stamp(ms: number) {
  const day = lagosDate(ms);
  return day === lagosDate(Date.now()) ? formatLagosTime(ms) : `${formatLagosDay(day, Date.now())} ${formatLagosTime(ms)}`;
}

export default function OrdersPage() {
  const [status, setStatus] = useState<OrderStatus | undefined>(undefined);
  const orders = useQuery(api.ops.orders.list, { status });
  const [open, setOpen] = useState<Id<"orders"> | null>(null);

  return (
    <div className="max-w-6xl">
      <PageHeader title="Orders" description="Every order, newest first. Open one to see its items and money, cancel it, or finish it for a customer who can't be reached." />
      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Status">
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
      {orders === undefined ? (
        <Skeleton />
      ) : orders.length === 0 ? (
        <EmptyState title="No orders here" />
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full text-left text-small">
            <thead className="border-b border-line text-caption uppercase tracking-wider text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Market · window</th>
                <th className="px-4 py-3 font-medium">Shopper</th>
                <th className="px-4 py-3 text-right font-medium">Paid</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {orders.map((o) => (
                <tr key={o._id} onClick={() => setOpen(o._id)} className="cursor-pointer hover:bg-surface-sunken/60">
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => setOpen(o._id)} className="font-mono font-semibold text-brand hover:underline">
                      {o.code}
                    </button>
                    <span className="tabular block text-caption text-ink-faint">{stamp(o.at)}</span>
                  </td>
                  <td className="px-4 py-3">{o.customerName}</td>
                  <td className="px-4 py-3 text-ink-muted">
                    {o.marketName}
                    {o.window ? <span className="tabular block text-caption">{formatLagosDay(o.window.date, Date.now())} {formatLagosTime(o.window.start)}–{formatLagosTime(o.window.end)}</span> : null}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{o.shopperName ?? "—"}</td>
                  <td className="tabular px-4 py-3 text-right font-medium">{formatNaira(o.total)}</td>
                  <td className="px-4 py-3">
                    <Pill tone={TONE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Pill>
                    {o.unavailable ? <span className="mt-1 block"><Pill tone="error">Customer not answering</Pill></span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open ? <OrderDrawer orderId={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function OrderDrawer({ orderId, onClose }: { orderId: Id<"orders">; onClose: () => void }) {
  const order = useQuery(api.ops.orders.detail, { orderId });
  const setOutcome = useMutation(api.ops.orders.setRejectionOutcome);
  const [action, setAction] = useState<Action>(null);
  const [error, setError] = useState<string | null>(null);

  if (action && order) return <ActionDrawer order={order} action={action} onClose={() => setAction(null)} />;

  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title={order ? `Order ${order.code}` : "Order"} description={order ? `${order.marketName} · ${ORDER_STATUS_LABEL[order.status]}` : undefined}>
      {!order ? (
        <Skeleton />
      ) : (
        <div className="flex flex-col gap-6 pb-2 text-small">
          {order.unavailableAt && order.status === "arrived" ? (
            <p className="rounded-card bg-error-tint px-4 py-3">
              The shopper couldn't reach the customer at {formatLagosTime(order.unavailableAt)}. Call {order.customer?.name} on{" "}
              <span className="tabular font-semibold">{order.customer?.phone ?? "no number"}</span>.
            </p>
          ) : null}
          <dl className="grid grid-cols-[8rem_1fr] gap-y-1.5">
            <dt className="text-ink-muted">Customer</dt>
            <dd>
              {order.customer?.name} · <span className="tabular">{order.customer?.phone ?? "—"}</span> · wallet {formatNaira(order.customer?.walletBalance ?? 0)}
            </dd>
            <dt className="text-ink-muted">Shopper</dt>
            <dd>{order.shopper ? `${order.shopper.name} · ${order.shopper.phone ?? "—"}` : "—"}</dd>
            <dt className="text-ink-muted">Address</dt>
            <dd>
              {order.address.formatted} · {order.address.landmark}
            </dd>
            {order.arrivedDistanceMeters !== null ? (
              <>
                <dt className="text-ink-muted">Arrived</dt>
                <dd className={order.arrivedDistanceMeters > 500 ? "font-semibold text-error" : ""}>{Math.round(order.arrivedDistanceMeters)} m from the pin</dd>
              </>
            ) : null}
            {order.cancelReason ? (
              <>
                <dt className="text-ink-muted">Cancelled</dt>
                <dd>{order.cancelReason}</dd>
              </>
            ) : null}
            {order.completedReason ? (
              <>
                <dt className="text-ink-muted">Completed by ops</dt>
                <dd>{order.completedReason}</dd>
              </>
            ) : null}
          </dl>

          <div>
            <p className="mb-2 font-semibold">Items</p>
            <ul className="divide-y divide-line rounded-card ring-1 ring-line">
              {order.items.map((i) => (
                <li key={i._id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  {i.photoUrl ? (
                    <a href={i.photoUrl} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={i.photoUrl} alt={i.name} className="h-10 w-10 rounded-input object-cover" />
                    </a>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {i.name} <span className="text-ink-muted">· {i.status}</span>
                    </p>
                    <p className="tabular text-caption text-ink-muted">
                      {formatNaira(i.amountSpent)} of {formatNaira(i.budget + i.approvedExtra)}
                      {i.rejectionReason ? ` · rejected: ${i.rejectionReason}` : i.shopperNote ? ` · ${i.shopperNote}` : ""}
                    </p>
                  </div>
                  {i.status === "rejected" ? (
                    <select
                      aria-label={`What happened to the rejected ${i.name}`}
                      value={i.rejectionOutcome ?? ""}
                      onChange={async (e) => {
                        setError(null);
                        try {
                          await setOutcome({ itemId: i._id, outcome: e.target.value as (typeof OUTCOMES)[number]["value"], reason: "Recorded after the shopper returned" });
                        } catch (err) {
                          setError(errorMessage(err));
                        }
                      }}
                      className="h-9 rounded-input bg-surface px-2 text-small ring-1 ring-line-strong"
                    >
                      <option value="" disabled>
                        Outcome…
                      </option>
                      {OUTCOMES.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 font-semibold">Wallet entries for this order</p>
            {order.wallet.length === 0 ? (
              <p className="text-ink-faint">None yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {order.wallet.map((e, k) => (
                  <li key={k} className="flex justify-between">
                    <span className="text-ink-muted">
                      {e.type.replace(/_/g, " ")}
                      {e.note ? ` · ${e.note}` : ""}
                    </span>
                    <span className={`tabular font-medium ${e.amount < 0 ? "" : "text-brand"}`}>{formatNaira(e.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <FormError message={error} />
          <div className="flex flex-wrap gap-2">
            {["pending_payment", "paid", "assigned"].includes(order.status) ? (
              <Button variant="danger" size="sm" onClick={() => setAction("cancel")}>
                Cancel order
              </Button>
            ) : null}
            {order.status === "arrived" ? (
              <Button size="sm" onClick={() => setAction("complete")}>
                Complete for customer
              </Button>
            ) : null}
            {order.customer ? (
              <Button size="sm" variant="secondary" onClick={() => setAction("adjust")}>
                Adjust wallet
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </Drawer>
  );
}

function ActionDrawer({ order, action, onClose }: { order: Detail; action: Exclude<Action, null>; onClose: () => void }) {
  const cancel = useMutation(api.ops.orders.cancel);
  const complete = useMutation(api.ops.orders.completeOnBehalf);
  const adjust = useMutation(api.ops.orders.adjustWallet);
  const [reason, setReason] = useState("");
  const [refundCharge, setRefundCharge] = useState(true);
  const [amountText, setAmountText] = useState("");
  const [debit, setDebit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const amount = parseNairaInput(amountText);
  const valid = reasonOk(reason) && (action !== "adjust" || (amount !== null && amount > 0));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (action === "cancel") await cancel({ orderId: order._id, reason, refundCharge });
      else if (action === "complete") await complete({ orderId: order._id, reason });
      else await adjust({ userId: order.customer!._id, amount: debit ? -amount! : amount!, reason, orderId: order._id });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const copy = {
    cancel: {
      title: `Cancel order ${order.code}?`,
      body: `The customer gets ${formatNaira(order.cancelRefund)} back in their wallet${refundCharge ? ", including the Paystack charge" : ""}, and the slot is freed.`,
      cta: "Cancel order",
    },
    complete: {
      title: `Complete ${order.code} for the customer?`,
      body: "Use this when the customer can't be reached at the door but has agreed to the delivery. Credits are written as if they'd accepted. This can't be undone.",
      cta: "Complete order",
    },
    adjust: {
      title: `Adjust ${order.customer?.name ?? "customer"}'s wallet`,
      body: `Balance now ${formatNaira(order.customer?.walletBalance ?? 0)}. The customer sees this as "Adjustment by OjaRun".`,
      cta: debit ? "Take from wallet" : "Add to wallet",
    },
  }[action];

  return (
    <Drawer
      open
      critical
      onOpenChange={(o) => !o && onClose()}
      title={copy.title}
      description={copy.body}
      footer={
        <>
          <Button variant={action === "cancel" || debit ? "danger" : "primary"} loading={saving} disabled={!valid} onClick={save}>
            {copy.cta}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Back
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {action === "cancel" ? (
          <label className="flex items-center gap-3 text-small">
            <input type="checkbox" checked={refundCharge} onChange={(e) => setRefundCharge(e.target.checked)} className="h-5 w-5 accent-[var(--color-brand)]" />
            Refund the Paystack charge too (our fault, e.g. no shopper)
          </label>
        ) : null}
        {action === "adjust" ? (
          <>
            <div className="flex gap-2">
              {[false, true].map((d) => (
                <button
                  key={String(d)}
                  type="button"
                  onClick={() => setDebit(d)}
                  aria-pressed={debit === d}
                  className={`h-9 rounded-chip px-3 text-small font-medium ${debit === d ? "bg-brand-tint ring-1 ring-brand" : "ring-1 ring-line-strong"}`}
                >
                  {d ? "Take money" : "Give money"}
                </button>
              ))}
            </div>
            <Field label="Amount (₦)">
              <TextInput inputMode="numeric" value={amountText} onChange={(e) => setAmountText(e.target.value)} className="tabular" />
            </Field>
          </>
        ) : null}
        <ReasonField value={reason} onChange={setReason} placeholder={action === "cancel" ? "e.g. No shopper available for this slot" : action === "complete" ? "e.g. Customer said on the phone to leave it with the gateman" : "e.g. Goodwill for a late delivery"} />
        <FormError message={error} />
      </div>
    </Drawer>
  );
}
