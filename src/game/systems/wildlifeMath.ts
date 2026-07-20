/**
 * Pure wildlife math — the single source of truth for the butterfly and firefly
 * factories. The ONLY import is `fireflyLevelForPhase` from ./dayNightMath (the one
 * shipped time-of-day channel that gates day vs dusk/night, sampled ALLOCATION-FREE
 * for the per-frame gate); no THREE, no RNG, no I/O — so the wander, pulse,
 * spawn/cull ring, and day gate are all unit-testable without a renderer, mirroring
 * windMath.ts / dayNightMath.ts.
 *
 * Deterministic by construction: every helper is a closed form of its inputs.
 * Allocation-free hot path: the motion helpers write into caller-owned scratch
 * (out-params) or return a scalar, never a fresh object — the render factories
 * keep persistent scratch and this module never heap-allocates per call. All
 * tunables live in the exported `as const` bundles so the vitest twin
 * single-sources them and CPU math can never drift from the tuning.
 */

import { fireflyLevelForPhase } from './dayNightMath';

/**
 * Butterfly flutter (WILD-01): two incommensurate summed sines per axis
 * (a1·f1 slow + a2·f2 faster) give a bounded, non-repeating wander box of
 * |offset| <= a1 + a2 around each anchor, plus a slow vertical bob.
 */
export const WANDER = { a1: 0.6, f1: 0.9, a2: 0.25, f2: 2.3, bobAmp: 0.35, bobFreq: 1.1 } as const;

/**
 * Firefly glow (WILD-03): a sine shimmer floored so a firefly never goes fully
 * dark (stays readable). `rate` sets the pulse speed; `floor` the minimum glow.
 */
export const PULSE = { rate: 1.6, floor: 0.15 } as const;

/**
 * Spawn/cull annulus around the player (WILD-01), world units: spawn only in the
 * [inner, outer] ring (never on top of the player, never past the visible edge),
 * cull anything past `cull`.
 */
export const SPAWN = { inner: 8, outer: 22, cull: 30 } as const;

/**
 * True in the daylight band — the inverse of a lit firefly gate. Butterflies are
 * a day creature, so they use this; fireflies use fireflyLevelAt > 0. Both read
 * the ONE shipped fireflyLevel channel so day/dusk can never disagree.
 */
export function isDayTime(phase: number): boolean {
  return fireflyLevelForPhase(phase) < 0.01;
}

/** The dusk/night firefly density scalar 0..1 at a normalized phase (WILD-03 gate). */
export function fireflyLevelAt(phase: number): number {
  return fireflyLevelForPhase(phase);
}

/**
 * Per-butterfly drift offset from its wander anchor, on the shared wind clock
 * (WILD-01). Two incommensurate summed sines per axis → bounded (|x|,|z| <=
 * a1 + a2), continuous, and non-repeating within any realistic window. OUT-PARAM:
 * writes into `out` and returns nothing so the factory reuses one scratch object.
 */
export function butterflyWander(t: number, seed: number, out: { x: number; z: number }): void {
  out.x = WANDER.a1 * Math.sin(t * WANDER.f1 + seed) + WANDER.a2 * Math.sin(t * WANDER.f2 + seed * 1.7);
  out.z = WANDER.a1 * Math.cos(t * WANDER.f1 + seed * 1.3) + WANDER.a2 * Math.cos(t * WANDER.f2 + seed * 0.7);
}

/** Slow vertical bob for a butterfly, bounded by WANDER.bobAmp (WILD-01). */
export function butterflyBob(t: number, seed: number): number {
  return WANDER.bobAmp * Math.sin(t * WANDER.bobFreq + seed);
}

/**
 * Per-firefly glow in [floor, 1] with a decorrelating phase offset so the swarm
 * shimmers instead of blinking in unison (WILD-03). Periodic (period 2π/rate).
 */
export function fireflyPulse(t: number, phaseOffset: number): number {
  const s = 0.5 + 0.5 * Math.sin(t * PULSE.rate + phaseOffset);
  return PULSE.floor + (1 - PULSE.floor) * s;
}

/** True when (dx,dz) falls in the [inner, outer] spawn annulus (WILD-01). Squared-distance compare. */
export function inSpawnRing(dx: number, dz: number): boolean {
  const d2 = dx * dx + dz * dz;
  return d2 >= SPAWN.inner * SPAWN.inner && d2 <= SPAWN.outer * SPAWN.outer;
}

/** True when (dx,dz) is past the cull radius — the creature should despawn (WILD-01). */
export function beyondCull(dx: number, dz: number): boolean {
  return dx * dx + dz * dz > SPAWN.cull * SPAWN.cull;
}
