import { describe, expect, it } from 'vitest';

// Import the real resolvers across the package boundary (server module → client
// vitest runner), same mechanism as crit.test.ts — not a local re-implementation.
import {
  knockbackDisplacement,
  resolveCircleHit,
} from '../../../../spacetimedb/src/attackHitbox';

describe('resolveCircleHit (ATK-06 circle resolver)', () => {
  it('is true strictly inside the circle', () => {
    expect(resolveCircleHit(11, 22, 10, 20, 5.5)).toBe(true);
  });

  it('boundary: is true exactly ON the radius edge (inclusive <=)', () => {
    // Victim sits exactly radius units due east of the center.
    expect(resolveCircleHit(15.5, 20, 10, 20, 5.5)).toBe(true);
  });

  it('is false outside the circle', () => {
    expect(resolveCircleHit(15.51, 20, 10, 20, 5.5)).toBe(false);
    expect(resolveCircleHit(0, 0, 10, 20, 5.5)).toBe(false);
  });

  it('is true when the victim stands exactly on the center', () => {
    expect(resolveCircleHit(10, 20, 10, 20, 5.5)).toBe(true);
  });
});

describe('knockbackDisplacement (HIT-01 displacement math)', () => {
  it('pushes the victim AWAY from the center by exactly `distance` along the normalized delta', () => {
    // Victim due east of the center: 6 more units due east (live leapSlam value, D4-10 retuned).
    expect(knockbackDisplacement(14, 20, 10, 20, 6, 1, 0)).toEqual({ x: 20, z: 20 });
  });

  it('normalizes a diagonal delta before scaling (unit direction, then * distance)', () => {
    // Victim at (3,4) from a center at origin: delta length 5 → direction (0.6, 0.8).
    const displaced = knockbackDisplacement(3, 4, 0, 0, 6, 1, 0);
    expect(displaced.x).toBeCloseTo(3 + 0.6 * 6, 10);
    expect(displaced.z).toBeCloseTo(4 + 0.8 * 6, 10);
  });

  it('zero-length vector: victim exactly on the center falls back to the supplied heading', () => {
    // The fallback heading (the goliath's facing) carries the full displacement.
    expect(knockbackDisplacement(10, 20, 10, 20, 6, 0, 1)).toEqual({ x: 10, z: 26 });
    expect(knockbackDisplacement(10, 20, 10, 20, 6, -1, 0)).toEqual({ x: 4, z: 20 });
  });

  it('preserves direction sign on both axes (victim north-east moves further north-east)', () => {
    const displaced = knockbackDisplacement(12, 23, 10, 20, 6, 1, 0);
    expect(displaced.x).toBeGreaterThan(12);
    expect(displaced.z).toBeGreaterThan(23);
  });
});
