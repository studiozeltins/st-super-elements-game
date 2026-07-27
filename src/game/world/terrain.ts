import * as THREE from 'three';
import { hashGridPoint } from './rng';
import { WORLD_BOUND } from '../data/constants';
import { roadFactor, roadAcross, footpathFactor } from './roads';
import type { ScorchMapUniforms } from '../systems/createScorchMap';
import type { GroundInfluenceUniforms } from '../systems/createGroundInfluence';
import type { WindUniforms } from '../systems/createWind';
import { patchTerrainShader } from './terrainShader';

const TERRAIN_SEED = 20260703;
const NOISE_FREQUENCY = 0.03;
/**
 * Global vertical squash. 1/9 flattens the whole archipelago to gentle mounds
 * sitting in the sea (see SEA_LEVEL) instead of tall terraced pillars over the
 * void. EVERYTHING reads getTerrainHeight (bridges, platforms, props, grass),
 * so scaling these few source constants moves the entire world down together.
 */
const HEIGHT_SCALE = 1 / 9;
const MAX_HILL_HEIGHT = 10 * HEIGHT_SCALE;
const HEIGHT_OFFSET = -2.5 * HEIGHT_SCALE;
/** Terrace step, squashed with the rest of the relief (was 1.8 pre-squash). */
export const TERRACE_HEIGHT = 1.8 * HEIGHT_SCALE;
const TERRACE_BLEND = 0.75;
const FLAT_CENTER_RADIUS = 24;
const FLAT_BLEND_RADIUS = 40;
const TERRAIN_SIZE = WORLD_BOUND * 2 + 12;
// Finer mesh (was 150) so the coastline triangulation is smooth, not blocky —
// the beach ramp below crosses the waterline over ~6u, and this gives ~4 cells
// across that band instead of ~3. Terrain is a frozen static mesh, so this is a
// one-time vertex-count cost, no per-frame churn.
const TERRAIN_SEGMENTS = 200;
export const VOID_DEPTH = -40;
/**
 * Sea surface height. Sits just below the squashed land (city plaza = 0, island
 * mounds rise to ~1), so water laps the shores and fills every gap out to the
 * void beyond island radius. The sea plane hides the abyss falloff.
 */
export const SEA_LEVEL = -0.8;
// Beach shaping. The outer edge of each island eases down to a shallow SHORE_FLOOR
// (below the waterline) across [radius - SHORE_INNER, radius + SHORE_OUTER] — a
// gentle sand beach that CROSSES the sea level — then plunges to the void across
// the next VOID_FALLOFF units. Gentle + wide = a smooth, non-jagged coast.
// Beach ramp: dry sand starts SHORE_INNER inland, eases down to the shallow shelf
// SHORE_OUTER past the radius, that shelf reaches SHELF_EXTENT out INTO the water
// (a big wadeable sandy flat), then plunges to the void.
const SHORE_INNER = 6;
const SHORE_OUTER = 3;
const SHELF_EXTENT = 9;
const VOID_FALLOFF = 5;
const SHORE_FLOOR = -1.3;
// Cliff coast: everything that is NOT the beach arc drops steeply from the land
// surface straight to the void over this short span — a near-vertical rock wall.
const CLIFF_FALLOFF = 2.5;
// Angular soft edge where the beach arc blends back into cliff (radians).
const BEACH_ANGLE_BLEND = 0.6;

export interface IslandDefinition {
  centerX: number;
  centerZ: number;
  radius: number;
  /** Multiples of TERRACE_HEIGHT so bridges land on clean terrace levels. */
  baseHeight: number;
  hilliness: number;
  /**
   * Compass direction (radians, atan2(dz, dx)) the ONE walk-in beach faces. The
   * rest of the coast is a steep cliff. Outer islands face their beach toward the
   * city so you land off the bridge onto sand.
   */
  beachDir: number;
  /** Half-angle (radians) of the beach arc — how wide that one sandy side is. */
  beachArc: number;
}

/** Beach faces the city center from an outer island (walk off the bridge onto sand). */
function beachTowardCity(centerX: number, centerZ: number): number {
  return Math.atan2(-centerZ, -centerX);
}

