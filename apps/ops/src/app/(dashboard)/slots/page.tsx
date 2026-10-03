"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@ojarun/convex/api";
import { formatLagosDay, formatLagosTime, formatMinutes, parseMinutes, slotTemplateProblems } from "@ojarun/shared";
import { Drawer } from "@/components/Drawer";
import { Button, EmptyState, PageHeader, Pill } from "@/components/ui";
import { DAY_LABELS, DayPicker, errorMessage, Field, FormError, ReasonField, reasonOk, Skeleton, TextInput } from "@/components/form";

type Template = FunctionReturnType<typeof api.ops.slots.listTemplates>[number];
type Slot = FunctionReturnType<typeof api.ops.slots.listSlots>[number];

function daysSummary(days: number[]): string {
  const key = [...days].sort((a, b) => a - b).join(",");
  if (key === "0,1,2,3,4,5,6") return "Every day";
  if (key === "1,2,3,4,5,6") return "Mon–Sat";
  if (key === "1,2,3,4,5") return "Mon–Fri";
  return [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(d)).map((d) => DAY_LABELS[d]).join(", ");
}

export default function SlotsPage() {
  const templates = useQuery(api.ops.slots.listTemplates);
  const slots = useQuery(api.ops.slots.listSlots);
  const settings = useQuery(api.settings.get);
  const generateNow = useMutation(api.ops.slots.generateNow);
  const [editingTemplate, setEditingTemplate] = useState<Template | "new" | null>(null);
  const [editingSlot, setEditingSlot] = useState<Slot | null>(null);
  const now = Date.now();

  const byDate = new Map<string, Slot[]>();
  for (const s of slots ?? []) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Delivery slots"
        description="Templates define the daily windows. Each night they become bookable slots for today and tomorrow."
        actions={<Button onClick={() => setEditingTemplate("new")}>Add template</Button>}
      />

      <section aria-labelledby="templates">
        <h2 id="templates" className="mb-3 text-heading font-semibold">
          Templates
        </h2>
        {templates === undefined ? (
          <Skeleton className="h-28" />
        ) : templates.length === 0 ? (
          <EmptyState title="No templates yet" body="Add one, e.g. order by 10:00 for delivery 13:00–15:00." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {templates.map((t) => (
              <button
                key={t._id}
                onClick={() => setEditingTemplate(t)}
                className="rounded-card border border-line bg-surface p-5 text-left transition-colors hover:border-line-strong hover:bg-surface-sunken/60"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">{t.label}</p>
                  <Pill tone={t.active ? "brand" : "muted"}>{t.active ? "Active" : "Paused"}</Pill>
                </div>
                <p className="tabular mt-2 text-title font-semibold">
                  {formatMinutes(t.windowStartMin)}–{formatMinutes(t.windowEndMin)}
                </p>
                <p className="tabular mt-1 text-small text-ink-muted">
                  Order by {formatMinutes(t.cutoffMin)} · {daysSummary(t.daysOfWeek)} · {t.capacityPerShopper} per shopper
                </p>
              </button>
            ))}
          </div>
        )}
        {settings ? (
          <p className="mt-3 text-caption text-ink-faint">
            Capacity = orders per shopper × {settings.expectedShoppersPerSlot} expected shoppers (change in Settings).
          </p>
        ) : null}
      </section>

      <section aria-labelledby="upcoming" className="mt-10">
        <div className="mb-3 flex items-end justify-between gap-4">
          <h2 id="upcoming" className="text-heading font-semibold">
            Upcoming slots
          </h2>
          <Button size="sm" variant="secondary" onClick={() => void generateNow()}>
            Create missing slots now
          </Button>
        </div>
        {slots === undefined ? (
          <Skeleton />
        ) : slots.length === 0 ? (
          <EmptyState title="No slots generated" body="Add an active template, then create slots now or wait for midnight." />
        ) : (
          <div className="flex flex-col gap-6">
            {[...byDate.entries()].map(([date, daySlots]) => (
              <div key={date}>
                <p className="mb-2 text-small font-semibold text-ink-muted">{formatLagosDay(date, now)}</p>
                <div className="overflow-hidden rounded-card border border-line bg-surface">
                  <table className="w-full text-left text-small">
                    <tbody className="divide-y divide-line">
                      {daySlots.map((s) => {
                        const pastCutoff = s.cutoffAt <= now;
                        const full = s.reserved >= s.capacity;
                        return (
                          <tr key={s._id} className="hover:bg-surface-sunken/60">
                            <td className="w-40 px-4 py-3 font-medium">{s.label}</td>
                            <td className="tabular px-4 py-3">
                              {formatLagosTime(s.windowStart)}–{formatLagosTime(s.windowEnd)}
                              <span className="ml-2 text-ink-muted">order by {formatLagosTime(s.cutoffAt)}</span>
                            </td>
                            <td className="w-56 px-4 py-3">
                              <CapacityBar reserved={s.reserved} capacity={s.capacity} />
                            </td>
                            <td className="w-32 px-4 py-3">
                              {s.status === "closed" || pastCutoff ? (
                                <Pill tone="muted">Closed</Pill>
                              ) : full ? (
                                <Pill tone="accent">Full</Pill>
                              ) : (
                                <Pill tone="brand">Open</Pill>
                              )}
                            </td>
                            <td className="w-24 px-4 py-3 text-right">
                              <Button size="sm" variant="secondary" onClick={() => setEditingSlot(s)}>
                                Adjust
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {editingTemplate ? (
        <TemplateDrawer template={editingTemplate === "new" ? null : editingTemplate} onClose={() => setEditingTemplate(null)} />
      ) : null}
      {editingSlot ? <SlotDrawer slot={editingSlot} onClose={() => setEditingSlot(null)} /> : null}
    </div>
  );
}

function CapacityBar({ reserved, capacity }: { reserved: number; capacity: number }) {
  const pct = capacity === 0 ? 100 : Math.min(100, Math.round((reserved / capacity) * 100));
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
        <div className={`h-full rounded-full ${pct >= 100 ? "bg-accent" : "bg-brand"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular w-14 text-right text-ink-muted">
        {reserved}/{capacity}
      </span>
    </div>
  );
}

function TemplateDrawer({ template, onClose }: { template: Template | null; onClose: () => void }) {
  const upsert = useMutation(api.ops.slots.upsertTemplate);
  const [label, setLabel] = useState(template?.label ?? "");
  const [cutoff, setCutoff] = useState(formatMinutes(template?.cutoffMin ?? 10 * 60));
  const [start, setStart] = useState(formatMinutes(template?.windowStartMin ?? 13 * 60));
  const [end, setEnd] = useState(formatMinutes(template?.windowEndMin ?? 15 * 60));
  const [perShopper, setPerShopper] = useState(String(template?.capacityPerShopper ?? 4));
  const [days, setDays] = useState<number[]>(template?.daysOfWeek ?? [1, 2, 3, 4, 5, 6]);
  const [active, setActive] = useState(template?.active ?? true);
  const [reason, setReason] = useState(template ? "" : "New delivery window");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const times = { cutoffMin: parseMinutes(cutoff), windowStartMin: parseMinutes(start), windowEndMin: parseMinutes(end) };
  const timesOk = times.cutoffMin !== null && times.windowStartMin !== null && times.windowEndMin !== null;
  const problems = timesOk ? slotTemplateProblems({ ...(times as Record<keyof typeof times, number>), daysOfWeek: days }) : ["Enter valid times."];
  const capacity = Number(perShopper);
  const valid = label.trim().length >= 2 && problems.length === 0 && Number.isInteger(capacity) && capacity >= 1 && reasonOk(reason);

  const save = async () => {
    if (!timesOk) return;
    setSaving(true);
    setError(null);
    try {
      await upsert({
        id: template?._id,
        label,
        cutoffMin: times.cutoffMin!,
        windowStartMin: times.windowStartMin!,
        windowEndMin: times.windowEndMin!,
        capacityPerShopper: capacity,
        daysOfWeek: days,
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
      title={template ? `Edit ${template.label}` : "Add a delivery window"}
      description="Changes apply to slots created from now on. Slots already generated keep their times, so booked customers aren't moved."
      footer={
        <>
          <Button onClick={save} loading={saving} disabled={!valid}>
            {template ? "Save template" : "Add template"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Label" hint="Customers see this next to the time, e.g. Afternoon.">
          <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Afternoon" />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Order by">
            <TextInput type="time" value={cutoff} onChange={(e) => setCutoff(e.target.value)} />
          </Field>
          <Field label="Delivery from">
            <TextInput type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Until">
            <TextInput type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-small font-medium text-ink-muted">Days</span>
          <DayPicker value={days} onChange={setDays} />
        </div>
        <Field label="Orders per shopper">
          <TextInput inputMode="numeric" value={perShopper} onChange={(e) => setPerShopper(e.target.value.replace(/\D/g, ""))} className="tabular w-32" />
        </Field>
        <label className="flex cursor-pointer items-center justify-between rounded-card px-4 py-3 ring-1 ring-line-strong">
          <span>
            <span className="block font-medium">Active</span>
            <span className="text-caption text-ink-muted">Paused templates stop creating new slots.</span>
          </span>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-5 w-5 accent-[rgb(var(--color-brand))]" />
        </label>
        {problems.length && timesOk ? <FormError message={problems.join(" ")} /> : null}
        <ReasonField value={reason} onChange={setReason} />
        <FormError message={error} />
      </div>
    </Drawer>
  );
}

function SlotDrawer({ slot, onClose }: { slot: Slot; onClose: () => void }) {
  const update = useMutation(api.ops.slots.updateSlot);
  const [capacity, setCapacity] = useState(String(slot.capacity));
  const [open, setOpen] = useState(slot.status === "open");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pastCutoff = slot.cutoffAt <= Date.now();
  const cap = Number(capacity);
  const changed = cap !== slot.capacity || open !== (slot.status === "open");
  const valid = changed && Number.isInteger(cap) && cap >= slot.reserved && reasonOk(reason);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await update({
        slotId: slot._id,
        capacity: cap !== slot.capacity ? cap : undefined,
        status: open !== (slot.status === "open") ? (open ? "open" : "closed") : undefined,
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
      title={`${slot.label}, ${formatLagosDay(slot.date, Date.now())}`}
      description={`${formatLagosTime(slot.windowStart)}–${formatLagosTime(slot.windowEnd)}, order by ${formatLagosTime(slot.cutoffAt)}. ${slot.reserved} booked.`}
      footer={
        <>
          <Button onClick={save} loading={saving} disabled={!valid}>
            Save slot
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Capacity" hint={`Can't go below the ${slot.reserved} orders already booked.`}>
          <TextInput inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value.replace(/\D/g, ""))} className="tabular w-32" />
        </Field>
        <label className={`flex items-center justify-between rounded-card px-4 py-3 ring-1 ring-line-strong ${pastCutoff ? "opacity-50" : "cursor-pointer"}`}>
          <span>
            <span className="block font-medium">Taking orders</span>
            <span className="text-caption text-ink-muted">
              {pastCutoff ? "The cutoff has passed." : "Close it to stop new bookings, e.g. if a shopper is off sick."}
            </span>
          </span>
          <input
            type="checkbox"
            disabled={pastCutoff}
            checked={open && !pastCutoff}
            onChange={(e) => setOpen(e.target.checked)}
            className="h-5 w-5 accent-[rgb(var(--color-brand))]"
          />
        </label>
        <ReasonField value={reason} onChange={setReason} placeholder="e.g. Only one shopper on shift today" />
        <FormError message={error} />
      </div>
    </Drawer>
  );
}
