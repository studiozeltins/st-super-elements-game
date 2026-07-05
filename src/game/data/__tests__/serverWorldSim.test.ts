// Parity + determinism tests for the server-authoritative world simulation.
// The server (spacetimedb/src/*) spawns camps and goliath raiders from ported,
// pure helpers; these tests import those helpers directly and assert they stay
// byte-for-byte in step with the client generators they were ported from. If the
// packages ever stop cross-importing, replace the direct imports with a captured
// fixture — but today vitest resolves the server .ts files fine.
import { describe, expect, it } from 'vitest';

// Client (source of truth) generators.
import { createSeededRandom as clientSeededRandom } from '../../world/rng';
import { getCampSites } from '../../world/camps';
import { GOLIATH_ARCHETYPES_BY_SIZE } from '../goliathArchetypes';

// The 5-minute raider window, owned by the server now (client no longer schedules
// goliaths). Kept as a literal here purely to drive windowBucketFor's math test.
const GOLIATH_BATCH_WINDOW_MICROS = 300_000_000n;
import {
  BOSS_DAMAGE_MULTIPLIER,
  BOSS_HEALTH_MULTIPLIER,
  ENEMY_ARCHETYPES,
  type EnemyArchetypeId,
} from '../enemyArchetypes';

// Server ports under test.
import { createSeededRandom as serverSeededRandom } from '../../../../spacetimedb/src/rng';
import { generateCampSites } from '../../../../spacetimedb/src/worldGen';
import {
  ENEMY_ARCHETYPE_STATS,
  GOLIATH_SIZE_STATS,
  MEMBERS_PER_CAMP,
  enemyContactDamage,
  enemyIdFor,
  enemyMaxHealth,
  goliathBatchForWindow,
  isBossMember,
} from '../../../../spacetimedb/src/enemyStats';
import {
  damagePerTick,
  distanceBetween,
  gemIsCollectible,
  stepToward,
  windowBucketFor,
} from '../../../../spacetimedb/src/combatMath';
import {
  chooseGoliathTargetCamp,
  headingFromStep,
  hasReachedCamp,
  isWithinForwardArc,
  type GoliathTargetCamp,
} from '../../../../spacetimedb/src/goliathAI';

