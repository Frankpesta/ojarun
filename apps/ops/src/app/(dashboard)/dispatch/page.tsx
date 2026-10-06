"use client";

import { useEffect, useState, type DragEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@ojarun/convex/api";
import type { Id } from "@ojarun/convex/dataModel";
import { formatLagosDay, formatLagosTime, formatNaira } from "@ojarun/shared";
import { Drawer } from "@/components/Drawer";
import { Button, EmptyState, PageHeader, Pill } from "@/components/ui";
import { errorMessage, FormError, ReasonField, reasonOk, Skeleton } from "@/components/form";

type SlotRow = FunctionReturnType<typeof api.ops.dispatch.slots>[number];
type Board = NonNullable<FunctionReturnType<typeof api.ops.dispatch.board>>;
type Market = Board["markets"][number];
type Batch = Market["batches"][number];
type OrderCard = Batch["orders"][number];
type Shopper = Board["shoppers"][number];

/** A move or reassignment that touches a confirmed batch, waiting for its reason. */
type Pending =
  | { kind: "move"; orderId: Id<"orders">; code: string; toBatchId?: Id<"batches"> }
  | { kind: "assign"; batchId: Id<"batches">; shopperId: Id<"users">; shopperName: string };

const BATCH_STATUS = {
  proposed: { label: "Proposed", tone: "accent" },
  assigned: { label: "Confirmed", tone: "brand" },
  in_progress: { label: "Shopping", tone: "brand" },
  done: { label: "Done", tone: "muted" },
} as const;

/** The slot ops most likely want: the latest one past cutoff whose window hasn't ended, else the next. */
function defaultSlot(slots: SlotRow[], now: number): SlotRow | undefined {
  const live = slots.filter((s) => s.cutoffAt <= now && s.windowEnd > now);
  return live.at(-1) ?? slots.find((s) => s.cutoffAt > now) ?? slots.at(-1);
}

export default function DispatchPage() {
  const slots = useQuery(api.ops.dispatch.slots);
  const [slotId, setSlotId] = useState<Id<"slots"> | null>(null);
  useEffect(() => {
    if (!slotId && slots?.length) setSlotId(defaultSlot(slots, Date.now())?._id ?? null);
  }, [slots, slotId]);
  const board = useQuery(api.ops.dispatch.board, slotId ? { slotId } : "skip");

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Dispatch"
        description="At each cutoff, paid orders are grouped by market and direction into proposed batches. Check them, move orders if needed, then confirm to send them to the shopper's app."
      />
      {slots === undefined ? (
        <Skeleton className="h-12" />
      ) : slots.length === 0 ? (
        <EmptyState title="No slots" body="Slots appear here once they're generated on the Delivery slots page." />
      ) : (
        <SlotPicker slots={slots} value={slotId} onChange={setSlotId} />
      )}
      <div className="mt-8">{slotId ? board === undefined ? <Skeleton /> : board ? <SlotBoard board={board} /> : null : null}</div>
    </div>
  );
}

