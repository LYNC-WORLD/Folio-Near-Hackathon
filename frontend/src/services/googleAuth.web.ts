import * as AuthSession from "expo-auth-session";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import type { GoogleSession } from "@/types";
import { ENV } from "@/config";
import { decodeJwt, jwtExpiresAt } from "@/lib/jwt";

WebBrowser.maybeCompleteAuthSession();

const STORAGE_KEY = "google_session";

function toSession(idToken: string): GoogleSession {
  const c = decodeJwt(idToken);
  return {
    idToken,
    user: {
      id: c.sub,
      name: c.name ?? null,
      email: c.email,
      photo: c.picture ?? null,
      givenName: c.given_name ?? null,
      familyName: c.family_name ?? null,
    },
  } as GoogleSession;
}

// Returns null if the user cancelled
export async function signInWithGoogle(): Promise<GoogleSession | null> {
  const discovery = await AuthSession.fetchDiscoveryAsync(
    "https://accounts.google.com"
  );

 const request = new AuthSession.AuthRequest({
  clientId: ENV.GOOGLE_WEB_CLIENT_ID,
  redirectUri: AuthSession.makeRedirectUri(),
  responseType: AuthSession.ResponseType.IdToken,
  scopes: ["openid", "profile", "email"],
  usePKCE: false, 
  extraParams: {
    nonce: Crypto.randomUUID(),
    prompt: "select_account",
  },
});

  const result = await request.promptAsync(discovery);

  if (result.type !== "success") return null; // cancelled or dismissed

  const idToken = result.params.id_token;
  if (!idToken) {
    throw new Error("Google did not return an idToken. Check webClientId.");
  }

  const session = toSession(idToken);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {}
  return session;
}

// Returns null if there is no previous (or an expired) session
export async function restoreGoogleSession(): Promise<GoogleSession | null> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as GoogleSession;
    const exp = jwtExpiresAt(session.idToken);
    if (!exp || exp < Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

// The implicit web flow has no refresh token, so the stored idToken is all there is:
// still valid -> keep it, expired -> null (the user signs in again).
export const refreshGoogleSession = restoreGoogleSession;

export async function signOutGoogle(): Promise<void> {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}