// Card onramp step shown inside the Deposit sheet.
// MoonPay, signed on the client (TEST ONLY: move signing to a backend before production).
import { useMemo, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import * as WebBrowser from "expo-web-browser";
import CryptoJS from "crypto-js";
import { useMoonPaySdk } from "@moonpay/react-native-moonpay-sdk";
import { C, FONT, TYPE } from "@/theme";
import { Button } from "@/components/ui/Button";
import { Step } from "@/components/trade/SheetParts";

const MOONPAY_PK = process.env.EXPO_PUBLIC_MOONPAY_PK ?? "";
const MOONPAY_SK = process.env.EXPO_PUBLIC_MOONPAY_SK ?? ""; // TEST ONLY, never ship in production
const MOONPAY_ENV =
  (process.env.EXPO_PUBLIC_MOONPAY_ENV as "sandbox" | "production") ??
  "sandbox";
const MOONPAY_BASE =
  MOONPAY_ENV === "production"
    ? "https://buy.moonpay.com"
    : "https://buy-sandbox.moonpay.com";

// Matches the dark sheet.
const BG = "#1B2029";

// MoonPay signature = base64( HMAC-SHA256(secretKey, query string incl. leading "?") )
const sign = (query: string) =>
  CryptoJS.HmacSHA256(query, MOONPAY_SK).toString(CryptoJS.enc.Base64);

const signUrl = (url: string) => sign(new URL(url).search);

// Builds the full signed widget URL ourselves, for the embedded WebView.
function buildWebViewUrl(address: string, email?: string) {
  if (!MOONPAY_PK || !MOONPAY_SK) throw new Error("Missing MoonPay keys");
  const params: Record<string, string> = {
    apiKey: MOONPAY_PK,
    currencyCode: "usdc_sol", // USDC on Solana
    walletAddress: address,
    theme: "dark",
    colorCode: C.mint, // must be a hex string like #3DDC97
  };
  if (email) params.email = email;
  const query =
    "?" +
    Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&");
  return `${MOONPAY_BASE}${query}&signature=${encodeURIComponent(sign(query))}`;
}

type Mode = "webview" | "browser";

export function CardDeposit({
  address,
  email,
  back,
}: {
  address: string;
  email?: string; // optional, only pre-fills the widget
  back: React.ReactNode;
}) {
  const [mode, setMode] = useState<Mode>("webview");

  return (
    <Step id="card-checkout">
      {back}
      <Text style={TYPE.h2}>Buy USDC</Text>

      {mode === "webview" ? (
        <WebViewCheckout key="wv" address={address} email={email} />
      ) : (
        <BrowserCheckout key="br" address={address} email={email} />
      )}

      <Button
        variant="quiet"
        size="sm"
        title={
          mode === "webview"
            ? "Use Apple Pay or Google Pay instead"
            : "Back to in-app card form"
        }
        onPress={() => setMode(mode === "webview" ? "browser" : "webview")}
      />
    </Step>
  );
}

// Embedded inside the sheet. Card only, wallets are likely unavailable in a WebView.
function WebViewCheckout({
  address,
  email,
}: {
  address: string;
  email?: string;
}) {
  const [loading, setLoading] = useState(true);

  const { url, err } = useMemo(() => {
    try {
      return {
        url: buildWebViewUrl(address, email),
        err: null as string | null,
      };
    } catch (e: any) {
      return { url: null, err: e?.message ?? "Could not start checkout" };
    }
  }, [address, email]);

  if (err || !url) {
    return <Text style={s.err}>{err ?? "Could not start checkout"}</Text>;
  }

  return (
    <View style={s.checkout}>
      <WebView
        source={{ uri: url }}
        style={{ backgroundColor: BG }}
        originWhitelist={["https://*"]}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        onLoadEnd={() => setLoading(false)}
      />
      {loading ? (
        <View style={s.loader} pointerEvents="none">
          <ActivityIndicator color={C.mint} />
        </View>
      ) : null}
    </View>
  );
}

// Secure browser sheet over the app (SDK). Apple Pay and Google Pay work here.
function BrowserCheckout({
  address,
  email,
}: {
  address: string;
  email?: string;
}) {
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { openWithInAppBrowser, generateUrlForSigning, updateSignature } =
    useMoonPaySdk({
      sdkConfig: {
        flow: "buy",
        environment: MOONPAY_ENV,
        params: {
          apiKey: MOONPAY_PK,
          currencyCode: "usdc_sol",
          walletAddress: address,
          ...(email ? { email } : {}),
          theme: "dark",
          colorCode: C.mint,
        },
      },
      browserOpener: {
        open: async (url: string) => {
          await WebBrowser.openBrowserAsync(url, {
            presentationStyle:
              WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
          });
        },
      },
    });

  useEffect(() => {
    try {
      if (!MOONPAY_PK || !MOONPAY_SK) throw new Error("Missing MoonPay keys");
      const url = generateUrlForSigning({ variant: "inapp-browser" });
      if (!url) throw new Error("Could not build MoonPay URL");
      updateSignature(signUrl(url));
      setReady(true);
    } catch (e: any) {
      setErr(e?.message ?? "Could not start checkout");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (err) return <Text style={s.err}>{err}</Text>;
  if (!ready) return <ActivityIndicator color={C.mint} />;

  return (
    <>
      <Text style={[TYPE.body, { fontSize: 13.5 }]}>
        Opens MoonPay in a secure sheet, where Apple Pay and Google Pay work.
      </Text>
      <Button title="Open checkout" onPress={() => openWithInAppBrowser()} />
    </>
  );
}

const s = StyleSheet.create({
  err: {
    fontFamily: FONT.sans400,
    fontSize: 12.5,
    lineHeight: 19,
    color: C.loss,
  },
  // Dark wrapper so the widget blends into the sheet instead of showing a white box.
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
