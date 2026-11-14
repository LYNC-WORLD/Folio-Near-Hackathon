// UI destinations (the "Other chains" deposit picks one of these).
export type IntentDestination = "SOLANA" | "HYPERLIQUID";
// What the quote body accepts. EXTERNAL = send to an outside wallet.
export type QuoteDestination = IntentDestination | "EXTERNAL";

export type IntentStatus =
  | "PENDING_DEPOSIT"
  | "EXECUTING"
  | "KNOWN_DEPOSIT_TX"
  | "PROCESSING"
  | "SUCCESS"
  | "INCOMPLETE_DEPOSIT"
  | "REFUNDED"
  | "FAILED";

export type ApiRes<T> = { success: boolean; message?: string; data: T };

export type IntentToken = {
  assetId: string;
  decimals: number;
  blockchain: string;
  symbol: string;
  priceUpdatedAt: string;
  price: number;
  contractAddress?: string | null;
  coingeckoId: string;
};

export type IntentQuoteBody = {
  originAsset: string;
  amount: string; // human units, e.g. "25"
  destination: QuoteDestination;
  // required on every quote. The server replaces it when origin is Hyperliquid USDC
  refundTo: string;
  // EXTERNAL only
  destinationAsset?: string;
  recipient?: string;
  confidential?: boolean;
  dry?: boolean; // defaults to true on the server
  slippageBps?: number; // omit, 0 or negative -> server uses 100. Max 10000
};

export type IntentQuote = {
  dry: boolean;
  originAsset: string;
  destinationAsset: string;
  destination: QuoteDestination;
  amount: string;
  amountOut: string; // destination base units
  amountOutFormatted: string;
  amountOutUsd: string;
  amountInUsd: string;
  minAmountOut: string; // destination base units
  deadline: string;
  confidential: boolean;
  slippageBps: number;
  observedSlippageBps: number | null; // null when 1Click omits USD fields
  suggestedSlippageBps: number; // use this on the next quote for the same route
  canExecute: boolean;
  // live quotes only (dry: false)
  transferId?: string;
  depositAddress?: string;
  depositMemo?: string | null;
  recipient?: string;
  refundTo?: string;
  status?: IntentStatus;
  txHash?: string | null;
  createdAt?: string;
};

export type IntentDeposit = {
  transferId: string;
  originAsset: string;
  destinationAsset: string;
  destination: QuoteDestination;
  amount: string;
  depositAddress: string;
  depositMemo: string | null;
  recipient: string;
  refundTo: string;
  confidential: boolean;
  status: IntentStatus;
  txHash: string | null; // "hl:<nonce>" for Hyperliquid origin, null for external-wallet deposits
  createdAt: string;
};