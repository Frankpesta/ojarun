import { v } from "convex/values";
import { action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireCallerInAction } from "./lib/actionAuth";
import { appError, ErrorCode } from "./lib/errors";
import { getSettings } from "./lib/settings";

/**
 * Address search with Photon (komoot), a free OpenStreetMap geocoder that needs no key. Called
 * from the server so we can bias results to Akure, rate-limit per user, and swap providers
 * without an app update. Photon returns coordinates with each suggestion, so there's no second
 * "details" call. Set PHOTON_URL to use a self-hosted instance.
 */
const PHOTON = () => process.env.PHOTON_URL ?? "https://photon.komoot.io";
const USER_AGENT = "OjaRun/1.0 (Akure grocery delivery; ops@ojarun.ng)";

/** The geofence's bounding box and centre, used to keep suggestions in Akure. */
export const searchBounds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const { geofence } = await getSettings(ctx);
    const lngs = geofence.map((p) => p[0]);
    const lats = geofence.map((p) => p[1]);
    const box = { minLng: Math.min(...lngs), minLat: Math.min(...lats), maxLng: Math.max(...lngs), maxLat: Math.max(...lats) };
    return { ...box, lat: (box.minLat + box.maxLat) / 2, lng: (box.minLng + box.maxLng) / 2 };
  },
});

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_type?: string;
    osm_id?: number;
    name?: string;
    housenumber?: string;
    street?: string;
    district?: string;
    locality?: string;
    city?: string;
    county?: string;
    state?: string;
  };
};

async function photon(path: string): Promise<PhotonFeature[]> {
  let res: Response;
  try {
    res = await fetch(`${PHOTON()}${path}`, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  } catch {
    throw appError(ErrorCode.UNAVAILABLE, "Address search isn't reachable. Check your connection and try again.");
  }
  if (!res.ok) {
    console.error({ evt: "places.error", path: path.split("?")[0], status: res.status });
    throw appError(ErrorCode.UNAVAILABLE, "Address search isn't available right now. Drop the pin on the map instead.");
  }
  return ((await res.json()) as { features?: PhotonFeature[] }).features ?? [];
}

/** "Oke-Ijebu Road, Akure" style lines from OpenStreetMap's address parts. */
export function describe(f: PhotonFeature) {
  const p = f.properties ?? {};
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");
  const primary = p.name ?? (street || p.district || p.locality || p.city || "Unnamed place");
  const secondary = [...new Set([p.name ? street : "", p.district, p.locality, p.city ?? p.county].filter((s): s is string => !!s && s !== primary))].join(", ");
  return { primary, secondary, formatted: secondary ? `${primary}, ${secondary}` : primary };
}

export const autocomplete = action({
  args: { input: v.string() },
  handler: async (ctx, { input }) => {
    const caller = await requireCallerInAction(ctx, ["customer"]);
    await ctx.runMutation(internal.rateLimits.check, { userId: caller._id, name: "placesSearch" });
    const text = input.trim().slice(0, 120);
    if (text.length < 2) return [];

    const b = await ctx.runQuery(internal.places.searchBounds, {});
    const params = new URLSearchParams({
      q: text,
      lat: String(b.lat),
      lon: String(b.lng),
      bbox: [b.minLng, b.minLat, b.maxLng, b.maxLat].join(","),
      limit: "8",
      lang: "en",
    });
    const features = await photon(`/api/?${params}`);
    const seen = new Set<string>();
    const out = [];
    for (const f of features) {
      const c = f.geometry?.coordinates;
      if (!c) continue;
      const d = describe(f);
      if (seen.has(d.formatted)) continue;
      seen.add(d.formatted);
      out.push({ placeId: `osm:${f.properties?.osm_type ?? "x"}${f.properties?.osm_id ?? out.length}`, ...d, lat: c[1], lng: c[0] });
    }
    return out;
  },
});

/** The nearest named place to a dropped pin, to prefill the address line. Best effort. */
export const reverse = action({
  args: { lat: v.number(), lng: v.number() },
  handler: async (ctx, { lat, lng }): Promise<{ formatted: string } | null> => {
    const caller = await requireCallerInAction(ctx, ["customer"]);
    await ctx.runMutation(internal.rateLimits.check, { userId: caller._id, name: "placesSearch" });
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const features = await photon(`/reverse?lat=${lat}&lon=${lng}&limit=1&lang=en`).catch(() => []);
    return features[0] ? { formatted: describe(features[0]).formatted } : null;
  },
});
