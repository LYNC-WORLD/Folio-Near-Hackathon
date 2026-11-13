import type {
  ApiRes,
  IntentDeposit,
  IntentQuote,
  IntentQuoteBody,
  IntentToken,
} from "@/types/deposit";
import { request } from "./api/client";

export const getIntentTokens = (idToken: string) =>
  request<ApiRes<IntentToken[]>>("/api/deposit/intents/tokens", {
    token: idToken,
  });

export const quoteIntent = (body: IntentQuoteBody, idToken: string) =>
  request<ApiRes<IntentQuote>>("/api/deposit/intents/quote", {
    method: "POST",
    body,
    token: idToken,
  });

export const executeIntent = (transferId: string, idToken: string) =>
  request<ApiRes<IntentDeposit>>("/api/deposit/intents/execute", {
    method: "POST",
    body: { depositId:transferId },
    token: idToken,
  });

export const getIntentStatus = (transferId: string, idToken: string) =>
  request<ApiRes<IntentDeposit>>(
    `/api/deposit/intents/status?transferId=${encodeURIComponent(transferId)}`,
    { token: idToken },
  );