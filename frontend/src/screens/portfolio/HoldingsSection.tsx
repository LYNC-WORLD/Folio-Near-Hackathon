// Positions header + One-time · Recurring · Perps tabs, category chips, and the rows.
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { C, TYPE } from "@/theme";
import { PressScale, Rise } from "@/components/ui";
import { AssetAvatar } from "@/components/AssetAvatar";
import {
  PerpPositionList,
  PerpsHeader,
} from "@/components/perps/PerpsPortfolio";
import type { useWallet } from "@/context/WalletContext";
import type { useRecurringBuys } from "@/hooks/useTrade";
import type { UiPosition } from "@/hooks/perps";
import type { fundPositions } from "@/lib/fundHoldings";
import { money, pct } from "@/lib/format";
import { dayDate, nextOccurrence } from "@/lib/trade";
import { hSelect, hTap } from "@/lib/haptics";
import { s } from "./styles";

type Tab = "open" | "rec" | "perp";
const TABS: [Tab, string][] = [
  ["open", "One-time"],
  ["rec", "Recurring"],
  ["perp", "Perps"],
];

type Cat = "all" | "USStock" | "PreIPO" | "index";
const CATS: [Cat, string][] = [
  ["all", "All"],
  ["USStock", "Stocks"],
  ["PreIPO", "Pre-IPOs"],
  ["index", "Index funds"],
];

export type Holding = ReturnType<typeof useWallet>["tokens"][number] & {
  value: number;
  change: number | null;
};
type Fund = ReturnType<typeof fundPositions>[number];
type Recurring = ReturnType<typeof useRecurringBuys>["recurringBuys"][number];
type RiseProps = { when: boolean; delay: number; duration: number };

