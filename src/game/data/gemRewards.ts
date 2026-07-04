// The base gem stipend every enemy carries from spawn, mirrored from the server
// so the client's kill/raid payout preview always agrees with what the server
// actually pays. Regular enemies scale with their reward tier (bosses pay
// ×BOSS_GEM_MULTIPLIER); goliath raiders draw a fixed, size-indexed stipend.
//
// This is the single client-side home for that math. It MUST stay in sync with
// enemyBaseGems() and its constants in spacetimedb/src/index.ts (enforced by
// src/game/data/__tests__/serverSync.test.ts).

// BOSS_GEM_MULTIPLIER already lives in gemDrops.ts (the gem-drop economy). Re-use
// that single source rather than redeclaring the literal here.
import { BOSS_GEM_MULTIPLIER } from './gemDrops';

export { BOSS_GEM_MULTIPLIER };

export const KILL_REWARD_PRIMOGEMS = 40;

/** Reward tiers run 1..3; higher tiers pay proportionally more. */
const MAX_KILL_REWARD_TIER = 3;

/** A goliath raider's own stipend, indexed by size (0 = small, 1, 2 = large). */
export const GOLIATH_BASE_GEMS_BY_SIZE = [500, 1000, 2000] as const;

function clampToRange(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/** Base gems for a regular enemy of the given reward tier. Bosses pay triple. */
export function regularEnemyBaseGems(rewardTier: number, isBoss: boolean): number {
  const clampedTier = clampToRange(rewardTier, 1, MAX_KILL_REWARD_TIER);
  return KILL_REWARD_PRIMOGEMS * clampedTier * (isBoss ? BOSS_GEM_MULTIPLIER : 1);
}

/** Base gems for a goliath raider of the given size, clamped into range. */
export function goliathBaseGems(goliathSizeIndex: number): number {
  const lastIndex = GOLIATH_BASE_GEMS_BY_SIZE.length - 1;
  return GOLIATH_BASE_GEMS_BY_SIZE[clampToRange(goliathSizeIndex, 0, lastIndex)];
}
