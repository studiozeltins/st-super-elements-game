import { useEffect, useRef, useState } from 'react';
import { gemBurstSeconds } from '../game/audio/createPickupAudio';

// Roll duration = the payout chime burst for the same delta (pure helper from
// createPickupAudio, tiered up to ~10s) plus a settle tail, so a jackpot's
// counter and its bells finish counting together.
const MIN_DURATION_MS = 600;
const SETTLE_TAIL_MS = 400;
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
 * changes up to ~10s for the largest jackpots), rounding to integers and
 * settling EXACTLY on target. No rAF runs while the value is idle; a target change mid-roll
 * re-tweens from the current display. `rolling` is true only while
 * display ≠ target — drive the accent flash off it.
 */
export function useAnimatedNumber(target: number): { value: number; rolling: boolean } {
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);

  useEffect(() => {
    if (displayRef.current === target) return;
    const from = displayRef.current;
    const durationMs = Math.max(
      MIN_DURATION_MS,
      gemBurstSeconds(Math.abs(target - from)) * 1000 + SETTLE_TAIL_MS
    );
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
