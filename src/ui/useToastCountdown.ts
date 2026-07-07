import { useEffect, useRef, useState } from 'react';

// Matches the .party-toast exit keyframe duration (0.3s) — keep in sync with CSS.
const EXIT_MS = 300;

// Client-side auto-dismiss countdown for a toast. Runs for `durationMs`, PAUSES on
// hover/focus (a keyboard user is never timed out mid-read, Pitfall 5), and on
// timeout plays the exit animation then calls `onExpire` — NO reducer call, so the
// invite persists server-side (D-08) and stays in the Settings missed list.
//
// Returns the live `leaving` / `paused` flags plus ready-to-spread pause handlers,
// so the presentational component stays free of timer logic.
export function useToastCountdown(durationMs: number, onExpire: () => void) {
  const [paused, setPaused] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // Remaining time so hover/focus truly PAUSES (not restarts) the countdown.
  const remainingRef = useRef(durationMs);
  // Latest onExpire without re-arming the exit timer on every render.
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (paused || leaving) return;
    const startedAt = Date.now();
    const timer = window.setTimeout(() => setLeaving(true), remainingRef.current);
    return () => {
      window.clearTimeout(timer);
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAt));
    };
  }, [paused, leaving]);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => onExpireRef.current(), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  const pauseHandlers = {
    onMouseEnter: () => setPaused(true),
    onMouseLeave: () => setPaused(false),
    onFocus: () => setPaused(true),
    onBlur: () => setPaused(false),
  };

  return { leaving, paused, pauseHandlers };
}
