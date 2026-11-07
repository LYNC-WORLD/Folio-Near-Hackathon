// Bottom dock above the tab bar: perp balance + Transfer, then Long / Short.
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { C } from "@/theme";
import { TAB_BAR_HEIGHT } from "@/navigation/TabBar";
import { Btn, ON_MINT, ON_SHORT } from "@/components/perps/PerpUi";
import { DockBalance } from "@/components/perps/DockBalance";
import { tradeStyles } from "@/components/perps/tradeStyles";

export function TradeDock({
  perp,
  lev,
  enabled,
  onTransfer,
  onTicket,
}: {
  perp: number;
  /** leverage shown on the buttons */
  lev: number;
  /** dimmed when the market can't be traded */
  enabled: boolean;
  onTransfer: () => void;
  onTicket: (side: 1 | -1) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient
      pointerEvents="box-none"
      colors={["rgba(10,11,14,0)", C.ground]}
      locations={[0, 0.2]}
      style={[tradeStyles.dock, { bottom: TAB_BAR_HEIGHT + insets.bottom }]}
    >
      <View style={tradeStyles.dockInner}>
        <DockBalance perp={perp} onTransfer={onTransfer} />
        <View style={tradeStyles.dockRow}>
          <Btn
            kind="long"
            style={{ flex: 1, opacity: enabled ? 1 : 0.4 }}
            onPress={() => onTicket(1)}
          >
            <Text style={[tradeStyles.dockT, { color: ON_MINT }]}>
              Long <Text style={tradeStyles.lv}>{lev}x</Text>
            </Text>
          </Btn>
          <Btn
            kind="short"
            style={{ flex: 1, opacity: enabled ? 1 : 0.4 }}
            onPress={() => onTicket(-1)}
          >
            <Text style={[tradeStyles.dockT, { color: ON_SHORT }]}>
              Short <Text style={tradeStyles.lv}>{lev}x</Text>
            </Text>
          </Btn>
        </View>
      </View>
    </LinearGradient>
  );
}
