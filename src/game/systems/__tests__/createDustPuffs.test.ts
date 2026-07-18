import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createDustPuffs, DUST_POOL_SIZE } from '../createDustPuffs';

// Headless THREE testing (no WebGL) — mirrors entityRenderers.test.ts. We assert
// on the pooled InstancedMesh added to the scene: live puffs decompose to a
// non-zero scale; recycled/empty slots are the zero matrix (scale 0).

/** The single dust InstancedMesh the factory parents to the scene root. */
function findDustMesh(scene: THREE.Scene): THREE.InstancedMesh {
  const mesh = scene.children.find(
    (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh
  );
  if (!mesh) throw new Error('dust InstancedMesh not found on scene');
  return mesh;
}

// Inactive slots are written as makeScale(0,0,0) — a matrix whose entire upper
// 3x3 block is zero. (THREE's Matrix4.decompose famously returns scale 1 for a
// zero matrix, so we read the rotation/scale block directly instead.)
const UPPER_3X3 = [0, 1, 2, 4, 5, 6, 8, 9, 10];

/** Count active puffs — a live puff's instance matrix has a non-zero 3x3 block. */
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

describe('createDustPuffs', () => {
  it('parents an opaque, unlit-safe InstancedMesh to the scene root with pool flags', () => {
    const scene = new THREE.Scene();
    const dust = createDustPuffs(scene, flatGround);

    const mesh = findDustMesh(scene);
    expect(mesh.count).toBe(DUST_POOL_SIZE);
    expect(mesh.material).toBeInstanceOf(THREE.MeshLambertMaterial);
    // Opaque, never alpha — alpha bands under the nearest-neighbor pixel filter.
    const material = mesh.material as THREE.MeshLambertMaterial;
    expect(material.transparent).toBe(false);
    expect(material.opacity).toBe(1);
    expect(mesh.frustumCulled).toBe(false);
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(false);

    dust.dispose();
  });

  it('hard-caps live puffs at DUST_POOL_SIZE when over-spawned', () => {
    const scene = new THREE.Scene();
    const dust = createDustPuffs(scene, flatGround);
    const mesh = findDustMesh(scene);

    // Over-spawn well past the cap; the slot-claim scan returns early when full.
    for (let i = 0; i < DUST_POOL_SIZE + 6; i += 1) dust.spawn(i, 0, 1, 0);
    dust.update(0.016); // write matrices for the active pool

    expect(countLive(mesh)).toBeLessThanOrEqual(DUST_POOL_SIZE);
    expect(countLive(mesh)).toBe(DUST_POOL_SIZE);
    // The pool never grows — instance count is fixed regardless of spawn pressure.
    expect(mesh.count).toBe(DUST_POOL_SIZE);

    dust.dispose();
  });

  it('expires puffs after their lifetime and recycles their slots', () => {
    const scene = new THREE.Scene();
    const dust = createDustPuffs(scene, flatGround);
    const mesh = findDustMesh(scene);

    dust.spawn(0, 0, 1, 0);
    dust.spawn(1, 0, 1, 0);
    dust.spawn(2, 0, 1, 0);
    dust.update(0.016);
    expect(countLive(mesh)).toBe(3);

    // Advance well past PUFF_LIFE (< 1s) — every puff ages out and recycles.
    dust.update(1.0);
    expect(countLive(mesh)).toBe(0);
    // Instance count still fixed after recycling — no growth, no shrink.
    expect(mesh.count).toBe(DUST_POOL_SIZE);

    dust.dispose();
  });

  it('reuses recycled slots on later spawns (pooled, not appended)', () => {
    const scene = new THREE.Scene();
    const dust = createDustPuffs(scene, flatGround);
    const mesh = findDustMesh(scene);

    // Fill, expire, then refill — a growing implementation would exceed the cap.
    for (let i = 0; i < DUST_POOL_SIZE; i += 1) dust.spawn(i, 0, 1, 0);
    dust.update(0.016);
    dust.update(1.0); // expire all
    for (let i = 0; i < DUST_POOL_SIZE; i += 1) dust.spawn(i, 0, 0, 1);
    dust.update(0.016);

    expect(countLive(mesh)).toBe(DUST_POOL_SIZE);
    expect(mesh.count).toBe(DUST_POOL_SIZE);

    dust.dispose();
  });

  it('removes the mesh from the scene on dispose without throwing', () => {
    const scene = new THREE.Scene();
    const dust = createDustPuffs(scene, flatGround);
    const mesh = findDustMesh(scene);
    expect(scene.children).toContain(mesh);

    expect(() => dust.dispose()).not.toThrow();
    expect(scene.children).not.toContain(mesh);
  });
});
