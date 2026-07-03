import { describe, expect, it } from 'vitest';
import { getCampSites } from '../camps';
import { getTerrainHeight, isOnLand, ISLANDS } from '../terrain';
import { SAFE_ZONE_RADIUS } from '../../data/constants';

const OUTER_ISLAND_COUNT = ISLANDS.length - 1;
const CITY_CAMP_COUNT = 2;

describe('getCampSites', () => {
  it('is deterministic across calls', () => {
    expect(getCampSites()).toEqual(getCampSites());
  });

  it('places one camp per outer island plus two on the city island', () => {
    expect(getCampSites()).toHaveLength(OUTER_ISLAND_COUNT + CITY_CAMP_COUNT);
  });

  it('places every camp on solid ground', () => {
    for (const camp of getCampSites()) {
      expect(isOnLand(camp.x, camp.z)).toBe(true);
      expect(getTerrainHeight(camp.x, camp.z)).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps every camp outside the safe zone', () => {
    for (const camp of getCampSites()) {
      expect(Math.hypot(camp.x, camp.z)).toBeGreaterThan(SAFE_ZONE_RADIUS + 10);
    }
  });

  it('assigns the outer-island camps near their island centers', () => {
    const camps = getCampSites();
    ISLANDS.slice(1).forEach((island, islandIndex) => {
      const camp = camps[islandIndex];
      const distanceFromIslandCenter = Math.hypot(camp.x - island.centerX, camp.z - island.centerZ);
      expect(distanceFromIslandCenter).toBeLessThanOrEqual(island.radius * 0.4);
    });
  });
});
