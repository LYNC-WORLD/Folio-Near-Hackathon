import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useWallet } from "@/context/WalletContext";
import {
  executeIntent,
  getIntentStatus,
  getIntentTokens,
  quoteIntent,
} from "@/services/deposit";
import { HL_USDC_ASSET, findHlUsdc, findSolUsdc } from "@/lib/intentAssets";

export type DepositPhase =
  | "idle"
  | "depositing"
  | "confirming"
  | "done"
  | "error";

const POLL_INTERVAL_MS = 5_000;
const MAX_POLLS = 120; // about 10 minutes

// spot = Privy Solana USDC, perp = Hyperliquid account
const ROUTES = {
  spotToPerp: { origin: "sol", destination: "HYPERLIQUID" },
  perpToSpot: { origin: "hl", destination: "SOLANA" },
} as const;

const friendly = (m: string) =>
  /not set up/i.test(m)
    ? "Your perp account is not set up yet. Make a deposit into it first."
    : m;

/**
 * One spot <-> perp transfer through Intents: quote, execute, then poll status
 * until SUCCESS (or a refund / failure).
 */
function useTransferRequest(route: keyof typeof ROUTES) {
  const { idToken } = useAuth();
  const { walletAddress } = useWallet();
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState<DepositPhase>("idle");
  const [amount, setAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCount = useRef(0);
  const transferId = useRef<string | null>(null);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
      if (pollTimer.current) clearInterval(pollTimer.current);
    },
    [],
  );

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const fail = useCallback(
    (msg: string) => {
      stopPolling();
      if (!alive.current) return;
      setError(msg);
      setPhase("error");
    },
    [stopPolling],
  );

  const pollOnce = useCallback(async () => {
    if (!idToken || !transferId.current) return;
    pollCount.current += 1;
    try {
      const res = await getIntentStatus(transferId.current, idToken);
      const status = res.data?.status;
      if (status === "SUCCESS") {
        stopPolling();
        if (!alive.current) return;
        queryClient.invalidateQueries({ queryKey: ["walletBalance"] });
        setPhase("done");
        return;
      }
      if (status === "REFUNDED") {
        fail("The transfer was refunded. Try again.");
        return;
      }
      if (status === "FAILED") {
        fail("The transfer failed. Try again.");
        return;
      }
      // PENDING_DEPOSIT, KNOWN_DEPOSIT_TX, PROCESSING, INCOMPLETE_DEPOSIT: keep polling
      if (pollCount.current >= MAX_POLLS) {
        fail("Still processing. This is taking longer than usual.");
      }
    } catch (e) {
      if (pollCount.current >= MAX_POLLS) {
        fail(e instanceof Error ? e.message : "Couldn't confirm the transfer.");
      }
    }
  }, [idToken, queryClient, stopPolling, fail]);

  const startPolling = useCallback(() => {
    pollCount.current = 0;
    stopPolling();
    pollOnce();
    pollTimer.current = setInterval(pollOnce, POLL_INTERVAL_MS);
  }, [pollOnce, stopPolling]);

  const start = useCallback(
    async (amt: number) => {
      if (!idToken) throw new Error("Sign in first");
      setError(null);
      setAmount(amt);
      setPhase("depositing");
      try {
        const cfg = ROUTES[route];
        if (cfg.origin === "sol" && !walletAddress)
          throw new Error("Your wallet address has not loaded yet.");

        // token list is cached for 10 minutes, shared with useIntentTokens
        const tokens = (
          await queryClient.fetchQuery({
            queryKey: ["intent-tokens"],
            queryFn: () => getIntentTokens(idToken),
            staleTime: 10 * 60_000,
          })
        ).data;

        const originAsset =
          cfg.origin === "hl"
            ? (findHlUsdc(tokens)?.assetId ?? HL_USDC_ASSET)
            : findSolUsdc(tokens)?.assetId;
        if (!originAsset)
          throw new Error("This transfer is not available right now.");

        const base = {
          originAsset,
          amount: String(amt),
          destination: cfg.destination,
          // for Hyperliquid origin the server replaces this with the Privy Ethereum address
          refundTo: walletAddress ?? "unused",
        };

        // 1. dry quote: preview, no row created, no transferId
        const dry = await quoteIntent({ ...base, dry: true }, idToken);
        // 2. live quote using the slippage the server suggests for this route
        const live = await quoteIntent(
          {
            ...base,
            dry: false,
            slippageBps: dry.data.suggestedSlippageBps || 100,
          },
          idToken,
        );
        const id = live.data.transferId;
        if (!id) throw new Error("No transfer id came back. Try again.");

        // 3. execute: the backend signs the origin transfer (Privy Solana or Hyperliquid sendAsset)
        await executeIntent(id, idToken);
        if (!alive.current) return;

        transferId.current = id;
        setPhase("confirming");
        startPolling();
      } catch (e) {
        if (!alive.current) return;
        setError(
          friendly(
            e instanceof Error ? e.message : "Couldn't start the transfer.",
          ),
        );
        setPhase("error");
        throw e;
      }
    },
    [idToken, walletAddress, route, queryClient, startPolling],
  );

  const reset = useCallback(() => {
    stopPolling();
    pollCount.current = 0;
    transferId.current = null;
    setPhase("idle");
    setAmount(0);
    setError(null);
  }, [stopPolling]);

  return { phase, amount, error, start, reset };
}

/** spot wallet -> perp account */
export function useSpotToPerpDeposit() {
  const { start, ...rest } = useTransferRequest("spotToPerp");
  return { ...rest, deposit: start };
}

/** perp account -> spot wallet */
export function usePerpToSpotDeposit() {
  const { start, ...rest } = useTransferRequest("perpToSpot");
  return { ...rest, withdraw: start };
}