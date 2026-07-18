import { describe, expect, it } from 'vitest';
import { surfaceAt } from '../surfaceAt';
import type { Surface } from '../surfaceAt';
import { getRoads, getFootpaths, roadFactor, footpathFactor } from '../../world/roads';
import { isInTown, TOWN_DISTRICTS } from '../../world/town/townPlan';

const ALL_TAGS: Surface[] = ['grass', 'dirt', 'path', 'town'];

/** Midpoint of the island-side road segment — squarely on a road centerline
 * (roadFactor === 1), far from town and off any footpath: the canonical 'dirt'. */
function roadCenterlinePoint(): { x: number; z: number } {
  const islandSide = getRoads()[1];
  return {
    x: (islandSide[0].x + islandSide[1].x) / 2,
    z: (islandSide[0].z + islandSide[1].z) / 2,
  };
}

/** A footpath vertex that is genuinely off any road and outside town — where the
 * raw factors say "path" and nothing higher-precedence applies. Derived from real
 * route data so the test tracks the actual world, not a magic coordinate. */
function footpathOnlyPoint(): { x: number; z: number } {
  for (const spine of getFootpaths()) {
    for (const p of spine) {
      if (!isInTown(p.x, p.z) && roadFactor(p.x, p.z) <= 0.5 && footpathFactor(p.x, p.z) > 0.25) {
        return { x: p.x, z: p.z };
      }
    }
  }
  throw new Error('no footpath-only vertex found in route data');
}

describe('surfaceAt', () => {
  it("classifies the plaza origin as 'town'", () => {
    expect(surfaceAt(0, 0)).toBe('town');
  });

  it("classifies every town district center as 'town'", () => {
    for (const d of TOWN_DISTRICTS) {
      expect(surfaceAt(d.cx, d.cz)).toBe('town');
    }
  });

  it("classifies a road centerline point (off town) as 'dirt'", () => {
    const p = roadCenterlinePoint();
    expect(isInTown(p.x, p.z)).toBe(false);
    expect(roadFactor(p.x, p.z)).toBeGreaterThan(0.5);
    expect(surfaceAt(p.x, p.z)).toBe('dirt');
  });

  it("classifies a worn footpath spine (off road, off town) as 'path'", () => {
    const p = footpathOnlyPoint();
    expect(surfaceAt(p.x, p.z)).toBe('path');
  });

  it("classifies open meadow far from town/roads/footpaths as 'grass'", () => {
    // Far south, away from every island, road, and footpath.
    expect(surfaceAt(0, -200)).toBe('grass');
    expect(surfaceAt(-250, 180)).toBe('grass');
  });
});

describe('surfaceAt precedence (town > dirt > path > grass)', () => {
  it("town beats road: a road vertex inside town classifies as 'town'", () => {
    // The city-side road exits the plaza at PLAZA_EXIT_RADIUS (16), which lands
    // inside the solid town — a point that is BOTH on a road (roadFactor > 0.5)
    // and in town. Town must win.
    const cityExit = getRoads()[0][0];
    expect(isInTown(cityExit.x, cityExit.z)).toBe(true);
    expect(roadFactor(cityExit.x, cityExit.z)).toBeGreaterThan(0.5);
    expect(surfaceAt(cityExit.x, cityExit.z)).toBe('town');
  });

  it("road beats footpath: a point on both a road and a footpath classifies as 'dirt'", () => {
    // The destination-island bridge's city landing is the shared endpoint of both
    // the road's city-side segment and that bridge's footpath — both masks fire.
    const landing = getRoads()[0][1];
    expect(isInTown(landing.x, landing.z)).toBe(false);
    expect(roadFactor(landing.x, landing.z)).toBeGreaterThan(0.5);
    expect(footpathFactor(landing.x, landing.z)).toBeGreaterThan(0.25);
    expect(surfaceAt(landing.x, landing.z)).toBe('dirt');
  });

  it("footpath beats grass: a footpath-only vertex classifies as 'path' not 'grass'", () => {
    const p = footpathOnlyPoint();
    expect(footpathFactor(p.x, p.z)).toBeGreaterThan(0.25);
    expect(roadFactor(p.x, p.z)).toBeLessThanOrEqual(0.5);
    expect(surfaceAt(p.x, p.z)).toBe('path');
  });
});

describe('surfaceAt is exhaustive and mutually exclusive', () => {
  it('returns exactly one of the four tags for every sampled world point', () => {
    for (let x = -260; x <= 260; x += 13) {
      for (let z = -260; z <= 260; z += 13) {
        const surface = surfaceAt(x, z);
        expect(ALL_TAGS).toContain(surface);
      }
    }
  });
});
