// Perps rules and pure helpers: trading limits, funding clock, US market hours,
// and the pre-trade liquidation check (from real daily candles).
import type { Bar } from "./perpsChart";
import { money } from "./format";

/** Most leverage Folio lets anyone pick (a market may allow less). */
export const MAX_LEV = 10;
/** Leverage the ticket starts on (capped to the market's max). */
export const DEFAULT_LEV = 10;
/** From here up the order button must be held to confirm. Above MAX_LEV today, so it
 *  only kicks in if the cap is ever raised — kept so that can't drop the safety check. */
export const HOLD_FROM_LEV = 25;
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

export type TpSlMode = "price" | "pct";

/**
 * Everything the order ticket shows for a draft order: entry, size, fee, liquidation,
 * TP/SL prices, how much is missing from the perp account, and the first blocking problem.
 */
export function orderQuote(o: {
  side: 1 | -1;
  market: boolean;
  /** live mark price (0 while loading) */
  mark: number;
  limitPx: number;
  margin: number;
  lev: number;
  /** the market's max leverage, sets the maintenance margin */
  maxLev: number;
  tpOn: boolean;
  tpIn: number;
  slIn: number;
  tpMode: TpSlMode;
  slMode: TpSlMode;
  /** free money in the perp account */
  perp: number;
  /** money in the spot wallet that could be moved in */
  spot: number;
  /** cross margin: the whole free perp balance backs the trade, not just `margin` */
  cross?: boolean;
}) {
  const { side, mark, margin: mg, lev } = o;
  const en = o.market ? mark * (1 + side * 0.0003) : o.limitPx || mark;
  const notional = mg * lev,
    qty = en ? notional / en : 0,
    fee = notional * TAKER;
  const MMR = 1 / (2 * o.maxLev); // Hyperliquid: half the initial margin at max leverage
  // What a liquidation would take. Isolated: this trade's margin. Cross: the whole free
  // perp balance, estimated as if this were the only cross position (others share it).
  const atRisk = o.cross ? Math.max(mg, o.perp - fee) : mg;
  const liq = qty
    ? Math.max(
        0, // a long with enough backing can't be liquidated above $0
        side > 0
          ? en - (atRisk - MMR * qty * en) / qty
          : en + (atRisk - MMR * qty * en) / qty,
      )
    : en;
  const dist = en ? (Math.abs(liq - en) / en) * 100 : 0;
  const tp = o.tpIn
    ? o.tpMode === "price"
      ? o.tpIn
      : en * (1 + (side * o.tpIn) / 100 / lev)
    : null;
  const sl = o.slIn
    ? o.slMode === "price"
      ? o.slIn
      : en * (1 - (side * o.slIn) / 100 / lev)
    : null;

  // funding: margin + fee must fit in the PERP account; if not, can spot cover it?
  const need = mg + fee - o.perp;
  const canMove = o.spot >= need;
  // round up to the cent, ignoring float dust (10 + 0.06 - 5 = 5.0600000000000005)
  const needUp = Math.ceil(need * 100 - 1e-9) / 100;

  // later checks win, so the most specific problem is the one shown
  let bad = "";
  if (!mark) bad = "Waiting for the live price…";
  if (!o.market && !o.limitPx) bad = "Enter a limit price.";
  if (mg > 0 && mg < MIN_MARGIN)
    bad = `The smallest trade is $${MIN_MARGIN} of margin.`;
  if (mg > 0 && notional < 10)
    bad = "Trade size must be at least $10 (margin × leverage).";
  if (o.tpOn && tp && (side > 0 ? tp <= en : tp >= en))
    bad = `Take profit has to be ${side > 0 ? "above" : "below"} your entry.`;
  if (o.tpOn && sl && (side > 0 ? sl >= en || sl <= liq : sl <= en || sl >= liq))
    bad = `Stop loss has to sit between your entry and ${money(liq)}.`;

  return { en, notional, qty, fee, liq, dist, atRisk, tp, sl, need, canMove, needUp, bad };
}
