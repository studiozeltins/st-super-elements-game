import * as THREE from 'three';
import { hashGridPoint } from './rng';
import { WORLD_BOUND } from '../data/constants';

const TERRAIN_SEED = 20260703;
const NOISE_FREQUENCY = 0.03;
const MAX_HILL_HEIGHT = 10;
const HEIGHT_OFFSET = -2.5;
/** One terrace is jumpable (jump apex ≈ 2.0) but not walkable (max step 0.9). */
export const TERRACE_HEIGHT = 1.8;
const TERRACE_BLEND = 0.75;
const FLAT_CENTER_RADIUS = 24;
const FLAT_BLEND_RADIUS = 40;
const TERRAIN_SIZE = WORLD_BOUND * 2.2;
const TERRAIN_SEGMENTS = 128;
/** Beyond this radius the island plunges into the void — walk off and you fall. */
export const ISLAND_RADIUS = WORLD_BOUND + 2;
const EDGE_FALLOFF_WIDTH = 5;
export const VOID_DEPTH = -40;

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

/** Analytic terrain height — identical on every client, no mesh raycasts. */
export function getTerrainHeight(x: number, z: number): number {
  const distanceFromCenter = Math.hypot(x, z);
  const noise = fractalNoise(x * NOISE_FREQUENCY, z * NOISE_FREQUENCY);
  const rawHeight = Math.max(0, noise * MAX_HILL_HEIGHT + HEIGHT_OFFSET);
  const terracedHeight = applyTerracing(rawHeight);
  const flattenFactor = smoothstep(FLAT_CENTER_RADIUS, FLAT_BLEND_RADIUS, distanceFromCenter);
  const islandHeight = terracedHeight * flattenFactor;
  const edgeFactor = smoothstep(
    ISLAND_RADIUS,
    ISLAND_RADIUS + EDGE_FALLOFF_WIDTH,
    distanceFromCenter
  );
  return islandHeight + (VOID_DEPTH - islandHeight) * edgeFactor;
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

function vertexColorAt(x: number, z: number, height: number): THREE.Color {
  if (getTerrainSlope(x, z) > 0.85) return CLIFF_COLOR.clone();
  const tintNoise = valueNoise(x * 0.25, z * 0.25, TERRAIN_SEED ^ 0xc2b2ae35);
  const heightFraction = Math.min(1, height / (MAX_HILL_HEIGHT * 0.7));
  const grassColor = GRASS_LOW.clone().lerp(GRASS_HIGH, heightFraction);
  return grassColor.lerp(GRASS_TINT, tintNoise * 0.5);
}

export function createTerrainMesh(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(
    TERRAIN_SIZE,
    TERRAIN_SIZE,
    TERRAIN_SEGMENTS,
    TERRAIN_SEGMENTS
  );
  geometry.rotateX(-Math.PI / 2);

  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(positions.count * 3);
  for (let vertexIndex = 0; vertexIndex < positions.count; vertexIndex++) {
    const x = positions.getX(vertexIndex);
    const z = positions.getZ(vertexIndex);
    const height = getTerrainHeight(x, z);
    positions.setY(vertexIndex, height);
    const color = vertexColorAt(x, z, height);
    colors[vertexIndex * 3] = color.r;
    colors[vertexIndex * 3 + 1] = color.g;
    colors[vertexIndex * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // No computeVertexNormals: flatShading derives face normals in the shader.

  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const terrainMesh = new THREE.Mesh(geometry, material);
  terrainMesh.receiveShadow = true;
  return terrainMesh;
}
