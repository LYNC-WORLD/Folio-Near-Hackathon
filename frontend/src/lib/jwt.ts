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
