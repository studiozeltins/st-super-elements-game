import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createFireflies, FIREFLY_POOL_SIZE } from '../createFireflies';
import { SPAWN, PULSE } from '../wildlifeMath';

// Headless THREE testing (no WebGL) — mirrors createButterflies.test.ts. We assert
// on the pooled InstancedMesh added to the scene: live fireflies decompose to a
// non-zero scale; recycled/empty slots are the zero matrix (scale 0). The pulse
// math itself is proven in wildlifeMath.test.ts; here we prove the factory's pool +
// dusk/night gate + instanceColor pulse wiring, and the CRITICAL unlit-material delta.

/** The single firefly InstancedMesh the factory parents to the scene root. */
function findMesh(scene: THREE.Scene): THREE.InstancedMesh {
  const mesh = scene.children.find(
    (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh
  );
  if (!mesh) throw new Error('firefly InstancedMesh not found on scene');
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

/** Index of the first live firefly slot, or -1 if the pool is empty. */
function firstLive(mesh: THREE.InstancedMesh): number {
  const m = new THREE.Matrix4();
  for (let i = 0; i < mesh.count; i += 1) {
    mesh.getMatrixAt(i, m);
    const magnitude = UPPER_3X3.reduce((sum, e) => sum + Math.abs(m.elements[e]), 0);
    if (magnitude > 1e-6) return i;
  }
  return -1;
}

/** World-space translation of every live firefly slot. */
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
const NIGHT = 0.82; // fireflyLevel 1 → full swarm
const DAY = 0.5; // fireflyLevel 0 → empty (clean day no-op)
const DUSK_PARTIAL = 0.58; // between day(0.5,0) and dusk(0.66,1): smoothstep → level ~0.5
// A wide all-grass expanse (probed via surfaceAt): the whole SPAWN ring is grass.
const GRASS_X = 200;
const GRASS_Z = 200;

/** Drive the pool for `seconds` at `phase` over grass so the top-up recheck fires. */
function run(
  f: ReturnType<typeof createFireflies>,
  px: number,
  pz: number,
  seconds = 20,
  phase = NIGHT
): number {
  let t = 0;
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.5) {
    t += 0.5;
    f.update(0.5, camera, px, pz, phase, t);
  }
  return t;
}

describe('createFireflies', () => {
  it('parents ONE unlit InstancedMesh to the scene root with pool flags', () => {
    const scene = new THREE.Scene();
    const f = createFireflies(scene, flatGround);

    const meshes = scene.children.filter((c) => c instanceof THREE.InstancedMesh);
    expect(meshes.length).toBe(1); // exactly one draw call
    const mesh = findMesh(scene);
    expect(mesh.count).toBe(FIREFLY_POOL_SIZE);
    // CRITICAL delta: unlit so fireflies stay bright while Phase 9 dims lit materials.
    expect(mesh.material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(mesh.material).not.toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(mesh.frustumCulled).toBe(false);
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(false);
    expect(mesh.instanceColor).toBeTruthy(); // seeded at build (Pitfall 6)
    expect(FIREFLY_POOL_SIZE).toBeGreaterThan(0);
    expect(FIREFLY_POOL_SIZE).toBeLessThanOrEqual(64);

    f.dispose();
  });

  it('adds NO scene light of any kind — the combat lightPool is untouched', () => {
    const scene = new THREE.Scene();
    const f = createFireflies(scene, flatGround);
    run(f, GRASS_X, GRASS_Z);
    const lights = scene.children.filter((c) => (c as THREE.Object3D).type?.includes('Light'));
    expect(lights.length).toBe(0);
    f.dispose();
  });

  it('is self-managing — exposes no public spawn()', () => {
    const scene = new THREE.Scene();
    const f = createFireflies(scene, flatGround);
    expect((f as unknown as { spawn?: unknown }).spawn).toBeUndefined();
    f.dispose();
  });

  it('spawns fireflies over grass at dusk/night', () => {
    const scene = new THREE.Scene();
    const f = createFireflies(scene, flatGround);
    const mesh = findMesh(scene);

    expect(countLive(mesh)).toBe(0); // nothing before the first update
    run(f, GRASS_X, GRASS_Z);

    expect(countLive(mesh)).toBeGreaterThan(0);
    expect(countLive(mesh)).toBeLessThanOrEqual(FIREFLY_POOL_SIZE);
    f.dispose();
  });

  it('hard-caps live fireflies at FIREFLY_POOL_SIZE — the pool never grows', () => {
    const scene = new THREE.Scene();
    const f = createFireflies(scene, flatGround);
    const mesh = findMesh(scene);

    run(f, GRASS_X, GRASS_Z, 120); // long night — far past the top-up target
    expect(countLive(mesh)).toBeLessThanOrEqual(FIREFLY_POOL_SIZE);
    expect(mesh.count).toBe(FIREFLY_POOL_SIZE);
    f.dispose();
  });

  it('spawns none in full day — a clean day no-op', () => {
    const scene = new THREE.Scene();
    const f = createFireflies(scene, flatGround);
    const mesh = findMesh(scene);

    run(f, GRASS_X, GRASS_Z, 20, DAY);
    expect(countLive(mesh)).toBe(0);
    f.dispose();
  });

  it('empties the pool when night turns to day', () => {
    const scene = new THREE.Scene();
    const f = createFireflies(scene, flatGround);
    const mesh = findMesh(scene);

    run(f, GRASS_X, GRASS_Z); // fill at night
    expect(countLive(mesh)).toBeGreaterThan(0);
    run(f, GRASS_X, GRASS_Z, 10, DAY); // dawn breaks
    expect(countLive(mesh)).toBe(0);
    f.dispose();
  });

  it('fades in fewer fireflies at partial dusk than at full night (level-scaled count)', () => {
    const nightScene = new THREE.Scene();
    const nightF = createFireflies(nightScene, flatGround);
    run(nightF, GRASS_X, GRASS_Z, 120, NIGHT);
    const fullLive = countLive(findMesh(nightScene));

    const duskScene = new THREE.Scene();
    const duskF = createFireflies(duskScene, flatGround);
    run(duskF, GRASS_X, GRASS_Z, 120, DUSK_PARTIAL);
    const partialLive = countLive(findMesh(duskScene));

    expect(partialLive).toBeGreaterThan(0);
    expect(partialLive).toBeLessThan(fullLive);
    nightF.dispose();
    duskF.dispose();
  });

  it('pulses per-firefly brightness via instanceColor over time', () => {
    const scene = new THREE.Scene();
    const f = createFireflies(scene, flatGround);
    const mesh = findMesh(scene);

    run(f, GRASS_X, GRASS_Z, 5); // spawn a swarm
    const idx = firstLive(mesh);
    expect(idx).toBeGreaterThanOrEqual(0);

    // Sample this slot's brightness across a full pulse period (2π/rate ≈ 3.9s).
    const col = new THREE.Color();
    let min = Infinity;
    let max = -Infinity;
    let t = 100;
    for (let i = 0; i < 40; i += 1) {
      t += 0.1;
      f.update(0.1, camera, GRASS_X, GRASS_Z, NIGHT, t);
      mesh.getColorAt(idx, col);
      const brightness = Math.max(col.r, col.g, col.b);
      min = Math.min(min, brightness);
      max = Math.max(max, brightness);
    }
    // Shimmer: brightness must vary (floored, never fully dark; never above base hue).
    expect(max - min).toBeGreaterThan(0.1);
    expect(min).toBeGreaterThan(0); // PULSE.floor keeps it readable
    expect(PULSE.floor).toBeGreaterThan(0);
    f.dispose();
  });

  it('culls fireflies past the cull radius and re-anchors around the moved player', () => {
    const scene = new THREE.Scene();
    const f = createFireflies(scene, flatGround);
    const mesh = findMesh(scene);

    run(f, GRASS_X, GRASS_Z); // anchor a swarm near (200,200)
    expect(countLive(mesh)).toBeGreaterThan(0);

    // Teleport far (>> SPAWN.cull) onto another grass expanse; old anchors must cull.
    run(f, 400, 400);
    for (const p of livePositions(mesh)) {
      const dx = p.x - 400;
      const dz = p.z - 400;
      expect(Math.hypot(dx, dz)).toBeLessThanOrEqual(SPAWN.cull);
    }
    f.dispose();
  });

  it('removes the mesh from the scene on dispose without throwing', () => {
    const scene = new THREE.Scene();
    const f = createFireflies(scene, flatGround);
    const mesh = findMesh(scene);
    expect(scene.children).toContain(mesh);

    expect(() => f.dispose()).not.toThrow();
    expect(scene.children).not.toContain(mesh);
  });
});
