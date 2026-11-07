import { memo } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { PressScale } from "@/components/ui";
import { C, FONT, em } from "@/theme";
import { hTap } from "@/lib/haptics";
import { pct } from "@/lib/format";
import { useRecentBars } from "@/hooks/perps";
import { useTradablePerps, type TradablePerp } from "@/hooks/useTradablePerps";
const GRID_GAP = 10;
const GRID_PADDING = 20; // matches HomeScreen s.body paddingHorizontal

function Sparkline({ data, up }: { data: number[]; up: boolean }) {
  const lo = Math.min(...data);
  const hi = Math.max(...data);
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 24 - ((v - lo) / (hi - lo || 1)) * 22;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <Svg
      width="100%"
      height={26}
      viewBox="0 0 100 26"
      preserveAspectRatio="none"
    >
      <Polyline
        points={pts}
        fill="none"
        stroke={up ? C.mint : C.loss}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** The first `count` perp markets as cards. Reads live prices itself, so price ticks
 *  re-render this strip (and only the cards that moved), not the screen around it. */
export function PerpStrip({
  count = 3,
  onPress,
}: {
  count?: number;
  onPress: (m: TradablePerp) => void;
}) {
  const markets = useTradablePerps().markets.slice(0, count);
  const { width } = useWindowDimensions();
  const cardWidth = (width - GRID_PADDING * 2 - GRID_GAP * 2) / 3;
  return (
    <View style={s.row}>
      {markets.map((m) => (
        <PerpCard key={m.symbol} m={m} width={cardWidth} onPress={onPress} />
      ))}
    </View>
  );
}

const PerpCard = memo(function PerpCard({
  m,
  width,
  onPress,
}: {
  m: TradablePerp;
  width: number;
  onPress: (m: TradablePerp) => void;
}) {
  const up = m.change >= 0;
  const bars = useRecentBars(m.symbol, "1h", 24); // last 24h, hourly
  return (
    <PressScale
      scaleTo={0.96}
      onPress={() => {
        hTap();
        onPress(m);
      }}
      style={[s.card, { width }]}
      accessibilityRole="button"
      accessibilityLabel={`Trade ${m.name} perp, ${pct(m.change)} today`}
    >
      <Text style={s.label} numberOfLines={1}>
        {m.name.toUpperCase()}
      </Text>
      {bars.length > 1 ? (
        <Sparkline data={bars.map((b) => b.c)} up={up} />
      ) : (
        <View style={{ height: 26 }} />
      )}
      <View style={s.foot}>
        <Text style={[s.fig, { color: up ? C.mint : C.loss }]}>
          {pct(m.change)}
        </Text>
        <Text style={s.lev}>{m.maxLev}X</Text>
      </View>
    </PressScale>
  );
});

const s = StyleSheet.create({
  row: { flexDirection: "row", gap: GRID_GAP },
  card: {
    padding: 12,
    gap: 8,
    borderRadius: 16,
    backgroundColor: C.surface,
  },
  label: { fontFamily: FONT.mono400, fontSize: 10.5, color: C.ink3 },
  foot: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fig: {
    fontFamily: FONT.mono400,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  lev: {
    fontFamily: FONT.mono400,
    fontSize: 9,
    letterSpacing: em(9, 0.1),
    color: C.ink4,
  },
});
