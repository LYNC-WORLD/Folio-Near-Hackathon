import { Router } from "express";
import { OnrampController } from "../controllers/onrampController";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

const onrampController = new OnrampController();

router.post("/moonpay/sell-url", authMiddleware, onrampController.moonpaySellUrl);
router.post("/transak/widget-url", authMiddleware, onrampController.transakWidgetUrl);

export { router as onrampRoutes };
