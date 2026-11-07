import { decodeJwt, googleIdTokenProblem, jwtExpiresAt } from "../jwt";

const b64url = (o: object) =>
  btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const token = (payload: object) => `${b64url({ alg: "none" })}.${b64url(payload)}.sig`;

describe("jwt", () => {
  it("reads the payload", () => {
    expect(decodeJwt(token({ sub: "1" })).sub).toBe("1");
  });

  it("returns expiry in ms", () => {
    expect(jwtExpiresAt(token({ exp: 1700000000 }))).toBe(1700000000000);
  });

  it("returns null for junk or a missing exp", () => {
    expect(jwtExpiresAt("not-a-jwt")).toBeNull();
    expect(jwtExpiresAt(token({ sub: "1" }))).toBeNull();
  });
});

describe("googleIdTokenProblem", () => {
  const now = 1_700_000_000_000;
  const good = { iss: "https://accounts.google.com", aud: "app", exp: now / 1000 + 600, nonce: "n1" };
  const check = (claims: object, nonce?: string) =>
    googleIdTokenProblem(token(claims), { clientId: "app", nonce, now });

  it("accepts a fresh token for this app with the right nonce", () => {
    expect(check(good, "n1")).toBeNull();
    expect(check({ ...good, iss: "accounts.google.com" })).toBeNull();
  });

  it("rejects the wrong issuer, audience, an expired token, or a nonce mismatch", () => {
    expect(check({ ...good, iss: "https://evil.example" })).toMatch(/Google/);
    expect(check({ ...good, aud: "other" })).toMatch(/different app/);
    expect(check({ ...good, exp: now / 1000 - 1 })).toMatch(/expired/);
    expect(check(good, "n2")).toMatch(/nonce/);
    expect(googleIdTokenProblem("junk", { clientId: "app" })).toMatch(/unreadable/);
  });
});
