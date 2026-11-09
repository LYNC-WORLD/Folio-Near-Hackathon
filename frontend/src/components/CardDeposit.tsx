// Card onramp step shown inside the Deposit sheet. See lib/onrampTest.ts for the order logic.
import { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  CrossmintProvider,
  CrossmintEmbeddedCheckout,
} from "@crossmint/client-sdk-react-native-ui";
import { C, FONT, TYPE } from "@/theme";
import { Button } from "@/components/ui/Button";
import { Step } from "@/components/trade/SheetParts";
import {
  createOnrampOrder,
  NETWORK_LABEL,
  ONRAMP_ENV,
  type OnrampOrder,
} from "../services/Onramptest";

const CLIENT_KEY = process.env.EXPO_PUBLIC_CROSSMINT_CLIENT_SIDE_API_KEY ?? "";

// Matches the dark sheet. Change these to restyle the checkout.
const BG = "#1B2029";

const APPEARANCE = {
  variables: {
    fontFamily: "system-ui, -apple-system, sans-serif",
    borderRadius: "12px",
    colors: {
      backgroundPrimary: BG,
      textPrimary: C.ink1,
      textSecondary: C.ink3,
      borderPrimary: C.stroke,
      accent: C.mint,
    },
  },
  rules: {
    // We pass the email in directly, so hide the field inside the checkout.
    ReceiptEmailInput: { display: "hidden" },
    PrimaryButton: {
      colors: { text: "#0A0B0E", background: C.mint },
    },
  },
};

export function CardDeposit({
  address,
  email,
  back,
}: {
  address: string;
  email?: string; // passed in from the signed-in user, no input shown
  back: React.ReactNode;
}) {
  const [amount, setAmount] = useState("10");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [order, setOrder] = useState<OnrampOrder | null>(null);

  const valid = !!email && Number(amount) > 0;

  async function start() {
    if (!email) return;
    setBusy(true);
    setErr(null);
    try {
      setOrder(
        await createOnrampOrder({ walletAddress: address, email, amount }),
      );
    } catch (e: any) {
      setErr(e?.message ?? "Could not start checkout");
    } finally {
      setBusy(false);
    }
  }

  if (order && email) {
    return (
      <Step id="card-checkout">
        {back}
        <Text style={TYPE.h2}>Pay with Apple Pay or card</Text>
        <View style={s.checkout}>
          <CrossmintProvider apiKey={CLIENT_KEY}>
            <CrossmintEmbeddedCheckout
              orderId={order.orderId}
              clientSecret={order.clientSecret}
              payment={{
                receiptEmail: email,
                crypto: { enabled: false },
                fiat: { enabled: true },
                defaultMethod: "fiat",
              }}
              // `appearance` is documented for the web checkout. If your SDK version's types
              // reject it, delete this line; the checkout still works, just with default styling.
              {...({ appearance: APPEARANCE } as object)}
            />
          </CrossmintProvider>
        </View>
      </Step>
    );
  }

  return (
    <Step id="card">
      {back}
      <Text style={TYPE.h2}>Buy USDC with Apple Pay or card</Text>
      <Text style={[TYPE.body, { fontSize: 13.5, marginTop: -6 }]}>
        Pay by card and the USDC lands in your Folio wallet.
        {ONRAMP_ENV === "staging"
          ? " Test mode: use card 4242 4242 4242 4242."
          : ""}
      </Text>

      <View style={s.infoCard}>
        <View style={[s.infoRow, s.hair]}>
          <Text style={s.lbl}>RECEIPT TO</Text>
          <Text style={s.val}>{email ?? "No email on your account"}</Text>
        </View>
        <View style={s.infoRow}>
          <Text style={s.lbl}>NETWORK</Text>
          <Text style={s.val}>{NETWORK_LABEL}</Text>
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <Text style={s.lbl}>AMOUNT (USD)</Text>
        <TextInput
          style={s.input}
          value={amount}
          onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ""))}
          keyboardType="decimal-pad"
        />
      </View>

      {err ? <Text style={s.err}>{err}</Text> : null}
      {busy ? <ActivityIndicator color={C.mint} /> : null}
      <Button
        title="Continue to checkout"
        onPress={start}
        disabled={!valid || busy}
      />
    </Step>
  );
}

const s = StyleSheet.create({
  lbl: {
    fontFamily: FONT.mono400,
    fontSize: 9.5,
    letterSpacing: 1.5,
    color: C.ink4,
  },
  val: { fontFamily: FONT.sans400, fontSize: 14, color: C.ink1 },
  hair: { borderBottomWidth: 1, borderBottomColor: C.hair },
  infoCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  infoRow: { gap: 6, paddingVertical: 12 },
  input: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: C.surface,
    color: C.ink1,
    fontFamily: FONT.sans400,
    fontSize: 15,
  },
  err: {
    fontFamily: FONT.sans400,
    fontSize: 12.5,
    lineHeight: 19,
    color: C.loss,
  },
  // Dark wrapper so the checkout blends into the sheet instead of showing a white box.
  checkout: {
    height: 560,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: BG,
  },
});
