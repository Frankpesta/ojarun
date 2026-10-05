import type { Kobo } from "./money";

/** Limits for one list item. The app checks them as the customer types; orders.create re-checks. */
export const ITEM_LIMITS = {
  nameMax: 60,
  noteMax: 200,
  preferencesMax: 6,
  preferenceMax: 40,
  minBudgetKobo: 100_00,
  maxBudgetKobo: 500_000_00,
} as const;

export type DraftItem = {
  name: string;
  catalogItemId?: string;
  budget: Kobo;
  preferences: string[];
  note?: string;
};

/** Plain-language problem with one item, or null if it's fine. */
export function itemProblem(item: DraftItem): string | null {
  const name = item.name.trim();
  if (!name) return "Give the item a name.";
  if (name.length > ITEM_LIMITS.nameMax) return `Keep the item name under ${ITEM_LIMITS.nameMax} characters.`;
  if (!Number.isSafeInteger(item.budget) || item.budget < ITEM_LIMITS.minBudgetKobo) {
    return "Set a budget of at least ₦100.";
  }
  if (item.budget > ITEM_LIMITS.maxBudgetKobo) return "That budget is too high for one item.";
  if (item.preferences.length > ITEM_LIMITS.preferencesMax) return "Pick fewer preferences.";
  if (item.preferences.some((p) => !p.trim() || p.length > ITEM_LIMITS.preferenceMax)) return "One of the preferences is invalid.";
  if ((item.note?.trim().length ?? 0) > ITEM_LIMITS.noteMax) {
    return `Keep the note under ${ITEM_LIMITS.noteMax} characters.`;
  }
  return null;
}
