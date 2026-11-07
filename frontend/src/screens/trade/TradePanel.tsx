// Tabs under the chart: Positions · Orders · Order book · Contract.
import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { C } from "@/theme";
import { hTap } from "@/lib/haptics";
import { money, sMoney, sPct, sideTxt } from "@/lib/format";
import { TAKER } from "@/lib/perps";
import { Btn, Kv, Tag } from "@/components/perps/PerpUi";
import { OrderBook } from "@/components/perps/OrderBook";
import { tradeStyles } from "@/components/perps/tradeStyles";
import { livePnl, liveRoe, type UiPosition, type useLiveMarket } from "@/hooks/perps";
import type { SymOrder } from "@/hooks/perps/useSymbolTrading";
import { ROLE_LABEL, orderTone } from "./orderLabels";

type PTab = "pos" | "ord" | "book" | "info";
type Query<T> = {
  data: T[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
};

const tone = (n: number) => (n >= 0 ? C.mint : C.loss);
const logoTxt = (sym: string) => sym.replace(/[^A-Z0-9]/g, "").slice(0, 3);

export function TradePanel({
  sym,
  name,
  listed,
  live,
  maxLev,
  positions,
  orders,
  markOf,
  onOpenPosition,
  onEditTpSl,
  onOpenOrder,
}: {
  sym: string;
  name: string;
  listed: boolean;
  live: ReturnType<typeof useLiveMarket>;
  maxLev: number;
  /** positions with tp/sl filled in from their orders */
  positions: Query<UiPosition>;
  orders: Query<SymOrder>;
  /** live mark for any coin, falling back to `fallback` */
  markOf: (coin: string, fallback: number) => number;
  onOpenPosition: (id: string) => void;
  onEditTpSl: (id: string) => void;
  onOpenOrder: (id: number) => void;
}) {
  const [tab, setTab] = useState<PTab>("pos");
  return (
    <>
      <View style={tradeStyles.tabs}>
        {(
          [
            ["pos", "Positions", positions.data.length],
            ["ord", "Orders", orders.data.length],
            ["book", "Order book"],
            ["info", "Contract"],
          ] as [PTab, string, number?][]
        ).map(([k, t, n]) => (
          <Pressable
            key={k}
            onPress={() => {
              hTap();
              setTab(k);
            }}
            style={tradeStyles.tabB}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === k }}
          >
            <Text style={[tradeStyles.tabT, tab === k && { color: C.ink1 }]}>
              {t}
              {n ? <Text style={tradeStyles.tabN}> {n}</Text> : null}
            </Text>
            {tab === k ? <View style={tradeStyles.tabLine} /> : null}
          </Pressable>
        ))}
      </View>

      <View style={tradeStyles.panel}>
        {tab === "pos" ? (
          <Loaded q={positions} what="positions">
            {positions.data.length ? (
              positions.data.map((p) => (
                <PositionRow
                  key={p.id}
                  p={p}
                  mark={markOf(p.coin, p.entry)}
                  onOpen={() => onOpenPosition(p.id)}
                  onEditTpSl={() => onEditTpSl(p.id)}
                />
              ))
            ) : (
              <View style={tradeStyles.empty}>
                <Text style={tradeStyles.ttl}>No open positions</Text>
                <Text style={tradeStyles.emptyT}>
                  Tap Long if you think {sym} goes up, Short if you think it
                  goes down. You can start from $10.
                </Text>
              </View>
            )}
          </Loaded>
        ) : null}

        {tab === "ord" ? (
          <Loaded q={orders} what="orders">
            {orders.data.length ? (
              orders.data.map((o) => (
                <OrderRow
                  key={o.id}
                  o={o}
                  mark={markOf(o.coin, o.px)}
                  onOpen={() => onOpenOrder(o.id)}
                />
              ))
            ) : (
              <View style={tradeStyles.empty}>
                <Text style={tradeStyles.ttl}>No open orders</Text>
                <Text style={tradeStyles.emptyT}>
                  Choose Limit or Stop in the ticket to trade at a price you
                  set. Orders show on the chart.
                </Text>
              </View>
            )}
          </Loaded>
        ) : null}

        {tab === "book" && listed ? <OrderBook sym={sym} label={sym} /> : null}

        {tab === "info" && listed ? (
          <ContractInfo name={name} live={live} maxLev={maxLev} />
        ) : null}
      </View>
    </>
  );
}

/** spinner on first load, retry card on error with nothing to show, else children */
function Loaded<T>({
  q,
  what,
  children,
}: {
  q: Query<T>;
  what: string;
  children: ReactNode;
}) {
  if (q.loading)
    return (
      <View style={tradeStyles.empty}>
        <ActivityIndicator color={C.ink3} />
      </View>
    );
  if (q.error && !q.data.length)
    return (
      <View style={tradeStyles.empty}>
        <Text style={tradeStyles.ttl}>Couldn't load {what}</Text>
        <Text style={tradeStyles.emptyT}>{q.error}</Text>
        <Btn kind="ghost" small label="Try again" onPress={q.refetch} />
      </View>
    );
  return <>{children}</>;
}

