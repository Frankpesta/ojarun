/**
 * Africa/Lagos is UTC+1 all year (no DST), so slot times are plain offset arithmetic.
 * Dates are "YYYY-MM-DD" strings in Lagos time; minutes are minutes after Lagos midnight.
 */
export const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(date: string): [number, number, number] {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Expected YYYY-MM-DD, got ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** The Lagos calendar date for an instant. */
export function lagosDate(ms: number): string {
  return new Date(ms + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant of Lagos midnight at the start of `date`. */
export function lagosMidnight(date: string): number {
  const [y, mo, d] = parseDate(date);
  return Date.UTC(y, mo - 1, d) - LAGOS_OFFSET_MS;
}

/** The instant of `minute` minutes after Lagos midnight on `date`. */
export function lagosAt(date: string, minute: number): number {
  return lagosMidnight(date) + minute * 60_000;
}

export function addDays(date: string, days: number): string {
  return lagosDate(lagosMidnight(date) + days * DAY_MS);
}

/** 0 = Sunday … 6 = Saturday, for the Lagos date. */
export function lagosDayOfWeek(date: string): number {
  const [y, mo, d] = parseDate(date);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

/** Minutes after midnight → "13:00". */
export function formatMinutes(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "13:00" or "9:30" → minutes after midnight, or null if invalid. */
export function parseMinutes(input: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(input.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export type SlotTemplateTimes = {
  cutoffMin: number;
  windowStartMin: number;
  windowEndMin: number;
  daysOfWeek: readonly number[];
};

/** Problems with a template's times, in plain language. Empty means valid. */
export function slotTemplateProblems(t: SlotTemplateTimes): string[] {
  const problems: string[] = [];
  const inDay = (n: number) => Number.isInteger(n) && n >= 0 && n < 24 * 60;
  if (![t.cutoffMin, t.windowStartMin, t.windowEndMin].every(inDay)) problems.push("Times must be within the day.");
  if (t.cutoffMin >= t.windowStartMin) problems.push("The cutoff must be before the window starts.");
  if (t.windowStartMin >= t.windowEndMin) problems.push("The window must end after it starts.");
  if (t.daysOfWeek.length === 0) problems.push("Pick at least one day.");
  if (t.daysOfWeek.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) problems.push("Days must be 0–6.");
  return problems;
}

/** Concrete instants for a template on a Lagos date. */
export function slotInstants(t: Omit<SlotTemplateTimes, "daysOfWeek">, date: string) {
  return {
    cutoffAt: lagosAt(date, t.cutoffMin),
    windowStart: lagosAt(date, t.windowStartMin),
    windowEnd: lagosAt(date, t.windowEndMin),
  };
}

/** The Lagos dates customers can book, starting today (05: order any time, pick a later slot). */
export function bookableDates(now: number, daysAhead: number): string[] {
  const today = lagosDate(now);
  return Array.from({ length: daysAhead + 1 }, (_, i) => addDays(today, i));
}

/** "13:00" for an instant, in Lagos time. */
export function formatLagosTime(ms: number): string {
  return new Date(ms + LAGOS_OFFSET_MS).toISOString().slice(11, 16);
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Today", "Tomorrow" or "Mon 5 Oct" for a Lagos date. Without Intl, so Hermes and Node agree. */
export function formatLagosDay(date: string, now: number): string {
  const today = lagosDate(now);
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  const [, mo, d] = parseDate(date);
  return `${DAYS[lagosDayOfWeek(date)]} ${d} ${MONTHS[mo - 1]}`;
}

/** "10am", "1:30pm" in Lagos time: how people in Akure say times. */
export function formatLagosClock(ms: number): string {
  const [h, m] = formatLagosTime(ms).split(":").map(Number) as [number, number];
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

/** "1–3pm", or "11am–1pm" when the window crosses noon. */
export function formatLagosWindow(startMs: number, endMs: number): string {
  const a = formatLagosClock(startMs);
  const b = formatLagosClock(endMs);
  const sameHalf = a.slice(-2) === b.slice(-2);
  return `${sameHalf ? a.slice(0, -2) : a}–${b}`;
}
