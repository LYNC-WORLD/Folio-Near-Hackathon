import {
  IndexFundsResponse,
  StockDetailResponse,
  StocksResponse,
} from "@/types";
import { request } from "./api/client";

export type StockCategory = "us-stock" | "pre-ipo" | "index-fund";

// URL segment per category. The index-funds list endpoint is plural, so the
// detail route is probably too. Confirm with the backend before relying on it.
const CATEGORY_PATH: Record<StockCategory, string> = {
  "us-stock": "us-stock",
  "pre-ipo": "pre-ipo",
  "index-fund": "index-funds",
};

export const getStocks = (
  category: Exclude<StockCategory, "index-fund">,
  idToken: string,
) =>
  request<StocksResponse>(`/api/stocks/${CATEGORY_PATH[category]}`, {
    token: idToken,
  });

export const getStockBySymbol = (
  category: StockCategory,
  symbol: string,
  idToken: string,
) =>
  request<StockDetailResponse>(
    `/api/stocks/${CATEGORY_PATH[category]}/${symbol}`,
    { token: idToken },
  );

export const getIndexFunds = (idToken: string) =>
  request<IndexFundsResponse>("/api/stocks/index-funds", { token: idToken });