import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHARACTERS, healSpecFor } from '../characters';
import { BANNERS, GACHA_WEAPONS } from '../gacha';
import { BOSS_GEM_MULTIPLIER, GEM_DENOMINATIONS } from '../gemDrops';
import {
  GOLIATH_BASE_GEMS_BY_SIZE,
  KILL_REWARD_PRIMOGEMS,
  goliathBaseGems,
  regularEnemyBaseGems,
} from '../gemRewards';
import { GOLIATH_ARCHETYPES_BY_SIZE } from '../goliathArchetypes';
import {
  GACHA_PULL_COST,
  MAX_HEALTH,
  SAFE_ZONE_RADIUS,
  WORLD_BOUND,
} from '../constants';

// Vitest runs with the project root as cwd.
const SERVER_SOURCE = readFileSync(resolve(process.cwd(), 'spacetimedb/src/index.ts'), 'utf8');

interface ServerStat {
  stars: number;
  maxHealth: number;
  healthRegen: number;
  healType: string;
  healMode: string;
  healPower: number;
}

function readField(body: string, name: string): string | null {
  const match = new RegExp(`${name}:\\s*'?([\\w.]+)'?`).exec(body);
  return match ? match[1] : null;
}

function extractServerStats(): Record<string, ServerStat> {
  // The CHARACTER_STATS object body (one character entry per line).
  const block = /const CHARACTER_STATS[^{]*= \{([\s\S]*?)\n\};/.exec(SERVER_SOURCE);
  expect(block, 'CHARACTER_STATS not found in server source').not.toBeNull();

  const stats: Record<string, ServerStat> = {};
  // Each entry is a single-line object literal, so bodies never nest braces.
  for (const [, id, body] of block![1].matchAll(/(\w+):\s*\{([^}]*)\}/g)) {
    stats[id] = {
      stars: Number(readField(body, 'stars')),
      maxHealth: Number(readField(body, 'maxHealth')),
      healthRegen: Number(readField(body, 'healthRegen')),
      // Non-healers spread ...NO_HEAL, so these fields are absent → defaults.
      healType: readField(body, 'healType') ?? 'none',
      healMode: readField(body, 'healMode') ?? 'flat',
      healPower: Number(readField(body, 'healPower') ?? '0'),
    };
  }
  return stats;
}

function extractServerConstant(name: string): number {
  const match = new RegExp(`const ${name} = (\\d+(?:\\.\\d+)?);`).exec(SERVER_SOURCE);
  expect(match, `${name} not found in server source`).not.toBeNull();
  return Number(match![1]);
}

describe('server CHARACTER_STATS stays in sync with client CHARACTERS', () => {
  const serverStats = extractServerStats();

  it('contains exactly the same character ids', () => {
    expect(Object.keys(serverStats).sort()).toEqual(Object.keys(CHARACTERS).sort());
  });

  it.each(Object.values(CHARACTERS).map(character => [character.id] as const))(
    '%s stars/maxHealth/healthRegen match',
    id => {
      const character = CHARACTERS[id];
      expect(serverStats[id]).toMatchObject({
        stars: character.stars,
        maxHealth: character.maxHealth,
        healthRegen: character.healthRegen,
      });
    }
  );

  it.each(Object.values(CHARACTERS).map(character => [character.id] as const))(
    '%s heal spec matches client HEALERS',
    id => {
      const spec = healSpecFor(id);
      expect({
        healType: serverStats[id].healType,
        healMode: serverStats[id].healMode,
        healPower: serverStats[id].healPower,
      }).toEqual({ healType: spec.type, healMode: spec.mode, healPower: spec.power });
    }
  );
});

