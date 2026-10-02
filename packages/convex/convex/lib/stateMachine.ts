import { canTransitionOrder, type OrderStatus } from "@ojarun/shared";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { appError, ErrorCode } from "./errors";

/**
 * The only way an order's status changes (05 §5.3). Rejects illegal moves and records a statusEvent.
 */
export async function transitionOrder(
  ctx: MutationCtx,
  order: Doc<"orders">,
  to: OrderStatus,
  opts: { actorId?: Id<"users">; lat?: number; lng?: number } = {},
): Promise<void> {
  if (!canTransitionOrder(order.status, to)) {
    throw appError(ErrorCode.INVALID_TRANSITION, `Order can't move from ${order.status} to ${to}.`);
  }
  await ctx.db.patch(order._id, { status: to });
  await ctx.db.insert("statusEvents", {
    orderId: order._id,
    status: to,
    actorId: opts.actorId,
    lat: opts.lat,
    lng: opts.lng,
    at: Date.now(),
  });
}
