import { v } from "convex/values";
import { normalizeNigerianPhone } from "@ojarun/shared";
import { internalQuery, mutation, query } from "./_generated/server";
import { authedMutation, getCurrentUser, requireUser } from "./lib/auth";
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
