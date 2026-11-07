// Perps rules and pure helpers: trading limits, funding clock, US market hours,
// and the pre-trade liquidation check (from real daily candles).
import type { Bar } from "./perpsChart";

export const MAXLEV = 50;
export const MIN_MARGIN = 3;
export const TAKER = 0.0006; // 0.06 %

/** time to the next hourly funding payment, "mm:ss" */
export function fundLeft() {
  const s = 3600 - (Math.floor(Date.now() / 1000) % 3600);
  return (
    String(Math.floor(s / 60)).padStart(2, "0") +
    ":" +
    String(s % 60).padStart(2, "0")
  );
}

/** is the underlying US stock market open (9:30–16:00 ET, Mon–Fri)? The perp itself trades 24/7. */
export function usMarketOpen(now = new Date()) {
  const ny = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" }),
  );
  const d = ny.getDay(),
    mins = ny.getHours() * 60 + ny.getMinutes();
  return d >= 1 && d <= 5 && mins >= 570 && mins < 960;
}

export type CheckTone = "ok" | "warn" | "bad";

/**
 * How often a one-day move reached the liquidation distance against this trade.
 * `days` are daily candles (newest last); for a long we count days that fell `dist`%
 * below the open, for a short days that rose `dist`% above it.
 */
export function preCheck(
  name: string,
  side: 1 | -1,
  dist: number,
  days: Bar[],
): [CheckTone, string] {
  const d = dist.toFixed(1);
  if (days.length < 20) {
    // not enough history yet: fall back to plain distance bands
    if (dist < 5)
      return ["bad", "Liquidation is very close. A small move closes this trade."];
    if (dist < 12)
      return ["warn", "A normal day's move could reach your liquidation price."];
    return ["ok", "Liquidation is a fair distance away."];
  }
  const n = days.length;
  const hits = days.filter((b) =>
    side > 0 ? (b.o - b.l) / b.o >= dist / 100 : (b.h - b.o) / b.o >= dist / 100,
  ).length;
  if (hits === 0)
    return [
      "ok",
      `Comfortable. ${name} has not moved ${d}% against a trade like this in a day in the last ${n} days.`,
    ];
  if (hits / n < 0.1)
    return [
      "warn",
      `Watch it. ${name} moved ${d}% against a trade like this on ${hits} of the last ${n} days.`,
    ];
  return [
    "bad",
    `Tight. ${name} moved ${d}% against a trade like this on ${hits} of the last ${n} days. Lower leverage gives it room.`,
  ];
}
