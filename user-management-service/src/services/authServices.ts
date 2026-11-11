import { Chain } from "../generated/enums";
import { User, Wallet } from "../generated/client";
import { verifyGoogleIdToken } from "../lib/google";
import {
  createEVMWallet,
  createSolanaWallet,
  createUser,
  deleteUser,
} from "../lib/privy";
import { prisma } from "../lib/prisma";
import { verifyAppleIdToken } from "../lib/apple";

export class AuthService {
  public async getOrCreateUser(
    accessToken: string,
    accountType: "apple" | "google",
    user_name: string,
  ) {
    if (!accessToken) {
      return;
    }
    let subjectId, username, email, user;
    if (accountType == "apple") {
      const result = await verifyAppleIdToken(accessToken);
      subjectId = result.subjectId;
      username = user_name ?? "user";
      email = result.email;
      user = await prisma.user.findUnique({
        where: {
          appleSubjectId: subjectId,
        },
        include: {
          wallets: true,
        },
      });
    } else {
      const result = await verifyGoogleIdToken(accessToken);
      subjectId = result.subjectId;
      username = result.username;
      email = result.email;
      user = await prisma.user.findUnique({
        where: {
          googleSubjectId: subjectId,
        },
        include: {
          wallets: true,
        },
      });
    }

    if (!user) {
      const newUser = await this.createUserWithWallets(
        subjectId,
        email,
        username,
        accountType,
      );
      return toLoginResponse(newUser, false);
    }

    const loginForm = await prisma.loginDetails.findUnique({
      where: { email: email },
    });
    return toLoginResponse(user, !!loginForm);
  }

  private async createUserWithWallets(
    subjectId: string,
    email: string,
    username: string,
    accountType: "apple" | "google",
  ) {
    // Creating user
    const privyUser = await createUser(subjectId, email, username);
    try {
      const [solanaWallet, evmWallet] = await Promise.all([
        createSolanaWallet(walletIdempotencyKey(subjectId, Chain.SOLANA)),
        createEVMWallet(walletIdempotencyKey(subjectId, Chain.ETH)),
      ]);
      // saving to db
      if (accountType == "apple") {
        return await prisma.user.create({
          data: {
            email: email,
            userId: privyUser.userId,
            name: username,
            appleSubjectId: subjectId,
            wallets: {
              create: [
                {
                  chain: Chain.SOLANA,
                  walletId: solanaWallet.walletId,
                  walletAddress: solanaWallet.address,
                },
                {
                  chain: Chain.ETH,
                  walletId: evmWallet.walletId,
                  walletAddress: evmWallet.address,
                },
              ],
            },
          },
          include: {
            wallets: true,
          },
        });
      } else {
        return await prisma.user.create({
          data: {
            email: email,
            userId: privyUser.userId,
            name: username,
            googleSubjectId: subjectId,
            wallets: {
              create: [
                {
                  chain: Chain.SOLANA,
                  walletId: solanaWallet.walletId,
                  walletAddress: solanaWallet.address,
                },
                {
                  chain: Chain.ETH,
                  walletId: evmWallet.walletId,
                  walletAddress: evmWallet.address,
                },
              ],
            },
          },
          include: {
            wallets: true,
          },
        });
      }
    } catch (error) {
      await deleteUser(privyUser.userId).catch(() => {});
      throw error;
    }
  }
}

function walletIdempotencyKey(subjectId: string, chain: Chain) {
  return `folio-wallet-${chain.toLowerCase()}-${subjectId}`;
}

function toLoginResponse(
  user: User & { wallets: Wallet[] },
  formFilled: boolean,
) {
  const solanaWallet = user.wallets.find(
    (wallet) => wallet.chain === Chain.SOLANA,
  );
  const ethereumWallet = user.wallets.find(
    (wallet) => wallet.chain === Chain.ETH,
  );
  return {
    address: solanaWallet?.walletAddress,
    solanaAddress: solanaWallet?.walletAddress,
    ethereumAddress: ethereumWallet?.walletAddress,
    email: user.email,
    name: user.name,
    formFilled: formFilled,
  };
}
