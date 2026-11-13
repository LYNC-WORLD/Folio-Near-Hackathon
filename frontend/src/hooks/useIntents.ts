import { useQuery } from "@tanstack/react-query";
import { getIntentStatus, getIntentTokens } from "@/services";
import { useAuth } from "@/context";
import type { IntentStatus } from "@/types/deposit";

const TERMINAL: IntentStatus[] = ["SUCCESS", "REFUNDED", "FAILED"];

export function useIntentTokens() {
  const { idToken } = useAuth();
  const query = useQuery({
    queryKey: ["intent-tokens"],
    queryFn: () => getIntentTokens(idToken as string),
    select: (res) => res.data,
    enabled: !!idToken,
    staleTime: 10 * 60_000,
  });
  return {
    tokens: query.data ?? [],
    loading: query.isPending,
    error: query.error instanceof Error ? query.error.message : null,
    reload: query.refetch,
  };
}

export function useIntentStatus(transferId?: string) {
  const { idToken } = useAuth();
  const query = useQuery({
    queryKey: ["intent-status", transferId],
    queryFn: () => getIntentStatus(transferId as string, idToken as string),
    select: (res) => res.data,
    enabled: !!idToken && !!transferId,
    refetchInterval: (q) => {
      const s = q.state.data?.data?.status;
      return s && TERMINAL.includes(s) ? false : 5_000;
    },
    refetchIntervalInBackground: false,
  });
  return {
    deposit: query.data ?? null,
    status: query.data?.status ?? null,
    error: query.error instanceof Error ? query.error.message : null,
  };
}