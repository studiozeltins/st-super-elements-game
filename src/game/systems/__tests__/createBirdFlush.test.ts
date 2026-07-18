import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createBirdFlush, BIRD_POOL_SIZE } from '../createBirdFlush';

// Headless THREE testing (no WebGL) — mirrors createButterflies.test.ts. We assert
// on the pooled InstancedMesh: live birds decompose to a non-zero scale, empty
// slots are the zero matrix. Flight/peck math is proven in wildlifeMath.test.ts;
// here we prove the pool + flush + land-and-peck (no despawn) + day-gate + cap.

const DAY = 0.5; // midday phase → isDayTime true
const NIGHT = 0.0; // KEYFRAMES fireflyLevel === 1 at phase 0 → not day

function findMesh(scene: THREE.Scene): THREE.InstancedMesh {
  const mesh = scene.children.find(
    (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh
  );
  if (!mesh) throw new Error('bird InstancedMesh not found on scene');
  return mesh;
}

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
  it('parents a winged, lit InstancedMesh to the scene root with pool flags', () => {
    const scene = new THREE.Scene();
    const birds = createBirdFlush(scene, flatGround);
    const mesh = findMesh(scene);
    expect(mesh.count).toBe(BIRD_POOL_SIZE);
    expect(mesh.geometry).toBeInstanceOf(THREE.BufferGeometry);
    expect(mesh.geometry.getAttribute('aWing')).toBeDefined(); // winged geometry, not a flat quad
    expect(mesh.material).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(mesh.frustumCulled).toBe(false);
    expect(BIRD_POOL_SIZE).toBeGreaterThan(0);
    expect(BIRD_POOL_SIZE).toBeLessThanOrEqual(24);
    birds.dispose();
  });

  it('flushing empty grass bursts 2–4 fresh birds into flight', () => {
    const scene = new THREE.Scene();
    const birds = createBirdFlush(scene, flatGround);
    const mesh = findMesh(scene);
    expect(countLive(mesh)).toBe(0);
    birds.spawn(5, 5); // no grounded birds nearby → fresh burst
    birds.update(0.016, camera, 5, 5, DAY, 0);
    const live = countLive(mesh);
    expect(live).toBeGreaterThanOrEqual(2);
    expect(live).toBeLessThanOrEqual(4);
    birds.dispose();
  });

  it('a flushed bird LANDS and keeps living (pecks) — it does not despawn', () => {
    const scene = new THREE.Scene();
    const birds = createBirdFlush(scene, flatGround);
    const mesh = findMesh(scene);
    birds.spawn(0, 0);
    birds.update(0.016, camera, 0, 0, DAY, 0);
    const inFlight = countLive(mesh);
    expect(inFlight).toBeGreaterThan(0);
    // Advance well past a flight life — birds arrive and switch to pecking, still live.
    for (let i = 0; i < 20; i += 1) birds.update(0.5, camera, 0, 0, DAY, i);
    expect(countLive(mesh)).toBeGreaterThan(0); // still present, now pecking
    expect(mesh.count).toBe(BIRD_POOL_SIZE);
    birds.dispose();
  });

  it('self-spawns grounded birds over grass by day and clears them at night', () => {
    const scene = new THREE.Scene();
    const birds = createBirdFlush(scene, flatGround); // flatGround → surfaceAt grass at origin
    const mesh = findMesh(scene);
    // Several rechecks by day top up grounded peckers near the player.
    for (let i = 0; i < 6; i += 1) birds.update(0.5, camera, 0, 0, DAY, i);
    expect(countLive(mesh)).toBeGreaterThan(0);
    // Night: grounded birds are culled.
    birds.update(0.5, camera, 0, 0, NIGHT, 10);
    expect(countLive(mesh)).toBe(0);
    birds.dispose();
  });

  it('hard-caps live birds at BIRD_POOL_SIZE under heavy flushing', () => {
    const scene = new THREE.Scene();
    const birds = createBirdFlush(scene, flatGround);
    const mesh = findMesh(scene);
    for (let i = 0; i < BIRD_POOL_SIZE * 2; i += 1) birds.spawn(i, 0);
    birds.update(0.016, camera, 0, 0, DAY, 0);
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
