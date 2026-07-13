import type { ObstacleCircle } from './resolveCollisions';

/** Obstacles without an explicit height are solid this far up from their base. */
const DEFAULT_OBSTACLE_HEIGHT = 3;
/** Raymarch step for the hitscan clamp — half a body radius, cheap and tight enough. */
const RAY_STEP = 0.5;

/** True when a point sits inside any solid obstacle's cylinder (base → top). */
export function pointHitsObstacle(
  x: number,
  y: number,
  z: number,
  obstacles: readonly ObstacleCircle[]
): boolean {
  for (const obstacle of obstacles) {
    if (y < obstacle.y) continue;
    if (y > obstacle.y + (obstacle.height ?? DEFAULT_OBSTACLE_HEIGHT)) continue;
    const deltaX = x - obstacle.x;
    const deltaZ = z - obstacle.z;
    if (deltaX * deltaX + deltaZ * deltaZ <= obstacle.radius * obstacle.radius) return true;
  }
  return false;
}

/** True when a point is underground or inside an obstacle — a projectile dies here. */
export function pointHitsWorld(
  x: number,
  y: number,
  z: number,
  obstacles: readonly ObstacleCircle[],
  terrainHeightAt: (x: number, z: number) => number
): boolean {
  return y <= terrainHeightAt(x, z) || pointHitsObstacle(x, y, z, obstacles);
}

/**
 * Marches a flat ray (fixed y) and returns the distance to the first terrain
 * rise or obstacle, or maxRange when the path is clear. Used to clamp the
 * server hitscan so a bow shot cannot damage through a hill or a rock.
 */
export function clampRangeToWorld(
  originX: number,
  y: number,
  originZ: number,
  directionX: number,
  directionZ: number,
  maxRange: number,
  obstacles: readonly ObstacleCircle[],
  terrainHeightAt: (x: number, z: number) => number
): number {
  const length = Math.hypot(directionX, directionZ);
  if (length === 0 || maxRange <= 0) return 0;
  const stepX = (directionX / length) * RAY_STEP;
  const stepZ = (directionZ / length) * RAY_STEP;
  let x = originX;
  let z = originZ;
  for (let traveled = RAY_STEP; traveled <= maxRange; traveled += RAY_STEP) {
    x += stepX;
    z += stepZ;
    if (pointHitsWorld(x, y, z, obstacles, terrainHeightAt)) return traveled;
  }
  return maxRange;
}
