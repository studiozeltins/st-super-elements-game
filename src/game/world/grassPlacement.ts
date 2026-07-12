import { createSeededRandom } from './rng';
import { SAFE_ZONE_RADIUS } from '../data/constants';
import {
  ISLANDS,
  getTerrainHeight,
  getTerrainSlope,
  isOnLand,
  meadowLushness,
  terrainColorAt,
} from './terrain';

/**
 * Deterministic grass placement, clustered into lush meadow patches instead of
 * a uniform sprinkle: tuft anchors are accepted only where `meadowLushness` is
 * high (the same mask that darkens the ground there), and each anchor grows a
 * small clump of blades. Dense-where-it-grows, bare in between — the
 * Genshin/Ghost-of-Tsushima meadow read. Pure — no THREE — unit-testable.
 * Blades are grouped one chunk per island for per-island frustum culling.
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
/** Blades per tuft anchor; clumping is what makes patches read as lush. */
const BLADES_PER_TUFT = 3;
const TUFT_SPREAD = 0.55;
/** Lushness below this grows nothing; acceptance ramps up above it. */
const LUSHNESS_FLOOR = 0.45;
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
    const maxAttempts = islandBudget * 10;
    while (blades.length < islandBudget && attempts < maxAttempts) {
      attempts += 1;
      // Uniform in the island disc.
      const distance = island.radius * Math.sqrt(random());
      const angle = random() * Math.PI * 2;
      const anchorX = island.centerX + Math.cos(angle) * distance;
      const anchorZ = island.centerZ + Math.sin(angle) * distance;
      // Meadow mask: dense acceptance in lush patches, none outside them.
      const lushness = meadowLushness(anchorX, anchorZ);
      if (lushness < LUSHNESS_FLOOR + random() * 0.3) continue;

      for (let blade = 0; blade < BLADES_PER_TUFT && blades.length < islandBudget; blade += 1) {
        const x = anchorX + (random() - 0.5) * TUFT_SPREAD;
        const z = anchorZ + (random() - 0.5) * TUFT_SPREAD;
        if (!isOnLand(x, z)) continue;
        if (Math.hypot(x, z) < PLAZA_RADIUS) continue;
        if (getTerrainSlope(x, z) > MAX_GRASS_SLOPE) continue;
        const y = getTerrainHeight(x, z);
        const isFlower = random() < FLOWER_FRACTION;
        blades.push({
          x,
          y,
          z,
          rotationY: random() * Math.PI * 2,
          scale: 0.8 + random() * 0.6,
          color: isFlower ? { ...FLOWER_COLOR } : bladeColorAt(x, z, y, random),
        });
      }
    }
    return blades;
  });
}

/** Ground color, lightened with per-blade jitter — patch blades pop against the moss. */
function bladeColorAt(
  x: number,
  z: number,
  y: number,
  random: () => number
): { r: number; g: number; b: number } {
  const ground = terrainColorAt(x, z, y);
  const jitter = 1.08 + random() * 0.14;
  return {
    r: Math.min(1, ground.r * jitter),
    g: Math.min(1, ground.g * jitter),
    b: Math.min(1, ground.b * jitter),
  };
}
