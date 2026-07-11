// Pure camp-patrol point selection. When no player/goliath holds a camp
// member's aggro it wanders between random points on a ring around its home
// post (hopping if a slime, walking otherwise), pausing at each point — a live
// camp instead of a frozen or clumped one. Zero imports, no clock, no
// randomness: random floats arrive as arguments (ctx.random supplies them), so
// the reducer stays deterministic. Server-only (the client never simulates
// patrol — it just renders positions), tested directly across the package
// boundary by patrol.test.ts like the other server pure helpers.

// Patrol ring around the member's home post (world units): far enough out that
// the camp visibly roams, capped so members never wander off their camp site.
export const PATROL_MIN_RADIUS = 2;
export const PATROL_MAX_RADIUS = 5;
// Within this of the patrol point counts as arrived (pick a new point + rest).
export const PATROL_ARRIVE_DISTANCE = 0.6;
// Rest at each patrol point before setting out again: MIN + float * JITTER.
export const PATROL_REST_MIN_MICROS = 1_000_000;
export const PATROL_REST_JITTER_MICROS = 2_000_000;

// How long a member rests at a patrol point, from an injected random float.
export function patrolRestMicros(randomFloat: number): bigint {
  return BigInt(Math.round(PATROL_REST_MIN_MICROS + randomFloat * PATROL_REST_JITTER_MICROS));
}

// A candidate patrol point on the [PATROL_MIN_RADIUS, PATROL_MAX_RADIUS] ring
// around home, from two injected random floats in [0,1).
export function patrolCandidate(
  homeX: number,
  homeZ: number,
  angleRandom: number,
  radiusRandom: number
): { x: number; z: number } {
  const angle = angleRandom * Math.PI * 2;
  const radius = PATROL_MIN_RADIUS + radiusRandom * (PATROL_MAX_RADIUS - PATROL_MIN_RADIUS);
  return { x: homeX + Math.cos(angle) * radius, z: homeZ + Math.sin(angle) * radius };
}

// Anti-clump pick: of two candidate points, take the one FARTHER from the
// nearest same-camp neighbour, so members drift apart instead of piling onto
// the same spot. Two samples + one distance check beat any O(n^2) repulsion
// pass — camps are <= 5 members, this runs once per arrival, not per tick.
// With no neighbour (last member standing) the first candidate wins.
export function pickPatrolPoint(
  candidateAX: number,
  candidateAZ: number,
  candidateBX: number,
  candidateBZ: number,
  neighbor: { x: number; z: number } | null
): { x: number; z: number } {
  if (neighbor === null) return { x: candidateAX, z: candidateAZ };
  const distanceA = Math.hypot(candidateAX - neighbor.x, candidateAZ - neighbor.z);
  const distanceB = Math.hypot(candidateBX - neighbor.x, candidateBZ - neighbor.z);
  return distanceA >= distanceB
    ? { x: candidateAX, z: candidateAZ }
    : { x: candidateBX, z: candidateBZ };
}
