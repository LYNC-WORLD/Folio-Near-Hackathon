export const CHAIN: Record<string, string> = {
  sol: "Solana",
  eth: "Ethereum",
  base: "Base",
  arb: "Arbitrum",
  op: "Optimism",
  pol: "Polygon",
  bsc: "BNB Chain",
  avax: "Avalanche",
  btc: "Bitcoin",
  near: "NEAR",
  ton: "TON",
  tron: "Tron",
  xrp: "XRP Ledger",
  doge: "Dogecoin",
  ltc: "Litecoin",
  sui: "Sui",
  aptos: "Aptos",
  cardano: "Cardano",
  bera: "Berachain",
  gnosis: "Gnosis",
};
export const chainName = (b: string) => CHAIN[b] ?? b.toUpperCase();

export const short = (a: string, head = 6, tail = 4) =>
  a.length > head + tail + 3 ? `${a.slice(0, head)}…${a.slice(-tail)}` : a;

export const fmtPrice = (p: number) => {
  if (!(p > 0)) return "—";
  const d = p >= 1 ? 2 : p >= 0.01 ? 4 : 6;
  return (
    "$" +
    p.toLocaleString("en-US", {
      minimumFractionDigits: p >= 1 ? 2 : 0,
      maximumFractionDigits: d,
    })
  );
};

export const tint = (sym: string) => {
  let h = 0;
  for (let i = 0; i < sym.length; i++) h = (h * 31 + sym.charCodeAt(i)) % 360;
  return `hsl(${h}, 40%, 26%)`;
};