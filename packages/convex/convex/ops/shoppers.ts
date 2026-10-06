import { v } from "convex/values";
import { nameTokens } from "@ojarun/shared";
import { opsMutation, opsQuery } from "../lib/auth";
import { audit } from "../lib/audit";
import { appError, ErrorCode } from "../lib/errors";

/** Every shopper with their profile and whether they're on shift. */
export const list = opsQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "shopper"))
      .collect();
    const out = [];
    for (const u of users) {
      const profile = await ctx.db
        .query("shopperProfiles")
        .withIndex("by_user", (q) => q.eq("userId", u._id))
        .unique();
      out.push({
        _id: u._id,
        name: u.name ?? null,
        phone: u.phone ?? null,
        email: u.email ?? null,
        status: u.status,
        legalName: profile?.legalName ?? null,
        active: profile?.active ?? false,
        onShift: profile?.onShift ?? false,
        lastLocation: profile?.lastLocation ?? null,
      });
    }
    return out.sort(
      (a, b) => Number(b.onShift) - Number(a.onShift) || (a.legalName ?? "").localeCompare(b.legalName ?? ""),
    );
  },
});

/**
 * Makes an existing account a shopper (05 §5.2). The legal name must match their bank account:
 * it's what trader transfers are checked against to block a shopper paying themselves. Audited.
 */
export const createShopper = opsMutation({
  args: { userId: v.id("users"), legalName: v.string(), reason: v.string() },
  handler: async (ctx, { userId, legalName, reason }) => {
    const target = await ctx.db.get(userId);
    if (!target) throw appError(ErrorCode.NOT_FOUND, "User not found.");
    if (target.role === "ops") throw appError(ErrorCode.INVALID_INPUT, "Ops accounts can't also be shoppers.");
    const name = legalName.trim().replace(/\s+/g, " ");
    const tokens = nameTokens(name);
    if (tokens.length < 2) {
      throw appError(
        ErrorCode.INVALID_INPUT,
        "Enter the shopper's full legal name, as it appears on their bank account.",
      );
    }

    const profile = await ctx.db
      .query("shopperProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    await audit(ctx, {
      actorId: ctx.user._id,
      action: "shopper.create",
      targetTable: "users",
      targetId: userId,
      reason,
      before: { role: target.role, legalName: profile?.legalName },
      after: { role: "shopper", legalName: name },
    });
    if (profile) {
      await ctx.db.patch(profile._id, {
        legalName: name,
        nameTokens: tokens,
        active: true,
      });
    } else {
      await ctx.db.insert("shopperProfiles", {
        userId,
        active: true,
        onShift: false,
        legalName: name,
        nameTokens: tokens,
        bankAccounts: [],
      });
    }
    if (target.role !== "shopper") await ctx.db.patch(userId, { role: "shopper" });
  },
});

/** Put a shopper on or off shift from the dashboard, e.g. when they call in sick. Audited. */
export const setShift = opsMutation({
  args: { userId: v.id("users"), onShift: v.boolean(), reason: v.string() },
  handler: async (ctx, { userId, onShift, reason }) => {
    const profile = await ctx.db
      .query("shopperProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) throw appError(ErrorCode.NOT_FOUND, "Shopper profile not found.");
    if (onShift && !profile.active) throw appError(ErrorCode.INVALID_INPUT, "Reactivate this shopper first.");
    await audit(ctx, {
      actorId: ctx.user._id,
      action: "shopper.setShift",
      targetTable: "shopperProfiles",
      targetId: profile._id,
      reason,
      before: { onShift: profile.onShift },
      after: { onShift },
    });
    await ctx.db.patch(profile._id, { onShift });
  },
});

/** Stop (or restart) giving a shopper batches without removing their history. Audited. */
export const setActive = opsMutation({
  args: { userId: v.id("users"), active: v.boolean(), reason: v.string() },
  handler: async (ctx, { userId, active, reason }) => {
    const profile = await ctx.db
      .query("shopperProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) throw appError(ErrorCode.NOT_FOUND, "Shopper profile not found.");
    await audit(ctx, {
      actorId: ctx.user._id,
      action: "shopper.setActive",
      targetTable: "shopperProfiles",
      targetId: profile._id,
      reason,
      before: { active: profile.active },
      after: { active },
    });
    await ctx.db.patch(profile._id, {
      active,
      onShift: active ? profile.onShift : false,
    });
  },
});
