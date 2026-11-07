// One-shot candle history (no live updates): sparklines and the pre-trade check.
// For the live chart use useCandles, which also streams the current bar.

import { useQuery } from "@tanstack/react-query";
import { INTERVAL_MS, candleToBar, toCoin } from "@/services/hyperliquid/format";
import { hlInfo } from "@/services/hyperliquid/info";

/** last `count` bars of `interval` ("1h", "1d", …) for one market, oldest first */
export function useRecentBars(sym: string, interval: string, count: number) {
  const coin = toCoin(sym);
  const query = useQuery({
    queryKey: ["hlBars", coin, interval, count],
    queryFn: async () => {
      const end = Date.now();
      const cs = await hlInfo.candles(coin, interval, end - count * INTERVAL_MS[interval], end);
      return cs.map(candleToBar);
    },
    staleTime: Math.min(INTERVAL_MS[interval], 15 * 60_000),
  });
  return query.data ?? [];
}
