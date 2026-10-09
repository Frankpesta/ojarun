"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@ojarun/convex/api";
import type { Id } from "@ojarun/convex/dataModel";
import { formatLagosTime, formatNaira, formatNairaDigits, parseNairaInput } from "@ojarun/shared";
import { Drawer } from "@/components/Drawer";
import { Button, Pill } from "@/components/ui";
import { errorMessage, Field, FormError, TextArea, TextInput } from "@/components/form";

type Board = NonNullable<FunctionReturnType<typeof api.ops.dispatch.board>>;
type Batch = Board["markets"][number]["batches"][number];
type Cash = Batch["cash"];

/**
 * A confirmed batch's cash advance (05 §6.5): issue it at dispatch, watch it being spent, and
 * count what comes back at the end of the run.
 */
export function CashRow({ batch, budgets }: { batch: Batch; budgets: number }) {
  const [sheet, setSheet] = useState<"issue" | "reconcile" | null>(null);
  const { advance, suggested } = batch.cash;
  if (batch.status === "proposed") return null;

  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
      <div className="min-w-0 text-small">
        <span className="text-caption font-medium uppercase tracking-wider text-ink-muted">Cash</span>
        {!advance ? (
          <p className="text-ink-faint">None issued</p>
        ) : (
          <p className="tabular">
            {formatNaira(advance.amount)}
            <span className="text-ink-muted"> · {formatNaira(advance.spent)} spent</span>
            <span className="ml-2 align-middle">
              {advance.status === "issued" ? (
                advance.receivedAt ? <Pill tone="brand">With shopper</Pill> : <Pill tone="accent">Not confirmed</Pill>
              ) : advance.status === "reconciled" ? (
                <Pill tone="muted">Balanced</Pill>
              ) : (
                <Pill tone="error">{advance.variance! > 0 ? `${formatNaira(advance.variance!)} short` : `${formatNaira(-advance.variance!)} over`}</Pill>
              )}
            </span>
          </p>
        )}
      </div>
      {!advance || advance.status !== "issued" ? (
        batch.status !== "done" && !advance ? (
          <Button size="sm" variant="secondary" onClick={() => setSheet("issue")}>
            Issue cash
          </Button>
        ) : null
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setSheet("reconcile")}>
          Reconcile
        </Button>
      )}
      {sheet === "issue" ? (
        <IssueDrawer batchId={batch._id} shopperName={batch.shopper?.name ?? "the shopper"} suggested={suggested} budgets={budgets} onClose={() => setSheet(null)} />
      ) : null}
      {sheet === "reconcile" && advance ? (
        <ReconcileDrawer batchId={batch._id} advance={advance} shopperName={batch.shopper?.name ?? "the shopper"} onClose={() => setSheet(null)} />
      ) : null}
    </div>
  );
}

