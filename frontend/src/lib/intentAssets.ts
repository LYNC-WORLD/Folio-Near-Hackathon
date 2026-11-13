import type { IntentToken } from "@/types/deposit";

export const HL_USDC_ASSET =
  "1cs_v1:hypercore:hip1:0x6d1e7cde53ba9467b783cb7c530ce054";

const SOL_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export const findSolUsdc = (tokens: IntentToken[]) =>
  tokens.find(
    (t) =>
      t.blockchain === "sol" &&
      t.symbol === "USDC" &&
      t.contractAddress === SOL_USDC_MINT,
  );

export const findHlUsdc = (tokens: IntentToken[]) =>
  tokens.find((t) => t.assetId === HL_USDC_ASSET);