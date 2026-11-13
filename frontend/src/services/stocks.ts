import {
  IndexFundsResponse,
  Stock,
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

// our category → the `type` param of /api/stocks/search
export type StockType = "USStock" | "PreIPO" | "IndexFunds";
const TYPE_PARAM: Record<StockCategory, StockType> = {
  "us-stock": "USStock",
  "pre-ipo": "PreIPO",
  "index-fund": "IndexFunds",
};

export type ListCategory = Exclude<StockCategory, "index-fund">;

export const getStocks = (category: ListCategory, idToken: string) =>
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

// ---------- search ----------

export type SearchStocksParams = {
  /** search text; omit or leave empty to just list */
  q?: string;
  /** omit to search every type */
  category?: StockCategory;
  /** starts at 1 */
  page?: number;
  limit?: number;
};

export type SearchPage = {
  items: Stock[];
  hasMore: boolean;
  page: number;
};

// The search response's exact shape isn't pinned down yet, so read it
// defensively: the list can be `data`, or sit under data.stocks / items / …
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickList(res: any): Stock[] {
  const d = res?.data;
  if (Array.isArray(d)) return d;
  for (const k of ["stocks", "items", "results", "data", "list"]) {
    if (Array.isArray(d?.[k])) return d[k];
    if (Array.isArray(res?.[k])) return res[k];
  }
  return [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickHasMore(res: any, page: number, limit: number, count: number) {
  const d = res?.data;
  const meta =
    res?.pagination ??
    res?.meta ??
    d?.pagination ??
    d?.meta ??
    (d && !Array.isArray(d) ? d : undefined);
  if (meta) {
    if (typeof meta.hasNextPage === "boolean") return meta.hasNextPage;
    if (typeof meta.hasMore === "boolean") return meta.hasMore;
    const pages = meta.totalPages ?? meta.pages ?? meta.total_pages;
    if (typeof pages === "number") return page < pages;
    const total = meta.total ?? meta.totalCount ?? meta.count;
    if (typeof total === "number") return page * limit < total;
  }
  // no paging info: a full page means there may be another one
  return count >= limit;
}

/** GET /api/stocks/search?q=&type=&page=&limit= */
export async function searchStocks(
  p: SearchStocksParams,
  idToken: string,
): Promise<SearchPage> {
  const page = p.page ?? 1;
  const limit = p.limit ?? 10;
  const qs: string[] = [];
  if (p.q?.trim()) qs.push(`q=${encodeURIComponent(p.q.trim())}`);
  if (p.category) qs.push(`type=${TYPE_PARAM[p.category]}`);
  qs.push(`page=${page}`);
  qs.push(`limit=${limit}`);

  const res = await request<unknown>(`/api/stocks/search?${qs.join("&")}`, {
    token: idToken,
  });
  const items = pickList(res);
  if (__DEV__ && items.length === 0) {
    // helps when the response shape differs from what pickList expects
    // console.log("searchStocks: no list found in response", res);
  }
  return { items, hasMore: pickHasMore(res, page, limit, items.length), page };
}