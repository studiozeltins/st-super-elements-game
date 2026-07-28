/**
 * Spike-only, on-device water tuning applied AFTER `water.loadPreset(...)`.
 *
 * Two knobs the go/no-go asked for, both driven by query params so they can be
 * dialled from the control bar without a rebuild:
 *
 *  - sea style (`?sea=`) — how transparent vs painterly the surface reads.
 *    Water Pro is physical Beer-Lambert: shallow water shows the seabed because
 *    `absorptionColor` (per-channel 1/world-unit extinction, clear ocean ≈
 *    #0a0503) is tiny. Raising it uniformly turns the sea opaque within a metre
 *    or two — the stylised, flat pixel-art look. `waterColor` is the intrinsic
 *    infinite-depth in-scatter colour.
 *
 *  - swell size (`?swell=`) — wave HEIGHT via `water.waves.amplitude` (default
 *    1 world unit). Independent of `?waves=` which only scales animation SPEED.
 *
 * All writes are guarded: the WebGL2 fallback exposes a thinner surface, so a
 * missing accessor must never crash the spike. Nothing in src/game imports this.
 */
import type { WaterSystem } from "../vendor/threejs-water-pro";

export type SeaStyle = "real" | "stylised" | "flat";
export type Swell = "normal" | "calm" | "flat";

const S = () =>
  typeof window === "undefined" ? "" : window.location.search;

/** `?sea=real|stylised|flat`, default `real` (untouched physical preset). */
export function seaStyleFromQuery(): SeaStyle {
  const m = /sea=(real|stylised|flat)/.exec(S());
  return (m?.[1] as SeaStyle) ?? "real";
}

/** `?swell=normal|calm|flat`, default `normal` (preset amplitude). */
export function swellFromQuery(): Swell {
  const m = /swell=(normal|calm|flat)/.exec(S());
  return (m?.[1] as Swell) ?? "normal";
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Apply the sea-style knob (transparency + colour). Safe on WebGL2. */
export function applySeaStyle(water: WaterSystem, style: SeaStyle): void {
  if (style === "real") return;
  const color = (water as any).color;
  if (!color) return;
  // stylised: opaque within a few metres, saturated teal. flat: near-fully
  // opaque flat sheet + damped sparkle for the most pixel-art reading.
  const cfg =
    style === "flat"
      ? { water: "#0e5570", absorb: "#b4b4b4", sparkle: 0.15 }
      : { water: "#12617f", absorb: "#6e6e6e", sparkle: 0.6 };
  try {
    color.waterColor = cfg.water;
  } catch {
    /* fallback surface may lack the setter */
  }
  try {
    color.absorptionColor = cfg.absorb;
  } catch {
    /* absorption not exposed on this backend */
  }
  try {
    const sparkle = (water as any).sparkle;
    if (sparkle) sparkle.intensity = cfg.sparkle;
  } catch {
    /* sparkle optional */
  }
}

/** Apply the swell knob (wave height). Safe on WebGL2. */
export function applySwell(water: WaterSystem, swell: Swell): void {
  if (swell === "normal") return;
  const waves = (water as any).waves;
  if (!waves) return;
  const amp = swell === "flat" ? 0.22 : 0.5;
  const chop = swell === "flat" ? 0.3 : 0.55;
  try {
    waves.amplitude = amp;
  } catch {
    /* amplitude locked on this backend */
  }
  try {
    if ("choppiness" in waves && typeof waves.choppiness === "number") {
      waves.choppiness = chop;
    }
  } catch {
    /* choppiness optional */
  }
}
