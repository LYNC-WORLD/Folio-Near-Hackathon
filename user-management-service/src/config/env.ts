import dotenv from "dotenv";

dotenv.config();

const required = {
  DATABASE_URL: process.env.DATABASE_URL,
  PORT: process.env.PORT ?? "5000",
  RPC_URL: process.env.RPC_URL,
  PRIVY_APP_ID: process.env.PRIVY_APP_ID,
  PRIVY_APP_SECRET: process.env.PRIVY_APP_SECRET,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  APPLE_BUNDLE_ID: process.env.APPLE_BUNDLE_ID,
  PRIVY_AUTH_KEY: process.env.PRIVY_AUTH_KEY,
  PRIVY_AUTH_ADDRESS: process.env.PRIVY_AUTH_ADDRESS,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  JUPITER_API_KEY: process.env.JUPITER_API_KEY,
  CORS_ORIGINS: process.env.CORS_ORIGINS ?? "http://localhost:8081",
};

for (const [name, value] of Object.entries(required)) {
  if (!value) {
    throw new Error(`${name} is required!!`);
  }
}

export const env = {
  ...required,
  ONE_CLICK_JWT: process.env.ONE_CLICK_JWT ?? "",
  ONE_CLICK_BASE_URL:
    process.env.ONE_CLICK_BASE_URL || "https://1click.chaindefuser.com",
  // optional: card on-ramp and bank off-ramp. Kept on the server so the
  // secrets never ship inside the app.
  MOONPAY_PK: process.env.MOONPAY_PK ?? "",
  MOONPAY_SK: process.env.MOONPAY_SK ?? "",
  MOONPAY_ENV: process.env.MOONPAY_ENV === "production" ? "production" : "sandbox",
  TRANSAK_API_KEY: process.env.TRANSAK_API_KEY ?? "",
  TRANSAK_API_SECRET: process.env.TRANSAK_API_SECRET ?? "",
  TRANSAK_ENV: process.env.TRANSAK_ENV === "production" ? "production" : "staging",
  TRANSAK_REFERRER: process.env.TRANSAK_REFERRER || "app.folio.money",
};
