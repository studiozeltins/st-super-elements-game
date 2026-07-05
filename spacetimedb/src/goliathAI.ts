// Pure goliath-raiding AI helpers shared by the world tick. Kept dependency-free
// so they can be unit-tested directly under the client's vitest runner.
import { distanceBetween } from './combatMath';

// A camp reduced to the fields the raider's targeting needs.
export interface GoliathTargetCamp {
  campIndex: number;
  x: number;
  z: number;
  livingCount: number;
}

// Picks a STABLE camp for a goliath to raid so it stops flip-flopping between
// near-equidistant camps every tick:
//   - keep the current target while it is still a living camp (livingCount > 0);
//   - otherwise pick the NEAREST living camp, excluding the one it just raided
//     (lastRaidedCampIndex) as long as another living camp exists — but target
//     that excluded camp anyway if it is the only camp left standing;
//   - no living camp → -1 (stand still / roam).
export function chooseGoliathTargetCamp(
  currentTargetCampIndex: number,
  lastRaidedCampIndex: number,
  campCenters: GoliathTargetCamp[],
  goliathX: number,
  goliathZ: number
): number {
  const living = campCenters.filter(camp => camp.livingCount > 0);
  if (living.length === 0) return -1;

  const currentStillLiving = living.some(camp => camp.campIndex === currentTargetCampIndex);
  if (currentStillLiving) return currentTargetCampIndex;

  const eligible = living.filter(camp => camp.campIndex !== lastRaidedCampIndex);
  const pickFrom = eligible.length > 0 ? eligible : living;
  return [...pickFrom].sort(
    (a, b) =>
      distanceBetween(goliathX, goliathZ, a.x, a.z) - distanceBetween(goliathX, goliathZ, b.x, b.z)
  )[0].campIndex;
}

// The unit facing from a movement step. Returns the normalized (to - from) when
// the goliath actually moved; falls back to the previous heading when it stayed
// put (zero-length step) so a stopped raider keeps facing where it walked in.
export function headingFromStep(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  previousHeadingX: number,
  previousHeadingZ: number
): { x: number; z: number } {
  const deltaX = toX - fromX;
  const deltaZ = toZ - fromZ;
  const distance = Math.hypot(deltaX, deltaZ);
  if (distance === 0) return { x: previousHeadingX, z: previousHeadingZ };
  return { x: deltaX / distance, z: deltaZ / distance };
}

// A raider has arrived at its camp once within the stop radius, so it stands
// among the scattered members instead of orbiting the exact center point.
export function hasReachedCamp(distanceToCamp: number, stopRadius: number): boolean {
  return distanceToCamp <= stopRadius;
}

// True if a camp member at (targetX,targetZ) lies within the goliath's forward
// arc — i.e. the goliath (at fromX,fromZ, unit heading headingX/headingZ) is
// facing it. A near-zero heading means "no facing info yet" → returns true so a
// stationary/just-spawned raider still fights. minDot = cos(half-arc).
export function isWithinForwardArc(
  headingX: number,
  headingZ: number,
  fromX: number,
  fromZ: number,
  targetX: number,
  targetZ: number,
  minDot: number
): boolean {
  const headingLength = Math.hypot(headingX, headingZ);
  if (headingLength < 1e-6) return true;
  const directionX = targetX - fromX;
  const directionZ = targetZ - fromZ;
  const directionLength = Math.hypot(directionX, directionZ);
  if (directionLength < 1e-6) return true;
  const dot =
    (headingX / headingLength) * (directionX / directionLength) +
    (headingZ / headingLength) * (directionZ / directionLength);
  return dot >= minDot;
}
