// src/lib/perpsChart.ts — chart types and indicator maths (MA, EMA, Bollinger, VWAP, RSI, Heikin-Ashi)

export type Bar = { t: number; o: number; h: number; l: number; c: number; v: number };
export const TF_SEC: Record<string, number> = { "1m": 60, "5m": 300, "15m": 900, "1H": 3600, "4H": 14400, "1D": 86400, "1W": 604800 };
export type ChartType = "candles" | "ha" | "bars" | "line" | "area";
export const CTYPES: [ChartType, string][] = [["candles", "Candles"], ["ha", "Heikin-Ashi"], ["bars", "Bars"], ["line", "Line"], ["area", "Area"]];
export type IndKey = "vol" | "ma" | "ema" | "bb" | "vwap" | "rsi";
export const CIND: [IndKey, string, string][] = [
  ["vol", "Volume", "#6B737E"], ["ma", "MA 20", "#E8A33D"], ["ema", "EMA 50", "#6FA8F5"],
  ["bb", "Bollinger 20, 2", "#C79BF0"], ["vwap", "VWAP", "#F07F9B"], ["rsi", "RSI 14", "#7FD3E0"],
];

export function haOf(b: Bar[]): Bar[] {
  const out: Bar[] = [];
  b.forEach((x, i) => {
    const c = (x.o + x.h + x.l + x.c) / 4, o = i ? (out[i - 1].o + out[i - 1].c) / 2 : (x.o + x.c) / 2;
    out.push({ t: x.t, o, c, h: Math.max(x.h, o, c), l: Math.min(x.l, o, c), v: x.v });
  });
  return out;
}
export function sma(v: number[], n: number): (number | null)[] {
  const o: (number | null)[] = new Array(v.length).fill(null); let s = 0;
  for (let i = 0; i < v.length; i++) { s += v[i]; if (i >= n) s -= v[i - n]; if (i >= n - 1) o[i] = s / n; }
  return o;
}
export function ema(v: number[], n: number): (number | null)[] {
  const k = 2 / (n + 1); let e = v[0];
  return v.map((x, i) => { e = i ? x * k + e * (1 - k) : x; return i >= n - 1 ? e : null; });
}
export function bands(v: number[], n: number, m: number): ([number, number] | null)[] {
  const mid = sma(v, n);
  return mid.map((x, i) => {
    if (x == null) return null;
    let s = 0; for (let j = i - n + 1; j <= i; j++) s += (v[j] - x) ** 2;
    const sd = Math.sqrt(s / n);
    return [x + m * sd, x - m * sd];
  });
}
export function vwapOf(b: Bar[]): number[] {
  let pv = 0, vv = 0;
  return b.map((x) => { pv += ((x.h + x.l + x.c) / 3) * x.v; vv += x.v; return pv / vv; });
}
export function rsiOf(v: number[], n: number): (number | null)[] {
  const o: (number | null)[] = new Array(v.length).fill(null); let g = 0, l = 0;
  for (let i = 1; i < v.length; i++) {
    const d = v[i] - v[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0);
    if (i <= n) { g += up; l += dn; if (i === n) { g /= n; l /= n; o[i] = 100 - 100 / (1 + g / (l || 1e-9)); } }
    else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; o[i] = 100 - 100 / (1 + g / (l || 1e-9)); }
  }
  return o;
}
export function niceStep(x: number) {
  const e = Math.pow(10, Math.floor(Math.log10(x))), f = x / e;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * e;
}
