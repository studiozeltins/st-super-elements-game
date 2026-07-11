import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ATTACK_RENDER } from '../attacks';
import { CHARACTERS, healSpecFor } from '../characters';
import { ELEMENTS } from '../elements';
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
  CHARACTER_COMBAT,
  WEAPONS as SERVER_WEAPONS,
  regularAttackMultiplier as serverRegular,
  skillAttackMultiplier as serverSkill,
  transcendDamageMultiplier as serverTranscend,
} from '../../../../spacetimedb/src/damage';
import { ATTACKS, UNIT_ATTACKS, UNIT_KIND_GOLIATH } from '../../../../spacetimedb/src/attacks';
import { GOLIATH_SIZE_STATS } from '../../../../spacetimedb/src/enemyStats';
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

// Vitest runs with the project root as cwd. worldRules.ts is scanned too:
// SAFE_ZONE_RADIUS (and the shared world predicates) were carved out of
// index.ts in 04-03 because SpacetimeDB rejects plain helper exports from the
// module entry file.
const SERVER_SOURCE =
  readFileSync(resolve(process.cwd(), 'spacetimedb/src/index.ts'), 'utf8') +
  readFileSync(resolve(process.cwd(), 'spacetimedb/src/worldRules.ts'), 'utf8');

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

// INV-5 / CRIT-06: the server CHARACTER_COMBAT mirror (weapon + skill damage +
// skill cooldown) MUST stay identical to the client CHARACTERS source of truth.
// Import-and-compare (RESEARCH Pitfall 3): the server has no other combat-data
// map, so any silent drift would let server damage diverge from client feel.
describe('server CHARACTER_COMBAT mirror stays in sync with client CHARACTERS', () => {
  it('contains exactly the same character ids', () => {
    expect(Object.keys(CHARACTER_COMBAT).sort()).toEqual(Object.keys(CHARACTERS).sort());
  });

  it.each(Object.keys(CHARACTERS).map(id => [id] as const))(
    '%s weapon/skillDamage/skillCooldownSeconds match client CHARACTERS',
    id => {
      const character = CHARACTERS[id];
      expect(CHARACTER_COMBAT[id], `CHARACTER_COMBAT missing entry for ${id}`).toBeDefined();
      expect(CHARACTER_COMBAT[id].weaponId).toBe(character.weapon);
      expect(CHARACTER_COMBAT[id].skillDamage).toBe(character.skill.damage);
      expect(CHARACTER_COMBAT[id].skillCooldownSeconds).toBe(character.skill.cooldownSeconds);
    }
  );
});

// INV-5 / D4-04..07: the ATTACKS registry drives BOTH the server FSM and every
// client-rendered telegraph/animation duration (rows are denormalized from it),
// so its internal invariants + the per-size damage arithmetic are release-blocking.
// Import-and-compare across the package boundary, same mechanism as damage.ts above.
describe('ATTACKS registry invariants (INV-5)', () => {
  it.each(Object.entries(ATTACKS))(
    '%s durations are exact tick multiples with the >= 2-tick windup floor',
    (_, spec) => {
      expect(Number.isInteger(spec.windupTicks)).toBe(true);
      expect(spec.windupTicks).toBeGreaterThanOrEqual(2); // >= 0.35s lock (FSM-05)
      expect(Number.isInteger(spec.recoveryTicks)).toBe(true);
    }
  );

  it('leapSlam damage = 4.5x per-size contactDamage -> 405/585/765 (D4-04)', () => {
    expect(
      GOLIATH_SIZE_STATS.map(size =>
        Math.round(size.contactDamage * ATTACKS.leapSlam.damageMultiplier)
      )
    ).toEqual([405, 585, 765]);
  });

  it('leapSlam radius array covers every goliath size (D4-05)', () => {
    expect(ATTACKS.leapSlam.radiusBySize).toHaveLength(GOLIATH_SIZE_STATS.length);
  });

  it('swordSwing damage = 1.5x per-size contactDamage -> 135/195/255 (D5-10)', () => {
    expect(
      GOLIATH_SIZE_STATS.map(size =>
        Math.round(size.contactDamage * ATTACKS.swordSwing.damageMultiplier)
      )
    ).toEqual([135, 195, 255]);
  });

  it('swordSwirl damage = 2.5x per-size contactDamage -> 225/325/425 (D5-10)', () => {
    expect(
      GOLIATH_SIZE_STATS.map(size =>
        Math.round(size.contactDamage * ATTACKS.swordSwirl.damageMultiplier)
      )
    ).toEqual([225, 325, 425]);
  });

  it('no-one-shot invariant: worst-case chain damage stays below the smallest character HP pool', () => {
    // BOTH sides derived live (never a hardcoded tautology): the largest goliath's
    // full swing+swirl chain must not kill the squishiest character from full HP.
    const worstChain = Math.max(
      ...GOLIATH_SIZE_STATS.map(
        size =>
          Math.round(size.contactDamage * ATTACKS.swordSwing.damageMultiplier) +
          Math.round(size.contactDamage * ATTACKS.swordSwirl.damageMultiplier)
      )
    );
    const minPool = Math.min(...Object.values(CHARACTERS).map(character => character.maxHealth));
    expect(worstChain).toBeLessThan(minPool);
  });

  it('every chainsInto resolves in ATTACKS and chains terminate without cycles (D5-01)', () => {
    for (const [attackId, spec] of Object.entries(ATTACKS)) {
      const visited = new Set<string>([attackId]);
      let next = spec.chainsInto;
      while (next !== undefined) {
        expect(ATTACKS[next], `${attackId} chain link '${next}' missing from ATTACKS`).toBeDefined();
        expect(visited.has(next), `chain from ${attackId} revisits '${next}' (cycle)`).toBe(false);
        visited.add(next);
        next = ATTACKS[next].chainsInto;
      }
    }
  });

  it('goliath default list has swordSwing but NEVER swordSwirl — swirl only via chain (D5-03)', () => {
    const defaultList = UNIT_ATTACKS[UNIT_KIND_GOLIATH].default;
    expect(defaultList).toContain('swordSwing');
    expect(defaultList).not.toContain('swordSwirl');
  });
});

