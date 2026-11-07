// Perp trading calls to OUR backend (/api/perp-trade/*). The backend holds each user's
// Hyperliquid agent key, signs and forwards the orders. The app never holds a key.

import { request } from "@/services/api/client";

// Orders go through our backend and on to Hyperliquid: give them longer than plain reads,
// since a timeout leaves the user not knowing whether the order went through.
const ORDER_TIMEOUT_MS = 30_000;

export interface PlaceOrderBase {
  stockSymbol: string;
  dollarSize: number;
  leverage: number;
  isBuy: boolean;
  margin: "ISOLATED" | "CROSS";
  tpPrice: number | undefined;
  slPrice: number | undefined;
  tpPercent: number | undefined;
  slPercent: number | undefined;
  /** client order id: the same id on a retry lets the backend refuse a duplicate */
  cloid: `0x${string}`;
}
export type PlaceMarketOrder = PlaceOrderBase;
export interface PlaceLimitOrder extends PlaceOrderBase {
  limitPrice: number;
}

export interface PositionApi {
  coin: string; // "xyz:NVDA"
  szi: string; // signed: negative = short
  leverage: { type: "cross" | "isolated"; value: number };
  entryPx: string;
  positionValue: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  liquidationPx: string | null;
  marginUsed: string;
  maxLeverage: number;
  cumFunding: { allTime: string; sinceOpen: string; sinceChange: string };
}

export interface PositionResponse {
  type: "oneWay" | string;
  position: PositionApi | null;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface PlaceTpSlPayload {
  stockSymbol: string;
  orderSize?: number; // omit = whole position
  tpPrice?: number;
  slPrice?: number;
  tpPercent?: number;
  slPercent?: number;
}

export interface OrderResult {
  status: "filled" | "resting" | "error";
  oid?: number;
  avgPx?: string;
  totalSz?: string;
  error?: string;
}

export interface OpenOrderInner {
  coin: string; // "xyz:NVDA"
  side: "A" | "B"; // A = ask (sell), B = bid (buy)
  limitPx: string;
  sz: string; // "0.0" can mean "whole position" for positionTpsl orders
  oid: number;
  timestamp: number; // ms
  triggerCondition: string; // "Price above 296.4" or "N/A"
  isTrigger: boolean;
  triggerPx: string;
  children: unknown[];
  isPositionTpsl: boolean;
  reduceOnly: boolean;
  orderType: string; // "Limit" | "Stop Market" | "Stop Limit" | "Take Profit Market" | "Take Profit Limit" | ...
  origSz: string;
  tif: string | null;
  cloid: string | null;
}

/** One row of /api/perp-trade/open-orders and orders-by-symbol. */
export interface OpenOrderApi {
  status: string; // "order"
  order: {
    order: OpenOrderInner;
    status: string; // "open"
    statusTimestamp: number;
  };
}

export interface CancelPerpOrderPayload {
  assetSymbol: string;
  orderId: string;
}

export const tradeService = {
  getAllPositions: (idToken: string) =>
    request<ApiResponse<PositionResponse[]>>("/api/perp-trade/positions", {
      method: "GET",
      token: idToken,
    }),

  placeMarketOrder: (payload: PlaceMarketOrder, idToken: string) =>
    request<ApiResponse<OrderResult>>("/api/perp-trade/market-order", {
      method: "POST",
      token: idToken,
      body: payload,
      timeoutMs: ORDER_TIMEOUT_MS,
    }),

  placeLimitOrder: (payload: PlaceLimitOrder, idToken: string) =>
    request<ApiResponse<OrderResult>>("/api/perp-trade/limit-order", {
      method: "POST",
      token: idToken,
      body: payload,
      timeoutMs: ORDER_TIMEOUT_MS,
    }),

  closePosition: (payload: { stockSymbol: string }, idToken: string) =>
    request<ApiResponse<{ status: string }>>("/api/perp-trade/close-position", {
      method: "POST",
      token: idToken,
      body: payload,
    }),

  placeTpSlOrders: (payload: PlaceTpSlPayload, idToken: string) =>
    request<ApiResponse<{ status: string }>>(
      "/api/perp-trade/place-tp-sl-orders",
      { method: "POST", token: idToken, body: payload },
    ),
  getAllOrders: (idToken: string) =>
    request<ApiResponse<OpenOrderApi[]>>("/api/perp-trade/open-orders", {
      method: "GET",
      token: idToken,
    }),
  cancelPerpOrder: (payload: CancelPerpOrderPayload, idToken: string) =>
    request<ApiResponse<unknown>>("/api/perp-trade/cancel-order", {
      method: "POST",
      token: idToken,
      body: payload,
    }),
};

/** Throws on success:false so hooks can just await. */
export async function unwrap<T>(p: Promise<ApiResponse<T>>): Promise<T> {
  const res = await p;
  if (!res?.success) throw new Error(res?.message ?? "Request failed");
  return res.data as T;
}
