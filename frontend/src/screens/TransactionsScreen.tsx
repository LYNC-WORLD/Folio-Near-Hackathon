// Transactions — every buy and sale, grouped by month, in the prototype's row style.
import { useMemo } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";

import { useAuth } from "@/context";
import { useUserTransactions } from "@/hooks/useUserRecords";
import { useTabBarSpace } from "@/navigation/TabBar";
import { C, FONT, TYPE } from "@/theme";
import { Button, Rise, Skeleton } from "@/components/ui";
import { BackLink } from "@/components/BackLink";
import { AssetAvatar } from "@/components/AssetAvatar";
import { money } from "@/lib/format";
import { units } from "@/lib/trade";
import { isSell, txUsd } from "@/lib/transactions";
import type { UserTransaction } from "@/services/user";

// One flat list for FlatList: a month label, then that month's rows.
type Item =
  | { k: "month"; month: string }
  | { k: "tx"; tx: UserTransaction; last: boolean; n: number }; // n: row number overall

export function TransactionsScreen() {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const bottom = useTabBarSpace();
  const { idToken } = useAuth();
  const q = useUserTransactions(idToken ?? undefined);

  const groups = useMemo(() => {
    const list = [...(q.data?.data ?? [])].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    const out: [string, UserTransaction[]][] = [];
    for (const tx of list) {
      const key = new Date(tx.createdAt).toLocaleDateString("en-GB", { month: "short", year: "numeric" }).toUpperCase();
      const g = out.find(([k]) => k === key);
      if (g) g[1].push(tx);
      else out.push([key, [tx]]);
    }
    return out;
  }, [q.data]);

  const items = useMemo(() => {
    const out: Item[] = [];
    let n = 0;
    for (const [month, txs] of groups) {
      out.push({ k: "month", month });
      txs.forEach((tx, i) => out.push({ k: "tx", tx, last: i === txs.length - 1, n: n++ }));
    }
    return out;
  }, [groups]);

  const header = (
    <View style={s.head}>
      <BackLink onPress={() => nav.goBack()} />
      <View style={{ gap: 8 }}>
        <Rise duration={460}>
          <Text style={TYPE.lbl}>ACTIVITY</Text>
        </Rise>
        <Rise duration={460} delay={55}>
          <Text style={TYPE.h1} accessibilityRole="header">
            Transactions
          </Text>
        </Rise>
      </View>

      {q.isPending ? (
        <View style={{ gap: 14 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={46} radius={12} />
          ))}
        </View>
      ) : q.isError ? (
        <View style={s.wash}>
          <Text style={[TYPE.sub, { color: C.loss }]}>Couldn't load your transactions.</Text>
          <Button variant="quiet" size="sm" title="Try again" onPress={() => q.refetch()} style={{ alignSelf: "flex-start", width: 140 }} />
        </View>
      ) : groups.length === 0 ? (
        <View style={[s.wash, { gap: 8 }]}>
          <Text style={TYPE.ttl}>Nothing yet</Text>
          <Text style={[TYPE.sub, { fontSize: 13 }]}>Your buys and sales will show up here.</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={s.safe}>
      <FlatList
        data={items}
        keyExtractor={(it) => (it.k === "month" ? `m-${it.month}` : `t-${it.tx.id}`)}
        ListHeaderComponent={header}
        contentContainerStyle={[s.page, { paddingTop: insets.top + 12, paddingBottom: bottom }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={C.mint} colors={[C.mint]} progressBackgroundColor={C.raised} />
        }
        renderItem={({ item }) => {
          if (item.k === "month") return <Text style={[TYPE.lbl, s.month]}>{item.month}</Text>;
          const row = <TxRow tx={item.tx} last={item.last} />;
          // only the first screenful cascades in; rows scrolled to later just appear
          return item.n < 16 ? (
            <Rise delay={110 + Math.min(item.n, 12) * 40} duration={400} style={s.rowGap}>
              {row}
            </Rise>
          ) : (
            <View style={s.rowGap}>{row}</View>
          );
        }}
      />
    </View>
  );
}

function TxRow({ tx, last }: { tx: UserTransaction; last: boolean }) {
  const sold = isSell(tx);
  return (
    <View style={[s.row, !last && s.hair]}>
      <AssetAvatar symbol={tx.stock?.symbol ?? "?"} imageUrl={tx.stock?.imageUrl} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={TYPE.ttl} numberOfLines={1}>
          {sold ? "Sold" : "Bought"} {tx.stock?.symbol ?? "—"}
        </Text>
        <Text style={TYPE.sub} numberOfLines={1}>
          {units(Number(tx.amount))} at {money(Number(tx.price))} ·{" "}
          {new Date(tx.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
        </Text>
      </View>
      <Text style={[s.fig, { color: sold ? C.mint : "#D6DAE0" }]}>
        {sold ? "+" : "−"}
        {money(txUsd(tx))}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.ground },
  page: { paddingHorizontal: 20 },
  // the page used to be one column with gap 22, and gap 2 inside each month
  head: { gap: 22 },
  month: { marginTop: 22, marginBottom: 4 },
  rowGap: { marginTop: 2 },
  wash: { backgroundColor: C.sunk, borderRadius: 18, padding: 16, gap: 10 },
  row: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  hair: { borderBottomWidth: 1, borderBottomColor: C.hair },
  fig: { fontFamily: FONT.mono400, fontSize: 13, fontVariant: ["tabular-nums"] },
});
