import { prisma } from "../lib/prisma";
import { Prisma } from "../generated/client";

const XSTOCKS_API = "https://api.xstocks.fi/api/v2";
const JUPITER_API = "https://api.jup.ag/price/v3?ids=";
const HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info";

export async function updateStockPrices(): Promise<void> {
  try {
    await Promise.all([
      updateSpotStockPrice(false),
      updatePerpStockPrice(),
    ]);
    console.log("Stock price update completed");
  } catch (error) {
    console.error("Stock price cron failed:", error);
  }
}

export async function updateDailyOpenPrices(): Promise<void> {
  try {
    await Promise.all([
      updateSpotStockPrice(true)
    ]);
    console.log("[DailyOpenPrice] Update completed");
  } catch (error) {
    console.error("[DailyOpenPrice] Cron failed:", error);
  }
}

async function updateSpotStockPrice(updateDailyPrice: boolean) {
  const BATCH_SIZE = 40;
  const API_TIMEOUT = 15_000;

  const stocks = await prisma.stocks.findMany({
    select: {
      tokenAddress: true,
    },
  });

  const totalStocks = stocks.length;

  console.log(`Starting price update for ${totalStocks} stocks...`);

  if (totalStocks === 0) {
    console.log("No stocks found.");
    return;
  }

  const updateField = updateDailyPrice
    ? "marketOpenPrice"
    : "price";

  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  const totalBatches = Math.ceil(totalStocks / BATCH_SIZE);

  for (let i = 0; i < totalStocks; i += BATCH_SIZE) {
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

    const batch = stocks.slice(i, i + BATCH_SIZE);

    try {
      // 1. Prepare Jupiter API request
      const addresses = batch
        .map((stock) => stock.tokenAddress)
        .join(",");

      const response = await fetch(
        `${JUPITER_API}${addresses}`,
        {
          method: "GET",
          signal: AbortSignal.timeout(API_TIMEOUT),
        }
      );

      // 2. Validate API response
      if (!response.ok) {
        throw new Error(
          `Jupiter API returned ${response.status}: ${response.statusText}`
        );
      }

      const data: Record<string, TokenPriceData> =
        await response.json();

      // 3. Extract and validate prices
      const priceUpdates = Object.entries(data)
        .filter(([address, tokenData]) => {
          const price = tokenData?.stockData?.price;

          return (
            batch.some(
              (stock) => stock.tokenAddress === address
            ) &&
            typeof price === "number" &&
            Number.isFinite(price) &&
            price > 0
          );
        })
        .map(([address, tokenData]) => ({
          address,
          price: tokenData.stockData.price.toString(),
        }));

      if (priceUpdates.length === 0) {
        skippedCount += batch.length;

        console.warn(
          `Batch ${batchNumber}/${totalBatches}: No valid prices returned`
        );

        continue;
      }

      // 4. Perform a single PostgreSQL bulk update
      const values = priceUpdates.map(
        ({ address, price }) =>
          Prisma.sql`(${address}, ${price})`
      );

      const result = await prisma.$executeRaw`
        UPDATE "Stocks" AS s
        SET ${Prisma.raw(`"${updateField}"`)} = v.price
        FROM (
          VALUES ${Prisma.join(values)}
        ) AS v(address, price)
        WHERE s."tokenAddress" = v.address
      `;

      updatedCount += result;
      skippedCount += batch.length - priceUpdates.length;

      console.log(
        `Batch ${batchNumber}/${totalBatches}: Updated ${result}/${batch.length} stocks`
      );

    } catch (error) {
      failedCount += batch.length;

      console.error(
        `Batch ${batchNumber}/${totalBatches} failed:`,
        error
      );
    }
  }
  console.log("Stock price update completed");
}

async function updatePerpStockPrice() {
  try {
    const response = await fetch(HYPERLIQUID_INFO_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "metaAndAssetCtxs",
        dex: "xyz",
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Hyperliquid API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as HyperliquidResponse;
    const [meta, assetContexts] = data;

    const stocks = await prisma.perpStocks.findMany();

    if (stocks.length === 0) {
      console.log("No perp stocks found in database");
      return;
    }

    const marketMap = new Map<string, AssetContext>();

    meta.universe.forEach((asset, index) => {
      const context = assetContexts[index];

      if (context) {
        marketMap.set(asset.name, context);
      }
    });

    // Prepare data instead of creating individual Prisma queries.
    const updates: {
      id: string;
      price: string;
      changeInPrice: string;
    }[] = [];

    for (const stock of stocks) {
      const marketName = `xyz:${stock.marketSymbol}`;
      const context = marketMap.get(marketName);

      if (!context) {
        console.warn(`Hyperliquid market not found: ${marketName}`);
        continue;
      }

      const markPx = Number(context.markPx);
      const prevDayPx = Number(context.prevDayPx);

      if (
        !Number.isFinite(markPx) ||
        !Number.isFinite(prevDayPx) ||
        prevDayPx === 0
      ) {
        console.warn(`Invalid price data for ${stock.marketSymbol}`);
        continue;
      }

      const changeInPrice = ((markPx - prevDayPx) / prevDayPx) * 100;

      updates.push({
        id: stock.id,
        price: markPx.toString(),
        changeInPrice: changeInPrice.toFixed(4),
      });
    }

    if (updates.length === 0) {
      console.log("No stocks needed updating");
      return;
    }

    // PostgreSQL: update every stock with one SQL statement.
    const values = updates.map(
      (stock) => Prisma.sql`
        (${stock.id}, ${stock.price}, ${stock.changeInPrice})
      `,
    );

    const updatedCount = await prisma.$executeRaw(
      Prisma.sql`
        UPDATE "PerpStocks" AS p
        SET
          "price" = v.price,
          "changeInPrice" = v.change_in_price
        FROM (
          VALUES ${Prisma.join(values)}
        ) AS v(id, price, change_in_price)
        WHERE p.id = v.id
      `,
    );

    console.log(`Successfully updated ${updatedCount} perp stocks`);
  } catch (error) {
    console.error("Error updating perp stock prices:", error);
  }
}
interface PreStock {
  name: string;
  symbol: string;
  image: string;
  contract_address: string;
  markPrice: number;
  markValuation: number;
  tokenPrice: number;
  impliedValuation: number;
  supply: number;
}
interface XStocksPriceResponse {
  quote?: string | number;
  [key: string]: any;
}

interface AssetContext {
  funding: string;
  openInterest: string;
  prevDayPx: string;
  dayNtlVlm: string;
  premium: string | null;
  oraclePx: string;
  markPx: string;
  midPx: string | null;
  impactPxs: string[] | null;
  dayBaseVlm: string;
}

interface HyperliquidAsset {
  szDecimals: number;
  name: string;
  maxLeverage: number;
}

interface TokenPriceData {
  createdAt: string;
  usdPrice: number;
  blockId: number;
  decimals: number;
  priceChange24h?: number;
  stockData: any;
}

type HyperliquidResponse = [
  {
    universe: HyperliquidAsset[];
    marginTables: unknown[];
    collateralToken: number;
  },
  AssetContext[],
];

(async () => {
  try {
    updateSpotStockPrice(true);
  } catch (error) {
    console.error("Error executing async code:", error);
  }
})();
