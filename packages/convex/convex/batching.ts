import { v } from "convex/values";
import { assignByLoad, bearingDegrees, bearingGap, clusterByBearing, meanBearing } from "@ojarun/shared";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getSettings } from "./lib/settings";

/** Active shoppers who are on shift, oldest profile first so ties are stable. */
export async function onShiftShoppers(ctx: QueryCtx): Promise<Doc<"users">[]> {
  const profiles = await ctx.db
    .query("shopperProfiles")
    .withIndex("by_onShift", (q) => q.eq("onShift", true))
    .collect();
  const out = [];
  for (const p of profiles.filter((p) => p.active)) {
    const user = await ctx.db.get(p.userId);
    if (user?.role === "shopper" && user.status === "active") out.push(user);
  }
  return out;
}

export function bearingOf(market: { lat: number; lng: number }, order: Doc<"orders">): number {
  return bearingDegrees(market, order.addressSnapshot);
}

/**
 * Proposes batches for a slot's paid orders that aren't in one yet (05 §9 M3). Orders are
 * grouped per market by direction from the market, at most settings.maxOrdersPerBatch each, and
 * each batch is offered to the on-shift shopper with the fewest batches in this slot. Late
 * orders (paid after cutoff) join the closest proposed batch with room first. Batches stay
 * "proposed" until ops confirms them on the dispatch board. Returns the number of batches made.
 */
export async function proposeBatches(ctx: MutationCtx, slotId: Id<"slots">): Promise<number> {
  const settings = await getSettings(ctx);
  const max = settings.maxOrdersPerBatch;
  const existing = await ctx.db
    .query("batches")
    .withIndex("by_slot", (q) => q.eq("slotId", slotId))
    .collect();
  const shoppers = (await onShiftShoppers(ctx)).map((u) => ({
    id: u._id,
    load: existing.filter((b) => b.shopperId === u._id && b.status !== "done").length,
  }));

  let created = 0;
  for (const market of await ctx.db.query("markets").collect()) {
    const paid = await ctx.db
      .query("orders")
      .withIndex("by_slot_market_status", (q) => q.eq("slotId", slotId).eq("marketId", market._id).eq("status", "paid"))
      .collect();
    const loose = paid.filter((o) => !o.batchId).map((o) => ({ order: o, bearing: bearingOf(market, o) }));
    if (loose.length === 0) continue;

    // Late orders join an open proposal heading the same way, if one has room.
    const open = [];
    for (const b of existing.filter((b) => b.marketId === market._id && b.status === "proposed")) {
      const orders = await ctx.db
        .query("orders")
        .withIndex("by_batch", (q) => q.eq("batchId", b._id))
        .collect();
      open.push({
        id: b._id,
        bearings: orders.map((o) => bearingOf(market, o)),
      });
    }
    const leftover = [];
    for (const item of loose) {
      let best: (typeof open)[number] | undefined;
      for (const b of open) {
        if (b.bearings.length >= max) continue;
        if (
          !best ||
          bearingGap(meanBearing(b.bearings), item.bearing) < bearingGap(meanBearing(best.bearings), item.bearing)
        ) {
          best = b;
        }
      }
      if (best) {
        best.bearings.push(item.bearing);
        await ctx.db.patch(item.order._id, { batchId: best.id });
      } else {
        leftover.push(item);
      }
    }

    const clusters = clusterByBearing(leftover, max);
    const picks = assignByLoad(clusters.length, shoppers);
    for (const [i, cluster] of clusters.entries()) {
      const shopperId = picks[i];
      const batchId = await ctx.db.insert("batches", {
        marketId: market._id,
        slotId,
        shopperId,
        status: "proposed",
      });
      for (const { order } of cluster) await ctx.db.patch(order._id, { batchId });
      const s = shoppers.find((s) => s.id === shopperId);
      if (s) s.load++;
      created++;
    }
  }
  if (created) console.log({ evt: "batching.proposed", slotId, created });
  return created;
}

/** Runs at each slot's cutoff (scheduled by slots.closeAtCutoff), and again for late payments. */
export const runForSlot = internalMutation({
  args: { slotId: v.id("slots") },
  handler: async (ctx, { slotId }) => proposeBatches(ctx, slotId),
});
