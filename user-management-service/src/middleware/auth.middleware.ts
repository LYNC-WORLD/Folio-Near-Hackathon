import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { verifyGoogleIdToken } from "../lib/google";
import { Chain } from "../generated/enums";
import { verifyAppleIdToken } from "../lib/apple";

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const accountType = req.headers.account_type ?? "google";

    if (!authHeader) {
      res.status(401).json({
        success: false,
        message: "Authorization header is required",
      });
      return;
    }
    if (!accountType || !(accountType == "apple" || accountType == "google")) {
      res.status(400).json({
        success: false,
        message: "accountType should be apple or google",
      });
      return;
    }
    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
      res.status(401).json({
        success: false,
        message: "Invalid authorization format",
      });
      return;
    }
    let user;
    if (accountType == "apple") {
      const appleUser = await verifyAppleIdToken(token);

      user = await prisma.user.findUnique({
        where: {
          appleSubjectId: appleUser.subjectId,
        },
        include: {
          wallets: true,
        },
      });
    } else {
      // 1. Verify Google ID token
      const googleUser = await verifyGoogleIdToken(token);

      // 2. Find your application user
      user = await prisma.user.findUnique({
        where: {
          googleSubjectId: googleUser.subjectId,
        },
        include: {
          wallets: true,
        },
      });
    }

    if (!user) {
      res.status(401).json({
        success: false,
        message: "User not found",
      });
      return;
    }
    const { wallets, ...userData } = user;
    const solanaWallet = wallets.find(
      (wallet) => wallet.chain === Chain.SOLANA,
    );
    const ethWallet = wallets.find((wallet) => wallet.chain === Chain.ETH);

    // 3. Attach database user to request
    req.user = {
      ...userData,
      solanaWalletId: solanaWallet?.walletId,
      solanaWalletAddress: solanaWallet?.walletAddress,
      ethereumWalletId: ethWallet?.walletId,
      ethereumWalletAddress: ethWallet?.walletAddress,
    };

    // 4. Continue to controller
    next();
  } catch (error) {
    // console.error("Auth middleware error:", error);

    res.status(401).json({
      success: false,
      message: "Invalid or expired Google token",
    });
  }
}
