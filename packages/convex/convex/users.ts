import { v } from "convex/values";
import { normalizeNigerianPhone } from "@ojarun/shared";
import { internalQuery, mutation, query } from "./_generated/server";
import { authedMutation, getCurrentUser, requireUser } from "./lib/auth";
import { appError, ErrorCode } from "./lib/errors";
import { role } from "./schema";

/**
 * Called once after sign-in. Creates the user as a customer; never accepts a role (05 §5.2).
 * Shopper and ops roles are granted only from ops functions.
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

    const phone = identity.phoneNumber ? normalizeNigerianPhone(identity.phoneNumber) : null;

    if (existing) {
      if (phone && existing.phone !== phone) await ctx.db.patch(existing._id, { phone });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkId: identity.subject,
      phone: phone ?? identity.phoneNumber ?? "",
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
      phone: user.phone,
      name: user.name ?? null,
      email: user.email ?? null,
      role: user.role,
      status: user.status,
      walletBalance: user.walletBalance,
      needsProfile: !user.name,
    };
  },
});

export const updateProfile = authedMutation({
  args: { name: v.string(), email: v.optional(v.string()) },
  handler: async (ctx, { name, email }) => {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 60) {
      throw appError(ErrorCode.INVALID_INPUT, "Enter your name (2–60 characters).");
    }
    const cleanEmail = email?.trim().toLowerCase() || undefined;
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw appError(ErrorCode.INVALID_INPUT, "That email address doesn't look right.");
    }
    await ctx.db.patch(ctx.user._id, { name: trimmed, email: cleanEmail });
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
