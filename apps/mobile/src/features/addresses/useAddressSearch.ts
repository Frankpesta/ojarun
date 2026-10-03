import { useCallback, useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import * as Crypto from "expo-crypto";
import { api } from "@ojarun/convex/api";
import { friendlyError } from "@/lib/errors";

export type Suggestion = { placeId: string; primary: string; secondary: string };
export type PickedPlace = { placeId: string; formatted: string; lat: number; lng: number };

const DEBOUNCE_MS = 250;

/**
 * Places autocomplete through Convex. One session token per search, ended by `pick`, so Google
 * bills a search as one session rather than per keystroke (doc 02 §6).
 */
export function useAddressSearch() {
  const autocomplete = useAction(api.places.autocomplete);
  const details = useAction(api.places.placeDetails);
  const token = useRef(Crypto.randomUUID());
  const requestId = useRef(0);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    const timer = setTimeout(() => {
      autocomplete({ input: text, sessionToken: token.current })
        .then((r) => {
          if (id !== requestId.current) return;
          setResults(r);
          setError(null);
        })
        .catch((e) => {
          if (id !== requestId.current) return;
          setError(friendlyError(e, "We couldn't search right now. Check your connection and try again."));
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, autocomplete]);

  const reset = useCallback(() => {
    requestId.current++;
    token.current = Crypto.randomUUID();
    setQuery("");
    setResults([]);
    setLoading(false);
    setError(null);
  }, []);

  const pick = useCallback(
    async (s: Suggestion): Promise<PickedPlace> => {
      const place = await details({ placeId: s.placeId, sessionToken: token.current });
      // The session is spent once details are fetched; the next search starts a new one.
      token.current = Crypto.randomUUID();
      return place;
    },
    [details],
  );

  return { query, setQuery, results, loading, error, pick, reset };
}
