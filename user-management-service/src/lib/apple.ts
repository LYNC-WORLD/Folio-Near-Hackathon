import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../config/env";

export interface VerifyAppleUserResponse {
  subjectId: string;
  email: string;
}

// Apple's official public signing keys
const appleKeys = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys"),
);

export async function verifyAppleIdToken(
  appleIdToken: string,
  // expectedNonce?: string,
): Promise<VerifyAppleUserResponse> {
  try {
    const audience = env.APPLE_BUNDLE_ID;

    if (!audience) {
      throw new Error("APPLE_BUNDLE_ID is not configured");
    }

    if (!appleIdToken) {
      throw new Error("Apple identity token is required");
    }

    // Verify Apple's JWT signature and standard claims.
    const { payload } = await jwtVerify(appleIdToken, appleKeys, {
      issuer: "https://appleid.apple.com",
      audience,
      algorithms: ["RS256"],
    });

    // Apple's stable user identifier.
    if (!payload.sub) {
      throw new Error("Apple token does not contain a subject ID");
    }

    const email = typeof payload.email === "string" ? payload.email : "";

    return {
      subjectId: payload.sub,
      email,
    };
  } catch (error) {
    console.error("Failed to verify Apple identity token:", error);

    throw error;
  }
}
