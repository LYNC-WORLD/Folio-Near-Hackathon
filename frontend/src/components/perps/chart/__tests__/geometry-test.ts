import { linePath, priceGrid, timeTicks, type Frame } from "../geometry";

// candle i sits at x = 10 * i, price p at y = 100 - p
const frame: Frame = { i0: 0, i1: 4, xi: (i) => i * 10, y: (p) => 100 - p };

describe("chart geometry", () => {
  it("linePath breaks the line at gaps", () => {
    expect(linePath([1, 2, null, 4, 5], frame)).toBe(
      "M0.0 99.0L10.0 98.0M30.0 96.0L40.0 95.0",
    );
    expect(linePath(null, frame)).toBe("");
  });

  it("priceGrid only returns levels inside the plot", () => {
    const grid = priceGrid(0, 50, (p) => 100 - p, 100);
    expect(grid.length).toBeGreaterThan(2);
    grid.forEach((p) => expect(p).toBeGreaterThanOrEqual(0));
    grid.forEach((p) => expect(p).toBeLessThanOrEqual(50));
  });

  it("timeTicks spaces labels ~64px apart and reports the step", () => {
    const f: Frame = { i0: 0, i1: 99, xi: (i) => i * 8, y: (p) => p };
    const { ticks, every } = timeTicks(99, f, 8, 800);
    expect(every).toBe(8);
    for (let k = 1; k < ticks.length; k++)
      expect(ticks[k - 1] - ticks[k]).toBe(every);
  });
});
