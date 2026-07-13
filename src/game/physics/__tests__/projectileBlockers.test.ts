import { describe, expect, it } from 'vitest';
import { clampRangeToWorld, pointHitsObstacle, pointHitsWorld } from '../projectileBlockers';
import type { ObstacleCircle } from '../resolveCollisions';

const flatGround = () => 0;

describe('pointHitsObstacle', () => {
  const rock: ObstacleCircle = { x: 10, y: 0, z: 0, radius: 1.5, height: 6 };

  it('hits inside the circle within the solid span', () => {
    expect(pointHitsObstacle(10.5, 2, 0, [rock])).toBe(true);
  });

  it('misses outside the circle', () => {
    expect(pointHitsObstacle(12, 2, 0, [rock])).toBe(false);
  });

  it('passes above the solid top (shooting over a low tent)', () => {
    expect(pointHitsObstacle(10, 6.5, 0, [rock])).toBe(false);
  });

  it('passes below the base (shooting under a cliff-perched prop)', () => {
    expect(pointHitsObstacle(10, -1, 0, [rock])).toBe(false);
  });

  it('defaults to a 3-unit solid span when height is omitted', () => {
    const tent: ObstacleCircle = { x: 0, y: 0, z: 0, radius: 1 };
    expect(pointHitsObstacle(0, 2.9, 0, [tent])).toBe(true);
    expect(pointHitsObstacle(0, 3.1, 0, [tent])).toBe(false);
  });
});

describe('pointHitsWorld', () => {
  it('hits when at or below the terrain surface', () => {
    expect(pointHitsWorld(0, 1, 0, [], (x, _z) => (x >= 0 ? 2 : 0))).toBe(true);
  });

  it('clear above terrain with no obstacles', () => {
    expect(pointHitsWorld(0, 1, 0, [], flatGround)).toBe(false);
  });
});

describe('clampRangeToWorld', () => {
  it('returns maxRange over open ground', () => {
    expect(clampRangeToWorld(0, 1.2, 0, 1, 0, 30, [], flatGround)).toBe(30);
  });

  it('stops at a rising slope', () => {
    // Ground climbs past the ray height (1.2) at x = 12.
    const slope = (x: number) => (x >= 12 ? 5 : 0);
    const range = clampRangeToWorld(0, 1.2, 0, 1, 0, 30, [], slope);
    expect(range).toBeGreaterThanOrEqual(11.5);
    expect(range).toBeLessThanOrEqual(12.5);
  });

  it('stops at an obstacle in the path', () => {
    const rock: ObstacleCircle = { x: 8, y: 0, z: 0, radius: 1, height: 6 };
    const range = clampRangeToWorld(0, 1.2, 0, 1, 0, 30, [rock], flatGround);
    expect(range).toBeGreaterThanOrEqual(6.5);
    expect(range).toBeLessThanOrEqual(7.5);
  });

  it('ignores obstacles the ray flies over', () => {
    const stump: ObstacleCircle = { x: 8, y: 0, z: 0, radius: 1, height: 0.8 };
    expect(clampRangeToWorld(0, 1.2, 0, 1, 0, 30, [stump], flatGround)).toBe(30);
  });

  it('normalizes an unnormalized direction', () => {
    const rock: ObstacleCircle = { x: 8, y: 0, z: 0, radius: 1, height: 6 };
    const range = clampRangeToWorld(0, 1.2, 0, 5, 0, 30, [rock], flatGround);
    expect(range).toBeLessThanOrEqual(7.5);
  });

  it('returns 0 for a zero direction', () => {
    expect(clampRangeToWorld(0, 1.2, 0, 0, 0, 30, [], flatGround)).toBe(0);
  });
});
