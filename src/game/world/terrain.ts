import * as THREE from 'three';
import { hashGridPoint } from './rng';
import { WORLD_BOUND } from '../data/constants';
import { roadFactor, roadAcross, footpathFactor } from './roads';
import type { ScorchMapUniforms } from '../systems/createScorchMap';

const TERRAIN_SEED = 20260703;
const NOISE_FREQUENCY = 0.03;
const MAX_HILL_HEIGHT = 10;
const HEIGHT_OFFSET = -2.5;
/** One terrace is jumpable (jump apex ≈ 2.4) but not walkable (max step 0.9). */
export const TERRACE_HEIGHT = 1.8;
const TERRACE_BLEND = 0.75;
const FLAT_CENTER_RADIUS = 24;
const FLAT_BLEND_RADIUS = 40;
const TERRAIN_SIZE = WORLD_BOUND * 2 + 12;
const TERRAIN_SEGMENTS = 150;
const EDGE_FALLOFF_WIDTH = 6;
export const VOID_DEPTH = -40;

export interface IslandDefinition {
  centerX: number;
  centerZ: number;
  radius: number;
  /** Multiples of TERRACE_HEIGHT so bridges land on clean terrace levels. */
  baseHeight: number;
  hilliness: number;
}

/** The archipelago: main city island plus outer islands linked by bridges. */
export const ISLANDS: IslandDefinition[] = [
  { centerX: 0, centerZ: 0, radius: 46, baseHeight: 0, hilliness: 1 },
  { centerX: 95, centerZ: 20, radius: 26, baseHeight: 1.8, hilliness: 0.7 },
  { centerX: -80, centerZ: -60, radius: 24, baseHeight: 3.6, hilliness: 0.6 },
  { centerX: -20, centerZ: 100, radius: 22, baseHeight: 5.4, hilliness: 0.5 },
  { centerX: 60, centerZ: -85, radius: 24, baseHeight: 1.8, hilliness: 0.8 },
];

const GRASS_LOW = new THREE.Color(0x4f9147);
const GRASS_HIGH = new THREE.Color(0x67b35a);
const GRASS_TINT = new THREE.Color(0x58a24f);
const CLIFF_COLOR = new THREE.Color(0x4a5568);

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
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
    if (distanceFromIslandCenter > island.radius + EDGE_FALLOFF_WIDTH) continue;

    let hills = terracedHills * island.hilliness;
    const isCityIsland = island === ISLANDS[0];
    if (isCityIsland) {
      hills *= smoothstep(FLAT_CENTER_RADIUS, FLAT_BLEND_RADIUS, Math.hypot(x, z));
    }
    const surface = island.baseHeight + hills;
    const edgeFactor = smoothstep(
      island.radius,
      island.radius + EDGE_FALLOFF_WIDTH,
      distanceFromIslandCenter
    );
    highestSurface = Math.max(highestSurface, surface + (VOID_DEPTH - surface) * edgeFactor);
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

/**
 * Patches the terrain material to read the SCORCH map (strike impacts only —
 * walking never writes it, so footpaths stay green). The fragment stage
 * samples per world-space CELL so the patch is built from visible square
 * pixels: 5 brown shades = 5 stacked strikes, hash-jittered thresholds tear
 * the band edges so overlapping craters merge raggedly instead of as clean
 * circles. Vertices press DOWN in matching steps (a real dent), and the map
 * decays on the regrow clock, so the ground heals by itself.
 */
const SCORCH_CELLS_PER_UNIT = 3.0;
/** Pixel grass-clod size — chunky world cells so the meadow reads as pixels. */
const GRASS_CELLS_PER_UNIT = 2.2;
/** Pixel-dirt clod size on the road — a touch chunkier than the scorch clods. */
const ROAD_CELLS_PER_UNIT = 2.4;
/** Band k needs scorch > 0.07 + k*0.2 — one SCORCH_PER_STRIKE per band. */
const SCORCH_BAND_GLSL = /* glsl */ `
  float scorchBand(float scorch) {
    return scorch < 0.07 ? -1.0 : min(4.0, floor((scorch - 0.07) * 5.0));
  }
`;

