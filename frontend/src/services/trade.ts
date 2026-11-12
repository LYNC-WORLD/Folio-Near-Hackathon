import { request } from "./api/client";

export type TradeSide = "buy" | "sell";

export type TradeRequest = {
  stockAddress: string;
  stockSymbol: string;
} & (
  | { usdcAmount: number; stockAmount?: undefined }
  | { stockAmount: number; usdcAmount?: undefined }
);

export type TradeQuoteResponse = {
  success: boolean;
  message: string;
  data: {
    usdcAmount: number;
    stockAmount: number;
  };
};

export type LimitOrderSide = "above" | "below";

export type CreateLimitOrderPayload = {
  stockAddress: string;
  usdcAmount: number;
  triggerAmount: number;
  orderSide: LimitOrderSide;
};

export type GetSpotOrdersPayload = {
  state: "active" | "past" | null;
  mint: string | null;
  limit: number | null;
  offset: number | null;
  sort: "updated_at" | "created_at" | "expires_at" | null;
  dir: "asc" | "desc" | null;
};

export type CreateLimitOrderResponse = {
  success: boolean;
  message: string;
  data: {
    id: string;
  };
};

export type LimitOrderEvent = {
  type: string;
  timestamp: number;
  txSignature: string;
  mint: string;
  amount: string;
  state: string;
};

export type LimitOrder = {
  id: string;
  userPubkey: string;
  privyWalletPubkey: string;
  inputMint: string;
  remainingInputAmount: string;
  initialInputAmount: string;
  outputMint: string;
  triggerMint: string;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
  events: LimitOrderEvent[];
  orderType: string;
  orderState: string;
  rawState: string;
  triggerCondition: LimitOrderSide;
  triggerPriceUsd: number;
  slippageBps: number;
  fillPercent: number;
  trailingBps: number | null;
  highWatermark: number | null;
  lowWatermark: number | null;
};

export type SpotOrdersResponse = {
  success: boolean;
  message: string;
  data: {
    orders: {
      orders: LimitOrder[];
      pagination: {
        total: number;
        limit: number;
        offset: number;
      };
    };
  };
};

export type CancelLimitOrderResponse = {
  success: boolean;
  message: string;
  data: {
    success: boolean;
    orderId: string;
    signature: string;
    status: string;
  };
};


export type TradeResult = {
  signature?: string;
  stockAmount?: number;
  usdcAmount?: number;
  [key: string]: unknown;
};

export type TradeResultResponse = {
  success: boolean;
  message: string;
  data: TradeResult;
};

export type RecurringBuyStock = {
  tokenAddress: string;
  price: string;
  name: string;
  decimals: number;
  symbol: string;
  imageUrl: string;
  marketOpenPrice: string;
  stockType: "USStock" | "PreIPO";
};

export type RecurringBuy = {
  id: string;
  stockAddress: string;
  userId: string;
  usdcAmount: string | null;
  stockAmount: string | null;
  buyDate: string;
  isActive: boolean;
  stock: RecurringBuyStock;
};

export type RecurringBuysResponse = {
  success: boolean;
  message: string;
  data: RecurringBuy[];
};

export type RecurringBuyRequest = {
  stockAddress: string;
  usdcAmount: string | undefined;
  stockAmount: string | undefined;
  buyDate: string;
  stockSymbol: string;
};

export type StartRecurringBuyResponse = {
  success: boolean;
  message: string;
  data: RecurringBuy;
};

export type CancelRecurringBuyRequest = {
  recurringId: string;
};

export type CancelRecurringBuyResponse = {
  success: boolean;
  message: string;
};

export const getTradeQuote = (
  side: TradeSide,
  req: TradeRequest,
  token: string,
) =>
  request<TradeQuoteResponse>(`/api/trade/get-quote-${side}`, {
    method: "POST",
    body: req,
    token,
  });

export const buyStock = (req: TradeRequest, token: string) =>
  request<TradeResultResponse>("/api/trade/stock-buy", {
    method: "POST",
    body: req,
    token,
  });

export const sellStock = (req: TradeRequest, token: string) =>
  request<TradeResultResponse>("/api/trade/stock-sell", {
    method: "POST",
    body: req,
    token,
  });

export const getRecurringBuys = (idToken: string) =>
  request<RecurringBuysResponse>("/api/user/recurring-buy-requests", {
    token: idToken,
  });

export const startRecurringBuy = (req: RecurringBuyRequest, idToken: string) =>
  request<StartRecurringBuyResponse>("/api/trade/start-recurring-buy", {
    method: "POST",
    body: req,
    token: idToken,
  });

export const cancelRecurringBuy = (recurringId: string, idToken: string) =>
  request<CancelRecurringBuyResponse>("/api/user/cancel-recurring-request", {
    method: "POST",
    body: { recurringId } satisfies CancelRecurringBuyRequest,
    token: idToken,
  });


export const createLimitOrder = (
  idToken: string,
  payload: CreateLimitOrderPayload,
) =>
  request<CreateLimitOrderResponse>(
    "/api/trade/create-limit-order",
    {
      method: "POST",
      token: idToken,
      body: payload,
    },
  );

export const getSpotOrders = (
  idToken: string,
  payload: GetSpotOrdersPayload,
) =>
  request<SpotOrdersResponse>(
    "/api/trade/get-spot-orders",
    {
      method: "POST",
      token: idToken,
      body: payload,
    },
  );

export const cancelLimitOrder = (
  idToken: string,
  orderId: string,
) =>
  request<CancelLimitOrderResponse>(
    "/api/trade/cancel-limit-order",
    {
      method: "POST",
      token: idToken,
      body: { orderId },
    },
  );

