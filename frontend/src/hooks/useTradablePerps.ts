// Perp markets the user can trade. The backend decides WHICH markets are listed
// (name, logo, asset id, max leverage); Hyperliquid supplies live price, 24h change
// and volume on top, falling back to the backend's price until the feed is in.
import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPerpMarkets, type PerpMarketApi } from "@/services/perps";
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

const usePerpMarketsQuery = () =>
  useQuery({
    queryKey: ["perpMarkets"],
    queryFn: async () => {
      const res = await getPerpMarkets();
      if (!res.success) throw new Error(res.message || "Failed to load markets");
      return res.data;
    },
    staleTime: 60_000,
  });

/**
 * One market's listing (name, logo, max leverage) without the live price feed, so it
 * doesn't re-render on every tick. `mark` / `change` are the backend's, not live.
 */
export function usePerpListing(sym: string): TradablePerp | undefined {
  const { data } = usePerpMarketsQuery();
  return useMemo(() => {
    const a = data?.find((m) => m.marketSymbol === sym);
    return a ? toPerp(a) : undefined;
  }, [data, sym]);
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
    const list = (query.data ?? []).map((a) => {
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
    loading: query.isPending,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
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
