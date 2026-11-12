import { prisma } from "../lib/prisma";

export class StockService {
  public async getUSStocks() {
    try {
      const stockDetails = await prisma.stocks.findMany({
        where: {
          stockType: "USStock",
        },
      });
      return stockDetails;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  public async getPreIPO() {
    try {
      const stockDetails = await prisma.stocks.findMany({
        where: {
          stockType: "PreIPO",
        },
      });
      return stockDetails;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  public async getStockDetails(stockSymbol: string, userId: string) {
    try {
      const stock = await prisma.stocks.findFirst({
        where: {
          symbol: stockSymbol,
        },
      });

      if (!stock) {
        return null;
      }

      const stockAddress = stock.tokenAddress;
      const [investments, recurringBuys, latestBuys] = await Promise.all([
        prisma.investment.findMany({
          where: {
            userId,
            stockAddress,
          },
        }),

        prisma.recurringBuyRequest.findMany({
          where: {
            userId,
            stockAddress,
          },
          orderBy: {
            id: "desc",
          },
        }),

        this.getLatestBuy(stockAddress),
      ]);

      return {
        stock,

        investment: {
          hasInvestment: investments.length > 0,
          data: investments,
        },

        recurringBuy: {
          hasRecurringBuy: recurringBuys.length > 0,
          data: recurringBuys,
        },

        latestBuys,
      };
    } catch (error) {
      console.error("Failed to fetch stock details:", error);
      throw error;
    }
  }

  public async getLatestBuy(stockAddress: string) {
    try {
      const trades = await prisma.trades.findMany({
        where: {
          stockAddress,
          tradeType: "BUY",
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 3,
      });

      return trades;
    } catch (error) {
      console.error("Failed to fetch latest buys:", error);
      throw error;
    }
  }

  public async getIndexFunds() {
    try {
      const indexFunds = await prisma.stocks.findMany({
        where: {
          stockType: "IndexFunds",
        },
      });
      return indexFunds;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  public async getPerpStocks(limit = 15, offset = 0) {
    const [stocks, total] = await prisma.$transaction([
      prisma.perpStocks.findMany({
        take: limit,
        skip: offset,
        orderBy: { id: "asc" },
      }),
      prisma.perpStocks.count(),
    ]);

    return { stocks, total };
  }

  public async searchStocks(
    q: string,
    type: "USStock" | "PreIPO" | "IndexFunds" | null,
    page = 1,
    limit = 10,
  ) {
    const skip = (page - 1) * limit;
    const where: any = {
      AND: [
        q
          ? {
              OR: [
                {
                  name: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
                {
                  symbol: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
              ],
            }
          : {},
        type ? { stockType: type } : {},
      ],
    };
    const [stocks, total] = await Promise.all([
      prisma.stocks.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          name: "asc",
        },
        select: {
          tokenAddress: true,
          name: true,
          symbol: true,
          price: true,
          imageUrl: true,
          stockType: true,
        },
      }),

      prisma.stocks.count({ where }),
    ]);
    return {
      stocks,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
      },
    };
  }
}