/** The archipelago: main city island plus outer islands linked by bridges. */
export const ISLANDS: IslandDefinition[] = [
  // ONLY the main (city) island has a beach — it opens west (−x), toward the open
  // windmill meadow, clear of every bridge. Every OTHER island is cliff all the way
  // around (beachArc 0 = no beach). beachDir on the cliff-only islands is unused.
  { centerX: 0, centerZ: 0, radius: 54, baseHeight: 0 * TERRACE_HEIGHT, hilliness: 1, beachDir: Math.PI, beachArc: 1.05 },
  { centerX: 95, centerZ: 20, radius: 32, baseHeight: 1 * TERRACE_HEIGHT, hilliness: 0.7, beachDir: beachTowardCity(95, 20), beachArc: 0 },
  { centerX: -80, centerZ: -60, radius: 30, baseHeight: 2 * TERRACE_HEIGHT, hilliness: 0.6, beachDir: beachTowardCity(-80, -60), beachArc: 0 },
  { centerX: -20, centerZ: 100, radius: 28, baseHeight: 3 * TERRACE_HEIGHT, hilliness: 0.5, beachDir: beachTowardCity(-20, 100), beachArc: 0 },
  { centerX: 60, centerZ: -85, radius: 30, baseHeight: 1 * TERRACE_HEIGHT, hilliness: 0.8, beachDir: beachTowardCity(60, -85), beachArc: 0 },
];

const GRASS_LOW = new THREE.Color(0x4f9147);
const GRASS_HIGH = new THREE.Color(0x67b35a);
const GRASS_TINT = new THREE.Color(0x58a24f);
const CLIFF_COLOR = new THREE.Color(0x4a5568);
// Warm dry beach sand; darkened for the wet band below the waterline.
const SAND_COLOR = new THREE.Color(0xdcc68f);
// How far the sand reaches inland from, and seaward over the shelf past, a shoreline.
const SAND_INLAND = 6;
const SAND_SEAWARD = 10;

/**
 * Sand strength (0..1) at a point — ONLY on a beach arc, in a band straddling
 * that shoreline (dry sand inland + a wider wet sand shelf out into the water).
 * Keyed on the beach arc + shore proximity, so flat inland ground (also near
 * y=0) and the rocky cliff coasts stay grass/rock.
 */