function PositionRow({
  p,
  mark,
  onOpen,
  onEditTpSl,
}: {
  p: UiPosition;
  mark: number;
  onOpen: () => void;
  onEditTpSl: () => void;
}) {
  const pnl = livePnl(p, mark),
    roe = liveRoe(p, mark);
  return (
    <Pressable
      style={tradeStyles.pRow}
      onPress={() => {
        hTap();
        onOpen();
      }}
      accessibilityRole="button"
    >
      <View style={tradeStyles.logo}>
        <Text style={tradeStyles.logoT}>{logoTxt(p.sym)}</Text>
      </View>
      <View style={{ flex: 1, gap: 5, minWidth: 0 }}>
        <View style={[tradeStyles.rowC, { gap: 8 }]}>
          <Text style={tradeStyles.ttl}>{p.sym}</Text>
          <Tag
            label={`${sideTxt(p.side)} ${p.lev}x`}
            tone={p.side > 0 ? "long" : "short"}
          />
        </View>
        <Text style={tradeStyles.entry} numberOfLines={1}>
          {money(p.entry)} → {money(mark)}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Text style={[tradeStyles.pnl, { color: tone(pnl) }]}>
          {sMoney(pnl)}
        </Text>
        <Text style={[tradeStyles.roe, { color: tone(roe) }]}>{sPct(roe)}</Text>
      </View>

      <Pressable
        onPress={() => {
          hTap();
          onEditTpSl();
        }}
        hitSlop={8}
        style={tradeStyles.editBtn}
        accessibilityRole="button"
        accessibilityLabel={`Edit take profit and stop loss for ${p.sym}`}
      >
        <Svg
          width={15}
          height={15}
          viewBox="0 0 20 20"
          fill="none"
          stroke={C.ink3}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d="M13.5 3.5 16.5 6.5 7 16H4v-3L13.5 3.5Z" />
        </Svg>
      </Pressable>
    </Pressable>
  );
}

function OrderRow({
  o,
  mark,
  onOpen,
}: {
  o: SymOrder;
  mark: number;
  onOpen: () => void;
}) {
  const dist = mark ? ((o.px - mark) / mark) * 100 : 0;
  const t = orderTone(o);
  return (
    <Pressable
      style={tradeStyles.pRow}
      onPress={() => {
        hTap();
        onOpen();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${ROLE_LABEL[o.role].toLowerCase()} order for ${o.sym}, tap for details`}
    >
      <View style={tradeStyles.logo}>
        <Text style={tradeStyles.logoT}>{logoTxt(o.sym)}</Text>
      </View>
      <View style={{ flex: 1, gap: 5, minWidth: 0 }}>
        <View style={[tradeStyles.rowC, { gap: 8 }]}>
          <Text style={tradeStyles.ttl}>{o.sym}</Text>
          <Tag label={ROLE_LABEL[o.role]} tone={t} />
        </View>
        <Text style={tradeStyles.entry} numberOfLines={1}>
          {o.isTrigger
            ? o.triggerText
            : `${o.side > 0 ? "Buy" : "Sell"} limit`}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Text
          style={[tradeStyles.pnl, { color: t === "long" ? C.mint : C.loss }]}
        >
          {money(o.px)}
        </Text>
        <Text style={[tradeStyles.roe, { color: C.ink3 }]}>{sPct(dist)}</Text>
      </View>
    </Pressable>
  );
}

function ContractInfo({
  name,
  live,
  maxLev,
}: {
  name: string;
  live: ReturnType<typeof useLiveMarket>;
  maxLev: number;
}) {
  const fr = live.fundingPct;
  return (
    <View>
      {(
        [
          ["UNDERLYING", name],
          ["VENUE", "Hyperliquid · " + live.coin],
          ["MAX LEVERAGE", maxLev + "x"],
          [
            "FUNDING",
            `Every hour · ${fr >= 0 ? "+" : "−"}${Math.abs(fr).toFixed(4)}%`,
          ],
          // Hyperliquid maintenance margin = half the initial margin at max leverage
          [
            "MAINTENANCE MARGIN",
            (100 / (2 * live.maxLeverage)).toFixed(2) + "%",
          ],
          ["FEES", "~" + (TAKER * 100).toFixed(3) + "% taker"],
          ["MARGIN", "USDC · isolated per position"],
          ["HOURS", "24/7"],
        ] as [string, string][]
      ).map(([k, v]) => (
        <Kv key={k} k={k} v={v} />
      ))}
      <Text style={tradeStyles.foot}>LIVE FROM HYPERLIQUID</Text>
    </View>
  );
}
