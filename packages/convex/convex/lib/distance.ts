import { estimatedRoadMeters } from "@ojarun/shared";
import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { appError, ErrorCode } from "./errors";

/** Without a Routes API key, development builds estimate road distance so ordering can be tested. */
export function canEstimateDistances(): boolean {
  return process.env.APP_ENV === "development";
}

/**
 * Road distance from a market to an address: the cached Routes API result, or a development
 * estimate. Production refuses without a cached route; the app quotes markets before checkout.
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
  if (canEstimateDistances()) return { distanceMeters: estimatedRoadMeters(address, market), estimated: true };
  throw appError(ErrorCode.UNAVAILABLE, "We couldn't work out the delivery fee. Go back and pick the market again.");
}
