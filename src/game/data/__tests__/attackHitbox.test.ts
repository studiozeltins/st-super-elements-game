import { describe, expect, it } from 'vitest';

// Import the real resolvers across the package boundary (server module → client
// vitest runner), same mechanism as crit.test.ts — not a local re-implementation.
import {
  knockbackDisplacement,
  resolveCircleHit,
  resolveCone,
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

describe('resolveCone (ATK-02 cone resolver, D5-05/D5-06)', () => {
  // Apex at (10, 20), aiming due east (+x), range 3.5, minDot 0.5 = cos(60°)
  // → the 120° full-angle swing cone (D5-06).
  const APEX_X = 10;
  const APEX_Z = 20;
  const RANGE = 3.5;
  const MIN_DOT = 0.5;

  it('is true for a target on the aim axis just inside range', () => {
    expect(resolveCone(APEX_X + RANGE - 0.1, APEX_Z, APEX_X, APEX_Z, 1, 0, RANGE, MIN_DOT)).toBe(true);
  });

  it('boundary: is true at EXACTLY range on the aim axis (inclusive <=, matches resolveCircleHit)', () => {
    expect(resolveCone(APEX_X + RANGE, APEX_Z, APEX_X, APEX_Z, 1, 0, RANGE, MIN_DOT)).toBe(true);
  });

  it('is false just beyond range on the aim axis', () => {
    expect(resolveCone(APEX_X + RANGE + 0.01, APEX_Z, APEX_X, APEX_Z, 1, 0, RANGE, MIN_DOT)).toBe(false);
  });

  it('is false for a target within range but directly BEHIND the apex (SC1 side/back escape)', () => {
    expect(resolveCone(APEX_X - 2, APEX_Z, APEX_X, APEX_Z, 1, 0, RANGE, MIN_DOT)).toBe(false);
  });

  it('boundary: is true at EXACTLY the 60° half-angle edge (dot == minDot, inclusive arc edge)', () => {
    // Apex at the origin so the target offset (1, √3) survives float roundtrip
    // exactly: hypot(1, √3) === 2 and dot === 0.5 === minDot precisely.
    expect(resolveCone(1, Math.sqrt(3), 0, 0, 1, 0, RANGE, MIN_DOT)).toBe(true);
  });

  it('is false just past the half-angle edge (dot slightly < minDot)', () => {
    // 61° off-axis from an origin apex: dot = cos(61°) ≈ 0.4848 < 0.5.
    const angle = (61 * Math.PI) / 180;
    const distance = 2;
    expect(
      resolveCone(distance * Math.cos(angle), distance * Math.sin(angle), 0, 0, 1, 0, RANGE, MIN_DOT)
    ).toBe(false);
  });

  it('is true for a target standing exactly ON the apex (point-blank, degenerate direction)', () => {
    expect(resolveCone(APEX_X, APEX_Z, APEX_X, APEX_Z, 1, 0, RANGE, MIN_DOT)).toBe(true);
  });

  it('zero-length aim vector degrades to a 360° range check', () => {
    // Within range → hit regardless of bearing; beyond range → miss.
    expect(resolveCone(APEX_X - 2, APEX_Z + 1, APEX_X, APEX_Z, 0, 0, RANGE, MIN_DOT)).toBe(true);
    expect(resolveCone(APEX_X + RANGE + 1, APEX_Z, APEX_X, APEX_Z, 0, 0, RANGE, MIN_DOT)).toBe(false);
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
