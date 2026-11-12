// src/screens/IndexFundsScreen.tsx — prototype #s-collection (curColl = 'index')
//
//   ‹ Home
//   COLLECTION
//   Index funds
//   Several companies in one buy. …
//   [ search ………………………………… ]            ← /api/stocks/search?type=IndexFunds
//   ┌ basket card ──────────────────────────────┐
//   │ GPU  GPU Infra                   $433.78  │
//   │      Tracks NVIDIA and AMD         +0.4%  │
//   │ [2 STOCKS] (logos) NVDAx · AMDx           │
//   └───────────────────────────────────────────┘
//   ┌ ETF card ─────────────────────────────────┐
//   │ [logo]  iShares Core S&P 500 ETF  $760.67 │
//   │                                    +0.7%  │
//   │ [ETF]  IVV                                │
//   └───────────────────────────────────────────┘
//   …scroll to the end and the next page loads

import { useMemo, useState } from "react";
import {
  FlatList,
  Image,
  Keyboard,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { useStockSearch } from "@/hooks/useStockSearch";
import type { HomeStackParamList } from "@/navigation/HomeStack";
import { C, FONT, TYPE, em, h1Size } from "@/theme";
import { Badge, Chip, PressScale, Rise, Skeleton } from "@/components/ui";
import { SearchBar } from "@/components/SearchBar";
import { COLLECTIONS } from "@/lib/assets";
import { fundCode, toFund, type Fund } from "@/lib/indexFunds";
import { money, pct } from "@/lib/format";
import { hTap } from "@/lib/haptics";

export function IndexFundsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const coll = COLLECTIONS["index-fund"];

  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const {
    stocks,
    searching,
    loading,
    refreshing,
    loadingMore,
    loadMore,
    hasMore,
    error,
    refresh,
    reload,
  } = useStockSearch("index-fund", query);

  const list = useMemo(() => stocks.map(toFund), [stocks]);

  const openFund = (f: Fund) => {
    if (f.kind === "etf" && f.symbol) {
      nav.navigate("StockDetail", { symbol: f.symbol, category: "index-fund" });
    } else {
      nav.navigate("IndexFundDetail", { id: f.id });
    }
  };

  const header = (
    <View style={s.head}>
      <Pressable
        onPress={() => nav.goBack()}
        style={({ pressed }) => [s.back, pressed && { opacity: 0.6 }]}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Back to Home"
      >
        <Ionicons name="chevron-back" size={16} color={C.mint} />
        <Text style={s.backText}>Home</Text>
      </Pressable>

      <View style={s.header}>
        <Rise duration={460}>
          <Text style={TYPE.lbl}>COLLECTION</Text>
        </Rise>
        <Rise duration={460} delay={55}>
          <Text style={[TYPE.h1, h1Size(38)]} accessibilityRole="header">
            {coll.title}
          </Text>
        </Rise>
        <Rise duration={460} delay={110}>
          <Text style={TYPE.body}>{coll.blurb}</Text>
        </Rise>
      </View>

      <Rise duration={460} delay={140}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          active={focused || query.length > 0}
          onFocus={() => setFocused(true)}
          onCancel={() => {
            setQuery("");
            setFocused(false);
            Keyboard.dismiss();
          }}
          onClear={() => setQuery("")}
          onSubmit={() => Keyboard.dismiss()}
        />
      </Rise>

      {error ? (
        <View style={s.errorRow}>
          <Text style={[TYPE.sub, { color: C.loss, flex: 1 }]}>{error}</Text>
          <Chip label="Retry" onPress={() => void reload()} />
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <FlatList
        data={loading ? [] : list}
        keyExtractor={(f) => f.id}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={s.list}>
            {loading ? (
              [0, 1, 2].map((i) => (
                <Skeleton key={i} height={116} radius={16} />
              ))
            ) : error ? null : (
              <Text style={[TYPE.sub, s.none]}>
                {searching
                  ? `No match for “${query.trim()}”`
                  : "No funds open yet."}
              </Text>
            )}
          </View>
        }
        ListFooterComponent={
          <View style={s.footer}>
            {loadingMore ? (
              <Skeleton height={116} radius={16} />
            ) : !hasMore && list.length > 0 ? (
              <View style={s.note}>
                <Text style={s.noteDot}>●</Text>
                <Text style={s.noteText}>
                  You hold the tokens themselves, in your wallet. A basket
                  splits one buy across every stock in it; an ETF is a single
                  token. Sell whenever you like.
                </Text>
              </View>
            ) : null}
          </View>
        }
        ItemSeparatorComponent={Gap}
        contentContainerStyle={s.page}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // scroll-based paging: ask for the next page near the end
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void refresh();
            }}
            tintColor={C.mint}
            colors={[C.mint]}
            progressBackgroundColor={C.raised}
          />
        }
        renderItem={({ item: f, index: i }) => {
          const card = <FundCard f={f} onPress={() => openFund(f)} />;
          // only the first screenful cascades in; later pages just appear
          return i < 8 ? (
            <Rise delay={200 + i * 40} duration={420}>
              {card}
            </Rise>
          ) : (
            card
          );
        }}
      />
    </SafeAreaView>
  );
}

/** space between cards */
const Gap = () => <View style={{ height: 10 }} />;

