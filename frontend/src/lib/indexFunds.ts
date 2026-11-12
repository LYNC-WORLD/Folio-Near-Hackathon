// Index fund maths. A fund is either:
//  - a basket: the API prices it as the average of its stocks, so a unit holds
//    1/N of each one — a stock's weight is its price over the sum of prices,
//    and a buy splits the USDC by those weights; or
//  - a single tokenized ETF (SPY, QQQ, GLD …): one holding at 100%.
import type { IndexFund, IndexFundItem, Stock } from "@/types";
import type { StockCategory } from "@/services";
import { dayChange } from "./format";

export type FundHolding = {
  stock: Stock;
  category: StockCategory;
  price: number;
  change: number | null;
  /** 0–100 */
  weight: number;
};

export type Fund = {
  /** basket id, or the token address for a single ETF */
  id: string;
  name: string;
  price: number;
  change: number | null;
  /** heaviest first */
  holdings: FundHolding[];
  hasPreIpo: boolean;
  kind: "basket" | "etf";
  /** ETF only */
  symbol?: string;
  /** ETF only */
  imageUrl?: string;
};

export const stockCategory = (s: Stock): StockCategory =>
  s.stockType === "PreIPO"
    ? "pre-ipo"
    : s.stockType === "IndexFunds"
      ? "index-fund"
      : "us-stock";

export const isBasket = (f: IndexFundItem): f is IndexFund =>
  Array.isArray((f as IndexFund).stocks);

function basketToFund(f: IndexFund): Fund {
  const stocks = f.stocks ?? [];
  const prices = stocks.map((s) => Number(s.price) || 0);
  const sum = prices.reduce((t, p) => t + p, 0);
  const holdings = stocks
    .map((s, i) => ({
      stock: s,
      category: stockCategory(s),
      price: prices[i],
      change: dayChange(s.price, s.marketOpenPrice),
      weight: sum > 0 ? (prices[i] / sum) * 100 : 100 / (stocks.length || 1),
    }))
    .sort((a, b) => b.weight - a.weight);

  // fund's move today = move of its average price since the open
  const opens = stocks.map((s) => Number(s.marketOpenPrice));
  const openSum =
    opens.length > 0 && opens.every((o) => Number.isFinite(o) && o > 0)
      ? opens.reduce((t, o) => t + o, 0)
      : 0;
  const change = openSum > 0 ? ((sum - openSum) / openSum) * 100 : null;

  return {
    id: f.id,
    name: f.name,
    price: Number(f.price) || (stocks.length ? sum / stocks.length : 0),
    change,
    holdings,
    hasPreIpo: holdings.some((h) => h.category === "pre-ipo"),
    kind: "basket",
  };
}

function etfToFund(s: Stock): Fund {
  const price = Number(s.price) || 0;
  const change = dayChange(s.price, s.marketOpenPrice);
  return {
    id: s.tokenAddress,
    name: s.name,
    price,
    change,
    holdings: [
      { stock: s, category: stockCategory(s), price, change, weight: 100 },
    ],
    hasPreIpo: false,
    kind: "etf",
    symbol: s.symbol,
    imageUrl: s.imageUrl,
  };
}

export function toFund(item: IndexFundItem): Fund {
  return isBasket(item) ? basketToFund(item) : etfToFund(item);
}

/** "GPU Infra" → "GPU", "AI prestock" → "AIP" */
export const fundCode = (name: string) => {
  const words = name.split(/\s+/).filter(Boolean);
  const initials = words.length > 1 ? words.map((w) => w[0]).join("") : "";
  const base = /^[A-Z0-9]{2,}$/.test(words[0] ?? "") ? words[0] : initials || name;
  return base.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase();
};

export type Leg = { holding: FundHolding; usdc: number };

/** Split a USDC amount across the fund's stocks by weight, cents that don't
 * divide evenly go to the heaviest stock so the legs add up exactly. Stocks
 * whose share rounds to $0.00 are left out rather than sent as empty orders. */
export function splitBuy(fund: Fund, amount: number): Leg[] {
  const cents = Math.round(amount * 100);
  const legs = fund.holdings.map((h) => ({
    holding: h,
    cents: Math.floor((cents * h.weight) / 100),
  }));
  const rest = cents - legs.reduce((t, l) => t + l.cents, 0);
  if (legs.length) legs[0].cents += rest;
  return legs
    .filter((l) => l.cents > 0)
    .map((l) => ({ holding: l.holding, usdc: l.cents / 100 }));
}

export function searchFunds(funds: Fund[], raw: string): Fund[] {
  const v = raw.trim().toLowerCase();
  if (!v) return [];
  if ("index funds".startsWith(v) || v === "index fund" || v === "fund" || v === "etf")
    return funds;
  return funds.filter(
    (f) =>
      f.name.toLowerCase().includes(v) ||
      f.holdings.some(
        (h) =>
          h.stock.symbol.toLowerCase().startsWith(v) ||
          h.stock.name.toLowerCase().includes(v),
      ),
  );
}