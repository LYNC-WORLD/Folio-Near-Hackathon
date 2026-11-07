import { useQuery } from "@tanstack/react-query";
import {
  OrderApi,
  PositionApi,
  tradeService,
  unwrap,
} from "@/services/perps/tradeService";
import { UiOrder, UiPosition } from "./useAccount";

const POLL_MS = 5000;
export type SymPosition = UiPosition;

const toPosition = (p: PositionApi): SymPosition => {
  const szi = parseFloat(p.szi);
  const margin = parseFloat(p.marginUsed);
  return {
    id: p.coin,
    coin: p.coin,
    sym: p.coin.includes(":") ? p.coin.split(":")[1] : p.coin,
    side: szi >= 0 ? 1 : -1,
    size: Math.abs(szi),
    lev: p.leverage.value,
    isCross: p.leverage.type === "cross",
    entry: parseFloat(p.entryPx),
    liq: n(p.liquidationPx),
    margin,
    value: parseFloat(p.positionValue),
    pnl: parseFloat(p.unrealizedPnl),
    roe: parseFloat(p.returnOnEquity) * 100, // API gives a fraction
    fundingSinceOpen: -parseFloat(p.cumFunding?.sinceOpen ?? "0"), // see note below
    tp: null,
    sl: null,
  };
};

const n = (v?: string | null) => (v == null ? null : parseFloat(v));

export type OrderRole = "tp" | "sl" | "stop" | "limit";

export type SymOrder = UiOrder & {
  role: OrderRole;
  orderType: string; // raw label, e.g. "Take Profit Market"
  isTrigger: boolean;
  triggerText: string; // "Price above 296.4"
  isPositionTpsl: boolean;
};

const toOrder = (r: OrderApi): SymOrder => {
  const o = r.order.order;
  const ot = o.orderType.toLowerCase();
  const role: OrderRole = ot.includes("take profit")
    ? "tp"
    : o.isTrigger && ot.includes("stop") && o.reduceOnly
      ? "sl"
      : o.isTrigger
        ? "stop"
        : "limit";

  return {
    id: o.oid,
    oid: o.oid,
    coin: o.coin,
    sym: o.coin.includes(":") ? o.coin.split(":")[1] : o.coin,
    side: o.side === "B" ? 1 : -1,
    kind: o.isTrigger ? "stop" : "limit",
    px: parseFloat(o.isTrigger ? o.triggerPx : o.limitPx),
    size: parseFloat(o.sz),
    reduceOnly: o.reduceOnly,
    placedAt: o.timestamp,
    role,
    orderType: o.orderType,
    isTrigger: o.isTrigger,
    triggerText: o.isTrigger ? o.triggerCondition : "",
    isPositionTpsl: o.isPositionTpsl,
  };
};

/** Shared, polled query: every screen using the same key shares one request. */
function usePolled<A, T>(
  key: string,
  idToken: string | null | undefined,
  fetcher: (token: string) => Promise<A[]>,
  map: (a: A) => T,
) {
  const query = useQuery({
    queryKey: [key, idToken],
    queryFn: async () => ((await fetcher(idToken!)) ?? []).map(map),
    enabled: !!idToken,
    refetchInterval: POLL_MS,
    staleTime: POLL_MS,
  });
  return {
    data: query.data ?? [],
    loading: query.isLoading, // only until the first response
    error: query.error instanceof Error ? query.error.message : null,
    refetch: () => query.refetch().then(() => {}),
  };
}

export const useAllPositions = (idToken?: string | null) =>
  usePolled(
    "perpPositions",
    idToken,
    async (t) => {
      const rows = await unwrap(tradeService.getAllPositions(t));
      return (rows ?? [])
        .map((r) => r.position)
        .filter((p): p is PositionApi => !!p && parseFloat(p.szi) !== 0);
    },
    toPosition,
  );

export const useAllOrders = (idToken?: string | null) =>
  usePolled(
    "perpOrders",
    idToken,
    async (t) => {
      const rows = await unwrap(tradeService.getAllOrders(t));
      return (rows ?? []).filter(
        (r) => r.status === "order" && r.order?.status === "open",
      );
    },
    toOrder,
  );
