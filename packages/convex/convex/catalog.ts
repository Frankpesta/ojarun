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
    }));
  },
});
