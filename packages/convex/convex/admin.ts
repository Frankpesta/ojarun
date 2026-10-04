import { v } from "convex/values";
import { DEFAULT_SETTINGS, normalizeNigerianPhone } from "@ojarun/shared";
import { internalMutation } from "./_generated/server";

/**
 * One-off: make the first ops admin. Run from the Convex dashboard or CLI after that person
 * has signed in once:  npx convex run admin:bootstrapOps '{"phone":"08031234567"}'
 * For an account without a Nigerian phone (e.g. email sign-in), pass its Clerk user id instead:
 *   npx convex run admin:bootstrapOps '{"clerkId":"user_..."}'
 */
export const bootstrapOps = internalMutation({
  args: { phone: v.optional(v.string()), clerkId: v.optional(v.string()) },
  handler: async (ctx, { phone, clerkId }) => {
    let user;
    if (clerkId) {
      user = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
        .unique();
      if (!user) throw new Error(`No user with Clerk id ${clerkId}. Sign in first.`);
    } else {
      const e164 = phone ? normalizeNigerianPhone(phone) : null;
      if (!e164) throw new Error("Pass a valid Nigerian mobile number or a clerkId.");
      user = await ctx.db
        .query("users")
        .withIndex("by_phone", (q) => q.eq("phone", e164))
        .unique();
      if (!user) throw new Error(`No user with ${e164}. Sign in on the app first.`);
    }
    await ctx.db.patch(user._id, { role: "ops" });
    return user._id;
  },
});

/** Seed default settings if none exist. Safe to re-run. */
export const seedSettings = internalMutation({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();
    if (row) return "exists";
    await ctx.db.insert("settings", { key: "global", value: DEFAULT_SETTINGS });
    return "created";
  },
});
