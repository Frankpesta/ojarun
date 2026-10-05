import { v } from "convex/values";
import { authedQuery } from "./lib/auth";

/** Lower-cased name + aliases, the field the search index reads. */
export function catalogSearchText(name: string, aliases: readonly string[]): string {
  return [name, ...aliases].join(" ").toLowerCase();
}

/**
 * Suggestions while a customer types an item name. Free text is always allowed; this only
 * offers matches with preset preferences and unit hints (product spec §5).
 */
export const searchItems = authedQuery({
  args: { query: v.string() },
  handler: async (ctx, { query }) => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const rows = await ctx.db
      .query("catalogItems")
      .withSearchIndex("search_text", (s) => s.search("searchText", q).eq("active", true))
      .take(8);
    return rows.map((r) => ({
      _id: r._id,
      name: r.name,
      category: r.category,
      unitHint: r.unitHint ?? null,
      presetPreferences: r.presetPreferences,
      suggestedBudgetsKobo: r.suggestedBudgetsKobo ?? null,
    }));
  },
});

/** A few staples for one-tap adding on the home screen, in the order ops created them. */
export const featured = authedQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("catalogItems").order("asc").take(60);
    return rows
      .filter((r) => r.active)
      .slice(0, 8)
      .map((r) => ({
        _id: r._id,
        name: r.name,
        unitHint: r.unitHint ?? null,
        presetPreferences: r.presetPreferences,
        suggestedBudgetsKobo: r.suggestedBudgetsKobo ?? null,
      }));
  },
});
