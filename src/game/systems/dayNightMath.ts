/**
 * Pure day/night math — the single source of truth for the time-of-day phase,
 * the keyframed color/intensity palette, and the lantern/firefly dusk-gate
 * scalars. ZERO imports (not even three) so every keyframe / phase / floor
 * decision is unit-testable without a renderer (mirror of windMath.ts). The
 * rendering wrapper (createDayNightCycle, Plan 04) only lerps these numbers
 * into scratch THREE.Colors — CPU math and render can never drift.
 * Deterministic by construction: everything is a function of the server clock,
 * no RNG, no allocations beyond the single returned palette struct (D-01/D-03/D-08).
 */

/** 20 real minutes in micros (20 * 60 * 1_000_000). One full day/night cycle (D-01). */
export const CYCLE_MICROS = 1_200_000_000n;

/**
 * Night exposure floor (D-03): night sun/hemisphere intensity is held to at
 * least this fraction of the day peak — night is a blue-moonlight PALETTE, never
 * a dimmer. Combat telegraphs stay readable at every time of day (DAYNITE-03).
 */
export const NIGHT_FLOOR = 0.45;

/**
 * One entry of the day/night palette curve, keyed on the normalized phase
 * [0,1). All colors are plain hex ints and all intensities/scalars plain
 * numbers — NO THREE.Color (the wrapper owns the Color instances). Adjacent
 * keys are smoothstep-blended by samplePalette.
 */
export type Keyframe = {
  /** Normalized position in the cycle, [0,1), ascending across KEYFRAMES. */
  phase: number;
  /** Sky-dome top color (hex). */
  skyTop: number;
  /** Sky-dome bottom color === fog color (hex). Single-sourced downstream (D-04). */
  horizon: number;
  /** DirectionalLight tint (hex). Direction is FROZEN (D-02); only color/intensity drift. */
  sunColor: number;
  /** DirectionalLight intensity. */
  sunIntensity: number;
  /** HemisphereLight sky color (hex). */
  hemiSky: number;
  /** HemisphereLight ground color (hex). */
  hemiGround: number;
  /** HemisphereLight intensity. */
  hemiIntensity: number;
  /** Plaza lantern intensity scalar, 0..1 — 0 by day, 1 by night (DAYNITE-04). */
  lanternLevel: number;
  /** Firefly density scalar, 0..1 — gated to dusk/night. Exposed for Phase 12, consumed by nothing here. */
  fireflyLevel: number;
};

/** The blended palette at a sampled phase — same shape as a Keyframe minus `phase`. */
export type DayNightPalette = Omit<Keyframe, 'phase'>;

/**
 * The day/night palette curve: 6 asymmetric, DAY-WEIGHTED keyframes over [0,1)
 * (D-01). Layout — flat day band [0.12, 0.50] (46%+ of the cycle when counting
 * the bright shoulders), short dawn [0.00, 0.12] and dusk [0.50, 0.82] ramps,
 * moderate night wrapping [0.82, 1.0) → [0.00].
 *
 * Night (phase 0.00 and 0.82) is BLUE MOONLIGHT: cool hemisphere + a dimmed,
 * cool-shifted sun tint held at ~50% of the day peak (≥ NIGHT_FLOOR, D-03).
 * The last key (0.82) and the first key (0.00) carry IDENTICAL values so the
 * cycle wraps continuously — no daylight flash at the 0.99→0.01 seam.
 */
