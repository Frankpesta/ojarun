/** Akure is UTC+1 all year (no DST). Use this, not the device zone, for anything market-related. */
const WAT_OFFSET_MS = 60 * 60 * 1000;

export function watHour(now = Date.now()): number {
  return new Date(now + WAT_OFFSET_MS).getUTCHours();
}

export function greeting(now = Date.now()): string {
  const h = watHour(now);
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
