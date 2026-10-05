import { DEFAULT_SETTINGS } from "@ojarun/shared";
import { internalMutation } from "./_generated/server";
import { generateSlots } from "./slots";
import { slugify } from "./ops/markets";
import { upsertCatalog, type CatalogRow } from "./ops/catalog";

/**
 * Reference data for a fresh deployment. Safe to re-run: it only adds what's missing and never
 * overwrites ops edits (except catalogue rows of the same name, which it refreshes).
 *
 *   npx convex run seed:run
 */

// APPROXIMATE pins around central Akure. Ops must drag each to the real entrance before launch.
const MARKETS = [
  { name: "Oja Oba", lat: 7.2507, lng: 5.195 },
  { name: "Erekesan Market", lat: 7.2481, lng: 5.1932 },
  { name: "Isikan Market", lat: 7.2617, lng: 5.2049 },
  { name: "NEPA Market", lat: 7.2562, lng: 5.2011 },
  { name: "Shasha Market", lat: 7.2405, lng: 5.2072 },
];

const MON_TO_SAT = [1, 2, 3, 4, 5, 6];

// The spec's example windows (product spec §5). Ops edits them in the dashboard.
const TEMPLATES = [
  { label: "Afternoon", cutoffMin: 10 * 60, windowStartMin: 13 * 60, windowEndMin: 15 * 60 },
  { label: "Evening", cutoffMin: 13 * 60, windowStartMin: 16 * 60, windowEndMin: 18 * 60 },
];

const ripeness = { group: "Ripeness", options: ["Firm", "Ripe", "Very ripe"] };
const size = { group: "Size", options: ["Small", "Medium", "Big"] };
const fresh = { group: "Condition", options: ["Fresh", "Dried"] };

const ITEMS: CatalogRow[] = [
  { name: "Tomatoes", aliases: ["tomato", "tomatoe"], category: "Vegetables", unitHint: "paint rubber, basket", presetPreferences: [ripeness, { group: "For", options: ["Stew", "Salad"] }] },
  { name: "Tatashe", aliases: ["red bell pepper", "bell pepper"], category: "Peppers", unitHint: "heap", presetPreferences: [size] },
  { name: "Rodo", aliases: ["scotch bonnet", "atarodo", "hot pepper"], category: "Peppers", unitHint: "heap, paint rubber", presetPreferences: [size] },
  { name: "Shombo", aliases: ["long pepper", "sombo"], category: "Peppers", unitHint: "heap", presetPreferences: [] },
  { name: "Onions", aliases: ["onion", "alubosa"], category: "Vegetables", unitHint: "heap, bag", presetPreferences: [{ group: "Type", options: ["Red", "White"] }, size] },
  { name: "Yam", aliases: ["isu", "tuber"], category: "Tubers", unitHint: "tuber", presetPreferences: [size, { group: "For", options: ["Pounding", "Boiling", "Frying"] }] },
  { name: "Plantain", aliases: ["ogede", "dodo"], category: "Fruit", unitHint: "bunch, fingers", presetPreferences: [{ group: "Ripeness", options: ["Unripe", "Semi-ripe", "Ripe"] }] },
  { name: "Irish potatoes", aliases: ["potato", "potatoes"], category: "Tubers", unitHint: "paint rubber", presetPreferences: [size] },
  { name: "Sweet potatoes", aliases: ["sweet potato"], category: "Tubers", unitHint: "heap", presetPreferences: [size] },
  { name: "Rice", aliases: ["iresi", "local rice", "foreign rice"], category: "Grains", unitHint: "derica, mudu, bag", presetPreferences: [{ group: "Type", options: ["Local (Ofada)", "Foreign", "Any"] }] },
  { name: "Beans", aliases: ["ewa", "oloyin", "honey beans"], category: "Grains", unitHint: "derica, mudu", presetPreferences: [{ group: "Type", options: ["Oloyin (honey)", "Brown", "White", "Any"] }] },
  { name: "Garri", aliases: ["gari", "eba"], category: "Grains", unitHint: "derica, mudu, paint rubber", presetPreferences: [{ group: "Type", options: ["White", "Yellow", "Ijebu"] }] },
  { name: "Elubo", aliases: ["yam flour", "amala flour"], category: "Grains", unitHint: "mudu", presetPreferences: [] },
  { name: "Palm oil", aliases: ["epo pupa", "red oil"], category: "Oils", unitHint: "bottle, litre, keg", presetPreferences: [] },
  { name: "Vegetable oil", aliases: ["groundnut oil", "oil"], category: "Oils", unitHint: "bottle, litre", presetPreferences: [] },
  { name: "Ugu", aliases: ["pumpkin leaves", "fluted pumpkin"], category: "Leafy greens", unitHint: "bunch", presetPreferences: [] },
  { name: "Efo tete", aliases: ["amaranth", "efo", "green"], category: "Leafy greens", unitHint: "bunch", presetPreferences: [] },
  { name: "Efo shoko", aliases: ["soko", "lagos spinach"], category: "Leafy greens", unitHint: "bunch", presetPreferences: [] },
  { name: "Ewedu", aliases: ["jute leaves"], category: "Leafy greens", unitHint: "bunch", presetPreferences: [] },
  { name: "Okra", aliases: ["okro", "ila"], category: "Vegetables", unitHint: "heap", presetPreferences: [{ group: "Texture", options: ["Tender", "Any"] }] },
  { name: "Egusi", aliases: ["melon seeds"], category: "Soup ingredients", unitHint: "derica, cup", presetPreferences: [{ group: "Form", options: ["Ground", "Whole"] }] },
  { name: "Ogbono", aliases: ["apon", "bush mango seed"], category: "Soup ingredients", unitHint: "cup", presetPreferences: [{ group: "Form", options: ["Ground", "Whole"] }] },
  { name: "Crayfish", aliases: ["ede"], category: "Soup ingredients", unitHint: "cup, derica", presetPreferences: [{ group: "Form", options: ["Ground", "Whole"] }] },
  { name: "Iru", aliases: ["locust beans", "dawadawa"], category: "Soup ingredients", unitHint: "wrap", presetPreferences: [] },
  { name: "Stockfish", aliases: ["okporoko", "panla"], category: "Fish & meat", unitHint: "piece", presetPreferences: [size] },
  { name: "Fish", aliases: ["eja", "catfish", "titus", "mackerel"], category: "Fish & meat", unitHint: "piece, kg", presetPreferences: [fresh, { group: "Type", options: ["Catfish", "Titus", "Tilapia", "Any"] }] },
  { name: "Beef", aliases: ["meat", "eran"], category: "Fish & meat", unitHint: "kg, piece", presetPreferences: [{ group: "Cut", options: ["Boneless", "With bone", "Assorted"] }] },
  { name: "Ponmo", aliases: ["kpomo", "cow skin"], category: "Fish & meat", unitHint: "piece", presetPreferences: [] },
  { name: "Chicken", aliases: ["adie", "broiler"], category: "Fish & meat", unitHint: "whole, kg", presetPreferences: [{ group: "Type", options: ["Live", "Dressed", "Frozen"] }] },
  { name: "Eggs", aliases: ["egg", "eyin"], category: "Fish & meat", unitHint: "crate, half crate", presetPreferences: [size] },
  { name: "Ginger", aliases: ["ata ile"], category: "Spices", unitHint: "heap", presetPreferences: [] },
  { name: "Garlic", aliases: ["ayu"], category: "Spices", unitHint: "heap", presetPreferences: [] },
];

