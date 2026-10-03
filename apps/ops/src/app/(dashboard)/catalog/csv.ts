import Papa from "papaparse";

export type CatalogRow = {
  name: string;
  aliases: string[];
  category: string;
  unitHint?: string;
  presetPreferences: { group: string; options: string[] }[];
};

export const CSV_COLUMNS = ["name", "category", "aliases", "unit_hint", "preferences"] as const;

export const CSV_TEMPLATE = [
  CSV_COLUMNS.join(","),
  'Tomatoes,Vegetables,tomato|tomatoe,"paint rubber, basket","Ripeness: Firm|Ripe; For: Stew|Salad"',
  "Ugu,Leafy greens,pumpkin leaves,bunch,",
].join("\n");

const split = (s: string | undefined, sep: string) =>
  (s ?? "")
    .split(sep)
    .map((x) => x.trim())
    .filter(Boolean);

/** "Ripeness: Firm|Ripe; For: Stew|Salad" → [{group, options}] */
function parsePreferences(s: string | undefined): CatalogRow["presetPreferences"] | string {
  const groups = [];
  for (const part of split(s, ";")) {
    const idx = part.indexOf(":");
    if (idx < 1) return `"${part}" needs a group name, e.g. "Ripeness: Firm|Ripe"`;
    const options = split(part.slice(idx + 1), "|");
    if (!options.length) return `"${part}" has no options`;
    groups.push({ group: part.slice(0, idx).trim(), options });
  }
  return groups;
}

export type ParseResult = { rows: CatalogRow[]; errors: string[] };

/** Parses the ops CSV. Row numbers in errors match what a spreadsheet shows (header = row 1). */
export function parseCatalogCsv(text: string): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });
  const errors: string[] = parsed.errors.slice(0, 5).map((e) => `Row ${(e.row ?? 0) + 2}: ${e.message}`);
  const missing = ["name", "category"].filter((c) => !parsed.meta.fields?.includes(c));
  if (missing.length) return { rows: [], errors: [`Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`] };

  const rows: CatalogRow[] = [];
  parsed.data.forEach((r, i) => {
    const line = i + 2;
    const name = r.name?.trim();
    const category = r.category?.trim();
    if (!name || !category) {
      errors.push(`Row ${line}: name and category are required`);
      return;
    }
    const prefs = parsePreferences(r.preferences);
    if (typeof prefs === "string") {
      errors.push(`Row ${line}: ${prefs}`);
      return;
    }
    rows.push({
      name,
      category,
      aliases: split(r.aliases, "|"),
      unitHint: r.unit_hint?.trim() || undefined,
      presetPreferences: prefs,
    });
  });
  return { rows, errors };
}
