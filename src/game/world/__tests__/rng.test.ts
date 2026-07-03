import { describe, expect, it } from 'vitest';
import { createSeededRandom, hashGridPoint } from '../rng';

function drawSequence(seed: number, count: number): number[] {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, () => random());
}

describe('createSeededRandom', () => {
  it('produces an identical sequence for the same seed', () => {
    expect(drawSequence(42, 50)).toEqual(drawSequence(42, 50));
  });

  it('produces a different sequence for a different seed', () => {
    expect(drawSequence(1, 50)).not.toEqual(drawSequence(2, 50));
  });

  it('only yields values in [0, 1)', () => {
    for (const value of drawSequence(20260703, 1000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('hashGridPoint', () => {
  it('is deterministic for the same grid point and seed', () => {
    expect(hashGridPoint(13, -7, 99)).toBe(hashGridPoint(13, -7, 99));
  });

  it('only yields values in [0, 1)', () => {
    for (let gridX = -10; gridX <= 10; gridX += 1) {
      for (let gridZ = -10; gridZ <= 10; gridZ += 1) {
        const value = hashGridPoint(gridX, gridZ, 123);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    }
  });

  it('differs between neighboring grid cells', () => {
    const origin = hashGridPoint(5, 5, 7);
    expect(hashGridPoint(6, 5, 7)).not.toBe(origin);
    expect(hashGridPoint(5, 6, 7)).not.toBe(origin);
    expect(hashGridPoint(4, 5, 7)).not.toBe(origin);
    expect(hashGridPoint(5, 4, 7)).not.toBe(origin);
  });
});
