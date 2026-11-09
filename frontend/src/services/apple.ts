import * as AppleAuthentication from "expo-apple-authentication";
import * as SecureStore from "expo-secure-store";
import type { GoogleSession } from "@/types";
import { decodeJwt } from "@/lib/jwt";

const KEY = "apple_user";

type Saved = {
  id: string;
  givenName: string | null;
  familyName: string | null;
};

async function readSaved(): Promise<Saved | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function toSession(
  c: AppleAuthentication.AppleAuthenticationCredential,
  prev: Saved | null,
): GoogleSession {
  if (!c.identityToken) throw new Error("Apple did not return an identity token.");

  const same = prev?.id === c.user ? prev : null;
  const givenName = c.fullName?.givenName ?? same?.givenName ?? null;
  const familyName = c.fullName?.familyName ?? same?.familyName ?? null;

  void SecureStore.setItemAsync(
    KEY,
    JSON.stringify({ id: c.user, givenName, familyName } satisfies Saved),
  );

  const claims = decodeJwt(c.identityToken);
  return {
    idToken: c.identityToken,
    user: {
      id: c.user,
      name: [givenName, familyName].filter(Boolean).join(" ") || null,
      email: c.email ?? claims.email ?? "",
      photo: null,
      givenName,
      familyName,
    },
  } as GoogleSession;
}

export const isAppleAvailable = () => AppleAuthentication.isAvailableAsync();

// Returns null if the user cancelled
export async function signInWithApple(): Promise<GoogleSession | null> {
  try {
    const c = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (__DEV__) {
      console.log("APPLE credential", {
        user: c.user,
        email: c.email,
        fullName: c.fullName,
        hasIdentityToken: !!c.identityToken,
        hasAuthorizationCode: !!c.authorizationCode,
        realUserStatus: c.realUserStatus,
      });
      console.log("APPLE identityToken", c.identityToken);
      if (c.identityToken) {
        console.log("APPLE claims", decodeJwt(c.identityToken));
      }
    }

    return toSession(c, await readSaved());
  } catch (e: any) {
    if (__DEV__) console.log("APPLE ERROR", e?.code, e?.message, JSON.stringify(e));
    if (e?.code === "ERR_REQUEST_CANCELED") return null;
    throw e;
  }
}

// Fresh identity token without any UI. Null if there is no valid Apple sign-in.
export async function refreshAppleSession(): Promise<GoogleSession | null> {
  const prev = await readSaved();
  if (!prev) return null;
  const state = await AppleAuthentication.getCredentialStateAsync(prev.id);
  if (
    state !== AppleAuthentication.AppleAuthenticationCredentialState.AUTHORIZED
  ) {
    await signOutApple();
    return null;
  }
  const c = await AppleAuthentication.refreshAsync({ user: prev.id });
  return toSession(c, prev);
}

export const restoreAppleSession = refreshAppleSession;

export async function signOutApple(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY).catch(() => {});
}