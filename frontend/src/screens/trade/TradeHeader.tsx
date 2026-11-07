// Market button (logo, ticker, name · max leverage) + "Spot ›" link.
import { Pressable, Text, View } from "react-native";
import Svg, { Path, SvgUri } from "react-native-svg";
import { C } from "@/theme";
import { hTap } from "@/lib/haptics";
import { Tag } from "@/components/perps/PerpUi";
import { tradeStyles } from "@/components/perps/tradeStyles";

export function TradeHeader({
  sym,
  name,
  imageUrl,
  maxLev,
  listed,
  onPickMarket,
  onSpot,
}: {
  sym: string;
  name: string;
  imageUrl?: string;
  maxLev: number;
  listed: boolean;
  onPickMarket: () => void;
  onSpot: () => void;
}) {
  return (
    <View style={tradeStyles.head}>
      <Pressable
        style={tradeStyles.mktBtn}
        onPress={() => {
          hTap();
          onPickMarket();
        }}
        accessibilityRole="button"
        accessibilityLabel="Change market"
      >
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 999,
            backgroundColor: C.stroke,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {imageUrl ? <SvgUri uri={imageUrl} width={42} height={42} /> : null}
        </View>
        <View style={{ gap: 3, flexShrink: 1 }}>
          <View style={tradeStyles.rowC}>
            <Text style={tradeStyles.sym}>{sym}</Text>
            <Tag label="PERP" />
            <Svg
              width={14}
              height={14}
              viewBox="0 0 16 16"
              fill="none"
              stroke={C.ink3}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <Path d="m4 6 4 4 4-4" />
            </Svg>
          </View>
          <Text style={tradeStyles.sub} numberOfLines={1}>
            {name}
            {listed ? ` · up to ${maxLev}x` : ""}
          </Text>
        </View>
      </Pressable>
      <Pressable
        style={tradeStyles.spot}
        hitSlop={{ top: 6, bottom: 6 }}
        onPress={() => {
          hTap();
          onSpot();
        }}
        accessibilityRole="button"
      >
        <Text style={tradeStyles.spotT}>Spot ›</Text>
      </Pressable>
    </View>
  );
}
