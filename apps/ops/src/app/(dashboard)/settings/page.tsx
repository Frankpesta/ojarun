"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@ojarun/convex/api";
import { formatNaira, settingsSchema, type Settings } from "@ojarun/shared";
import { Drawer } from "@/components/Drawer";
import { Button, PageHeader } from "@/components/ui";
import { errorMessage, Field, FormError, ReasonField, reasonOk, Skeleton, TextInput } from "@/components/form";

/**
 * A typed form over the settings schema (05 §9 M1). Money is edited in naira and stored in kobo.
 * The geofence has its own page.
 */
type Kind = "naira" | "int" | "percentBps" | "minutes" | "seconds" | "bool" | "text" | "percentList";
type FieldDef = { path: string; label: string; kind: Kind; hint?: string };

const SECTIONS: { title: string; description: string; fields: FieldDef[] }[] = [
  {
    title: "Customer fees",
    description: "What customers pay on top of their item budgets.",
    fields: [
      { path: "serviceFeeKobo", label: "Service fee", kind: "naira" },
      { path: "deliveryFee.baseKobo", label: "Delivery base", kind: "naira" },
      { path: "deliveryFee.perKmKobo", label: "Delivery per km", kind: "naira" },
      { path: "deliveryFee.minKobo", label: "Delivery minimum", kind: "naira" },
      { path: "deliveryFee.maxKobo", label: "Delivery maximum", kind: "naira" },
      { path: "deliveryFee.roundToKobo", label: "Round delivery up to", kind: "naira" },
    ],
  },
  {
    title: "Paystack charge",
    description: "Check these against Paystack's current local-card pricing.",
    fields: [
      { path: "paystackFee.percentBps", label: "Percentage", kind: "percentBps", hint: "1.5% is 1.5" },
      { path: "paystackFee.flatKobo", label: "Flat fee", kind: "naira" },
      { path: "paystackFee.flatWaivedBelowKobo", label: "Flat fee waived below", kind: "naira" },
      { path: "paystackFee.capKobo", label: "Fee cap", kind: "naira" },
      { path: "refundPaystackChargeOnCancel", label: "Refund the Paystack charge when an order is cancelled", kind: "bool" },
    ],
  },
  {
    title: "Buffer",
    description: "Extra money held for price surprises. Unused buffer goes back to the wallet.",
    fields: [
      { path: "bufferPresets", label: "Options shown", kind: "percentList", hint: "Comma-separated, e.g. 0, 10, 20" },
      { path: "defaultBufferPct", label: "Default (%)", kind: "int" },
      { path: "bufferRoundToKobo", label: "Round buffer up to", kind: "naira" },
    ],
  },
  {
    title: "Slots and dispatch",
    description: "How many orders fit in a delivery window and how far ahead customers can book.",
    fields: [
      { path: "expectedShoppersPerSlot", label: "Shoppers expected per slot", kind: "int", hint: "Until shifts exist, capacity = per-shopper × this" },
      { path: "bookingDaysAhead", label: "Days customers can book ahead", kind: "int", hint: "0 = today only, 1 = today and tomorrow" },
      { path: "maxOrdersPerBatch", label: "Max orders per batch", kind: "int" },
      { path: "cashAdvanceSuggestPct", label: "Suggested cash advance (%)", kind: "int" },
    ],
  },
  {
    title: "Timings",
    description: "",
    fields: [
      { path: "paymentHoldMinutes", label: "Unpaid orders expire after (min)", kind: "minutes" },
      { path: "priceCheckTimeoutSec", label: "Price check times out after (min)", kind: "seconds" },
    ],
  },
  {
    title: "Wallet and price guide",
    description: "",
    fields: [
      { path: "minWithdrawalKobo", label: "Minimum withdrawal", kind: "naira" },
      { path: "showPriceGuide", label: "Show the price guide to customers", kind: "bool" },
    ],
  },
  {
    title: "Support",
    description: "Shown in the app's help sheet.",
    fields: [
      { path: "supportWhatsapp", label: "WhatsApp number", kind: "text" },
      { path: "supportPhone", label: "Phone number", kind: "text" },
    ],
  },
];

type Draft = Record<string, string | boolean>;

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split(".");
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] as Record<string, unknown>;
  o[keys.at(-1)!] = value;
}

function toDraft(s: Settings): Draft {
  const d: Draft = {};
  for (const f of SECTIONS.flatMap((x) => x.fields)) {
    const v = getPath(s, f.path);
    switch (f.kind) {
      case "naira": d[f.path] = String((v as number) / 100); break;
      case "percentBps": d[f.path] = String((v as number) / 100); break;
      case "seconds": d[f.path] = String((v as number) / 60); break;
      case "percentList": d[f.path] = (v as number[]).join(", "); break;
      case "bool": d[f.path] = v as boolean; break;
      default: d[f.path] = String(v);
    }
  }
  return d;
}

/** Draft → settings; NaN fields fail schema validation with a field path. */
function fromDraft(base: Settings, d: Draft): Settings {
  const next = structuredClone(base) as unknown as Record<string, unknown>;
  for (const f of SECTIONS.flatMap((x) => x.fields)) {
    const raw = d[f.path];
    const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
    let value: unknown;
    switch (f.kind) {
      case "naira": value = Math.round(n * 100); break;
      case "percentBps": value = Math.round(n * 100); break;
      case "seconds": value = Math.round(n * 60); break;
      case "percentList": value = String(raw).split(",").map((x) => x.trim()).filter(Boolean).map(Number); break;
      case "bool": value = raw; break;
      case "text": value = String(raw).trim(); break;
      default: value = n;
    }
    setPath(next, f.path, value);
  }
  return next as unknown as Settings;
}