// ESTIMATED Akure prices in naira (Oct 2026) for the add-item budget chips. Ops refines them.
const BUDGETS: Record<string, [number, number, number]> = {
  Tomatoes: [2_000, 3_000, 5_000],
  Tatashe: [1_000, 2_000, 3_000],
  Rodo: [500, 1_000, 2_000],
  Shombo: [500, 1_000, 2_000],
  Onions: [1_000, 2_000, 3_000],
  Yam: [3_000, 5_000, 8_000],
  Plantain: [1_500, 2_500, 4_000],
  "Irish potatoes": [2_000, 3_000, 5_000],
  "Sweet potatoes": [1_000, 2_000, 3_000],
  Rice: [2_500, 5_000, 10_000],
  Beans: [2_000, 4_000, 8_000],
  Garri: [1_500, 3_000, 5_000],
  Elubo: [2_000, 4_000, 6_000],
  "Palm oil": [2_000, 4_000, 7_000],
  "Vegetable oil": [2_500, 5_000, 9_000],
  Ugu: [500, 1_000, 2_000],
  "Efo tete": [500, 1_000, 2_000],
  "Efo shoko": [500, 1_000, 2_000],
  Ewedu: [500, 1_000, 2_000],
  Okra: [500, 1_000, 2_000],
  Egusi: [1_500, 3_000, 5_000],
  Ogbono: [2_000, 3_500, 6_000],
  Crayfish: [1_500, 3_000, 5_000],
  Iru: [300, 500, 1_000],
  Stockfish: [2_000, 4_000, 8_000],
  Fish: [3_000, 5_000, 8_000],
  Beef: [3_000, 5_000, 10_000],
  Ponmo: [1_000, 2_000, 3_000],
  Chicken: [6_000, 10_000, 15_000],
  Eggs: [2_500, 5_000, 9_000],
  Ginger: [500, 1_000, 1_500],
  Garlic: [500, 1_000, 1_500],
};

const CATALOG: CatalogRow[] = ITEMS.map((item) => ({
  ...item,
  suggestedBudgetsKobo: BUDGETS[item.name]?.map((n) => n * 100),
}));

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const summary = { settings: "exists", markets: 0, templates: 0, catalog: { created: 0, updated: 0 }, slots: 0 };

    const settings = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();
    if (!settings) {
      await ctx.db.insert("settings", { key: "global", value: DEFAULT_SETTINGS });
      summary.settings = "created";
    }

    for (const [i, m] of MARKETS.entries()) {
      const slug = slugify(m.name);
      const existing = await ctx.db
        .query("markets")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();
      if (existing) continue;
      await ctx.db.insert("markets", { ...m, slug, opensAtMin: 7 * 60, closesAtMin: 18 * 60, active: true, sortOrder: i });
      summary.markets++;
    }

    if ((await ctx.db.query("slotTemplates").first()) === null) {
      for (const t of TEMPLATES) {
        await ctx.db.insert("slotTemplates", { ...t, capacityPerShopper: 4, daysOfWeek: MON_TO_SAT, active: true });
        summary.templates++;
      }
    }

    summary.catalog = await upsertCatalog(ctx, CATALOG);
    summary.slots = await generateSlots(ctx, Date.now());
    return summary;
  },
});
