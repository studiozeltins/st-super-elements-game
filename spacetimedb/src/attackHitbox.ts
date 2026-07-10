// Pure attack hitbox geometry, kept dependency-free (pure sibling imports only)
// so it can be unit-tested directly under the client's vitest runner (same
// pattern as crit.ts / goliathAI.ts). No global randomness, no wall-clock time —
// plain coordinates in, plain results out (CLAUDE.md rule 2). Circle (ATK-06)
// and cone (ATK-02, reusing isWithinForwardArc per the geometry-reuse mandate)
// are live; lane (Phase 6) reuses segment projection when it lands — no dead
// stubs here.
import { distanceBetween } from './combatMath';
import { isWithinForwardArc } from './goliathAI';

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

// True when the point (px,pz) lies inside the cone: within `range` of the apex
// (INCLUSIVE <=, same edge semantics as resolveCircleHit) AND within the forward
// arc of the aim vector (INCLUSIVE dot >= minDot). minDot = cos(half-angle);
// 0.5 = the 120° full-angle swing cone (D5-06). The aim vector is landing minus
// cast, NOT normalized — isWithinForwardArc normalizes internally (D5-05).
// Degenerate semantics inherited from isWithinForwardArc: a zero-length aim
// vector degrades to a 360° range check; a target standing exactly ON the apex
// counts as a point-blank hit. No new dot-product math (ATK-06 geometry reuse).
export function resolveCone(
  px: number,
  pz: number,
  apexX: number,
  apexZ: number,
  aimX: number,
  aimZ: number,
  range: number,
  minDot: number
): boolean {
  if (distanceBetween(px, pz, apexX, apexZ) > range) return false;
  return isWithinForwardArc(aimX, aimZ, apexX, apexZ, px, pz, minDot);
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
