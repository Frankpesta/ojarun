export type LngLat = readonly [lng: number, lat: number];

/** Ray-casting point-in-polygon. `ring` is a [lng, lat] ring; closing the ring is optional. */
export function isInsidePolygon(point: { lat: number; lng: number }, ring: readonly LngLat[]): boolean {
  if (ring.length < 3) return false;
  const x = point.lng;
  const y = point.lat;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Great-circle distance in metres. Used only for rough sorting, never for fees. */
export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Development-only stand-in for a road distance when the Routes API key isn't configured: the
 * straight line times a typical Akure detour factor. Production always uses the Routes API.
 */
export function estimatedRoadMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return Math.round(haversineMeters(a, b) * 1.35);
}

/** Compass bearing from a to b in degrees [0, 360). Used to cluster deliveries by direction. */
export function bearingDegrees(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
