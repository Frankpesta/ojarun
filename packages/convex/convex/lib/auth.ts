import { customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import type { Role } from "@ojarun/shared";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { appError, ErrorCode } from "./errors";

/** The signed-in user's row, or null if not signed in / not yet created by ensureUser. */
export async function getCurrentUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();
}

export async function requireUser(
  ctx: QueryCtx | MutationCtx,
  roles?: readonly Role[],
): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!user) throw appError(ErrorCode.UNAUTHENTICATED, "Sign in to continue.");
  if (user.status !== "active") throw appError(ErrorCode.FORBIDDEN, "This account is not active.");
  if (roles && !roles.includes(user.role)) {
    throw appError(ErrorCode.FORBIDDEN, "You don't have access to this.");
  }
  return user;
}

const withUser = (roles?: readonly Role[]) =>
  customCtx(async (ctx: QueryCtx) => ({ user: await requireUser(ctx, roles) }));

const withUserM = (roles?: readonly Role[]) =>
  customCtx(async (ctx: MutationCtx) => ({ user: await requireUser(ctx, roles) }));

/**
 * Every public function uses one of these (05 §1.4). Hiding screens in the app is not access control.
 */
export const authedQuery = customQuery(query, withUser());
export const authedMutation = customMutation(mutation, withUserM());

export const customerQuery = customQuery(query, withUser(["customer"]));
export const customerMutation = customMutation(mutation, withUserM(["customer"]));

export const shopperQuery = customQuery(query, withUser(["shopper"]));
export const shopperMutation = customMutation(mutation, withUserM(["shopper"]));

export const opsQuery = customQuery(query, withUser(["ops"]));
export const opsMutation = customMutation(mutation, withUserM(["ops"]));
