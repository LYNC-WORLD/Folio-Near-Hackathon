import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { InteractionManager } from "react-native";
import { fetchCandles } from "@/services";

export const CHART_PERIODS = ["1D", "1W", "1M", "1Y", "All"] as const;
export type ChartPeriod = (typeof CHART_PERIODS)[number];

export type Candle = {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

// Candle interval + count per tab. Tweak counts if a range looks too sparse/dense.
const PERIOD_CONFIG: Record<
  ChartPeriod,
  { interval: string; candles: number }
> = {
  "1D": { interval: "15_MINUTE", candles: 96 }, // 24h
  "1W": { interval: "1_HOUR", candles: 168 }, // 7d
  "1M": { interval: "4_HOUR", candles: 180 }, // 30d
  "1Y": { interval: "1_DAY", candles: 365 },
  All: { interval: "1_WEEK", candles: 520 }, // API just returns fewer if the token is younger
};

export function useStockChart(mint: string | undefined, period: ChartPeriod) {
  // wait for the screen transition to finish before fetching
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setReady(true));
    return () => task.cancel();
  }, []);

  const query = useQuery({
    queryKey: ["stockChart", mint, period],
    queryFn: ({ signal }) => fetchCandles(mint!, period, signal),
    enabled: ready && !!mint,
    staleTime: 5 * 60_000, // flipping back to a period is instant
    // keep the previous period on screen while the next loads, but never another stock's
    placeholderData: (prev, prevQuery) =>
      prevQuery?.queryKey[1] === mint ? prev : undefined,
  });

  return {
    candles: query.data ?? null,
    loading: !ready || query.isPending || query.isPlaceholderData,
    error: query.error instanceof Error ? query.error.message : null,
    reload: () => {
      query.refetch();
    },
  };
}
