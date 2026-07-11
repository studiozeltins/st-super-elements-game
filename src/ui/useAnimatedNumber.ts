import { useEffect, useRef, useState } from 'react';

const DURATION_MS = 600;

/**
 * Tweens the displayed number toward `target` (ease-out cubic, ~0.6s),
 * rounding to integers and settling EXACTLY on target. No rAF runs while the
 * value is idle; a target change mid-roll re-tweens from the current display.
 * `rolling` is true only while display ≠ target — drive the accent flash off it.
 */
export function useAnimatedNumber(target: number): { value: number; rolling: boolean } {
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);

  useEffect(() => {
    if (displayRef.current === target) return;
    const from = displayRef.current;
    const start = performance.now();
    let raf = 0;
    const step = (time: number) => {
      const progress = Math.min(1, (time - start) / DURATION_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = progress >= 1 ? target : Math.round(from + (target - from) * eased);
      displayRef.current = next;
      setDisplay(next);
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return { value: display, rolling: display !== target };
}
