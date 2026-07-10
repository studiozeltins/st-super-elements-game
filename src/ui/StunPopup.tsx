import type { CSSProperties } from 'react';
import './stunPopup.css';

/** One stun popup instance — a new `key` remounts the element and restarts the animation. */
export interface StunPopupState {
  key: number;
  /** Seconds the popup lingers = the stun window the server enforced. */
  seconds: number;
  /** 0..1 proximity to the slam center — drives the text size. */
  intensity: number;
  /** 0..2 entry side (left tilt / right tilt / top drop) — cycled per stun. */
  variant: number;
}

/**
 * Manga-SFX "STUNNED!" burst (Bangers font): pops in with overshoot, jitters,
 * lingers for the full stun duration, then fades. Purely cosmetic — the input
 * freeze itself is createGame's render-stun window + the server's rejection.
 */
export function StunPopup({ state }: { state: StunPopupState | null }) {
  if (!state) return null;
  const style = {
    '--stun-seconds': `${state.seconds}s`,
    '--stun-scale': (0.7 + state.intensity * 1.5).toFixed(2),
  } as CSSProperties;
  return (
    <div key={state.key} className={`stun-popup stun-popup--v${state.variant}`} style={style}>
      STUNNED!
    </div>
  );
}
