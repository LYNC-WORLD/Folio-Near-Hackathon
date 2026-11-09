import { request } from "@/services/api/client";

export type PerpMarketApi = {
  id: string;
  marketName: string;
  assetId: string;
  marketSymbol: string;
  price: string; // string from the API
  changeInPrice: string; // string, e.g. "0.3367"
  maxLeverage: number;
  imageUrl: string;
  szDecimals: number;
};

export type PerpMarketsPagination = {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type PerpMarketsResponse = {
  success: boolean;
  message: string;
  data: PerpMarketApi[];
  pagination: PerpMarketsPagination;
};

export const getPerpMarkets = ({
  limit = 20,
  offset = 0,
}: { limit?: number; offset?: number } = {}) =>
  request<PerpMarketsResponse>(
    `/api/stocks/perp-markets?limit=${limit}&offset=${offset}`,
  );