// src/components/folio/WithdrawFlow.tsx — Withdraw
//
//   pick   -> "To a crypto wallet" | "To another chain" | "To your bank"   + SPOT / PERP strip
//   wallet -> WalletWithdraw   (plain USDC to any address, the original flow)
//   chain  -> ExternalWithdraw (Intents: spot or perp -> any chain or token)
//   bank   -> BankWithdraw     (MoonPay sell widget, then send USDC to MoonPay)
//
// onSend is used by the wallet flow and the bank flow. It must send `amount` USDC to `to`.
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { hTap } from "@/lib/haptics";
import { money } from "@/lib/format";
import { C, em, FONT } from "@/theme";
import { CARD, H2 } from "./perps/PerpUi";
import { BankWithdraw } from "./BankWithdraw";
import { ExternalWithdraw } from "./ExternalWithdraw";
import { WalletWithdraw } from "./WalletWithdraw";

type Step = "pick" | "wallet" | "chain" | "bank";

export function WithdrawFlow({
  spot,
  perp,
  address,
  email,
  onSend,
  onMoveToSpot,
  onDone,
}: {
  spot: number;
  perp: number;
  address?: string; // the user's own Solana wallet
  email?: string;
  onSend?: (
    amount: number,
    to: string,
  ) => Promise<boolean | void> | boolean | void;
  onMoveToSpot?: () => void; // "Money in your perp account? Move it to spot first ›"
  onDone: () => void;
}) {
  const [step, setStep] = useState<Step>("pick");
  const ready = !!address;
  const back = () => setStep("pick");

  // Bank flow: sends USDC to MoonPay's deposit address. No mock, because a fake
  // success would start MoonPay's 48h clock for nothing.
  const sendToMoonPay = async (toAddr: string, amount: number) => {
    if (!onSend) throw new Error("Sending is not connected yet.");
    const res = await Promise.resolve(onSend(amount, toAddr));
    if (res === false) throw new Error("The transfer didn't go through.");
  };

  if (step === "wallet")
    return (
      <WalletWithdraw
        spot={spot}
        perp={perp}
        onSend={onSend}
        onBack={back}
        onDone={onDone}
      />
    );

  if (step === "chain" && address)
    return (
      <ExternalWithdraw
        spot={spot}
        perp={perp}
        address={address}
        onBack={back}
        onDone={onDone}
      />
    );

  if (step === "bank" && address)
    return (
      <BankWithdraw
        spot={spot}
        address={address}
        email={email}
        onBack={back}
        onSend={sendToMoonPay}
        onDone={onDone}
      />
    );

  return (
    <View style={{ gap: 16 }}>
      <H2 style={{ textAlign: "center", fontSize: 21 }}>Withdraw</H2>
      <View style={s.strip}>
        <Text style={s.stripTxt}>
          SPOT <Text style={s.stripB}>{money(spot)}</Text>
        </Text>
        <Text style={s.stripTxt}>
          PERP <Text style={s.stripB}>{money(perp)}</Text>
        </Text>
      </View>

      <Opt
        title="To a crypto wallet"
        sub="Send USDC to any address"
        tag="ABOUT A MINUTE · NETWORK FEE ONLY"
        onPress={() => setStep("wallet")}
        icon={
          <>
            <Rect x={2.5} y={5} width={15} height={11} rx={2.4} />
            <Path d="M13.5 10.5h1.5M2.5 8h15" />
          </>
        }
      />

      <Opt
        title="To another chain"
        sub="Swap and send to any chain or token"
        tag="FROM SPOT OR PERP · A FEW MINUTES"
        disabled={!ready}
        onPress={() => setStep("chain")}
        icon={
          <>
            <Circle cx={10} cy={10} r={7.5} />
            <Path d="M2.5 10h15M10 2.5c2.4 2.4 2.4 12.6 0 15M10 2.5c-2.4 2.4-2.4 12.6 0 15" />
          </>
        }
      />

      <Opt
        title="To your bank"
        sub="Cash out as dollars to your account"
        tag="VIA MOONPAY · FEES APPLY"
        disabled={!ready}
        onPress={() => setStep("bank")}
        icon={<Path d="M3 8l7-4 7 4M4.5 8v7M8 8v7M12 8v7M15.5 8v7M3 16.5h14" />}
      />

      {perp > 0 && onMoveToSpot ? (
        <Pressable
          onPress={onMoveToSpot}
          style={{
            alignSelf: "center",
            minHeight: 40,
            justifyContent: "center",
          }}
        >
          <Text style={s.link}>
            Money in your perp account? Move it to spot first ›
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Opt({
  title,
  sub,
  tag,
  icon,
  disabled,
  onPress,
}: {
  title: string;
  sub: string;
  tag: string;
  icon: React.ReactNode;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        hTap();
        onPress();
      }}
      style={[s.opt, disabled && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
    >
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={s.optT}>{title}</Text>
        <Text style={s.optS}>{sub}</Text>
        <Text style={s.tag}>{tag}</Text>
      </View>
      <View style={s.ico}>
        <Svg
          width={22}
          height={22}
          viewBox="0 0 20 20"
          fill="none"
          stroke={C.mint}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {icon}
        </Svg>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  strip: { flexDirection: "row", justifyContent: "center", gap: 22 },
  stripTxt: {
    fontFamily: FONT.mono400,
    fontSize: 10.5,
    letterSpacing: em(10.5, 0.14),
    color: C.ink4,
  },
  stripB: { color: C.ink1 },
  opt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 18,
    borderRadius: 20,
    backgroundColor: CARD,
  },
  optT: {
    fontFamily: FONT.sans700,
    fontSize: 18,
    letterSpacing: em(18, -0.02),
    color: C.ink1,
  },
  optS: { fontFamily: FONT.sans400, fontSize: 14, color: C.ink3 },
  tag: {
    fontFamily: FONT.mono400,
    fontSize: 9.5,
    letterSpacing: em(9.5, 0.12),
    color: C.mint,
  },
  ico: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#2A303A",
    alignItems: "center",
    justifyContent: "center",
  },
  link: { fontFamily: FONT.sans600, fontSize: 13, color: C.mint },
});
