import { Router } from "express";
import { DepositController } from "../controllers/depositController";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

const depositController = new DepositController();

router.post("/perp-to-spot", authMiddleware, depositController.createWithdrawRequest);

router.get("/check-withdraw-status", authMiddleware, depositController.checkWithdrawStatus);

router.get("/intents/tokens", authMiddleware, depositController.listIntentTokens);
router.post("/intents/quote", authMiddleware, depositController.quoteIntentDeposit);
router.post("/intents/execute", authMiddleware, depositController.executeIntentDeposit);
router.get("/intents/status", authMiddleware, depositController.intentDepositStatus);

export { router as depositRoute };