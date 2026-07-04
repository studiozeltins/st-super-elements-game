import { useEffect, useState } from 'react';
import type { DbConnection } from '../module_bindings';

// Frames-per-second sampled from requestAnimationFrame over a 500ms window.
// Only runs its rAF loop while enabled, so there's no cost when the FPS overlay
// is off.
export function useFps(enabled: boolean): number {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let frames = 0;
    let last = performance.now();
    const loop = (now: number) => {
      frames++;
      const elapsed = now - last;
      if (elapsed >= 500) {
        setFps(Math.round((frames * 1000) / elapsed));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);
  return fps;
}

// Round-trip latency in ms, measured by timing the no-op `ping` reducer call
// (client → server → confirmation) every 2s. null while disabled or if a call
// fails. Only polls while enabled.
export function usePing(connection: DbConnection | null, enabled: boolean): number | null {
  const [ping, setPing] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled || !connection) {
      setPing(null);
      return;
    }
    let cancelled = false;
    const measure = async () => {
      const start = performance.now();
      try {
        await connection.reducers.ping({});
        if (!cancelled) setPing(Math.round(performance.now() - start));
      } catch {
        if (!cancelled) setPing(null);
      }
    };
    void measure();
    const timer = window.setInterval(() => void measure(), 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [connection, enabled]);
  return ping;
}
