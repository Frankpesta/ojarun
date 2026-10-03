import { authedQuery } from "./lib/auth";

/** Markets customers can pick, in ops' chosen order. */
export const listActive = authedQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("markets")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
    return rows
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((m) => ({
        _id: m._id,
        name: m.name,
        slug: m.slug,
        lat: m.lat,
        lng: m.lng,
        opensAtMin: m.opensAtMin,
        closesAtMin: m.closesAtMin,
      }));
  },
});
