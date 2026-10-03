import { v } from "convex/values";
import { addDays, lagosDate, slotTemplateProblems } from "@ojarun/shared";
import { internal } from "../_generated/api";
import { opsMutation, opsQuery } from "../lib/auth";
import { audit } from "../lib/audit";
import { appError, ErrorCode } from "../lib/errors";

export const listTemplates = opsQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("slotTemplates").collect();
    return rows.sort((a, b) => a.windowStartMin - b.windowStartMin);
  },
});

const templateFields = {
  label: v.string(),
  cutoffMin: v.number(),
  windowStartMin: v.number(),
  windowEndMin: v.number(),
  capacityPerShopper: v.number(),
  daysOfWeek: v.array(v.number()),
  active: v.boolean(),
};

/**
 * Create or edit a template. Changes apply to slots generated from now on; slots that already
 * exist keep their times so booked customers aren't moved. Audited.
 */
export const upsertTemplate = opsMutation({
  args: { id: v.optional(v.id("slotTemplates")), ...templateFields, reason: v.string() },
  handler: async (ctx, { id, reason, ...fields }) => {
    const problems = slotTemplateProblems(fields);
    if (fields.label.trim().length < 2) problems.push("Give the slot a label.");
    if (!Number.isInteger(fields.capacityPerShopper) || fields.capacityPerShopper < 1) {
      problems.push("Orders per shopper must be at least 1.");
    }
    if (problems.length) throw appError(ErrorCode.INVALID_INPUT, problems.join(" "));
    const next = { ...fields, label: fields.label.trim(), daysOfWeek: [...new Set(fields.daysOfWeek)].sort((a, b) => a - b) };

    let templateId = id;
    if (id) {
      const before = await ctx.db.get(id);
      if (!before) throw appError(ErrorCode.NOT_FOUND, "Slot template not found.");
      await audit(ctx, { actorId: ctx.user._id, action: "slotTemplate.update", targetTable: "slotTemplates", targetId: id, reason, before, after: next });
      await ctx.db.patch(id, next);
    } else {
      templateId = await ctx.db.insert("slotTemplates", next);
      await audit(ctx, { actorId: ctx.user._id, action: "slotTemplate.create", targetTable: "slotTemplates", targetId: templateId, reason, after: next });
    }
    // A new or re-enabled template should be bookable straight away, not after midnight.
    await ctx.scheduler.runAfter(0, internal.slots.generateDaily, {});
    return templateId!;
  },
});

/** Generated slots for today and the next few days, with their template labels. */
export const listSlots = opsQuery({
  args: {},
  handler: async (ctx) => {
    const today = lagosDate(Date.now());
    const dates = [addDays(today, -1), today, addDays(today, 1), addDays(today, 2)];
    const out = [];
    for (const date of dates) {
      const slots = await ctx.db
        .query("slots")
        .withIndex("by_date", (q) => q.eq("date", date))
        .collect();
      for (const s of slots) {
        const t = await ctx.db.get(s.templateId);
        out.push({ ...s, label: t?.label ?? "Deleted template" });
      }
    }
    return out.sort((a, b) => a.windowStart - b.windowStart);
  },
});

/** Adjust one day's slot: capacity (never below what's already booked) or open/closed. Audited. */
export const updateSlot = opsMutation({
  args: {
    slotId: v.id("slots"),
    capacity: v.optional(v.number()),
    status: v.optional(v.union(v.literal("open"), v.literal("closed"))),
    reason: v.string(),
  },
  handler: async (ctx, { slotId, capacity, status, reason }) => {
    const slot = await ctx.db.get(slotId);
    if (!slot) throw appError(ErrorCode.NOT_FOUND, "Slot not found.");
    const patch: { capacity?: number; status?: "open" | "closed" } = {};
    if (capacity !== undefined) {
      if (!Number.isInteger(capacity) || capacity < slot.reserved) {
        throw appError(ErrorCode.INVALID_INPUT, `Capacity can't go below the ${slot.reserved} orders already booked.`);
      }
      patch.capacity = capacity;
    }
    if (status !== undefined) {
      if (status === "open" && slot.cutoffAt <= Date.now()) {
        throw appError(ErrorCode.INVALID_INPUT, "This slot's cutoff has passed, so it can't reopen.");
      }
      patch.status = status;
    }
    await audit(ctx, {
      actorId: ctx.user._id,
      action: "slot.update",
      targetTable: "slots",
      targetId: slotId,
      reason,
      before: { capacity: slot.capacity, status: slot.status },
      after: patch,
    });
    await ctx.db.patch(slotId, patch);
  },
});

/** Create any missing slots now instead of waiting for midnight. */
export const generateNow = opsMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.slots.generateDaily, {});
  },
});