/** Round logo; falls back to the first letters of the symbol. */
function Logo({
  uri,
  symbol,
  size,
  overlap,
}: {
  uri?: string;
  symbol: string;
  size: number;
  overlap?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const box = [
    s.logoWrap,
    {
      width: size,
      height: size,
      borderRadius: size === 40 ? 12 : size / 2,
    },
    size !== 40 && s.logoRing,
    overlap && { marginLeft: -8 },
  ];

  if (!uri || failed) {
    return (
      <View style={box}>
        <Text style={s.logoFallback}>{symbol.slice(0, 2).toUpperCase()}</Text>
      </View>
    );
  }

  return (
    <View style={box}>
      <Image
        source={{ uri }}
        style={{ width: size, height: size }}
        resizeMode="cover"
        onError={() => setFailed(true)}
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

function FundCard({ f, onPress }: { f: Fund; onPress: () => void }) {
  const n = f.holdings.length;
  const isEtf = f.kind === "etf";
  const top = f.holdings.slice(0, 3);
  return (
    <PressScale
      scaleTo={0.985}
      onPress={() => {
        hTap();
        onPress();
      }}
      style={s.card}
      accessibilityRole="button"
      accessibilityLabel={
        isEtf
          ? `${f.name}, ETF, ${money(f.price)}`
          : `${f.name}, ${n} stocks, ${money(f.price)}`
      }
    >
      <View style={s.cardTop}>
        {isEtf ? (
          <Logo uri={f.imageUrl} symbol={f.symbol ?? f.name} size={40} />
        ) : (
          <View style={s.code}>
            <Text style={s.codeText}>{fundCode(f.name)}</Text>
          </View>
        )}
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={s.cardName} numberOfLines={isEtf ? 2 : 1}>
            {f.name}
          </Text>
          {isEtf ? null : (
            <Text style={TYPE.sub} numberOfLines={2}>
              {tracks(f)}
            </Text>
          )}
        </View>
        <View style={{ alignItems: "flex-end", gap: 3 }}>
          <Text style={s.fig}>{money(f.price)}</Text>
          {f.change != null ? (
            <Text
              style={[
                s.fig,
                { fontSize: 11.5, color: f.change >= 0 ? C.mint : C.loss },
              ]}
            >
              {pct(f.change)}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={s.cardFoot}>
        {isEtf ? (
          <>
            <Badge label="ETF" />
            <Text
              style={[TYPE.sub, { fontSize: 12.5, flex: 1 }]}
              numberOfLines={1}
            >
              {f.symbol}
            </Text>
          </>
        ) : (
          <>
            <Badge label={`${n} ${n === 1 ? "STOCK" : "STOCKS"}`} />
            {f.hasPreIpo ? <Badge label="PRE-IPO" variant="mint" /> : null}
            <View style={s.logoRow}>
              {top.map((h, i) => (
                <Logo
                  key={h.stock.tokenAddress}
                  uri={h.stock.imageUrl}
                  symbol={h.stock.symbol}
                  size={24}
                  overlap={i > 0}
                />
              ))}
            </View>
            <Text
              style={[TYPE.sub, { fontSize: 12.5, flex: 1 }]}
              numberOfLines={1}
            >
              {top.map((h) => h.stock.symbol).join(" · ")}
            </Text>
          </>
        )}
      </View>
    </PressScale>
  );
}

/** "Tracks NVIDIA and AMD" / "Tracks Oracle, Netflix and 3 more" */
export function tracks(f: Fund) {
  const names = f.holdings.map((h) => h.stock.name.replace(/ PreStocks$/i, ""));
  if (names.length <= 2) return `Tracks ${names.join(" and ")}`;
  if (names.length === 3)
    return `Tracks ${names[0]}, ${names[1]} and ${names[2]}`;
  return `Tracks ${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.ground },
  page: { paddingTop: 18, paddingHorizontal: 20, paddingBottom: 40 },
  // the header blocks keep the old page gap; the list starts one gap below them
  head: { gap: 20, marginBottom: 20 },

  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    minHeight: 44,
    marginLeft: -4,
    marginBottom: -12,
  },
  backText: { fontFamily: FONT.sans600, fontSize: 13, color: C.mint },

  header: { gap: 8 },

  list: { gap: 10 },
  footer: { paddingTop: 10 },
  none: { fontSize: 13.5, lineHeight: 21, paddingVertical: 14 },

  card: { backgroundColor: C.surface, borderRadius: 16, padding: 16, gap: 14 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  code: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#20252F",
    alignItems: "center",
    justifyContent: "center",
  },
  codeText: { fontFamily: FONT.mono500, fontSize: 12, color: C.mint },
  cardName: {
    fontFamily: FONT.sans800,
    fontSize: 17,
    letterSpacing: em(17, -0.04),
    color: C.ink1,
  },
  fig: {
    fontFamily: FONT.mono400,
    fontSize: 13,
    color: C.ink1,
    fontVariant: ["tabular-nums"],
  },
  cardFoot: { flexDirection: "row", alignItems: "center", gap: 8 },

  logoRow: { flexDirection: "row", alignItems: "center" },
  logoWrap: {
    backgroundColor: "#20252F",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logoRing: { borderWidth: 2, borderColor: C.surface },
  logoFallback: { fontFamily: FONT.mono500, fontSize: 10, color: C.mint },

  errorRow: { flexDirection: "row", alignItems: "center", gap: 12 },

  note: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: C.sunk,
    borderRadius: 18,
    padding: 16,
  },
  noteDot: { color: C.mint, fontSize: 13, lineHeight: 17 },
  noteText: {
    flex: 1,
    fontFamily: FONT.sans400,
    fontSize: 12.5,
    lineHeight: 19,
    color: C.ink2,
  },
});
