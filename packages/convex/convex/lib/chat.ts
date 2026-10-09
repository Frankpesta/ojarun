import type { OrderStatus } from "@ojarun/shared";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { appError, ErrorCode } from "./errors";

/** The chat opens when a shopper is assigned and people can write until delivery. */
export const CHAT_OPEN: ReadonlySet<OrderStatus> = new Set(["assigned", "shopping", "en_route", "arrived"]);

/** The order and the caller's side of its chat, or null if they're not part of it. */
export async function chatAccess(ctx: QueryCtx, user: Doc<"users">, orderId: Id<"orders">) {
  const order = await ctx.db.get(orderId);
  if (!order) return null;
  if (order.customerId === user._id) return { order, side: "customer" as const };
  if (order.shopperId === user._id) return { order, side: "shopper" as const };
  if (user.role === "ops") return { order, side: "ops" as const };
  return null;
}

export async function requireChatAccess(ctx: QueryCtx, user: Doc<"users">, orderId: Id<"orders">) {
  const access = await chatAccess(ctx, user, orderId);
  if (!access || access.side === "ops") throw appError(ErrorCode.NOT_FOUND, "This chat isn't yours.");
  return access as { order: Doc<"orders">; side: "customer" | "shopper" };
}

/** A grey line in the chat from OjaRun itself, e.g. "Tolu started shopping". */
export async function postSystem(ctx: MutationCtx, orderId: Id<"orders">, body: string, key: string): Promise<void> {
  const clientRequestId = `system:${key}`;
  const seen = await ctx.db
    .query("messages")
    .withIndex("by_clientRequestId", (q) => q.eq("clientRequestId", clientRequestId))
    .first();
  if (seen) return;
  await ctx.db.insert("messages", { orderId, type: "system", body, clientRequestId });
}
