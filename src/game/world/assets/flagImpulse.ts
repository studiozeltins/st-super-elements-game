/**
 * Pure projectile-impulse math for camp flags — ZERO imports (not even three),
 * mirroring windMath's discipline, so the decay curve and the distance gate are
 * unit-testable without a renderer. Both consumers read from HERE so CPU and
 * GLSL can never drift: the cloth shader (createCampFlag.ts) reads the impulse
 * through per-flag uniforms, and the world (createMondstadtWorld.ts) sets fresh
 * kicks + decays live ones with these functions and constants.
 */

/**
 * Per-flag projectile impulse state, held on `cloth.userData.flagImpulse`.
 * dirX/dirZ is the WORLD-space normalized travel direction of the shot that
 * kicked the flag; mag is the transient magnitude (1 on a fresh kick) that
 * decays to 0 over the settle window. A mag of 0 is the idle no-op state.
 */
export interface FlagImpulse {
  dirX: number;
  dirZ: number;
  mag: number;
}

/**
 * Settle window (seconds) for a projectile kick — inside the UAT's ~0.3–0.6s
 * ask. A fresh kick (mag 1) linearly relaxes to 0 over this span.
 */
export const FLAG_IMPULSE_DECAY_SECONDS = 0.45;

/**
 * How near a projectile must pass a flag's world xz to kick it. Distance-gated
 * so only flags beside an active shot pay any cost (three.js CPU-overhead rule).
 */
export const FLAG_DISTURB_RADIUS = 3.0;

/**
 * Linear decay of an impulse magnitude toward 0 over `decaySeconds`, clamped so
 * it never goes negative. A zero (idle) impulse stays zero — the world decay
 * loop calls this only on flags with a live impulse and stops once it hits 0.
 */
export function decayFlagImpulse(mag: number, deltaSeconds: number, decaySeconds: number): number {
  return Math.max(0, mag - deltaSeconds / decaySeconds);
}

/**
 * Distance gate: true when the offset (dx,dz) from a flag to a point is within
 * `radius`. Squared compare — no sqrt, no allocation.
 */
export function withinDisturbRadius(dx: number, dz: number, radius: number): boolean {
  return dx * dx + dz * dz <= radius * radius;
}
