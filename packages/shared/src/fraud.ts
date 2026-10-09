import { nameTokens } from "./batching";

export type NameMatch = "block" | "flag" | "none";

/**
 * How closely a trader's resolved account name matches a shopper's names (05 §6.2). Sharing
 * `blockAt` or more name parts blocks the transfer; one shared part (often just a common surname)
 * only flags it for ops review.
 */
export function nameMatch(resolvedName: string, shopperTokens: readonly string[], blockAt: number): NameMatch {
  const mine = new Set(shopperTokens);
  const shared = nameTokens(resolvedName).filter((t) => mine.has(t)).length;
  if (shared >= Math.max(1, blockAt)) return "block";
  return shared > 0 ? "flag" : "none";
}

/** Nigerian NUBAN account numbers are exactly 10 digits. */
export function isNuban(accountNumber: string): boolean {
  return /^\d{10}$/.test(accountNumber);
}

/** "0123456789" → "•••• 6789", for lists where the full number isn't needed. */
export function maskAccount(accountNumber: string): string {
  return `•••• ${accountNumber.slice(-4)}`;
}
