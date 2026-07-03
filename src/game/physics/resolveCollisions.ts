import type * as THREE from 'three';

/** A pushable circle on the XZ plane. Position is mutated in place. */
export interface CollisionBody {
  position: THREE.Vector3;
  radius: number;
  /** Heavier bodies shove lighter ones aside and barely move themselves. */
  mass: number;
}

export interface ObstacleCircle {
  x: number;
  z: number;
  radius: number;
}

/** Bodies more than this far apart vertically ignore each other (cliff levels). */
const VERTICAL_OVERLAP_GATE = 1.6;

/**
 * Pairwise separation: overlapping bodies push each other apart along the
 * line between centers, split by inverse mass — a golem barely budges while
 * a wisp gets shoved.
 */
export function resolveBodyCollisions(bodies: readonly CollisionBody[]) {
  for (let firstIndex = 0; firstIndex < bodies.length; firstIndex++) {
    for (let secondIndex = firstIndex + 1; secondIndex < bodies.length; secondIndex++) {
      const first = bodies[firstIndex];
      const second = bodies[secondIndex];
      if (Math.abs(first.position.y - second.position.y) > VERTICAL_OVERLAP_GATE) continue;

      const deltaX = second.position.x - first.position.x;
      const deltaZ = second.position.z - first.position.z;
      const distance = Math.hypot(deltaX, deltaZ);
      const combinedRadius = first.radius + second.radius;
      if (distance >= combinedRadius || distance === 0) continue;

      const overlap = combinedRadius - distance;
      const directionX = deltaX / distance;
      const directionZ = deltaZ / distance;
      const totalMass = first.mass + second.mass;
      const firstShare = second.mass / totalMass;
      const secondShare = first.mass / totalMass;

      first.position.x -= directionX * overlap * firstShare;
      first.position.z -= directionZ * overlap * firstShare;
      second.position.x += directionX * overlap * secondShare;
      second.position.z += directionZ * overlap * secondShare;
    }
  }
}

/** Pushes a body out of every solid obstacle it overlaps (trees, rocks, walls). */
export function resolveObstacleCollisions(
  body: CollisionBody,
  obstacles: readonly ObstacleCircle[]
) {
  for (const obstacle of obstacles) {
    const deltaX = body.position.x - obstacle.x;
    const deltaZ = body.position.z - obstacle.z;
    const distance = Math.hypot(deltaX, deltaZ);
    const combinedRadius = obstacle.radius + body.radius;
    if (distance >= combinedRadius) continue;

    if (distance === 0) {
      body.position.x = obstacle.x + combinedRadius;
      continue;
    }
    const pushOut = combinedRadius / distance;
    body.position.x = obstacle.x + deltaX * pushOut;
    body.position.z = obstacle.z + deltaZ * pushOut;
  }
}
