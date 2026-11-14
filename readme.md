# Folio

**Social investing for anyone, anywhere: US stocks, pre-IPO companies, index funds, and perps, funded from any chain through NEAR Intents.**

Folio lets anyone in the world buy tokenized US stocks, pre-IPO companies, index funds, and trade perps on them.

You don't need a brokerage account, a minimum balance, or to live in a particular country.

Users sign in with Google or Apple, fund their account with USDC from whichever chain they already hold it on, and can start investing in seconds.

> Built for [NEAR HACKATHON](https://nearhackathon.com/).

---

## Why Folio

- **Investing in US stocks is hard:** Most of the world can't open a US brokerage account. Folio needs only a Google or Apple login.
- **Private markets are closed:** Pre-IPO companies like OpenAI, SpaceX, and Anthropic have mostly been open only to accredited investors and VCs.
- **Getting money in is hard:** Users hold stablecoins on many chains, while the assets live on Solana and Hyperliquid. Folio uses NEAR Intents so users never have to bridge by hand.
- **Investing is lonely:** Traditional apps hide what everyone else is doing.

Our mission: **make tokenized assets accessible to anyone, anywhere, in one click.**

---

## How Folio uses NEAR

Folio uses **NEAR Intents** (through the 1 Click API) as its cross-chain money layer. Folio holds assets on two venues: Solana for spot and Hyperliquid for perps. Every cross-chain transfer into those venues is an intent that NEAR's solver network fills.

| Flow | Origin | Destination | Status |
|---|---|---|---|
| **Cross-chain deposit** | Any token/chain 1 Click supports, sent from the user's external wallet | USDC in the user's Folio Solana wallet (spot) or Hyperliquid account (perps) | In the app |
| **Folio-wallet transfer** | USDC in the user's Folio Solana or Ethereum wallet, or Hyperliquid USDC | The other Folio venue, or any external address and asset | In the app |
| **Confidential mode** | Any of the above | Same, with 1 Click `confidentiality: "basic"` | In the app |

How a deposit works:

1. The app asks for a **dry quote** (`POST /api/deposit/intents/quote`, `dry: true`). It shows expected output, USD value, observed slippage, and a suggested slippage tolerance.
2. When the user confirms, the backend asks for a **live quote** using the suggested slippage. It gets a 1 Click deposit address, stores the transfer, and returns the address.
3. The user sends funds to that address. For Folio-held balances, `POST /api/deposit/intents/execute` sends them from the user's Privy wallet and submits the tx hash to 1Click.
4. The app polls `GET /api/deposit/intents/status` until the intent settles. When USDC lands on Hyperliquid, the backend sets up the user's Hyperliquid trading account automatically.

Refunds go to a user-supplied `refundTo` address on the origin chain. Deposits below $20 notional are rejected before a quote is requested.

Code:

- [`user-management-service/src/lib/oneClick.ts`](user-management-service/src/lib/oneClick.ts): 1 Click client (tokens, quote, deposit submit, status, slippage advice)
- [`user-management-service/src/services/intentsTransfer.service.ts`](user-management-service/src/services/intentsTransfer.service.ts): quote → execute → status lifecycle
- [`user-management-service/src/routes/depositRoutes.ts`](user-management-service/src/routes/depositRoutes.ts): `/api/deposit/intents/*` routes
- [`frontend/src/components/CrossChainDeposit.tsx`](frontend/src/components/CrossChainDeposit.tsx): deposit UI

---

## Features

| | Feature | What it does |
|---|---|---|
| **Deposit from any chain** | Fund spot or perps with USDC from any chain NEAR Intents supports. No manual bridging. |
**US stocks** | Buy tokenized Apple, Nvidia, Tesla and more (xStocks) in fractional amounts, 24/7. |
**Pre-IPO shares** | Get exposure to private companies like OpenAI, SpaceX, and Anthropic through PreStocks. |
**Index funds** | Buy S&P 500 and Nasdaq-100 style baskets in one tap. Each fund lists its constituents so users know exactly what they own. |
**Perp trading** | Go long or short on stocks and commodities with leverage through Hyperliquid, with order book, TP/SL, and limit orders, from a perp account kept separate from spot. |
**Limit orders** | Set a target price for spot buys and sells. |
**Recurring buys** | Dollar-cost average into any stock, pre-IPO asset, or fund on a daily, weekly, or monthly schedule. |
**Perp leaderboard** | Traders ranked by PnL computed from Hyperliquid account data, refreshed hourly. |
**Follow top investors** | Investor profiles and a follow flow. Uses sample data until the social backend ships. |
**Invest together** | Create groups, propose an asset, discuss it, and commit together. Stored on-device, no money moves yet. |

### Onboarding

The first-run flow asks four questions, which build the user's investor profile:

1. **What to own**: interests (US stocks, pre-IPO, funds)
2. **Starting size**: how much capital to start with
3. **Risk behavior**: how comfortable the user is with risk
4. **Holding period**: time horizon

---

## How it works

```
┌──────────────────────┐  Google / Apple ID token  ┌──────────────────────────────┐
│  Folio mobile app    │ ────────────────────────▶ │  user-management-service     │
│  (Expo/React Native) │ ◀──── wallet addresses ── │  (Express + Prisma)          │
└──────────┬───────────┘                           │                              │
           │  buy / sell / limit / recurring /     │  • Privy: Solana + EVM       │
           │  perp orders / cross-chain deposit    │  • Jupiter: USDC ⇄ asset     │
           └─────────────────────────────────────▶ │  • Hyperliquid: perp orders  │
                                                   │  • NEAR Intents: 1 Click API  │
                                                   └────┬──────────┬──────────┬───┘
                                      signed swap tx    │          │          │  quote / status
                                                        ▼          ▼          ▼
                                       ┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐
                                       │ Solana mainnet  │ │ Hyperliquid │ │  NEAR Intents   │
                                       │ Jupiter         │ │ perps on    │ │  solvers settle │
                                       │ xStocks         │ │ stocks and  │ │  USDC from any  │
                                       │ PreStocks       │ │ commodities │ │  supported chain│
                                       └────────▲────────┘ └──────▲──────┘ └────────┬────────┘
                                                │                 │                 │
                                                └──── USDC ───────┴─────────────────┘

┌─────────────────────┐   prices every 5 min + daily open (xStocks, PreStocks APIs)
│  pricing-service    │ ──▶ shared Postgres
│  (node-cron)        │
└─────────────────────┘
```

- **Wallets per user.** At sign-up, the backend creates a Privy user linked to the Google or Apple account. It provisions a dedicated **Solana wallet** (spot) and an **Ethereum wallet** (Hyperliquid account) for that user. Each user's assets sit in their own addresses, never in a pooled Folio account.
- **Routing, not issuing.** Folio doesn't issue any exposure itself. It routes each order to a venue:
  - **US stocks**: tokenized equities from **xStocks** (SPL / Token-2022 tokens on Solana).
  - **Pre-IPO**: tokenized exposure to private companies from **PreStocks**.
  - Spot trades execute as **USDC ⇄ asset swaps through Jupiter**, which finds the best price across Solana liquidity.
  - **Perps**: orders go to **Hyperliquid**. The perp account is separate from spot, so leveraged positions never touch spot holdings.
- **Funding.** USDC comes in through **NEAR Intents**, either to Solana for spot or straight to Hyperliquid for perps (see [How Folio uses NEAR](#how-folio-uses-near)).
- **Agent wallets.** Perp orders are signed by a per-user Hyperliquid agent (API) wallet. Its key is encrypted at rest with `ENCRYPTION_KEY`.
- **Index funds** are baskets of tokenized constituents. Buying a fund runs one Jupiter swap per constituent, in proportion.
- **Recurring buys** are stored as schedules and executed by a cron job through the same routing layer.
- **On-chain balances.** Balances are read directly from chain (SOL, SPL, and Token-2022 accounts) and from Hyperliquid.
- **Pricing.** A separate service writes live prices (every 5 minutes) and daily open prices to Postgres from the xStocks and PreStocks APIs. Charts come from Jupiter's data API.

---

## Tech stack

| Layer | Tech |
|---|---|
| Mobile app | Expo SDK 58, React Native 0.88, React 19, TypeScript, React Navigation, TanStack Query, react-native-svg |
| Auth | Google Sign-In, Sign in with Apple, ID tokens verified on every request (`google-auth-library`) |
| Cross-chain | NEAR Intents (1 Click API) |
| Wallets and swaps | Privy (server wallets), Jupiter Swap API, `@solana/web3.js` |
| Perps | Hyperliquid API (`@nktkas/hyperliquid`) |
| Assets | xStocks (tokenized US equities), PreStocks (tokenized pre-IPO) |
| Backend | Node.js, Express 5, Prisma 7, PostgreSQL |
| Pricing | node-cron, xStocks API, PreStocks API, Jupiter chart API |
| Infra | Docker Compose |

---

## Repository layout

```
.
├── frontend/                  # Expo / React Native app
├── user-management-service/   # API: auth, wallets, trading, perps, NEAR Intents
├── pricing-service/           # price crons
└── docker-compose.yml
```

---

## Getting started

### Prerequisites

- Node.js 20+
- PostgreSQL
- A [Privy](https://privy.io) app with server wallets enabled and an authorization key
- A Solana mainnet RPC URL
- A [Jupiter](https://dev.jup.ag) API key
- Google OAuth client IDs (web and iOS), and an Apple bundle ID for Sign in with Apple
- Optional: a [1 Click](https://docs.near-intents.org) JWT. 1 Click works without one, but charges a higher fee.
- Xcode and/or Android Studio to run the app

### 1. Backend: user-management-service

```bash
cd user-management-service
npm install
```

Create `user-management-service/.env`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/folio
PORT=5000
RPC_URL=https://your-solana-mainnet-rpc
PRIVY_APP_ID=...
PRIVY_APP_SECRET=...
PRIVY_AUTH_KEY=...
PRIVY_AUTH_ADDRESS=...
GOOGLE_CLIENT_ID=...
APPLE_BUNDLE_ID=...
JUPITER_API_KEY=...
ENCRYPTION_KEY=...          # exactly 32 characters, encrypts Hyperliquid agent keys

# optional
CORS_ORIGINS=http://localhost:8081
ONE_CLICK_JWT=
```

Every variable above `# optional` is required. The service refuses to start if one is missing.

```bash
npx prisma db push      # creates the schema (shared with pricing-service)
npx prisma generate
npm run dev
```

### 2. Backend: pricing-service

```bash
cd pricing-service
npm install
echo "DATABASE_URL=postgresql://user:password@localhost:5432/folio" > .env
npx prisma generate
npm run dev
```

You can also run both services with Docker from the repo root:

```bash
SERVER_PORT=5000 docker compose up --build
```

Inside the container the API listens on **5010**, so set `PORT=5010` in `user-management-service/.env` when running this way. `SERVER_PORT` is the port exposed on your machine.

### 3. Mobile app

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```env
EXPO_PUBLIC_API_URL=http://<your-local-ip>:5000
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...
```

Google Sign-In uses native modules, so run a development build instead of Expo Go:

```bash
npm run ios
```

```bash
npm run android
```

---

## Roadmap

- Move the remaining NEAR Intents flows (Folio-wallet transfers, withdrawals to external chains, confidential mode) into the app
- User-held signers, so Folio is no longer custodial
- Social backend for following investors and groups (currently sample data)
- AI-built "robo" portfolios matched to each user's risk profile