export function HoldingsSection({
  headerRise,
  positions,
  tokensValue,
  funds,
  fundMoves,
  recurringBuys,
  perp,
  onOpenAsset,
  onOpenFund,
  onOpenPerp,
  onManageRecurring,
}: {
  headerRise: RiseProps;
  /** wallet holdings, largest first */
  positions: Holding[];
  tokensValue: number;
  funds: Fund[];
  /** today's move per fund id */
  fundMoves: Map<string, number | null>;
  recurringBuys: Recurring[];
  perp: {
    data: UiPosition[];
    loading: boolean;
    error: string | null;
    refetch: () => void;
  };
  onOpenAsset: (symbol: string, stockType: string) => void;
  onOpenFund: (id: string) => void;
  onOpenPerp: (p?: string | { sym?: string }) => void;
  onManageRecurring: () => void;
}) {
  const [tab, setTab] = useState<Tab>("open");
  const [cat, setCat] = useState<Cat>("all");

  const shownPositions = positions.filter(
    (p) => cat === "all" || p.stockType === cat,
  );
  const due30 = recurringBuys
    .filter((r) => r.isActive)
    .reduce(
      (t, r) =>
        t +
        (Number(r.usdcAmount) ||
          Number(r.stockAmount) * Number(r.stock.price) ||
          0),
      0,
    );
  const shownRec = [...recurringBuys]
    .sort((a, b) => Number(b.isActive) - Number(a.isActive))
    .filter((r) => cat === "all" || r.stock.stockType === cat);
  const perpMargin = perp.data.reduce((t, p) => t + p.margin, 0);
  const perpPnl = perp.data.reduce((t, p) => t + p.pnl, 0);

  // filter chips (the Perps tab has none: every perp is a US stock)
  const chipList: [Cat, string][] = tab === "perp" ? [] : CATS;
  const pickChip = (k: Cat) => {
    if (k === cat) return;
    hSelect();
    setCat(k);
  };

  return (
    <>
      <Rise {...headerRise} style={s.posHead}>
        <View style={s.posHeadText}>
          {tab === "perp" ? (
            <PerpsHeader
              count={perp.data.length}
              margin={perpMargin}
              pnl={perpPnl}
            />
          ) : (
            <View style={{ gap: 3 }}>
              <Text style={s.posTitle}>
                {tab === "open" ? "Positions" : "Recurring"}{" "}
                <Text style={{ color: C.ink3 }}>
                  ({tab === "open" ? positions.length : recurringBuys.length})
                </Text>
              </Text>
              <Text style={s.posSub}>
                {tab === "open"
                  ? `${money(tokensValue)} in positions`
                  : `${money(due30)} due in 30 days`}
              </Text>
            </View>
          )}
        </View>
        <View style={s.oc} accessibilityRole="tablist">
          {TABS.map(([k, label]) => (
            <Pressable
              key={k}
              onPress={() => {
                if (k !== tab) hSelect();
                setTab(k);
              }}
              style={[s.ocBtn, tab === k && s.ocOn]}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === k }}
            >
              <Text style={[s.ocText, tab === k && { color: C.mint }]}>
                {label}
              </Text>
              {tab === k ? <View style={s.ocDot} /> : null}
            </Pressable>
          ))}
        </View>
      </Rise>

      {chipList.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.fchipsWrap}
          contentContainerStyle={s.fchips}
        >
          {chipList.map(([k, t]) => (
            <Pressable
              key={k}
              onPress={() => pickChip(k)}
              style={[s.fchip, cat === k && s.fchipOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: cat === k }}
            >
              <Text style={[s.fchipText, cat === k && { color: C.ink1 }]}>
                {t}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {/* rows — keyed by tab + filter so they cascade in on every switch */}
      <Animated.View
        key={`${tab}-${cat}`}
        entering={FadeIn.duration(160)}
        style={{ marginTop: 8 }}
      >
        {tab === "perp" ? (
          perp.loading ? (
            <ActivityIndicator color={C.ink3} style={{ paddingVertical: 24 }} />
          ) : perp.error && !perp.data.length ? (
            <Pressable onPress={perp.refetch} accessibilityRole="button">
              <Text style={s.empty}>
                Couldn't load perp positions. Tap to retry.
              </Text>
            </Pressable>
          ) : (
            <PerpPositionList
              positions={perp.data}
              onOpen={onOpenPerp}
              onOpenTrade={onOpenPerp}
            />
          )
        ) : tab === "open" && cat === "index" ? (
          funds.length === 0 ? (
            <Text style={s.empty}>
              No index funds yet. Find one under Collections on Home.
            </Text>
          ) : (
            funds.map((f, i) => (
              <Rise key={f.fundId} delay={i * 45} duration={400}>
                <FundRow
                  f={f}
                  move={fundMoves.get(f.fundId) ?? null}
                  onPress={() => onOpenFund(f.fundId)}
                />
              </Rise>
            ))
          )
        ) : tab === "open" ? (
          shownPositions.length === 0 ? (
            <Text style={s.empty}>
              {cat === "all"
                ? "Nothing here yet. Find something to buy on Home."
                : "You hold nothing in this category yet."}
            </Text>
          ) : (
            shownPositions.map((p, i) => (
              <Rise key={p.mint} delay={i * 45} duration={400}>
                <HoldingRow
                  p={p}
                  onPress={() => onOpenAsset(p.symbol, p.stockType)}
                />
              </Rise>
            ))
          )
        ) : cat === "index" ? (
          <Text style={s.empty}>
            Index funds are one-time buys for now. Recurring buys work on
            single stocks and pre-IPOs.
          </Text>
        ) : shownRec.length === 0 ? (
          <Text style={s.empty}>
            {recurringBuys.length
              ? "No recurring buys in this category."
              : "No recurring buys yet. Open any stock or pre-IPO and choose Recurring to buy it on a schedule."}
          </Text>
        ) : (
          <>
            {shownRec.map((r, i) => (
              <Rise key={r.id} delay={i * 45} duration={400}>
                <RecurringRow
                  r={r}
                  onPress={() => onOpenAsset(r.stock.symbol, r.stock.stockType)}
                />
              </Rise>
            ))}
            <Pressable
              onPress={onManageRecurring}
              style={s.manage}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Text style={s.manageText}>Manage recurring buys ›</Text>
            </Pressable>
          </>
        )}
      </Animated.View>
    </>
  );
}

/** ▲ 1.23% / ▼ 0.40% */
function Move({ n }: { n: number }) {
  return (
    <Text style={[s.chg, { color: n >= 0 ? C.mint : C.loss }]}>
      <Text style={s.tri}>{n >= 0 ? "▲ " : "▼ "}</Text>
      {Math.abs(n).toFixed(2)}%
    </Text>
  );
}

function FundRow({
  f,
  move,
  onPress,
}: {
  f: Fund;
  move: number | null;
  onPress: () => void;
}) {
  return (
    <PressScale
      scaleTo={0.985}
      onPress={() => {
        hTap();
        onPress();
      }}
      style={s.posRow}
      accessibilityRole="button"
      accessibilityLabel={`${f.fundName} index fund, ${money(f.value)}`}
    >
      <AssetAvatar symbol={f.fundName} size={48} radius={14} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[TYPE.ttl, { fontSize: 16 }]} numberOfLines={1}>
          {f.fundName}
        </Text>
        <Text style={s.qty} numberOfLines={1}>
          {f.legs.map((l) => l.symbol).join(" · ")}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Text style={s.val}>{money(f.value)}</Text>
        {move != null ? (
          <Move n={move} />
        ) : f.ret != null ? (
          <Text style={[s.chg, { color: f.ret >= 0 ? C.mint : C.loss }]}>
            {pct(f.ret)}
          </Text>
        ) : null}
      </View>
    </PressScale>
  );
}

