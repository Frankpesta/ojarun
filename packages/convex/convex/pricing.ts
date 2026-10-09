import { v } from "convex/values";
import { deliveryFee } from "@ojarun/shared";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireCallerInAction } from "./lib/actionAuth";
import { deliveryDistance } from "./lib/distance";
import { appError, ErrorCode } from "./lib/errors";
import { getSettings } from "./lib/settings";

/**
 * Delivery fee per market for one address (05 §5.5). Distances come from OSRM, one table call
 * for every uncached market, and are cached per (address, market) for good.
 */

type Point = { lat: number; lng: number };

export const quoteState = internalQuery({
  args: { userId: v.id("users"), addressId: v.id("addresses") },
  handler: async (ctx, { userId, addressId }) => {
    const address = await ctx.db.get(addressId);
    if (!address || address.userId !== userId || address.archived) {
      throw appError(ErrorCode.NOT_FOUND, "Address not found.");
    }
    const markets = await ctx.db
      .query("markets")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
    const cached = await ctx.db
      .query("distanceCache")
      .withIndex("by_address_market", (q) => q.eq("addressId", addressId))
      .collect();
    const known = new Set(cached.map((c) => c.marketId));
    return {
      address: { lat: address.lat, lng: address.lng },
      missing: markets.filter((m) => !known.has(m._id)).map((m) => ({ _id: m._id, lat: m.lat, lng: m.lng })),
    };
  },
});

export const cacheDistances = internalMutation({
  args: {
    addressId: v.id("addresses"),
    rows: v.array(v.object({ marketId: v.id("markets"), distanceMeters: v.number(), durationSec: v.number() })),
  },
  handler: async (ctx, { addressId, rows }) => {
    for (const row of rows) {
      const existing = await ctx.db
        .query("distanceCache")
        .withIndex("by_address_market", (q) => q.eq("addressId", addressId).eq("marketId", row.marketId))
        .unique();
      if (existing) continue;
      await ctx.db.insert("distanceCache", { addressId, ...row, calculatedAt: Date.now() });
    }
  },
});

/**
 * Fees for every active market, cheapest first. Reads the cache filled by quoteMarkets; a market
 * with no route to this address is left out.
 */
export const marketQuotes = internalQuery({
  args: { addressId: v.id("addresses") },
  handler: async (ctx, { addressId }) => {
    const address = (await ctx.db.get(addressId))!;
    const settings = await getSettings(ctx);
    const markets = await ctx.db
      .query("markets")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
    const quotes = [];
    for (const m of markets) {
      const distance = await deliveryDistance(ctx, address, m).catch(() => null);
      if (!distance) continue;
      const { distanceMeters, estimated } = distance;
      quotes.push({
        marketId: m._id,
        name: m.name,
        opensAtMin: m.opensAtMin,
        closesAtMin: m.closesAtMin,
        distanceMeters,
        deliveryFee: deliveryFee(distanceMeters, settings.deliveryFee),
        estimated,
      });
    }
    return quotes.sort((a, b) => a.deliveryFee - b.deliveryFee || a.distanceMeters - b.distanceMeters);
  },
});

type Table = { code?: string; distances?: (number | null)[][]; durations?: (number | null)[][] };

/**
 * Road distances from each market to the address with OSRM's table service (OpenStreetMap,
 * free, no key). OSRM_URL can point at a self-hosted router; the default is the public one,
 * which is fine for our volume because every (address, market) pair is fetched once and cached.
 */
async function osrmTable(markets: Point[], address: Point): Promise<{ distanceMeters: number; durationSec: number }[] | null> {
  const base = process.env.OSRM_URL ?? "https://router.project-osrm.org";
  const coords = [address, ...markets].map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  const sources = markets.map((_, i) => i + 1).join(";");
  try {
    const res = await fetch(`${base}/table/v1/driving/${coords}?sources=${sources}&destinations=0&annotations=distance,duration`, {
      headers: { "User-Agent": "OjaRun/1.0 (Akure grocery delivery)" },
    });
    if (!res.ok) {
      console.error({ evt: "osrm.error", status: res.status });
      return null;
    }
    const body = (await res.json()) as Table;
    if (body.code !== "Ok" || !body.distances) return null;
    return markets.map((_, i) => ({
      distanceMeters: Math.round(body.distances![i]?.[0] ?? -1),
      durationSec: Math.round(body.durations?.[i]?.[0] ?? 0),
    }));
  } catch (e) {
    console.error({ evt: "osrm.unreachable", error: String(e) });
    return null;
  }
}

export const quoteMarkets = action({
  args: { addressId: v.id("addresses") },
  handler: async (ctx, { addressId }): Promise<MarketQuote[]> => {
    const caller = await requireCallerInAction(ctx, ["customer"]);
    const state = await ctx.runQuery(internal.pricing.quoteState, { userId: caller._id, addressId });

    if (state.missing.length) {
      // If the router is down, marketQuotes falls back to an estimate and we try again next time.
      const table = await osrmTable(state.missing, state.address);
      const rows = (table ?? [])
        .map((r, i) => ({ marketId: state.missing[i]!._id, ...r }))
        .filter((r) => r.distanceMeters >= 0);
      if (rows.length) await ctx.runMutation(internal.pricing.cacheDistances, { addressId, rows });
    }
    return await ctx.runQuery(internal.pricing.marketQuotes, { addressId });
  },
});

export type MarketQuote = {
  marketId: Id<"markets">;
  name: string;
  opensAtMin: number;
  closesAtMin: number;
  distanceMeters: number;
  deliveryFee: number;
  estimated: boolean;
};
