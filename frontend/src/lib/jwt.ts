// Reads a JWT's payload without verifying it. Only for client-side hints like
// "when does this token expire" — the backend is what checks the signature.
export function decodeJwt(token: string): Record<string, any> {
  const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  const json = decodeURIComponent(
    atob(payload)
      .split("")
      .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
      .join(""),
  );
  return JSON.parse(json);
}

/** ms timestamp the token expires at, or null if it can't be read */
export function jwtExpiresAt(token: string): number | null {
  try {
    const { exp } = decodeJwt(token);
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

/**
 * Client-side sanity check on a Google idToken's claims: issued by Google, for this app,
 * not expired, and (on sign-in) answering this request's nonce. Returns what's wrong, or
 * null. This does NOT check the signature — the backend must verify every token itself.
 */
export function googleIdTokenProblem(
  token: string,
  expect: { clientId: string; nonce?: string; now?: number },
): string | null {
  let c: Record<string, any>;
  try {
    c = decodeJwt(token);
  } catch {
    return "unreadable token";
  }
  if (!GOOGLE_ISSUERS.includes(c.iss)) return "not issued by Google";
  if (c.aud !== expect.clientId) return "issued for a different app";
  if (typeof c.exp !== "number" || c.exp * 1000 < (expect.now ?? Date.now()))
    return "expired";
  if (expect.nonce !== undefined && c.nonce !== expect.nonce)
    return "nonce mismatch";
  return null;
}
