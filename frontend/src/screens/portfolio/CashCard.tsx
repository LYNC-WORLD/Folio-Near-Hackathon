// "Cash in wallet": Deposit · ⋯ More, balance + refresh, perps summary, Transfer line.
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { C } from "@/theme";
import { PressScale } from "@/components/ui";
import { PerpSummaryLine } from "@/components/perps/PerpsPortfolio";
import { money } from "@/lib/format";
import { hTap } from "@/lib/haptics";
import { s } from "./styles";

export function CashCard({
  cash,
  loading,
  refreshing,
  perpAvailable,
  perpPnl,
  perpCount,
  onDeposit,
  onMore,
  onRefresh,
  onTransfer,
}: {
  /** animated cash value */
  cash: number;
  loading: boolean;
  refreshing: boolean;
  perpAvailable: number;
  perpPnl: number;
  perpCount: number;
  onDeposit: () => void;
  onMore: () => void;
  onRefresh: () => void;
  onTransfer: () => void;
}) {
  return (
    <>
      <View style={s.cashIco}>
        <Text style={s.cashIcoText}>$</Text>
      </View>
      <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
        <View style={s.cashTop}>
          <Text style={s.cashLbl} numberOfLines={1}>
            Cash in wallet
          </Text>
          <PressScale
            scaleTo={0.95}
            onPress={() => {
              hTap();
              onDeposit();
            }}
            style={s.dep}
            accessibilityRole="button"
            accessibilityLabel="Deposit"
          >
            <Svg
              width={15}
              height={15}
              viewBox="0 0 20 20"
              fill="none"
              stroke={C.onMint}
              strokeWidth={2.4}
              strokeLinecap="round"
            >
              <Path d="M10 4v12M4 10h12" />
            </Svg>
            <Text style={s.depText}>Deposit</Text>
          </PressScale>
          <SqButton label="More" onPress={onMore}>
            <Svg width={18} height={18} viewBox="0 0 20 20" fill={C.ink1}>
              <Circle cx="4.5" cy="10" r="1.6" />
              <Circle cx="10" cy="10" r="1.6" />
              <Circle cx="15.5" cy="10" r="1.6" />
            </Svg>
          </SqButton>
        </View>

        <View style={s.cashBal}>
          <Text style={s.cash} numberOfLines={1}>
            {loading ? "…" : money(cash)}
          </Text>
          <PressScale
            scaleTo={0.9}
            onPress={() => {
              hTap();
              onRefresh();
            }}
            disabled={refreshing}
            style={[s.rf, refreshing && { opacity: 0.4 }]}
            accessibilityRole="button"
            accessibilityLabel="Refresh balances"
          >
            <Svg
              width={16}
              height={16}
              viewBox="0 0 20 20"
              fill="none"
              stroke={C.ink3}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <Path d="M16.2 8.2A6.5 6.5 0 0 0 4.4 6.5" />
              <Path d="M4 3.5v3.3h3.3" />
              <Path d="M3.8 11.8a6.5 6.5 0 0 0 11.8 1.7" />
              <Path d="M16 16.5v-3.3h-3.3" />
            </Svg>
          </PressScale>
        </View>

        <PerpSummaryLine
          equity={perpAvailable}
          pnl={perpPnl}
          count={perpCount}
        />
        <PressScale
          scaleTo={0.97}
          onPress={onTransfer}
          style={s.perpLine}
          accessibilityRole="button"
          accessibilityLabel={`Perp account ${money(perpAvailable)}. Transfer`}
        >
          <Text style={s.perpTxt}>Perp account {money(perpAvailable)}</Text>
          <Text style={s.perpGo}>Transfer ›</Text>
        </PressScale>
      </View>
    </>
  );
}

function SqButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <PressScale
      scaleTo={0.93}
      onPress={() => {
        hTap();
        onPress();
      }}
      style={s.sq}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {children}
    </PressScale>
  );
}
