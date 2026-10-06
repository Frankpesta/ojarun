/**
 * Dispatch helpers (05 §9 M3). Orders for one market and slot are grouped by the compass bearing
 * from the market to the delivery address, a cheap stand-in for "same part of town".
 */

/**
 * Splits orders into the fewest batches of at most `maxPerBatch`, keeping neighbouring bearings
 * together. The circle is cut at its widest empty gap, so orders either side of north (350° and
 * 10°) stay in the same batch. Batch sizes differ by at most one.
 */
export function clusterByBearing<T extends { bearing: number }>(orders: readonly T[], maxPerBatch: number): T[][] {
  if (!Number.isInteger(maxPerBatch) || maxPerBatch < 1) throw new Error("maxPerBatch must be a positive integer");
  if (orders.length === 0) return [];

  const sorted = [...orders].sort((a, b) => a.bearing - b.bearing);
  let cut = 0;
  let widest = -1;
  for (let i = 0; i < sorted.length; i++) {
    const prev = sorted[(i - 1 + sorted.length) % sorted.length]!.bearing;
    const gap = (sorted[i]!.bearing - prev + 360) % 360 || (sorted.length === 1 ? 360 : 0);
    if (gap > widest) {
      widest = gap;
      cut = i;
    }
  }
  const ring = [...sorted.slice(cut), ...sorted.slice(0, cut)];

  const count = Math.ceil(ring.length / maxPerBatch);
  const base = Math.floor(ring.length / count);
  const larger = ring.length % count;
  const batches: T[][] = [];
  let at = 0;
  for (let b = 0; b < count; b++) {
    const size = base + (b < larger ? 1 : 0);
    batches.push(ring.slice(at, at + size));
    at += size;
  }
  return batches;
}

/**
 * Proposes a shopper for each batch: whoever has the fewest batches so far, ties broken by the
 * order shoppers are given in. Returns undefined for every batch when nobody is on shift.
 */
export function assignByLoad<S>(batchCount: number, shoppers: readonly { id: S; load: number }[]): (S | undefined)[] {
  const loads = shoppers.map((s) => ({ ...s }));
  const out: (S | undefined)[] = [];
  for (let i = 0; i < batchCount; i++) {
    let pick: (typeof loads)[number] | undefined;
    for (const s of loads) if (!pick || s.load < pick.load) pick = s;
    if (pick) pick.load++;
    out.push(pick?.id);
  }
  return out;
}

/** Smallest angle between two bearings, in degrees [0, 180]. */
export function bearingGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Circular mean of bearings in degrees, for placing a late order next to the closest batch. */
export function meanBearing(bearings: readonly number[]): number {
  if (bearings.length === 0) return 0;
  let x = 0;
  let y = 0;
  for (const b of bearings) {
    x += Math.cos((b * Math.PI) / 180);
    y += Math.sin((b * Math.PI) / 180);
  }
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** "NE" etc., for the dispatch board. */
export function compassPoint(bearing: number): (typeof COMPASS)[number] {
  return COMPASS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8]!;
}

/**
 * Lower-cased name parts for fraud matching (05 §6.2): "Adé-Bólá  OKON" → ["ade", "bola", "okon"].
 * Accents are dropped and one-letter initials ignored.
 */
export function nameTokens(name: string): string[] {
  return [
    ...new Set(
      name
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter((t) => t.length >= 2),
    ),
  ];
}
