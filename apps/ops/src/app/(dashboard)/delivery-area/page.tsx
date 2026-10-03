"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@ojarun/convex/api";
import { isInsidePolygon } from "@ojarun/shared";
import { Drawer } from "@/components/Drawer";
import { Button, PageHeader, Pill } from "@/components/ui";
import { errorMessage, Field, FormError, ReasonField, reasonOk, Skeleton, TextArea, TextInput } from "@/components/form";
import { GeofenceMap, mapsAvailable, type Ring } from "@/components/maps";

/** Accepts a GeoJSON Polygon, Feature, FeatureCollection, or a bare [[lng, lat], …] ring. */
function parseRing(text: string): Ring | string {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return "That isn't valid JSON.";
  }
  const pick = (g: unknown): unknown => {
    const o = g as { type?: string; coordinates?: unknown; geometry?: unknown; features?: unknown[] };
    if (Array.isArray(g)) return g;
    if (o?.type === "FeatureCollection") return pick(o.features?.[0]);
    if (o?.type === "Feature") return pick(o.geometry);
    if (o?.type === "Polygon") return (o.coordinates as unknown[])?.[0];
    return null;
  };
  const ring = pick(json);
  if (!Array.isArray(ring)) return "Paste a GeoJSON Polygon (or a Feature containing one).";
  const points = ring.filter((p): p is [number, number] => Array.isArray(p) && p.length >= 2 && p.every((n) => typeof n === "number"));
  if (points.length !== ring.length) return "Every point must be [longitude, latitude].";
  const first = points[0];
  const last = points.at(-1);
  const open = first && last && first[0] === last[0] && first[1] === last[1] ? points.slice(0, -1) : points;
  if (open.length < 3) return "The area needs at least 3 corners.";
  if (open.some(([lng, lat]) => Math.abs(lat) > 90 || Math.abs(lng) > 180)) return "Some points are not on Earth. Is the order [longitude, latitude]?";
  return open.map(([lng, lat]) => [lng, lat]);
}

const toGeoJson = (ring: Ring) =>
  JSON.stringify({ type: "Polygon", coordinates: [[...ring, ring[0]]] }, null, 2);

export default function DeliveryAreaPage() {
  const settings = useQuery(api.settings.get);
  const markets = useQuery(api.ops.markets.list);
  const [ring, setRing] = useState<Ring | null>(null);
  const [geoText, setGeoText] = useState("");
  const [geoError, setGeoError] = useState<string | null>(null);
  const [probe, setProbe] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings && !ring) {
      setRing(settings.geofence as Ring);
      setGeoText(toGeoJson(settings.geofence as Ring));
    }
  }, [settings, ring]);

  const changed = useMemo(
    () => !!settings && !!ring && JSON.stringify(settings.geofence) !== JSON.stringify(ring),
    [settings, ring],
  );

  const outside = useMemo(
    () => (ring && markets ? markets.filter((m) => m.active && !isInsidePolygon(m, ring)) : []),
    [ring, markets],
  );

  const probeResult = useMemo(() => {
    const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(probe);
    if (!m || !ring) return null;
    return isInsidePolygon({ lat: Number(m[1]), lng: Number(m[2]) }, ring);
  }, [probe, ring]);

  if (!settings || !ring) return <Skeleton className="h-[520px] max-w-5xl" />;

  const updateRing = (next: Ring) => {
    setRing(next);
    setGeoText(toGeoJson(next));
    setGeoError(null);
  };

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Delivery area"
        description="Addresses outside this shape are turned away when saved, and checked again at checkout."
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" disabled={!changed} onClick={() => updateRing(settings.geofence as Ring)}>
              Discard
            </Button>
            <Button disabled={!changed || outside.length > 0} onClick={() => setSaving(true)}>
              Save area
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-3">
          {mapsAvailable ? (
            <>
              <GeofenceMap ring={ring} onChange={updateRing} markers={(markets ?? []).filter((m) => m.active)} />
              <p className="text-caption text-ink-faint">Drag a corner to move it. Drag the faint midpoint of an edge to add a corner.</p>
            </>
          ) : (
            <div className="rounded-card border border-dashed border-line-strong px-6 py-10">
              <p className="font-semibold">Map editing needs a Google Maps key</p>
              <p className="mt-1 text-small text-ink-muted">
                Add NEXT_PUBLIC_GOOGLE_MAPS_KEY to the ops app. Until then, paste GeoJSON, e.g. drawn at geojson.io.
              </p>
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-5">
          <div className="rounded-card border border-line bg-surface p-5">
            <p className="text-small font-semibold">Markets</p>
            {outside.length ? (
              <p role="alert" className="mt-2 text-small text-error">
                {outside.map((m) => m.name).join(", ")} {outside.length > 1 ? "are" : "is"} outside the area. Fix the shape before saving.
              </p>
            ) : (
              <p className="mt-2 text-small text-ink-muted">All active markets are inside.</p>
            )}
            <p className="tabular mt-3 text-caption text-ink-faint">{ring.length} corners</p>
          </div>

          <div className="rounded-card border border-line bg-surface p-5">
            <Field label="Test a point" hint="Paste lat, lng from Google Maps">
              <TextInput value={probe} onChange={(e) => setProbe(e.target.value)} placeholder="7.2507, 5.1950" className="tabular" />
            </Field>
            {probeResult === null ? null : (
              <div className="mt-3">
                <Pill tone={probeResult ? "brand" : "error"}>{probeResult ? "Inside, deliverable" : "Outside, rejected"}</Pill>
              </div>
            )}
          </div>

          <div className="rounded-card border border-line bg-surface p-5">
            <Field label="GeoJSON">
              <TextArea rows={8} value={geoText} onChange={(e) => setGeoText(e.target.value)} className="font-mono text-caption" spellCheck={false} />
            </Field>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const parsed = parseRing(geoText);
                  if (typeof parsed === "string") setGeoError(parsed);
                  else updateRing(parsed);
                }}
              >
                Apply
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard.writeText(toGeoJson(ring))}>
                Copy
              </Button>
            </div>
            <div className="mt-2">
              <FormError message={geoError} />
            </div>
          </div>
        </aside>
      </div>

      {saving ? <SaveDrawer ring={ring} corners={ring.length} onClose={() => setSaving(false)} /> : null}
    </div>
  );
}

function SaveDrawer({ ring, corners, onClose }: { ring: Ring; corners: number; onClose: () => void }) {
  const settings = useQuery(api.settings.get);
  const update = useMutation(api.settings.update);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!settings) return;
    setBusy(true);
    setError(null);
    try {
      await update({ value: { ...settings, geofence: ring }, reason });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Save the delivery area"
      description={`The new shape has ${corners} corners. Saved addresses outside it can't be used for new orders.`}
      footer={
        <>
          <Button onClick={save} loading={busy} disabled={!reasonOk(reason) || !settings}>
            Save area
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Keep editing
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ReasonField value={reason} onChange={setReason} placeholder="e.g. Extended to cover Oba-Ile" />
        <FormError message={error} />
      </div>
    </Drawer>
  );
}