describe('server createSeededRandom is a verbatim mulberry32 port', () => {
  it('draws the identical sequence to the client for the same seed', () => {
    const server = serverSeededRandom(0x5eed5);
    const client = clientSeededRandom(0x5eed5);
    const serverSequence = Array.from({ length: 100 }, () => server());
    const clientSequence = Array.from({ length: 100 }, () => client());
    expect(serverSequence).toEqual(clientSequence);
  });

  it('is deterministic and stays in [0, 1)', () => {
    const first = Array.from({ length: 50 }, serverSeededRandom(42));
    const second = Array.from({ length: 50 }, serverSeededRandom(42));
    expect(first).toEqual(second);
    for (const value of first) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('server generateCampSites matches the client getCampSites exactly', () => {
  it('is deterministic across calls', () => {
    expect(generateCampSites()).toEqual(generateCampSites());
  });

  it('produces the identical camps (position + archetype) the client draws props for', () => {
    // This is the load-bearing parity assertion: server enemies must spawn where
    // the client renders tents/totems, so both generators must agree exactly.
    expect(generateCampSites()).toEqual(getCampSites());
  });
});

describe('server enemy stats mirror the client archetypes (incl. boss multipliers)', () => {
  const ids = Object.keys(ENEMY_ARCHETYPES) as EnemyArchetypeId[];

  it.each(ids)('%s base stats match', id => {
    const client = ENEMY_ARCHETYPES[id];
    expect(ENEMY_ARCHETYPE_STATS[id]).toMatchObject({
      maxHealth: client.maxHealth,
      contactDamage: client.contactDamage,
      moveSpeed: client.moveSpeed,
      collisionRadius: client.collisionRadius,
      mass: client.mass,
      rewardTier: client.rewardTier,
    });
  });

  it.each(ids)('%s boss-adjusted health + damage match the client formula', id => {
    const client = ENEMY_ARCHETYPES[id];
    expect(enemyMaxHealth(id, false)).toBe(Math.round(client.maxHealth));
    expect(enemyMaxHealth(id, true)).toBe(Math.round(client.maxHealth * BOSS_HEALTH_MULTIPLIER));
    expect(enemyContactDamage(id, false)).toBe(Math.round(client.contactDamage));
    expect(enemyContactDamage(id, true)).toBe(Math.round(client.contactDamage * BOSS_DAMAGE_MULTIPLIER));
  });
});

describe('server goliath size stats mirror the client goliath archetypes', () => {
  it('has one entry per client size with matching combat stats', () => {
    expect(GOLIATH_SIZE_STATS).toHaveLength(GOLIATH_ARCHETYPES_BY_SIZE.length);
    GOLIATH_ARCHETYPES_BY_SIZE.forEach((client, sizeIndex) => {
      expect(GOLIATH_SIZE_STATS[sizeIndex]).toEqual({
        maxHealth: client.maxHealth,
        contactDamage: client.contactDamage,
        moveSpeed: client.moveSpeed,
        collisionRadius: client.collisionRadius,
        splashesOnAttack: client.splashesOnAttack,
      });
    });
  });
});

describe('server goliathBatchForWindow is a seeded, deterministic 1-3 wave', () => {
  it('yields 1..3 members with sizes in range, deterministically', () => {
    for (let bucket = 0n; bucket < 60n; bucket++) {
      const sizes = goliathBatchForWindow(bucket);
      expect(sizes.length).toBeGreaterThanOrEqual(1);
      expect(sizes.length).toBeLessThanOrEqual(3);
      for (const sizeIndex of sizes) {
        expect(sizeIndex).toBeGreaterThanOrEqual(0);
        expect(sizeIndex).toBeLessThan(GOLIATH_SIZE_STATS.length);
      }
      expect(goliathBatchForWindow(bucket)).toEqual(sizes);
    }
  });
});

describe('server enemy identity helpers mirror the client', () => {
  it('MEMBERS_PER_CAMP is 5 and member 0 is the boss', () => {
    expect(MEMBERS_PER_CAMP).toBe(5);
    expect(isBossMember(0)).toBe(true);
    expect(isBossMember(1)).toBe(false);
  });

  it('enemyIdFor strides camps by 100', () => {
    expect(enemyIdFor(0, 0)).toBe(0);
    expect(enemyIdFor(0, 4)).toBe(4);
    expect(enemyIdFor(3, 2)).toBe(302);
  });
});

describe('combat math helpers', () => {
  it('damagePerTick converts a per-second rate to a 150ms slice', () => {
    expect(damagePerTick(100, 150_000n)).toBeCloseTo(15, 6);
    expect(damagePerTick(90, 1_000_000n)).toBeCloseTo(90, 6);
    expect(damagePerTick(0, 150_000n)).toBe(0);
  });

  it('windowBucketFor floors the timestamp into 5-minute buckets', () => {
    const window = GOLIATH_BATCH_WINDOW_MICROS;
    expect(windowBucketFor(0n, window)).toBe(0n);
    expect(windowBucketFor(window - 1n, window)).toBe(0n);
    expect(windowBucketFor(window, window)).toBe(1n);
    expect(windowBucketFor(window * 7n + 123n, window)).toBe(7n);
  });

  it('distanceBetween is planar euclidean', () => {
    expect(distanceBetween(0, 0, 3, 4)).toBe(5);
    expect(distanceBetween(1, 1, 1, 1)).toBe(0);
  });

  it('gemIsCollectible enforces the drop grace period', () => {
    const delay = 1_200_000n; // GEM_PICKUP_DELAY_MICROS
    const droppedAt = 5_000_000n;
    // Fresh drop: still inside the grace period, not yet collectible.
    expect(gemIsCollectible(droppedAt, droppedAt, delay)).toBe(false);
    expect(gemIsCollectible(droppedAt, droppedAt + delay - 1n, delay)).toBe(false);
    // Exactly at the delay boundary: collectible.
    expect(gemIsCollectible(droppedAt, droppedAt + delay, delay)).toBe(true);
    // Well past the delay: collectible.
    expect(gemIsCollectible(droppedAt, droppedAt + delay * 10n, delay)).toBe(true);
  });

  it('stepToward never overshoots the target', () => {
    // Far away: advances exactly `step` along the line.
    const partial = stepToward(0, 0, 10, 0, 2);
    expect(partial).toEqual({ x: 2, z: 0 });
    // Within one step: snaps to the target instead of overshooting.
    expect(stepToward(0, 0, 1, 0, 5)).toEqual({ x: 1, z: 0 });
    // Already there: stays put.
    expect(stepToward(4, 4, 4, 4, 3)).toEqual({ x: 4, z: 4 });
  });
});

describe('goliath raiding AI keeps a stable camp target', () => {
  const camps: GoliathTargetCamp[] = [
    { campIndex: 0, x: 0, z: 0, livingCount: 3 },
    { campIndex: 1, x: 5, z: 0, livingCount: 3 },
    { campIndex: 2, x: 20, z: 0, livingCount: 3 },
  ];

  it('keeps a still-living current target even when another camp is nearer (no flip)', () => {
    // Standing at camp 1 but currently locked on the farther camp 2: it must hold.
    const target = chooseGoliathTargetCamp(2, -1, camps, 5, 0);
    expect(target).toBe(2);
  });

  it('re-picks the nearest living camp when the current target is cleared', () => {
    const cleared: GoliathTargetCamp[] = [
      { campIndex: 0, x: 0, z: 0, livingCount: 0 }, // current target, now dead
      { campIndex: 1, x: 5, z: 0, livingCount: 3 },
      { campIndex: 2, x: 20, z: 0, livingCount: 3 },
    ];
    expect(chooseGoliathTargetCamp(0, -1, cleared, 0, 0)).toBe(1);
  });

  it('excludes the just-raided camp when another living camp exists', () => {
    // No live target (-1); nearest is camp 0 but it was just raided, so pick camp 1.
    expect(chooseGoliathTargetCamp(-1, 0, camps, 0, 0)).toBe(1);
  });

  it('targets the just-raided camp when it is the only one living', () => {
    const onlyOne: GoliathTargetCamp[] = [
      { campIndex: 0, x: 0, z: 0, livingCount: 3 },
      { campIndex: 1, x: 5, z: 0, livingCount: 0 },
      { campIndex: 2, x: 20, z: 0, livingCount: 0 },
    ];
    expect(chooseGoliathTargetCamp(-1, 0, onlyOne, 0, 0)).toBe(0);
  });

  it('returns -1 when no camp is living', () => {
    const dead = camps.map(camp => ({ ...camp, livingCount: 0 }));
    expect(chooseGoliathTargetCamp(1, -1, dead, 0, 0)).toBe(-1);
  });

  it('hasReachedCamp is true only within the stop radius', () => {
    expect(hasReachedCamp(2.9, 3)).toBe(true);
    expect(hasReachedCamp(3, 3)).toBe(true);
    expect(hasReachedCamp(3.1, 3)).toBe(false);
  });

  it('headingFromStep normalizes an actual step and falls back on no move', () => {
    // Moved +3 x, +4 z → the 3-4-5 unit vector.
    expect(headingFromStep(0, 0, 3, 4, 1, 0)).toEqual({ x: 0.6, z: 0.8 });
    // No movement → keeps the previous heading (raider stays facing the camp).
    expect(headingFromStep(5, 5, 5, 5, 0, -1)).toEqual({ x: 0, z: -1 });
  });

  it('isWithinForwardArc only engages members inside the goliath forward cone', () => {
    // Member dead ahead (heading +x, member further along +x) → dot 1.
    expect(isWithinForwardArc(1, 0, 0, 0, 5, 0, 0.25)).toBe(true);
    // Member directly behind → dot -1, dropped.
    expect(isWithinForwardArc(1, 0, 0, 0, -5, 0, 0.25)).toBe(false);
    // Member at 90° → dot 0, below the 0.25 threshold, dropped.
    expect(isWithinForwardArc(1, 0, 0, 0, 0, 5, 0.25)).toBe(false);
    // Zero heading → no facing info, fights regardless of member position.
    expect(isWithinForwardArc(0, 0, 0, 0, -5, -5, 0.25)).toBe(true);
    // Member coincident with the goliath → treated as facing.
    expect(isWithinForwardArc(1, 0, 3, 3, 3, 3, 0.25)).toBe(true);
  });
});