function SlotPicker({ slots, value, onChange }: { slots: SlotRow[]; value: Id<"slots"> | null; onChange: (id: Id<"slots">) => void }) {
  const now = Date.now();
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Slot">
      {slots.map((s) => {
        const selected = s._id === value;
        return (
          <button
            key={s._id}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(s._id)}
            className={`rounded-card px-4 py-2.5 text-left transition-colors ${
              selected ? "bg-brand-tint ring-2 ring-brand" : "bg-surface ring-1 ring-line-strong hover:bg-surface-sunken"
            }`}
          >
            <span className="block text-caption text-ink-muted">
              {formatLagosDay(s.date, now)} · {s.label}
            </span>
            <span className="tabular block font-semibold">
              {formatLagosTime(s.windowStart)}–{formatLagosTime(s.windowEnd)}
            </span>
            <span className="mt-0.5 block text-caption text-ink-faint">
              {s.status === "open" ? `${s.reserved} booked · cutoff ${formatLagosTime(s.cutoffAt)}` : s.proposed ? `${s.proposed} to confirm` : `${s.batches} batches`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SlotBoard({ board }: { board: Board }) {
  const confirmSlot = useMutation(api.ops.dispatch.confirmSlot);
  const repropose = useMutation(api.ops.dispatch.reproposeSlot);
  const moveOrder = useMutation(api.ops.dispatch.moveOrder);
  const assignShopper = useMutation(api.ops.dispatch.assignShopper);
  const confirmBatch = useMutation(api.ops.dispatch.confirmBatch);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const batches = board.markets.flatMap((m) => m.batches);
  const ready = batches.filter((b) => b.status === "proposed" && b.shopper && b.orders.length).length;
  const open = board.slot.status === "open";

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const findBatch = (id?: Id<"batches">) => batches.find((b) => b._id === id);
  const requestMove = (order: OrderCard, from: Batch | undefined, toBatchId?: Id<"batches">) => {
    if (from?._id === toBatchId && toBatchId) return;
    const to = findBatch(toBatchId);
    if (order.status === "assigned" || from?.status === "assigned" || to?.status === "assigned") {
      setPending({ kind: "move", orderId: order._id, code: order.code, toBatchId });
    } else {
      void run(`move:${order._id}`, () => moveOrder({ orderId: order._id, toBatchId }));
    }
  };
  const requestAssign = (batch: Batch, shopperId: Id<"users"> | undefined) => {
    if (batch.status === "assigned" && shopperId) {
      const name = board.shoppers.find((s) => s._id === shopperId)?.name ?? "this shopper";
      setPending({ kind: "assign", batchId: batch._id, shopperId, shopperName: name });
    } else {
      void run(`assign:${batch._id}`, () => assignShopper({ batchId: batch._id, shopperId }));
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_15rem]">
      <div className="min-w-0">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-small text-ink-muted">
            {open ? (
              <>
                Taking orders until <span className="tabular font-medium text-ink">{formatLagosTime(board.slot.cutoffAt)}</span>. Batches are proposed automatically at cutoff.
              </>
            ) : (
              <>
                Cutoff was <span className="tabular font-medium text-ink">{formatLagosTime(board.slot.cutoffAt)}</span> · up to {board.maxPerBatch} orders per batch
              </>
            )}
            {board.awaitingPayment ? <span className="ml-2 text-ink-faint">· {board.awaitingPayment} awaiting payment</span> : null}
          </p>
          {!open ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                loading={busy === "repropose"}
                onClick={() => void run("repropose", () => repropose({ slotId: board.slot._id }))}
                title="Rebuild the unconfirmed batches, e.g. after more shoppers come on shift"
              >
                Re-propose
              </Button>
              <Button size="sm" disabled={!ready} loading={busy === "confirmAll"} onClick={() => void run("confirmAll", () => confirmSlot({ slotId: board.slot._id }))}>
                Confirm {ready ? `${ready} ready` : "all"}
              </Button>
            </div>
          ) : null}
        </div>
        <FormError message={error} />

        {board.markets.length === 0 ? (
          <EmptyState
            title={open ? "Nothing to dispatch yet" : "No paid orders in this slot"}
            body={open ? "Paid orders show up here after the cutoff." : "Paid orders that miss the cutoff are added here automatically."}
          />
        ) : (
          <div className="flex flex-col gap-10">
            {board.markets.map((m) => (
              <MarketLane
                key={m._id}
                market={m}
                maxPerBatch={board.maxPerBatch}
                shoppers={board.shoppers}
                busy={busy}
                onMove={requestMove}
                onAssign={requestAssign}
                onConfirm={(b) => run(`confirm:${b._id}`, () => confirmBatch({ batchId: b._id }))}
              />
            ))}
          </div>
        )}
      </div>

      <ShopperRail shoppers={board.shoppers} />
      {pending ? <ReasonDrawer pending={pending} batches={batches} onClose={() => setPending(null)} /> : null}
    </div>
  );
}

const DRAG_TYPE = "application/x-ojarun-order";

function MarketLane({
  market,
  maxPerBatch,
  shoppers,
  busy,
  onMove,
  onAssign,
  onConfirm,
}: {
  market: Market;
  maxPerBatch: number;
  shoppers: Shopper[];
  busy: string | null;
  onMove: (order: OrderCard, from: Batch | undefined, toBatchId?: Id<"batches">) => void;
  onAssign: (batch: Batch, shopperId: Id<"users"> | undefined) => void;
  onConfirm: (batch: Batch) => Promise<void>;
}) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const orderCount = market.batches.reduce((n, b) => n + b.orders.length, 0) + market.unbatched.length;

  const locate = (orderId: string) => {
    for (const b of market.batches) {
      const order = b.orders.find((o) => o._id === orderId);
      if (order) return { order, from: b as Batch | undefined };
    }
    const order = market.unbatched.find((o) => o._id === orderId);
    return order ? { order, from: undefined } : null;
  };
  const drop = (toBatchId?: Id<"batches">) => (e: DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const found = locate(e.dataTransfer.getData(DRAG_TYPE));
    if (found) onMove(found.order, found.from, toBatchId);
  };
  const dropZone = (target: string, toBatchId?: Id<"batches">, enabled = true) =>
    enabled
      ? {
          onDragOver: (e: DragEvent) => {
            if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
            e.preventDefault();
            setDragOver(target);
          },
          onDragLeave: () => setDragOver((t) => (t === target ? null : t)),
          onDrop: drop(toBatchId),
        }
      : {};

  const moveTargets = market.batches.filter((b) => b.status === "proposed" || b.status === "assigned");

  return (
    <section aria-labelledby={`market-${market._id}`}>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id={`market-${market._id}`} className="text-heading font-semibold">
          {market.name}
        </h2>
        <p className="text-small text-ink-muted">
          {orderCount} {orderCount === 1 ? "order" : "orders"} · {market.batches.length} {market.batches.length === 1 ? "batch" : "batches"}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {market.batches.map((b, i) => {
          const editable = b.status === "proposed" || b.status === "assigned";
          return (
            <article
              key={b._id}
              {...dropZone(b._id, b._id, editable)}
              className={`flex flex-col rounded-card border bg-surface transition-colors ${
                dragOver === b._id ? "border-brand bg-brand-tint/40" : "border-line"
              }`}
            >
              <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-small font-semibold">Batch {i + 1}</span>
                  <Pill tone={BATCH_STATUS[b.status].tone}>{BATCH_STATUS[b.status].label}</Pill>
                </div>
                <span className={`tabular text-caption ${b.orders.length > maxPerBatch ? "font-semibold text-error" : "text-ink-muted"}`}>
                  {b.orders.length}/{maxPerBatch}
                </span>
              </header>

              <div className="px-4 pt-3">
                <label className="flex flex-col gap-1">
                  <span className="text-caption font-medium text-ink-muted">Shopper</span>
                  <select
                    value={b.shopper?._id ?? ""}
                    disabled={!editable || busy === `assign:${b._id}`}
                    onChange={(e) => onAssign(b, (e.target.value || undefined) as Id<"users"> | undefined)}
                    className="h-10 rounded-input bg-surface px-3 text-small ring-1 ring-line-strong focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-60"
                  >
                    {b.status === "proposed" ? <option value="">Choose a shopper</option> : null}
                    {shoppers.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.name}
                        {s.onShift ? "" : " (off shift)"}
                        {s.batchCount ? ` · ${s.batchCount} in slot` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <ul className="flex flex-1 flex-col divide-y divide-line px-4 py-2">
                {b.orders.map((o) => (
                  <OrderRow key={o._id} order={o} draggable={editable} moveTargets={moveTargets.filter((t) => t._id !== b._id)} batchIndex={(id) => market.batches.findIndex((x) => x._id === id) + 1} onMove={(to) => onMove(o, b, to)} />
                ))}
              </ul>

              <footer className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
                <span className="tabular text-small text-ink-muted">{formatNaira(b.orders.reduce((n, o) => n + o.budgets, 0))} budgets</span>
                {b.status === "proposed" ? (
                  <Button size="sm" disabled={!b.shopper} loading={busy === `confirm:${b._id}`} onClick={() => void onConfirm(b)}>
                    Confirm
                  </Button>
                ) : null}
              </footer>
            </article>
          );
        })}

        {market.unbatched.length ? (
          <article className="flex flex-col rounded-card border border-dashed border-line-strong bg-surface-sunken/40">
            <header className="border-b border-line px-4 py-3">
              <span className="text-small font-semibold">Not in a batch</span>
              <p className="text-caption text-ink-muted">Drag into a batch, or use Move.</p>
            </header>
            <ul className="flex flex-col divide-y divide-line px-4 py-2">
              {market.unbatched.map((o) => (
                <OrderRow key={o._id} order={o} draggable moveTargets={moveTargets} batchIndex={(id) => market.batches.findIndex((x) => x._id === id) + 1} onMove={(to) => onMove(o, undefined, to)} />
              ))}
            </ul>
          </article>
        ) : null}

        <div
          {...dropZone(`new:${market._id}`)}
          className={`flex min-h-32 items-center justify-center rounded-card border-2 border-dashed px-4 text-center text-small transition-colors ${
            dragOver === `new:${market._id}` ? "border-brand bg-brand-tint/40 text-ink" : "border-line text-ink-faint"
          }`}
        >
          Drop an order here to start a new batch
        </div>
      </div>
    </section>
  );
}

function OrderRow({
  order,
  draggable,
  moveTargets,
  batchIndex,
  onMove,
}: {
  order: OrderCard;
  draggable: boolean;
  moveTargets: Batch[];
  batchIndex: (id: Id<"batches">) => number;
  onMove: (toBatchId?: Id<"batches">) => void;
}) {
  return (
    <li
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, order._id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className={`group flex items-start gap-3 py-2.5 ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <span className="mt-0.5 w-8 shrink-0 rounded bg-surface-sunken text-center font-mono text-caption leading-5 text-ink-muted" title="Direction from the market">
        {order.direction}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline justify-between gap-2">
          <span className="truncate text-small font-medium">{order.customerName}</span>
          <span className="shrink-0 font-mono text-caption text-ink-faint">#{order.code}</span>
        </p>
        <p className="truncate text-caption text-ink-muted" title={order.formatted}>
          {order.landmark}
        </p>
        <p className="tabular text-caption text-ink-faint">
          {order.km} km · {order.itemCount} {order.itemCount === 1 ? "item" : "items"} · {formatNaira(order.budgets)}
        </p>
      </div>
      {draggable ? (
        <select
          aria-label={`Move order ${order.code}`}
          value=""
          onChange={(e) => onMove(e.target.value === "new" ? undefined : (e.target.value as Id<"batches">))}
          className="h-7 w-16 shrink-0 cursor-pointer rounded-input bg-transparent text-caption text-ink-muted opacity-0 ring-1 ring-line-strong transition-opacity focus:opacity-100 group-hover:opacity-100"
        >
          <option value="" disabled>
            Move
          </option>
          {moveTargets.map((t) => (
            <option key={t._id} value={t._id}>
              To batch {batchIndex(t._id)}
            </option>
          ))}
          {order.status === "paid" ? <option value="new">New batch</option> : null}
        </select>
      ) : null}
    </li>
  );
}

function ShopperRail({ shoppers }: { shoppers: Shopper[] }) {
  const on = shoppers.filter((s) => s.onShift);
  return (
    <aside className="h-fit rounded-card border border-line bg-surface p-4 lg:sticky lg:top-24">
      <div className="flex items-baseline justify-between">
        <h2 className="text-small font-semibold">On shift</h2>
        <span className="tabular text-caption text-ink-muted">
          {on.length}/{shoppers.length}
        </span>
      </div>
      {shoppers.length === 0 ? (
        <p className="mt-3 text-caption text-ink-muted">
          No shoppers yet. Add one from <Link href="/shoppers" className="text-brand underline">Shoppers</Link>.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {shoppers.map((s) => (
            <li key={s._id} className="flex items-center justify-between gap-2 text-small">
              <span className="flex min-w-0 items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${s.onShift ? "bg-brand" : "bg-line-strong"}`} aria-hidden />
                <span className={`truncate ${s.onShift ? "" : "text-ink-faint"}`}>{s.name}</span>
              </span>
              <span className="tabular shrink-0 text-caption text-ink-muted">{s.batchCount || "–"}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 border-t border-line pt-3 text-caption text-ink-faint">
        Numbers are batches in this slot. New proposals go to on-shift shoppers with the fewest.
      </p>
    </aside>
  );
}

function ReasonDrawer({ pending, batches, onClose }: { pending: Pending; batches: Batch[]; onClose: () => void }) {
  const moveOrder = useMutation(api.ops.dispatch.moveOrder);
  const assignShopper = useMutation(api.ops.dispatch.assignShopper);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const title =
    pending.kind === "assign"
      ? `Give this batch to ${pending.shopperName}?`
      : `Move order #${pending.code}${pending.toBatchId ? "" : " to a new batch"}?`;
  const target = pending.kind === "move" ? batches.find((b) => b._id === pending.toBatchId) : undefined;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (pending.kind === "assign") await assignShopper({ batchId: pending.batchId, shopperId: pending.shopperId, reason });
      else await moveOrder({ orderId: pending.orderId, toBatchId: pending.toBatchId, reason });
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
      title={title}
      description={
        pending.kind === "assign"
          ? "This batch is already confirmed, so it's in a shopper's app. Every order moves to the new shopper."
          : `This touches a confirmed batch${target?.shopper ? ` (${target.shopper.name})` : ""}, so the shopper's app changes straight away.`
      }
      footer={
        <>
          <Button onClick={save} loading={saving} disabled={!reasonOk(reason)}>
            {pending.kind === "assign" ? "Reassign" : "Move order"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ReasonField value={reason} onChange={setReason} placeholder={pending.kind === "assign" ? "e.g. Ada called in sick" : "e.g. Closer to Bayo's other drops"} />
        <FormError message={error} />
      </div>
    </Drawer>
  );
}
