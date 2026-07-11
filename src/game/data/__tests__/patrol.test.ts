// Unit tests for the server camp-patrol helpers (spacetimedb/src/patrol.ts),
// imported directly across the package boundary like the other server pure
// helpers in serverWorldSim.test.ts. Server-only — the client never simulates
// patrol (it just renders server positions), so there is no client mirror.
import { describe, expect, it } from 'vitest';

import {
  PATROL_ARRIVE_DISTANCE,
  PATROL_MAX_RADIUS,
  PATROL_MIN_RADIUS,
  PATROL_REST_JITTER_MICROS,
  PATROL_REST_MIN_MICROS,
  patrolCandidate,
  patrolRestMicros,
  pickPatrolPoint,
} from '../../../../spacetimedb/src/patrol';

describe('patrolCandidate', () => {
  it('always lands on the [MIN, MAX] ring around home', () => {
    for (let sample = 0; sample < 50; sample++) {
      const angleRandom = (sample * 0.137) % 1;
      const radiusRandom = (sample * 0.311) % 1;
      const point = patrolCandidate(10, -20, angleRandom, radiusRandom);
      const distance = Math.hypot(point.x - 10, point.z - -20);
      expect(distance).toBeGreaterThanOrEqual(PATROL_MIN_RADIUS - 1e-9);
      expect(distance).toBeLessThanOrEqual(PATROL_MAX_RADIUS + 1e-9);
    }
  });

  it('is deterministic from the injected floats', () => {
    expect(patrolCandidate(3, 4, 0.5, 0.5)).toEqual(patrolCandidate(3, 4, 0.5, 0.5));
    // Extremes map to the ring bounds.
    const inner = patrolCandidate(0, 0, 0, 0);
    expect(Math.hypot(inner.x, inner.z)).toBeCloseTo(PATROL_MIN_RADIUS, 9);
    const outer = patrolCandidate(0, 0, 0, 1);
    expect(Math.hypot(outer.x, outer.z)).toBeCloseTo(PATROL_MAX_RADIUS, 9);
  });

  it('the ring stays clear of the arrive epsilon (points are real walks)', () => {
    expect(PATROL_MIN_RADIUS).toBeGreaterThan(PATROL_ARRIVE_DISTANCE);
  });
});

describe('pickPatrolPoint (anti-clump bias)', () => {
  it('picks the candidate FARTHER from the nearest camp-mate', () => {
    const neighbor = { x: 5, z: 0 };
    // Candidate A sits next to the neighbour, B is far away → B wins.
    expect(pickPatrolPoint(4, 0, -5, 0, neighbor)).toEqual({ x: -5, z: 0 });
    // Swapped order: A wins.
    expect(pickPatrolPoint(-5, 0, 4, 0, neighbor)).toEqual({ x: -5, z: 0 });
  });

  it('falls back to the first candidate with no neighbour (last member standing)', () => {
    expect(pickPatrolPoint(1, 2, 3, 4, null)).toEqual({ x: 1, z: 2 });
  });

  it('ties keep the first candidate (deterministic)', () => {
    expect(pickPatrolPoint(2, 0, -2, 0, { x: 0, z: 0 })).toEqual({ x: 2, z: 0 });
  });
});

describe('patrolRestMicros', () => {
  it('spans exactly [MIN, MIN + JITTER] from the injected float', () => {
    expect(patrolRestMicros(0)).toBe(BigInt(PATROL_REST_MIN_MICROS));
    expect(patrolRestMicros(1)).toBe(BigInt(PATROL_REST_MIN_MICROS + PATROL_REST_JITTER_MICROS));
    expect(patrolRestMicros(0.5)).toBe(
      BigInt(PATROL_REST_MIN_MICROS + PATROL_REST_JITTER_MICROS / 2)
    );
    // Deterministic: same float in, same rest out.
    expect(patrolRestMicros(0.42)).toBe(patrolRestMicros(0.42));
  });
});
