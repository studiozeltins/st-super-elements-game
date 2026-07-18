import { describe, expect, it } from 'vitest';
import { generateGrassBlades } from '../grassPlacement';
import { ISLANDS, getTerrainHeight, getTerrainSlope, isOnLand, meadowLushness } from '../terrain';
import { footpathFactor, roadFactor } from '../roads';
import { isInTown } from '../town/townPlan';
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

  it('clusters most blades into lush meadow patches, keeping only a sparse base elsewhere', () => {
    // Acceptance ramps from BASE_ACCEPT (a deliberate sparse base on bare hills
    // and outer islands — the grass-on-hills change) up to ~1 in the lushest
    // patches, so the invariant is CLUSTERING, not "meadow only": the vast
    // majority of blades land in lush ground and the mean lushness sits well
    // above a uniform sprinkle. A scatter-everywhere regression sinks both.
    const lush = allBlades.map(blade => meadowLushness(blade.x, blade.z));
    const mean = lush.reduce((sum, value) => sum + value, 0) / lush.length;
    const fractionLush = lush.filter(value => value > 0.3).length / lush.length;
    expect(mean).toBeGreaterThan(0.5);
    expect(fractionLush).toBeGreaterThan(0.85);
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

  it('thins — but does not clear — grass along footpath spines', () => {
    // Blades still poke through the trampled path: some land on strong spines.
    const onSpine = allBlades.filter(blade => footpathFactor(blade.x, blade.z) > 0.25);
    expect(onSpine.length).toBeGreaterThan(0); // NOT a hard clear like a road

    // But areal density on spines is markedly LOWER than in matched non-path
    // meadow of comparable lushness. Grid-scan eligible cells to normalise by
    // available area so the comparison is a true density, not a raw count.
    const PLAZA = SAFE_ZONE_RADIUS + 1;
    let areaSpine = 0;
    let areaMeadow = 0;
    for (let x = -120; x <= 120; x += 1) {
      for (let z = -120; z <= 120; z += 1) {
        if (!isOnLand(x, z)) continue;
        if (Math.hypot(x, z) < PLAZA) continue;
        if (getTerrainSlope(x, z) > 0.85) continue;
        if (roadFactor(x, z) > 0.5) continue;
        if (isInTown(x, z)) continue;
        if (meadowLushness(x, z) < 0.4) continue; // match on lushness (drives density)
        const foot = footpathFactor(x, z);
        if (foot > 0.25) areaSpine += 1;
        else if (foot === 0) areaMeadow += 1;
      }
    }
    const spineBlades = allBlades.filter(
      blade => meadowLushness(blade.x, blade.z) >= 0.4 && footpathFactor(blade.x, blade.z) > 0.25
    ).length;
    const meadowBlades = allBlades.filter(
      blade => meadowLushness(blade.x, blade.z) >= 0.4 && footpathFactor(blade.x, blade.z) === 0
    ).length;
    const spineDensity = spineBlades / areaSpine;
    const meadowDensity = meadowBlades / areaMeadow;
    // Trampled: at least a third thinner than matched meadow (observed ~3x).
    expect(spineDensity).toBeLessThan(meadowDensity * 0.7);
    // And meadow density away from paths is preserved (no global regression).
    expect(meadowDensity).toBeGreaterThan(0.1);
  });
});
