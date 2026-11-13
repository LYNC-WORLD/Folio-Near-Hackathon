import { Request, Response } from "express";
import { IntentsTransferService } from "../services/intentsTransfer.service";

export class DepositController {
  private intentsTransferService: IntentsTransferService;
  constructor() {
    this.intentsTransferService = new IntentsTransferService();
  }

  public listIntentTokens = async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const tokens = await this.intentsTransferService.listTokens();
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
      if (
        body.destination !== "SOLANA" &&
        body.destination !== "HYPERLIQUID" &&
        body.destination !== "EXTERNAL"
      ) {
        res.status(400).json({ success: false, message: "invalid destination" });
        return;
      }
      if (body.destination === "EXTERNAL" && (!body.destinationAsset || !body.recipient)) {
        res.status(400).json({
          success: false,
          message: "destinationAsset and recipient are required",
        });
        return;
      }
      const result = await this.intentsTransferService.createQuote({
        userId: req.user.id,
        originAsset: body.originAsset,
        amount: String(body.amount),
        destination: body.destination,
        destinationAsset: body.destinationAsset,
        recipient: body.recipient,
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
      const body = (req.body ?? {}) as { transferId?: string; depositId?: string };
      const transferId = body.transferId || body.depositId;
      if (!transferId) {
        res.status(400).json({ success: false, message: "transferId is required" });
        return;
      }
      const result = await this.intentsTransferService.execute(req.user.id, transferId, {
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
      const transferId = String(req.query.transferId ?? req.query.depositId ?? "");
      if (!transferId) {
        res.status(400).json({ success: false, message: "transferId is required" });
        return;
      }
      const result = await this.intentsTransferService.status(req.user.id, transferId);
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

interface IntentQuoteBody {
  originAsset?: string;
  amount?: string;
  destination?: "SOLANA" | "HYPERLIQUID" | "EXTERNAL";
  destinationAsset?: string;
  recipient?: string;
  refundTo?: string;
  confidential?: boolean;
  dry?: boolean;
  slippageBps?: number;
}
