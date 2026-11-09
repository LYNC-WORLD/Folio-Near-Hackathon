import { ENV } from "@/config";

export type ApiErrorCode = "TIMEOUT" | "NETWORK" | "HTTP";
export type AccountType = "apple" | "google";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown,
    public code: ApiErrorCode = "HTTP",
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string;
  /** Adds the authentication provider required by the backend. */
  account_type?: AccountType;
  timeoutMs?: number;
};

// Strip trailing slashes so `${BASE_URL}${path}` never becomes "//api/..."
const BASE_URL = ENV.API_URL.replace(/\/+$/, "");

/** Given the token the server just rejected, returns a fresh one (or null if signed out). */
type TokenRefresher = (staleToken: string) => Promise<string | null>;
let refreshToken: TokenRefresher | null = null;

type AccountTypeProvider = () => AccountType | null;
let getAccountType: AccountTypeProvider | null = null;

/** AuthProvider registers how to get a fresh token; returns an unregister function. */
export function setTokenRefresher(fn: TokenRefresher) {
  refreshToken = fn;
  return () => {
    if (refreshToken === fn) refreshToken = null;
  };
}
export function setAccountTypeProvider(fn: AccountTypeProvider) {
  getAccountType = fn;
  return () => {
    if (getAccountType === fn) getAccountType = null;
  };
}

export async function request<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  try {
    return await send<T>(path, opts);
  } catch (e) {
    // Expired token: refresh once and retry. A 401 means the server did nothing,
    // so retrying is safe even for orders.
    if (
      !(e instanceof ApiError && e.status === 401) ||
      !opts.token ||
      !refreshToken
    ) {
      throw e;
    }
    const fresh = await refreshToken(opts.token).catch(() => null);
    if (!fresh || fresh === opts.token) throw e;
    return send<T>(path, { ...opts, token: fresh });
  }
}

async function send<T>(
  path: string,
  { method = "GET", body, token, account_type, timeoutMs = 15000 }: RequestOptions,
): Promise<T> {
  const resolvedAccountType = account_type ?? getAccountType?.();
  console.log(resolvedAccountType);
  
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        // Only set when there is a body, avoids needless CORS preflights on GETs
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        // The API currently spells the Apple provider value as "apple".
        ...(resolvedAccountType
          ? {
              account_type:
                resolvedAccountType === "apple" ? "apple" : "google",
            }
          : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!res.ok) {
      const message =
        typeof data === "object" && data !== null && "message" in data
          ? String((data as { message: unknown }).message)
          : typeof data === "string" && data
            ? data
            : `Request failed (${res.status})`;
      throw new ApiError(message, res.status, data, "HTTP");
    }

    return data as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof Error && e.name === "AbortError") {
      throw new ApiError("Request timed out", 0, undefined, "TIMEOUT");
    }
    // On web, CORS blocks and mixed-content blocks land here too,
    // so log the original error to see the real cause in the console.
    if (__DEV__) console.warn("[request] failed:", e);
    throw new ApiError("Network error", 0, e, "NETWORK");
  } finally {
    clearTimeout(timer);
  }
}
