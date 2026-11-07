// The connected user's perp positions and open orders, as the UI shows them,
// plus PnL / ROE against a live mark price.

export interface UiPosition {
  id: string; // coin; one position per market on Hyperliquid
  coin: string;
  sym: string;
  side: 1 | -1;
  size: number; // absolute, in shares/units
  lev: number;
  isCross: boolean;
  entry: number;
  liq: number | null;
  margin: number;
  value: number;
  pnl: number; // snapshot from Hyperliquid; use livePnl() with a live mark
  roe: number; // %
  fundingSinceOpen: number; // + received, - paid
  tp: number | null;
  sl: number | null;
  tpOid?: number;
  slOid?: number;
}

export interface UiOrder {
  id: number;
  oid: number;
  coin: string;
  sym: string;
  side: 1 | -1;
  kind: "limit" | "stop";
  px: number; // limit price, or trigger price for stops
  size: number;
  reduceOnly: boolean;
  placedAt: number;
}

/** PnL / ROE with a live mark (e.g. from useLiveMarket or useMarkets().byCoin). */
export const livePnl = (p: UiPosition, mark: number) => p.side * (mark - p.entry) * p.size;
export const liveRoe = (p: UiPosition, mark: number) => (p.margin ? (livePnl(p, mark) / p.margin) * 100 : 0);
