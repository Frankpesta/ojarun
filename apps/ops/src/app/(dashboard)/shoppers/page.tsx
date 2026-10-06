"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@ojarun/convex/api";
import { formatLagosTime, formatNigerianPhone } from "@ojarun/shared";
import { Drawer } from "@/components/Drawer";
import { Button, EmptyState, PageHeader, Pill } from "@/components/ui";
import { errorMessage, FormError, ReasonField, reasonOk, Skeleton } from "@/components/form";

type Row = FunctionReturnType<typeof api.ops.shoppers.list>[number];
type Change = { shopper: Row; field: "onShift" | "active"; value: boolean };

export default function ShoppersPage() {
  const shoppers = useQuery(api.ops.shoppers.list);
  const [change, setChange] = useState<Change | null>(null);
  const onShift = shoppers?.filter((s) => s.onShift).length ?? 0;

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Shoppers"
        description="Who's on shift decides who gets proposed batches at cutoff. Shoppers switch themselves on in the app; you can do it here too."
        actions={
          <Link href="/users" className="inline-flex h-11 items-center rounded-button bg-brand px-5 font-semibold text-on-brand hover:bg-brand-pressed">
            Add shopper
          </Link>
        }
      />

      {shoppers === undefined ? (
        <Skeleton />
      ) : shoppers.length === 0 ? (
        <EmptyState
          title="No shoppers yet"
          body="Ask the shopper to sign in on the app once, then find them under People and change their role to Shopper."
        />
      ) : (
        <>
          <p className="mb-3 text-small text-ink-muted">
            <span className="tabular font-medium text-ink">{onShift}</span> of {shoppers.length} on shift now
          </p>
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            <table className="w-full text-left text-small">
              <thead className="border-b border-line text-caption uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Shopper</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Last seen at market</th>
                  <th className="px-4 py-3 font-medium">Shift</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shoppers.map((s) => (
                  <tr key={s._id} className={`hover:bg-surface-sunken/60 ${s.active ? "" : "text-ink-faint"}`}>
                    <td className="px-4 py-3">
                      <span className="font-medium">{s.legalName ?? s.name ?? "No name"}</span>
                      {!s.legalName ? (
                        <span className="ml-2">
                          <Pill tone="error">No legal name</Pill>
                        </span>
                      ) : null}
                      {s.name && s.legalName && s.name !== s.legalName ? (
                        <span className="block text-caption text-ink-muted">Goes by {s.name}</span>
                      ) : null}
                    </td>
                    <td className="tabular px-4 py-3 text-ink-muted">{s.phone ? formatNigerianPhone(s.phone) : "—"}</td>
                    <td className="tabular px-4 py-3 text-ink-muted">{s.lastLocation ? formatLagosTime(s.lastLocation.at) : "—"}</td>
                    <td className="px-4 py-3">
                      {!s.active ? (
                        <Pill tone="muted">Inactive</Pill>
                      ) : (
                        <button
                          role="switch"
                          aria-checked={s.onShift}
                          aria-label={`${s.legalName ?? s.name} on shift`}
                          onClick={() => setChange({ shopper: s, field: "onShift", value: !s.onShift })}
                          className={`relative h-6 w-11 rounded-full transition-colors ${s.onShift ? "bg-brand" : "bg-line-strong"}`}
                        >
                          <span
                            className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-all ${s.onShift ? "left-[22px]" : "left-0.5"}`}
                          />
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="secondary" onClick={() => setChange({ shopper: s, field: "active", value: !s.active })}>
                        {s.active ? "Deactivate" : "Reactivate"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {change ? <ChangeDrawer change={change} onClose={() => setChange(null)} /> : null}
    </div>
  );
}

function ChangeDrawer({ change, onClose }: { change: Change; onClose: () => void }) {
  const setShift = useMutation(api.ops.shoppers.setShift);
  const setActive = useMutation(api.ops.shoppers.setActive);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const name = change.shopper.legalName ?? change.shopper.name ?? "this shopper";

  const copy =
    change.field === "onShift"
      ? change.value
        ? { title: `Put ${name} on shift?`, body: "They'll be offered batches at the next cutoff.", cta: "Put on shift" }
        : { title: `Take ${name} off shift?`, body: "They won't get new proposals. Batches already confirmed stay with them until you reassign.", cta: "Take off shift" }
      : change.value
        ? { title: `Reactivate ${name}?`, body: "They can go on shift and receive batches again.", cta: "Reactivate" }
        : { title: `Deactivate ${name}?`, body: "They go off shift and can't be given batches. Their history stays.", cta: "Deactivate" };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const args = { userId: change.shopper._id, reason };
      if (change.field === "onShift") await setShift({ ...args, onShift: change.value });
      else await setActive({ ...args, active: change.value });
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
      title={copy.title}
      description={copy.body}
      footer={
        <>
          <Button onClick={save} loading={saving} disabled={!reasonOk(reason)} variant={change.value ? "primary" : "danger"}>
            {copy.cta}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ReasonField value={reason} onChange={setReason} placeholder="e.g. Called in sick this morning" />
        <FormError message={error} />
      </div>
    </Drawer>
  );
}
