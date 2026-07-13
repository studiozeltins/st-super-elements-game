import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import {
  resolveBodyCollisions,
  resolveObstacleCollisions,
  type CollisionBody,
} from '../resolveCollisions';

function body(x: number, z: number, radius: number, mass: number, y = 0): CollisionBody {
  return { position: new Vector3(x, y, z), radius, mass };
}

describe('resolveBodyCollisions', () => {
  it('separates two overlapping equal bodies symmetrically', () => {
    const left = body(0, 0, 0.5, 1);
    const right = body(0.6, 0, 0.5, 1);
    resolveBodyCollisions([left, right]);
    const distance = left.position.distanceTo(right.position);
    expect(distance).toBeCloseTo(1, 5);
    expect(left.position.x).toBeCloseTo(-right.position.x + 0.6, 5);
  });

  it('shoves the light body while the heavy one barely moves', () => {
    const golem = body(0, 0, 0.85, 3.2);
    const wisp = body(0.5, 0, 0.55, 0.45);
    resolveBodyCollisions([golem, wisp]);
    expect(Math.abs(golem.position.x)).toBeLessThan(0.15);
    expect(wisp.position.x).toBeGreaterThan(1);
  });

  it('leaves non-overlapping bodies untouched', () => {
    const first = body(0, 0, 0.5, 1);
    const second = body(5, 0, 0.5, 1);
    resolveBodyCollisions([first, second]);
    expect(first.position.x).toBe(0);
    expect(second.position.x).toBe(5);
  });

  it('ignores bodies on different height levels (cliff gate)', () => {
    const below = body(0, 0, 0.5, 1, 0);
    const above = body(0.3, 0, 0.5, 1, 3);
    resolveBodyCollisions([below, above]);
    expect(below.position.x).toBe(0);
    expect(above.position.x).toBe(0.3);
  });
});

describe('resolveObstacleCollisions', () => {
  it('pushes a body out of a solid obstacle along the contact normal', () => {
    const walker = body(0.4, 0, 0.45, 1);
    resolveObstacleCollisions(walker, [{ x: 0, y: 0, z: 0, radius: 0.7 }]);
    expect(Math.hypot(walker.position.x, walker.position.z)).toBeCloseTo(1.15, 5);
  });

  it('does nothing when the body is clear of every obstacle', () => {
    const walker = body(5, 5, 0.45, 1);
    resolveObstacleCollisions(walker, [{ x: 0, y: 0, z: 0, radius: 0.7 }]);
    expect(walker.position.x).toBe(5);
    expect(walker.position.z).toBe(5);
  });

  it('ignores obstacles far below (bridge deck passing over a spire base)', () => {
    const walkerOnDeck = body(0.4, 0, 0.45, 1, 6);
    resolveObstacleCollisions(walkerOnDeck, [{ x: 0, y: 0, z: 0, radius: 0.7 }]);
    expect(walkerOnDeck.position.x).toBe(0.4);
    expect(walkerOnDeck.position.z).toBe(0);
  });

  it('blocks a tall obstacle at any height inside its span', () => {
    const jumper = body(0.4, 0, 0.45, 1, 4);
    resolveObstacleCollisions(jumper, [{ x: 0, y: 0, z: 0, radius: 0.7, height: 8 }]);
    expect(Math.hypot(jumper.position.x, jumper.position.z)).toBeCloseTo(1.15, 5);
  });

  it('lets a jumper near a climbable top pass (landing on a boulder)', () => {
    const jumper = body(0.4, 0, 0.45, 1, 1.9);
    resolveObstacleCollisions(jumper, [{ x: 0, y: 0, z: 0, radius: 0.7, height: 2.2 }]);
    expect(jumper.position.x).toBe(0.4);
    expect(jumper.position.z).toBe(0);
  });

  it('still blocks a walker at the base of a climbable boulder', () => {
    const walker = body(0.4, 0, 0.45, 1, 0);
    resolveObstacleCollisions(walker, [{ x: 0, y: 0, z: 0, radius: 0.7, height: 2.2 }]);
    expect(Math.hypot(walker.position.x, walker.position.z)).toBeCloseTo(1.15, 5);
  });
});
