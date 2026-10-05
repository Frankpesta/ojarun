import { v } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import { opsMutation, opsQuery } from "../lib/auth";
import { audit } from "../lib/audit";
import { appError, ErrorCode } from "../lib/errors";
import { catalogSearchText } from "../catalog";

export const list = opsQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("catalogItems").collect();
    return rows.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  },
});

export const catalogRow = v.object({
  name: v.string(),
  aliases: v.array(v.string()),
  category: v.string(),
  unitHint: v.optional(v.string()),
  presetPreferences: v.array(v.object({ group: v.string(), options: v.array(v.string()) })),
  suggestedBudgetsKobo: v.optional(v.array(v.number())),
});

export type CatalogRow = {
  name: string;
  aliases: string[];
  category: string;
  unitHint?: string;
  presetPreferences: { group: string; options: string[] }[];
  suggestedBudgetsKobo?: number[];
};

/** Up to 3 distinct whole-naira amounts of at least ₦100, ascending; undefined when none are valid. */
export function cleanBudgets(raw: readonly number[] | undefined): number[] | undefined {
  const ok = [...new Set((raw ?? []).filter((k) => Number.isSafeInteger(k) && k >= 100_00 && k % 100 === 0))];
  return ok.length ? ok.sort((a, b) => a - b).slice(0, 3) : undefined;
}

const clean = (s: string) => s.trim().replace(/\s+/g, " ");

/**
 * Insert new items and update existing ones, matched by name (case-insensitive). Items missing
 * from the import are left alone. Shared by the ops import and the seed.
 */
export async function upsertCatalog(ctx: MutationCtx, rows: CatalogRow[]) {
  const existing = await ctx.db.query("catalogItems").collect();
  const byName = new Map(existing.map((r) => [r.name.toLowerCase(), r]));
  let created = 0;
  let updated = 0;

  for (const raw of rows) {
    const name = clean(raw.name);
    const category = clean(raw.category);
    if (!name || !category) continue;
    const aliases = [...new Set(raw.aliases.map(clean).filter(Boolean))];
    const presetPreferences = raw.presetPreferences
      .map((p) => ({ group: clean(p.group), options: [...new Set(p.options.map(clean).filter(Boolean))] }))
      .filter((p) => p.group && p.options.length);
    const doc = {
      name,
      aliases,
      category,
      unitHint: raw.unitHint ? clean(raw.unitHint) || undefined : undefined,
      presetPreferences,
      suggestedBudgetsKobo: cleanBudgets(raw.suggestedBudgetsKobo),
      active: true,
      searchText: catalogSearchText(name, aliases),
    };
    const match = byName.get(name.toLowerCase());
    if (match) {
      // Keep ops' on/off choice; an import refreshes content, not availability. Rows without
      // budget chips keep the ones ops set in the dashboard.
      await ctx.db.patch(match._id, {
        ...doc,
        suggestedBudgetsKobo: doc.suggestedBudgetsKobo ?? match.suggestedBudgetsKobo,
        active: match.active,
      });
      updated++;
    } else {
      const id = await ctx.db.insert("catalogItems", doc);
      byName.set(name.toLowerCase(), { ...doc, _id: id, _creationTime: Date.now() });
      created++;
    }
  }
  return { created, updated };
}

/** CSV import from the ops dashboard. The browser parses the file; this validates and upserts. */
export const importItems = opsMutation({
  args: { rows: v.array(catalogRow), reason: v.string() },
  handler: async (ctx, { rows, reason }) => {
    if (rows.length === 0) throw appError(ErrorCode.INVALID_INPUT, "The file has no items.");
    if (rows.length > 1000) throw appError(ErrorCode.INVALID_INPUT, "Import at most 1,000 items at a time.");
    const result = await upsertCatalog(ctx, rows);
    await audit(ctx, {
      actorId: ctx.user._id,
      action: "catalog.import",
      targetTable: "catalogItems",
      targetId: "bulk",
      reason,
      after: result,
    });
    return result;
  },
});

export const setActive = opsMutation({
  args: { id: v.id("catalogItems"), active: v.boolean(), reason: v.string() },
  handler: async (ctx, { id, active, reason }) => {
    const item = await ctx.db.get(id);
    if (!item) throw appError(ErrorCode.NOT_FOUND, "Item not found.");
    await audit(ctx, {
      actorId: ctx.user._id,
      action: "catalog.setActive",
      targetTable: "catalogItems",
      targetId: id,
      reason,
      before: { active: item.active },
      after: { active },
    });
    await ctx.db.patch(id, { active });
  },
});

/** Quick budget chips on the add-item sheet. An empty list falls back to the generic chips. */
export const setBudgets = opsMutation({
  args: { id: v.id("catalogItems"), budgetsKobo: v.array(v.number()), reason: v.string() },
  handler: async (ctx, { id, budgetsKobo, reason }) => {
    const item = await ctx.db.get(id);
    if (!item) throw appError(ErrorCode.NOT_FOUND, "Item not found.");
    if (budgetsKobo.length > 3) throw appError(ErrorCode.INVALID_INPUT, "Use at most 3 amounts.");
    const next = cleanBudgets(budgetsKobo);
    if (budgetsKobo.length && next?.length !== budgetsKobo.length) {
      throw appError(ErrorCode.INVALID_INPUT, "Amounts must be different whole naira of at least ₦100.");
    }
    await audit(ctx, {
      actorId: ctx.user._id,
      action: "catalog.setBudgets",
      targetTable: "catalogItems",
      targetId: id,
      reason,
      before: { suggestedBudgetsKobo: item.suggestedBudgetsKobo ?? null },
      after: { suggestedBudgetsKobo: next ?? null },
    });
    await ctx.db.patch(id, { suggestedBudgetsKobo: next });
  },
});
