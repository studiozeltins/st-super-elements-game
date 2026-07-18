import * as THREE from 'three';
import { BIRD, birdArc } from './wildlifeMath';

/**
 * Startle-flush birds (WILD-02): ONE fixed-pool InstancedMesh of billboarded
 * bird silhouettes — the "sprint through grass startles birds" payoff at exactly
 * one draw call. Like footstep dust (and unlike self-managing butterflies), a
 * flush is an EXTERNAL EVENT: the call site (12-05) invokes spawn(x,z) when the
 * player scuffs grass, which bursts 2–4 birds up a scripted rising arc; update()
 * only ages the already-live pool along that arc and recycles a bird's slot the
 * instant its life elapses. The pool is a hard cap with slot recycling, so frame
 * cost is flat and unbounded growth is impossible.
 *
 * All flight math delegates to the unit-tested wildlifeMath.birdArc twin (rising
 * height, lateral spread, and fade). The flush DEBOUNCE lives at the call site
 * (wildlifeMath.flushReady), never here — spawn() is unconditional once called.
 * No scene light, no GPU readback, zero per-frame allocation (the 144→20fps cliff
 * class).
 */
export interface BirdFlush {
  /** Bursts 2–4 birds (one flush) up from (x,z); a no-op when the pool is full. */
  spawn(x: number, z: number): void;
  /** Ages each live bird along its arc; despawns it once t01 >= 1. Zero-alloc. */
  update(deltaSeconds: number, camera: THREE.Camera): void;
  dispose(): void;
}

/** Hard pool cap — ~3 flushes of 2–4 birds in flight at once (D discretion). */
export const BIRD_POOL_SIZE = 12;
/** Billboard silhouette size (world units) at full visibility. */
const BIRD_SIZE = 0.55;
/** Dark bird tint — a startled-flock silhouette read against the daytime sky. */
const BIRD_TINT = 0x2b2b33;
const TAU = Math.PI * 2;

interface Bird {
  spawnX: number;
  spawnZ: number;
  groundY: number;
  headingX: number;
  headingZ: number;
  age: number;
  active: boolean;
}

export function createBirdFlush(
  scene: THREE.Scene,
  getGroundHeight: (x: number, z: number) => number
): BirdFlush {
  const pool: Bird[] = Array.from({ length: BIRD_POOL_SIZE }, () => ({
    spawnX: 0,
    spawnZ: 0,
    groundY: 0,
    headingX: 0,
    headingZ: 0,
    age: 0,
    active: false,
  }));

  // Lambert (not Basic) — birds are a DAY event and read with the daytime scene
  // light like dust/butterflies; PlaneGeometry billboarded (silhouette matters).
  const mesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }),
    BIRD_POOL_SIZE
  );
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const baseColor = new THREE.Color(BIRD_TINT);
  const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let index = 0; index < BIRD_POOL_SIZE; index += 1) {
    mesh.setMatrixAt(index, zeroMatrix);
    mesh.setColorAt(index, baseColor);
  }
  mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  // Scene root, never the frozen world group — no updateMatrixWorld bookkeeping.
  scene.add(mesh);

  // Closure-level scratch — zero per-frame allocations (the 144→20fps cliff class).
  const scratchMatrix = new THREE.Matrix4();
  const scratchPosition = new THREE.Vector3();
  const scratchScale = new THREE.Vector3();
  const billboardQuat = new THREE.Quaternion();
  const arcScratch = { y: 0, spread: 0, visible: 0 }; // wildlifeMath out-param, built ONCE

  /** Claim the first free slot for a bird from (x,z) with the given heading. */
  function claim(x: number, z: number, groundY: number, headingX: number, headingZ: number): boolean {
    let slot = -1;
    for (let index = 0; index < BIRD_POOL_SIZE; index += 1) {
      if (!pool[index].active) {
        slot = index;
        break;
      }
    }
    if (slot === -1) return false; // hard cap: every slot busy, drop this bird
    const bird = pool[slot];
    bird.spawnX = x;
    bird.spawnZ = z;
    bird.groundY = groundY;
    bird.headingX = headingX;
    bird.headingZ = headingZ;
    bird.age = 0;
    bird.active = true;
    return true;
  }

  return {
    spawn(x, z) {
      // Cosmetic RNG is fine (dust/butterfly precedent): a burst of 2–4 birds,
      // each fanning out on its own random outward heading, groundY sampled once.
      const groundY = getGroundHeight(x, z);
      const count = 2 + Math.floor(Math.random() * 3); // 2, 3 or 4
      for (let n = 0; n < count; n += 1) {
        const angle = Math.random() * TAU;
        if (!claim(x, z, groundY, Math.cos(angle), Math.sin(angle))) break; // pool full
      }
    },
    update(deltaSeconds, camera) {
      let matrixDirty = false;
      // Read the billboard quaternion once per frame — no per-instance lookAt.
      billboardQuat.copy(camera.quaternion);

      for (let index = 0; index < BIRD_POOL_SIZE; index += 1) {
        const bird = pool[index];
        if (!bird.active) continue;
        bird.age += deltaSeconds;
        const t01 = bird.age / BIRD.life;
        if (t01 >= 1) {
          bird.active = false;
          mesh.setMatrixAt(index, zeroMatrix);
          matrixDirty = true;
          continue;
        }
        // Rising arc + lateral scatter + fade all delegate to the tested twin.
        birdArc(t01, arcScratch);
        scratchPosition.set(
          bird.spawnX + bird.headingX * arcScratch.spread,
          bird.groundY + arcScratch.y,
          bird.spawnZ + bird.headingZ * arcScratch.spread
        );
        const size = BIRD_SIZE * arcScratch.visible;
        scratchScale.set(size, size, size); // fade-out = shrink under the pixel filter
        scratchMatrix.compose(scratchPosition, billboardQuat, scratchScale);
        mesh.setMatrixAt(index, scratchMatrix);
        matrixDirty = true;
      }

      if (matrixDirty) mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      // InstancedMesh.dispose() releases the instanceMatrix/instanceColor GPU
      // buffers — geometry/material alone don't.
      mesh.dispose();
    },
  };
}
