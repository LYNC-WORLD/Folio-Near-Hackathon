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

// ---------- search ----------

/** What /api/perp-trade/search returns per market: no id, assetId or leverage. */
export type PerpSearchItem = Pick<
  PerpMarketApi,
  "marketName" | "marketSymbol" | "price" | "imageUrl" | "changeInPrice"
> &
  Partial<PerpMarketApi>;

export type PerpSearchPage = {
  items: PerpSearchItem[];
  hasMore: boolean;
  total: number | null;
  page: number;
};

// The list comes back as `stocks` (not `data`); the other keys are fallbacks.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickList(res: any): PerpSearchItem[] {
  const d = res?.data;
  if (Array.isArray(d)) return d;
  for (const k of [
    "stocks",
    "markets",
    "items",
    "results",
    "perpMarkets",
    "list",
  ]) {
    if (Array.isArray(d?.[k])) return d[k];
    if (Array.isArray(res?.[k])) return res[k];
  }
  return [];
}

/** GET /api/perp-trade/search?q=&page=&limit= */
export async function searchPerpMarkets({
  q,
  page = 1,
  limit = 10,
}: {
  q: string;
  page?: number;
  limit?: number;
}): Promise<PerpSearchPage> {
  const qs = [
    `q=${encodeURIComponent(q.trim())}`,
    `page=${page}`,
    `limit=${limit}`,
  ].join("&");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = await request<unknown>(`/api/perp-trade/search?${qs}`);
  const items = pickList(res);
  if (__DEV__ && items.length === 0) {
    // helps when the response shape differs from what pickList expects
    console.log("searchPerpMarkets: no list found in response", res);
  }

  const meta = res?.pagination ?? res?.meta ?? res?.data?.pagination;
  let hasMore = items.length >= limit; // no paging info: a full page may have a next one
  let total: number | null = null;
  if (meta) {
    if (typeof meta.total === "number") total = meta.total;
    if (typeof meta.hasMore === "boolean") hasMore = meta.hasMore;
    else if (typeof meta.hasNextPage === "boolean") hasMore = meta.hasNextPage;
    else if (typeof meta.totalPages === "number") hasMore = page < meta.totalPages;
    else if (total != null) hasMore = page * limit < total;
  }
  // an empty page is always the end, whatever the paging info says
  if (items.length === 0) hasMore = false;
  return { items, hasMore, total, page };
}