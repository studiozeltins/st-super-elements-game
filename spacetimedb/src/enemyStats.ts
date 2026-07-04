// Server-side enemy + goliath stats, ported from the client data so the
// server-authoritative fight uses the same numbers the client renders. Kept in
// sync with:
//   src/game/data/enemyArchetypes.ts   (per-archetype stats + boss multipliers)
//   src/game/systems/enemyIdentity.ts  (members-per-camp, stable ids)
//   src/game/data/goliathArchetypes.ts (goliath size stats)
//   src/game/systems/goliathIdentity.ts(per-window seeded batch)
import { createSeededRandom } from './rng';
import type { CampArchetypeId } from './worldGen';

export interface EnemyArchetypeStat {
  maxHealth: number;
  contactDamage: number;
  moveSpeed: number;
  collisionRadius: number;
  mass: number;
  rewardTier: number;
}

// Mirrors ENEMY_ARCHETYPES in src/game/data/enemyArchetypes.ts.
export const ENEMY_ARCHETYPE_STATS: Record<CampArchetypeId, EnemyArchetypeStat> = {
  slime: { maxHealth: 320, contactDamage: 45, moveSpeed: 3.4, collisionRadius: 0.65, mass: 0.8, rewardTier: 1 },
  spikySlime: { maxHealth: 450, contactDamage: 70, moveSpeed: 4.0, collisionRadius: 0.7, mass: 1.1, rewardTier: 2 },
  windWisp: { maxHealth: 280, contactDamage: 60, moveSpeed: 5.4, collisionRadius: 0.55, mass: 0.45, rewardTier: 2 },
  stoneGolem: { maxHealth: 900, contactDamage: 110, moveSpeed: 2.0, collisionRadius: 0.85, mass: 3.2, rewardTier: 3 },
};

// Mirrors src/game/data/enemyArchetypes.ts boss multipliers.
export const BOSS_HEALTH_MULTIPLIER = 2.5;
export const BOSS_DAMAGE_MULTIPLIER = 1.5;

// Mirrors src/game/systems/enemyIdentity.ts.
export const PACK_SIZE_PER_CAMP = 4;
export const MEMBERS_PER_CAMP = PACK_SIZE_PER_CAMP + 1;
const CAMP_ID_STRIDE = 100;

// Stable, cross-client id for the given camp/member (camp index + member index).
export function enemyIdFor(campIndex: number, memberIndex: number): number {
  return campIndex * CAMP_ID_STRIDE + memberIndex;
}

// Member 0 of every camp is the boss.
export function isBossMember(memberIndex: number): boolean {
  return memberIndex === 0;
}

export function enemyMaxHealth(archetypeId: CampArchetypeId, isBoss: boolean): number {
  return Math.round(
    ENEMY_ARCHETYPE_STATS[archetypeId].maxHealth * (isBoss ? BOSS_HEALTH_MULTIPLIER : 1)
  );
}

export function enemyContactDamage(archetypeId: CampArchetypeId, isBoss: boolean): number {
  return Math.round(
    ENEMY_ARCHETYPE_STATS[archetypeId].contactDamage * (isBoss ? BOSS_DAMAGE_MULTIPLIER : 1)
  );
}

export interface GoliathSizeStat {
  maxHealth: number;
  contactDamage: number;
  moveSpeed: number;
  collisionRadius: number;
  splashesOnAttack: boolean;
}

// Mirrors GOLIATH_ARCHETYPES_BY_SIZE in src/game/data/goliathArchetypes.ts.
export const GOLIATH_SIZE_STATS: readonly GoliathSizeStat[] = [
  { maxHealth: 2600, contactDamage: 90, moveSpeed: 3.2, collisionRadius: 0.8, splashesOnAttack: false },
  { maxHealth: 4200, contactDamage: 130, moveSpeed: 2.7, collisionRadius: 1.0, splashesOnAttack: false },
  { maxHealth: 6500, contactDamage: 170, moveSpeed: 2.2, collisionRadius: 1.3, splashesOnAttack: true },
];

// Ported from goliathBatchForTime() in src/game/systems/goliathIdentity.ts: seed
// the PRNG from the 5-minute window bucket, roll a member count (1..3) and a size
// per member. Returns the size index for each raider; the caller assigns slot
// ids. Same bucket → identical batch, so the server spawns a deterministic wave
// per window (sizes match the client's own roll for that bucket).
const GOLIATH_BATCH_SEED = 0x901a7;
const SEED_MODULUS = 0x100000000n; // 2^32 keeps the bucket inside the u32 seed range
export const MAX_GOLIATHS_PER_WINDOW = 3;

function seedForWindowBucket(windowBucket: bigint): number {
  return (Number(windowBucket % SEED_MODULUS) ^ GOLIATH_BATCH_SEED) >>> 0;
}

export function goliathBatchForWindow(windowBucket: bigint): number[] {
  const random = createSeededRandom(seedForWindowBucket(windowBucket));
  const memberCount = 1 + Math.floor(random() * MAX_GOLIATHS_PER_WINDOW);
  const sizeIndices: number[] = [];
  for (let memberIndex = 0; memberIndex < memberCount; memberIndex++) {
    sizeIndices.push(Math.floor(random() * GOLIATH_SIZE_STATS.length));
  }
  return sizeIndices;
}
