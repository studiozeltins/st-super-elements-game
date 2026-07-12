import { describe, expect, it } from 'vitest';
import { generateGrassBlades } from '../grassPlacement';
import { ISLANDS, getTerrainHeight, getTerrainSlope, isOnLand, meadowLushness } from '../terrain';
import { SAFE_ZONE_RADIUS } from '../../data/constants';

const TOTAL = 2000;

describe('generateGrassBlades', () => {
  const chunks = generateGrassBlades(TOTAL);
  const allBlades = chunks.flat();

  it('is deterministic: two runs produce identical blades', () => {
    const again = generateGrassBlades(TOTAL).flat();
    expect(again.length).toBe(allBlades.length);
    expect(again[0]).toEqual(allBlades[0]);
    expect(again[again.length - 1]).toEqual(allBlades[allBlades.length - 1]);
  });

  it('returns one chunk per island', () => {
    expect(chunks.length).toBe(ISLANDS.length);
  });

  it('places every blade on land, off the plaza, on gentle slopes, at ground height', () => {
    for (const blade of allBlades) {
      expect(isOnLand(blade.x, blade.z)).toBe(true);
      expect(Math.hypot(blade.x, blade.z)).toBeGreaterThanOrEqual(SAFE_ZONE_RADIUS + 1);
      expect(getTerrainSlope(blade.x, blade.z)).toBeLessThanOrEqual(0.85);
      expect(blade.y).toBe(getTerrainHeight(blade.x, blade.z));
    }
  });

  it('clusters blades into lush meadow patches only', () => {
    for (const blade of allBlades) {
      // Tuft spread can drift slightly off the anchor; mask varies slowly.
      expect(meadowLushness(blade.x, blade.z)).toBeGreaterThan(0.35);
    }
  });

  it('budgets blades roughly by island area', () => {
    const mainIsland = ISLANDS[0];
    const areaTotal = ISLANDS.reduce((sum, island) => sum + island.radius ** 2, 0);
    const expected = Math.round((TOTAL * mainIsland.radius ** 2) / areaTotal);
    // Rejection sampling (plaza, slopes) eats some placements, never adds any.
    expect(chunks[0].length).toBeLessThanOrEqual(expected);
    expect(chunks[0].length).toBeGreaterThan(expected * 0.5);
  });

  it('keeps scale and color in range', () => {
    for (const blade of allBlades) {
      expect(blade.scale).toBeGreaterThanOrEqual(0.8);
      expect(blade.scale).toBeLessThanOrEqual(1.4);
      for (const channel of [blade.color.r, blade.color.g, blade.color.b]) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
  });
});