// INV-5 / D5-07: the client ATTACK_RENDER mirror (telegraph shape + cone angle)
// MUST stay parity-locked to the server ATTACKS registry. Import-and-compare
// across the package boundary, same mechanism as CHARACTER_COMBAT above — a
// runtime client import of the server module was explicitly rejected (D5-07),
// so this test IS the only drift protection.
describe('client ATTACK_RENDER mirror stays in sync with server ATTACKS', () => {
  it('contains exactly the same attack ids (no drift in either direction)', () => {
    expect(Object.keys(ATTACK_RENDER).sort()).toEqual(Object.keys(ATTACKS).sort());
  });

  it.each(Object.keys(ATTACKS).map(id => [id] as const))('%s shape matches server ATTACKS', id => {
    expect(ATTACK_RENDER[id], `ATTACK_RENDER missing entry for ${id}`).toBeDefined();
    expect(ATTACK_RENDER[id].shape).toBe(ATTACKS[id].shape);
  });

  it('every cone entry locks cos(coneHalfAngleDegrees) to the server coneMinDot (D5-06)', () => {
    const coneIds = Object.keys(ATTACKS).filter(id => ATTACKS[id].shape === 'cone');
    expect(coneIds.length).toBeGreaterThan(0); // swordSwing exists — guard against a vacuous pass
    for (const id of coneIds) {
      const halfAngleDegrees = ATTACK_RENDER[id].coneHalfAngleDegrees;
      expect(halfAngleDegrees, `${id} is a cone but has no coneHalfAngleDegrees`).toBeDefined();
      // Locks 60° to coneMinDot 0.5: cos(60° in radians) ≈ 0.5.
      expect(Math.cos((halfAngleDegrees! * Math.PI) / 180)).toBeCloseTo(ATTACKS[id].coneMinDot!);
    }
  });

  it('non-cone entries carry NO coneHalfAngleDegrees', () => {
    for (const [id, spec] of Object.entries(ATTACK_RENDER)) {
      if (spec.shape === 'cone') continue;
      expect(spec.coneHalfAngleDegrees, `${id} is not a cone but has a cone angle`).toBeUndefined();
    }
  });

  it.each(Object.keys(ATTACKS).map(id => [id] as const))(
    '%s stunSeconds mirrors server stunTicks x 150ms tick (D4-09/D5-12)',
    id => {
      expect(ATTACK_RENDER[id].stunSeconds).toBeCloseTo(ATTACKS[id].stunTicks * 0.15);
    }
  );

  // Client-only render hint (no server counterpart — attacks carry no element
  // yet): the strike-juice tint must come from the ELEMENTS palette, never an
  // ad-hoc hex, so juice always reads as one of the game's elements.
  it('every entry tints its strike juice with a color from the ELEMENTS palette', () => {
    const paletteColors = Object.values(ELEMENTS).map(element => element.color);
    for (const [id, spec] of Object.entries(ATTACK_RENDER)) {
      expect(paletteColors, `${id}.juiceColor is not an ELEMENTS palette color`).toContain(
        spec.juiceColor
      );
    }
  });

  it('every attack keeps graceTicks 1 — the client STRIKE_PHASE_MICROS window assumes it', () => {
    // createAttackViewClock.ts derives the strike-phase clip window as strikeAt
    // + ONE world tick (the zero-storage grace deadline, D4-02). If an attack
    // ever ships a different graceTicks, the client strike window must become
    // per-attack data.
    for (const [id, spec] of Object.entries(ATTACKS)) {
      expect(spec.graceTicks, `${id} graceTicks changed — update STRIKE_PHASE_MICROS handling`).toBe(1);
    }
  });
});
