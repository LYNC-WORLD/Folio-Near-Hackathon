// Pure chart geometry: turn visible candles into SVG path strings, price grid lines
// and time-axis ticks. Everything here is plain maths on the inputs (no React).
import { niceStep, type Bar, type ChartType } from "@/lib/perpsChart";

export const f1 = (v: number) => v.toFixed(1);

/** visible window: candles i0..i1, x position of candle i, y position of a price */
export type Frame = {
  i0: number;
  i1: number;
  xi: (i: number) => number;
  y: (price: number) => number;
};

/** polyline through the non-null values, broken at gaps (indicators) */
export function linePath(arr: (number | null)[] | null, { i0, i1, xi, y }: Frame) {
  if (!arr) return "";
  let d = "",
    pen = false;
  for (let i = i0; i <= i1; i++) {
    const v = arr[i];
    if (v == null) {
      pen = false;
      continue;
    }
    d += (pen ? "L" : "M") + f1(xi(i)) + " " + f1(y(v));
    pen = true;
  }
  return d;
}

/** candles / OHLC bars / volume as a handful of big paths (much cheaper to redraw while panning) */
export function candlePaths(
  view: Bar[],
  frame: Frame,
  opts: { type: ChartType; bw: number; vol: boolean; vmax: number; MH: number },
) {
  const { i0, i1, xi, y } = frame;
  const { type, bw, vol, vmax, MH } = opts;
  const lineOnly = type === "line" || type === "area";
  let wickUp = "",
    wickDn = "",
    bodyUp = "",
    bodyDn = "",
    volUp = "",
    volDn = "";
  const half = Math.max(0.5, bw * 0.35);
  if (!lineOnly || vol) {
    const tick = Math.max(1.5, bw * 0.43);
    for (let i = i0; i <= i1; i++) {
      const b = view[i],
        x = xi(i),
        up = b.c >= b.o;
      if (type === "bars") {
        const d = `M${f1(x)} ${f1(y(b.h))}V${f1(y(b.l))}M${f1(x - tick)} ${f1(y(b.o))}H${f1(x)}M${f1(x)} ${f1(y(b.c))}H${f1(x + tick)}`;
        if (up) wickUp += d;
        else wickDn += d;
      } else if (!lineOnly) {
        const yo = y(b.o),
          yc = y(b.c),
          h = Math.max(1, Math.abs(yo - yc));
        const w = `M${f1(x)} ${f1(y(b.h))}V${f1(y(b.l))}`;
        const r = `M${f1(x - half)} ${f1(Math.min(yo, yc))}h${f1(half * 2)}v${f1(h)}h${f1(-half * 2)}Z`;
        if (up) {
          wickUp += w;
          bodyUp += r;
        } else {
          wickDn += w;
          bodyDn += r;
        }
      }
      if (vol) {
        const h = (b.v / (vmax || 1)) * MH * 0.15;
        const r = `M${f1(x - half)} ${f1(MH - h)}h${f1(half * 2)}v${f1(h)}h${f1(-half * 2)}Z`;
        if (up) volUp += r;
        else volDn += r;
      }
    }
  }
  return { wickUp, wickDn, bodyUp, bodyDn, volUp, volDn };
}

/** round price levels between lo and hi that land inside the plot */
export function priceGrid(lo: number, hi: number, y: (p: number) => number, MH: number) {
  const step = niceStep((hi - lo) / 5);
  const grid: number[] = [];
  for (let p = Math.ceil(lo / step) * step; p <= hi; p += step) {
    const Y = y(p);
    if (Y < 6 || Y > MH - 4) continue;
    grid.push(p);
  }
  return grid;
}

/** "14:30", or "3 Mar" on daily/weekly charts and where the day changes */
export function timeLabel(t: number, tf: string, prevT?: number) {
  const d = new Date(t * 1000);
  if (tf === "1W" || tf === "1D")
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  if (prevT != null && new Date(prevT * 1000).getDate() !== d.getDate())
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    String(d.getHours()).padStart(2, "0") +
    ":" +
    String(d.getMinutes()).padStart(2, "0")
  );
}

/** one label roughly every 64px (`every` candles), pinned to fixed candles so they slide with the chart */
export function timeTicks(iN: number, { i0, i1, xi }: Frame, bw: number, PW: number) {
  const every = Math.max(1, Math.ceil(64 / bw));
  const ticks: number[] = [];
  for (let i = iN - Math.ceil((iN - i1) / every) * every; i >= i0; i -= every) {
    const x = xi(i);
    if (x > 24 && x < PW - 4) ticks.push(i);
  }
  return { ticks, every };
}
