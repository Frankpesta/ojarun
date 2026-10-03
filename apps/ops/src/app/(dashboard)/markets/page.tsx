"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@ojarun/convex/api";
import { formatMinutes, parseMinutes } from "@ojarun/shared";
import { Drawer } from "@/components/Drawer";
import { Button, EmptyState, PageHeader, Pill } from "@/components/ui";
import { errorMessage, Field, FormError, ReasonField, reasonOk, Skeleton, TextInput } from "@/components/form";
import { AKURE_CENTRE, mapsAvailable, PinPicker } from "@/components/maps";

type Market = FunctionReturnType<typeof api.ops.markets.list>[number];

export default function MarketsPage() {
  const markets = useQuery(api.ops.markets.list);
  const [editing, setEditing] = useState<Market | "new" | null>(null);

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Markets"
        description="Where shoppers buy. The pin sets delivery distance, so place it on the main entrance."
        actions={<Button onClick={() => setEditing("new")}>Add market</Button>}
      />

      {markets === undefined ? (
        <Skeleton />
      ) : markets.length === 0 ? (
        <EmptyState title="No markets yet" body="Add one, or run the seed to load the main Akure markets." />
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <table className="w-full text-left text-small">
            <thead className="border-b border-line text-caption uppercase tracking-wider text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Market</th>
                <th className="px-4 py-3 font-medium">Hours</th>
                <th className="px-4 py-3 font-medium">Pin</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {markets.map((m) => (
                <tr key={m._id} className="hover:bg-surface-sunken/60">
                  <td className="px-4 py-3 font-medium">{m.name}</td>
                  <td className="tabular px-4 py-3 text-ink-muted">
                    {formatMinutes(m.opensAtMin)}–{formatMinutes(m.closesAtMin)}
                  </td>
                  <td className="tabular px-4 py-3 text-ink-muted">
                    {m.lat.toFixed(4)}, {m.lng.toFixed(4)}
                  </td>
                  <td className="px-4 py-3">
                    <Pill tone={m.active ? "brand" : "muted"}>{m.active ? "Open for orders" : "Hidden"}</Pill>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(m)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing ? (
        <MarketDrawer
          market={editing === "new" ? null : editing}
          nextSortOrder={markets?.length ?? 0}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function MarketDrawer({ market, nextSortOrder, onClose }: { market: Market | null; nextSortOrder: number; onClose: () => void }) {
  const upsert = useMutation(api.ops.markets.upsert);
  const [name, setName] = useState(market?.name ?? "");
  const [pin, setPin] = useState({ lat: market?.lat ?? AKURE_CENTRE.lat, lng: market?.lng ?? AKURE_CENTRE.lng });
  const [opens, setOpens] = useState(formatMinutes(market?.opensAtMin ?? 7 * 60));
  const [closes, setCloses] = useState(formatMinutes(market?.closesAtMin ?? 18 * 60));
  const [active, setActive] = useState(market?.active ?? true);
  const [reason, setReason] = useState(market ? "" : "New market");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const opensMin = parseMinutes(opens);
  const closesMin = parseMinutes(closes);
  const valid = name.trim().length >= 2 && opensMin !== null && closesMin !== null && opensMin < closesMin && reasonOk(reason);

  const save = async () => {
    if (opensMin === null || closesMin === null) return;
    setSaving(true);
    setError(null);
    try {
      await upsert({
        id: market?._id,
        name,
        ...pin,
        opensAtMin: opensMin,
        closesAtMin: closesMin,
        sortOrder: market?.sortOrder ?? nextSortOrder,
        active,
        reason,
      });
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
      title={market ? `Edit ${market.name}` : "Add a market"}
      description="Customers see active markets in this order, with a delivery fee from each."
      footer={
        <>
          <Button onClick={save} loading={saving} disabled={!valid}>
            {market ? "Save changes" : "Add market"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Oja Oba" />
        </Field>

        <div className="flex flex-col gap-2">
          <span className="text-small font-medium text-ink-muted">Entrance pin</span>
          {mapsAvailable ? (
            <PinPicker value={pin} onChange={setPin} />
          ) : (
            <p className="text-caption text-ink-faint">Add NEXT_PUBLIC_GOOGLE_MAPS_KEY to drag a pin on a map. For now, type the coordinates.</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude">
              <TextInput
                inputMode="decimal"
                value={pin.lat}
                onChange={(e) => setPin((p) => ({ ...p, lat: Number(e.target.value) }))}
                className="tabular"
              />
            </Field>
            <Field label="Longitude">
              <TextInput
                inputMode="decimal"
                value={pin.lng}
                onChange={(e) => setPin((p) => ({ ...p, lng: Number(e.target.value) }))}
                className="tabular"
              />
            </Field>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Opens">
            <TextInput type="time" value={opens} onChange={(e) => setOpens(e.target.value)} />
          </Field>
          <Field label="Closes">
            <TextInput type="time" value={closes} onChange={(e) => setCloses(e.target.value)} />
          </Field>
        </div>

        <label className="flex cursor-pointer items-center justify-between rounded-card px-4 py-3 ring-1 ring-line-strong">
          <span>
            <span className="block font-medium">Open for orders</span>
            <span className="text-caption text-ink-muted">Hidden markets keep their history but can't be picked.</span>
          </span>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-5 w-5 accent-[rgb(var(--color-brand))]" />
        </label>

        <ReasonField value={reason} onChange={setReason} />
        <FormError message={error} />
      </div>
    </Drawer>
  );
}
