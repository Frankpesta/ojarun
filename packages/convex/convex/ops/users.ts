import { v } from "convex/values";
import { opsMutation, opsQuery } from "../lib/auth";
import { audit } from "../lib/audit";
import { appError, ErrorCode } from "../lib/errors";
import { role } from "../schema";

export const list = opsQuery({
  args: { role: v.optional(role) },
  handler: async (ctx, args) => {
    const rows = args.role
      ? await ctx.db
          .query("users")
          .withIndex("by_role", (q) => q.eq("role", args.role!))
          .order("desc")
          .take(200)
      : await ctx.db.query("users").order("desc").take(200);
    return rows.map((u) => ({
      _id: u._id,
      _creationTime: u._creationTime,
      phone: u.phone ?? null,
      email: u.email ?? null,
      name: u.name ?? null,
      role: u.role,
      status: u.status,
      walletBalance: u.walletBalance,
    }));
  },
});

/** Grant or change a role. The only path to shopper/ops (05 §5.2). Audited. */
export const setRole = opsMutation({
  args: { userId: v.id("users"), role, reason: v.string() },
  handler: async (ctx, { userId, role: next, reason }) => {
    const target = await ctx.db.get(userId);
    if (!target) throw appError(ErrorCode.NOT_FOUND, "User not found.");
    if (target._id === ctx.user._id && next !== "ops") {
      throw appError(ErrorCode.FORBIDDEN, "You can't remove your own ops access.");
    }
    if (target.role === next) return;
    await audit(ctx, {
      actorId: ctx.user._id,
      action: "user.setRole",
      targetTable: "users",
      targetId: userId,
      reason,
      before: { role: target.role },
      after: { role: next },
    });
    await ctx.db.patch(userId, { role: next });
  },
});

export const setStatus = opsMutation({
  args: {
    userId: v.id("users"),
    status: v.union(v.literal("active"), v.literal("suspended")),
    reason: v.string(),
  },
  handler: async (ctx, { userId, status, reason }) => {
    const target = await ctx.db.get(userId);
    if (!target) throw appError(ErrorCode.NOT_FOUND, "User not found.");
    if (target._id === ctx.user._id) throw appError(ErrorCode.FORBIDDEN, "You can't suspend yourself.");
    await audit(ctx, {
      actorId: ctx.user._id,
      action: "user.setStatus",
      targetTable: "users",
      targetId: userId,
      reason,
      before: { status: target.status },
      after: { status },
    });
    await ctx.db.patch(userId, { status });
  },
});
