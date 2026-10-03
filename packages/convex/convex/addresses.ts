import { v } from "convex/values";
import { isInsidePolygon } from "@ojarun/shared";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { customerMutation, customerQuery } from "./lib/auth";
import { appError, ErrorCode } from "./lib/errors";
import { getSettings } from "./lib/settings";

const MAX_ADDRESSES = 10;

export const list = customerQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("addresses")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .collect();
    return rows
      .filter((a) => !a.archived)
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((a) => ({
        _id: a._id,
        label: a.label,
        formatted: a.formatted,
        landmark: a.landmark,
        lat: a.lat,
        lng: a.lng,
      }));
  },
});

const addressFields = {
  label: v.string(),
  formatted: v.string(),
  landmark: v.string(),
  lat: v.number(),
  lng: v.number(),
  placeId: v.optional(v.string()),
};

type AddressInput = { label: string; formatted: string; landmark: string; lat: number; lng: number; placeId?: string };

/** Validates input and runs the geofence check (product spec §2). Throws friendly errors. */
async function checked(ctx: MutationCtx, input: AddressInput) {
  const label = input.label.trim().slice(0, 30) || "Address";
  const formatted = input.formatted.trim();
  const landmark = input.landmark.trim();
  if (!formatted) throw appError(ErrorCode.INVALID_INPUT, "Choose an address first.");
  if (landmark.length < 3) {
    throw appError(ErrorCode.INVALID_INPUT, "Add a landmark or directions so your shopper can find you.");
  }
  if (landmark.length > 200) throw appError(ErrorCode.INVALID_INPUT, "Keep the directions under 200 characters.");
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) {
    throw appError(ErrorCode.INVALID_INPUT, "Drop the pin on your location.");
  }
  const settings = await getSettings(ctx);
  if (!isInsidePolygon({ lat: input.lat, lng: input.lng }, settings.geofence)) {
    throw appError(
      ErrorCode.OUTSIDE_DELIVERY_AREA,
      "We only deliver within Akure for now. Move the pin if that's not quite right.",
    );
  }
  return { label, formatted, landmark, lat: input.lat, lng: input.lng, placeId: input.placeId, insideGeofence: true };
}

export const create = customerMutation({
  args: addressFields,
  handler: async (ctx, args) => {
    const doc = await checked(ctx, args);
    const mine = await ctx.db
      .query("addresses")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .collect();
    if (mine.filter((a) => !a.archived).length >= MAX_ADDRESSES) {
      throw appError(ErrorCode.INVALID_INPUT, `You can save up to ${MAX_ADDRESSES} addresses. Remove one first.`);
    }
    return await ctx.db.insert("addresses", { ...doc, userId: ctx.user._id, archived: false });
  },
});

async function ownAddress(ctx: MutationCtx & { user: { _id: Id<"users"> } }, id: Id<"addresses">) {
  const address = await ctx.db.get(id);
  if (!address || address.userId !== ctx.user._id || address.archived) {
    throw appError(ErrorCode.NOT_FOUND, "Address not found.");
  }
  return address;
}

/**
 * Orders keep an address snapshot, so editing in place is safe for past orders. Moving the pin
 * changes distances, so the distance cache for this address is cleared.
 */
export const update = customerMutation({
  args: { id: v.id("addresses"), ...addressFields },
  handler: async (ctx, { id, ...args }) => {
    const before = await ownAddress(ctx, id);
    const doc = await checked(ctx, args);
    await ctx.db.patch(id, doc);
    if (before.lat !== doc.lat || before.lng !== doc.lng) {
      const cached = await ctx.db
        .query("distanceCache")
        .withIndex("by_address_market", (q) => q.eq("addressId", id))
        .collect();
      for (const row of cached) await ctx.db.delete(row._id);
    }
  },
});

/** Soft delete: past orders still reference the row. */
export const archive = customerMutation({
  args: { id: v.id("addresses") },
  handler: async (ctx, { id }) => {
    await ownAddress(ctx, id);
    await ctx.db.patch(id, { archived: true });
  },
});
