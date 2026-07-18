import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createBirdFlush, BIRD_POOL_SIZE } from '../createBirdFlush';
import { BIRD } from '../wildlifeMath';

// Headless THREE testing (no WebGL) — mirrors createDustPuffs.test.ts /
// createButterflies.test.ts. We assert on the pooled InstancedMesh added to the
// scene root: live birds decompose to a non-zero scale; recycled/empty slots are
// the zero matrix (scale 0). The arc math itself is proven in wildlifeMath.test.ts;
// here we prove the factory's pool + externally-spawned burst + recycle wiring.

/** The single bird InstancedMesh the factory parents to the scene root. */
function findMesh(scene: THREE.Scene): THREE.InstancedMesh {
  const mesh = scene.children.find(
    (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh
  );
  if (!mesh) throw new Error('bird InstancedMesh not found on scene');
  return mesh;
}

// Inactive slots are makeScale(0,0,0) — a matrix whose entire upper 3x3 block is
// zero. (THREE's Matrix4.decompose returns scale 1 for a zero matrix, so read the
// block directly.)
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

const flatGround = () => 0;
const camera = new THREE.PerspectiveCamera();

describe('createBirdFlush', () => {
  it('parents a billboarded, lit InstancedMesh to the scene root with pool flags', () => {
    const scene = new THREE.Scene();
    const birds = createBirdFlush(scene, flatGround);

    const mesh = findMesh(scene);
    expect(mesh.count).toBe(BIRD_POOL_SIZE);
    expect(mesh.geometry).toBeInstanceOf(THREE.BufferGeometry);
    expect(mesh.geometry.getAttribute('aWing')).toBeDefined(); // winged geometry, not a flat quad
    expect(mesh.material).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(mesh.frustumCulled).toBe(false);
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(false);
    // A handful of flushes in flight, never wallpaper.
    expect(BIRD_POOL_SIZE).toBeGreaterThan(0);
    expect(BIRD_POOL_SIZE).toBeLessThanOrEqual(24);

    birds.dispose();
  });

  it('bursts 2–4 birds on a single spawn (one flush)', () => {
    const scene = new THREE.Scene();
    const birds = createBirdFlush(scene, flatGround);
    const mesh = findMesh(scene);

    expect(countLive(mesh)).toBe(0); // nothing before a flush
    birds.spawn(5, 5);
    birds.update(0.016, camera); // write matrices for the freshly-claimed pool

    const live = countLive(mesh);
    expect(live).toBeGreaterThanOrEqual(2);
    expect(live).toBeLessThanOrEqual(4);

    birds.dispose();
  });

  it('despawns each bird once its arc life elapses (t01 >= 1) and recycles the slot', () => {
    const scene = new THREE.Scene();
    const birds = createBirdFlush(scene, flatGround);
    const mesh = findMesh(scene);

    birds.spawn(0, 0);
    birds.update(0.016, camera);
    expect(countLive(mesh)).toBeGreaterThan(0);

    // Advance past BIRD.life — every bird ages out and collapses to the zero matrix.
    birds.update(BIRD.life + 0.1, camera);
    expect(countLive(mesh)).toBe(0);
    // Instance count still fixed after recycling — no growth, no shrink.
    expect(mesh.count).toBe(BIRD_POOL_SIZE);

    birds.dispose();
  });

  it('hard-caps live birds at BIRD_POOL_SIZE when over-flushed', () => {
    const scene = new THREE.Scene();
    const birds = createBirdFlush(scene, flatGround);
    const mesh = findMesh(scene);

    // Far more flushes than slots; the slot-claim scan returns early when full.
    for (let i = 0; i < BIRD_POOL_SIZE; i += 1) birds.spawn(i, 0);
    birds.update(0.016, camera);

    expect(countLive(mesh)).toBeLessThanOrEqual(BIRD_POOL_SIZE);
    expect(countLive(mesh)).toBe(BIRD_POOL_SIZE);
    // The pool never grows — instance count is fixed regardless of spawn pressure.
    expect(mesh.count).toBe(BIRD_POOL_SIZE);

    birds.dispose();
  });

  it('reuses recycled slots on later flushes (pooled, not appended)', () => {
    const scene = new THREE.Scene();
    const birds = createBirdFlush(scene, flatGround);
    const mesh = findMesh(scene);

    // Fill, expire, then refill — a growing implementation would exceed the cap.
    for (let i = 0; i < BIRD_POOL_SIZE; i += 1) birds.spawn(i, 0);
    birds.update(0.016, camera);
    birds.update(BIRD.life + 0.1, camera); // expire all
    expect(countLive(mesh)).toBe(0);
    for (let i = 0; i < BIRD_POOL_SIZE; i += 1) birds.spawn(i, 10);
    birds.update(0.016, camera);

    expect(countLive(mesh)).toBeLessThanOrEqual(BIRD_POOL_SIZE);
    expect(mesh.count).toBe(BIRD_POOL_SIZE);

    birds.dispose();
  });

  it('removes the mesh from the scene on dispose without throwing', () => {
    const scene = new THREE.Scene();
    const birds = createBirdFlush(scene, flatGround);
    const mesh = findMesh(scene);
    expect(scene.children).toContain(mesh);

    expect(() => birds.dispose()).not.toThrow();
    expect(scene.children).not.toContain(mesh);
  });
});
