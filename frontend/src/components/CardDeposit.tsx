// Card onramp step shown inside the Deposit sheet. Transak, embedded in the sheet.
//   iOS     -> plain WebView with enableApplePay (Apple Pay first)
//   Android -> Transak Expo SDK (the only route to Google Pay)
// Flip USE_SDK to compare the two modes on a platform.
// TEST ONLY: the API secret and both Transak API calls run on the client.
// Move the two calls in createWidgetUrl() to a backend before production.
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

// true = Transak SDK (events + Google Pay), false = plain WebView (Apple Pay prop)
const USE_SDK = { ios: false, android: true };
const useSdk = Platform.OS === "ios" ? USE_SDK.ios : USE_SDK.android;

const API_KEY = process.env.EXPO_PUBLIC_TRANSAK_API_KEY ?? "";
const API_SECRET = process.env.EXPO_PUBLIC_TRANSAK_API_SECRET ?? ""; // TEST ONLY
const TRANSAK_ENV =
  (process.env.EXPO_PUBLIC_TRANSAK_ENV as "staging" | "production") ??
  "staging";

// Staging URLs are from Transak's docs. The production ones follow the same
// pattern, but confirm them in the docs before you switch.
const REFRESH_TOKEN_URL =
  TRANSAK_ENV === "production"
    ? "https://api.transak.com/partners/api/v2/refresh-token"
    : "https://api-stg.transak.com/partners/api/v2/refresh-token";
const SESSION_URL =
  TRANSAK_ENV === "production"
    ? "https://api-gateway.transak.com/api/v2/auth/session"
    : "https://api-gateway-stg.transak.com/api/v2/auth/session";

const REFERRER = "app.folio.money"; // mobile apps use the package name
const BG = "#1B2029"; // matches the dark sheet

// Access tokens last 7 days. Calling refresh again invalidates the previous
// token, so keep one in memory and reuse it until it expires.
let cached: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt - 300 > now) return cached.token;

  const res = await fetch(REFRESH_TOKEN_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-secret": API_SECRET,
      "x-api-key": API_KEY,
    },
    body: JSON.stringify({ apiKey: API_KEY }),
  });
  if (!res.ok) throw new Error(`Transak token request failed (${res.status})`);
  const json = await res.json();
  const token = json?.data?.accessToken as string | undefined;
  if (!token) throw new Error("Transak did not return an access token");
  cached = { token, expiresAt: Number(json?.data?.expiresAt) || now + 3600 };
  return token;
}

// Transak wants the end user's public IP on the session call.
// In production your backend should forward the real client IP instead.
async function getPublicIp(): Promise<string> {
  const res = await fetch("https://api.ipify.org?format=json");
  if (!res.ok) throw new Error("Could not detect your IP address");
  const json = await res.json();
  if (!json?.ip) throw new Error("Could not detect your IP address");
  return String(json.ip);
}
// The widget URL is single-use and valid for 5 minutes, so create a new one
// every time the checkout opens.
async function createWidgetUrl(address: string, email?: string) {
  if (!API_KEY || !API_SECRET) throw new Error("Missing Transak keys");
  const accessToken = await getAccessToken();
  const userIp = await getPublicIp();

  const widgetParams: Record<string, unknown> = {
    apiKey: API_KEY,
    referrerDomain: REFERRER,
    productsAvailed: "BUY",
    cryptoCurrencyCode: "USDC",
    network: "solana",
    walletAddress: address,
    disableWalletAddressForm: true,
    themeColor: String(C.mint).replace("#", ""), // if the color doesn't apply, try String(C.mint)
    colorMode: "DARK",
    hideMenu: true,
    // Apple Pay first on iOS. The user can still switch. Confirm the exact
    // payment-method id in Transak's payment method list if it isn't preselected.
    ...(Platform.OS === "ios" ? { defaultPaymentMethod: "apple_pay" } : {}),
  };
  if (email) widgetParams.email = email;

  const res = await fetch(SESSION_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "access-token": accessToken,
      "x-user-ip": userIp,
      "x-api-key": API_KEY,
    },
    body: JSON.stringify({ widgetParams }),
  });
  if (!res.ok) {
    if (res.status === 401) cached = null; // force a fresh token next time
    throw new Error(`Transak session request failed (${res.status})`);
  }
  const json = await res.json();
  const url = json?.data?.widgetUrl as string | undefined;
  if (!url) throw new Error("Transak did not return a widget URL");
  return url;
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

  const load = useCallback(async () => {
    setErr(null);
    setUrl(null);
    setLoading(true);
    try {
      setUrl(await createWidgetUrl(address, email));
    } catch (e: any) {
      setErr(e?.message ?? "Could not start checkout");
      setLoading(false);
    }
  }, [address, email]);

  useEffect(() => {
    load();
  }, [load, attempt]);

  // Events only arrive in SDK mode.
  const onTransakEvent: OnTransakEvent = (event, data) => {
    console.log("TRANSAK EVENT:", event, data);
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
