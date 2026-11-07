import { decodeJwt, jwtExpiresAt } from "../jwt";

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
