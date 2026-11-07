// Total value (wallet + perp equity), its chart series for the picked range, and the
// hero number / delta, which follow the scrubbed point while the chart is touched.
import { useEffect, useMemo, useState } from "react";
import type { ChartPeriod } from "@/hooks";
import type { useWallet } from "@/context/WalletContext";
import { usePortfolioSeries } from "@/hooks/usePortfolioSeries";
import { useCountUp } from "@/hooks/useCountUp";

// prototype ranges → chart periods
export const RANGES: { key: string; period: ChartPeriod; label: string }[] = [
  { key: "24h", period: "1D", label: "24h" },
  { key: "7d", period: "1W", label: "7d" },
  { key: "30d", period: "1M", label: "30d" },
  { key: "All", period: "All", label: "all time" },
];
export type Range = (typeof RANGES)[number];

export function usePortfolioValue({
  tokens,
  usdcValue,
  usdValue,
  perpTotal,
}: {
  tokens: ReturnType<typeof useWallet>["tokens"];
  usdcValue: number;
  /** wallet value (cash + tokens) */
  usdValue: number;
  perpTotal: number;
}) {
  const [range, setRange] = useState<Range>(RANGES[3]);
  const holdings = useMemo(
    () =>
      tokens
        .map((t) => ({
          mint: t.mint,
          balance: Number(t.balance),
          price: Number(t.price),
        }))
        .filter(
          (t) =>
            Number.isFinite(t.balance) &&
            Number.isFinite(t.price) &&
            t.price >= 0,
        ),
    [tokens],
  );

  // Total value = wallet + perp equity. One source (perpTotal) feeds the hero
  // number, the chart and the delta so they can never disagree.
  const liveTarget = usdValue + perpTotal; // un-animated, used for delta math
  const liveTotal = useCountUp(liveTarget);

  const { points: rawPoints } = usePortfolioSeries(
    holdings,
    usdcValue,
    range.period,
  );

  // Chart = wallet series + flat perp offset, last point pinned to the live total
  const points = useMemo(() => {
    if (!rawPoints.length) return rawPoints;
    const pts = rawPoints.map((p) => ({ ...p, v: p.v + perpTotal }));
    pts[pts.length - 1] = { ...pts[pts.length - 1], v: liveTarget };
    return pts;
  }, [rawPoints, perpTotal, liveTarget]);

  const [scrubIdx, setScrubIdx] = useState<number | null>(null);
  // the points array changes length with the range, so drop any stale scrub
  useEffect(() => {
    setScrubIdx(null);
  }, [range.key]);

  const safeIdx =
    scrubIdx != null && scrubIdx >= 0 && scrubIdx < points.length
      ? scrubIdx
      : null;
  const isLatest = safeIdx == null || safeIdx === points.length - 1;

  // hero: animated live total at rest, exact point value while scrubbing
  const shownValue = isLatest ? liveTotal : points[safeIdx!].v;
  const startV = points[0]?.v ?? liveTarget;
  const endV = isLatest ? liveTarget : points[safeIdx!].v;
  const delta = endV - startV;
  const deltaLabel = isLatest
    ? range.label
    : range.period === "1D"
      ? new Date(points[safeIdx!].t * 1000).toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : new Date(points[safeIdx!].t * 1000).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
        });

  return {
    holdings,
    range,
    setRange,
    points,
    setScrubIdx,
    shownValue,
    delta,
    deltaLabel,
  };
}