function patchTerrainWithScorch(
  material: THREE.MeshLambertMaterial,
  scorch: ScorchMapUniforms
) {
  material.onBeforeCompile = shader => {
    shader.uniforms.uScorchMap = scorch.textureUniform;
    shader.uniforms.uScorchBounds = scorch.boundsUniform;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform sampler2D uScorchMap;
        uniform vec4 uScorchBounds;
        varying vec2 vScorchWorld;
        attribute float aRoad;
        attribute float aRoadCross;
        varying float vRoad;
        varying float vRoadCross;
        ${SCORCH_BAND_GLSL}
        `
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        vec3 transformed = vec3(position);
        // Geometry is baked into world XZ (plane rotated, terrain at origin).
        vScorchWorld = position.xz;
        vRoad = aRoad;
        vRoadCross = aRoadCross;
        vec2 scorchUv = (position.xz - uScorchBounds.xy) * uScorchBounds.zw;
        float dentBand = scorchBand(texture2D(uScorchMap, scorchUv).r);
        transformed.y -= (dentBand + 1.0) * 0.05; // stepped dent, deeper per stack
        `
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform sampler2D uScorchMap;
        uniform vec4 uScorchBounds;
        varying vec2 vScorchWorld;
        varying float vRoad;
        varying float vRoadCross;
        ${SCORCH_BAND_GLSL}
        float scorchHash(vec2 cell, vec2 basis) {
          return fract(sin(dot(cell, basis)) * 43758.5453);
        }
        // Smooth value noise + fbm — gives the grass STRUCTURE (soft clumps and
        // bare patches) instead of per-cell random blocks.
        float tNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = scorchHash(i, vec2(127.1, 311.7));
          float b = scorchHash(i + vec2(1.0, 0.0), vec2(127.1, 311.7));
          float c = scorchHash(i + vec2(0.0, 1.0), vec2(127.1, 311.7));
          float d = scorchHash(i + vec2(1.0, 1.0), vec2(127.1, 311.7));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        float tFbm(vec2 p) {
          return tNoise(p) * 0.6 + tNoise(p * 2.1 + 5.0) * 0.3 + tNoise(p * 4.3 + 9.0) * 0.1;
        }
        `
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        {
          // STRUCTURED pixel-art grass: sample smooth fbm at the pixel-CELL centre,
          // so the ground reads as soft clumps of lush and dry grass with occasional
          // worn bare-dirt patches (a lived-in meadow), still snapped to chunky
          // pixels. Only tints actual grass — grey cliffs/abyss pass through.
          vec2 gp = floor(vScorchWorld * ${GRASS_CELLS_PER_UNIT.toFixed(1)}) / ${GRASS_CELLS_PER_UNIT.toFixed(1)};
          float isGrass = step(diffuseColor.r + 0.015, diffuseColor.g)
            * step(diffuseColor.b, diffuseColor.g);
          float clump = tFbm(gp * 0.14);           // big lush/dry clumps
          float fine = tNoise(gp * 0.75 + 3.0);    // medium break-up
          float tone = clamp(clump * 0.72 + fine * 0.28, 0.0, 1.0);
          vec3 lush = diffuseColor.rgb * vec3(0.84, 1.10, 0.78);
          vec3 dry = diffuseColor.rgb * vec3(1.10, 1.00, 0.74);
          vec3 grass = mix(dry, lush, smoothstep(0.34, 0.72, tone)) * (0.9 + fine * 0.18);
          float bare = tFbm(gp * 0.1 + 17.0);      // worn dirt patches, "a path was trodden"
          grass = mix(grass, vec3(0.44, 0.35, 0.23), smoothstep(0.76, 0.9, bare) * 0.6);
          diffuseColor.rgb = mix(diffuseColor.rgb, grass, isGrass);
        }
        // Pixel-art PACKED-DIRT ROAD: per world-space cell, pick one of a few brown
        // clod shades + speckle so the path reads as chunky pixel dirt (matching the
        // scorch clods), not the smooth per-vertex gradient. Applied FIRST so scorch
        // craters below still win on top of it.
        if (vRoad > 0.02) {
          vec2 rcell = floor(vScorchWorld * ${ROAD_CELLS_PER_UNIT.toFixed(1)});
          float rh = scorchHash(rcell, vec2(53.7, 21.3));
          vec3 rd = rh < 0.38 ? vec3(0.63, 0.49, 0.31)
            : rh < 0.72 ? vec3(0.55, 0.42, 0.26)
            : vec3(0.46, 0.34, 0.20);
          rd *= 0.86 + scorchHash(rcell, vec2(11.2, 91.5)) * 0.28;   // per-clod brightness
          if (scorchHash(rcell + 3.0, vec2(7.1, 88.2)) < 0.13) rd *= 0.68; // dark gravel specks
          // CART-WHEEL RUTS: two grooves at ±gauge across the road (from the signed
          // cross-road coord). Dark packed-earth trough with a lit lip = fake depth,
          // and a faint worn centre strip where the cart belly dragged.
          float ar = abs(vRoadCross);
          float rutDist = abs(ar - 0.85);                          // 0 at a rut centreline
          float trough = 1.0 - smoothstep(0.0, 0.24, rutDist);     // inside the groove
          float lip = smoothstep(0.24, 0.32, rutDist) * (1.0 - smoothstep(0.32, 0.46, rutDist));
          rd *= 1.0 - trough * 0.4;                                // darker packed trough
          rd += lip * 0.05;                                        // sunlit lip on the ridge
          rd *= 1.0 - (1.0 - smoothstep(0.0, 0.5, ar)) * 0.12;     // worn centre drag strip
          diffuseColor.rgb = mix(diffuseColor.rgb, rd, vRoad);
        }
        {
          // One sample per world-space cell = square pixel-art dirt clods.
          vec2 cell = floor(vScorchWorld * ${SCORCH_CELLS_PER_UNIT.toFixed(1)});
          vec2 cellUv = ((cell + 0.5) / ${SCORCH_CELLS_PER_UNIT.toFixed(1)}
            - uScorchBounds.xy) * uScorchBounds.zw;
          float scorch = texture2D(uScorchMap, cellUv).r
            + (scorchHash(cell, vec2(127.1, 311.7)) - 0.5) * 0.13;
          float band = scorchBand(scorch);
          if (band >= 0.0) {
            vec3 shade = band < 0.5 ? vec3(0.52, 0.40, 0.24)
              : band < 1.5 ? vec3(0.44, 0.32, 0.18)
              : band < 2.5 ? vec3(0.35, 0.25, 0.14)
              : band < 3.5 ? vec3(0.27, 0.18, 0.10)
              : vec3(0.19, 0.12, 0.07);
            // Per-cell brightness speckle: dirt texture, still flat per pixel.
            diffuseColor.rgb = shade * (0.9 + scorchHash(cell, vec2(269.5, 183.3)) * 0.2);
          }
        }
        `
      );
  };
  material.customProgramCacheKey = () => 'terrainScorch';
}

export function createTerrainMesh(scorch: ScorchMapUniforms | null): THREE.Mesh {
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
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aRoad', new THREE.BufferAttribute(roadStrength, 1));
  geometry.setAttribute('aRoadCross', new THREE.BufferAttribute(roadCross, 1));
  // No computeVertexNormals: flatShading derives face normals in the shader.

  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  if (scorch) patchTerrainWithScorch(material, scorch);
  const terrainMesh = new THREE.Mesh(geometry, material);
  terrainMesh.receiveShadow = true;
  return terrainMesh;
}
