import {
  depositToHyperliquid,
  getHyperliquidSpotBalances,
  getUsolMarket,
  getWithdrawAddress,
  hyperliquidInfoClient,
  makeUnifiedAccount,
  sellUsdcForSol,
  sendSolToSpot,
} from "../lib/hyperliquid";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { formatSize } from "@nktkas/hyperliquid/utils";
import { decrypt } from "../utils/encryption";

export class DepositService {
  public async createDepositRequest(
    userId: string,
    depositAmount: string,
    solanaAddress: string,
    solanaWalletId: string,
    ethereumAddress: string,
    ethereumWalletId: string,
  ) {
    const result = await depositToHyperliquid(
      userId,
      depositAmount,
      solanaAddress,
      solanaWalletId,
      ethereumAddress,
      ethereumWalletId,
    );
    if (result.success) {
      const unified = await makeUnifiedAccount(
        ethereumWalletId,
        ethereumAddress,
      ).catch((error) => {
        console.error("makeUnifiedAccount error: ", error);
        return false;
      });
      if (!unified)
        console.error(`unified account not set for ${ethereumAddress}`);
    }
    return result;
  }

  public async checkDepositRequest(userId: string) {
    return prisma.depositRequest.findFirst({
      where: {
        userId: userId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  public async getDepositQuote(
    depositAmount: number,
    ethereumWalletAddress: string,
  ) {
    const USDC_DECIMALS = 6;
    const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    const SOL_MINT = "So11111111111111111111111111111111111111112";
    const HYPERUNIT_FEE_URL = "https://api.hyperunit.xyz/v2/estimate-fees";

    async function fetchJson<T>(
      url: string,
      options?: RequestInit,
    ): Promise<T> {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        throw new Error(`API request failed (${response.status}): ${url}`);
      }

      return (await response.json()) as T;
    }

    const rawUsdc = Math.round(depositAmount * 10 ** USDC_DECIMALS);

    if (!Number.isSafeInteger(rawUsdc) || rawUsdc <= 0) {
      throw new Error("Invalid USDC amount");
    }

    const quoteUrl = new URL("https://api.jup.ag/swap/v1/quote");

    quoteUrl.searchParams.set("inputMint", USDC_MINT);
    quoteUrl.searchParams.set("outputMint", SOL_MINT);
    quoteUrl.searchParams.set("amount", String(rawUsdc));
    quoteUrl.searchParams.set("slippageBps", "50");
    quoteUrl.searchParams.set("swapMode", "ExactIn");

    const quote = await fetchJson<{
      inAmount: string;
      outAmount: string;
      otherAmountThreshold: string;
      slippageBps: number;
      priceImpactPct: string;
    }>(quoteUrl.toString(), {
      headers: { "x-api-key": env.JUPITER_API_KEY! },
    });

    const expectedSol = Number(quote.outAmount) / LAMPORTS_PER_SOL;

    const feeResponse = await fetchJson<{
      solana?: {
        "deposit-fee-in-units"?: number | string;
        depositFee?: number | string;
        "withdrawal-fee-in-units"?: number | string;
        withdrawalFee?: number | string;
      };
    }>(HYPERUNIT_FEE_URL);

    const solanaFees = Number(feeResponse.solana?.["deposit-fee-in-units"]);
    if (!solanaFees) {
      return;
    }
    const USOLDetails = await getUsolMarket();

    const depositSol = expectedSol - solanaFees;

    let expectedUSDC = Number(formatSize(depositSol, 3)) * USOLDetails.mid;

    const accountEquity = await hyperliquidInfoClient.spotClearinghouseState({
      user: ethereumWalletAddress,
    });
    let totalBalance = 0;
    accountEquity.balances.forEach((balance) => {
      totalBalance += Number(balance.total);
    });
    if (totalBalance <= 0) {
      expectedUSDC = expectedUSDC - 0.5;
    }
    return { expectedUSDC: expectedUSDC };
  }

  public async createWithdrawlRequest(
    userId: string,
    withdrawAmountInDollar: string,
    ethWalletId: string,
    ethAddress: string,
    solanaWalletId: string,
    solanaAddress: string,
  ) {
    try {
      const walletDetails = await prisma.wallet.findFirst({
        where: {
          walletAddress: ethAddress,
        },
        include: {
          hyperLiquidDetails: true,
        },
      });
      if (Number(withdrawAmountInDollar) < 15) {
        return {
          success: false,
          message: "withdraw amount should be greater then $15",
        };
      }
      if (!walletDetails || !walletDetails.hyperLiquidDetails) {
        return {
          success: false,
          message: "can not fetch wallet details",
        };
      }
      const apiSecret = decrypt(walletDetails.hyperLiquidDetails.agentApiSecret);
      const spotSwap = await sellUsdcForSol(
        withdrawAmountInDollar,
        apiSecret,
      );
      if (spotSwap.responce.status != "ok") {
        return {
          success: false,
          message: "spot swap failed",
        };
      }
      let spotBalance = await getHyperliquidSpotBalances(ethAddress);
      const solana = spotBalance.find((item) => item.coin === "USOL");
      if (Number(solana?.total ?? 0) <= 0.12) {
        return {
          success: false,
          message: "USOL balance is low",
        };
      }
      const solAmount = solana?.total ?? "0";
      const withdrawAddress = await getWithdrawAddress(solanaAddress);
      if (solAmount == "0" || !withdrawAddress) {
        return {
          success: false,
          message: "can not fetch solana address",
        };
      }
      const solToSwap = await sendSolToSpot(
        withdrawAddress,
        ethWalletId,
        solAmount,
      );
      await prisma.withdrawRequest.create({
        data: {
          solanaWalletAddress: solanaAddress,
          solanaWalletId: solanaWalletId,
          withdrawAmount: withdrawAmountInDollar,
          userId: userId,
        },
      });
      return {
        success: true,
        message: "deposit request submitted",
        data: solToSwap,
      };
    } catch (error) {
      console.error(error);
      return {
        success: false,
        message: "error in withdraw request",
      };
    }
  }

  public async checkWithdrawRequest(userId: string) {
    const recentRequest = await prisma.withdrawRequest.findFirst({
      where: {
        userId: userId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    return recentRequest?.conversionCompleted;
  }
}
