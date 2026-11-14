// Bank payout via MoonPay off-ramp, embedded in the sheet (react-native-webview).
// The widget URL is signed by the backend (POST /api/onramp/moonpay/sell-url),
// so the MoonPay secret key never ships in the app.
//
//   amount -> embedded MoonPay sell widget (login, KYC, bank) -> redirect caught in-app
//   send   -> user sends USDC to MoonPay's deposit address within 48h
//   done
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import * as Linking from "expo-linking";
import { useAuth } from "@/context";
import { getMoonpaySellUrl } from "@/services/onramp";
import { hTap } from "@/lib/haptics";
import { money } from "@/lib/format";
import { C, em, FONT } from "@/theme";
import { Body, Btn, CARD, Check, H2, Kv, KvCard, Lbl } from "./perps/PerpUi";

// Not a secret: only decides whether the "test mode" note shows.
const MOONPAY_ENV =
  (process.env.EXPO_PUBLIC_MOONPAY_ENV as "sandbox" | "production") ??
  "sandbox";
const BG = "#1B2029";

const clean = (t: string) => {
  const x = t.replace(/[^0-9.]/g, "");
  const i = x.indexOf(".");
  return i < 0 ? x : x.slice(0, i + 1) + x.slice(i + 1).replace(/\./g, "");
};
const floor2 = (n: number) => Math.floor(n * 100) / 100;
const shortTo = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const one = (v: string | string[] | null | undefined) =>
  Array.isArray(v) ? v[0] : (v ?? undefined);

type Step = "amount" | "widget" | "send" | "done";
type Tx = { deposit: string; amount: number };

