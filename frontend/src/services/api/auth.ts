import { request, type AccountType } from "./client";
import type { LoginResponse } from "@/types";

export const loginWithIdToken = (idToken: string, accountType: AccountType) =>
  request<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: { idToken },
    accountType,
  });
