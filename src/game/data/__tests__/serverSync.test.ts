import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHARACTERS, healSpecFor } from '../characters';
import { BANNERS, GACHA_WEAPONS } from '../gacha';
import { BOSS_GEM_MULTIPLIER, GEM_DENOMINATIONS } from '../gemDrops';
import {
  GOLIATH_BASE_GEMS_BY_SIZE,
  KILL_REWARD_GEMS,
  goliathBaseGems,
  regularEnemyBaseGems,
} from '../gemRewards';
import { GOLIATH_ARCHETYPES_BY_SIZE } from '../goliathArchetypes';
import { WEAPONS as CLIENT_WEAPONS } from '../weapons';
import {
  regularAttackMultiplier as clientRegular,
  skillAttackMultiplier as clientSkill,
} from '../../combat/comboSystem';
import { transcendDamageMultiplier as clientTranscend } from '../../combat/transcendScaling';
// Import the server damage mirror across the package boundary and compare OUTPUTS,
// not source regex (RESEARCH Pitfall 4) — the robust parity path.
import {
  WEAPONS as SERVER_WEAPONS,
  regularAttackMultiplier as serverRegular,
  skillAttackMultiplier as serverSkill,
  transcendDamageMultiplier as serverTranscend,
} from '../../../../spacetimedb/src/damage';
import {
  GACHA_PULL_COST,
  MAX_HEALTH,
  MAX_TRANSCEND_LEVEL,
  RAID_PARTY_SIZE,
  RAID_SHARD_PAYOUT,
  SAFE_ZONE_RADIUS,
  SHARD_DEATH_LOSS,
  SHARD_PER_OVERFLOW_DUPE,
  TRANSCEND_DAMAGE_STEP,
  TRANSCEND_HEAL_STEP,
  WORLD_BOUND,
} from '../constants';

// Vitest runs with the project root as cwd.
const SERVER_SOURCE = readFileSync(resolve(process.cwd(), 'spacetimedb/src/index.ts'), 'utf8');

interface ServerStat {
  stars: number;
  maxHealth: number;
  healthRegen: number;
  role: string;
  critRate: number;
  critDmg: number;
  healType: string;
  healMode: string;
  healPower: number;
}

const VALID_ROLES = ['tank', 'dps', 'healer', 'support'] as const;

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
      role: readField(body, 'role') ?? 'dps',
      critRate: Number(readField(body, 'critRate')),
      critDmg: Number(readField(body, 'critDmg')),
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

  it.each(Object.values(CHARACTERS).map(character => [character.id] as const))(
    '%s has a valid role',
    id => {
      expect(VALID_ROLES).toContain(CHARACTERS[id].role);
    }
  );

  it.each(Object.values(CHARACTERS).map(character => [character.id] as const))(
    '%s role matches server CHARACTER_STATS',
    id => {
      expect(serverStats[id].role).toBe(CHARACTERS[id].role);
    }
  );

  // INV-5: crit stats must match client↔server for all 17 ids, or fairness drifts
  // silently once Phase 2 wires server-authoritative crit. A single mismatched
  // decimal fails here; NaN (a multi-line/malformed entry) also fails === .
  it.each(Object.values(CHARACTERS).map(character => [character.id] as const))(
    '%s critRate/critDmg match server CHARACTER_STATS',
    id => {
      expect(serverStats[id].critRate).toBe(CHARACTERS[id].critRate);
      expect(serverStats[id].critDmg).toBe(CHARACTERS[id].critDmg);
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
    ['MAX_TRANSCEND_LEVEL', MAX_TRANSCEND_LEVEL],
    ['TRANSCEND_DAMAGE_STEP', TRANSCEND_DAMAGE_STEP],
    ['TRANSCEND_HEAL_STEP', TRANSCEND_HEAL_STEP],
    ['SHARD_PER_OVERFLOW_DUPE', SHARD_PER_OVERFLOW_DUPE],
    ['SHARD_DEATH_LOSS', SHARD_DEATH_LOSS],
    ['RAID_SHARD_PAYOUT', RAID_SHARD_PAYOUT],
    ['RAID_PARTY_SIZE', RAID_PARTY_SIZE],
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
  it('KILL_REWARD_GEMS matches', () => {
    expect(extractServerConstant('KILL_REWARD_GEMS')).toBe(KILL_REWARD_GEMS);
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
    const killReward = extractServerConstant('KILL_REWARD_GEMS');
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

// D-05 / CRIT-03: the server damage.ts mirror must match the client base-damage
// math exactly. Unlike the string-scraping parity above, this imports both sides
// and compares OUTPUTS (RESEARCH Pitfall 4) — the only robust way to catch a
// drifted mirror, since inlined server constants have no index.ts regex path.
describe('server damage.ts mirror stays in sync', () => {
  it('WEAPONS deep-equal the client WEAPONS (all 5, incl. displayName)', () => {
    expect(SERVER_WEAPONS).toEqual(CLIENT_WEAPONS);
  });

  it.each([0, 1, 5, 10, 50, 100] as const)(
    'regular/skill attack multipliers match client at combo=%s',
    combo => {
      expect(serverRegular(combo)).toBe(clientRegular(combo));
      expect(serverSkill(combo)).toBe(clientSkill(combo));
    }
  );

  it.each([
    [0, 0],
    [1, 0],
    [0, 1],
    [6, 4],
  ] as const)('transcend multiplier matches client at (c=%s, t=%s)', (constellation, transcend) => {
    expect(serverTranscend(constellation, transcend)).toBe(clientTranscend(constellation, transcend));
  });

  it('pins the inlined server CONSTELLATION_DAMAGE_STEP (0.08) via transcend(1,0) === 1.08', () => {
    // C1, no transcend isolates one constellation step: 1 + 1*0.08 = 1.08.
    // This is the ONLY parity guard for the server's inlined CONSTELLATION_DAMAGE_STEP,
    // which — unlike TRANSCEND_DAMAGE_STEP — has no index.ts constant regex path.
    expect(serverTranscend(1, 0)).toBe(clientTranscend(1, 0));
    expect(serverTranscend(1, 0)).toBe(1.08);
  });
});
