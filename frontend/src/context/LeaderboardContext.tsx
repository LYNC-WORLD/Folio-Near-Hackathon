import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "./index";
import {
  getMyPerpLeaderboard,
  getPerpLeaderboard,
  MyPerpLeaderboard,
  PerpLeaderboardEntry,
} from "@/services/leaderboard";
import { getUserItem, setUserItem } from "@/lib/userStorage";

// v2: stored per user. The old shared v1 cache is left behind on purpose, it may hold
// another account's rank.
const CACHE_KEY = "folio.perpLeaderboard.v2";

type Board = {
  entries: PerpLeaderboardEntry[];
  me: MyPerpLeaderboard | null;
  totalRanked: number;
};

type Value = Board & {
  loading: boolean; // true only when there is nothing to show yet
  refreshing: boolean; // background refetch in progress
  error: string | null;
  refresh: () => Promise<void>;
};

const Ctx = createContext<Value | null>(null);

export function LeaderboardProvider({ children }: { children: ReactNode }) {
  const { idToken, user } = useAuth();
  const userId = user?.id;

  // paint this user's last board from disk while the network request runs
  const [cached, setCached] = useState<Board | null>(null);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setCached(null);
    if (!userId) return;
    let live = true;
    getUserItem(CACHE_KEY, userId)
      .then((raw) => live && raw && setCached(JSON.parse(raw)))
      .catch(() => {})
      .finally(() => live && setHydrated(true));
    return () => {
      live = false;
    };
  }, [userId]);

  // refetches on app foreground via focusManager (App.tsx), at most once a minute
  const query = useQuery({
    queryKey: ["perpLeaderboard", userId],
    queryFn: async (): Promise<Board> => {
      const [board, mine] = await Promise.all([
        getPerpLeaderboard(idToken!, { limit: 50, offset: 0 }),
        getMyPerpLeaderboard(idToken!),
      ]);
      const fresh = {
        entries: board.data.entries,
        totalRanked: board.data.totalRanked,
        me: mine.data,
      };
      setUserItem(CACHE_KEY, userId!, JSON.stringify(fresh)).catch(() => {});
      return fresh;
    },
    enabled: !!idToken && !!userId,
    staleTime: 60_000,
  });

  const board = query.data ?? cached;
  const error = query.error instanceof Error ? query.error.message : null;

  const value = useMemo<Value>(
    () => ({
      entries: board?.entries ?? [],
      me: board?.me ?? null,
      totalRanked: board?.totalRanked ?? 0,
      loading: !board?.entries.length && (!hydrated || (query.isFetching && !error)),
      refreshing: query.isFetching,
      error,
      refresh: () => query.refetch().then(() => {}),
    }),
    [board, hydrated, query.isFetching, error, query.refetch],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLeaderboard() {
  const v = useContext(Ctx);
  if (!v)
    throw new Error("useLeaderboard must be used inside LeaderboardProvider");
  return v;
}
