import { createSeededRandom } from './rng';
import { SAFE_ZONE_RADIUS } from '../data/constants';
import { ISLANDS, getTerrainHeight, getTerrainSlope, isOnLand, terrainColorAt } from './terrain';

/**
 * Deterministic grass blade placement. Pure — no THREE objects — so the
 * scatter rules are unit-testable. Blades are grouped one chunk per island so
 * each island's InstancedMesh can frustum-cull independently.
 */
export interface GrassBladeSpec {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  scale: number;
  color: { r: number; g: number; b: number };
}

const GRASS_SEED = 0x67b35a;
/** Same threshold terrain uses for cliff coloring — grass only where ground is painted grass. */
const MAX_GRASS_SLOPE = 0.85;
/** Keep the stone plaza clear. */
const PLAZA_RADIUS = SAFE_ZONE_RADIUS + 1;
/** Fraction of blades tinted as tiny meadow flowers (replaces the old yellow bed). */
const FLOWER_FRACTION = 0.01;
const FLOWER_COLOR = { r: 1, g: 0.94, b: 0.66 }; // 0xfff0a8

export function generateGrassBlades(totalCount: number): GrassBladeSpec[][] {
  const random = createSeededRandom(GRASS_SEED);
  const areaTotal = ISLANDS.reduce((sum, island) => sum + island.radius * island.radius, 0);

  return ISLANDS.map(island => {
    const islandBudget = Math.round((totalCount * island.radius * island.radius) / areaTotal);
    const blades: GrassBladeSpec[] = [];
    let attempts = 0;
    const maxAttempts = islandBudget * 4;
    while (blades.length < islandBudget && attempts < maxAttempts) {
      attempts += 1;
      // Uniform in the island disc.
      const distance = island.radius * Math.sqrt(random());
      const angle = random() * Math.PI * 2;
      const x = island.centerX + Math.cos(angle) * distance;
      const z = island.centerZ + Math.sin(angle) * distance;
      if (!isOnLand(x, z)) continue;
      if (Math.hypot(x, z) < PLAZA_RADIUS) continue;
      if (getTerrainSlope(x, z) > MAX_GRASS_SLOPE) continue;

      const y = getTerrainHeight(x, z);
      const isFlower = random() < FLOWER_FRACTION;
      const color = isFlower ? { ...FLOWER_COLOR } : bladeColorAt(x, z, y, random);
      blades.push({
        x,
        y,
        z,
        rotationY: random() * Math.PI * 2,
        scale: 0.7 + random() * 0.6,
        color,
      });
    }
    return blades;
  });
}

/** Ground color, slightly lightened with per-blade jitter, so blades sit IN the ground tone. */
function bladeColorAt(
  x: number,
  z: number,
  y: number,
  random: () => number
): { r: number; g: number; b: number } {
  const ground = terrainColorAt(x, z, y);
  const jitter = 1.02 + random() * 0.1;
  return {
    r: Math.min(1, ground.r * jitter),
    g: Math.min(1, ground.g * jitter),
    b: Math.min(1, ground.b * jitter),
  };
}
