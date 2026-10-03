import { v } from "convex/values";
import { action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireCallerInAction } from "./lib/actionAuth";
import { appError, ErrorCode } from "./lib/errors";
import { getSettings } from "./lib/settings";

/**
 * Google Places API (New), called from the server so the key never ships in the app (05 §1.8).
 * The client passes a session token (a UUID it makes per search) so Google bills one session
 * per address search, not per keystroke (doc 02 §6).
 */
const PLACES = "https://places.googleapis.com/v1";
const TOKEN_RE = /^[A-Za-z0-9-]{16,64}$/;

function apiKey(): string {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) throw appError(ErrorCode.UNAVAILABLE, "Address search isn't available right now.");
  return key;
}

/** The geofence's bounding box, used to restrict suggestions to Akure. */
export const searchBounds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const { geofence } = await getSettings(ctx);
    const lngs = geofence.map((p) => p[0]);
    const lats = geofence.map((p) => p[1]);
    return {
      low: { latitude: Math.min(...lats), longitude: Math.min(...lngs) },
      high: { latitude: Math.max(...lats), longitude: Math.max(...lngs) },
    };
  },
});

async function google(path: string, init: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${PLACES}${path}`, init);
  } catch {
    throw appError(ErrorCode.UNAVAILABLE, "Address search isn't reachable. Check your connection and try again.");
  }
  if (!res.ok) {
    console.error({ evt: "places.error", path: path.split("?")[0], status: res.status, body: (await res.text()).slice(0, 500) });
    throw appError(ErrorCode.UNAVAILABLE, "Address search isn't available right now.");
  }
  return res.json();
}

type AutocompleteResponse = {
  suggestions?: {
    placePrediction?: {
      placeId: string;
      text?: { text: string };
      structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } };
    };
  }[];
};

export const autocomplete = action({
  args: { input: v.string(), sessionToken: v.string() },
  handler: async (ctx, { input, sessionToken }) => {
    await requireCallerInAction(ctx, ["customer"]);
    const text = input.trim().slice(0, 120);
    if (text.length < 2) return [];
    if (!TOKEN_RE.test(sessionToken)) throw appError(ErrorCode.INVALID_INPUT, "Invalid search session.");

    const rectangle = await ctx.runQuery(internal.places.searchBounds, {});
    const data = (await google("/places:autocomplete", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey() },
      body: JSON.stringify({
        input: text,
        sessionToken,
        includedRegionCodes: ["ng"],
        locationRestriction: { rectangle },
        languageCode: "en",
      }),
    })) as AutocompleteResponse;

    return (data.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => ({
        placeId: p.placeId,
        primary: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
        secondary: p.structuredFormat?.secondaryText?.text ?? "",
      }));
  },
});

type DetailsResponse = {
  id: string;
  formattedAddress?: string;
  displayName?: { text: string };
  location?: { latitude: number; longitude: number };
};

/** Ends the billing session. Returns the pin position and a display address. */
export const placeDetails = action({
  args: { placeId: v.string(), sessionToken: v.string() },
  handler: async (ctx, { placeId, sessionToken }) => {
    await requireCallerInAction(ctx, ["customer"]);
    if (!/^[A-Za-z0-9_-]{10,300}$/.test(placeId)) throw appError(ErrorCode.INVALID_INPUT, "Invalid place.");
    if (!TOKEN_RE.test(sessionToken)) throw appError(ErrorCode.INVALID_INPUT, "Invalid search session.");

    const data = (await google(`/places/${placeId}?sessionToken=${encodeURIComponent(sessionToken)}`, {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": apiKey(),
        "X-Goog-FieldMask": "id,formattedAddress,displayName,location",
      },
    })) as DetailsResponse;

    if (!data.location) throw appError(ErrorCode.NOT_FOUND, "We couldn't find that place. Try another search.");
    const name = data.displayName?.text ?? "";
    const address = data.formattedAddress ?? "";
    return {
      placeId: data.id,
      formatted: name && !address.startsWith(name) ? `${name}, ${address}` : address || name,
      lat: data.location.latitude,
      lng: data.location.longitude,
    };
  },
});