function IssueDrawer({
  batchId,
  shopperName,
  suggested,
  budgets,
  onClose,
}: {
  batchId: Id<"batches">;
  shopperName: string;
  suggested: number;
  budgets: number;
  onClose: () => void;
}) {
  const issue = useMutation(api.ops.cash.issueAdvance);
  const [text, setText] = useState(formatNairaDigits(suggested));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const amount = parseNairaInput(text);
  const valid = amount !== null && amount > 0 && amount <= budgets;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      await issue({ batchId, amount: amount!, reason: reason.trim() || undefined });
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
      critical
      onOpenChange={(o) => !o && onClose()}
      title={`Give ${shopperName} cash`}
      description="For traders who only take cash. The shopper confirms they got it in the app before they can spend any, and every cash spend needs a photo of the trader."
      footer={
        <>
          <Button onClick={save} loading={saving} disabled={!valid}>
            Issue {amount ? formatNaira(amount) : "cash"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Amount (₦)" hint={`Suggested ${formatNaira(suggested)} · the batch's budgets are ${formatNaira(budgets)}`}>
          <TextInput inputMode="numeric" value={text} onChange={(e) => setText(e.target.value)} className="tabular text-heading" />
        </Field>
        {amount !== null && amount > budgets ? <FormError message="That's more than the batch's item budgets." /> : null}
        <Field label="Note (optional, saved to the audit log)">
          <TextArea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Pepper row at Isikan is cash only" />
        </Field>
        <FormError message={error} />
      </div>
    </Drawer>
  );
}

function ReconcileDrawer({
  batchId,
  advance,
  shopperName,
  onClose,
}: {
  batchId: Id<"batches">;
  advance: NonNullable<Cash["advance"]>;
  shopperName: string;
  onClose: () => void;
}) {
  const detail = useQuery(api.ops.cash.forBatch, { batchId });
  const reconcile = useMutation(api.ops.cash.reconcile);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const spends = detail?.find((a) => a._id === advance._id)?.spends ?? [];
  const returned = parseNairaInput(text);
  const expected = advance.amount - advance.spent;
  const variance = returned === null ? null : expected - returned;
  const needsNote = variance !== null && variance !== 0;
  const valid = returned !== null && (!needsNote || note.trim().length >= 3);

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      await reconcile({ advanceId: advance._id, returnedAmount: returned!, note: note.trim() || undefined });
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
      critical
      onOpenChange={(o) => !o && onClose()}
      title={`Count ${shopperName}'s cash`}
      description="Check each spend against its photos, then enter the cash handed back."
      footer={
        <>
          <Button onClick={save} loading={saving} disabled={!valid} variant={needsNote ? "danger" : "primary"}>
            {needsNote ? "Save with variance" : "Reconcile"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <dl className="grid grid-cols-3 gap-3 text-small">
          {[
            ["Issued", advance.amount],
            ["Spent", advance.spent],
            ["Should come back", expected],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-card bg-surface-sunken px-3 py-2.5">
              <dt className="text-caption text-ink-muted">{label}</dt>
              <dd className="tabular font-semibold">{formatNaira(value as number)}</dd>
            </div>
          ))}
        </dl>

        <div>
          <p className="mb-2 text-small font-medium text-ink-muted">
            {spends.length} cash {spends.length === 1 ? "spend" : "spends"}
          </p>
          {detail === undefined ? (
            <div className="h-20 animate-pulse rounded-card bg-surface-sunken" />
          ) : spends.length === 0 ? (
            <p className="text-small text-ink-faint">No cash was spent.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-card ring-1 ring-line">
              {spends.map((s) => (
                <li key={s._id} className="flex items-center gap-3 px-3 py-2.5">
                  {[s.itemPhotoUrl, s.traderPhotoUrl].map((url, i) =>
                    url ? (
                      <a key={i} href={url} target="_blank" rel="noreferrer" className="shrink-0" title={i ? "Trader photo" : "Item photo"}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={i ? "Trader and stall" : s.itemName} className="h-12 w-12 rounded-input object-cover ring-1 ring-line" />
                      </a>
                    ) : (
                      <span key={i} className="h-12 w-12 shrink-0 rounded-input bg-surface-sunken" />
                    ),
                  )}
                  <div className="min-w-0 flex-1 text-small">
                    <p className="font-medium">
                      {s.itemName} <span className="font-mono text-caption text-ink-faint">{s.orderCode}</span>
                    </p>
                    <p className="truncate text-caption text-ink-muted">
                      {s.traderLabel ?? "No trader note"} · {formatLagosTime(s.at)}
                    </p>
                  </div>
                  <span className="tabular text-small font-semibold">{formatNaira(s.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Field label="Cash handed back (₦)">
          <TextInput inputMode="numeric" value={text} onChange={(e) => setText(e.target.value)} placeholder={formatNairaDigits(expected)} className="tabular text-heading" />
        </Field>
        {variance !== null && variance !== 0 ? (
          <div className="rounded-card bg-error-tint px-4 py-3 text-small">
            <p className="font-semibold">{variance > 0 ? `${formatNaira(variance)} is missing` : `${formatNaira(-variance)} more than expected`}</p>
            <p className="text-ink-muted">This is flagged on {shopperName}'s shopper record. Note what they said.</p>
          </div>
        ) : null}
        {needsNote ? (
          <Field label="Note (required)">
            <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What the shopper said about the difference" />
          </Field>
        ) : null}
        <FormError message={error} />
      </div>
    </Drawer>
  );
}
