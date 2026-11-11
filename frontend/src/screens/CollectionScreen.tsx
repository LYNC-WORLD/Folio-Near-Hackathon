// src/screens/CollectionScreen.tsx — prototype #s-collection
// One screen for both collections; StocksScreen and PreIpoScreen render it.
//
//   ‹ Home
//   COLLECTION
//   Pre-IPOs                              ┐ rise in, 55ms apart
//   Private companies, priced off …       ┘
//   [ search ………………………………… ]            ← /api/stocks/search, debounced
//   [All 8] [AI] [Space] [Fintech]      Sort · Price high–low
//   ┌ card ─────────────────────────────┐
//   │ SPA  SpaceX             LOCKED    │
//   │ PRICE   VS LAST ROUND  LAST ROUND │
//   └───────────────────────────────────┘
//   …scroll to the end and the next page loads

import { useMemo, useState } from "react";
import {
  FlatList,
  Keyboard,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { useStockSearch } from "@/hooks/useStockSearch";
import type { StockCategory } from "@/services";
import type { HomeStackParamList } from "@/navigation/HomeStack";
import { C, FONT, TYPE, em, h1Size } from "@/theme";
import { Chip, PressScale, Rise, Skeleton } from "@/components/ui";
import { AssetAvatar } from "@/components/AssetAvatar";
import { SearchBar } from "@/components/SearchBar";
import { COLLECTIONS, toAsset, type Asset } from "@/lib/assets";
import { money, pct } from "@/lib/format";
import { hSelect, hTap } from "@/lib/haptics";

type SortMode = "priceDesc" | "priceAsc" | "name";
const SORT_LABEL: Record<SortMode, string> = {
  priceDesc: "Price high–low",
  priceAsc: "Price low–high",
  name: "Name",
};
const NEXT_SORT: Record<SortMode, SortMode> = {
  priceDesc: "priceAsc",
  priceAsc: "name",
  name: "priceDesc",
};

export function CollectionScreen({ category }: { category: StockCategory }) {
  const nav = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const coll = COLLECTIONS[category];

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
  } = useStockSearch(category, query);

  const assets = useMemo(
    () => stocks.map((s) => toAsset(s, category)),
    [stocks, category],
  );
  const tags = useMemo(
    () =>
      Array.from(
        new Set(assets.map((a) => a.preIpo?.category).filter(Boolean)),
      ) as string[],
    [assets],
  );

  const [tag, setTag] = useState("all");
  const [sort, setSort] = useState<SortMode>("priceDesc");

  // filter + sort apply to the pages loaded so far
  const list = useMemo(() => {
    const filtered =
      tag === "all" ? assets : assets.filter((a) => a.preIpo?.category === tag);
    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      return sort === "priceAsc" ? a.price - b.price : b.price - a.price;
    });
  }, [assets, tag, sort]);

  const onChangeQuery = (t: string) => {
    setQuery(t);
    setTag("all"); // a tag from the old results may not exist in the new ones
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
          onChangeText={onChangeQuery}
          active={focused || query.length > 0}
          onFocus={() => setFocused(true)}
          onCancel={() => {
            onChangeQuery("");
            setFocused(false);
            Keyboard.dismiss();
          }}
          onClear={() => onChangeQuery("")}
          onSubmit={() => Keyboard.dismiss()}
        />
      </Rise>

      <Rise duration={460} delay={165} style={s.filterRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chips}
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <Chip
            label={`All ${loading ? "…" : assets.length}${hasMore ? "+" : ""}`}
            on={tag === "all"}
            onPress={() => setTag("all")}
          />
          {tags.map((t) => (
            <Chip key={t} label={t} on={tag === t} onPress={() => setTag(t)} />
          ))}
        </ScrollView>
        <Pressable
          onPress={() => {
            hSelect();
            setSort((m) => NEXT_SORT[m]);
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Sort by ${SORT_LABEL[sort]}. Tap to change.`}
        >
          <Text style={s.sort}>{SORT_LABEL[sort]} ↕</Text>
        </Pressable>
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
        // keyed with the filter + sort so the list re-cascades when they change
        keyExtractor={(a) => `${tag}-${sort}-${a.category}-${a.symbol}`}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={s.list}>
            {loading ? (
              [0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={122} radius={16} />
              ))
            ) : (
              <Text style={[TYPE.sub, s.none]}>
                {searching
                  ? `No match for “${query.trim()}”`
                  : "Nothing in this filter yet."}
              </Text>
            )}
          </View>
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={s.footer}>
              <Skeleton height={122} radius={16} />
            </View>
          ) : undefined
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
            onRefresh={() => void refresh()}
            tintColor={C.mint}
            colors={[C.mint]}
            progressBackgroundColor={C.raised}
          />
        }
        renderItem={({ item: a, index: i }) => {
          const card = (
            <CollectionCard
              a={a}
              onPress={() =>
                nav.navigate("StockDetail", {
                  symbol: a.symbol,
                  category: a.category,
                })
              }
            />
          );
          // only the first screenful cascades in; later pages just appear
          return i < 8 ? (
            <Rise delay={220 + i * 40} duration={420}>
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

/** space between cards (the old list's gap) */
const Gap = () => <View style={{ height: 10 }} />;

function CollectionCard({ a, onPress }: { a: Asset; onPress: () => void }) {
  const isPre = a.kind === "Pre-IPO";
  const round = a.preIpo?.vsLastRoundPct;

  const stats: [string, string, string?][] = isPre
    ? [
        ["PRICE", money(a.price)],
        [
          "VS LAST ROUND",
          round == null ? "—" : pct(round),
          round == null ? undefined : round < 0 ? C.mint : C.loss,
        ],
        ["LAST ROUND", a.preIpo?.lastRound ?? "—"],
      ]
    : [
        ["PRICE", money(a.price)],
        ["OPEN", a.open != null ? money(a.open) : "—"],
        [
          "TODAY",
          a.change != null ? pct(a.change) : "—",
          a.change == null ? undefined : a.change >= 0 ? C.mint : C.loss,
        ],
      ];

  return (
    <PressScale
      scaleTo={0.985}
      onPress={() => {
        hTap();
        onPress();
      }}
      style={s.card}
      accessibilityRole="button"
      accessibilityLabel={`${a.name}, ${money(a.price)}`}
    >
      <View style={s.cardTop}>
        <AssetAvatar
          symbol={a.symbol}
          imageUrl={a.imageUrl}
          size={40}
          radius={12}
        />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={s.cardName} numberOfLines={1}>
            {a.name}
          </Text>
          <Text style={TYPE.sub} numberOfLines={1}>
            {isPre && a.preIpo
              ? `${a.preIpo.category} · Pre-IPO`
              : `${a.symbol} · ${a.kind}`}
          </Text>
        </View>
      </View>

      <View style={s.stats}>
        {stats.map(([k, v, color]) => (
          <View key={k} style={s.stat}>
            <Text style={s.statKey}>{k}</Text>
            <Text
              style={[s.statVal, color ? { color } : null]}
              numberOfLines={1}
            >
              {v}
            </Text>
          </View>
        ))}
      </View>
    </PressScale>
  );
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

  filterRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  chips: { gap: 8, paddingRight: 8 },
  sort: { fontFamily: FONT.sans600, fontSize: 12.5, color: C.mint },

  list: { gap: 10 },
  footer: { paddingTop: 10 },
  none: { fontSize: 13.5, lineHeight: 21, paddingVertical: 14 },

  card: { backgroundColor: C.surface, borderRadius: 16, padding: 16, gap: 14 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  cardName: {
    fontFamily: FONT.sans800,
    fontSize: 17,
    letterSpacing: em(17, -0.04),
    color: C.ink1,
  },

  stats: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, gap: 4 },
  statKey: {
    fontFamily: FONT.mono400,
    fontSize: 9,
    letterSpacing: em(9, 0.14),
    color: C.ink4,
  },
  statVal: {
    fontFamily: FONT.mono400,
    fontSize: 13,
    color: C.ink1,
    fontVariant: ["tabular-nums"],
  },

  errorRow: { flexDirection: "row", alignItems: "center", gap: 12 },
});
