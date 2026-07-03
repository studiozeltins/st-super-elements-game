import { describe, expect, it } from 'vitest';
import { getTerrainHeight, ISLAND_RADIUS, VOID_DEPTH } from '../terrain';
import { createSeededRandom } from '../rng';

describe('getTerrainHeight', () => {
  it('is deterministic: two calls with the same coordinates match', () => {
    const random = createSeededRandom(11);
    for (let sample = 0; sample < 25; sample += 1) {
      const x = (random() - 0.5) * 150;
      const z = (random() - 0.5) * 150;
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

  it('plunges toward the void beyond ISLAND_RADIUS + 6', () => {
    expect(ISLAND_RADIUS).toBeGreaterThan(0);
    const random = createSeededRandom(33);
    for (let sample = 0; sample < 25; sample += 1) {
      const angle = random() * Math.PI * 2;
      const distance = ISLAND_RADIUS + 6 + random() * 20;
      const height = getTerrainHeight(Math.cos(angle) * distance, Math.sin(angle) * distance);
      expect(height).toBeLessThan(-30);
      expect(height).toBeGreaterThanOrEqual(VOID_DEPTH);
    }
  });

  it('keeps island heights within sane bounds (0..12 for radius < 78)', () => {
    for (let x = -78; x <= 78; x += 6) {
      for (let z = -78; z <= 78; z += 6) {
        if (Math.hypot(x, z) >= 78) continue;
        const height = getTerrainHeight(x, z);
        expect(height).toBeGreaterThanOrEqual(0);
        expect(height).toBeLessThanOrEqual(12);
      }
    }
  });

  it('has no teleport cliffs: adjacent samples 0.5 apart differ by less than 2.0', () => {
    const random = createSeededRandom(44);
    for (let sample = 0; sample < 50; sample += 1) {
      const angle = random() * Math.PI * 2;
      const distance = random() * 75;
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      const here = getTerrainHeight(x, z);
      expect(Math.abs(getTerrainHeight(x + 0.5, z) - here)).toBeLessThan(2.0);
      expect(Math.abs(getTerrainHeight(x, z + 0.5) - here)).toBeLessThan(2.0);
    }
  });
});
