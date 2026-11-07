import { money, pct, qtyFmt, sMoney, sPct, sideTxt } from "../format";

describe("format", () => {
  it("money: dollars with cents and thousands separators", () => {
    expect(money(1234.5)).toBe("$1,234.50");
    expect(money(0)).toBe("$0.00");
  });

  it("signed money and percent use a true minus sign", () => {
    expect(sMoney(12.3)).toBe("+$12.30");
    expect(sMoney(-4)).toBe("−$4.00");
    expect(pct(-1.44)).toBe("−1.4%");
    expect(sPct(2.154)).toBe("+2.15%");
  });

  it("qtyFmt: fewer decimals for bigger sizes", () => {
    expect(qtyFmt(150)).toBe("150.0");
    expect(qtyFmt(1.23456)).toBe("1.235");
    expect(qtyFmt(0.123456)).toBe("0.1235");
  });

  it("sideTxt", () => {
    expect(sideTxt(1)).toBe("LONG");
    expect(sideTxt(-1)).toBe("SHORT");
  });
});