export const KEYFRAMES: readonly Keyframe[] = [
  // Deep night — blue moonlight (identical to the 0.82 key: the wrap seam).
  {
    phase: 0.0,
    skyTop: 0x0a1633,
    horizon: 0x24304f,
    sunColor: 0x8fa8d6,
    sunIntensity: 0.6,
    hemiSky: 0x3a5a8c,
    hemiGround: 0x1a2338,
    hemiIntensity: 0.45,
    lanternLevel: 1,
    fireflyLevel: 1,
  },
  // Dawn — warm horizon breaking over a cool sky; lanterns/fireflies fading out.
  {
    phase: 0.12,
    skyTop: 0x5a7fb0,
    horizon: 0xe8a06a,
    sunColor: 0xffd9a0,
    sunIntensity: 0.85,
    hemiSky: 0x9fc0e0,
    hemiGround: 0x6b5a48,
    hemiIntensity: 0.55,
    lanternLevel: 0,
    fireflyLevel: 0,
  },
  // Day — bright neutral-warm (horizon 0x8ecae6 = the shipped fog hex).
  {
    phase: 0.3,
    skyTop: 0x4a90d9,
    horizon: 0x8ecae6,
    sunColor: 0xfff4e0,
    sunIntensity: 1.1,
    hemiSky: 0xbfe0f5,
    hemiGround: 0x8a9a6a,
    hemiIntensity: 0.8,
    lanternLevel: 0,
    fireflyLevel: 0,
  },
  // Midday — the brightest key (day peak; the night floor is measured against this).
  {
    phase: 0.5,
    skyTop: 0x3f86d6,
    horizon: 0x9fd3ee,
    sunColor: 0xfffdf5,
    sunIntensity: 1.2,
    hemiSky: 0xcdeaf8,
    hemiGround: 0x95a575,
    hemiIntensity: 0.9,
    lanternLevel: 0,
    fireflyLevel: 0,
  },
  // Dusk — orange horizon; lanterns/fireflies ramping up.
  {
    phase: 0.66,
    skyTop: 0x3a5578,
    horizon: 0xe07a4a,
    sunColor: 0xffb060,
    sunIntensity: 0.8,
    hemiSky: 0x8a90b0,
    hemiGround: 0x5a4a40,
    hemiIntensity: 0.55,
    lanternLevel: 0.5,
    fireflyLevel: 1,
  },
  // Night — blue moonlight (same values as phase 0.00; wraps back to it).
  {
    phase: 0.82,
    skyTop: 0x0a1633,
    horizon: 0x24304f,
    sunColor: 0x8fa8d6,
    sunIntensity: 0.6,
    hemiSky: 0x3a5a8c,
    hemiGround: 0x1a2338,
    hemiIntensity: 0.45,
    lanternLevel: 1,
    fireflyLevel: 1,
  },
] as const;

/**
 * GLSL-style smoothstep: 0 at edge0, 1 at edge1, Hermite ease between, clamped
 * outside. smoothstep(a,b,a)===0, smoothstep(a,b,b)===1, monotonic non-decreasing
 * across [a,b]. Degenerate edge0===edge1 returns a hard step.
 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Normalized time-of-day phase in [0,1) from a server-micros timestamp. The
 * modulo is taken on the BIGINT before Number() (D-08) so a realistic ~1.78e15
 * micros epoch cannot precision-drift into a wrong time of day. Negative input
 * is guarded defensively: ((n % C) + C) % C.
 */
export function phase01(nowMicros: bigint): number {
  const m = ((nowMicros % CYCLE_MICROS) + CYCLE_MICROS) % CYCLE_MICROS;
  return Number(m) / Number(CYCLE_MICROS);
}

/** Linear-blend one 0..255 channel and round to an integer byte. */
function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/** Per-channel (sRGB byte space) blend of two hex colors — the palette's color source of truth. */
function lerpHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  return (lerpChannel(ar, br, t) << 16) | (lerpChannel(ag, bg, t) << 8) | lerpChannel(ab, bb, t);
}

/** Scalar linear blend. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Sample the fully-blended palette at a normalized phase. Finds the bracketing
 * keyframes (wrapping the last key back to the first at phase+1 for seam
 * continuity) and smoothstep-blends every field. Input is normalized
 * defensively so any real number is safe.
 */
export function samplePalette(phase: number): DayNightPalette {
  const p = ((phase % 1) + 1) % 1;
  const n = KEYFRAMES.length;

  // Default to the wrap segment: last key → first key at phase + 1.
  let a: Keyframe = KEYFRAMES[n - 1];
  let b: Keyframe = KEYFRAMES[0];
  let segStart = a.phase;
  let segEnd = b.phase + 1;

  for (let i = 0; i < n - 1; i += 1) {
    if (p >= KEYFRAMES[i].phase && p < KEYFRAMES[i + 1].phase) {
      a = KEYFRAMES[i];
      b = KEYFRAMES[i + 1];
      segStart = a.phase;
      segEnd = b.phase;
      break;
    }
  }

  const localT = segEnd === segStart ? 0 : (p - segStart) / (segEnd - segStart);
  const t = smoothstep(0, 1, localT);

  return {
    skyTop: lerpHex(a.skyTop, b.skyTop, t),
    horizon: lerpHex(a.horizon, b.horizon, t),
    sunColor: lerpHex(a.sunColor, b.sunColor, t),
    sunIntensity: lerp(a.sunIntensity, b.sunIntensity, t),
    hemiSky: lerpHex(a.hemiSky, b.hemiSky, t),
    hemiGround: lerpHex(a.hemiGround, b.hemiGround, t),
    hemiIntensity: lerp(a.hemiIntensity, b.hemiIntensity, t),
    lanternLevel: lerp(a.lanternLevel, b.lanternLevel, t),
    fireflyLevel: lerp(a.fireflyLevel, b.fireflyLevel, t),
  };
}
