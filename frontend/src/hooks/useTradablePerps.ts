// Perp markets the user can trade. The backend decides WHICH markets are listed
// (name, logo, asset id, max leverage); Hyperliquid supplies live price, 24h change
// and volume on top, falling back to the backend's price until the feed is in.
import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPerpMarkets, PerpMarketsResponse, type PerpMarketApi } from "@/services/perps";
import { toCoin } from "@/services/hyperliquid/format";
import { useMarkets, type PerpMarket as HlMarket } from "./perps/useMarkets";

export type TradablePerp = {
  symbol: string; // "NVDA"
  name: string; // "Nvidia"
  assetId: string;
  imageUrl: string;
  szDecimals: number;
  maxLev: number;
  mark: number;
  change: number; // 24h %
  vol24Usd: number; // 0 until the Hyperliquid feed loads
};

const toPerp = (a: PerpMarketApi, hl?: HlMarket): TradablePerp => ({
  symbol: a.marketSymbol,
  name: a.marketName,
  assetId: a.assetId,
  imageUrl: a.imageUrl,
  szDecimals: a.szDecimals,
  maxLev: a.maxLeverage,
  mark: hl?.mid ?? parseFloat(a.price),
  change: hl?.change24 ?? parseFloat(a.changeInPrice),
  vol24Usd: hl?.vol24Usd ?? 0,
});

import { useInfiniteQuery } from "@tanstack/react-query";

const PAGE_SIZE = 20;

const selectMarkets = (d: { pages: PerpMarketsResponse[] }) => ({
  items: d.pages.flatMap((p) => p.data),
  total: d.pages[0]?.pagination.total ?? 0,
});

const usePerpMarketsQuery = () =>
  useInfiniteQuery({
    queryKey: ["perpMarkets", PAGE_SIZE],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const res = await getPerpMarkets({ limit: PAGE_SIZE, offset: pageParam });
      if (!res.success) throw new Error(res.message || "Failed to load markets");
      return res;
    },
    getNextPageParam: (last) =>
      last.pagination.hasMore
        ? last.pagination.offset + last.pagination.limit
        : undefined,
    select: selectMarkets,
    staleTime: 60_000,
  });

/**
 * One market's listing (name, logo, max leverage) without the live price feed, so it
 * doesn't re-render on every tick. `mark` / `change` are the backend's, not live.
 */
const MAX_LIMIT = 30; // backend accepts 1..30

const useAllPerpMarketsQuery = () =>
  useQuery({
    queryKey: ["perpMarkets", "all"],
    queryFn: async () => {
      const all: PerpMarketApi[] = [];
      let offset = 0;
      for (;;) {
        const res = await getPerpMarkets({ limit: MAX_LIMIT, offset });
        if (!res.success) throw new Error(res.message || "Failed to load markets");
        all.push(...res.data);
        // step by what the server actually returned
        if (!res.pagination.hasMore || res.data.length === 0) break;
        offset += res.data.length;
      }
      return all;
    },
    staleTime: 5 * 60_000,
  });

export function usePerpListing(sym: string): TradablePerp | undefined {
  const q = useAllPerpMarketsQuery();
  
  return useMemo(() => {
    const a = q.data?.find((m) => m.marketSymbol === sym);
    return a ? toPerp(a) : undefined;
  }, [q.data, sym]);
}

/** Every market with live prices. Re-renders on price ticks: use it where prices show. */
export function useTradablePerps() {
  const query = usePerpMarketsQuery();
  const live = useMarkets();

  // Reuse last render's object for a market whose price didn't move, so memoized
  // rows can skip re-rendering.
  const prev = useRef(new Map<string, { a: PerpMarketApi; hl?: HlMarket; perp: TradablePerp }>());
  const markets = useMemo(() => {
    const next = new Map<string, { a: PerpMarketApi; hl?: HlMarket; perp: TradablePerp }>();
    const list = (query.data?.items ?? []).map((a) => {
      const hl = live.byCoin[toCoin(a.marketSymbol)];
      const old = prev.current.get(a.marketSymbol);
      const perp = old && old.a === a && old.hl === hl ? old.perp : toPerp(a, hl);
      next.set(a.marketSymbol, { a, hl, perp });
      return perp;
    });
    prev.current = next;
    return list;
  }, [query.data, live.byCoin]);

  return {
    markets,
  total: query.data?.total ?? 0,
  loading: query.isPending,
  error: query.error instanceof Error ? query.error.message : null,
  refetch: query.refetch,
  hasMore: !!query.hasNextPage,
  loadingMore: query.isFetchingNextPage,
  loadMoreError: query.isFetchNextPageError,
  loadMore: query.fetchNextPage,
  };
}

/** best match first: exact ticker, ticker/name prefix, then name contains */
export function searchPerps(list: TradablePerp[], q: string): TradablePerp[] {
  const t = q.trim().toLowerCase();
  if (!t) return list;
  const rank = (m: TradablePerp) => {
    const sym = m.symbol.toLowerCase(),
      nm = m.name.toLowerCase();
    if (sym === t) return 0;
    if (sym.startsWith(t) || nm.startsWith(t)) return 1;
    if (nm.includes(t)) return 2;
    return 99;
  };
  return list
    .map((m) => [m, rank(m)] as const)
    .filter(([, r]) => r < 99)
    .sort((a, b) => a[1] - b[1])
    .map(([m]) => m);
}
