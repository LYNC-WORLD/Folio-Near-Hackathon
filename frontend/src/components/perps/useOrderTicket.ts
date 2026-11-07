// Order ticket state: side, type, margin, leverage, TP/SL, the live quote (orderQuote),
// the analyst check, and placing the order through the backend.
import { useEffect, useMemo, useRef, useState } from "react";
import { C } from "@/theme";
import { AMBER } from "./PerpUi";
import { toast } from "./PerpToast";
import { usePerpListing } from "@/hooks/useTradablePerps";
import { useWallet } from "@/context/WalletContext";
import {
  useLiveMarket,
  usePerpsSession,
  useRecentBars,
} from "@/hooks/perps";
import { tradeService, unwrap } from "@/services/perps/tradeService";
import { errMsg, newCloid, toSym } from "@/services/hyperliquid/format";
import { ApiError } from "@/services/api/client";
import { TAKER, orderQuote, preCheck, type TpSlMode } from "@/lib/perps";
import { money } from "@/lib/format";

export type OrderType = "Market" | "Limit";
export type MarginMode = "ISOLATED" | "CROSS";
type Result = { filled: boolean; entry: number | null; size: number };

const MAX_LEV = 10;
const num = (t: string) => parseFloat(t) || 0;

export function useOrderTicket({
  sym,
  initialSide,
  perpBal,
  spotBal,
}: {
  sym: string;
  initialSide: 1 | -1;
  /** free money in the perp account: this is the margin you can use */
  perpBal: number;
  /** money in the spot wallet: can be moved into the perp account */
  spotBal: number;
}) {
  const session = usePerpsSession();
  const live = useLiveMarket(sym);
  // perpBal comes from the wallet balance query; show "…" until it has loaded
  const balLoading = useWallet().loading;

  const listing = usePerpListing(toSym(sym));
  const nm: string = listing?.name ?? toSym(sym);
  const unit: string = toSym(sym);
  const days = useRecentBars(sym, "1d", 90);
  const mk = live.mark;
  const exchangeMaxLev = Math.max(1, live.maxLeverage);
  const maxLev = Math.min(MAX_LEV, exchangeMaxLev); // what the user can pick
  const usdc = perpBal;

  const [side, setSide] = useState<1 | -1>(initialSide);
  const [otype, setOtype] = useState<OrderType>("Market");
  const [marginMode, setMarginMode] = useState<MarginMode>("ISOLATED");
  const [tpMode, setTpMode] = useState<TpSlMode>("price");
  const [slMode, setSlMode] = useState<TpSlMode>("price");
  const [err, setErr] = useState("");

  const [opx, setOpx] = useState("");
  const [marginT, setMarginT] = useState("");
  const [lev, setLevRaw] = useState(Math.min(10, maxLev));
  const setLev = (v: number) =>
    setLevRaw(Math.max(1, Math.min(maxLev, Math.round(v))));
  const [tpOn, setTpOn] = useState(false);
  const [tpT, setTpT] = useState("");
  const [slT, setSlT] = useState("");
  const [phase, setPhase] = useState<"form" | "busy" | "done">("form");
  const [result, setResult] = useState<Result | null>(null);
  // default margin once the perp balance arrives
  useEffect(() => {
    if (!marginT && usdc > 0)
      setMarginT(String(Math.min(50, Math.floor(usdc))));
  }, [usdc]); // eslint-disable-line
  // this market may allow less leverage than the default
  useEffect(() => {
    if (lev > maxLev) setLevRaw(maxLev);
  }, [maxLev]); // eslint-disable-line

  const mg = num(marginT);
  const tpIn = num(tpT),
    slIn = num(slT);
  const q = orderQuote({
    side,
    market: otype === "Market",
    mark: mk,
    limitPx: num(opx),
    margin: mg,
    lev,
    maxLev,
    tpOn,
    tpIn,
    slIn,
    tpMode,
    slMode,
    perp: usdc,
    spot: spotBal,
  });
  const { qty, need, dist, tp, sl } = q;

  const [tone, toneTxt] = useMemo(
    () => preCheck(nm, side, dist || 0.01, days),
    [nm, side, dist, days],
  );
  const toneCol = tone === "ok" ? C.mint : tone === "warn" ? AMBER : C.loss;
  const fpay = q.notional * (live.fundingPct / 100) * side;

  const setType = (t: OrderType) => {
    setOtype(t);
    if (t === "Limit") setOpx((mk * (1 - side * 0.01)).toFixed(2));
  };
  const pickSide = (v: 1 | -1) => {
    setSide(v);
    setTpT("");
    setSlT("");
  };
  const pctMargin = (p: number) => {
    const max = Math.floor((usdc / (1 + lev * TAKER)) * 100) / 100;
    setMarginT(String(Math.floor(max * p) / 100));
  };

  // One id per order. Kept when we can't tell whether the order went through
  // (timeout / network), so trying again can't open a second position.
  const cloid = useRef<`0x${string}` | null>(null);
  const submitting = useRef(false);

  const go = async () => {
    if (submitting.current) return; // double tap
    submitting.current = true;
    setErr("");
    setPhase("busy");
    cloid.current ??= newCloid();
    try {
      const token = session.idToken ?? "";
      const common = {
        cloid: cloid.current,
        stockSymbol: sym,
        dollarSize: mg,
        leverage: lev,
        isBuy: side > 0,
        margin: marginMode,
        tpPrice: tpOn && tpMode === "price" ? (tp ?? undefined) : undefined,
        slPrice: tpOn && slMode === "price" ? (sl ?? undefined) : undefined,
        tpPercent: tpOn && tpMode === "pct" ? tpIn || undefined : undefined,
        slPercent: tpOn && slMode === "pct" ? slIn || undefined : undefined,
      };
      const r =
        otype === "Market"
          ? await unwrap(tradeService.placeMarketOrder(common, token))
          : await unwrap(
              tradeService.placeLimitOrder(
                { ...common, limitPrice: num(opx) },
                token,
              ),
            );
      cloid.current = null;
      if (r.status === "error") throw new Error(r.error ?? "Order rejected");
      setResult({
        filled: r.status === "filled",
        entry: r.avgPx ? parseFloat(r.avgPx) : null,
        size: r.totalSz ? parseFloat(r.totalSz) : qty,
      });
      setPhase("done");
    } catch (e) {
      const unknown =
        e instanceof ApiError && (e.code === "TIMEOUT" || e.code === "NETWORK");
      if (unknown) {
        const m = "We couldn't confirm this order. Check your positions before trying again.";
        setErr(m);
        toast("Order status unknown", "CHECK YOUR POSITIONS");
      } else {
        cloid.current = null; // the backend answered: this order is settled
        const m = errMsg(e);
        setErr(m);
        toast("Order not placed", m.toUpperCase());
      }
      setPhase("form");
    } finally {
      submitting.current = false;
    }
  };

  const short = mg > 0 && need > 0; // not enough in the perp account
  const holdNeeded = lev >= 25 && !short;
  const btnLabel = short
    ? q.canMove
      ? `Move ${money(q.needUp)} from spot`
      : "Add funds to trade"
    : lev >= 25
      ? `Hold to ${otype === "Market" ? "open" : "place"} ${lev}x ${side > 0 ? "long" : "short"}`
      : `${otype === "Market" ? "" : otype + " "}${side > 0 ? "Long " : "Short "}${nm} · ${lev}x`;
  const disabled = mg <= 0 || (!!q.bad && !(need > 0));

  return {
    ...q,
    balLoading,
    nm,
    unit,
    mk,
    maxLev,
    usdc,
    side,
    otype,
    marginMode,
    setMarginMode,
    tpMode,
    setTpMode,
    slMode,
    setSlMode,
    err,
    opx,
    setOpx,
    marginT,
    setMarginT,
    lev,
    setLev,
    tpOn,
    setTpOn,
    tpT,
    setTpT,
    slT,
    setSlT,
    phase,
    result,
    mg,
    toneTxt,
    toneCol,
    fpay,
    setType,
    pickSide,
    pctMargin,
    go,
    short,
    holdNeeded,
    btnLabel,
    disabled,
  };
}
