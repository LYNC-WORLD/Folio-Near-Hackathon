// Big live price (flashes on each tick), stats strip, and the US market status pill.
// Owns the 1s funding-countdown tick so only this block re-renders every second.
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { C } from "@/theme";
import { hTap } from "@/lib/haptics";
import { money, sPct } from "@/lib/format";
import { fundLeft, usMarketOpen } from "@/lib/perps";
import { AMBER, Btn } from "@/components/perps/PerpUi";
import { tradeStyles } from "@/components/perps/tradeStyles";
import type { useLiveMarket, useSocketStatus } from "@/hooks/perps";

const tone = (n: number) => (n >= 0 ? C.mint : C.loss);

export function MarketSummary({
  sym,
  live,
  socket,
  listed,
  notListed,
  marketsError,
  onRetry,
  showStatus,
  onStatus,
}: {
  sym: string;
  live: ReturnType<typeof useLiveMarket>;
  socket: ReturnType<typeof useSocketStatus>;
  listed: boolean;
  notListed: boolean;
  marketsError: string | null;
  onRetry: () => void;
  /** show the US market pill (only for markets the backend lists) */
  showStatus: boolean;
  onStatus: () => void;
}) {
  // price flash on each tick
  const [flash, setFlash] = useState<null | "up" | "dn">(null);
  useEffect(() => {
    if (!live.mark || live.mark === live.prevMark) return;
    setFlash(live.mark > live.prevMark ? "up" : "dn");
    const t = setTimeout(() => setFlash(null), 600);
    return () => clearTimeout(t);
  }, [live.mark]); // eslint-disable-line

  const [, tick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => tick((n) => n + 1), 1000); // funding countdown
    return () => clearInterval(i);
  }, []);

  const open = usMarketOpen();
  const fr = live.fundingPct;
  const stats: [string, string, "up" | "down" | null][] = [
    ["MARK", money(live.mark), null],
    ["ORACLE", money(live.oracle), null],
    [
      "FUNDING / 1H",
      `${fr >= 0 ? "+" : "−"}${Math.abs(fr).toFixed(4)}%`,
      fr >= 0 ? "up" : "down",
    ],
    ["NEXT FUNDING", fundLeft(), null],
    ["24H VOLUME", `$${(live.vol24Usd / 1e6).toFixed(1)}M`, null],
    ["OPEN INTEREST", `$${(live.oiUsd / 1e6).toFixed(1)}M`, null],
  ];

  return (
    <>
      {marketsError && !listed ? (
        <View style={[tradeStyles.empty, { paddingHorizontal: 20 }]}>
          <Text style={tradeStyles.ttl}>Prices aren't loading</Text>
          <Text style={tradeStyles.emptyT}>{marketsError}</Text>
          <Btn kind="ghost" small label="Try again" onPress={onRetry} />
        </View>
      ) : notListed ? (
        <View style={[tradeStyles.empty, { paddingHorizontal: 20 }]}>
          <Text style={tradeStyles.ttl}>{sym} isn't on Hyperliquid yet</Text>
          <Text style={tradeStyles.emptyT}>
            Pick another market from the list above.
          </Text>
        </View>
      ) : !live.ready ? (
        <View style={[tradeStyles.px, { height: 38 }]}>
          <ActivityIndicator color={C.ink3} />
        </View>
      ) : (
        <View style={tradeStyles.px}>
          <Text
            style={[
              tradeStyles.big,
              flash && { color: flash === "up" ? C.mint : C.loss },
              socket !== "open" && { opacity: 0.5 },
            ]}
          >
            {money(live.mark)}
          </Text>
          <Text style={[tradeStyles.chg, { color: tone(live.change24) }]}>
            {sPct(live.change24)}
          </Text>
          <Text style={tradeStyles.h24}>
            {socket === "open" ? "24H" : "RECONNECTING"}
          </Text>
        </View>
      )}

      {/* stats strip */}
      {listed ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={tradeStyles.stats}
          style={{ marginTop: 14 }}
        >
          {stats.map(([k, v, t]) => (
            <View key={k} style={{ gap: 5 }}>
              <Text style={tradeStyles.statK}>{k}</Text>
              <Text
                style={[
                  tradeStyles.statV,
                  t === "up" && { color: C.mint },
                  t === "down" && { color: C.loss },
                ]}
              >
                {v}
              </Text>
            </View>
          ))}
        </ScrollView>
      ) : null}

      {/* market status */}
      {showStatus ? (
        <Pressable
          style={tradeStyles.status}
          hitSlop={{ top: 8, bottom: 8 }}
          onPress={() => {
            hTap();
            onStatus();
          }}
          accessibilityRole="button"
        >
          <View
            style={[
              tradeStyles.dot,
              {
                backgroundColor: open ? C.mint : AMBER,
                shadowColor: open ? C.mint : AMBER,
              },
            ]}
          />
          <Text style={tradeStyles.statusT}>
            US MARKET{" "}
            {open ? "OPEN · TRACKS THE LIVE PRICE" : "CLOSED · PERP TRADES 24/7"}
          </Text>
        </Pressable>
      ) : null}
    </>
  );
}
