import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import {
  refreshGoogleSession,
  restoreGoogleSession,
  setTokenRefresher,
  signInWithGoogle,
  signOutGoogle,
  loginWithGoogle,
} from "@/services";
import { queryClient } from "@/lib/queryClient";
import { jwtExpiresAt } from "@/lib/jwt";
import type { GoogleSession, GoogleUser, LoginResponse } from "@/types";

// Google idTokens last ~1h. Swap for a fresh one this long before it runs out.
const REFRESH_EARLY_MS = 5 * 60_000;

type AuthState = {
  user: GoogleUser | null;
  session: LoginResponse | null;
  idToken: string | null;
  initializing: boolean;
  busy: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [session, setSession] = useState<LoginResponse | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // latest token for callbacks outside React (the API client's 401 retry)
  const tokenRef = useRef<string | null>(null);
  const refreshing = useRef<Promise<string | null> | null>(null);

  const authenticate = useCallback(async (g: GoogleSession) => {
    const res = await loginWithGoogle(g.idToken);
    tokenRef.current = g.idToken;
    setUser(g.user);
    setSession(res);
    setIdToken(g.idToken);
  }, []);

  const clearSession = useCallback(() => {
    tokenRef.current = null;
    setUser(null);
    setSession(null);
    setIdToken(null);
    // drop every cached response so the next account never sees this one's data
    queryClient.clear();
  }, []);

  /** One refresh at a time; resolves to the new token, or null if it couldn't get one. */
  const refresh = useCallback((): Promise<string | null> => {
    refreshing.current ??= (async () => {
      let g: GoogleSession | null;
      try {
        g = await refreshGoogleSession();
      } catch (e) {
        // probably offline: keep the session and try again on the next 401 / foreground
        if (__DEV__) console.warn("Token refresh failed", e);
        return null;
      }
      if (!tokenRef.current) return null; // signed out while refreshing
      if (!g) {
        clearSession();
        setError("Your session expired. Sign in again.");
        return null;
      }
      tokenRef.current = g.idToken;
      setIdToken(g.idToken);
      return g.idToken;
    })().finally(() => {
      refreshing.current = null;
    });
    return refreshing.current;
  }, [clearSession]);

  // let request() swap a rejected token for a fresh one and retry
  useEffect(
    () =>
      setTokenRefresher(async (stale) => {
        if (!tokenRef.current) return null;
        // another request already refreshed it
        if (tokenRef.current !== stale) return tokenRef.current;
        return refresh();
      }),
    [refresh],
  );

  // refresh shortly before the token expires
  useEffect(() => {
    if (!idToken) return;
    const exp = jwtExpiresAt(idToken);
    if (!exp) return;
    const due = () => exp - REFRESH_EARLY_MS - Date.now();
    const timer = setTimeout(() => void refresh(), Math.max(0, due()));
    // timers don't run while the app is in the background: catch up on return
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && due() <= 0) void refresh();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [idToken, refresh]);

  useEffect(() => {
    (async () => {
      try {
        const g = await restoreGoogleSession();
        if (g) await authenticate(g);
      } catch (e) {
        if (__DEV__) console.warn("Session restore failed", e);
      } finally {
        setInitializing(false);
      }
    })();
  }, [authenticate]);

  const signIn = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const g = await signInWithGoogle();
      if (!g) return;
      await authenticate(g);
    } catch (e) {
      await signOutGoogle().catch(() => {});
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }, [authenticate]);

  const signOut = useCallback(async () => {
    try {
      await signOutGoogle();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo(
    () => ({
      user,
      session,
      idToken,
      initializing,
      busy,
      error,
      signIn,
      signOut,
    }),
    [user, session, idToken, initializing, busy, error, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
