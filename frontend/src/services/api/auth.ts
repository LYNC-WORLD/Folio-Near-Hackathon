import { request } from "./client";
import type { LoginResponse } from "@/types";

// Works for Google and Apple tokens: the backend tells them apart by the `iss` claim.
export const loginWithIdToken = (idToken: string) =>
  request<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: { idToken },
  });

// kept so nothing else breaks
export const loginWithGoogle = loginWithIdToken;