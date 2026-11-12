import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { searchPerpMarkets, type PerpSearchItem } from "@/services/perps";
import type { TradablePerp } from "@/hooks/useTradablePerps";

const PAGE_SIZE = 20;

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// Same fields the Perp screens read from a TradablePerp. If useTradablePerps
// already has a mapper from PerpMarketApi, import and use that one instead so
// both lists stay identical.
// The search response has no maxLeverage, so maxLev is undefined for these
// rows (the screen hides the "up to Nx" text when it's missing).
function toPerp(m: PerpSearchItem): TradablePerp {
  return {
    ...m,
    symbol: m.marketSymbol,
    name: m.marketName,
    mark: Number(m.price) || 0,
    change: Number(m.changeInPrice) || 0,
    maxLev: m.maxLeverage,
  } as unknown as TradablePerp;
}

/**
 * Searches perp markets, a page at a time. Idle (no request) while the box is
 * empty, so the screen keeps using useTradablePerps for browsing.
 */
export function usePerpSearch(rawQuery: string) {
  const trimmed = rawQuery.trim();
  const q = useDebounced(trimmed, 300);

  const query = useInfiniteQuery({
    queryKey: ["perp-search", q],
    queryFn: ({ pageParam }) =>
      searchPerpMarkets({ q, page: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last, all) => {
      if (!last.hasMore) return undefined;
      // stop if the server sent nothing new (e.g. it ignores `page`)
      const before = new Set(
        all.slice(0, -1).flatMap((p) => p.items.map((m) => m.marketSymbol)),
      );
      if (
        last.items.length > 0 &&
        last.items.every((m) => before.has(m.marketSymbol))
      )
        return undefined;
      return last.page + 1;
    },
    enabled: q.length > 0,
    refetchOnWindowFocus: false,
  });

  const markets = useMemo(() => {
    const seen = new Set<string>();
    const out: TradablePerp[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const m of page.items) {
        if (!seen.has(m.marketSymbol)) {
          seen.add(m.marketSymbol);
          out.push(toPerp(m));
        }
      }
    }
    return out;
  }, [query.data]);

  const lastTotal = query.data?.pages[query.data.pages.length - 1]?.total;

  return {
    /** the box has text, so the search list replaces the browse list */
    searching: trimmed.length > 0,
    markets,
    total: lastTotal ?? markets.length,
    /** nothing to show yet: first load, or the typing pause still running */
    loading: trimmed.length > 0 && (query.isPending || trimmed !== q),
    error: query.isError,
    refetch: () => query.refetch(),
    hasMore: !!query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadMoreError: query.isFetchNextPageError,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
    },
  };
}