import { IntentsDestination } from "../generated/client";
import { prisma } from "../lib/prisma";
import { ensureHyperliquidTradingAccount } from "../lib/hyperliquid";
import { sendUsdc, walletAction } from "../lib/privy";
import {
  DEFAULT_SLIPPAGE_BPS,
  HYPERLIQUID_USDC_ASSET,
  OneClickError,
  OneClickQuote,
  OneClickToken,
  getStatus,
  getTokens,
  meetsMinimum,
  privySendChain,
  quote,
  slippageAdvice,
  solanaUsdc,
  submitDepositTx,
  toSmallestUnit,
} from "../lib/oneClick";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type QuoteInput = {
  userId: string;
  originAsset: string;
  amount: string;
  destination: "SOLANA" | "HYPERLIQUID";
  refundTo: string;
  confidential: boolean;
  dry: boolean;
  slippageBps: number;
  solanaWalletAddress: string;
  ethereumWalletAddress: string;
  solanaWalletId?: string;
  ethereumWalletId?: string;
};

function deadlineIn(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function publicDeposit(row: {
  id: string;
  originAsset: string;
  destinationAsset: string;
  destination: IntentsDestination;
  amount: string;
  depositAddress: string;
  depositMemo: string | null;
  recipient: string;
  refundTo: string;
  confidential: boolean;
  status: string;
  txHash: string | null;
  createdAt: Date;
}) {
  return {
    depositId: row.id,
    originAsset: row.originAsset,
    destinationAsset: row.destinationAsset,
    destination: row.destination,
    amount: row.amount,
    depositAddress: row.depositAddress,
    depositMemo: row.depositMemo,
    recipient: row.recipient,
    refundTo: row.refundTo,
    confidential: row.confidential,
    status: row.status,
    txHash: row.txHash,
    createdAt: row.createdAt,
  };
}

export class IntentsDepositService {
  public async listTokens(): Promise<OneClickToken[]> {
    return getTokens();
  }

  public async createQuote(input: QuoteInput) {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false as const, status: 400, message: "Deposit amount required" };
    }
    const slippageBps =
      !Number.isFinite(input.slippageBps) || input.slippageBps <= 0
        ? DEFAULT_SLIPPAGE_BPS
        : input.slippageBps;
    if (slippageBps > 10_000) {
      return { ok: false as const, status: 400, message: "invalid slippage" };
    }
    const refundTo = input.refundTo.trim();
    if (!refundTo) {
      return { ok: false as const, status: 400, message: "refundTo is required" };
    }

    const tokens = await getTokens();
    const origin = tokens.find((token) => token.assetId === input.originAsset);
    if (!origin) {
      return { ok: false as const, status: 400, message: "origin asset is not supported" };
    }
    if (!meetsMinimum(amount, origin)) {
      return { ok: false as const, status: 400, message: "minimum deposit amount is $20" };
    }

    const destinationAsset =
      input.destination === "HYPERLIQUID"
        ? HYPERLIQUID_USDC_ASSET
        : solanaUsdc(tokens)?.assetId;
    if (!destinationAsset) {
      return { ok: false as const, status: 502, message: "Solana USDC is not available" };
    }
    const recipient =
      input.destination === "HYPERLIQUID"
        ? input.ethereumWalletAddress
        : input.solanaWalletAddress;

    let priced: OneClickQuote;
    try {
      priced = await quote({
        dry: input.dry,
        originAsset: origin.assetId,
        destinationAsset,
        amount: toSmallestUnit(input.amount, origin.decimals),
        recipient,
        refundTo,
        slippageTolerance: slippageBps,
        deadline: deadlineIn(10),
        confidential: input.confidential,
      });
    } catch (error) {
      if (error instanceof OneClickError) {
        return { ok: false as const, status: error.status, message: error.message };
      }
      throw error;
    }

    const { observedSlippageBps, suggestedSlippageBps } = slippageAdvice(
      priced.amountInUsd,
      priced.amountOutUsd,
    );
    const canExecute = privySendChain(origin) !== null;
    const quoteExtras = {
      amountOut: priced.amountOut,
      amountOutFormatted: priced.amountOutFormatted,
      amountOutUsd: priced.amountOutUsd,
      amountInUsd: priced.amountInUsd,
      minAmountOut: priced.minAmountOut,
      deadline: priced.deadline,
      confidential: input.confidential,
      slippageBps,
      observedSlippageBps,
      suggestedSlippageBps,
      canExecute,
    };
    if (input.dry) {
      return {
        ok: true as const,
        data: {
          dry: true,
          originAsset: origin.assetId,
          destinationAsset,
          destination: input.destination,
          amount: input.amount,
          ...quoteExtras,
        },
      };
    }

    if (!priced.depositAddress) {
      return { ok: false as const, status: 502, message: "quote did not return a deposit address" };
    }

    const row = await prisma.intentsDeposit.create({
      data: {
        userId: input.userId,
        originAsset: origin.assetId,
        destinationAsset,
        destination: input.destination,
        amount: input.amount,
        depositAddress: priced.depositAddress,
        depositMemo: priced.depositMemo,
        recipient,
        refundTo,
        confidential: input.confidential,
        status: "PENDING_DEPOSIT",
      },
    });

    return {
      ok: true as const,
      data: {
        ...publicDeposit(row),
        dry: false,
        ...quoteExtras,
      },
    };
  }

  public async execute(userId: string, depositId: string, wallets: {
    solanaWalletId?: string;
    ethereumWalletId?: string;
  }) {
    const row = await prisma.intentsDeposit.findFirst({
      where: { id: depositId, userId },
    });
    if (!row) return { ok: false as const, status: 404, message: "deposit not found" };
    if (row.txHash) return { ok: true as const, data: publicDeposit(row) };

    const tokens = await getTokens();
    const origin = tokens.find((token) => token.assetId === row.originAsset);
    const chain = origin ? privySendChain(origin) : null;
    if (!origin || !chain) {
      return {
        ok: false as const,
        status: 400,
        message: "Send this amount from your own wallet on the origin chain",
        data: publicDeposit(row),
      };
    }

    const walletId = chain === "solana" ? wallets.solanaWalletId : wallets.ethereumWalletId;
    if (!walletId) return { ok: false as const, status: 404, message: "User not found" };

    const sent = await sendUsdc(chain, walletId, row.amount, row.depositAddress);
    const hash = await chainTxHash(walletId, sent.id);
    const txHash = hash ?? `privy:${sent.id}`;
    if (hash) {
      await submitDepositTx(row.depositAddress, hash, row.depositMemo).catch((error) => {
        console.error("1Click deposit submit failed: ", error);
      });
    }

    const updated = await prisma.intentsDeposit.update({
      where: { id: row.id },
      data: { txHash },
    });
    return { ok: true as const, data: publicDeposit(updated) };
  }

  public async status(userId: string, depositId: string) {
    const row = await prisma.intentsDeposit.findFirst({
      where: { id: depositId, userId },
    });
    if (!row) return { ok: false as const, status: 404, message: "deposit not found" };

    const live = await getStatus(row.depositAddress, row.depositMemo);
    const updated = await prisma.intentsDeposit.update({
      where: { id: row.id },
      data: { status: live.status },
    });
    if (updated.destination === "HYPERLIQUID" && updated.status === "SUCCESS") {
      await setupHyperliquidAccount(userId);
    }
    return { ok: true as const, data: publicDeposit(updated) };
  }
}

async function setupHyperliquidAccount(userId: string) {
  try {
    const wallet = await prisma.wallet.findFirst({
      where: { userId, chain: "ETH" },
    });
    if (!wallet) {
      console.error(`hyperliquid account setup skipped, no ETH wallet for ${userId}`);
      return;
    }
    const ok = await ensureHyperliquidTradingAccount(
      wallet.walletId,
      wallet.walletAddress,
    );
    if (!ok) {
      console.error(`hyperliquid account setup failed for ${wallet.walletAddress}`);
    }
  } catch (error) {
    console.error("hyperliquid account setup failed: ", error);
  }
}

async function chainTxHash(walletId: string, actionId: string): Promise<string | null> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const action = await walletAction(walletId, actionId);
    const steps = (action as { steps?: Array<Record<string, string | null | undefined>> }).steps ?? [];
    for (const step of steps) {
      const hash = step.transaction_hash || step.transaction_signature;
      if (hash) return hash;
    }
    if (action.status === "failed" || action.status === "rejected") return null;
    await sleep(1000);
  }
  return null;
}
