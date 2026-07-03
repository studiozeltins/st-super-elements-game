import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHARACTERS, healSpecFor } from '../characters';
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
