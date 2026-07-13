/**
 * Pure physics for the cube-debris pool — integrable without THREE so the
 * bounce/expiry rules are unit-testable.
 */
export interface DebrisParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spinX: number;
  spinZ: number;
  rotX: number;
  rotZ: number;
  age: number;
  life: number;
  baseScale: number;
  active: boolean;
}

export const DEBRIS_GRAVITY = 18;
export const DEBRIS_RESTITUTION = 0.4;

/** Integrates one particle; bounces off groundY; returns false when expired. */
export function stepDebris(particle: DebrisParticle, deltaSeconds: number, groundY: number): boolean {
  particle.age += deltaSeconds;
  if (particle.age >= particle.life) {
    particle.active = false;
    return false;
  }
  particle.vy -= DEBRIS_GRAVITY * deltaSeconds;
  particle.x += particle.vx * deltaSeconds;
  particle.y += particle.vy * deltaSeconds;
  particle.z += particle.vz * deltaSeconds;
  particle.rotX += particle.spinX * deltaSeconds;
  particle.rotZ += particle.spinZ * deltaSeconds;
  if (particle.y < groundY) {
    particle.y = groundY;
    if (particle.vy < 0) {
      particle.vy = -particle.vy * DEBRIS_RESTITUTION;
      // Ground friction bleeds sideways speed on each bounce.
      particle.vx *= 0.7;
      particle.vz *= 0.7;
    }
  }
  return true;
}

/** Shrink-out over the last part of life (InstancedMesh has no per-instance opacity). */
export function debrisScale(particle: DebrisParticle): number {
  const lifeFraction = particle.age / particle.life;
  return particle.baseScale * Math.max(0, 1 - lifeFraction * lifeFraction);
}

/** Slot to overwrite: first inactive, else the oldest (never fail a spawn). */
export function acquireDebrisSlot(pool: readonly DebrisParticle[]): number {
  let oldestIndex = 0;
  let oldestAge = -Infinity;
  for (let index = 0; index < pool.length; index += 1) {
    if (!pool[index].active) return index;
    if (pool[index].age > oldestAge) {
      oldestAge = pool[index].age;
      oldestIndex = index;
    }
  }
  return oldestIndex;
}
