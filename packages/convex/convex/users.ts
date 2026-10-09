import { v } from "convex/values";
import { normalizeNigerianPhone } from "@ojarun/shared";
import { internalAction, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { audit } from "./lib/audit";
import { authedMutation, customerMutation, customerQuery, getCurrentUser, requireUser } from "./lib/auth";
import { appError, ErrorCode } from "./lib/errors";
import { role } from "./schema";

/**
 * Called once after sign-in. Creates the user as a customer; never accepts a role (05 §5.2).
 * Shopper and ops roles are granted only from ops functions.
 * Sign-in is by email code; the phone number is collected afterwards in profile setup.
 */
export const ensureUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw appError(ErrorCode.UNAUTHENTICATED, "Sign in to continue.");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    const email = identity.email?.trim().toLowerCase() || undefined;
    // Honour a Nigerian number on the Clerk account if there is one (e.g. older phone sign-ups).
    const phone = (identity.phoneNumber && normalizeNigerianPhone(identity.phoneNumber)) || undefined;

    if (existing) {
      const patch: { email?: string; phone?: string } = {};
      if (email && existing.email !== email) patch.email = email;
      if (phone && !existing.phone) patch.phone = phone;
      if (Object.keys(patch).length) await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkId: identity.subject,
      email,
      phone,
      name: identity.name ?? undefined,
      role: "customer",
      status: "active",
      walletBalance: 0,
    });
  },
});

/** The signed-in user, or null. Drives the role router in the app. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return {
      _id: user._id,
      phone: user.phone || null,
      name: user.name ?? null,
      email: user.email ?? null,
      role: user.role,
      status: user.status,
      walletBalance: user.walletBalance,
      // Shoppers call the customer at the door, so a phone number is required before ordering.
      needsProfile: !user.name || !user.phone,
    };
  },
});

export const updateProfile = authedMutation({
  args: { name: v.string(), phone: v.string() },
  handler: async (ctx, { name, phone }) => {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 60) {
      throw appError(ErrorCode.INVALID_INPUT, "Enter your name (2–60 characters).");
    }
    const e164 = normalizeNigerianPhone(phone);
    if (!e164) {
      throw appError(ErrorCode.INVALID_INPUT, "Enter an 11-digit Nigerian mobile number, like 0803 123 4567.");
    }
    const taken = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", e164))
      .first();
    if (taken && taken._id !== ctx.user._id) {
      throw appError(ErrorCode.INVALID_INPUT, "That number is already on another OjaRun account.");
    }
    await ctx.db.patch(ctx.user._id, { name: trimmed, phone: e164 });
  },
});

export const registerPushToken = authedMutation({
  args: { token: v.string(), platform: v.string() },
  handler: async (ctx, { token, platform }) => {
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { userId: ctx.user._id, platform, updatedAt: Date.now() });
      return;
    }
    await ctx.db.insert("pushTokens", { userId: ctx.user._id, token, platform, updatedAt: Date.now() });
  },
});

/** Role check for actions, which can't use the query/mutation wrappers. See lib/actionAuth. */
export const assertCaller = internalQuery({
  args: { roles: v.optional(v.array(role)) },
  handler: async (ctx, { roles }) => {
    const user = await requireUser(ctx, roles);
    return { _id: user._id, role: user.role };
  },
});

const FINISHED = new Set(["completed", "cancelled", "expired"]);

async function deletionBlockers(ctx: QueryCtx, user: Doc<"users">): Promise<string[]> {
  const out: string[] = [];
  const orders = await ctx.db
    .query("orders")
    .withIndex("by_customer", (q) => q.eq("customerId", user._id))
    .collect();
  if (orders.some((o) => !FINISHED.has(o.status))) out.push("You have an order in progress. Wait until it's delivered or cancel it.");
  if (user.walletBalance > 0) out.push("Your wallet still has money in it. Withdraw it first, or contact support if it's under the minimum.");
  const withdrawals = await ctx.db
    .query("withdrawals")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect();
  if (withdrawals.some((w) => w.status === "requested" || w.status === "pending")) out.push("A withdrawal is still on its way to your bank.");
  return out;
}

/** What stands in the way of deleting the account, for the delete sheet. */
export const deletionCheck = customerQuery({
  args: {},
  handler: async (ctx) => ({ blockers: await deletionBlockers(ctx, ctx.user) }),
});

/**
 * Account deletion (Google Play). Soft delete: personal details are wiped and the sign-in is
 * detached, but ledger, payment and order rows stay for accounting (05 §2). Audited.
 */
export const deleteAccount = customerMutation({
  args: {},
  handler: async (ctx) => {
    const user = ctx.user;
    const blockers = await deletionBlockers(ctx, user);
    if (blockers.length) throw appError(ErrorCode.INVALID_INPUT, blockers[0]!);
    await audit(ctx, {
      actorId: user._id,
      action: "user.delete",
      targetTable: "users",
      targetId: user._id,
      reason: "Customer deleted their account",
    });
    const addresses = await ctx.db
      .query("addresses")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const a of addresses) {
      await ctx.db.patch(a._id, { archived: true, label: "Deleted", formatted: "Deleted", landmark: "Deleted", placeId: undefined });
    }
    const tokens = await ctx.db
      .query("pushTokens")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const t of tokens) await ctx.db.delete(t._id);
    await ctx.db.patch(user._id, {
      status: "deleted",
      deletedAt: Date.now(),
      clerkId: `deleted:${user._id}`,
      name: undefined,
      email: undefined,
      phone: undefined,
      payoutAccount: undefined,
    });
    await ctx.scheduler.runAfter(0, internal.users.deleteClerkUser, { clerkId: user.clerkId });
  },
});

/** Removes the Clerk sign-in too, when the Clerk secret is configured. */
export const deleteClerkUser = internalAction({
  args: { clerkId: v.string() },
  handler: async (_ctx, { clerkId }) => {
    const key = process.env.CLERK_SECRET_KEY;
    if (!key) {
      console.warn({ evt: "user.delete.clerk_skipped", reason: "CLERK_SECRET_KEY not set" });
      return;
    }
    const res = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(clerkId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok && res.status !== 404) console.error({ evt: "user.delete.clerk_failed", status: res.status });
  },
});
