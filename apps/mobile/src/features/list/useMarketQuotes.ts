import { useCallback, useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@ojarun/convex/api";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "@ojarun/convex/dataModel";
import { friendlyError } from "@/lib/errors";

export type MarketQuote = FunctionReturnType<typeof api.pricing.quoteMarkets>[number];

// One quote per address per app session; the server caches distances for good anyway.
const memo = new Map<string, MarketQuote[]>();

/** Delivery fee per market for an address, cheapest first. */
export function useMarketQuotes(addressId: Id<"addresses"> | undefined) {
  const quote = useAction(api.pricing.quoteMarkets);
  const [quotes, setQuotes] = useState<MarketQuote[] | undefined>(addressId ? memo.get(addressId) : undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!addressId) return;
    setError(null);
    quote({ addressId })
      .then((q) => {
        memo.set(addressId, q);
        setQuotes(q);
      })
      .catch((e) => setError(friendlyError(e, "We couldn't load delivery fees. Check your connection and try again.")));
  }, [addressId, quote]);

  useEffect(() => {
    setQuotes(addressId ? memo.get(addressId) : undefined);
    if (addressId && !memo.has(addressId)) load();
  }, [addressId, load]);

  return { quotes, error, retry: load };
}
