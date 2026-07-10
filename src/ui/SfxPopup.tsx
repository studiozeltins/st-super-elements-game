import type { CSSProperties } from 'react';
import './sfxPopup.css';

/**
 * One SFX popup instance — a new `key` remounts the element and restarts the
 * animation. Reused for any one-shot action callout (STUNNED!, future FROZEN!,
 * PVP kill text, …): the text and palette are data, the burst behaviour is shared.
 */
export interface SfxPopupState {
  key: number;
  /** The callout, e.g. 'STUNNED!'. */
  text: string;
  /** Seconds the popup lingers — match the effect it announces. */
  seconds: number;
  /** 0..1 significance — drives the text size (e.g. proximity to a slam center). */
  intensity: number;
  /** 0..2 entry side (left tilt / right tilt / top drop) — cycle it per popup. */
  variant: number;
  /** Optional palette override; defaults to the stun yellow/ink/ice look. */
  fill?: string;
  outline?: string;
  glow?: string;
}

/**
 * Manga-SFX burst (Bangers font): pops in with overshoot, jitters, lingers for
 * `seconds`, then fades. Purely cosmetic — gameplay consequences (input freeze
 * etc.) live in createGame/server, never here.
 */
export function SfxPopup({ state }: { state: SfxPopupState | null }) {
  if (!state) return null;
  const style = {
    '--sfx-seconds': `${state.seconds}s`,
    '--sfx-scale': (0.7 + state.intensity * 1.5).toFixed(2),
    ...(state.fill ? { '--sfx-fill': state.fill } : null),
    ...(state.outline ? { '--sfx-outline': state.outline } : null),
    ...(state.glow ? { '--sfx-glow': state.glow } : null),
  } as CSSProperties;
  return (
    <div key={state.key} className={`sfx-popup sfx-popup--v${state.variant}`} style={style}>
      {state.text}
    </div>
  );
}