export function BankWithdraw({
  spot,
  address,
  email,
  onBack,
  onSend,
  onDone,
}: {
  spot: number;
  address: string; // user's own wallet, used as the refund address
  email?: string;
  onBack: () => void;
  /** Send `amount` USDC from the user's wallet to `to`. Throw to fail. */
  onSend: (to: string, amount: number) => Promise<void>;
  onDone: () => void;
}) {
  const [step, setStep] = useState<Step>("amount");
  const [txt, setTxt] = useState("");
  const [widgetUrl, setWidgetUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tx, setTx] = useState<Tx | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const { idToken } = useAuth();

  const alive = useRef(true);
  const handled = useRef(false);
  const redirectUrl = useRef(Linking.createURL("moonpay-sell")).current;
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const amt = parseFloat(txt) || 0;
  const over = amt > spot + 1e-9;
  const bad = amt <= 0 || over;

  async function openWidget() {
    hTap();
    Keyboard.dismiss();
    setErr("");
    if (!idToken) {
      setErr("Please sign in again.");
      return;
    }
    setBusy(true);
    try {
      // the backend sets the refund address to this user's own Folio wallet
      const res = await getMoonpaySellUrl(
        { amount: amt, redirectUrl, email, color: String(C.mint) },
        idToken,
      );
      if (!alive.current) return;
      if (!res.data?.url) throw new Error("Could not start the sale.");
      handled.current = false;
      setLoading(true);
      setWidgetUrl(res.data.url);
      setStep("widget");
    } catch (e) {
      if (alive.current)
        setErr(e instanceof Error ? e.message : "Could not start the sale.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  // MoonPay redirects to our scheme when the sale is confirmed. We catch it here
  // and never let the WebView navigate to it.
  function onRedirect(url: string) {
    if (handled.current) return;
    handled.current = true;
    // console.log("MOONPAY SELL REDIRECT:", url);
    const q = Linking.parse(url).queryParams ?? {};
    const deposit = one(q.depositWalletAddress as any);
    if (!deposit) {
      setErr("MoonPay did not return a deposit address.");
      setStep("amount");
      return;
    }
    setTx({
      deposit,
      amount: Number(one(q.baseCurrencyAmount as any) ?? amt),
    });
    setStep("send");
  }

  async function send() {
    if (!tx) return;
    hTap();
    setErr("");
    setBusy(true);
    try {
      await onSend(tx.deposit, tx.amount);
      if (!alive.current) return;
      setStep("done");
    } catch (e) {
      if (alive.current)
        setErr(e instanceof Error ? e.message : "Could not send USDC.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  // ------------------------------------------------------------ done
  if (step === "done" && tx)
    return (
      <View style={{ gap: 16 }}>
        <View style={[s.center, { gap: 14, paddingTop: 6 }]}>
          <Check />
          <H2 style={{ textAlign: "center" }}>{money(tx.amount)} sent</H2>
          <Body style={{ textAlign: "center", fontSize: 13 }}>
            MoonPay received your USDC. The payout reaches your bank once it
            confirms and MoonPay processes it.
          </Body>
        </View>
        <Btn label="Done" onPress={onDone} />
      </View>
    );

  // ------------------------------------------------------------ send
  if (step === "send" && tx)
    return (
      <View style={{ gap: 16 }}>
        <H2>Send USDC to MoonPay</H2>
        <Body style={{ fontSize: 13.5, marginTop: -6 }}>
          Your sale is confirmed. Send the USDC within 48 hours or it is
          cancelled.
        </Body>
        <KvCard>
          <Kv k="AMOUNT" v={`${tx.amount} USDC`} />
          <Kv k="TO (MOONPAY)" v={shortTo(tx.deposit)} />
          <Kv k="SPOT WALLET AFTER" v={money(spot - tx.amount)} last />
        </KvCard>
        {err ? (
          <View style={s.coach}>
            <Text style={s.coachH}>TRANSFER FAILED</Text>
            <Text style={s.coachT}>{err}</Text>
          </View>
        ) : null}
        {busy ? <ActivityIndicator color={C.mint} /> : null}
        <Btn disabled={busy} label={`Send ${tx.amount} USDC`} onPress={send} />
      </View>
    );

  // ------------------------------------------------------------ widget (embedded)
  if (step === "widget" && widgetUrl)
    return (
      <View style={{ gap: 16 }}>
        <Pressable
          onPress={() => {
            setWidgetUrl(null);
            setStep("amount");
          }}
          style={s.back}
          hitSlop={8}
        >
          <Text style={s.backT}>‹ Cancel</Text>
        </Pressable>
        <H2>Sell USDC</H2>
        <View style={s.web}>
          <WebView
            source={{ uri: widgetUrl }}
            style={{ backgroundColor: BG }}
            originWhitelist={["*"]} // so our redirect scheme isn't handed to the OS
            onShouldStartLoadWithRequest={(req) => {
              if (req.url.startsWith(redirectUrl)) {
                onRedirect(req.url);
                return false;
              }
              return true;
            }}
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            mediaCapturePermissionGrantType="grant" // camera for KYC (iOS)
            onLoadEnd={() => setLoading(false)}
          />
          {loading ? (
            <View style={s.loader} pointerEvents="none">
              <ActivityIndicator color={C.mint} />
            </View>
          ) : null}
        </View>
      </View>
    );

  // ------------------------------------------------------------ amount
  return (
    <View style={{ gap: 16 }}>
      <Pressable onPress={onBack} style={s.back} hitSlop={8}>
        <Text style={s.backT}>‹ Withdraw</Text>
      </Pressable>
      <H2>Withdraw to your bank</H2>
      <Body style={{ fontSize: 13.5, marginTop: -6 }}>
        Sell USDC through MoonPay and get cash in your bank account.
        {MOONPAY_ENV === "sandbox" ? " Test mode: no real money moves." : ""}
      </Body>

      <View style={{ gap: 10 }}>
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Lbl>AMOUNT</Lbl>
          </View>
          <View style={{ alignItems: "flex-end", gap: 3 }}>
            <Text style={s.avail}>{money(spot)}</Text>
            <Text style={s.availK}>IN SPOT WALLET</Text>
          </View>
        </View>
        <View style={[s.field, over && { borderColor: C.loss }]}>
          <Text style={s.cur}>$</Text>
          <TextInput
            value={txt}
            onChangeText={(t) => setTxt(clean(t))}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={C.ink4}
            style={s.input}
          />
          <Pressable
            hitSlop={8}
            onPress={() => {
              hTap();
              setTxt(String(floor2(spot)));
            }}
            style={s.pct}
          >
            <Text style={s.pctT}>Max</Text>
          </Pressable>
          <Text style={s.k}>USDC</Text>
        </View>
      </View>

      {err ? (
        <View style={s.coach}>
          <Text style={s.coachH}>COULD NOT START</Text>
          <Text style={s.coachT}>{err}</Text>
        </View>
      ) : null}
      <Btn
        disabled={bad || busy}
        label={
          over
            ? "More than you have in your spot wallet"
            : busy
              ? "Opening MoonPay…"
              : "Continue to MoonPay"
        }
        onPress={openWidget}
      />
    </View>
  );
}

const s = StyleSheet.create({
  center: { alignItems: "center", gap: 20, paddingVertical: 14 },
  back: { alignSelf: "flex-start", minHeight: 32, justifyContent: "center" },
  backT: { fontFamily: FONT.sans600, fontSize: 14, color: C.ink3 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  avail: { fontFamily: FONT.mono400, fontSize: 13.5, color: "#E4E8EE" },
  availK: {
    fontFamily: FONT.mono400,
    fontSize: 8.5,
    letterSpacing: 1.5,
    color: C.ink4,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 62,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: CARD,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  cur: { fontFamily: FONT.sans800, fontSize: 26, color: C.ink3 },
  input: {
    flex: 1,
    height: "100%",
    color: C.ink1,
    fontFamily: FONT.sans800,
    fontSize: 28,
    letterSpacing: -0.8,
  },
  pct: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: C.stroke,
    justifyContent: "center",
  },
  pctT: { fontFamily: FONT.sans800, fontSize: 12.5, color: C.ink2 },
  k: {
    fontFamily: FONT.mono400,
    fontSize: 9,
    letterSpacing: em(9, 0.16),
    color: C.ink4,
  },
  web: {
    height: 560,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: BG,
  },
  loader: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BG,
  },
  coach: {
    gap: 4,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(240,96,77,.10)",
    borderWidth: 1,
    borderColor: "rgba(240,96,77,.4)",
  },
  coachH: {
    fontFamily: FONT.mono400,
    fontSize: 9.5,
    letterSpacing: 1.6,
    color: C.loss,
  },
  coachT: {
    fontFamily: FONT.sans600,
    fontSize: 13,
    lineHeight: 19,
    color: C.ink1,
  },
});
