import { v } from "convex/values";
import { bookableDates, lagosDayOfWeek, slotInstants } from "@ojarun/shared";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { authedQuery } from "./lib/auth";
import { getSettings } from "./lib/settings";

/**
 * Creates any missing slots for today and the bookable days ahead, from active templates.
 * Idempotent: existing (template, date) slots are left alone, so ops edits survive.
 */
export async function generateSlots(ctx: MutationCtx, now: number): Promise<number> {
  const settings = await getSettings(ctx);
  const templates = (await ctx.db.query("slotTemplates").collect()).filter((t) => t.active);
  let created = 0;

  for (const date of bookableDates(now, settings.bookingDaysAhead)) {
    const dow = lagosDayOfWeek(date);
    for (const t of templates) {
      if (!t.daysOfWeek.includes(dow)) continue;
      const existing = await ctx.db
        .query("slots")
        .withIndex("by_template_date", (q) => q.eq("templateId", t._id).eq("date", date))
        .unique();
      if (existing) continue;

      const times = slotInstants(t, date);
      const open = times.cutoffAt > now;
      const slotId = await ctx.db.insert("slots", {
        templateId: t._id,
        date,
        ...times,
        capacity: t.capacityPerShopper * settings.expectedShoppersPerSlot,
        reserved: 0,
        status: open ? "open" : "closed",
      });
      if (open) await ctx.scheduler.runAt(times.cutoffAt, internal.slots.closeAtCutoff, { slotId });
      created++;
    }
  }
  return created;
}

/** Cron, 00:00 WAT (05 §5.6). Also scheduled after template edits. */
export const generateDaily = internalMutation({
  args: {},
  handler: async (ctx) => generateSlots(ctx, Date.now()),
});

export const closeAtCutoff = internalMutation({
  args: { slotId: v.id("slots") },
  handler: async (ctx, { slotId }) => {
    const slot = await ctx.db.get(slotId);
    // Ops may have moved the cutoff; a later run handles the new time.
    if (!slot || slot.status !== "open" || slot.cutoffAt > Date.now()) return;
    await ctx.db.patch(slotId, { status: "closed" });
  },
});

/**
 * Slots a customer can book: open, before cutoff and not full (product spec §5), grouped by date.
 * Customers can order any time and pick the next window that is still open.
 */
export const available = authedQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const settings = await getSettings(ctx);
    const days = [];
    for (const date of bookableDates(now, settings.bookingDaysAhead)) {
      const slots = await ctx.db
        .query("slots")
        .withIndex("by_date", (q) => q.eq("date", date))
        .collect();
      const open = [];
      for (const s of slots) {
        if (s.status !== "open" || s.cutoffAt <= now || s.reserved >= s.capacity) continue;
        const template = await ctx.db.get(s.templateId);
        open.push({
          _id: s._id,
          label: template?.label ?? "",
          cutoffAt: s.cutoffAt,
          windowStart: s.windowStart,
          windowEnd: s.windowEnd,
          remaining: s.capacity - s.reserved,
        });
      }
      open.sort((a, b) => a.windowStart - b.windowStart);
      days.push({ date, slots: open });
    }
    return days;
  },
});
