import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { searchStocks, type StockCategory } from "@/services";
import { useAuth } from "@/context";
import type { Stock } from "@/types";

const PAGE_SIZE = 10;

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Lists a collection page by page (scroll to load more) and searches it.
 * With an empty query it's the plain list; with text it's the search results.
 */
export function useStockSearch(category: StockCategory, rawQuery: string) {
  const { idToken } = useAuth();
  const q = useDebounced(rawQuery.trim(), 300);

  const query = useInfiniteQuery({
    queryKey: ["stock-search", category, q],
    queryFn: ({ pageParam }) =>
      searchStocks(
        { q, category, page: pageParam, limit: PAGE_SIZE },
        idToken as string,
      ),
    initialPageParam: 1,
    getNextPageParam: (last, all) => {
      if (!last.hasMore) return undefined;
      // stop if the server sent nothing new (e.g. it ignores `page`)
      const before = new Set(
        all.slice(0, -1).flatMap((p) => p.items.map((s) => s.tokenAddress)),
      );
      if (
        last.items.length > 0 &&
        last.items.every((s) => before.has(s.tokenAddress))
      )
        return undefined;
      return last.page + 1;
    },
    enabled: !!idToken,
    refetchOnWindowFocus: false,
  });

  const stocks = useMemo(() => {
    const seen = new Set<string>();
    const out: Stock[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const s of page.items) {
        if (!seen.has(s.tokenAddress)) {
          seen.add(s.tokenAddress);
          out.push(s);
        }
      }
    }
    return out;
  }, [query.data]);

  return {
    stocks,
    /** true while the box has text (after the debounce) */
    searching: q.length > 0,
    /** nothing to show yet: first load, a new search loading, or the debounce
     * still waiting — the screen shows skeleton cards for all of these */
    loading: query.isPending || rawQuery.trim() !== q,
    refreshing: query.isRefetching && !query.isFetchingNextPage,
    loadingMore: query.isFetchingNextPage,
    hasMore: !!query.hasNextPage,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetching)
        query.fetchNextPage();
    },
    error: query.error instanceof Error ? query.error.message : null,
    refresh: async () => {
      await query.refetch();
    },
    reload: async () => {
      await query.refetch();
    },
  };
}