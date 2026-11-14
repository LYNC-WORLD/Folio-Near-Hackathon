import type { ApiRes } from "@/types/deposit";
import { request } from "./api/client";

// MoonPay and Transak need secret keys, so the backend builds the signed
// URL / widget session. The app only receives the finished URL.

export const getMoonpaySellUrl = (
  body: { amount: number; redirectUrl: string; email?: string; color?: string },
  idToken: string,
) =>
  request<ApiRes<{ url: string }>>("/api/onramp/moonpay/sell-url", {
    method: "POST",
    body,
    token: idToken,
  });

export const getTransakWidgetUrl = (
  body: { email?: string; color?: string; applePay?: boolean; userIp?: string },
  idToken: string,
) =>
  request<ApiRes<{ url: string }>>("/api/onramp/transak/widget-url", {
    method: "POST",
    body,
    token: idToken,
  });
