import { orderQuote, preCheck } from "../perps";
import type { Bar } from "../perpsChart";

// $10 at 10x on a $100 limit, market allows 10x -> MMR 5%, qty 1
const base = {
  side: 1 as const,
  market: false,
  mark: 100,
  limitPx: 100,
  margin: 10,
  lev: 10,
  maxLev: 10,
  tpOn: false,
  tpIn: 0,
  slIn: 0,
  tpMode: "price" as const,
  slMode: "price" as const,
  perp: 50,
  spot: 0,
};

describe("orderQuote", () => {
  it("prices a long: size, fee, liquidation", () => {
    const q = orderQuote(base);
    expect(q.en).toBe(100);
    expect(q.notional).toBe(100);
    expect(q.qty).toBe(1);
    expect(q.fee).toBeCloseTo(0.06);
    expect(q.liq).toBeCloseTo(95);
    expect(q.dist).toBeCloseTo(5);
    expect(q.bad).toBe("");
  });

  it("puts a short's liquidation above entry", () => {
    expect(orderQuote({ ...base, side: -1 }).liq).toBeCloseTo(105);
  });

  it("market orders assume 0.03% slippage against you", () => {
    expect(orderQuote({ ...base, market: true }).en).toBeCloseTo(100.03);
    expect(orderQuote({ ...base, market: true, side: -1 }).en).toBeCloseTo(
      99.97,
    );
  });

  it("asks for a price on a limit order without one", () => {
    expect(orderQuote({ ...base, limitPx: 0 }).bad).toBe("Enter a limit price.");
  });

  it("enforces minimum margin and minimum trade size", () => {
    expect(orderQuote({ ...base, margin: 2 }).bad).toMatch(/smallest trade/);
    expect(orderQuote({ ...base, margin: 4, lev: 2 }).bad).toMatch(
      /at least \$10/,
    );
  });

  it("waits for a live price", () => {
    expect(orderQuote({ ...base, market: true, mark: 0 }).bad).toMatch(
      /Waiting/,
    );
  });

  it("rejects a take profit on the wrong side of entry", () => {
    const q = orderQuote({ ...base, tpOn: true, tpIn: 99 });
    expect(q.bad).toMatch(/Take profit has to be above/);
  });

  it("rejects a stop loss beyond liquidation", () => {
    const q = orderQuote({ ...base, tpOn: true, slIn: 94 });
    expect(q.bad).toMatch(/Stop loss has to sit between/);
  });

  it("turns % TP/SL into prices using leverage", () => {
    // +20% on margin at 10x = +2% price move
    const q = orderQuote({ ...base, tpOn: true, tpMode: "pct", tpIn: 20 });
    expect(q.tp).toBeCloseTo(102);
  });

  it("works out how much must move from spot", () => {
    const q = orderQuote({ ...base, perp: 5, spot: 100 });
    expect(q.need).toBeCloseTo(5.06);
    expect(q.needUp).toBe(5.06);
    expect(q.canMove).toBe(true);
    expect(orderQuote({ ...base, perp: 5, spot: 1 }).canMove).toBe(false);
  });
});

const day = (o: number, h: number, l: number): Bar => ({
  t: 0,
  o,
  h,
  l,
  c: o,
  v: 0,
});

describe("preCheck", () => {
  it("falls back to distance bands without enough history", () => {
    expect(preCheck("Nvidia", 1, 3, [])[0]).toBe("bad");
    expect(preCheck("Nvidia", 1, 8, [])[0]).toBe("warn");
    expect(preCheck("Nvidia", 1, 20, [])[0]).toBe("ok");
  });

  it("counts real days that moved against the trade", () => {
    // 90 calm days (1% range) ...
    const calm = Array.from({ length: 90 }, () => day(100, 101, 99));
    expect(preCheck("Nvidia", 1, 5, calm)[0]).toBe("ok");
    // ... with 3 days that fell 6% intraday: bad for longs, fine for shorts
    const drops = [...calm.slice(3), ...Array.from({ length: 3 }, () => day(100, 101, 94))];
    const [tone, text] = preCheck("Nvidia", 1, 5, drops);
    expect(tone).toBe("warn");
    expect(text).toContain("3 of the last 90 days");
    expect(preCheck("Nvidia", -1, 5, drops)[0]).toBe("ok");
  });

  it("calls it tight when it happens often", () => {
    const rough = Array.from({ length: 30 }, (_, i) =>
      i % 3 ? day(100, 101, 99) : day(100, 101, 90),
    );
    expect(preCheck("Nvidia", 1, 5, rough)[0]).toBe("bad");
  });
});
