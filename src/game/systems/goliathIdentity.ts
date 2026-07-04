// Goliath raiders are client-simulated, but their spawns must be identical on
// every client so the server-tracked hoard (and enemy-vs-enemy gem transfer)
// lines up with the same raider everywhere. We divide time into fixed 5-minute
// windows and mint one deterministic batch per window: seed the shared PRNG from
// the window bucket, roll a member count (1..3) and a size per member, then hand
// each member a fixed enemy_carry slot id. Same time bucket → identical batch.

import { createSeededRandom } from '../world/rng';
import {
  GOLIATH_ARCHETYPES_BY_SIZE,
  type GoliathArchetype,
} from '../data/goliathArchetypes';

/** Fixed server enemy_carry ids for the raiders — at most three alive at once. */
export const GOLIATH_SLOT_IDS = [900001n, 900002n, 900003n] as const;

/** One raider batch per 5-minute window. */
export const GOLIATH_BATCH_WINDOW_MICROS = 300_000_000n;

// Salts the per-window seed so raider rolls don't echo any other seeded system.
const GOLIATH_BATCH_SEED = 0x901a7;
// 2^32 — keeps the (unbounded) time bucket inside the PRNG's u32 seed range.
const SEED_MODULUS = 0x100000000n;

export interface GoliathSpawnDescriptor {
  slotId: bigint;
  archetype: GoliathArchetype;
}

function seedForWindowBucket(windowBucket: bigint): number {
  return (Number(windowBucket % SEED_MODULUS) ^ GOLIATH_BATCH_SEED) >>> 0;
}

/**
 * The deterministic raider batch for the window containing serverTimeMicros.
 * Pure: identical output for any two times in the same 5-minute window, on every
 * client. Batch length is always 1..3 with unique, in-order slot ids.
 */
export function goliathBatchForTime(serverTimeMicros: bigint): GoliathSpawnDescriptor[] {
  const windowBucket = serverTimeMicros / GOLIATH_BATCH_WINDOW_MICROS;
  const random = createSeededRandom(seedForWindowBucket(windowBucket));

  const memberCount = 1 + Math.floor(random() * GOLIATH_SLOT_IDS.length);
  const batch: GoliathSpawnDescriptor[] = [];
  for (let memberIndex = 0; memberIndex < memberCount; memberIndex++) {
    const sizeIndex = Math.floor(random() * GOLIATH_ARCHETYPES_BY_SIZE.length);
    batch.push({
      slotId: GOLIATH_SLOT_IDS[memberIndex],
      archetype: GOLIATH_ARCHETYPES_BY_SIZE[sizeIndex],
    });
  }
  return batch;
}
