// Card onramp step shown inside the Deposit sheet. Transak, embedded in the sheet.
//   iOS     -> plain WebView with enableApplePay (Apple Pay first)
//   Android -> Transak Expo SDK (the only route to Google Pay)
// Flip USE_SDK to compare the two modes on a platform.
// The widget session is created by the backend (POST /api/onramp/transak/widget-url),
// so the Transak API secret never ships in the app.
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import {
  TransakWebView,
  Events,
  type TransakConfig,
  type OnTransakEvent,
} from "@transak/ui-expo-sdk";
import { C, FONT, TYPE } from "@/theme";
import { Button } from "@/components/ui/Button";
import { Step } from "@/components/trade/SheetParts";
import { useAuth } from "@/context";
import { getTransakWidgetUrl } from "@/services/onramp";

// true = Transak SDK (events + Google Pay), false = plain WebView (Apple Pay prop)
const USE_SDK = { ios: false, android: true };
const useSdk = Platform.OS === "ios" ? USE_SDK.ios : USE_SDK.android;

const TRANSAK_ENV =
  (process.env.EXPO_PUBLIC_TRANSAK_ENV as "staging" | "production") ??
  "staging";
const BG = "#1B2029"; // matches the dark sheet

// Transak wants the end user's public IP. The backend uses the IP it sees;
// this is only a fallback for local development, where that IP is private.
async function getPublicIp(): Promise<string | undefined> {
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    if (!res.ok) return undefined;
    const json = await res.json();
    return json?.ip ? String(json.ip) : undefined;
  } catch {
    return undefined;
  }
}
// The widget URL is single-use and valid for 5 minutes, so create a new one
// every time the checkout opens.
async function createWidgetUrl(idToken: string | null, email?: string) {
  if (!idToken) throw new Error("Please sign in again.");
  // the backend sends the USDC to this user's own Folio Solana wallet
  const res = await getTransakWidgetUrl(
    {
      email,
      color: String(C.mint),
      applePay: Platform.OS === "ios",
      userIp: await getPublicIp(),
    },
    idToken,
  );
  if (!res.data?.url) throw new Error("Transak did not return a widget URL");
  return res.data.url;
}

export function CardDeposit({
  address,
  email,
  back,
}: {
  address: string;
  email?: string; // optional, only pre-fills the widget
  back: React.ReactNode;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [done, setDone] = useState(false);
  const { idToken } = useAuth();

  const load = useCallback(async () => {
    setErr(null);
    setUrl(null);
    setLoading(true);
    try {
      setUrl(await createWidgetUrl(idToken, email));
    } catch (e: any) {
      setErr(e?.message ?? "Could not start checkout");
      setLoading(false);
    }
  }, [idToken, email]);

  useEffect(() => {
    load();
  }, [load, attempt]);

  // Events only arrive in SDK mode.
  const onTransakEvent: OnTransakEvent = (event, data) => {
    // console.log("TRANSAK EVENT:", event, data);
    switch (event) {
      case Events.TRANSAK_WIDGET_INITIALISED:
        setLoading(false);
        break;
      case Events.TRANSAK_ORDER_SUCCESSFUL:
        setDone(true);
        break;
      case Events.TRANSAK_ORDER_FAILED:
        setErr("The payment did not go through. Try again.");
        break;
      default:
        break;
    }
  };

  if (done) {
    return (
      <Step id="card-done">
        <Text style={TYPE.h2}>Payment received</Text>
        <Text style={TYPE.body}>
          Your USDC will arrive in your Folio wallet shortly. Pull down on Folio
          to refresh.
        </Text>
      </Step>
    );
  }

  return (
    <Step id="card-checkout">
      {back}
      <Text style={TYPE.h2}>Buy USDC</Text>
      <Text style={[TYPE.body, { fontSize: 13.5, marginTop: -6 }]}>
        {Platform.OS === "ios"
          ? "Pay with Apple Pay or card. USDC lands in your Folio wallet on Solana."
          : "Pay with Google Pay or card. USDC lands in your Folio wallet on Solana."}
        {TRANSAK_ENV === "staging" ? " Test mode: no real money moves." : ""}
      </Text>

      {err ? (
        <>
          <Text style={s.err}>{err}</Text>
          <Button title="Try again" onPress={() => setAttempt((n) => n + 1)} />
        </>
      ) : url ? (
        <View style={s.checkout}>
          {useSdk ? (
            <TransakWebView
              key={url}
              transakConfig={{ widgetUrl: url } as TransakConfig}
              onTransakEvent={onTransakEvent}
            />
          ) : (
            <WebView
              key={url}
              source={{ uri: url }}
              style={{ backgroundColor: BG }}
              // Props Transak asks for. Do NOT add sharedCookiesEnabled,
              // injectedJavaScript, injectedJavaScriptBeforeContentLoaded or a
              // custom userAgent, because they break Apple Pay and the
              // payment-method detection.
              {...({ enableApplePay: true } as object)}
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              javaScriptEnabled
              domStorageEnabled
              onLoadEnd={() => setLoading(false)}
            />
          )}
          {loading ? (
            <View style={s.loader} pointerEvents="none">
              <ActivityIndicator color={C.mint} />
            </View>
          ) : null}
        </View>
      ) : (
        <ActivityIndicator color={C.mint} />
      )}
    </Step>
  );
}

const s = StyleSheet.create({
  err: {
    fontFamily: FONT.sans400,
    fontSize: 12.5,
    lineHeight: 19,
    color: C.loss,
  },
  checkout: {
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
});
