import { describe, expect, it } from 'vitest';
import {
  DEBRIS_GRAVITY,
  DEBRIS_RESTITUTION,
  acquireDebrisSlot,
  debrisScale,
  stepDebris,
  type DebrisParticle,
} from '../debrisMath';

function makeParticle(overrides: Partial<DebrisParticle> = {}): DebrisParticle {
  return {
    x: 0,
    y: 2,
    z: 0,
    vx: 1,
    vy: 0,
    vz: 0,
    spinX: 1,
    spinZ: 1,
    rotX: 0,
    rotZ: 0,
    age: 0,
    life: 2,
    baseScale: 0.2,
    active: true,
    ...overrides,
  };
}

describe('stepDebris', () => {
  it('applies gravity and moves the particle', () => {
    const particle = makeParticle();
    stepDebris(particle, 0.1, 0);
    expect(particle.vy).toBeLessThan(0);
    expect(particle.x).toBeCloseTo(0.1);
    expect(particle.y).toBeLessThan(2);
  });

  it('bounces off the ground with restitution and never sinks below it', () => {
    const particle = makeParticle({ y: 0.01, vy: -5 });
    stepDebris(particle, 0.1, 0);
    expect(particle.y).toBeGreaterThanOrEqual(0);
    expect(particle.vy).toBeGreaterThan(0);
    // Gravity integrates before the bounce, so the ceiling includes one step of it.
    const impactSpeed = 5 + DEBRIS_GRAVITY * 0.1;
    expect(particle.vy).toBeLessThanOrEqual(impactSpeed * DEBRIS_RESTITUTION + 1e-9);
  });

  it('expires at end of life and deactivates', () => {
    const particle = makeParticle({ age: 1.95 });
    expect(stepDebris(particle, 0.1, 0)).toBe(false);
    expect(particle.active).toBe(false);
  });
});

describe('debrisScale', () => {
  it('shrinks monotonically to zero at end of life', () => {
    const particle = makeParticle();
    const early = debrisScale({ ...particle, age: 0 });
    const mid = debrisScale({ ...particle, age: 1 });
    const late = debrisScale({ ...particle, age: 2 });
    expect(early).toBe(particle.baseScale);
    expect(mid).toBeLessThan(early);
    expect(late).toBeCloseTo(0);
  });
});

describe('acquireDebrisSlot', () => {
  it('prefers an inactive slot', () => {
    const pool = [makeParticle(), makeParticle({ active: false }), makeParticle()];
    expect(acquireDebrisSlot(pool)).toBe(1);
  });

  it('steals the oldest when all slots are active', () => {
    const pool = [makeParticle({ age: 0.5 }), makeParticle({ age: 1.8 }), makeParticle({ age: 1 })];
    expect(acquireDebrisSlot(pool)).toBe(1);
  });
});
