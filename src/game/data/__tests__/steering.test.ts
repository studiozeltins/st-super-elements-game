// Unit tests for mutual-avoidance steering (goliaths + walking camp enemies)
// plus the server↔client parity lock: src/game/data/steering.ts must stay a
// VERBATIM mirror of spacetimedb/src/steering.ts.
import { describe, expect, it } from 'vitest';

import * as client from '../steering';
import * as server from '../../../../spacetimedb/src/steering';

const { STEER_LOOKAHEAD_RADII, steerAroundDirection, steeredStep } = server;
type SteerObstacle = server.SteerObstacle;

const RADIUS = 1; // 1 + 1 combined radii → lookahead 5 with the 2.5 multiplier

function obstacle(id: bigint, x: number, z: number, radius = RADIUS): SteerObstacle {
  return { id, x, z, radius };
}

describe('steerAroundDirection', () => {
  it('steers straight when there is no obstacle at all', () => {
    expect(steerAroundDirection(1n, 0, 0, 1, 0, RADIUS, [])).toEqual({ x: 1, z: 0 });
  });

  it('ignores itself in the obstacle list', () => {
    const self = obstacle(1n, 0, 0);
    expect(steerAroundDirection(1n, 0, 0, 1, 0, RADIUS, [self])).toEqual({ x: 1, z: 0 });
  });

  it('ignores a unit BEHIND the desired direction', () => {
    const behind = obstacle(2n, -2, 0); // desired +x, obstacle at -x
    expect(steerAroundDirection(1n, 0, 0, 1, 0, RADIUS, [behind])).toEqual({ x: 1, z: 0 });
  });

  it('ignores a unit beyond the lookahead range', () => {
    const lookahead = STEER_LOOKAHEAD_RADII * (RADIUS + RADIUS);
    const far = obstacle(2n, lookahead + 0.5, 0);
    expect(steerAroundDirection(1n, 0, 0, 1, 0, RADIUS, [far])).toEqual({ x: 1, z: 0 });
  });

  it('deflects around a unit ahead, keeping forward progress', () => {
    const ahead = obstacle(2n, 2, 0);
    const steered = steerAroundDirection(1n, 0, 0, 1, 0, RADIUS, [ahead]);
    expect(Math.hypot(steered.x, steered.z)).toBeCloseTo(1, 9); // normalized
    expect(steered.x).toBeGreaterThan(0); // still moving forward
    expect(Math.abs(steered.z)).toBeGreaterThan(0); // but deflected sideways
  });

  it('a facing pair picks OPPOSITE sides (deterministic by id, no mirroring)', () => {
    // A (id 1) at origin walking +x; B (id 2) at (3,0) walking -x.
    const a = steerAroundDirection(1n, 0, 0, 1, 0, RADIUS, [obstacle(2n, 3, 0)]);
    const b = steerAroundDirection(2n, 3, 0, -1, 0, RADIUS, [obstacle(1n, 0, 0)]);
    // Both deflect off the shared axis...
    expect(Math.abs(a.z)).toBeGreaterThan(0);
    expect(Math.abs(b.z)).toBeGreaterThan(0);
    // ...to opposite world sides, so they split instead of shoving.
    expect(Math.sign(a.z)).toBe(-Math.sign(b.z));
    // And the choice is stable: same inputs, same sides.
    expect(steerAroundDirection(1n, 0, 0, 1, 0, RADIUS, [obstacle(2n, 3, 0)])).toEqual(a);
  });

  it('deflects harder the closer the obstacle is (proximity weighting)', () => {
    const near = steerAroundDirection(1n, 0, 0, 1, 0, RADIUS, [obstacle(2n, 1, 0)]);
    const far = steerAroundDirection(1n, 0, 0, 1, 0, RADIUS, [obstacle(2n, 4, 0)]);
    expect(Math.abs(near.z)).toBeGreaterThan(Math.abs(far.z));
  });

  it('avoids only the NEAREST qualifying obstacle', () => {
    const near = obstacle(2n, 1.5, 0.2);
    const beyond = obstacle(3n, 3, -0.2);
    const both = steerAroundDirection(1n, 0, 0, 1, 0, RADIUS, [beyond, near]);
    const nearOnly = steerAroundDirection(1n, 0, 0, 1, 0, RADIUS, [near]);
    expect(both).toEqual(nearOnly);
  });
});

describe('steeredStep', () => {
  it('with no obstacle it is exactly the straight step (never overshoots)', () => {
    // Far target: advances exactly `step` along the line.
    expect(steeredStep(1n, 0, 0, 10, 0, 2, RADIUS, [])).toEqual({ x: 2, z: 0 });
    // Within one step: arrives at the target instead of overshooting.
    expect(steeredStep(1n, 0, 0, 1, 0, 5, RADIUS, [])).toEqual({ x: 1, z: 0 });
    // Already there: stays put.
    expect(steeredStep(1n, 4, 4, 4, 4, 3, RADIUS, [])).toEqual({ x: 4, z: 4 });
  });

  it('steps at full speed along the deflected direction when avoiding', () => {
    const moved = steeredStep(1n, 0, 0, 10, 0, 2, RADIUS, [obstacle(2n, 2, 0)]);
    expect(Math.hypot(moved.x, moved.z)).toBeCloseTo(2, 9);
    expect(moved.z).not.toBe(0);
  });
});

describe('client steering mirror stays in sync with the server (parity)', () => {
  it('constants and export surface match', () => {
    expect(client.STEER_LOOKAHEAD_RADII).toBe(server.STEER_LOOKAHEAD_RADII);
    expect(client.STEER_AVOID_STRENGTH).toBe(server.STEER_AVOID_STRENGTH);
    expect(Object.keys(client).sort()).toEqual(Object.keys(server).sort());
  });

  it('steering outputs agree across a grid of scenarios', () => {
    const scenarios: { selfId: bigint; x: number; z: number; dx: number; dz: number; obstacles: SteerObstacle[] }[] = [
      { selfId: 1n, x: 0, z: 0, dx: 1, dz: 0, obstacles: [] },
      { selfId: 1n, x: 0, z: 0, dx: 1, dz: 0, obstacles: [obstacle(2n, 2, 0)] },
      { selfId: 2n, x: 3, z: 0, dx: -1, dz: 0, obstacles: [obstacle(1n, 0, 0)] },
      { selfId: 5n, x: -2, z: 4, dx: 0.6, dz: 0.8, obstacles: [obstacle(3n, -1, 5), obstacle(9n, 1, 8)] },
      { selfId: 7n, x: 1, z: 1, dx: 0, dz: 1, obstacles: [obstacle(2n, 1, -3)] },
    ];
    for (const { selfId, x, z, dx, dz, obstacles } of scenarios) {
      expect(client.steerAroundDirection(selfId, x, z, dx, dz, RADIUS, obstacles)).toEqual(
        server.steerAroundDirection(selfId, x, z, dx, dz, RADIUS, obstacles)
      );
      expect(client.steeredStep(selfId, x, z, x + dx * 10, z + dz * 10, 0.5, RADIUS, obstacles)).toEqual(
        server.steeredStep(selfId, x, z, x + dx * 10, z + dz * 10, 0.5, RADIUS, obstacles)
      );
    }
  });
});
