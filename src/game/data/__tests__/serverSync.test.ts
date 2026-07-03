import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../characters';
import {
  GACHA_PULL_COST,
  MAX_HEALTH,
  SAFE_ZONE_RADIUS,
  WORLD_BOUND,
} from '../constants';

// Vitest runs with the project root as cwd.
const SERVER_SOURCE = readFileSync(resolve(process.cwd(), 'spacetimedb/src/index.ts'), 'utf8');

function extractServerCharacterPool(): Array<{ characterId: string; stars: number }> {
  const poolBlock = /const CHARACTER_POOL = \[([\s\S]*?)\];/.exec(SERVER_SOURCE);
  expect(poolBlock, 'CHARACTER_POOL not found in server source').not.toBeNull();
  return [...poolBlock![1].matchAll(/\{\s*characterId:\s*'([^']+)',\s*stars:\s*(\d+)\s*\}/g)].map(
    ([, characterId, stars]) => ({ characterId, stars: Number(stars) })
  );
}

function extractServerConstant(name: string): number {
  const match = new RegExp(`const ${name} = (\\d+(?:\\.\\d+)?);`).exec(SERVER_SOURCE);
  expect(match, `${name} not found in server source`).not.toBeNull();
  return Number(match![1]);
}

describe('server CHARACTER_POOL stays in sync with client CHARACTERS', () => {
  it('contains exactly the same ids and star tiers', () => {
    const serverPool = extractServerCharacterPool();
    const clientPool = Object.values(CHARACTERS).map(({ id, stars }) => ({
      characterId: id,
      stars,
    }));

    const byId = (a: { characterId: string }, b: { characterId: string }) =>
      a.characterId.localeCompare(b.characterId);
    expect([...serverPool].sort(byId)).toEqual([...clientPool].sort(byId));
  });
});

describe('server constants stay in sync with client constants', () => {
  it.each([
    ['SAFE_ZONE_RADIUS', SAFE_ZONE_RADIUS],
    ['WORLD_BOUND', WORLD_BOUND],
    ['MAX_HEALTH', MAX_HEALTH],
    ['GACHA_PULL_COST', GACHA_PULL_COST],
  ] as const)('%s matches', (name, clientValue) => {
    expect(extractServerConstant(name)).toBe(clientValue);
  });
});
