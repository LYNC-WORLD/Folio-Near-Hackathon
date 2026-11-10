import { Request, Response } from "express";
import { StockService } from "../services/stockServices";

export class StockController {
  private stockService: StockService;

  constructor() {
    this.stockService = new StockService();
  }

  public getUSStocks = async (req: Request, res: Response): Promise<void> => {
    try {
      const stocks = await this.stockService.getUSStocks();
      if (!stocks) {
        res.status(500).json({
          success: false,
          message: "Internal server error: error fetching stocks",
        });
        return;
      }
      res.status(200).json({
        success: true,
        message: "stocks list",
        data: stocks,
      });
      return;
    } catch (error) {
      console.log(error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  };

  public getStockBySymbol = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const { stockSymbol } = req.params;

      if (!stockSymbol || Array.isArray(stockSymbol)) {
        res.status(400).json({
          success: false,
          message: "Invalid stock symbol",
        });
        return;
      }

      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      const stockDetails = await this.stockService.getStockDetails(
        stockSymbol,
        userId,
      );

      if (!stockDetails) {
        res.status(404).json({
          success: false,
          message: "Stock not found",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "Stock details fetched successfully",
        data: stockDetails,
      });
    } catch (error) {
      console.error("Get stock details error:", error);

      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  };

  public getPreIPOs = async (req: Request, res: Response): Promise<void> => {
    try {
      const stocks = await this.stockService.getPreIPO();
      if (!stocks) {
        res.status(500).json({
          success: false,
          message: "Internal server error: error fetching stocks",
        });
        return;
      }
      res.status(200).json({
        success: true,
        message: "stocks list",
        data: stocks,
      });
      return;
    } catch (error) {
      console.log(error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  };

  public getLatestBuy = async (req: Request, res: Response): Promise<void> => {
    try {
      const { stockAddress } = req.query;

      if (!stockAddress || typeof stockAddress !== "string") {
        res.status(400).json({
          success: false,
          message: "stockAddress is required",
        });
        return;
      }

      const trades = await this.stockService.getLatestBuy(stockAddress);

      res.status(200).json({
        success: true,
        message: "Latest 3 buys fetched successfully",
        data: trades,
      });
    } catch (error) {
      console.error("Get latest buys error:", error);

      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  };

  public getIndexFunds = async (req: Request, res: Response): Promise<void> => {
    try {
      const indexFunds = await this.stockService.getIndexFunds();

      res.status(200).json({
        success: true,
        message: "list of index funds",
        data: indexFunds,
      });
    } catch (error) {
      console.error("can not fetch index funds:", error);

      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  };

  public getPerpStocks = async (req: Request, res: Response): Promise<void> => {
    try {
      const DEFAULT_LIMIT = 15;
      const MAX_LIMIT = 30;

      const rawLimit = req.query.limit as string | undefined;
      const rawOffset = req.query.offset as string | undefined;

      const limit = rawLimit !== undefined ? Number(rawLimit) : DEFAULT_LIMIT;
      const offset = rawOffset !== undefined ? Number(rawOffset) : 0;

      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
        res.status(400).json({
          success: false,
          message: `limit must be an integer between 1 and ${MAX_LIMIT}`,
        });
        return;
      }

      if (!Number.isInteger(offset) || offset < 0) {
        res.status(400).json({
          success: false,
          message: "offset must be a non-negative integer",
        });
        return;
      }

      const { stocks, total } = await this.stockService.getPerpStocks(
        limit,
        offset,
      );

      res.status(200).json({
        success: true,
        message: "list of perp stocks",
        data: stocks,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + stocks.length < total,
        },
      });
    } catch (error) {
      console.error("can not fetch perp stocks:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  };
}
