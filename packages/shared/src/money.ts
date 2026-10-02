/** All money in OjaRun is integer kobo. ₦1 = 100 kobo. */
export type Kobo = number;

export const KOBO_PER_NAIRA = 100;

export function isKobo(value: unknown): value is Kobo {
  return typeof value === "number" && Number.isSafeInteger(value);
}

export function assertKobo(value: number, label = "amount"): Kobo {
  if (!isKobo(value)) throw new Error(`${label} must be an integer number of kobo, got ${value}`);
  return value;
}

export function naira(n: number): Kobo {
  return Math.round(n * KOBO_PER_NAIRA);
}

/** Round up to the next multiple of `step` kobo (₦50 = 5_000). */
export function roundUpTo(kobo: Kobo, step: Kobo): Kobo {
  if (step <= 0) return kobo;
  return Math.ceil(kobo / step) * step;
}

function group(n: number): string {
  return Math.trunc(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * ₦3,000 — kobo shown only when non-zero (₦3,000.50). Negative amounts render as −₦3,000.
 * Implemented without Intl so Hermes and Node format identically.
 */
export function formatNaira(kobo: Kobo): string {
  const sign = kobo < 0 ? "−" : "";
  const abs = Math.abs(kobo);
  const whole = Math.floor(abs / KOBO_PER_NAIRA);
  const frac = abs % KOBO_PER_NAIRA;
  const body = frac === 0 ? group(whole) : `${group(whole)}.${frac.toString().padStart(2, "0")}`;
  return `${sign}₦${body}`;
}

/** Digits-only naira with thousands separators, for live input display ("3,000"). */
export function formatNairaDigits(kobo: Kobo): string {
  return group(Math.floor(Math.abs(kobo) / KOBO_PER_NAIRA));
}

/** Parse user-typed naira ("3,000", "₦3000", "3000.5") into kobo. Returns null if invalid. */
export function parseNairaInput(input: string): Kobo | null {
  const cleaned = input.replace(/[₦,\s]/g, "");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole = "0", frac = ""] = cleaned.split(".");
  const value = Number(whole) * KOBO_PER_NAIRA + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(value) ? value : null;
}

export function sumKobo(values: readonly Kobo[]): Kobo {
  return values.reduce((a, b) => a + b, 0);
}
