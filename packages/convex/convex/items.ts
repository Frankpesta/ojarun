import { v } from "convex/values";
import { canTransitionItem } from "@ojarun/shared";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { shopperMutation } from "./lib/auth";
import { appError, ErrorCode } from "./lib/errors";

const NOTE_MAX = 200;

/** The item, if the caller is the shopper on its order and that order is being shopped. */
async function itemForShopping(ctx: MutationCtx, shopper: Doc<"users">, itemId: Id<"orderItems">) {
  const item = await ctx.db.get(itemId);
  const order = item ? await ctx.db.get(item.orderId) : null;
  if (!item || !order || order.shopperId !== shopper._id) {
    throw appError(ErrorCode.NOT_FOUND, "This item isn't on one of your orders.");
  }
  if (order.status !== "shopping") {
    throw appError(ErrorCode.INVALID_TRANSITION, "Tap Start shopping first.");
  }
  return item;
}

function cleanNote(note: string | undefined): string | undefined {
  const t = note?.trim().replace(/\s+/g, " ");
  if (t && t.length > NOTE_MAX) throw appError(ErrorCode.INVALID_INPUT, `Keep notes under ${NOTE_MAX} characters.`);
  return t || undefined;
}

export const generateUploadUrl = shopperMutation({
  args: {},
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

/**
 * Attaches the photo the offline queue just uploaded. Replaying the same upload is a no-op. A
 * retake replaces the item's photo; earlier blobs are kept as evidence, never deleted here.
 */
export const attachPhoto = shopperMutation({
  args: {
    itemId: v.id("orderItems"),
    storageId: v.id("_storage"),
    thumbhash: v.optional(v.string()),
  },
  handler: async (ctx, { itemId, storageId, thumbhash }) => {
    const item = await itemForShopping(ctx, ctx.user, itemId);
    if (item.photoStorageId === storageId) return;
    const meta = await ctx.db.system.get(storageId);
    if (!meta) throw appError(ErrorCode.INVALID_INPUT, "The photo didn't upload. Try again.");
    // Convex records the upload's Content-Type; reject anything that says it isn't an image.
    if (meta.contentType && !meta.contentType.startsWith("image/")) {
      throw appError(ErrorCode.INVALID_INPUT, "That file isn't a photo.");
    }
    await ctx.db.patch(itemId, {
      photoStorageId: storageId,
      photoThumbhash: thumbhash?.slice(0, 64),
    });
  },
});

/**
 * Records what happened to an item at the market. "bought" and "adjusted" (a different size,
 * type or quantity) need a photo first; "adjusted" and "skipped" need a note the customer will
 * read. An item that already has money spent on it can't be skipped. Setting the same outcome
 * again just updates the notes, so the offline queue can replay it.
 */
export const setOutcome = shopperMutation({
  args: {
    itemId: v.id("orderItems"),
    status: v.union(v.literal("bought"), v.literal("adjusted"), v.literal("skipped")),
    shopperNote: v.optional(v.string()),
    quantityNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const item = await itemForShopping(ctx, ctx.user, args.itemId);
    const shopperNote = cleanNote(args.shopperNote);
    const quantityNote = cleanNote(args.quantityNote);

    if (item.status !== args.status && !canTransitionItem(item.status, args.status)) {
      throw appError(ErrorCode.INVALID_TRANSITION, "This item can't change to that now.");
    }
    if (args.status !== "skipped" && !item.photoStorageId) {
      throw appError(ErrorCode.INVALID_INPUT, "Take a photo of the item first.");
    }
    if (args.status === "skipped" && item.amountSpent > 0) {
      throw appError(
        ErrorCode.INVALID_INPUT,
        "Money has already been paid for this item, so it can't be marked not available.",
      );
    }
    if (args.status !== "bought" && (!shopperNote || shopperNote.length < 3)) {
      throw appError(
        ErrorCode.INVALID_INPUT,
        args.status === "skipped"
          ? "Add a short note on why it isn't available."
          : "Add a short note on what you changed.",
      );
    }
    await ctx.db.patch(item._id, {
      status: args.status,
      shopperNote,
      quantityNote,
    });
  },
});
