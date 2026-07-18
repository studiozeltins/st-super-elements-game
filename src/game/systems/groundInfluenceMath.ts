import { WORLD_BOUND } from '../data/constants';

/**
 * Pure math for the ground influence map — the world-space top-down texture
 * that records grass bend/flatten so blades can react to anything that moves.
 * Kept free of THREE so it is unit-testable.
 */

/** Matches TERRAIN_SIZE in world/terrain.ts (WORLD_BOUND * 2 + 12). */
export const INFLUENCE_WORLD_MIN = -(WORLD_BOUND + 6);
export const INFLUENCE_WORLD_SIZE = (WORLD_BOUND + 6) * 2;

/** Trail persistence tuned at 60fps; footsteps read a ~2s springy fade
 * (0.980^120 ≈ 0.09 at 2s, ≈ 0.03 by 3s). */
const DECAY_PER_FRAME_AT_60 = 0.980;

/** World XZ → influence-map UV (0..1 on both axes). */
export function worldToInfluenceUv(x: number, z: number): { u: number; v: number } {
  return {
    u: (x - INFLUENCE_WORLD_MIN) / INFLUENCE_WORLD_SIZE,
    v: (z - INFLUENCE_WORLD_MIN) / INFLUENCE_WORLD_SIZE,
  };
}

/**
 * Bend direction → RG encoding (dir * 0.5 + 0.5). Zero/degenerate vectors
 * encode as the neutral (0.5, 0.5) = "no push", used by radial-only stamps.
 */
export function encodeBendDirection(dx: number, dz: number): { r: number; g: number } {
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return { r: 0.5, g: 0.5 };
  return { r: (dx / length) * 0.5 + 0.5, g: (dz / length) * 0.5 + 0.5 };
}

/** Frame-rate-independent trail decay factor for one frame of `deltaSeconds`. */
export function decayForDelta(deltaSeconds: number): number {
  return Math.pow(DECAY_PER_FRAME_AT_60, deltaSeconds * 60);
}

/**
 * Trampled/destroyed grass (the influence map's A "wear" channel) regrows on a
 * much slower clock than the springy bend: fresh damage still visibly reads when
 * the player returns ~1min later (exp(-t/75) ≈ 0.45 at 60s) and heals below 0.1
 * over a couple more minutes (≈ 0.09 at 180s / ~2.88min), light footpath wear sooner.
 */
const WEAR_REGROW_TIME_CONSTANT_SECONDS = 75;

/** Frame-rate-independent wear (regrow) decay factor for one frame. */
export function wearDecayForDelta(deltaSeconds: number): number {
  return Math.exp(-deltaSeconds / WEAR_REGROW_TIME_CONSTANT_SECONDS);
}
