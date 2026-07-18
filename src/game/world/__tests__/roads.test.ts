import { describe, expect, it } from 'vitest';
import { getFootpaths, footpathFactor, FOOTPATH_MAX } from '../roads';
import { getCampSites } from '../camps';
import { ISLANDS } from '../terrain';
import type { CampSite } from '../camps';

/** Same data-driven split the route graph uses: a camp within the city island's
 *  radius of its centre is a city-island camp; the rest are outer-island camps. */
const cityIsland = ISLANDS[0];
const isCityCamp = (camp: CampSite): boolean =>
  Math.hypot(camp.x - cityIsland.centerX, camp.z - cityIsland.centerZ) <= cityIsland.radius;

describe('getFootpaths', () => {
  it('returns a non-empty route graph', () => {
    expect(getFootpaths().length).toBeGreaterThan(0);
  });

  it('is memoized: two calls return the referentially stable array', () => {
    expect(getFootpaths()).toBe(getFootpaths());
  });
});

describe('footpathFactor', () => {
  it('is > 0 on a city-island camp (a real route endpoint)', () => {
    const cityCamp = getCampSites().find(isCityCamp);
    expect(cityCamp).toBeDefined();
    expect(footpathFactor(cityCamp!.x, cityCamp!.z)).toBeGreaterThan(0);
  });

  it('is 0 far off in the open sea, away from every route', () => {
    expect(footpathFactor(1000, 1000)).toBe(0);
    expect(footpathFactor(-800, 600)).toBe(0);
  });

  it('never exceeds FOOTPATH_MAX — partial by construction, never a full clear', () => {
    for (let x = -120; x <= 120; x += 4) {
      for (let z = -120; z <= 120; z += 4) {
        expect(footpathFactor(x, z)).toBeLessThanOrEqual(FOOTPATH_MAX);
      }
    }
  });

  it('bakes no path across the water gap between two islands', () => {
    const camps = getCampSites();
    const cityCamp = camps.find(isCityCamp);
    const outerCamp = camps.find(camp => !isCityCamp(camp));
    expect(cityCamp).toBeDefined();
    expect(outerCamp).toBeDefined();
    // Halfway on the straight line between a city camp and an outer camp lands in
    // open water, off every bridge. No footpath crosses water, so the mask is 0.
    const midX = (cityCamp!.x + outerCamp!.x) / 2;
    const midZ = (cityCamp!.z + outerCamp!.z) / 2;
    expect(footpathFactor(midX, midZ)).toBe(0);
  });
});