export function beachSandFactor(x: number, z: number): number {
  let best = 0;
  for (const island of ISLANDS) {
    if (island.beachArc <= 0) continue; // cliff-only island: no sand
    const dx = x - island.centerX;
    const dz = z - island.centerZ;
    const signed = Math.hypot(dx, dz) - island.radius; // + seaward, − inland
    const band =
      signed >= 0
        ? 1 - smoothstep(SAND_SEAWARD, SAND_SEAWARD + 3, signed)
        : 1 - smoothstep(SAND_INLAND, SAND_INLAND + 3, -signed);
    if (band <= 0) continue;
    const bearing = Math.atan2(dz, dx);
    const arc =
      1 - smoothstep(island.beachArc, island.beachArc + BEACH_ANGLE_BLEND, angleBetween(bearing, island.beachDir));
    best = Math.max(best, band * arc);
  }
  return best;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Smallest angle between two headings, 0..PI. */
function angleBetween(a: number, b: number): number {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
}

function valueNoise(x: number, z: number, seed: number): number {
  const gridX = Math.floor(x);
  const gridZ = Math.floor(z);
  const fractionX = smoothstep(0, 1, x - gridX);
  const fractionZ = smoothstep(0, 1, z - gridZ);
  const corner00 = hashGridPoint(gridX, gridZ, seed);
  const corner10 = hashGridPoint(gridX + 1, gridZ, seed);
  const corner01 = hashGridPoint(gridX, gridZ + 1, seed);
  const corner11 = hashGridPoint(gridX + 1, gridZ + 1, seed);
  const north = corner00 + (corner10 - corner00) * fractionX;
  const south = corner01 + (corner11 - corner01) * fractionX;
  return north + (south - north) * fractionZ;
}

function fractalNoise(x: number, z: number): number {
  return (
    valueNoise(x, z, TERRAIN_SEED) * 0.55 +
    valueNoise(x * 2, z * 2, TERRAIN_SEED ^ 0x9e3779b9) * 0.3 +
    valueNoise(x * 4, z * 4, TERRAIN_SEED ^ 0x85ebca6b) * 0.15
  );
}

function applyTerracing(height: number): number {
  const terraceBase = Math.floor(height / TERRACE_HEIGHT) * TERRACE_HEIGHT;
  const fraction = (height - terraceBase) / TERRACE_HEIGHT;
  const terracedHeight = terraceBase + smoothstep(0.6, 0.95, fraction) * TERRACE_HEIGHT;
  return height + (terracedHeight - height) * TERRACE_BLEND;
}

/**
 * Solid ground test by island footprint. Height alone cannot be used —
 * flat city terrain sits at exactly 0, which a `height > 0.1` check
 * would misclassify as void.
 */
export function isOnLand(x: number, z: number): boolean {
  return ISLANDS.some(
    island => Math.hypot(x - island.centerX, z - island.centerZ) <= island.radius
  );
}

/** Analytic terrain height — identical on every client, no mesh raycasts. */
export function getTerrainHeight(x: number, z: number): number {
  const noise = fractalNoise(x * NOISE_FREQUENCY, z * NOISE_FREQUENCY);
  const terracedHills = applyTerracing(Math.max(0, noise * MAX_HILL_HEIGHT + HEIGHT_OFFSET));

  let highestSurface = VOID_DEPTH;
  for (const island of ISLANDS) {
    const distanceFromIslandCenter = Math.hypot(x - island.centerX, z - island.centerZ);
    if (distanceFromIslandCenter > island.radius + SHELF_EXTENT + VOID_FALLOFF) continue;

    let hills = terracedHills * island.hilliness;
    const isCityIsland = island === ISLANDS[0];
    if (isCityIsland) {
      hills *= smoothstep(FLAT_CENTER_RADIUS, FLAT_BLEND_RADIUS, Math.hypot(x, z));
    }
    const surface = island.baseHeight + hills;

    // Which coast is this? 1 on the single beach arc, 0 on the cliff coast.
    // beachArc 0 = cliff-only island (no beach anywhere).
    const bearing = Math.atan2(z - island.centerZ, x - island.centerX);
    const beachMask =
      island.beachArc <= 0
        ? 0
        : 1 -
          smoothstep(
            island.beachArc,
            island.beachArc + BEACH_ANGLE_BLEND,
            angleBetween(bearing, island.beachDir)
          );

    // CLIFF profile: land holds to the radius, then a near-vertical drop to void.
    const cliffT = smoothstep(
      island.radius,
      island.radius + CLIFF_FALLOFF,
      distanceFromIslandCenter
    );
    const cliffY = surface + (VOID_DEPTH - surface) * cliffT;

    // BEACH profile: land eases to the shallow shore floor across the ramp
    // (crossing the waterline = walk-in sand), holds that shallow shelf far out
    // INTO the water, then the shelf drops to the void.
    const rampT = smoothstep(
      island.radius - SHORE_INNER,
      island.radius + SHORE_OUTER,
      distanceFromIslandCenter
    );
    const shelfY = surface + (SHORE_FLOOR - surface) * rampT;
    const voidT = smoothstep(
      island.radius + SHELF_EXTENT,
      island.radius + SHELF_EXTENT + VOID_FALLOFF,
      distanceFromIslandCenter
    );
    const beachY = shelfY + (VOID_DEPTH - shelfY) * voidT;

    highestSurface = Math.max(highestSurface, cliffY + (beachY - cliffY) * beachMask);
  }
  return highestSurface;
}

/** Average gradient magnitude — shared by cliff coloring and prop placement. */
export function getTerrainSlope(x: number, z: number, sampleStep = 1): number {
  const heightEast = getTerrainHeight(x + sampleStep, z);
  const heightWest = getTerrainHeight(x - sampleStep, z);
  const heightSouth = getTerrainHeight(x, z + sampleStep);
  const heightNorth = getTerrainHeight(x, z - sampleStep);
  return (
    Math.hypot(heightEast - heightWest, heightSouth - heightNorth) / (2 * sampleStep)
  );
}

const ABYSS_COLOR = new THREE.Color(0x232833);
// Large-scale meadow patches breaking up the "one flat green": sun-dried
// blond-green highs and darker moss lows, blended by low-frequency noise.
const MEADOW_DRY = new THREE.Color(0x84a851);
const MEADOW_MOSS = new THREE.Color(0x3f7d40);
// Packed-dirt road tint — the terrain reads as a worn path where roadFactor > 0.
const ROAD_DIRT = new THREE.Color(0x9a7a4e);
// Trampled-footpath tint — a desaturated worn-grass tone, LIGHTER/greener than
// ROAD_DIRT so footpaths read as trodden-but-not-bare routes, distinct from the
// packed-dirt roads (D-03). Baked into the vertex color only — never the aRoad
// cart-rut fragment path (footpaths have no wheel ruts).
const FOOTPATH_TINT = new THREE.Color(0x7d8a54);

/**
 * Low-frequency meadow mask, 0..1. High values = lush moss patches: the ground
 * tints darker there AND the grass field only grows there, so dense grass
 * clumps sit on visibly lusher soil (Genshin-style meadow patches).
 */
export function meadowLushness(x: number, z: number): number {
  return valueNoise(x * 0.045, z * 0.045, TERRAIN_SEED ^ 0x27d4eb2f);
}

/** Ground color at a world point — shared by the terrain mesh and grass field. */
export function terrainColorAt(x: number, z: number, height: number): THREE.Color {
  if (height < -15) return ABYSS_COLOR.clone();
  if (getTerrainSlope(x, z) > 0.85) return CLIFF_COLOR.clone();
  const tintNoise = valueNoise(x * 0.25, z * 0.25, TERRAIN_SEED ^ 0xc2b2ae35);
  const heightFraction = Math.min(1, height / (MAX_HILL_HEIGHT * 0.7));
  const grassColor = GRASS_LOW.clone().lerp(GRASS_HIGH, heightFraction);
  grassColor.lerp(GRASS_TINT, tintNoise * 0.5);
  const lushness = meadowLushness(x, z);
  grassColor.lerp(MEADOW_DRY, smoothstep(0.6, 0.85, 1 - lushness) * 0.5);
  grassColor.lerp(MEADOW_MOSS, smoothstep(0.55, 0.8, lushness) * 0.45);
  // Beach sand on the beach arcs — a wide dry band inland plus a broad wet shelf
  // out into the water. The wet band below the waterline is darkened (damp sand).
  const sandStrength = beachSandFactor(x, z);
  if (sandStrength > 0) {
    const sand = SAND_COLOR.clone();
    if (height < SEA_LEVEL) sand.multiplyScalar(0.72); // wet sand under the water
    grassColor.lerp(sand, Math.min(0.96, sandStrength));
  }
  // Trampled footpath: a light worn tint baked BEFORE the road blend so the road
  // wins on overlap. Partial by construction (footpathFactor <= FOOTPATH_MAX 0.6),
  // so the ground reads worn-but-not-bare along the traffic graph.
  const foot = footpathFactor(x, z);
  if (foot > 0) grassColor.lerp(FOOTPATH_TINT, foot * 0.5);
  // Worn dirt road on top of the grass — the road mask wins where it is strong.
  const road = roadFactor(x, z);
  if (road > 0) grassColor.lerp(ROAD_DIRT, road * 0.9);
  return grassColor;
}

export function createTerrainMesh(
  scorch: ScorchMapUniforms,
  influence: GroundInfluenceUniforms,
  wind: WindUniforms
): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(
    TERRAIN_SIZE,
    TERRAIN_SIZE,
    TERRAIN_SEGMENTS,
    TERRAIN_SEGMENTS
  );
  geometry.rotateX(-Math.PI / 2);

  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(positions.count * 3);
  // Per-vertex road strength — a varying the shader reads to paint pixel-art dirt
  // clods on the path (masking only; the chunky detail is hashed per-cell below).
  const roadStrength = new Float32Array(positions.count);
  // Signed cross-road offset, so the shader can draw two cart-wheel ruts.
  const roadCross = new Float32Array(positions.count);
  // Per-vertex sand strength — the shader paints pixel-art sand + footprints here.
  const sand = new Float32Array(positions.count);
  for (let vertexIndex = 0; vertexIndex < positions.count; vertexIndex++) {
    const x = positions.getX(vertexIndex);
    const z = positions.getZ(vertexIndex);
    const height = getTerrainHeight(x, z);
    positions.setY(vertexIndex, height);
    const color = terrainColorAt(x, z, height);
    colors[vertexIndex * 3] = color.r;
    colors[vertexIndex * 3 + 1] = color.g;
    colors[vertexIndex * 3 + 2] = color.b;
    roadStrength[vertexIndex] = roadFactor(x, z);
    roadCross[vertexIndex] = roadAcross(x, z);
    sand[vertexIndex] = beachSandFactor(x, z);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aRoad', new THREE.BufferAttribute(roadStrength, 1));
  geometry.setAttribute('aRoadCross', new THREE.BufferAttribute(roadCross, 1));
  geometry.setAttribute('aSand', new THREE.BufferAttribute(sand, 1));
  // No computeVertexNormals: flatShading derives face normals in the shader.

  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  patchTerrainShader(material, scorch, influence, wind);
  const terrainMesh = new THREE.Mesh(geometry, material);
  terrainMesh.receiveShadow = true;
  return terrainMesh;
}
