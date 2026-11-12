import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { useAuth } from "@/context";

import {
  cancelLimitOrder,
  createLimitOrder,
  getSpotOrders,
  type CreateLimitOrderPayload,
  type GetSpotOrdersPayload,
} from "@/services/trade";

export const limitOrderKeys = {
  all: ["spot-orders"] as const,

  list: (
    mint: string | null,
    state: GetSpotOrdersPayload["state"],
  ) => [...limitOrderKeys.all, mint, state] as const,
};

export function useSpotOrders(
  mint: string | null,
  state: GetSpotOrdersPayload["state"] = "active",
) {
  const { idToken } = useAuth();

  const query = useQuery({
    queryKey: limitOrderKeys.list(mint, state),

    queryFn: () =>
      getSpotOrders(idToken!, {
        state,
        mint,
        limit: 50,
        offset: 0,
        sort: "created_at",
        dir: "desc",
      }),

    enabled: !!idToken && !!mint,
    refetchInterval: 15_000,
  });

  return {
    orders: query.data?.data?.orders?.orders ?? [],
    pagination: query.data?.data?.orders?.pagination,
    loading: query.isPending,
    fetching: query.isFetching,
    error:
      query.error instanceof Error
        ? query.error.message
        : null,
    reload: query.refetch,
  };
}

export function useCreateLimitOrder() {
  const { idToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateLimitOrderPayload) => {
      if (!idToken) {
        throw new Error("Please sign in again");
      }

      return createLimitOrder(idToken, payload);
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: limitOrderKeys.all,
      });

      queryClient.invalidateQueries({
        queryKey: ["stock"],
      });
    },
  });
}

export function useCancelLimitOrder() {
  const { idToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderId: string) => {
      if (!idToken) {
        throw new Error("Please sign in again");
      }

      return cancelLimitOrder(idToken, orderId);
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: limitOrderKeys.all,
      });
    },
  });
}