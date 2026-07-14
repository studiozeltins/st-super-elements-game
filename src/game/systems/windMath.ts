/**
 * Pure wind math — the single source of truth for every wind consumer (grass,
 * canopies, flags, smoke, Phase 10 audio). ZERO imports (not even three) so the
 * gust cadence / traveling-front / wander behavior is unit-testable without a
 * renderer, and the exported constants feed BOTH the JS mirrors (sampleWind,
 * gustAt) and the generated GLSL (swayGlsl, gustGlsl) — shader and CPU math can
 * never drift. Deterministic by construction: everything is a function of the
 * wind clock, no RNG, no allocations (D-06).
 */

const TAU = Math.PI * 2;

/**
 * The nine grass sway literals, verbatim from the live grass shader
 * (createGrassField.ts begin_vertex patch) — D-01/WIND-01: byte-identical
 * extraction, grass base motion is UNCHANGED.
 */
export const SWAY = {
  f1: 1.7,
  x1: 0.35,
  z1: 0.25,
  f2: 3.3,
  z2: 0.7,
  amp2: 0.4,
  ampX: 0.85,
  ampZ: 0.55,
  scale: 0.09,
} as const;

/**
 * Gust event shape (D-02/D-03/D-04). Incommensurate slow-sine periods make the
 * three factors coincide irregularly — peaks roughly every 30-60s, never
 * metronomic (tuned against the cadence test, which is the spec: gaps in
 * [20, 90]s, mean in [30, 60]s, non-uniform).
 */
export const GUST = {
  w1: TAU / 9.0,
  w2: TAU / 10.0,
  w3: TAU / 22.0,
  /** Higher = rarer, sharper peaks; the envelope rests near 0 between events. */
  sharpness: 3.0,
  /** Peak amplitude multiplier: 1 + gain ≈ 2.6× base sway at full strength (D-04). */
  gain: 1.6,
  /** Front travel speed, world units/s — a ~50u field crosses in ~4s (D-03). */
  speed: 12.0,
  /** Front width in world units (D-03: broad 30-50u wave, not a ripple). */
  wavelength: 40.0,
} as const;

/**
 * Direction wander (D-05/D-06): two summed slow sines on the angle —
 * deterministic from the clock, max rate a1·w1 + a2·w2 ≈ 0.0032 rad/s
 * (≈11°/min, under the "few degrees per minute" 0.0035 bound) while the
 * 600s primary period guarantees real movement inside any 10-minute window.
 */
export const WANDER = {
  base: 0.6,
  a1: 0.25,
  w1: TAU / 600,
  a2: 0.12,
  w2: TAU / 1300,
} as const;

/**
 * Canopy character (WIND-03/D-07): slower than grass, near-still idle, gentle
 * gust lean. The height weight ramps on height above the TREE BASE (baked
 * per-vertex into the aTreeHeight geometry attribute — terrain height never
 * enters): trees stand 5-7u with caps starting ~2.5u above their base, so the
 * ramp runs from swayBaseY over a 5u span (invSwaySpan = 1/5).
 */
export const CANOPY = {
  freq: 0.4 * SWAY.f1,
  idleAmp: 0.05,
  gustAmp: 0.35,
  phase: 0.15,
  swayBaseY: 2.0,
  invSwaySpan: 0.2,
} as const;

/**
 * Flag cloth character (WIND-03/D-08): flaps faster than grass, wave travels
 * down the cloth toward the free end, snaps taut under gusts.
 *
 * Pose constants (UAT gap fixes, tests 4/5/6/9): the cloth's yaw toward the
 * wind and its limp-hang drape are blends of these values via flagSwing /
 * flagDrape — closed forms a GLSL one-liner mirrors exactly (WIND-01).
 */
export const FLAG = {
  freq: 2.5 * SWAY.f1,
  waveK: 6.0,
  idleAmp: 0.06,
  gustAmp: 0.25,
  tautPull: 0.35,
  width: 1.1,
  height: 0.65,
  invLength: 1 / 1.1,
  /** Downwind yaw fraction at full steady strength — flags visibly point with the wind (UAT 4). */
  swingBase: 0.75,
  /** Extra alignment under a gust peak — gusts snap the cloth further downwind (UAT 5, D-04). */
  swingGust: 0.5,
  /** Lift fraction at full steady strength — between gusts the cloth keeps some sag. */
  drapeLift: 0.7,
  /** Additional gust lift: a full gust leaves only ~0.05 drape, essentially taut (D-04). */
  drapeLiftGust: 0.25,
  /** How far the cloth pitches down about the pole edge at full drape, radians (~83°, D-12). */
  drapePitch: 1.45,
  /** Residual micro-sway amplitude of a hanging flag at strength 0 (D-12: limp, not frozen). */
  limpAmp: 0.03,
  /** Micro-sway pendulum frequency — slower than grass (SWAY.f1), a lazy hanging swing. */
  limpFreq: 0.9,
} as const;

/** JS mirror of the grass two-octave sway formula (WIND-01). */
export function sampleWind(t: number, x: number, z: number): number {
  return (
    Math.sin(t * SWAY.f1 + x * SWAY.x1 + z * SWAY.z1) +
    SWAY.amp2 * Math.sin(t * SWAY.f2 + z * SWAY.z2)
  );
}

