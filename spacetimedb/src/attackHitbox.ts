// Pure attack hitbox geometry, kept dependency-free (one pure sibling import) so
// it can be unit-tested directly under the client's vitest runner (same pattern
// as crit.ts / goliathAI.ts). No global randomness, no wall-clock time — plain
// coordinates in, plain results out (CLAUDE.md rule 2). Circle is the only shape
// this phase (ATK-06); cone (Phase 5) reuses isWithinForwardArc and lane (Phase 6)
// reuses segment projection when those phases land — no dead stubs here.
import { distanceBetween } from './combatMath';

// True when the point (px,pz) lies inside or exactly ON the circle — the edge is
// INCLUSIVE (<=), so a victim standing precisely at radius distance counts hit.
// Reuses the shared planar distance helper; no new geometry (ATK-06).
export function resolveCircleHit(
  px: number,
  pz: number,
  centerX: number,
  centerZ: number,
  radius: number
): boolean {
  return distanceBetween(px, pz, centerX, centerZ) <= radius;
}

// Returns the victim's DISPLACED position: pushed `distance` units away from the
// circle center along the normalized (victim - center) vector. A victim standing
// exactly on the center (zero-length delta) falls back to the supplied heading
// (the attacker's facing, provided by the caller) — same branch shape as
// goliathAI.headingFromStep. No world clamping here: the caller owns bounds
// policy (D4-11: knockback deaths off edges are a feature, no safety rails).
export function knockbackDisplacement(
  victimX: number,
  victimZ: number,
  centerX: number,
  centerZ: number,
  distance: number,
  fallbackHeadingX: number,
  fallbackHeadingZ: number
): { x: number; z: number } {
  const deltaX = victimX - centerX;
  const deltaZ = victimZ - centerZ;
  const deltaLength = Math.hypot(deltaX, deltaZ);
  if (deltaLength === 0) {
    return { x: victimX + fallbackHeadingX * distance, z: victimZ + fallbackHeadingZ * distance };
  }
  return {
    x: victimX + (deltaX / deltaLength) * distance,
    z: victimZ + (deltaZ / deltaLength) * distance,
  };
}
