import { v } from "convex/values";
import { deliveryFee } from "@ojarun/shared";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireCallerInAction } from "./lib/actionAuth";
import { canEstimateDistances, deliveryDistance } from "./lib/distance";
import { appError, ErrorCode } from "./lib/errors";
import { getSettings } from "./lib/settings";

/**
 * Delivery fee per market for one address (05 §5.5). Distances come from the Routes API, one
 * matrix call for every uncached market, and are cached per (address, market) for good.
 */
const ROUTES = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";

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

type MatrixElement = {
  originIndex?: number;
  destinationIndex?: number;
  distanceMeters?: number;
  duration?: string;
  condition?: string;
};

async function routeMatrix(origins: Point[], destination: Point, key: string): Promise<MatrixElement[]> {
  const waypoint = (p: Point) => ({ waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } } });
  let res: Response;
  try {
    res = await fetch(ROUTES, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "originIndex,destinationIndex,distanceMeters,duration,condition",
      },
      body: JSON.stringify({
        origins: origins.map(waypoint),
        destinations: [waypoint(destination)],
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
      }),
    });
  } catch {
    throw appError(ErrorCode.UNAVAILABLE, "We couldn't reach the map service. Check your connection and try again.");
  }
  if (!res.ok) {
    console.error({ evt: "routes.error", status: res.status, body: (await res.text()).slice(0, 500) });
    throw appError(ErrorCode.UNAVAILABLE, "Delivery fees aren't available right now. Try again shortly.");
  }
  return (await res.json()) as MatrixElement[];
}

export const quoteMarkets = action({
  args: { addressId: v.id("addresses") },
  handler: async (ctx, { addressId }): Promise<MarketQuote[]> => {
    const caller = await requireCallerInAction(ctx, ["customer"]);
    const state = await ctx.runQuery(internal.pricing.quoteState, { userId: caller._id, addressId });

    if (state.missing.length) {
      const key = process.env.GOOGLE_MAPS_SERVER_KEY;
      if (key) {
        const elements = await routeMatrix(state.missing, state.address, key);
        const rows = elements
          .filter((e) => e.condition === "ROUTE_EXISTS" && e.originIndex !== undefined && e.distanceMeters !== undefined)
          .map((e) => ({
            marketId: state.missing[e.originIndex!]!._id,
            distanceMeters: e.distanceMeters!,
            durationSec: Number.parseInt(e.duration ?? "0", 10) || 0,
          }));
        if (rows.length) await ctx.runMutation(internal.pricing.cacheDistances, { addressId, rows });
      } else if (!canEstimateDistances()) {
        throw appError(ErrorCode.UNAVAILABLE, "Delivery fees aren't available right now. Try again shortly.");
      }
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
