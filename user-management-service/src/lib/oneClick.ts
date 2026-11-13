import { env } from "../config/env";

export const HYPERLIQUID_USDC_ASSET =
  "1cs_v1:hypercore:hip1:0x6d1e7cde53ba9467b783cb7c530ce054";
export const SOLANA_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const ETHEREUM_USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

const MIN_NOTIONAL_USD = 20;
const TOKEN_CACHE_MS = 60_000;

export class OneClickError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export type OneClickToken = {
  assetId: string;
  decimals: number;
  blockchain: string;
  symbol: string;
  price?: number;
  contractAddress?: string;
};

export type OneClickQuote = {
  amountIn?: string;
  amountInUsd?: string;
  amountOut?: string;
  amountOutUsd?: string;
  amountOutFormatted?: string;
  minAmountOut?: string;
  depositAddress?: string;
  depositMemo?: string;
  deadline?: string;
};

type QuoteArgs = {
  dry: boolean;
  originAsset: string;
  destinationAsset: string;
  amount: string;
  recipient: string;
  refundTo: string;
  slippageTolerance: number;
  deadline: string;
  confidential: boolean;
};

let tokenCache: { at: number; tokens: OneClickToken[] } | null = null;

function headers(): Record<string, string> {
  const result: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "folio-be",
  };
  if (env.ONE_CLICK_JWT) result.Authorization = `Bearer ${env.ONE_CLICK_JWT}`;
  return result;
}

async function oneClick(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${env.ONE_CLICK_BASE_URL}${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message =
      typeof body?.message === "string" ? body.message : text || response.statusText;
    throw new OneClickError(response.status, message);
  }
  return body;
}

export function toSmallestUnit(amount: string, decimals: number): string {
  if (!/^\d+(\.\d+)?$/.test(amount)) throw new Error("invalid amount");
  const [whole, frac = ""] = amount.split(".");
  if (frac.length > decimals) throw new Error("too many decimal places");
  const padded = frac.padEnd(decimals, "0");
  return (BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0")).toString();
}

export const DEFAULT_SLIPPAGE_BPS = 100;

export function slippageAdvice(
  amountInUsd: string | undefined,
  amountOutUsd: string | undefined,
): { observedSlippageBps: number | null; suggestedSlippageBps: number } {
  const amountIn = Number(amountInUsd);
  const amountOut = Number(amountOutUsd);
  if (!Number.isFinite(amountIn) || !Number.isFinite(amountOut) || amountIn <= 0) {
    return { observedSlippageBps: null, suggestedSlippageBps: DEFAULT_SLIPPAGE_BPS };
  }
  const observedSlippageBps = Math.max(
    0,
    Math.ceil((1 - amountOut / amountIn) * 10_000 - 1e-9),
  );
  const suggestedSlippageBps = Math.min(
    10_000,
    Math.max(DEFAULT_SLIPPAGE_BPS, observedSlippageBps + 50),
  );
  return { observedSlippageBps, suggestedSlippageBps };
}

export function notionalUsd(amount: number, token: OneClickToken): number {
  if (typeof token.price === "number" && token.price > 0) return amount * token.price;
  return amount;
}

export function meetsMinimum(amount: number, token: OneClickToken): boolean {
  return notionalUsd(amount, token) + 1e-9 >= MIN_NOTIONAL_USD;
}

export function isHyperliquidUsdc(token: OneClickToken): boolean {
  return token.assetId === HYPERLIQUID_USDC_ASSET;
}

export function privySendChain(token: OneClickToken): "solana" | "ethereum" | null {
  if (token.symbol !== "USDC") return null;
  if (token.blockchain === "sol" && token.contractAddress === SOLANA_USDC_MINT) {
    return "solana";
  }
  if (
    token.blockchain === "eth" &&
    token.contractAddress?.toLowerCase() === ETHEREUM_USDC
  ) {
    return "ethereum";
  }
  return null;
}

export function solanaUsdc(tokens: OneClickToken[]): OneClickToken | undefined {
  return tokens.find(
    (token) =>
      token.blockchain === "sol" &&
      token.symbol === "USDC" &&
      token.contractAddress === SOLANA_USDC_MINT,
  );
}

export async function getTokens(): Promise<OneClickToken[]> {
  if (tokenCache && Date.now() - tokenCache.at < TOKEN_CACHE_MS) return tokenCache.tokens;
  const body = (await oneClick("/v0/tokens")) as OneClickToken[];
  const tokens = body.filter((token) => token.assetId && token.symbol);
  tokenCache = { at: Date.now(), tokens };
  return tokens;
}

export async function quote(args: QuoteArgs): Promise<OneClickQuote> {
  const payload: Record<string, unknown> = {
    dry: args.dry,
    swapType: "EXACT_INPUT",
    originAsset: args.originAsset,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: args.destinationAsset,
    amount: args.amount,
    recipient: args.recipient,
    recipientType: "DESTINATION_CHAIN",
    refundTo: args.refundTo,
    refundType: "ORIGIN_CHAIN",
    slippageTolerance: args.slippageTolerance,
    deadline: args.deadline,
  };
  if (args.confidential) payload.confidentiality = "basic";
  const body = (await oneClick("/v0/quote", {
    method: "POST",
    body: JSON.stringify(payload),
  })) as { quote?: OneClickQuote };
  if (!body.quote) throw new OneClickError(502, "quote missing from 1Click response");
  return body.quote;
}

export async function submitDepositTx(
  depositAddress: string,
  txHash: string,
  depositMemo?: string | null,
): Promise<void> {
  await oneClick("/v0/deposit/submit", {
    method: "POST",
    body: JSON.stringify({
      depositAddress,
      txHash,
      ...(depositMemo ? { depositMemo } : {}),
    }),
  });
}

export async function getStatus(
  depositAddress: string,
  depositMemo?: string | null,
): Promise<{ status: string }> {
  const params = new URLSearchParams({ depositAddress });
  if (depositMemo) params.set("depositMemo", depositMemo);
  const body = (await oneClick(`/v0/status?${params.toString()}`)) as {
    status?: string;
  };
  if (!body.status) throw new OneClickError(502, "status missing from 1Click response");
  return { status: body.status };
}
