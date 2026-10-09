import { v } from "convex/values";
import { authedMutation, authedQuery } from "./lib/auth";
import { CHAT_OPEN, chatAccess, requireChatAccess } from "./lib/chat";
import { appError, ErrorCode } from "./lib/errors";
import { notifyUser } from "./lib/notify";
import { hit, LIMITS } from "./lib/rateLimit";
import { orderCode } from "./orders";

/**
 * Order chat (05 §9 M5): customer ↔ shopper text and photos, system lines, and price checks.
 * Open from assignment until delivery; readable afterwards.
 */

const BODY_MAX = 1000;
const HISTORY = 300;

export const generateUploadUrl = authedMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const { order } = await requireChatAccess(ctx, ctx.user, orderId);
    if (!CHAT_OPEN.has(order.status)) throw appError(ErrorCode.INVALID_TRANSITION, "This chat has closed.");
    return await ctx.storage.generateUploadUrl();
  },
});

/** Everything the chat screen needs, live. */
export const list = authedQuery({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const access = await chatAccess(ctx, ctx.user, orderId);
    if (!access) return null;
    const { order, side } = access;
    const open = CHAT_OPEN.has(order.status);

    const otherId = side === "customer" ? order.shopperId : order.customerId;
    const [other, market, rows] = await Promise.all([
      otherId ? ctx.db.get(otherId) : null,
      ctx.db.get(order.marketId),
      ctx.db
        .query("messages")
        .withIndex("by_order", (q) => q.eq("orderId", orderId))
        .order("desc")
        .take(HISTORY),
    ]);
    const otherRead = otherId
      ? await ctx.db
          .query("chatReads")
          .withIndex("by_order_user", (q) => q.eq("orderId", orderId).eq("userId", otherId))
          .unique()
      : null;

    const itemNames = new Map<string, string>();
    const messages = await Promise.all(
      rows.reverse().map(async (m) => {
        let priceCheck = null;
        if (m.priceCheck) {
          const id = m.priceCheck.itemId;
          if (!itemNames.has(id)) itemNames.set(id, (await ctx.db.get(id))?.name ?? "Item");
          priceCheck = { ...m.priceCheck, itemName: itemNames.get(id)! };
        }
        return {
          _id: m._id,
          at: m._creationTime,
          type: m.type,
          mine: m.senderId === ctx.user._id,
          body: m.body ?? null,
          imageUrl: m.imageId ? await ctx.storage.getUrl(m.imageId) : null,
          clientRequestId: m.clientRequestId,
          priceCheck,
        };
      }),
    );

    const customer = side === "customer" ? ctx.user : other;
    return {
      side,
      open,
      status: order.status,
      code: orderCode(order._id),
      marketName: market?.name ?? "the market",
      other: other ? { name: other.name?.split(/\s+/)[0] ?? (side === "customer" ? "Your shopper" : "Customer"), phone: open ? (other.phone ?? null) : null } : null,
      otherReadAt: otherRead?.readAt ?? null,
      messages,
      // What the customer can approve from: leftover buffer first, then the wallet (05 §6.3).
      funding: side === "customer" && customer ? { bufferLeft: order.totals.buffer - order.bufferUsed, walletBalance: customer.walletBalance } : null,
    };
  },
});

/** Unread messages from the other side, for the dot on the chat button. */
export const unread = authedQuery({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const access = await chatAccess(ctx, ctx.user, orderId);
    if (!access || access.side === "ops") return 0;
    const read = await ctx.db
      .query("chatReads")
      .withIndex("by_order_user", (q) => q.eq("orderId", orderId).eq("userId", ctx.user._id))
      .unique();
    const since = read?.readAt ?? 0;
    const recent = await ctx.db
      .query("messages")
      .withIndex("by_order", (q) => q.eq("orderId", orderId).gt("_creationTime", since))
      .collect();
    return recent.filter((m) => m.senderId !== ctx.user._id).length;
  },
});

export const markRead = authedMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    await requireChatAccess(ctx, ctx.user, orderId);
    const row = await ctx.db
      .query("chatReads")
      .withIndex("by_order_user", (q) => q.eq("orderId", orderId).eq("userId", ctx.user._id))
      .unique();
    const latest = await ctx.db
      .query("messages")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .order("desc")
      .first();
    // Never earlier than the newest message, so everything on screen counts as read.
    const readAt = Math.max(Date.now(), latest?._creationTime ?? 0);
    if (row) await ctx.db.patch(row._id, { readAt });
    else await ctx.db.insert("chatReads", { orderId, userId: ctx.user._id, readAt });
  },
});

/** A text or photo message. Idempotent on clientRequestId so a resend never doubles it. */
export const send = authedMutation({
  args: {
    clientRequestId: v.string(),
    orderId: v.id("orders"),
    body: v.optional(v.string()),
    imageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    if (!/^[A-Za-z0-9-]{8,64}$/.test(args.clientRequestId)) throw appError(ErrorCode.INVALID_INPUT, "Bad request id.");
    const seen = await ctx.db
      .query("messages")
      .withIndex("by_clientRequestId", (q) => q.eq("clientRequestId", args.clientRequestId))
      .first();
    if (seen) {
      if (seen.senderId !== ctx.user._id) throw appError(ErrorCode.INVALID_INPUT, "Bad request id.");
      return seen._id;
    }
    const { order } = await requireChatAccess(ctx, ctx.user, args.orderId);
    if (!CHAT_OPEN.has(order.status)) throw appError(ErrorCode.INVALID_TRANSITION, "This chat has closed.");
    await hit(ctx, `chat:${ctx.user._id}`, LIMITS.chat.windowMs, LIMITS.chat.max);

    const body = args.body?.trim();
    if (body && body.length > BODY_MAX) throw appError(ErrorCode.INVALID_INPUT, `Keep messages under ${BODY_MAX} characters.`);
    if (!body && !args.imageId) throw appError(ErrorCode.INVALID_INPUT, "Write a message first.");
    if (args.imageId) {
      const meta = await ctx.db.system.get(args.imageId);
      if (!meta || (meta.contentType && !meta.contentType.startsWith("image/"))) {
        throw appError(ErrorCode.INVALID_INPUT, "The photo didn't upload. Try again.");
      }
    }
    const recipient = ctx.user._id === order.customerId ? order.shopperId : order.customerId;
    const messageId = await ctx.db.insert("messages", {
      orderId: order._id,
      senderId: ctx.user._id,
      type: args.imageId ? "image" : "text",
      body: body || undefined,
      imageId: args.imageId,
      clientRequestId: args.clientRequestId,
    });
    if (recipient) {
      await notifyUser(ctx, recipient, {
        event: "chat_message",
        title: ctx.user.name?.split(/\s+/)[0] ?? "New message",
        body: body ? body.slice(0, 120) : "Sent a photo",
        url: `/chat/${order._id}`,
        dedupeKey: `chat:${messageId}`,
      });
    }
    return messageId;
  },
});
