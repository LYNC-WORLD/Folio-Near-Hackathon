import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/context/WalletContext";
import { getIntentTokens, quoteIntent } from "@/services/deposit";
import { HL_USDC_ASSET, findHlUsdc, findSolUsdc } from "@/lib/intentAssets";

const DEBOUNCE_MS = 450;

export function useDepositQuote(
  amount: number,
  dir: "in" | "out",
  idToken: string | null | undefined,
  enabled: boolean,
) {
  const queryClient = useQueryClient();
  const { walletAddress } = useWallet();

  const [expectedUSDC, setExpectedUSDC] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reqId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);

    if (!enabled || !idToken || !amount || amount <= 0) {
      reqId.current += 1;
      setExpectedUSDC(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const myId = ++reqId.current;

    timer.current = setTimeout(async () => {
      try {
        // token list is cached for 10 minutes, shared with useIntentTokens
        const tokens = (
          await queryClient.fetchQuery({
            queryKey: ["intent-tokens"],
            queryFn: () => getIntentTokens(idToken),
            staleTime: 10 * 60_000,
          })
        ).data;

        const originAsset =
          dir === "out"
            ? (findHlUsdc(tokens)?.assetId ?? HL_USDC_ASSET)
            : findSolUsdc(tokens)?.assetId;
        if (!originAsset) throw new Error("This transfer is not available right now.");

        const res = await quoteIntent(
          {
            originAsset,
            amount: String(amount),
            destination: dir === "in" ? "HYPERLIQUID" : "SOLANA",
            // for Hyperliquid origin the server replaces this with the Privy Ethereum address
            refundTo: walletAddress ?? "unused",
            dry: true,
          },
          idToken,
        );
        if (myId !== reqId.current) return;
        const out = Number(res.data?.amountOutFormatted);
        setExpectedUSDC(Number.isFinite(out) ? out : null);
      } catch (e) {
        if (myId !== reqId.current) return;
        setExpectedUSDC(null);
        setError(e instanceof Error ? e.message : "Couldn't get a quote.");
      } finally {
        if (myId === reqId.current) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [amount, dir, idToken, enabled, walletAddress, queryClient]);

  return { expectedUSDC, loading, error };
}