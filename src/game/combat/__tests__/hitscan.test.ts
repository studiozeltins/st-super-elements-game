import { describe, it, expect } from 'vitest';
// The server's attackRay reducer damages the single entity this pure helper picks.
// vitest resolves the server .ts directly (same as serverWorldSim.test.ts), so we
// test the exact geometry the ranged hitscan uses.
import { pickRayHit } from '../../../../spacetimedb/src/hitscan';

// A ray from the origin heading +z (into the world).
const ORIGIN_X = 0;
const ORIGIN_Z = 0;
const DIR_X = 0;
const DIR_Z = 1;
const RANGE = 45;
const HIT_RADIUS = 2;

describe('pickRayHit', () => {
  it('picks the nearest entity along the ray when several are within radius', () => {
    const positions = [
      { x: 0, z: 30 }, // far, on the line
      { x: 0, z: 10 }, // near, on the line
      { x: 1, z: 20 }, // middle, offset but within radius
    ];
    const hit = pickRayHit(positions, ORIGIN_X, ORIGIN_Z, DIR_X, DIR_Z, RANGE, HIT_RADIUS);
    expect(hit.index).toBe(1); // the z=10 entity (smallest alongRay)
    expect(hit.alongRay).toBeCloseTo(10);
  });

  it('lands a far hit — the regression: an enemy at range 40 on the ray line is struck', () => {
    // The old per-frame projectile whiffed on far, moving targets. A hitscan from
    // authoritative positions lands the same regardless of distance.
    const hit = pickRayHit([{ x: 0, z: 40 }], ORIGIN_X, ORIGIN_Z, DIR_X, DIR_Z, RANGE, HIT_RADIUS);
    expect(hit.index).toBe(0);
    expect(hit.alongRay).toBeCloseTo(40);
  });

  it('misses an entity just beyond range', () => {
    const withinRange = pickRayHit([{ x: 0, z: 45 }], ORIGIN_X, ORIGIN_Z, DIR_X, DIR_Z, RANGE, HIT_RADIUS);
    expect(withinRange.index).toBe(0);
    const beyondRange = pickRayHit([{ x: 0, z: 45.01 }], ORIGIN_X, ORIGIN_Z, DIR_X, DIR_Z, RANGE, HIT_RADIUS);
    expect(beyondRange.index).toBe(-1);
  });

  it('misses an entity whose perpendicular distance is just beyond hitRadius', () => {
    const onEdge = pickRayHit([{ x: 2, z: 20 }], ORIGIN_X, ORIGIN_Z, DIR_X, DIR_Z, RANGE, HIT_RADIUS);
    expect(onEdge.index).toBe(0); // exactly on the radius edge
    const justOutside = pickRayHit([{ x: 2.01, z: 20 }], ORIGIN_X, ORIGIN_Z, DIR_X, DIR_Z, RANGE, HIT_RADIUS);
    expect(justOutside.index).toBe(-1);
  });

  it('ignores entities behind the origin', () => {
    const behind = pickRayHit([{ x: 0, z: -10 }], ORIGIN_X, ORIGIN_Z, DIR_X, DIR_Z, RANGE, HIT_RADIUS);
    expect(behind.index).toBe(-1);
  });

  it('returns a miss for a zero-length direction', () => {
    const hit = pickRayHit([{ x: 0, z: 10 }], ORIGIN_X, ORIGIN_Z, 0, 0, RANGE, HIT_RADIUS);
    expect(hit.index).toBe(-1);
  });

  it('returns a miss for non-finite inputs', () => {
    const hit = pickRayHit([{ x: 0, z: 10 }], ORIGIN_X, ORIGIN_Z, NaN, DIR_Z, RANGE, HIT_RADIUS);
    expect(hit.index).toBe(-1);
  });

  it('returns a miss for an empty entity list', () => {
    expect(pickRayHit([], ORIGIN_X, ORIGIN_Z, DIR_X, DIR_Z, RANGE, HIT_RADIUS).index).toBe(-1);
  });
});
