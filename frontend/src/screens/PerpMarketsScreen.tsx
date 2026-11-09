import { memo, useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { CompositeNavigationProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";

import type { HomeStackParamList } from "@/navigation/HomeStack";
import type { TabParamList } from "@/navigation/RootTabs";
import { C, FONT, TYPE } from "@/theme";
import { PressScale, Rise } from "@/components/ui";
import { money, pct } from "@/lib/format";
import { hTap } from "@/lib/haptics";
import { useTradablePerps, type TradablePerp } from "@/hooks/useTradablePerps";

type Nav = CompositeNavigationProp<
  NativeStackNavigationProp<HomeStackParamList>,
  BottomTabNavigationProp<TabParamList>
>;

export function PerpMarketsScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const {
    markets,
    total,
    loading,
    error,
    refetch,
    hasMore,
    loadingMore,
    loadMoreError,
    loadMore,
  } = useTradablePerps();

  // stable so memoized rows don't re-render on every price tick
  const open = useCallback(
    (m: TradablePerp) => {
      nav.navigate("Trade", { symbol: m.symbol });
      // clear this screen off the Home stack once the tab switch has covered it
      setTimeout(() => nav.popToTop(), 450);
    },
    [nav],
  );

  const onEndReached = useCallback(() => {
    if (hasMore && !loadingMore && !loadMoreError) loadMore();
  }, [hasMore, loadingMore, loadMoreError, loadMore]);

  const renderItem = useCallback(
    ({ item, index }: { item: TradablePerp; index: number }) => {
      const row = (
        <PerpRow
          m={item}
          last={!hasMore && index === markets.length - 1}
          onPress={open}
        />
      );
      // only the first screenful cascades in; rows scrolled to later just appear
      return index < 14 ? (
        <Rise delay={Math.min(index, 8) * 25} duration={300}>
          {row}
        </Rise>
      ) : (
        row
      );
    },
    [hasMore, markets.length, open],
  );

  const header = (
    <>
      <View style={s.head}>
        <Pressable
          onPress={() => {
            hTap();
            nav.goBack();
          }}
          hitSlop={12}
          style={s.back}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={s.backChev}>‹</Text>
        </Pressable>
        <Text style={TYPE.lbl}>PERP MARKETS</Text>
        <Text style={TYPE.h2}>Long or short any of {total}</Text>
      </View>
      {loading ? (
        <ActivityIndicator color={C.mint} style={{ paddingVertical: 14 }} />
      ) : error ? (
        <Pressable onPress={() => refetch()}>
          <Text style={s.note}>Couldn't load markets. Tap to retry.</Text>
        </Pressable>
      ) : null}
    </>
  );

  const footer = loadingMore ? (
    <ActivityIndicator color={C.mint} style={{ paddingVertical: 16 }} />
  ) : loadMoreError ? (
    <Pressable onPress={() => loadMore()}>
      <Text style={s.note}>Couldn't load more. Tap to retry.</Text>
    </Pressable>
  ) : null;

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <FlatList
        data={markets}
        keyExtractor={(m) => m.symbol}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: 8,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 24,
        }}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        renderItem={renderItem}
      />
    </SafeAreaView>
  );
}

const PerpRow = memo(function PerpRow({
  m,
  last,
  onPress,
}: {
  m: TradablePerp;
  last: boolean;
  onPress: (m: TradablePerp) => void;
}) {
  const up = m.change >= 0;
  return (
    <PressScale
      scaleTo={0.985}
      onPress={() => {
        hTap();
        onPress(m);
      }}
      style={[s.row, !last && s.hair]}
      accessibilityRole="button"
      accessibilityLabel={`${m.name} perp, ${money(m.mark)}, ${pct(m.change)} today`}
    >
      <View style={s.logo}>
        <Text style={s.logoText}>
          {m.symbol.replace(/[^A-Z0-9]/g, "").slice(0, 3)}
        </Text>
      </View>
      <View style={s.mid}>
        <Text style={TYPE.ttl} numberOfLines={1}>
          {m.symbol}
        </Text>
        <Text style={TYPE.sub} numberOfLines={1}>
          {m.name} · up to {m.maxLev}x
        </Text>
      </View>
      <View style={s.right}>
        <Text style={s.price}>{money(m.mark)}</Text>
        <Text style={[s.fig, { color: up ? C.mint : C.loss }]}>
          {pct(m.change)}
        </Text>
      </View>
    </PressScale>
  );
});

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.ground },
  head: { gap: 6, marginBottom: 12 },
  back: { width: 44, height: 36, marginLeft: -8, justifyContent: "center" },
  backChev: { fontSize: 30, lineHeight: 32, color: C.ink1 },

  note: { ...TYPE.sub, paddingVertical: 14 },

  row: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 12 },
  hair: { borderBottomWidth: 1, borderBottomColor: C.hair },
  logo: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: "#20252F",
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: { fontFamily: FONT.mono400, fontSize: 10, color: C.ink2 },
  mid: { flex: 1, gap: 3, minWidth: 0 },
  right: { alignItems: "flex-end", gap: 3 },
  price: {
    fontFamily: FONT.mono400,
    fontSize: 13,
    color: C.ink1,
    fontVariant: ["tabular-nums"],
  },
  fig: {
    fontFamily: FONT.mono400,
    fontSize: 11.5,
    fontVariant: ["tabular-nums"],
  },
});
