import { Request, Response } from "express";
import {
  OnrampError,
  moonpaySellUrl,
  pickUserIp,
  transakWidgetUrl,
} from "../lib/onramp";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// the app's own deep link (folio://..., exp://...), never http(s)/javascript
const APP_REDIRECT = /^(?!https?:|javascript:|data:)[a-z][a-z0-9+.-]*:\/\/\S{0,400}$/i;

function optionalEmail(value: unknown): string | undefined {
  return typeof value === "string" && EMAIL.test(value.trim()) ? value.trim() : undefined;
}

function fail(res: Response, error: unknown, label: string) {
  if (error instanceof OnrampError) {
    res.status(error.status).json({ success: false, message: error.message });
    return;
  }
  console.log(`${label} error: `, error);
  res.status(500).json({ success: false, message: "Internal server error" });
}

export class OnrampController {
  /** POST /api/onramp/moonpay/sell-url — signed MoonPay sell widget URL. */
  public moonpaySellUrl = async (req: Request, res: Response): Promise<void> => {
    try {
      const refundAddress = req.user?.solanaWalletAddress;
      if (!refundAddress) {
        res.status(404).json({ success: false, message: "User not found" });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        res.status(400).json({ success: false, message: "amount must be a positive number" });
        return;
      }
      const redirectUrl = typeof body.redirectUrl === "string" ? body.redirectUrl : "";
      if (!APP_REDIRECT.test(redirectUrl)) {
        res.status(400).json({ success: false, message: "invalid redirectUrl" });
        return;
      }
      const url = moonpaySellUrl({
        amount,
        // refunds always go back to the user's own Folio Solana wallet
        refundAddress,
        redirectUrl,
        email: optionalEmail(body.email),
        color: typeof body.color === "string" ? body.color : undefined,
      });
      res.status(200).json({ success: true, data: { url } });
    } catch (error) {
      fail(res, error, "moonpay sell-url");
    }
  };

  /** POST /api/onramp/transak/widget-url — single-use Transak checkout URL. */
  public transakWidgetUrl = async (req: Request, res: Response): Promise<void> => {
    try {
      const walletAddress = req.user?.solanaWalletAddress;
      if (!walletAddress) {
        res.status(404).json({ success: false, message: "User not found" });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const userIp = pickUserIp(
        req.headers["x-forwarded-for"],
        req.socket.remoteAddress,
        body.userIp,
      );
      if (!userIp) {
        res.status(400).json({ success: false, message: "Could not detect your IP address" });
        return;
      }
      const url = await transakWidgetUrl({
        // card purchases always land in the user's own Folio Solana wallet
        walletAddress,
        userIp,
        email: optionalEmail(body.email),
        color: typeof body.color === "string" ? body.color : undefined,
        applePay: body.applePay === true,
      });
      res.status(200).json({ success: true, data: { url } });
    } catch (error) {
      fail(res, error, "transak widget-url");
    }
  };
}
