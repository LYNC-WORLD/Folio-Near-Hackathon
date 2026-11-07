// Hyperliquid connection settings. Market data is public; trading goes through our backend
// (services/perps/tradeService), which handles signing, fees and order rounding.

export type HlEnv = "mainnet" | "testnet";

// Keep reads and trades on the same network. Testnet has different HIP-3 dex names.
export const HL_ENV: HlEnv = "mainnet";

const URLS = {
  mainnet: { http: "https://api.hyperliquid.xyz", ws: "wss://api.hyperliquid.xyz/ws" },
  testnet: { http: "https://api.hyperliquid-testnet.xyz", ws: "wss://api.hyperliquid-testnet.xyz/ws" },
} as const;

export const HL = URLS[HL_ENV];

/** HIP-3 dex that lists US stock and commodity perps. Coins look like "xyz:NVDA". */
export const STOCK_DEX = "xyz";
