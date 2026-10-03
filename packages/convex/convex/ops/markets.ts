import { v } from "convex/values";
import { opsMutation, opsQuery } from "../lib/auth";
import { audit } from "../lib/audit";
import { appError, ErrorCode } from "../lib/errors";

export const list = opsQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("markets").collect();
    return rows.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  },
});

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const marketFields = {
  name: v.string(),
  lat: v.number(),
  lng: v.number(),
  opensAtMin: v.number(),
  closesAtMin: v.number(),
  sortOrder: v.number(),
  active: v.boolean(),
};

type MarketInput = { name: string; lat: number; lng: number; opensAtMin: number; closesAtMin: number };

export function marketProblems(m: MarketInput): string[] {
  const problems: string[] = [];
  if (m.name.trim().length < 2) problems.push("Give the market a name.");
  if (!(m.lat >= -90 && m.lat <= 90 && m.lng >= -180 && m.lng <= 180)) problems.push("The pin is not a valid location.");
  const inDay = (n: number) => Number.isInteger(n) && n >= 0 && n <= 24 * 60;
  if (!inDay(m.opensAtMin) || !inDay(m.closesAtMin) || m.opensAtMin >= m.closesAtMin) {
    problems.push("Closing time must be after opening time.");
  }
  return problems;
}

/** Create (no id) or edit a market. Audited. */
export const upsert = opsMutation({
  args: { id: v.optional(v.id("markets")), ...marketFields, reason: v.string() },
  handler: async (ctx, { id, reason, ...fields }) => {
    const problems = marketProblems(fields);
    if (problems.length) throw appError(ErrorCode.INVALID_INPUT, problems.join(" "));
    const name = fields.name.trim();
    const slug = slugify(name);

    const clash = await ctx.db
      .query("markets")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (clash && clash._id !== id) throw appError(ErrorCode.INVALID_INPUT, `A market called ${clash.name} already exists.`);

    const next = { ...fields, name, slug };
    if (id) {
      const before = await ctx.db.get(id);
      if (!before) throw appError(ErrorCode.NOT_FOUND, "Market not found.");
      await audit(ctx, { actorId: ctx.user._id, action: "market.update", targetTable: "markets", targetId: id, reason, before, after: next });
      await ctx.db.patch(id, next);
      return id;
    }
    const newId = await ctx.db.insert("markets", next);
    await audit(ctx, { actorId: ctx.user._id, action: "market.create", targetTable: "markets", targetId: newId, reason, after: next });
    return newId;
  },
});
