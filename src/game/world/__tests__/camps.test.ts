import { describe, expect, it } from 'vitest';
import { getCampSites } from '../camps';
import { SAFE_ZONE_RADIUS, WORLD_BOUND } from '../../data/constants';

const MIN_CAMP_RADIUS = SAFE_ZONE_RADIUS + 16;
const MAX_CAMP_RADIUS = WORLD_BOUND - 12;
const MIN_CAMP_SPACING = 24;

describe('getCampSites', () => {
  it('is deterministic across calls', () => {
    expect(getCampSites()).toEqual(getCampSites());
  });

  it('places exactly 5 camps', () => {
    expect(getCampSites()).toHaveLength(5);
  });

  it('keeps every camp outside the safe zone and inside the world bound', () => {
    for (const camp of getCampSites()) {
      const distance = Math.hypot(camp.x, camp.z);
      expect(distance).toBeGreaterThanOrEqual(MIN_CAMP_RADIUS);
      expect(distance).toBeLessThanOrEqual(MAX_CAMP_RADIUS);
    }
  });

  it('keeps pairwise spacing of at least 24 between camps', () => {
    const camps = getCampSites();
    for (let first = 0; first < camps.length; first += 1) {
      for (let second = first + 1; second < camps.length; second += 1) {
        const spacing = Math.hypot(
          camps[first].x - camps[second].x,
          camps[first].z - camps[second].z
        );
        expect(spacing).toBeGreaterThanOrEqual(MIN_CAMP_SPACING);
      }
    }
  });
});
