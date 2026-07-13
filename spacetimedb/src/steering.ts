// Pure mutual-avoidance steering for walking units (goliaths + non-slime camp
// enemies). Replaces the old "walk straight and shove" pattern: a unit that
// sees a family-mate roughly AHEAD deflects around it instead of pushing
// through, and the side is chosen DETERMINISTICALLY so a facing pair splits
// apart instead of mirroring into each other. Zero imports, no clock, no
// randomness — mirrored VERBATIM in src/game/data/steering.ts and parity-locked
// by steering.test.ts.
//
// Performance note (why there is NO spatial hash): goliaths are <= 3 per
// 5-minute window and a camp has <= 5 members that only scan their own
// camp-mates, so the nearest-obstacle scan is O(family size) per unit per tick
// — a handful of hypots at 6.7Hz. A spatial hash would cost more to build each
// tick than the brute scan it replaces; revisit only if unit families grow by
// an order of magnitude.

export interface SteerObstacle {
  id: bigint;
  x: number;
  z: number;
  radius: number; // collision radius (world units)
}

// A unit starts avoiding an obstacle within this multiple of the pair's
// combined collision radii — ~2.5x means it commits to a side early enough to
// arc around instead of grazing.
export const STEER_LOOKAHEAD_RADII = 2.5;
// How hard the perpendicular component pushes at point-blank range (it scales
// linearly from 0 at the lookahead edge to this at contact). > 1 so a nearly
// touching pair turns more sideways than forward.
export const STEER_AVOID_STRENGTH = 1.25;

// Deflects a NORMALIZED desired direction around the single nearest obstacle
// that is (a) within its lookahead range and (b) roughly ahead (positive dot
// with the desired direction — units behind are ignored). Returns the desired
// direction unchanged when nothing qualifies.
//
// Side choice: the avoidance perpendicular is taken off the CANONICAL pair
// axis (lower id -> higher id), with the lower-id unit steering to +perp and
// the higher-id unit to -perp. Both units of a pair derive the SAME axis, so
// their deflections are guaranteed opposite world directions — a head-on pair
// splits, an overtaking pair arcs apart — with zero randomness.
export function steerAroundDirection(
  selfId: bigint,
  selfX: number,
  selfZ: number,
  desiredX: number,
  desiredZ: number,
  selfRadius: number,
  obstacles: readonly SteerObstacle[]
): { x: number; z: number } {
  let nearest: SteerObstacle | null = null;
  let nearestDistance = Infinity;
  let nearestLookahead = 0;
  for (const obstacle of obstacles) {
    if (obstacle.id === selfId) continue;
    const toX = obstacle.x - selfX;
    const toZ = obstacle.z - selfZ;
    const distance = Math.hypot(toX, toZ);
    const lookahead = STEER_LOOKAHEAD_RADII * (selfRadius + obstacle.radius);
    if (distance >= lookahead) continue;
    if (toX * desiredX + toZ * desiredZ <= 0) continue; // behind (or exactly beside): ignore
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = obstacle;
      nearestLookahead = lookahead;
    }
  }
  if (nearest === null) return { x: desiredX, z: desiredZ };

  // Canonical pair axis: always lower-id unit -> higher-id unit.
  const axisX = selfId < nearest.id ? nearest.x - selfX : selfX - nearest.x;
  const axisZ = selfId < nearest.id ? nearest.z - selfZ : selfZ - nearest.z;
  const axisLength = Math.hypot(axisX, axisZ);
  const side = selfId < nearest.id ? 1 : -1;
  let perpX: number;
  let perpZ: number;
  if (axisLength < 1e-6) {
    // Coincident units: no axis — fall back to the perpendicular of the unit's
    // own desired direction, still signed by id so the pair disagrees.
    perpX = -desiredZ * side;
    perpZ = desiredX * side;
  } else {
    perpX = (-axisZ / axisLength) * side;
    perpZ = (axisX / axisLength) * side;
  }
  // Proximity weight: 0 at the lookahead edge, 1 at contact.
  const weight = 1 - nearestDistance / nearestLookahead;
  const steerX = desiredX + perpX * weight * STEER_AVOID_STRENGTH;
  const steerZ = desiredZ + perpZ * weight * STEER_AVOID_STRENGTH;
  const length = Math.hypot(steerX, steerZ);
  if (length < 1e-6) return { x: perpX, z: perpZ }; // exact cancellation: dodge pure sideways
  return { x: steerX / length, z: steerZ / length };
}

// stepToward with steering: moves from (fromX,fromZ) toward the target by at
// most `step` along the steered direction. With no qualifying obstacle this is
// exactly the old straight step (never overshoots the target).
export function steeredStep(
  selfId: bigint,
  fromX: number,
  fromZ: number,
  targetX: number,
  targetZ: number,
  step: number,
  selfRadius: number,
  obstacles: readonly SteerObstacle[]
): { x: number; z: number } {
  const deltaX = targetX - fromX;
  const deltaZ = targetZ - fromZ;
  const distance = Math.hypot(deltaX, deltaZ);
  if (distance === 0) return { x: fromX, z: fromZ };
  const direction = steerAroundDirection(
    selfId,
    fromX,
    fromZ,
    deltaX / distance,
    deltaZ / distance,
    selfRadius,
    obstacles
  );
  const length = Math.min(step, distance);
  return { x: fromX + direction.x * length, z: fromZ + direction.z * length };
}
