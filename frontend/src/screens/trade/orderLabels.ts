import type { SymOrder } from "@/hooks/perps/useSymbolTrading";

export const ROLE_LABEL: Record<SymOrder["role"], string> = {
  tp: "TAKE PROFIT",
  sl: "STOP LOSS",
  stop: "STOP",
  limit: "LIMIT",
};

/** colour an order like the trade it protects or opens */
export const orderTone = (o: SymOrder): "long" | "short" =>
  o.role === "tp"
    ? "long"
    : o.role === "sl"
      ? "short"
      : o.side > 0
        ? "long"
        : "short";
