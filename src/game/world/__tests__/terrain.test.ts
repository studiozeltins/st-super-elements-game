import { describe, expect, it } from 'vitest';
import { getTerrainHeight, ISLANDS, VOID_DEPTH } from '../terrain';
import { createSeededRandom } from '../rng';

describe('getTerrainHeight', () => {
  it('is deterministic: two calls with the same coordinates match', () => {
    const random = createSeededRandom(11);
    for (let sample = 0; sample < 25; sample += 1) {
      const x = (random() - 0.5) * 260;
      const z = (random() - 0.5) * 260;
      expect(getTerrainHeight(x, z)).toBe(getTerrainHeight(x, z));
    }
  });

  it('is perfectly flat inside the city center (radius < 20)', () => {
    const random = createSeededRandom(22);
    for (let sample = 0; sample < 25; sample += 1) {
      const angle = random() * Math.PI * 2;
      const distance = random() * 19.9;
      expect(getTerrainHeight(Math.cos(angle) * distance, Math.sin(angle) * distance)).toBe(0);
    }
  });

  it('every island stands on solid ground near its center', () => {
    for (const island of ISLANDS) {
      const height = getTerrainHeight(island.centerX, island.centerZ);
      expect(height).toBeGreaterThanOrEqual(island.baseHeight);
      expect(height).toBeLessThanOrEqual(island.baseHeight + 11);
    }
  });

  it('plunges toward the void away from every island', () => {
    const random = createSeededRandom(33);
    for (let sample = 0; sample < 40; sample += 1) {
      const x = (random() - 0.5) * 260;
      const z = (random() - 0.5) * 260;
      const isNearAnyIsland = ISLANDS.some(
        island => Math.hypot(x - island.centerX, z - island.centerZ) < island.radius + 7
      );
      if (isNearAnyIsland) continue;
      const height = getTerrainHeight(x, z);
      expect(height).toBeLessThan(-30);
      expect(height).toBeGreaterThanOrEqual(VOID_DEPTH);
    }
  });

  it('keeps land heights within sane bounds on every island interior', () => {
    for (const island of ISLANDS) {
      for (let step = 0; step < 40; step += 1) {
        const angle = (step / 40) * Math.PI * 2;
        const distance = (step % 5) * island.radius * 0.15;
        const x = island.centerX + Math.cos(angle) * distance;
        const z = island.centerZ + Math.sin(angle) * distance;
        const height = getTerrainHeight(x, z);
        expect(height).toBeGreaterThanOrEqual(0);
        expect(height).toBeLessThanOrEqual(island.baseHeight + 12);
      }
    }
  });

  it('has no teleport cliffs on the city island: 0.5-apart samples differ < 2.0', () => {
    const random = createSeededRandom(44);
    for (let sample = 0; sample < 50; sample += 1) {
      const angle = random() * Math.PI * 2;
      const distance = random() * 40;
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      const here = getTerrainHeight(x, z);
      expect(Math.abs(getTerrainHeight(x + 0.5, z) - here)).toBeLessThan(2.0);
      expect(Math.abs(getTerrainHeight(x, z + 0.5) - here)).toBeLessThan(2.0);
    }
  });
});
