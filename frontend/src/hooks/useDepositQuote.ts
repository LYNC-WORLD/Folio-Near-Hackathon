import { useEffect, useRef, useState } from "react";
import { getDepositQuote } from "../services/wallet";

const DEBOUNCE_MS = 450;

export function useDepositQuote(
  amount: number,
  idToken: string | null | undefined,
  enabled: boolean,
) {
  const [expectedUSDC, setExpectedUSDC] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reqId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);

    if (!enabled || !idToken || !amount || amount <= 0) {
      // bump reqId so any in-flight request from a moment ago gets ignored
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
        const res = await getDepositQuote(amount, idToken);
        if (myId !== reqId.current) return;
        setExpectedUSDC(res.data?.expectedUSDC ?? null);
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
  }, [amount, idToken, enabled]);

  return { expectedUSDC, loading, error };
}