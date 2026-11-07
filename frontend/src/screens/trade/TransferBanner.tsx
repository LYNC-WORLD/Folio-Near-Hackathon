// "Sending $50.00 to perp…" pinned at the top while a transfer is in flight.
import { ActivityIndicator, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C } from "@/theme";
import { money } from "@/lib/format";
import { tradeStyles } from "@/components/perps/tradeStyles";
import type { TransferStatus } from "@/components/TransferSheet";

const busy = (s: TransferStatus) =>
  s.phase === "depositing" || s.phase === "confirming";

export function TransferBanner({
  deposit,
  withdraw,
}: {
  deposit: TransferStatus;
  withdraw: TransferStatus;
}) {
  const insets = useSafeAreaInsets();
  const active = busy(deposit) ? deposit : busy(withdraw) ? withdraw : null;
  if (!active) return null;
  const to = active === deposit ? "perp" : "spot";
  return (
    <View style={[tradeStyles.depositBanner, { top: insets.top + 6 }]}>
      <ActivityIndicator size="small" color={C.mint} />
      <Text style={tradeStyles.depositBannerT}>
        {active.phase === "depositing"
          ? `Sending ${money(active.amount)} to ${to}…`
          : `Confirming transfer of ${money(active.amount)}…`}
      </Text>
    </View>
  );
}
