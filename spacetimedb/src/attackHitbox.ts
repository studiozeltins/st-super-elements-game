// Pure attack hitbox geometry, kept dependency-free (pure sibling imports only)
// so it can be unit-tested directly under the client's vitest runner (same
// pattern as crit.ts / goliathAI.ts). No global randomness, no wall-clock time —
// plain coordinates in, plain results out (CLAUDE.md rule 2). Circle (ATK-06),
// cone (ATK-02, reusing isWithinForwardArc per the geometry-reuse mandate), and
// lane (ATK-04, reusing the clamp-to-[0,1] segment projection per the same
// mandate) are all live.
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

// Closest point on the segment (ax,az)->(bx,bz) to the point (px,pz): the
// standard clamp-to-[0,1] projection. The math mirrors bridges.ts
// distanceToSegment locally (ATK-06 geometry reuse) — deliberately NOT imported:
// combat stays decoupled from world topology, and the lane needs the closest
// POINT (the D6-05 per-victim knockback center), which the bridges helper does
// not return. Degenerate case: a zero-length segment returns the start point —
// resolveLane then degrades to the circle test (D6-04, same documented-degenerate
// style as resolveCone).
export function closestPointOnSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): { x: number; z: number } {
  const segmentX = bx - ax;
  const segmentZ = bz - az;
  const lengthSquared = segmentX * segmentX + segmentZ * segmentZ;
  if (lengthSquared === 0) return { x: ax, z: az };
  const projection = ((px - ax) * segmentX + (pz - az) * segmentZ) / lengthSquared;
  const clamped = Math.max(0, Math.min(1, projection));
  return { x: ax + clamped * segmentX, z: az + clamped * segmentZ };
}

// True when the point (px,pz) lies within halfWidth of the cast->landing
// centerline — the edge is INCLUSIVE (<=), same semantics as resolveCircleHit /
// resolveCone (D6-04). Capsule geometry: past either endpoint the projection
// clamps, so the lane ends in halfWidth-radius caps. Degenerate case: a
// zero-length segment (cast == landing) degrades to the circle test around that
// point (D6-04). Shares closestPointOnSegment — no duplicated projection math.
export function resolveLane(
  px: number,
  pz: number,
  castX: number,
  castZ: number,
  landingX: number,
  landingZ: number,
  halfWidth: number
): boolean {
  const closest = closestPointOnSegment(px, pz, castX, castZ, landingX, landingZ);
  return Math.hypot(px - closest.x, pz - closest.z) <= halfWidth;
}

// Lane end with OVERSHOOT (D6-02): cast + normalize(target - cast) * length —
// the charge runs a fixed distance PAST where the target stood (classic
// dodge-sideways design). The caller owns world clamping (D6-14). Degenerate
// case: a zero-length aim (target == cast) falls back to the cast point — same
// defensive delta/hypot/early-return shape as knockbackDisplacement below
// (minBand 3.5 makes it unreachable in play, but a pure helper must not NaN).
export function computeLaneEnd(
  castX: number,
  castZ: number,
  targetX: number,
  targetZ: number,
  length: number
): { x: number; z: number } {
  const deltaX = targetX - castX;
  const deltaZ = targetZ - castZ;
  const deltaLength = Math.hypot(deltaX, deltaZ);
  if (deltaLength === 0) return { x: castX, z: castZ };
  return {
    x: castX + (deltaX / deltaLength) * length,
    z: castZ + (deltaZ / deltaLength) * length,
  };
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
