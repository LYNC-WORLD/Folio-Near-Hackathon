// Stock perp universe from the xyz dex, shared across the app.
// One REST fetch (metaAndAssetCtxs) every 30s + live mids from the allMids WebSocket.

import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { STOCK_DEX } from "@/services/hyperliquid/config";
import { errMsg, toCoin, toSym } from "@/services/hyperliquid/format";
import { hlInfo } from "@/services/hyperliquid/info";
import { hlSocket } from "@/services/hyperliquid/ws";
import type { PerpAssetCtx, PerpAssetMeta, WsAllMids } from "@/services/hyperliquid/types";

export interface PerpMarket {
  coin: string; // "xyz:NVDA" (use this for API calls)
  symbol: string; // "NVDA"     (use this for UI and navigation)
  assetIndex: number; // index in the dex universe
  assetId: number; // id used in orders: 100000 + dexIndex * 10000 + assetIndex
  szDecimals: number;
  maxLeverage: number;
  onlyIsolated: boolean;
  mark: number;
  mid: number; // live from allMids, falls back to mark
  oracle: number;
  prevDayPx: number;
  change24: number; // %
  fundingPct: number; // hourly, in % (0.00125 = 0.00125%/h)
  oiUsd: number;
  vol24Usd: number;
}

export interface MarketsState {
  byCoin: Record<string, PerpMarket>;
  list: PerpMarket[]; // sorted by 24h volume
  loading: boolean;
  error: string | null;
  updatedAt: number;
}

let state: MarketsState = { byCoin: {}, list: [], loading: true, error: null, updatedAt: 0 };
const subs = new Set<() => void>();
const emit = (patch: Partial<MarketsState>) => {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
};

let dexIndex: number | null = null;
let inflight: Promise<void> | null = null;

function buildMarket(a: PerpAssetMeta, i: number, ctx: PerpAssetCtx, dex: number): PerpMarket {
  const mark = +ctx.markPx;
  const mid = ctx.midPx ? +ctx.midPx : mark;
  const prevDayPx = +ctx.prevDayPx;
  return {
    coin: a.name,
    symbol: toSym(a.name),
    assetIndex: i,
    assetId: 100_000 + dex * 10_000 + i,
    szDecimals: a.szDecimals,
    maxLeverage: a.maxLeverage,
    onlyIsolated: !!a.onlyIsolated,
    mark,
    mid,
    oracle: +ctx.oraclePx,
    prevDayPx,
    change24: prevDayPx ? (mid / prevDayPx - 1) * 100 : 0,
    fundingPct: +ctx.funding * 100,
    oiUsd: +ctx.openInterest * mark,
    vol24Usd: +ctx.dayNtlVlm,
  };
}

export function refreshMarkets(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      if (dexIndex == null) {
        const dexs = await hlInfo.perpDexs();
        const i = dexs.findIndex((d) => d?.name === STOCK_DEX);
        if (i < 0) throw new Error(`Perp dex "${STOCK_DEX}" not found on Hyperliquid`);
        dexIndex = i;
      }
      const [meta, ctxs] = await hlInfo.metaAndAssetCtxs(STOCK_DEX);
      const byCoin: Record<string, PerpMarket> = {};
      const list: PerpMarket[] = [];
      meta.universe.forEach((a, i) => {
        const ctx = ctxs[i];
        if (a.isDelisted || !ctx) return;
        const m = buildMarket(a, i, ctx, dexIndex!);
        byCoin[m.coin] = m;
        list.push(m);
      });
      list.sort((a, b) => b.vol24Usd - a.vol24Usd);
      emit({ byCoin, list, loading: false, error: null, updatedAt: Date.now() });
    } catch (e) {
      emit({ loading: false, error: errMsg(e) });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function applyMids(mids: Record<string, string>) {
  if (!state.list.length) return;
  let byCoin: Record<string, PerpMarket> | null = null;
  for (const [k, px] of Object.entries(mids)) {
    const m = state.byCoin[k] ?? state.byCoin[toCoin(k)];
    const v = +px;
    if (!m || v === m.mid) continue;
    byCoin ??= { ...state.byCoin };
    byCoin[m.coin] = { ...m, mid: v, change24: m.prevDayPx ? (v / m.prevDayPx - 1) * 100 : 0 };
  }
  if (byCoin) emit({ byCoin, list: state.list.map((m) => byCoin![m.coin]) });
}

// ---- lifecycle: poll + live mids only while some component uses markets,
// and no polling while the app is in the background (the socket pauses itself)
let users = 0;
let pollEvery = 30_000;
let timer: ReturnType<typeof setInterval> | null = null;
let unsubMids: (() => void) | null = null;

function startPolling() {
  if (timer || AppState.currentState === "background") return;
  refreshMarkets();
  timer = setInterval(refreshMarkets, pollEvery);
}
function stopPolling() {
  if (timer) clearInterval(timer);
  timer = null;
}

AppState.addEventListener("change", (s) => {
  if (s === "active" && users > 0) startPolling();
  else if (s === "background") stopPolling();
});

function start(pollMs: number) {
  pollEvery = pollMs;
  startPolling();
  unsubMids = hlSocket.subscribe({ type: "allMids", dex: STOCK_DEX }, (d: WsAllMids) => applyMids(d.mids));
}
function stop() {
  stopPolling();
  unsubMids?.();
  unsubMids = null;
}

const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};
const snapshot = () => state;

/** Keeps the poll + live mids running while the calling component is mounted. */
function useMarketsFeed(pollMs: number) {
  useEffect(() => {
    if (users++ === 0) start(pollMs);
    return () => {
      if (--users === 0) stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Whole stock universe. Re-renders on every live price tick (several a second),
 * so prefer useMarketsSelect / useMarket when you only need part of it.
 */
export function useMarkets(pollMs = 30_000) {
  useMarketsFeed(pollMs);
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  return { ...s, refresh: refreshMarkets };
}

/**
 * Re-renders only when what `select` returns changes. Return a primitive or an object
 * straight from the store (never build a new one here, or it re-renders every tick).
 *   const listed = useMarketsSelect((s) => !!s.byCoin["xyz:NVDA"]);
 */
export function useMarketsSelect<T>(select: (s: MarketsState) => T, pollMs = 30_000): T {
  useMarketsFeed(pollMs);
  const get = () => select(state);
  return useSyncExternalStore(subscribe, get, get);
}

/** One market by app symbol ("NVDA") or coin ("xyz:NVDA"). Re-renders only when it changes. */
export function useMarket(sym: string): PerpMarket | undefined {
  const coin = toCoin(sym);
  return useMarketsSelect((s) => s.byCoin[coin]);
}

/** Non-hook read for services / callbacks. */
export const getMarket = (sym: string): PerpMarket | undefined => state.byCoin[toCoin(sym)];
