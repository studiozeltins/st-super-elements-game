import type { CSSProperties } from 'react';
import './sfxPopup.css';

/**
 * Comic-callout system: every popup draws a RANDOM face, tilt, and screen spot,
 * so repeated callouts read as fresh manga panels instead of a stamped template.
 * Reused for any one-shot action word (STUNNED!, CRIT!, the DEAD! overlay text,
 * future FROZEN!/kill text, …): the word and palette are data, the burst
 * behaviour is shared.
 */

/** The five self-hosted comic faces (see main.tsx imports); one per popup. */
export const COMIC_FONTS = ['Bangers', 'Luckiest Guy', 'Bungee', 'Creepster', 'Titan One'] as const;

/** Default per-word fill rotation — comic yellow / hot red / Frost ice. */
const COMIC_COLORS = ['#ffe14d', '#ff6b4a', '#86e2ff'] as const;

/** Popup rotation range (degrees, ± both ways). */
const TILT_RANGE_DEG = 14;
// Safe center region (viewport %): random positions land here so a popup never
// sits under the HUD bars or the edge chrome.
const SAFE_X_MIN = 25;
const SAFE_X_MAX = 75;
const SAFE_Y_MIN = 20;
const SAFE_Y_MAX = 60;
const ENTRY_VARIANTS = 3;

/** The random half of a popup: face, tilt, and where in the safe region it lands. */
export interface ComicStyle {
  font: string;
  tiltDeg: number;
  /** Viewport-percent position of the popup's anchor point. */
  x: number;
  y: number;
}

export function randomComicStyle(): ComicStyle {
  return {
    font: COMIC_FONTS[Math.floor(Math.random() * COMIC_FONTS.length)],
    tiltDeg: (Math.random() * 2 - 1) * TILT_RANGE_DEG,
    x: SAFE_X_MIN + Math.random() * (SAFE_X_MAX - SAFE_X_MIN),
    y: SAFE_Y_MIN + Math.random() * (SAFE_Y_MAX - SAFE_Y_MIN),
  };
}

/**
 * One SFX popup instance — a new `key` remounts the element and restarts the
 * animation. Build these through createComicPopup, never by hand.
 */
export interface SfxPopupState extends ComicStyle {
  key: number;
  text: string;
  /** Seconds the popup lingers — match the effect it announces. */
  seconds: number;
  /** 0..1 significance — drives the text size (e.g. proximity to a slam center). */
  intensity: number;
  /** 0..2 entry side (left tilt / right tilt / top drop). */
  variant: number;
  /** Per-WORD fill cycle (word i gets colors[i % length]). */
  colors: readonly string[];
  outline?: string;
  glow?: string;
}

export interface ComicPopupOptions {
  seconds?: number;
  intensity?: number;
  /** Palette override (e.g. a single red for DEAD-adjacent words). */
  colors?: readonly string[];
  outline?: string;
  glow?: string;
}

let popupSerial = 0;

/** Builds a randomized popup for `text` — the single helper every callout uses. */
export function createComicPopup(text: string, options: ComicPopupOptions = {}): SfxPopupState {
  // Rotate the default palette by a random offset so even one-word popups
  // vary color from burst to burst.
  const paletteOffset = Math.floor(Math.random() * COMIC_COLORS.length);
  const colors =
    options.colors ??
    COMIC_COLORS.map((_, index) => COMIC_COLORS[(index + paletteOffset) % COMIC_COLORS.length]);
  return {
    ...randomComicStyle(),
    key: ++popupSerial,
    text,
    seconds: options.seconds ?? 1.1,
    intensity: options.intensity ?? 0.55,
    variant: Math.floor(Math.random() * ENTRY_VARIANTS),
    colors,
    outline: options.outline,
    glow: options.glow,
  };
}

/**
 * Manga-SFX burst: pops in with overshoot, jitters, lingers for `seconds`,
 * then fades. Purely cosmetic — gameplay consequences (input freeze etc.)
 * live in createGame/server, never here.
 */
export function SfxPopup({ state }: { state: SfxPopupState | null }) {
  if (!state) return null;
  const style = {
    '--sfx-seconds': `${state.seconds}s`,
    '--sfx-scale': (0.7 + state.intensity * 1.5).toFixed(2),
    '--sfx-font': `'${state.font}'`,
    '--sfx-x': `${state.x.toFixed(1)}%`,
    '--sfx-y': `${state.y.toFixed(1)}%`,
    '--sfx-tilt': `${state.tiltDeg.toFixed(1)}deg`,
    ...(state.outline ? { '--sfx-outline': state.outline } : null),
    ...(state.glow ? { '--sfx-glow': state.glow } : null),
  } as CSSProperties;
  return (
    <div key={state.key} className={`sfx-popup sfx-popup--v${state.variant}`} style={style}>
      {state.text.split(' ').map((word, index) => (
        <span key={index} style={{ color: state.colors[index % state.colors.length] }}>
          {index > 0 ? ' ' : ''}
          {word}
        </span>
      ))}
    </div>
  );
}
