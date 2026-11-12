import { Router } from "express";
import { TradeController } from "../controllers/tradeController";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

const tradeController = new TradeController();

router.post("/get-quote-buy", authMiddleware, tradeController.getQuoteBuy);
router.post("/get-quote-sell", authMiddleware, tradeController.getQuoteSell);

router.post("/stock-buy", authMiddleware, tradeController.buyStocks);
router.post("/stock-sell", authMiddleware, tradeController.sellStocks);

router.post("/start-recurring-buy", authMiddleware, tradeController.startRecurringBuy);

router.post("/create-limit-order", authMiddleware, tradeController.createLimitOrder);

router.post("/get-spot-orders", authMiddleware, tradeController.getOpenOrders);

router.post("/cancel-limit-order", authMiddleware, tradeController.cancelOpenOrder);

export { router as tradeRoutes };