function display(f: FieldDef, s: Settings): string {
  const v = getPath(s, f.path);
  switch (f.kind) {
    case "naira": return formatNaira(v as number);
    case "percentBps": return `${(v as number) / 100}%`;
    case "seconds": return `${(v as number) / 60} min`;
    case "minutes": return `${v} min`;
    case "percentList": return (v as number[]).map((p) => `${p}%`).join(", ");
    case "bool": return v ? "Yes" : "No";
    default: return String(v) || "Not set";
  }
}

export default function SettingsPage() {
  const saved = useQuery(api.settings.get);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    if (saved && !draft) setDraft(toDraft(saved));
  }, [saved, draft]);

  const candidate = useMemo(() => (saved && draft ? fromDraft(saved, draft) : null), [saved, draft]);
  const validation = useMemo(() => (candidate ? settingsSchema.safeParse(candidate) : null), [candidate]);
  const extraProblems = candidate && !candidate.bufferPresets.includes(candidate.defaultBufferPct) ? ["The default buffer must be one of the options shown."] : [];
  const changes = useMemo(() => {
    if (!saved || !candidate || !validation?.success) return [];
    return SECTIONS.flatMap((s) => s.fields).filter((f) => JSON.stringify(getPath(saved, f.path)) !== JSON.stringify(getPath(candidate, f.path)));
  }, [saved, candidate, validation]);

  if (!saved || !draft) return <Skeleton className="h-96 max-w-3xl" />;

  const fieldError = (path: string) =>
    validation && !validation.success ? validation.error.issues.find((i) => i.path.join(".") === path || i.path.slice(0, -1).join(".") === path) : undefined;

  return (
    <div className="max-w-3xl pb-28">
      <PageHeader title="Settings" description="Fees, timings and support contacts. Each save is logged with a reason." />

      <div className="flex flex-col gap-8">
        {SECTIONS.map((section) => (
          <section key={section.title} className="rounded-card border border-line bg-surface p-6">
            <h2 className="text-heading font-semibold">{section.title}</h2>
            {section.description ? <p className="mt-1 text-small text-ink-muted">{section.description}</p> : null}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {section.fields.map((f) =>
                f.kind === "bool" ? (
                  <label key={f.path} className="flex cursor-pointer items-center justify-between gap-4 rounded-card px-4 py-3 ring-1 ring-line-strong sm:col-span-2">
                    <span className="font-medium">{f.label}</span>
                    <input
                      type="checkbox"
                      checked={draft[f.path] as boolean}
                      onChange={(e) => setDraft({ ...draft, [f.path]: e.target.checked })}
                      className="h-5 w-5 accent-[rgb(var(--color-brand))]"
                    />
                  </label>
                ) : (
                  <Field key={f.path} label={f.label} hint={fieldError(f.path) ? "Enter a valid value" : f.hint}>
                    <div className="relative">
                      {f.kind === "naira" ? (
                        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted">₦</span>
                      ) : null}
                      <TextInput
                        value={draft[f.path] as string}
                        inputMode={f.kind === "text" ? "tel" : "decimal"}
                        aria-invalid={!!fieldError(f.path)}
                        onChange={(e) => setDraft({ ...draft, [f.path]: e.target.value })}
                        className={`tabular ${f.kind === "naira" ? "pl-8" : ""} ${fieldError(f.path) ? "ring-2 ring-error" : ""}`}
                      />
                    </div>
                  </Field>
                ),
              )}
            </div>
          </section>
        ))}
      </div>

      <div className="fixed bottom-0 left-60 right-0 z-30 border-t border-line bg-surface/95 backdrop-blur">
        <div className="flex max-w-3xl items-center justify-between gap-4 px-8 py-4">
          <p className="text-small text-ink-muted">
            {validation && !validation.success
              ? "Some values aren't valid yet."
              : extraProblems[0] ?? (changes.length ? `${changes.length} unsaved change${changes.length > 1 ? "s" : ""}` : "No changes")}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" disabled={!changes.length} onClick={() => setDraft(toDraft(saved))}>
              Discard
            </Button>
            <Button disabled={!changes.length || extraProblems.length > 0} onClick={() => setReviewing(true)}>
              Review and save
            </Button>
          </div>
        </div>
      </div>

      {reviewing && candidate ? (
        <SaveDrawer
          saved={saved}
          next={candidate}
          changes={changes}
          onClose={() => setReviewing(false)}
          onSaved={() => {
            setReviewing(false);
            setDraft(null);
          }}
        />
      ) : null}
    </div>
  );
}

function SaveDrawer({
  saved,
  next,
  changes,
  onClose,
  onSaved,
}: {
  saved: Settings;
  next: Settings;
  changes: FieldDef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const update = useMutation(api.settings.update);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await update({ value: next, reason });
      onSaved();
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
      title="Save settings"
      description="These take effect straight away for new orders. Orders already placed keep their totals."
      footer={
        <>
          <Button onClick={save} loading={saving} disabled={!reasonOk(reason)}>
            Save {changes.length} change{changes.length > 1 ? "s" : ""}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Keep editing
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <dl className="divide-y divide-line overflow-hidden rounded-card ring-1 ring-line">
          {changes.map((f) => (
            <div key={f.path} className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3 text-small">
              <dt className="text-ink-muted">{f.label}</dt>
              <dd className="tabular text-right">
                <span className="text-ink-faint line-through">{display(f, saved)}</span>
                <span className="ml-2 font-semibold">{display(f, next)}</span>
              </dd>
            </div>
          ))}
        </dl>
        <ReasonField value={reason} onChange={setReason} placeholder="e.g. Approved new delivery pricing" />
        <FormError message={error} />
      </div>
    </Drawer>
  );
}
