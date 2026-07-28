import { describe, expect, it } from 'vitest';
import { sampleBeachSliceHeights } from './beachSlice';
import { SEA_LEVEL } from '../game/world/terrain';

/**
 * Pure height-sampling test (SPIKE-01, D-03). The representative beach slice must
 * cross the waterline so the depth-outline pass has real shoreline edges to bite
 * on — a bare plane (all-one-height) would give the go/no-go an incomplete test.
 * We pin the BEHAVIOR (the sampled field straddles SEA_LEVEL = -0.8 with real
 * relief), not exact heights — getTerrainHeight is deterministic but the exact
 * values are an implementation detail.
 */
describe('beachSlice height sampling (SPIKE-01, D-03)', () => {
  it('samples a non-empty grid of real terrain heights', () => {
    const { count } = sampleBeachSliceHeights();
    expect(count).toBeGreaterThan(0);
  });

  it('straddles the waterline: min below SEA_LEVEL, max above it', () => {
    const { min, max } = sampleBeachSliceHeights();
    // Sea shelf / void beyond the shore sits below the waterline...
    expect(min).toBeLessThan(SEA_LEVEL);
    // ...and dry sand / island land rises above it. Both present = a real shore.
    expect(max).toBeGreaterThan(SEA_LEVEL);
  });

  it('has genuine relief (not a near-flat plane)', () => {
    const { min, max } = sampleBeachSliceHeights();
    // The slice spans land down to the void falloff — a substantial vertical
    // range, which is what gives the outline pass depth discontinuities.
    expect(max - min).toBeGreaterThan(5);
  });
});