function HoldingRow({ p, onPress }: { p: Holding; onPress: () => void }) {
  return (
    <PressScale
      scaleTo={0.985}
      onPress={() => {
        hTap();
        onPress();
      }}
      style={s.posRow}
      accessibilityRole="button"
      accessibilityLabel={`${p.symbol}, ${money(p.value)}`}
    >
      <AssetAvatar
        symbol={p.symbol}
        imageUrl={p.imageUrl}
        size={48}
        radius={999}
      />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[TYPE.ttl, { fontSize: 16 }]} numberOfLines={1}>
          {p.symbol}
        </Text>
        <Text style={s.qty}>
          {p.balance.toLocaleString("en-US", { maximumFractionDigits: 4 })}{" "}
          {p.symbol}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Text style={s.val}>{money(p.value)}</Text>
        {p.change != null ? <Move n={p.change} /> : null}
      </View>
    </PressScale>
  );
}

function RecurringRow({ r, onPress }: { r: Recurring; onPress: () => void }) {
  return (
    <PressScale
      scaleTo={0.985}
      onPress={() => {
        hTap();
        onPress();
      }}
      style={[s.posRow, !r.isActive && { opacity: 0.55 }]}
      accessibilityRole="button"
    >
      <AssetAvatar
        symbol={r.stock.symbol}
        imageUrl={r.stock.imageUrl}
        size={48}
        radius={999}
      />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[TYPE.ttl, { fontSize: 16 }]} numberOfLines={1}>
          {r.stock.symbol}
        </Text>
        <Text style={[TYPE.sub, { fontSize: 12.5 }]}>
          Every month ·{" "}
          {r.isActive ? `next ${dayDate(nextOccurrence(Number(r.buyDate)))}` : "cancelled"}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 5 }}>
        <Text style={s.val}>
          {r.usdcAmount
            ? money(Number(r.usdcAmount))
            : `${r.stockAmount} ${r.stock.symbol}`}
        </Text>
        <View style={s.recStat}>
          {r.isActive ? <View style={s.recDot} /> : null}
          <Text style={[s.recStatText, r.isActive && { color: C.mint }]}>
            {r.isActive ? "ACTIVE" : "CANCELLED"}
          </Text>
        </View>
      </View>
    </PressScale>
  );
}
