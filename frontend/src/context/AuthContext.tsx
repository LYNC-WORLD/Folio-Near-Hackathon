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
  refreshAppleSession,
  refreshGoogleSession,
  restoreAppleSession,
  restoreGoogleSession,
  setAccountTypeProvider,
  setTokenRefresher,
  signInWithApple,
  signInWithGoogle,
  signOutApple,
  signOutGoogle,
  loginWithIdToken,
} from "@/services";
import { queryClient } from "@/lib/queryClient";
import { jwtExpiresAt } from "@/lib/jwt";
import type { GoogleSession, GoogleUser, LoginResponse } from "@/types";

export type SignInMethod = "google" | "apple";

// Google idTokens last ~1h, Apple's are much shorter. Swap for a fresh one this long
// before it runs out.
const REFRESH_EARLY_MS = 5 * 60_000;
// Never refresh more often than this, so a short-lived token can't cause a loop.
const MIN_REFRESH_DELAY_MS = 30_000;

type AuthState = {
  user: GoogleUser | null;
  session: LoginResponse | null;
  idToken: string | null;
  signInMethod: SignInMethod | null;
  initializing: boolean;
  busy: SignInMethod | null;
  error: string | null;
  signIn: (method: SignInMethod) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [session, setSession] = useState<LoginResponse | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [signInMethod, setSignInMethod] = useState<SignInMethod | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [busy, setBusy] = useState<SignInMethod | null>(null);
  const [error, setError] = useState<string | null>(null);

  // latest token for callbacks outside React (the API client's 401 retry)
  const tokenRef = useRef<string | null>(null);
  const methodRef = useRef<SignInMethod | null>(null);
  const refreshing = useRef<Promise<string | null> | null>(null);

  const authenticate = useCallback(
    async (g: GoogleSession, method: SignInMethod) => {
      // console.log("[auth] authenticate", method, g.idToken);
      const res = await loginWithIdToken(g.idToken, method);
      // console.log("[auth] backend login response", res);
      methodRef.current = method;
      setSignInMethod(method);
      tokenRef.current = g.idToken;
      setUser(g.user);
      setSession(res);
      setIdToken(g.idToken);
    },
    [],
  );

  const clearSession = useCallback(() => {
    methodRef.current = null;
    setSignInMethod(null);
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
        g =
          methodRef.current === "apple"
            ? await refreshAppleSession()
            : await refreshGoogleSession();
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

  // request() is called by service modules outside React, so provide it the
  // current context login method without having those modules call useAuth().
  useEffect(() => setAccountTypeProvider(() => methodRef.current), []);

  // refresh shortly before the token expires
  useEffect(() => {
    if (!idToken) return;
    const exp = jwtExpiresAt(idToken);
    if (!exp) return;
    const due = () => exp - REFRESH_EARLY_MS - Date.now();
    const timer = setTimeout(
      () => void refresh(),
      Math.max(MIN_REFRESH_DELAY_MS, due()),
    );
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
        let method: SignInMethod = "google";
        let g = await restoreGoogleSession().catch(() => null);
        if (!g) {
          method = "apple";
          g = await restoreAppleSession().catch(() => null);
        }
        if (g) await authenticate(g, method);
      } catch (e) {
        if (__DEV__) console.warn("Session restore failed", e);
      } finally {
        setInitializing(false);
      }
    })();
  }, [authenticate]);

  const signIn = useCallback(
    async (method: SignInMethod) => {
      // console.log("[auth] signIn start", method);
      setBusy(method);
      setError(null);
      try {
        const g =
          method === "apple"
            ? await signInWithApple()
            : await signInWithGoogle();

        // console.log(
        //   "[auth] provider result",
        //   method,
        //   g ? "got session" : "null (cancelled)",
        // );

        if (!g) return;
        await authenticate(g, method);
        // console.log("[auth] backend login OK");
      } catch (e) {
        // console.log("[auth] FAILED", method, e);
        await (method === "apple" ? signOutApple() : signOutGoogle()).catch(
          () => {},
        );
        setError(e instanceof Error ? e.message : "Sign-in failed");
      } finally {
        setBusy(null);
      }
    },
    [authenticate],
  );

  const signOut = useCallback(async () => {
    try {
      await (methodRef.current === "apple" ? signOutApple() : signOutGoogle());
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo(
    () => ({
      user,
      session,
      idToken,
      signInMethod,
      initializing,
      busy,
      error,
      signIn,
      signOut,
    }),
    [
      user,
      session,
      idToken,
      signInMethod,
      initializing,
      busy,
      error,
      signIn,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
