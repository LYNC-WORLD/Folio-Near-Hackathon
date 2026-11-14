export type IntentDestination = "SOLANA" | "HYPERLIQUID";

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
  priceUpdatedAt: String;
  price: number;
  contractAddress?: string | null;
  coingeckoId: String;
};

export type IntentQuoteBody = {
  originAsset: string;
  amount: string; // human units, e.g. "25"
  destination: IntentDestination;
  refundTo: string;
  confidential?: boolean;
  dry?: boolean;
  slippageBps?: number;
};

export type IntentQuote = {
  dry: boolean;
  originAsset: string;
  destinationAsset: string;
  destination: IntentDestination;
  amount: string;
  amountOut: string;
  amountOutFormatted: string;
  amountOutUsd: string;
  minAmountOut: string;
  deadline: string;
  confidential: boolean;
  canExecute: boolean;
  transferId?: string;
  depositAddress?: string;
  depositMemo?: string | null;
  recipient?: string;
  refundTo?: string;
  status?: IntentStatus;
  txHash?: string | null;
  createdAt?: string;
  amountInUsd?: string;
  slippageBps?: number;
  observedSlippageBps?: number;
  suggestedSlippageBps?: number;
};

export type IntentDeposit = {
  transferId: string;
  originAsset: string;
  destinationAsset: string;
  destination: IntentDestination;
  amount: string;
  depositAddress: string;
  depositMemo: string | null;
  recipient: string;
  refundTo: string;
  confidential: boolean;
  status: IntentStatus;
  txHash: string | null;
  createdAt: string;
};