export type AssetStackParamList = {
  IndexFundDetail: { id: string };
  StockDetail: {
    symbol: string;
    category: "us-stock" | "pre-ipo";
  };
};
