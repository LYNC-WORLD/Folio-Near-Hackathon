import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { Signature, Wallet } from "ethers";
import { privy } from "./privy";
import { env } from "../config/env";
import { prisma } from "./prisma";
import { encrypt } from "../utils/encryption";

export const hyperliquidTransport = new HttpTransport();
export const hyperliquidInfoClient = new InfoClient({
  transport: hyperliquidTransport,
});

async function readExchange(response: Response): Promise<{
  ok: boolean;
  error?: string;
  body?: unknown;
}> {
  const body = await response.json().catch(() => undefined);
  if (response.ok && body?.status === "ok") return { ok: true, body };
  const error =
    typeof body?.response === "string"
      ? body.response
      : body?.status === "err"
        ? String(body.response ?? "exchange error")
        : `http ${response.status}`;
  return { ok: false, error, body };
}

async function isExchangeOk(response: Response) {
  return (await readExchange(response)).ok;
}

export const HYPERLIQUID_USDC_TOKEN = "USDC:0x6d1e7cde53ba9467b783cb7c530ce054";

export async function createAgentWallet(walletId: string) {
  const wallet = Wallet.createRandom();
  const nonce = Date.now();
  const validUntil = nonce + 150 * 24 * 60 * 60 * 1000;
  const signature = await privy
    .wallets()
    .ethereum()
    .signTypedData(walletId, {
      params: {
        typed_data: {
          domain: {
            name: "HyperliquidSignTransaction",
            version: "1",
            chainId: 1,
            verifyingContract: "0x0000000000000000000000000000000000000000",
          },
          message: {
            hyperliquidChain: "Mainnet",
            agentAddress: wallet.address,
            agentName: `trading valid_until ${validUntil}`,
            nonce: nonce,
          },
          primary_type: "HyperliquidTransaction:ApproveAgent",
          types: {
            "HyperliquidTransaction:ApproveAgent": [
              { name: "hyperliquidChain", type: "string" },
              { name: "agentAddress", type: "address" },
              { name: "agentName", type: "string" },
              { name: "nonce", type: "uint64" },
            ],
          },
        },
      },
      authorization_context: {
        authorization_private_keys: [env.PRIVY_AUTH_KEY!],
      },
    });
  const parsed = Signature.from(signature.signature);
  const body = {
    action: {
      agentAddress: wallet.address,
      agentName: `trading valid_until ${validUntil}`,
      hyperliquidChain: "Mainnet",
      nonce: nonce,
      signatureChainId: "0x1",
      type: "approveAgent",
    },
    expiresAfter: null,
    nonce: nonce,
    signature: {
      r: parsed.r,
      s: parsed.s,
      v: parsed.v,
    },
    vaultAddress: null,
  };
  const response = await fetch("https://api.hyperliquid.xyz/exchange", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return {
    ok: await isExchangeOk(response),
    apiKey: wallet.address,
    apiSecret: wallet.privateKey,
  };
}

export async function getBestPriceFromOrderBook(
  marketSymbol: string,
  isBuy: boolean,
) {
  const book = await hyperliquidInfoClient.l2Book({
    coin: `xyz:${marketSymbol}`,
  });
  const best = book?.levels[isBuy ? 1 : 0][0];
  if (!best) return;
  const orderBookPrice = Number(best.px);

  return {
    orderBookPrice,
    limitPrice: orderBookPrice * (isBuy ? 1.1 : 0.9),
  };
}

export async function ensureHyperliquidTradingAccount(
  ethereumWalletId: string,
  ethereumAddress: string,
): Promise<boolean> {
  const walletDetails = await prisma.wallet.findFirst({
    where: { walletId: ethereumWalletId },
    include: { hyperLiquidDetails: true },
  });
  if (!walletDetails?.hyperLiquidDetails) {
    const agent = await createAgentWallet(ethereumWalletId);
    if (!agent.ok) return false;
    await prisma.hyperLiquidDetails.create({
      data: {
        agentApiKey: agent.apiKey,
        agentApiSecret: encrypt(agent.apiSecret),
        walletId: ethereumWalletId,
      },
    });
  }
  return makeUnifiedAccount(ethereumWalletId, ethereumAddress);
}

export async function makeUnifiedAccount(
  walletId: string,
  walletAddress: string,
) {
  const current = await hyperliquidInfoClient.userAbstraction({
    user: walletAddress as `0x${string}`,
  });
  if (current === "unifiedAccount" || current === "portfolioMargin")
    return true;
  const nonce = Date.now();
  const signature = await privy
    .wallets()
    .ethereum()
    .signTypedData(walletId, {
      params: {
        typed_data: {
          domain: {
            name: "HyperliquidSignTransaction",
            version: "1",
            chainId: 1,
            verifyingContract: "0x0000000000000000000000000000000000000000",
          },
          message: {
            type: "userSetAbstraction",
            user: walletAddress,
            abstraction: "unifiedAccount",
            nonce: nonce,
            signatureChainId: "0x1",
            hyperliquidChain: "Mainnet",
          },
          primary_type: "HyperliquidTransaction:UserSetAbstraction",
          types: {
            EIP712Domain: [
              { name: "name", type: "string" },
              { name: "version", type: "string" },
              { name: "chainId", type: "uint256" },
              { name: "verifyingContract", type: "address" },
            ],
            "HyperliquidTransaction:UserSetAbstraction": [
              { name: "hyperliquidChain", type: "string" },
              { name: "user", type: "address" },
              { name: "abstraction", type: "string" },
              { name: "nonce", type: "uint64" },
            ],
          },
        },
      },
      authorization_context: {
        authorization_private_keys: [env.PRIVY_AUTH_KEY!],
      },
    });

  const parsed = Signature.from(signature.signature);
  const body = {
    action: {
      type: "userSetAbstraction",
      user: walletAddress,
      abstraction: "unifiedAccount",
      nonce: nonce,
      signatureChainId: "0x1",
      hyperliquidChain: "Mainnet",
    },
    expiresAfter: null,
    nonce: nonce,
    signature: {
      r: parsed.r,
      s: parsed.s,
      v: parsed.v,
    },
    vaultAddress: null,
  };
  const response = await fetch("https://api.hyperliquid.xyz/exchange", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return isExchangeOk(response);
}

export async function sendHyperliquidUsdc(
  ethWalletId: string,
  amount: string,
  destination: string,
  opts?: { sourceDex?: string; destinationDex?: string },
): Promise<{ ok: boolean; txHash: string | null; error?: string }> {
  const nonce = Date.now();
  const sourceDex = opts?.sourceDex ?? "";
  const destinationDex = opts?.destinationDex ?? "";
  const token = HYPERLIQUID_USDC_TOKEN;
  const signature = await privy
    .wallets()
    .ethereum()
    .signTypedData(ethWalletId, {
      params: {
        typed_data: {
          domain: {
            name: "HyperliquidSignTransaction",
            version: "1",
            chainId: 42161,
            verifyingContract: "0x0000000000000000000000000000000000000000",
          },
          message: {
            destination,
            sourceDex,
            destinationDex,
            token,
            amount,
            fromSubAccount: "",
            nonce,
            type: "sendAsset",
            signatureChainId: "0xa4b1",
            hyperliquidChain: "Mainnet",
          },
          primary_type: "HyperliquidTransaction:SendAsset",
          types: {
            EIP712Domain: [
              { name: "name", type: "string" },
              { name: "version", type: "string" },
              { name: "chainId", type: "uint256" },
              { name: "verifyingContract", type: "address" },
            ],
            "HyperliquidTransaction:SendAsset": [
              { name: "hyperliquidChain", type: "string" },
              { name: "destination", type: "string" },
              { name: "sourceDex", type: "string" },
              { name: "destinationDex", type: "string" },
              { name: "token", type: "string" },
              { name: "amount", type: "string" },
              { name: "fromSubAccount", type: "string" },
              { name: "nonce", type: "uint64" },
            ],
          },
        },
      },
      authorization_context: {
        authorization_private_keys: [env.PRIVY_AUTH_KEY!],
      },
    });

  const parsed = Signature.from(signature.signature);
  const body = {
    action: {
      amount,
      destination,
      destinationDex,
      fromSubAccount: "",
      hyperliquidChain: "Mainnet",
      nonce,
      signatureChainId: "0xa4b1",
      sourceDex,
      token,
      type: "sendAsset",
    },
    expiresAfter: null,
    nonce,
    signature: {
      r: parsed.r,
      s: parsed.s,
      v: parsed.v,
    },
    vaultAddress: null,
  };

  const response = await fetch("https://api.hyperliquid.xyz/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await readExchange(response);
  if (!result.ok) {
    console.error("hyperliquid sendAsset failed:", result.error, result.body);
    return { ok: false, txHash: null, error: result.error };
  }
  return { ok: true, txHash: `hl:${nonce}` };
}
