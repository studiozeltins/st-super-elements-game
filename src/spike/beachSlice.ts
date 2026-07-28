/**
 * The REPRESENTATIVE beach slice (SPIKE-01, D-03) — sand + shoreline at real
 * getTerrainHeight, a handful of rocks, and a small grass patch, so the TSL
 * depth-outline pass has genuine depth discontinuities to bite on. A bare plane
 * has none, which would sign off the go/no-go on an incomplete test.
 *
 * Everything here imports only the PURE height/color fns from the game's
 * terrain.ts (read, never mutated) — nothing in src/game imports back, so the
 * "zero game code touched" invariant holds. The custom terrain/rock/grass
 * shaders are Phase-3 concerns; a plain MeshStandardMaterial with vertex colours
 * is enough to give the pixel filter real edges here.
 *
 * Reference frames: the pure sampler (sampleBeachSliceHeights) reports RAW
 * terrain heights so the test can assert they straddle SEA_LEVEL = -0.8. The
 * rendered meshes are shifted UP by -SEA_LEVEL so the terrain's waterline lands
 * at y = 0, where Water Pro renders its ocean plane — i.e. the Water Pro sea
 * plane reference sits at SEA_LEVEL in the terrain's native frame.
 */
import * as THREE from 'three/webgpu';
import { getTerrainHeight, terrainColorAt, SEA_LEVEL, ISLANDS } from '../game/world/terrain';

// The ONLY beach arc is the city island (ISLANDS[0]); its beach opens -x.
const CITY = ISLANDS[0];
const BEACH_X = CITY.centerX + Math.cos(CITY.beachDir) * CITY.radius; // ~ -54
const BEACH_Z = CITY.centerZ + Math.sin(CITY.beachDir) * CITY.radius; // ~ 0
const SLICE_SIZE = 90;
const SLICE_SEG = 96;
/** Shift that maps the terrain's SEA_LEVEL to y=0 (Water Pro's ocean plane). */
const WATERLINE_SHIFT = -SEA_LEVEL;

export interface SliceHeightStats {
  min: number;
  max: number;
  count: number;
}

/**
 * Pure sampler — the unit-testable core of the slice. Samples RAW getTerrainHeight
 * over the beach-arc region on a coarse grid and returns the min/max so a test can
 * assert the field crosses the waterline (SEA_LEVEL). No THREE meshes, no GPU.
 */
export function sampleBeachSliceHeights(seg = 32): SliceHeightStats {
  let min = Infinity;
  let max = -Infinity;
  let count = 0;
  for (let iz = 0; iz <= seg; iz++) {
    for (let ix = 0; ix <= seg; ix++) {
      const worldX = BEACH_X + (ix / seg - 0.5) * SLICE_SIZE;
      const worldZ = BEACH_Z + (iz / seg - 0.5) * SLICE_SIZE;
      const h = getTerrainHeight(worldX, worldZ);
      if (h < min) min = h;
      if (h > max) max = h;
      count++;
    }
  }
  return { min, max, count };
}

/** Small deterministic RNG so rock/grass placement is stable across reloads. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rendered terrain height in the shifted (waterline=0) frame. */
function surfaceY(worldX: number, worldZ: number): number {
  return getTerrainHeight(worldX, worldZ) + WATERLINE_SHIFT;
}

/**
 * The sampled terrain mesh: per-vertex Y from getTerrainHeight (shifted so the
 * waterline is y=0), vertex colours from terrainColorAt (sand/cliff/grass palette).
 */
function buildTerrainMesh(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(SLICE_SIZE, SLICE_SIZE, SLICE_SEG, SLICE_SEG);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    const worldX = positions.getX(i) + BEACH_X;
    const worldZ = positions.getZ(i) + BEACH_Z;
    const height = getTerrainHeight(worldX, worldZ);
    positions.setY(i, height + WATERLINE_SHIFT);
    const color = terrainColorAt(worldX, worldZ, height);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.computeVertexNormals();
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(BEACH_X, 0, BEACH_Z);
  return mesh;
}

/** One faceted low-poly rock (position-hashed displacement → watertight facets). */
function buildRock(random: () => number, radius: number): THREE.Mesh {
  const geometry = new THREE.IcosahedronGeometry(radius, 0); // 20 flat facets
  const seed = new THREE.Vector3(random() * 100, random() * 100, random() * 100);
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const hx = Math.round((v.x + seed.x) * 3);
    const hy = Math.round((v.y + seed.y) * 3);
    const hz = Math.round((v.z + seed.z) * 3);
    const h = (Math.sin(hx * 12.9898 + hy * 78.233 + hz * 37.719) * 43758.5453) % 1;
    const r = 1 + (h - 0.5) * 0.6;
    pos.setXYZ(i, v.x * r * radius, v.y * r * radius, v.z * r * radius);
  }
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: 0x5a6678, flatShading: true });
  return new THREE.Mesh(geometry, material);
}

/**
 * A handful of rocks straddling the shoreline (real depth discontinuities for the
 * outline) and a couple on the dry sand.
 */
function buildRocks(): THREE.Group {
  const group = new THREE.Group();
  const random = mulberry32(0x5eab0c);
  const spots: Array<[number, number, number]> = [
    [BEACH_X + 2, BEACH_Z - 14, 1.4],
    [BEACH_X - 4, BEACH_Z + 6, 1.9],
    [BEACH_X - 9, BEACH_Z - 3, 1.1],
    [BEACH_X + 6, BEACH_Z + 18, 1.6],
    [BEACH_X + 12, BEACH_Z - 8, 1.2],
    [BEACH_X - 1, BEACH_Z + 24, 2.1],
  ];
  for (const [x, z, radius] of spots) {
    const rock = buildRock(random, radius);
    rock.position.set(x, surfaceY(x, z) + radius * 0.35, z);
    rock.rotation.y = random() * Math.PI * 2;
    group.add(rock);
  }
  return group;
}

/**
 * A small grass patch inland (toward the island centre, on the green) — thin
 * blades as one InstancedMesh so it stays a single draw call (perf discipline).
 */
function buildGrassPatch(): THREE.InstancedMesh {
  const BLADES = 48;
  const geometry = new THREE.ConeGeometry(0.12, 1.1, 4);
  geometry.translate(0, 0.55, 0); // pivot at the base
  const material = new THREE.MeshStandardMaterial({ color: 0x4f9147, flatShading: true });
  const mesh = new THREE.InstancedMesh(geometry, material, BLADES);
  const random = mulberry32(0x9ea51);
  const patchX = BEACH_X + 26; // inland on the grass, clear of the shore
  const patchZ = BEACH_Z + 4;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < BLADES; i++) {
    const x = patchX + (random() - 0.5) * 12;
    const z = patchZ + (random() - 0.5) * 12;
    dummy.position.set(x, surfaceY(x, z), z);
    dummy.rotation.y = random() * Math.PI * 2;
    dummy.scale.setScalar(0.7 + random() * 0.6);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/**
 * Assemble the full representative slice: sampled terrain + shoreline rocks +
 * inland grass patch, all in the shifted (waterline = y=0) frame so Water Pro's
 * ocean laps the sand.
 */
export function buildBeachSlice(): THREE.Group {
  const group = new THREE.Group();
  group.add(buildTerrainMesh());
  group.add(buildRocks());
  group.add(buildGrassPatch());
  return group;
}
