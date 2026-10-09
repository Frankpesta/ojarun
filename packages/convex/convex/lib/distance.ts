import { estimatedRoadMeters } from "@ojarun/shared";
import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

/**
 * Road distance from a market to an address: the cached OSRM result, or, if the router couldn't
 * be reached, a straight-line estimate × 1.35. Estimates aren't cached, so the next quote retries.
 */
export async function deliveryDistance(
  ctx: QueryCtx,
  address: Doc<"addresses">,
  market: Doc<"markets">,
): Promise<{ distanceMeters: number; estimated: boolean }> {
  const cached = await ctx.db
    .query("distanceCache")
    .withIndex("by_address_market", (q) => q.eq("addressId", address._id).eq("marketId", market._id))
    .unique();
  if (cached) return { distanceMeters: cached.distanceMeters, estimated: false };
  return { distanceMeters: estimatedRoadMeters(address, market), estimated: true };
}
