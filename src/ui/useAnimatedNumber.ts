import { useEffect, useRef, useState } from 'react';

// Roll duration scales with how much the number changed: a stray gem ticks
// over quickly, a raid payout rolls long enough to feel earned. The ceiling
// matches the payout chime burst (24 ticks × 130ms ≈ 3.1s, createPickupAudio)
// so a jackpot's counter and its bells finish counting together.
const MIN_DURATION_MS = 600;
const MAX_DURATION_MS = 3100;
/** Deltas at/above this magnitude get the full roll. */
const FULL_ROLL_DELTA = 2400;
/**
 * Ease-out-back coefficient: peaks ~2% past the target mid-settle so a big
 * gain lands with a visible pop instead of an asymptotic crawl.
 */
const OVERSHOOT = 0.75;

function easeOutBack(progress: number): number {
  const u = progress - 1;
  return 1 + (OVERSHOOT + 1) * u * u * u + OVERSHOOT * u * u;
}

/**
 * Tweens the displayed number toward `target` (ease-out-back, 0.6s for small
 * changes up to ~3.1s for jackpots), rounding to integers and settling EXACTLY
 * on target. No rAF runs while the value is idle; a target change mid-roll
 * re-tweens from the current display. `rolling` is true only while
 * display ≠ target — drive the accent flash off it.
 */
export function useAnimatedNumber(target: number): { value: number; rolling: boolean } {
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);

  useEffect(() => {
    if (displayRef.current === target) return;
    const from = displayRef.current;
    const durationMs =
      MIN_DURATION_MS +
      (MAX_DURATION_MS - MIN_DURATION_MS) * Math.min(1, Math.abs(target - from) / FULL_ROLL_DELTA);
    const start = performance.now();
    let raf = 0;
    const step = (time: number) => {
      const progress = Math.min(1, (time - start) / durationMs);
      const next =
        progress >= 1 ? target : Math.round(from + (target - from) * easeOutBack(progress));
      displayRef.current = next;
      setDisplay(next);
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return { value: display, rolling: display !== target };
}
