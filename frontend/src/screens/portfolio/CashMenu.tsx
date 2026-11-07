import { Text, View } from "react-native";
import { PressScale } from "@/components/ui";
import { shortAddr } from "@/components/folio/FolioSheets";
import { money } from "@/lib/format";
import { hTap } from "@/lib/haptics";
import { s } from "./styles";

/** The ⋯ drawer: CASH — Move money · Withdraw · Copy address · Activity · Standing orders · Account */
export function CashMenu({
  spot,
  perp,
  address,
  onMove,
  onWithdraw,
  onCopy,
  onActivity,
  onOrders,
  onAccount,
}: {
  spot: number;
  perp: number;
  address?: string | null;
  onMove: () => void;
  onWithdraw: () => void;
  onCopy: () => void;
  onActivity: () => void;
  onOrders: () => void;
  onAccount: () => void;
}) {
  const rows: [string, string, string, () => void][] = [
    [
      "move",
      "Move money",
      `Spot ${money(spot)} · Perp account ${money(perp)}`,
      onMove,
    ],
    ["wd", "Withdraw", "To a crypto wallet or your bank", onWithdraw],
    [
      "addr",
      "Copy wallet address",
      `${shortAddr(address!)} · self-custody`,
      onCopy,
    ],
    ["act", "Activity", "Every buy, sale and order", onActivity],
    ["rec", "Standing orders", "Recurring buys you have set up", onOrders],
    ["acc", "Account", "Profile, notifications, sign out", onAccount],
  ];
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.menuLbl}>CASH</Text>
      <View>
        {rows.map(([k, title, sub, fn], i) => (
          <PressScale
            key={k}
            scaleTo={0.985}
            onPress={() => {
              hTap();
              fn();
            }}
            style={[s.menuRow, i < rows.length - 1 && s.menuHair]}
            accessibilityRole="button"
            accessibilityLabel={`${title}. ${sub}`}
          >
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={s.menuTtl}>{title}</Text>
              <Text style={s.menuSub}>{sub}</Text>
            </View>
            <Text style={s.menuChev}>›</Text>
          </PressScale>
        ))}
      </View>
    </View>
  );
}
