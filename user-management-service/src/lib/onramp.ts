import crypto from "crypto";
import net from "net";
import { env } from "../config/env";

// MoonPay (bank off-ramp) and Transak (card on-ramp).
// Both need a secret key, so the signed URL / widget session is built here
// and the app only ever receives the finished URL.

export class OnrampError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const HEX_COLOR = /^#?[0-9a-fA-F]{6}$/;

// ---------- MoonPay ----------

const MOONPAY_SELL_BASE =
  env.MOONPAY_ENV === "production"
    ? "https://sell.moonpay.com"
    : "https://sell-sandbox.moonpay.com";

export function moonpaySellUrl(opts: {
  amount: number;
  refundAddress: string;
  redirectUrl: string;
  email?: string;
  color?: string;
}): string {
  if (!env.MOONPAY_PK || !env.MOONPAY_SK) {
    throw new OnrampError(503, "Bank withdrawals are not configured");
  }
  const params: Record<string, string> = {
    apiKey: env.MOONPAY_PK,
    baseCurrencyCode: "usdc_sol", // USDC on Solana
    baseCurrencyAmount: String(opts.amount),
    refundWalletAddress: opts.refundAddress,
    redirectURL: opts.redirectUrl,
    externalTransactionId: `folio-${crypto.randomUUID()}`,
    theme: "dark",
  };
  if (opts.color && HEX_COLOR.test(opts.color)) {
    params.colorCode = opts.color.startsWith("#") ? opts.color : `#${opts.color}`;
  }
  if (opts.email) params.email = opts.email;

  const query =
    "?" +
    Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&");
  const signature = crypto
    .createHmac("sha256", env.MOONPAY_SK)
    .update(query)
    .digest("base64");
  return `${MOONPAY_SELL_BASE}${query}&signature=${encodeURIComponent(signature)}`;
}

// ---------- Transak ----------

const TRANSAK_REFRESH_TOKEN_URL =
  env.TRANSAK_ENV === "production"
    ? "https://api.transak.com/partners/api/v2/refresh-token"
    : "https://api-stg.transak.com/partners/api/v2/refresh-token";
const TRANSAK_SESSION_URL =
  env.TRANSAK_ENV === "production"
    ? "https://api-gateway.transak.com/api/v2/auth/session"
    : "https://api-gateway-stg.transak.com/api/v2/auth/session";

// Access tokens last 7 days, and refreshing invalidates the previous one,
// so keep one per process and reuse it until it is close to expiry.
let transakToken: { token: string; expiresAt: number } | null = null;

async function transakAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (transakToken && transakToken.expiresAt - 300 > now) return transakToken.token;

  const res = await fetch(TRANSAK_REFRESH_TOKEN_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-secret": env.TRANSAK_API_SECRET,
      "x-api-key": env.TRANSAK_API_KEY,
    },
    body: JSON.stringify({ apiKey: env.TRANSAK_API_KEY }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new OnrampError(502, `Transak token request failed (${res.status})`);
  const json = (await res.json()) as { data?: { accessToken?: string; expiresAt?: number } };
  const token = json?.data?.accessToken;
  if (!token) throw new OnrampError(502, "Transak did not return an access token");
  transakToken = { token, expiresAt: Number(json?.data?.expiresAt) || now + 3600 };
  return token;
}

function isPublicIp(ip: string): boolean {
  if (!net.isIP(ip)) return false;
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPublicIp(v.slice(7));
    return !(v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80"));
  }
  const [a, b] = ip.split(".").map(Number);
  return !(
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/**
 * Transak wants the end user's public IP. Prefer what the server sees
 * (proxy header, then socket). In local development that is a private
 * address, so fall back to the IP the app reported.
 */
export function pickUserIp(
  forwardedFor: string | string[] | undefined,
  socketIp: string | undefined,
  reportedIp: unknown,
): string | null {
  const forwarded = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const candidates = [
    forwarded?.split(",")[0]?.trim(),
    socketIp,
    typeof reportedIp === "string" ? reportedIp.trim() : undefined,
  ];
  for (const ip of candidates) {
    if (ip && isPublicIp(ip)) return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  }
  return null;
}

export async function transakWidgetUrl(opts: {
  walletAddress: string;
  userIp: string;
  email?: string;
  color?: string;
  applePay: boolean;
}): Promise<string> {
  if (!env.TRANSAK_API_KEY || !env.TRANSAK_API_SECRET) {
    throw new OnrampError(503, "Card deposits are not configured");
  }
  const widgetParams: Record<string, unknown> = {
    apiKey: env.TRANSAK_API_KEY,
    referrerDomain: env.TRANSAK_REFERRER,
    productsAvailed: "BUY",
    cryptoCurrencyCode: "USDC",
    network: "solana",
    walletAddress: opts.walletAddress,
    disableWalletAddressForm: true,
    colorMode: "DARK",
    hideMenu: true,
    ...(opts.applePay ? { defaultPaymentMethod: "apple_pay" } : {}),
  };
  if (opts.color && HEX_COLOR.test(opts.color)) {
    widgetParams.themeColor = opts.color.replace("#", "");
  }
  if (opts.email) widgetParams.email = opts.email;

  const session = async () =>
    fetch(TRANSAK_SESSION_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "access-token": await transakAccessToken(),
        "x-user-ip": opts.userIp,
        "x-api-key": env.TRANSAK_API_KEY,
      },
      body: JSON.stringify({ widgetParams }),
      signal: AbortSignal.timeout(15_000),
    });

  let res = await session();
  if (res.status === 401) {
    transakToken = null; // token was rotated elsewhere, get a fresh one once
    res = await session();
  }
  if (!res.ok) throw new OnrampError(502, `Transak session request failed (${res.status})`);
  const json = (await res.json()) as { data?: { widgetUrl?: string } };
  const url = json?.data?.widgetUrl;
  if (!url) throw new OnrampError(502, "Transak did not return a widget URL");
  return url;
}
