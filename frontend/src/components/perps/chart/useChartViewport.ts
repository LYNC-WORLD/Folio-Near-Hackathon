// Chart viewport: zoom (candle width) + how far you have scrolled back, driven by
// drag (with inertia), pinch and press-and-hold crosshair. Locks the parent ScrollView
// while a gesture is active.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Gesture } from "react-native-gesture-handler";
import { hTap } from "@/lib/haptics";

export const BW0 = 7; // default candle slot width (px)
const BW_MIN = 2; // most zoomed out
const BW_MAX = 30; // most zoomed in
export const RP = 35; // empty space to the right of the newest candle (px)
export const MIN_BARS = 8; // never scroll the last few candles off screen
export type Vp = { bw: number; off: number };
export const clamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));

export function useChartViewport({
  sym,
  tf,
  fs,
  lastT,
  onScrollLock,
}: {
  sym: string;
  tf: string;
  /** full-screen stage: any drag pans (inline, only horizontal drags do) */
  fs: boolean;
  /** time of the newest candle */
  lastT: number;
  onScrollLock?: (l: boolean) => void;
}) {
  const [cross, setCross] = useState<{ x: number; y: number } | null>(null);
  const [vp, setVp] = useState<Vp>({ bw: BW0, off: 0 });

  // latest geometry / callbacks for the gesture handlers (they are created once)
  const geo = useRef({ n: 0, PW: 0 });
  const lockRef = useRef(onScrollLock);
  lockRef.current = onScrollLock;
  const fling = useRef<number | null>(null);
  const stopFling = useCallback(() => {
    if (fling.current != null) cancelAnimationFrame(fling.current);
    fling.current = null;
  }, []);
  useEffect(() => stopFling, [stopFling]);

  // new market or timeframe -> snap back to the latest candle (zoom level is kept)
  useEffect(() => {
    stopFling();
    setVp((v) => (v.off === 0 ? v : { ...v, off: 0 }));
  }, [sym, tf, stopFling]);

  // while you are looking at history, a new candle must not shift the view
  const prevT = useRef(0);
  useEffect(() => {
    if (prevT.current && lastT > prevT.current)
      setVp((v) => (v.off > 0 ? { ...v, off: v.off + 1 } : v));
    prevT.current = lastT;
  }, [lastT]);

  // ---- gestures
  const gesture = useMemo(() => {
    const fit = (bw: number, off: number): Vp => ({
      bw: clamp(bw, BW_MIN, BW_MAX),
      off: clamp(off, 0, Math.max(0, geo.current.n - MIN_BARS)),
    });
    // parent ScrollView lock, counted so overlapping gestures do not unlock each other
    let held = 0;
    const session = () => {
      let on = false;
      return {
        start() {
          if (on) return;
          on = true;
          if (held++ === 0) lockRef.current?.(true);
        },
        end() {
          if (!on) return;
          on = false;
          held = Math.max(0, held - 1);
          if (held === 0) lockRef.current?.(false);
        },
      };
    };

    // --- drag to scroll. Uses the finger position inside the chart (e.x) rather than
    // translationX so it also works when the full-screen stage is rotated 90 degrees.
    const ps = session();
    let lastX = 0,
      lastAt = 0,
      vel = 0; // px per second
    const pan = (
      fs
        ? Gesture.Pan().minDistance(6)
        : // inline: only grab horizontal drags, leave vertical ones to the page scroll
          Gesture.Pan().activeOffsetX([-8, 8]).failOffsetY([-14, 14])
    )
      .runOnJS(true)
      .maxPointers(1)
      .onBegin(() => stopFling())
      .onStart((e) => {
        lastX = e.x;
        lastAt = Date.now();
        vel = 0;
        ps.start();
      })
      .onUpdate((e) => {
        const now = Date.now(),
          dx = e.x - lastX,
          dt = Math.max(1, now - lastAt);
        lastX = e.x;
        lastAt = now;
        vel = vel * 0.6 + (dx / dt) * 1000 * 0.4;
        setVp((v) => fit(v.bw, v.off + dx / v.bw));
      })
      .onEnd(() => {
        // inertia: keep gliding after a quick flick
        if (Date.now() - lastAt > 80 || Math.abs(vel) < 150) return;
        let v0 = vel,
          t = Date.now();
        const tick = () => {
          const now = Date.now(),
            dt = (now - t) / 1000;
          t = now;
          v0 *= Math.exp(-4 * dt);
          if (Math.abs(v0) < 25) {
            fling.current = null;
            return;
          }
          setVp((v) => fit(v.bw, v.off + (v0 * dt) / v.bw));
          fling.current = requestAnimationFrame(tick);
        };
        fling.current = requestAnimationFrame(tick);
      })
      .onFinalize(() => ps.end());

    // --- pinch to zoom, keeping the candle under your fingers in place
    const zs = session();
    let lastScale = 1;
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onStart(() => {
        stopFling();
        lastScale = 1;
        zs.start();
      })
      .onUpdate((e) => {
        const k = e.scale / (lastScale || 1);
        lastScale = e.scale;
        const A = geo.current.PW - RP - e.focalX;
        setVp((v) => {
          const bw = clamp(v.bw * k, BW_MIN, BW_MAX);
          return fit(bw, v.off + A / v.bw - A / bw);
        });
      })
      .onFinalize(() => zs.end());

    // --- press and hold for the crosshair
    const cs = session();
    const crossG = Gesture.Pan()
      .runOnJS(true)
      .maxPointers(1)
      .activateAfterLongPress(220)
      .onStart((e) => {
        stopFling();
        cs.start();
        hTap();
        setCross({ x: e.x, y: e.y });
      })
      .onUpdate((e) => setCross({ x: e.x, y: e.y }))
      .onFinalize(() => {
        cs.end();
        setCross(null);
      });

    return Gesture.Race(crossG, Gesture.Simultaneous(pan, pinch));
  }, [fs, stopFling]);

  const toLatest = useCallback(() => {
    stopFling();
    setVp((v) => ({ ...v, off: 0 }));
  }, [stopFling]);

  /** `geo` must be kept current by the renderer: candle count + plot width */
  return { vp, cross, gesture, geo, toLatest };
}
