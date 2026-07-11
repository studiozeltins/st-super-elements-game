// Pure slime-hop cycle math. Slimes attack via HOP LANDINGS: the whole cycle is
// authored in MICROS (not ticks) so it is world-tick-rate independent — a
// coalesced or re-tuned tick never changes the bounce rhythm. Zero imports, no
// clock, no randomness: every timestamp and random float arrives as an argument
// (CLAUDE.md determinism rule; pure-helper testing discipline). Mirrored
// VERBATIM in src/game/data/slimeHop.ts (the client animates the bounce from
// the enemy row's hop columns); slimeHop.test.ts parity-locks both files.

// Hop airtime: how long a hop stays in the air (hopDurationMicros on the row).
export const SLIME_HOP_AIRTIME_MICROS = 550_000;
// Spiky slimes are slightly faster in the air and rest less between hops.
export const SPIKY_HOP_AIRTIME_MICROS = 480_000;
// Grounded pause between hops, jittered per landing so a camp never bounces in
// perfect unison: pause = MIN + randomFloat * (MAX - MIN).
export const SLIME_HOP_PAUSE_MIN_MICROS = 450_000;
export const SLIME_HOP_PAUSE_MAX_MICROS = 900_000;
export const SPIKY_HOP_PAUSE_MIN_MICROS = 350_000;
export const SPIKY_HOP_PAUSE_MAX_MICROS = 700_000;
// A single hop covers at most this many world units toward the move target.
export const SLIME_HOP_LENGTH = 1.6;
// Landing slam reach: players (and goliaths) within this of the landing point
// take the archetype's full contactDamage once per landing.
export const SLIME_SLAM_RADIUS = 1.3;
export const SPIKY_SLAM_RADIUS = 1.5;
// attack_strike event ids emitted on a landing that hits at least one player.
export const SLIME_SLAM_ATTACK_ID = 'slimeSlam';
export const SPIKY_SLAM_ATTACK_ID = 'spikySlam';

// The two archetypes that move (and attack) via hops; wisps + golems keep the
// smooth walk + per-tick contact damage.
export function isSlimeArchetype(archetypeId: string): boolean {
  return archetypeId === 'slime' || archetypeId === 'spikySlime';
}

export function hopAirtimeMicrosFor(spiky: boolean): bigint {
  return BigInt(spiky ? SPIKY_HOP_AIRTIME_MICROS : SLIME_HOP_AIRTIME_MICROS);
}

export function slamRadiusFor(spiky: boolean): number {
  return spiky ? SPIKY_SLAM_RADIUS : SLIME_SLAM_RADIUS;
}

export function slamAttackIdFor(spiky: boolean): string {
  return spiky ? SPIKY_SLAM_ATTACK_ID : SLIME_SLAM_ATTACK_ID;
}

// Horizontal travel speed while airborne (units/second): a full-length hop
// exactly covers SLIME_HOP_LENGTH over its airtime; shorter hops arrive early
// and wait at the locked landing (the per-tick step never overshoots).
export function hopTravelSpeedFor(spiky: boolean): number {
  return SLIME_HOP_LENGTH / (Number(hopAirtimeMicrosFor(spiky)) / 1_000_000);
}

// Hop phase predicates. hopDurationMicros 0 = grounded/idle (never hopped, or
// the last landing was already resolved).
export function isAirborne(nowMicros: bigint, hopStartedAtMicros: bigint, hopDurationMicros: bigint): boolean {
  return hopDurationMicros !== 0n && nowMicros < hopStartedAtMicros + hopDurationMicros;
}

// True on the FIRST tick at/after the hop end while the duration is still set —
// the landing tick. The tick that observes this resolves the slam and clears
// hopDurationMicros back to 0, so it fires exactly once per hop.
export function hasLanded(nowMicros: bigint, hopStartedAtMicros: bigint, hopDurationMicros: bigint): boolean {
  return hopDurationMicros !== 0n && nowMicros >= hopStartedAtMicros + hopDurationMicros;
}

// 0..1 fraction through the current hop (0 when grounded) — the client's arc
// animation input.
export function hopProgress(nowMicros: bigint, hopStartedAtMicros: bigint, hopDurationMicros: bigint): number {
  if (hopDurationMicros === 0n) return 0;
  const elapsed = Number(nowMicros - hopStartedAtMicros);
  const duration = Number(hopDurationMicros);
  if (elapsed <= 0) return 0;
  if (elapsed >= duration) return 1;
  return elapsed / duration;
}

// Grounded pause until the next hop may start, jittered from an injected random
// float in [0,1) so the reducer stays deterministic (ctx.random supplies it).
export function nextHopPauseMicros(randomFloat: number, spiky: boolean): bigint {
  const min = spiky ? SPIKY_HOP_PAUSE_MIN_MICROS : SLIME_HOP_PAUSE_MIN_MICROS;
  const max = spiky ? SPIKY_HOP_PAUSE_MAX_MICROS : SLIME_HOP_PAUSE_MAX_MICROS;
  return BigInt(Math.round(min + randomFloat * (max - min)));
}

// The landing point of a hop aimed at (targetX,targetZ): straight toward the
// target, capped at SLIME_HOP_LENGTH; a target within one hop is landed on
// exactly (never overshoots — a chasing slime lands ON the player).
export function hopLandingToward(
  fromX: number,
  fromZ: number,
  targetX: number,
  targetZ: number
): { x: number; z: number } {
  const deltaX = targetX - fromX;
  const deltaZ = targetZ - fromZ;
  const distance = Math.hypot(deltaX, deltaZ);
  if (distance <= SLIME_HOP_LENGTH || distance === 0) return { x: targetX, z: targetZ };
  return {
    x: fromX + (deltaX / distance) * SLIME_HOP_LENGTH,
    z: fromZ + (deltaZ / distance) * SLIME_HOP_LENGTH,
  };
}

// Landing-hit predicate: is a target within the slam radius of the landing?
export function landingHits(
  landingX: number,
  landingZ: number,
  targetX: number,
  targetZ: number,
  slamRadius: number
): boolean {
  return Math.hypot(targetX - landingX, targetZ - landingZ) <= slamRadius;
}
