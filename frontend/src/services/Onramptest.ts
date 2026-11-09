// Calls Crossmint straight from the app. DEV / TESTING ONLY.
//
// The server key below ends up inside the app bundle, so anyone can extract it.
// - staging: fine for testing.
// - production (mainnet, real money): blocked in release builds on purpose. It only runs
//   in dev builds (__DEV__). For real users, replace the body of createOnrampOrder() with a
//   call to your own backend, which holds the server key.
//
// Env (.env):
//   EXPO_PUBLIC_CROSSMINT_ENV=staging | production        (default: staging)
//   EXPO_PUBLIC_CROSSMINT_SERVER_KEY=...                  (key that matches the env above)
//   EXPO_PUBLIC_CROSSMINT_CLIENT_SIDE_API_KEY=...         (client key that matches the env above)
// The old name EXPO_PUBLIC_CROSSMINT_STAGING_SERVER_KEY still works for staging.

export const ONRAMP_ENV: "staging" | "production" =
  process.env.EXPO_PUBLIC_CROSSMINT_ENV === "production" ? "production" : "staging";

const BASE =
  ONRAMP_ENV === "production" ? "https://www.crossmint.com/api" : "https://staging.crossmint.com/api";

const SERVER_KEY =
  process.env.EXPO_PUBLIC_CROSSMINT_SERVER_KEY ?? process.env.EXPO_PUBLIC_CROSSMINT_STAGING_SERVER_KEY ?? "";

// USDC on Solana. Staging = devnet test coin, production = real USDC on mainnet.
const USDC_SOLANA =
  ONRAMP_ENV === "production"
    ? "solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    : "solana:4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

export const NETWORK_LABEL = ONRAMP_ENV === "production" ? "Solana mainnet" : "Solana devnet (test)";

export type OnrampOrder = { orderId: string; clientSecret: string };

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function call(url: string, method: "PUT" | "POST", body: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", "x-api-key": SERVER_KEY },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(json?.message ?? json?.error ?? `Request failed (${res.status})`, res.status);
  }
  return json;
}

function createOrder(p: { walletAddress: string; email: string; amount: string }) {
  return call(`${BASE}/2022-06-09/orders`, "POST", {
    lineItems: [
      {
        tokenLocator: USDC_SOLANA,
        executionParameters: { mode: "exact-in", amount: p.amount },
      },
    ],
    payment: { method: "card", receiptEmail: p.email },
    recipient: { walletAddress: p.walletAddress },
  });
}

export async function createOnrampOrder(p: {
  walletAddress: string; // your own (non-Crossmint) Solana address
  email: string; // receipt email, also the user identity if linking is needed
  amount: string; // USD, e.g. "10"
}): Promise<OnrampOrder> {
  if (ONRAMP_ENV === "production" && !__DEV__) {
    throw new Error("Mainnet card payments need your backend. Do not ship a server key in the app.");
  }
  if (!SERVER_KEY) throw new Error("Missing EXPO_PUBLIC_CROSSMINT_SERVER_KEY");

  let data;
  try {
    // 1. Try the order directly. No Crossmint user is created here.
    data = await createOrder(p);
  } catch (e) {
    // 2. Only if Crossmint says the wallet is not linked, link it (this is what
    //    auto-creates the user) and retry once.
    const needsLink =
      e instanceof ApiError && e.status >= 400 && e.status < 500 && /link|wallet|user|owner/i.test(e.message);
    if (!needsLink) throw e;
    await call(`${BASE}/2025-06-09/users/email:${p.email}/linked-wallets/${p.walletAddress}`, "PUT", {
      chain: "solana",
    });
    data = await createOrder(p);
  }

  if (data?.order?.payment?.status === "requires-recipient-verification") {
    throw new Error("This amount needs wallet verification. Try less than $1,000.");
  }
  return { orderId: data.order.orderId, clientSecret: data.clientSecret };
}