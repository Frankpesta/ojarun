import { useQuery } from "convex/react";
import { api } from "@ojarun/convex/api";
import { useListDraft } from "./useListDraft";
import { useMarketQuotes } from "./useMarketQuotes";

/**
 * Where the list is going and where it's bought: the chosen address (else the newest saved one)
 * and the chosen market (else the cheapest to deliver from), with every market's fee.
 */
export function useOrderSetup() {
  const addresses = useQuery(api.addresses.list);
  const draftAddressId = useListDraft((s) => s.addressId);
  const draftMarketId = useListDraft((s) => s.marketId);

  const address = addresses?.find((a) => a._id === draftAddressId) ?? addresses?.[0];
  const { quotes, error, retry } = useMarketQuotes(address?._id);
  const market = quotes?.find((q) => q.marketId === draftMarketId) ?? quotes?.[0];

  return {
    addresses,
    address,
    /** undefined while loading; null when the customer has no address yet. */
    hasAddress: addresses === undefined ? undefined : addresses.length > 0,
    quotes,
    quotesError: error,
    retryQuotes: retry,
    market,
  };
}
