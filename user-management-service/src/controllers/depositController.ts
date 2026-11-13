import { Request, Response } from "express";
import { DepositService } from "../services/depositServices";
import { IntentsDepositService } from "../services/intentsDeposit.service";

export class DepositController {
  private depositService: DepositService;
  private intentsDepositService: IntentsDepositService;
  constructor() {
    this.depositService = new DepositService();
    this.intentsDepositService = new IntentsDepositService();
  }

  public createWithdrawRequest = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      if (
        !req.user ||
        !req.user.solanaWalletId ||
        !req.user.ethereumWalletId ||
        !req.user.solanaWalletAddress ||
        !req.user.ethereumWalletAddress
      ) {
        res.status(404).json({
          success: false,
          message: "User not found",
        });
        return;
      }
      const body: DepositRequestBody = req.body;

      if (!body.depositAmount) {
        res.status(400).json({
          success: false,
          message: "Deposit amount required",
        });
        return;
      }
      if (Number(body.depositAmount) < 20) {
        res.status(400).json({
          success: false,
          message: "minimum deposit amount is $20",
        });
        return;
      }
      const depositRequest = await this.depositService.createWithdrawlRequest(
        req.user.id,
        body.depositAmount,
        req.user.ethereumWalletId,
        req.user.ethereumWalletAddress,
        req.user.solanaWalletId,
        req.user.solanaWalletAddress,
      );
      res.status(depositRequest.success ? 200 : 400).json({
        success: depositRequest.success,
        message: depositRequest.message,
      });
      return;
    } catch (error) {
      console.log("login error: ", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  };

  public checkWithdrawStatus = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      if (
        !req.user ||
        !req.user.solanaWalletId ||
        !req.user.ethereumWalletId ||
        !req.user.solanaWalletAddress ||
        !req.user.ethereumWalletAddress
      ) {
        res.status(404).json({
          success: false,
          message: "User not found",
        });
        return;
      }
      const depositRequest = await this.depositService.checkWithdrawRequest(
        req.user.id,
      );
      res.status(200).json({
        success: depositRequest,
        message: "withdraw status",
      });
      return;
    } catch (error) {
      console.log("login error: ", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  };

  public listIntentTokens = async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const tokens = await this.intentsDepositService.listTokens();
      res.status(200).json({ success: true, data: tokens });
    } catch (error) {
      console.log("intents tokens error: ", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  };

  public quoteIntentDeposit = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      if (!req.user?.solanaWalletAddress || !req.user.ethereumWalletAddress) {
        res.status(404).json({ success: false, message: "User not found" });
        return;
      }
      const body = (req.body ?? {}) as IntentQuoteBody;
      if (!body.originAsset || !body.amount || !body.destination || !body.refundTo) {
        res.status(400).json({ success: false, message: "Bad request" });
        return;
      }
      if (body.destination !== "SOLANA" && body.destination !== "HYPERLIQUID") {
        res.status(400).json({ success: false, message: "invalid destination" });
        return;
      }
      const result = await this.intentsDepositService.createQuote({
        userId: req.user.id,
        originAsset: body.originAsset,
        amount: String(body.amount),
        destination: body.destination,
        refundTo: body.refundTo,
        confidential: body.confidential === true,
        dry: body.dry !== false,
        slippageBps: Number(body.slippageBps ?? 100),
        solanaWalletAddress: req.user.solanaWalletAddress,
        ethereumWalletAddress: req.user.ethereumWalletAddress,
      });
      if (!result.ok) {
        res.status(result.status).json({ success: false, message: result.message });
        return;
      }
      res.status(200).json({ success: true, data: result.data });
    } catch (error) {
      console.log("intents quote error: ", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  };

  public executeIntentDeposit = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      if (!req.user) {
        res.status(404).json({ success: false, message: "User not found" });
        return;
      }
      const depositId = (req.body as { depositId?: string } | undefined)?.depositId;
      if (!depositId) {
        res.status(400).json({ success: false, message: "depositId is required" });
        return;
      }
      const result = await this.intentsDepositService.execute(req.user.id, depositId, {
        solanaWalletId: req.user.solanaWalletId,
        ethereumWalletId: req.user.ethereumWalletId,
      });
      if (!result.ok) {
        res.status(result.status).json({
          success: false,
          message: result.message,
          data: "data" in result ? result.data : undefined,
        });
        return;
      }
      res.status(200).json({ success: true, data: result.data });
    } catch (error) {
      console.log("intents execute error: ", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  };

  public intentDepositStatus = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      if (!req.user) {
        res.status(404).json({ success: false, message: "User not found" });
        return;
      }
      const depositId = String(req.query.depositId ?? "");
      if (!depositId) {
        res.status(400).json({ success: false, message: "depositId is required" });
        return;
      }
      const result = await this.intentsDepositService.status(req.user.id, depositId);
      if (!result.ok) {
        res.status(result.status).json({ success: false, message: result.message });
        return;
      }
      res.status(200).json({ success: true, data: result.data });
    } catch (error) {
      console.log("intents status error: ", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  };
}

interface DepositRequestBody {
  depositAmount: string;
}

interface IntentQuoteBody {
  originAsset?: string;
  amount?: string;
  destination?: "SOLANA" | "HYPERLIQUID";
  refundTo?: string;
  confidential?: boolean;
  dry?: boolean;
  slippageBps?: number;
}
