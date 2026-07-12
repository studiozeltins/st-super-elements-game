import { describe, expect, it } from 'vitest';
import {
  INFLUENCE_WORLD_MIN,
  INFLUENCE_WORLD_SIZE,
  decayForDelta,
  encodeBendDirection,
  wearDecayForDelta,
  worldToInfluenceUv,
} from '../groundInfluenceMath';

describe('worldToInfluenceUv', () => {
  it('maps the world corners to uv 0 and 1', () => {
    const min = worldToInfluenceUv(INFLUENCE_WORLD_MIN, INFLUENCE_WORLD_MIN);
    expect(min.u).toBeCloseTo(0);
    expect(min.v).toBeCloseTo(0);
    const max = worldToInfluenceUv(
      INFLUENCE_WORLD_MIN + INFLUENCE_WORLD_SIZE,
      INFLUENCE_WORLD_MIN + INFLUENCE_WORLD_SIZE
    );
    expect(max.u).toBeCloseTo(1);
    expect(max.v).toBeCloseTo(1);
  });

  it('maps the world origin to the uv center', () => {
    const center = worldToInfluenceUv(0, 0);
    expect(center.u).toBeCloseTo(0.5);
    expect(center.v).toBeCloseTo(0.5);
  });
});

describe('encodeBendDirection', () => {
  it('encodes a zero vector as neutral (0.5, 0.5)', () => {
    expect(encodeBendDirection(0, 0)).toEqual({ r: 0.5, g: 0.5 });
  });

  it('normalizes before encoding: magnitude does not matter', () => {
    const small = encodeBendDirection(0.001, 0);
    const large = encodeBendDirection(1000, 0);
    expect(small.r).toBeCloseTo(large.r);
    expect(small.r).toBeCloseTo(1);
    expect(small.g).toBeCloseTo(0.5);
  });

  it('keeps encodings inside [0, 1]', () => {
    for (const [dx, dz] of [
      [1, 1],
      [-3, 2],
      [0, -5],
    ]) {
      const { r, g } = encodeBendDirection(dx, dz);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
    }
  });
});

describe('decayForDelta', () => {
  it('is below 1 for any positive delta and monotone in dt', () => {
    expect(decayForDelta(1 / 60)).toBeLessThan(1);
    expect(decayForDelta(2 / 60)).toBeLessThan(decayForDelta(1 / 60));
  });

  it('composes: two half-steps equal one full step', () => {
    const half = decayForDelta(1 / 120);
    expect(half * half).toBeCloseTo(decayForDelta(1 / 60), 10);
  });
});

describe('wearDecayForDelta', () => {
  it('composes: two half-steps equal one full step (frame-rate independent)', () => {
    const half = wearDecayForDelta(1 / 120);
    expect(half * half).toBeCloseTo(wearDecayForDelta(1 / 60), 10);
  });

  it('regrows much slower than the bend decay', () => {
    expect(wearDecayForDelta(1 / 60)).toBeGreaterThan(decayForDelta(1 / 60));
  });

  it('full wear regrows within about a minute, but not much sooner', () => {
    // Destroyed grass (wear 1) should still read at 30s and be gone by ~60s.
    expect(wearDecayForDelta(30)).toBeGreaterThan(0.1);
    expect(wearDecayForDelta(60)).toBeLessThan(0.1);
  });
});