/**
 * Global gust envelope, 0..1, mostly ~0 (gusts are EVENTS). Product of three
 * incommensurate sines, clamped and sharpened. This un-retarded form is the
 * Phase 10 audio contract (audio has no spatial position).
 */
export function gustEnvelope(t: number): number {
  const raw = Math.sin(t * GUST.w1) * Math.sin(t * GUST.w2) * Math.sin(t * GUST.w3);
  return Math.pow(Math.max(0, raw), GUST.sharpness);
}

/**
 * Gust at a world position: the envelope evaluated at retarded time
 * t − dot(pos, dir)/speed — far-downwind points peak later, so the front
 * translates rigidly across the field at GUST.speed (WIND-02/D-03).
 */
export function gustAt(t: number, x: number, z: number, dirX: number, dirZ: number): number {
  return gustEnvelope(t - (x * dirX + z * dirZ) / GUST.speed);
}

/** Wind direction angle in radians — deterministic slow wander (D-05/D-06). */
export function windAngle(t: number): number {
  return WANDER.base + WANDER.a1 * Math.sin(t * WANDER.w1) + WANDER.a2 * Math.sin(t * WANDER.w2);
}

/**
 * Sway amplitude multiplier under gust (D-04/D-12). strength 0 returns exactly
 * 1 — uWindStrength=0 restores the arithmetic-identical base formula (`?nowind`).
 */
export function gustGainFactor(strength: number, gust: number): number {
  return 1 + strength * GUST.gain * gust;
}

/**
 * Fraction of yaw from the cloth's baked heading toward the wind direction,
 * 0..1 (UAT 4/5). strength 0 returns exactly 0 — with the wind off the cloth
 * never leaves its build-time heading; gusts push alignment further downwind.
 * Branch-free clamped blend (D-06/D-13) — flagSwingGlsl mirrors it exactly.
 */
export function flagSwing(strength: number, gust: number): number {
  return Math.min(1, strength * (FLAG.swingBase + FLAG.swingGust * gust));
}

/**
 * Limp-hang weight, 0..1 (D-12/D-04). strength 0 returns exactly 1 — `?nowind`
 * is a full drape (cloth pitched down FLAG.drapePitch about the pole edge);
 * wind and gusts lift the cloth toward taut. flagDrapeGlsl mirrors it exactly.
 */
export function flagDrape(strength: number, gust: number): number {
  return 1 - Math.min(1, strength * (FLAG.drapeLift + FLAG.drapeLiftGust * gust));
}

/**
 * GLSL float literal — raw integer interpolation is a GLSL int and breaks the
 * compile (the createGrassField.ts `(1 / BLADE_HEIGHT).toFixed(4)` precedent).
 */
function f(n: number): string {
  return n.toFixed(4);
}

/**
 * Two-octave grass sway expression as GLSL text, built from the SAME SWAY
 * constants sampleWind mirrors (WIND-01 single source of truth).
 */
export function swayGlsl(timeExpr: string, xExpr: string, zExpr: string): string {
  return (
    `(sin(${timeExpr} * ${f(SWAY.f1)} + ${xExpr} * ${f(SWAY.x1)} + ${zExpr} * ${f(SWAY.z1)})` +
    ` + ${f(SWAY.amp2)} * sin(${timeExpr} * ${f(SWAY.f2)} + ${zExpr} * ${f(SWAY.z2)}))`
  );
}

/**
 * Gust envelope at retarded time as GLSL text: projExpr is the world-position
 * projection onto the wind direction (dot(worldPos.xz, uWindDir)); the time
 * argument is (timeExpr − projExpr / speed) — the traveling front, the same
 * formula gustAt computes on the CPU with literals rounded to 4 decimals
 * (phase drift < 0.2 rad/h — immaterial).
 */
export function gustGlsl(timeExpr: string, projExpr: string): string {
  const tR = `(${timeExpr} - ${projExpr} / ${f(GUST.speed)})`;
  return (
    `pow(max(0.0, sin(${tR} * ${f(GUST.w1)})` +
    ` * sin(${tR} * ${f(GUST.w2)})` +
    ` * sin(${tR} * ${f(GUST.w3)})), ${f(GUST.sharpness)})`
  );
}

/**
 * Downwind swing fraction as GLSL text — EXACTLY the flagSwing closed form,
 * built from the same FLAG constants (WIND-01: shader and CPU cannot drift).
 * Consumed by createCampFlag.ts (plan 08-09).
 */
export function flagSwingGlsl(strengthExpr: string, gustExpr: string): string {
  return `min(1.0, ${strengthExpr} * (${f(FLAG.swingBase)} + ${f(FLAG.swingGust)} * ${gustExpr}))`;
}

/**
 * Limp-hang drape weight as GLSL text — EXACTLY the flagDrape closed form,
 * built from the same FLAG constants (WIND-01). strength 0 evaluates to 1.0
 * in-shader, the `?nowind` full-drape contract (D-12).
 */
export function flagDrapeGlsl(strengthExpr: string, gustExpr: string): string {
  return `(1.0 - min(1.0, ${strengthExpr} * (${f(FLAG.drapeLift)} + ${f(FLAG.drapeLiftGust)} * ${gustExpr})))`;
}