describe('server wish config stays in sync with client gacha data', () => {
  it('banners have the same featured 5★ characters', () => {
    const block = /const BANNERS[\s\S]*?= \{([\s\S]*?)\n\};/.exec(SERVER_SOURCE);
    expect(block, 'BANNERS not found in server source').not.toBeNull();
    const serverBanners = [...block![1].matchAll(/(\w+):\s*\{\s*featuredCharacterId:\s*'([^']+)'/g)]
      .map(([, id, featured]) => `${id}:${featured}`)
      .sort();
    const clientBanners = BANNERS.map(banner => `${banner.id}:${banner.featuredCharacterId}`).sort();
    expect(serverBanners).toEqual(clientBanners);
  });

  it('weapon catalog ids and rarities match', () => {
    const block = /const GACHA_WEAPONS[^[]*= \[([\s\S]*?)\n\];/.exec(SERVER_SOURCE);
    expect(block, 'GACHA_WEAPONS not found in server source').not.toBeNull();
    const serverWeapons = [...block![1].matchAll(/id:\s*'([^']+)',\s*rarity:\s*(\d)/g)]
      .map(([, id, rarity]) => `${id}:${rarity}`)
      .sort();
    const clientWeapons = GACHA_WEAPONS.map(weapon => `${weapon.id}:${weapon.rarity}`).sort();
    expect(serverWeapons).toEqual(clientWeapons);
  });
});

describe('server constants stay in sync with client constants', () => {
  it.each([
    ['SAFE_ZONE_RADIUS', SAFE_ZONE_RADIUS],
    ['WORLD_BOUND', WORLD_BOUND],
    // Client MAX_HEALTH is the fallback pool; server calls it DEFAULT_MAX_HEALTH.
    ['DEFAULT_MAX_HEALTH', MAX_HEALTH],
    ['GACHA_PULL_COST', GACHA_PULL_COST],
  ] as const)('%s matches', (name, clientValue) => {
    expect(extractServerConstant(name)).toBe(clientValue);
  });
});

describe('server gem-drop economy stays in sync with client gemDrops', () => {
  it('BOSS_GEM_MULTIPLIER matches', () => {
    expect(extractServerConstant('BOSS_GEM_MULTIPLIER')).toBe(BOSS_GEM_MULTIPLIER);
  });

  it('GEM_DENOMINATIONS match (same values, same order)', () => {
    const match = /const GEM_DENOMINATIONS = \[([^\]]*)\]/.exec(SERVER_SOURCE);
    expect(match, 'GEM_DENOMINATIONS not found in server source').not.toBeNull();
    const serverDenominations = match![1]
      .split(',')
      .map(part => Number(part.trim()))
      .filter(value => !Number.isNaN(value));
    expect(serverDenominations).toEqual([...GEM_DENOMINATIONS]);
  });
});

function extractServerNumberArray(name: string): number[] {
  const match = new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(SERVER_SOURCE);
  expect(match, `${name} not found in server source`).not.toBeNull();
  return match![1]
    .split(',')
    .map(part => Number(part.trim()))
    .filter(value => !Number.isNaN(value));
}

describe('server enemy base-gem math stays in sync with client gemRewards', () => {
  it('KILL_REWARD_PRIMOGEMS matches', () => {
    expect(extractServerConstant('KILL_REWARD_PRIMOGEMS')).toBe(KILL_REWARD_PRIMOGEMS);
  });

  it('BOSS_GEM_MULTIPLIER re-exported from gemRewards matches server', () => {
    expect(extractServerConstant('BOSS_GEM_MULTIPLIER')).toBe(BOSS_GEM_MULTIPLIER);
  });

  it('GOLIATH_BASE_GEMS_BY_SIZE matches server literal [500, 1000, 2000]', () => {
    expect(extractServerNumberArray('GOLIATH_BASE_GEMS_BY_SIZE')).toEqual([
      ...GOLIATH_BASE_GEMS_BY_SIZE,
    ]);
    expect([...GOLIATH_BASE_GEMS_BY_SIZE]).toEqual([500, 1000, 2000]);
  });

  it('goliathBaseGems clamps out-of-range indices exactly like the server', () => {
    // Server: clamp(index, 0, length-1) then index GOLIATH_BASE_GEMS_BY_SIZE.
    expect(goliathBaseGems(0)).toBe(500);
    expect(goliathBaseGems(1)).toBe(1000);
    expect(goliathBaseGems(2)).toBe(2000);
    expect(goliathBaseGems(-5)).toBe(500);
    expect(goliathBaseGems(99)).toBe(2000);
  });

  it('regularEnemyBaseGems matches the server formula for tier/boss combos', () => {
    // Rebuild the server formula from the server source, then compare.
    const killReward = extractServerConstant('KILL_REWARD_PRIMOGEMS');
    const bossMultiplier = extractServerConstant('BOSS_GEM_MULTIPLIER');
    const maxTier = extractServerConstant('MAX_KILL_REWARD_TIER');
    const serverRegularBaseGems = (rewardTier: number, isBoss: boolean): number => {
      const clampedTier = Math.max(1, Math.min(maxTier, rewardTier));
      return killReward * clampedTier * (isBoss ? bossMultiplier : 1);
    };

    // In-range tiers, plus below/above range to prove identical clamping.
    for (const tier of [-1, 0, 1, 2, 3, 7]) {
      for (const isBoss of [false, true]) {
        expect(regularEnemyBaseGems(tier, isBoss)).toBe(serverRegularBaseGems(tier, isBoss));
      }
    }
  });
});

describe('client goliath archetypes derive gems and splash from size', () => {
  it('is length 3 with sequential size indices 0,1,2', () => {
    expect(GOLIATH_ARCHETYPES_BY_SIZE).toHaveLength(3);
    expect(GOLIATH_ARCHETYPES_BY_SIZE.map(archetype => archetype.sizeIndex)).toEqual([0, 1, 2]);
  });

  it('baseGems come from goliathBaseGems(sizeIndex), never hardcoded', () => {
    GOLIATH_ARCHETYPES_BY_SIZE.forEach((archetype, index) => {
      expect(archetype.baseGems).toBe(goliathBaseGems(index));
    });
  });

  it('only the largest raider (index 2) splashes on attack', () => {
    expect(GOLIATH_ARCHETYPES_BY_SIZE.map(archetype => archetype.splashesOnAttack)).toEqual([
      false,
      false,
      true,
    ]);
  });
});
