import { useCallback, useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@ojarun/convex/api";
import { friendlyError } from "@/lib/errors";

export type Suggestion = { placeId: string; primary: string; secondary: string; formatted: string; lat: number; lng: number };
export type PickedPlace = { placeId: string; formatted: string; lat: number; lng: number };

const DEBOUNCE_MS = 250;

/**
 * Address search through Convex (Photon, OpenStreetMap). Each suggestion carries its position,
 * so picking one needs no second request.
 */
export function useAddressSearch() {
  const autocomplete = useAction(api.places.autocomplete);
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
      autocomplete({ input: text })
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
    setQuery("");
    setResults([]);
    setLoading(false);
    setError(null);
  }, []);

  const pick = useCallback(
    async (s: Suggestion): Promise<PickedPlace> => ({ placeId: s.placeId, formatted: s.formatted, lat: s.lat, lng: s.lng }),
    [],
  );

  return { query, setQuery, results, loading, error, pick, reset };
}
