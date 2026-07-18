import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createButterflies, BUTTERFLY_POOL_SIZE } from '../createButterflies';
import { SPAWN } from '../wildlifeMath';

// Headless THREE testing (no WebGL) — mirrors createDustPuffs.test.ts. We assert on
// the pooled InstancedMesh added to the scene: live butterflies decompose to a
// non-zero scale; recycled/empty slots are the zero matrix (scale 0). Motion itself
// is proven in wildlifeMath.test.ts; here we prove the factory's pool + gate wiring.

/** The single butterfly InstancedMesh the factory parents to the scene root. */
function findMesh(scene: THREE.Scene): THREE.InstancedMesh {
  const mesh = scene.children.find(
    (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh
  );
  if (!mesh) throw new Error('butterfly InstancedMesh not found on scene');
  return mesh;
}

// Inactive slots are makeScale(0,0,0) — a matrix whose entire upper 3x3 block is
// zero. (Matrix4.decompose returns scale 1 for a zero matrix, so read the block.)
const UPPER_3X3 = [0, 1, 2, 4, 5, 6, 8, 9, 10];

function countLive(mesh: THREE.InstancedMesh): number {
  const m = new THREE.Matrix4();
  let live = 0;
  for (let i = 0; i < mesh.count; i += 1) {
    mesh.getMatrixAt(i, m);
    const magnitude = UPPER_3X3.reduce((sum, e) => sum + Math.abs(m.elements[e]), 0);
    if (magnitude > 1e-6) live += 1;
  }
  return live;
}

/** World-space translation of every live butterfly slot. */
function livePositions(mesh: THREE.InstancedMesh): { x: number; z: number }[] {
  const m = new THREE.Matrix4();
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < mesh.count; i += 1) {
    mesh.getMatrixAt(i, m);
    const magnitude = UPPER_3X3.reduce((sum, e) => sum + Math.abs(m.elements[e]), 0);
    if (magnitude > 1e-6) out.push({ x: m.elements[12], z: m.elements[14] });
  }
  return out;
}

const flatGround = () => 0;
const camera = new THREE.PerspectiveCamera();
const DAY = 0.5; // fireflyLevel ~0 → isDayTime true
const NIGHT = 0.0; // fireflyLevel 1 → isDayTime false
// A wide all-grass expanse (probed via surfaceAt): the whole SPAWN ring is grass.
const GRASS_X = 200;
const GRASS_Z = 200;

/** Drive the pool for `seconds` of daytime over grass so the top-up recheck fires. */
function runDay(
  b: ReturnType<typeof createButterflies>,
  px: number,
  pz: number,
  seconds = 10,
  phase = DAY
): void {
  let t = 0;
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.5) {
    t += 0.5;
    b.update(0.5, camera, px, pz, phase, t);
  }
}

describe('createButterflies', () => {
  it('parents a billboarded, lit InstancedMesh to the scene root with pool flags', () => {
    const scene = new THREE.Scene();
    const b = createButterflies(scene, flatGround);

    const mesh = findMesh(scene);
    expect(mesh.count).toBe(BUTTERFLY_POOL_SIZE);
    expect(mesh.geometry).toBeInstanceOf(THREE.BufferGeometry);
    expect(mesh.geometry.getAttribute('aWing')).toBeDefined(); // winged geometry, not a flat quad
    expect(mesh.material).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(mesh.frustumCulled).toBe(false);
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(false);
    // Sparse: an encounter, not wallpaper.
    expect(BUTTERFLY_POOL_SIZE).toBeGreaterThan(0);
    expect(BUTTERFLY_POOL_SIZE).toBeLessThanOrEqual(16);

    b.dispose();
  });

  it('is self-managing — exposes no public spawn()', () => {
    const scene = new THREE.Scene();
    const b = createButterflies(scene, flatGround);
    expect((b as unknown as { spawn?: unknown }).spawn).toBeUndefined();
    b.dispose();
  });

  it('spawns butterflies over grass during the day', () => {
    const scene = new THREE.Scene();
    const b = createButterflies(scene, flatGround);
    const mesh = findMesh(scene);

    expect(countLive(mesh)).toBe(0); // nothing before the first update
    runDay(b, GRASS_X, GRASS_Z);

    expect(countLive(mesh)).toBeGreaterThan(0);
    expect(countLive(mesh)).toBeLessThanOrEqual(BUTTERFLY_POOL_SIZE);
    b.dispose();
  });

  it('hard-caps live butterflies at BUTTERFLY_POOL_SIZE — the pool never grows', () => {
    const scene = new THREE.Scene();
    const b = createButterflies(scene, flatGround);
    const mesh = findMesh(scene);

    runDay(b, GRASS_X, GRASS_Z, 60); // long day — far past the top-up target
    expect(countLive(mesh)).toBeLessThanOrEqual(BUTTERFLY_POOL_SIZE);
    expect(mesh.count).toBe(BUTTERFLY_POOL_SIZE);
    b.dispose();
  });

  it('spawns none at night — a clean dusk/night no-op', () => {
    const scene = new THREE.Scene();
    const b = createButterflies(scene, flatGround);
    const mesh = findMesh(scene);

    runDay(b, GRASS_X, GRASS_Z, 20, NIGHT);
    expect(countLive(mesh)).toBe(0);
    b.dispose();
  });

  it('empties the pool when day turns to night', () => {
    const scene = new THREE.Scene();
    const b = createButterflies(scene, flatGround);
    const mesh = findMesh(scene);

    runDay(b, GRASS_X, GRASS_Z); // fill by day
    expect(countLive(mesh)).toBeGreaterThan(0);
    runDay(b, GRASS_X, GRASS_Z, 10, NIGHT); // dusk falls
    expect(countLive(mesh)).toBe(0);
    b.dispose();
  });

  it('culls butterflies past the cull radius and re-anchors around the moved player', () => {
    const scene = new THREE.Scene();
    const b = createButterflies(scene, flatGround);
    const mesh = findMesh(scene);

    runDay(b, GRASS_X, GRASS_Z); // anchor a flight near (200,200)
    expect(countLive(mesh)).toBeGreaterThan(0);

    // Teleport far (>> SPAWN.cull) onto another grass expanse; old anchors must cull.
    runDay(b, 400, 400);
    for (const p of livePositions(mesh)) {
      const dx = p.x - 400;
      const dz = p.z - 400;
      expect(Math.hypot(dx, dz)).toBeLessThanOrEqual(SPAWN.cull);
    }
    b.dispose();
  });

  it('removes the mesh from the scene on dispose without throwing', () => {
    const scene = new THREE.Scene();
    const b = createButterflies(scene, flatGround);
    const mesh = findMesh(scene);
    expect(scene.children).toContain(mesh);

    expect(() => b.dispose()).not.toThrow();
    expect(scene.children).not.toContain(mesh);
  });
});
