import * as THREE from 'three';
import { BIRD, birdFlight } from './wildlifeMath';
import { createWingedGeometry, createFlapMaterial, attachFlapPhases } from './wingedCreature';

/**
 * Startle-flush birds (WILD-02): ONE fixed-pool InstancedMesh of winged birds —
 * the "sprint through grass startles birds" payoff at one draw call. A flush is an
 * EXTERNAL EVENT: the call site (12-05) invokes spawn(x,z) when the player scuffs
 * grass, bursting 2–4 birds that TAKE OFF and FLY to a different resting spot a
 * good distance away (not a fade-in-place), wings flapping the whole way, then
 * despawn on arrival. The pool is a hard cap with slot recycling so frame cost is
 * flat and unbounded growth is impossible.
 *
 * Flight math delegates to the unit-tested wildlifeMath.birdFlight twin (takeoff-
 * and-land height arch + eased horizontal travel + soft fade); wings flap on the
 * GPU (createFlapMaterial). The flush DEBOUNCE lives at the call site
 * (wildlifeMath.flushReady). No scene light, no GPU readback, zero per-frame
 * allocation (the 144→20fps cliff class).
 */
export interface BirdFlush {
  /** Bursts 2–4 birds (one flush) that fly off from (x,z); no-op when the pool is full. */
  spawn(x: number, z: number): void;
  /** Flies each live bird toward its destination; despawns it on arrival. Zero-alloc. */
  update(deltaSeconds: number, camera: THREE.Camera): void;
  dispose(): void;
}

/** Hard pool cap — ~3 flushes of 2–4 birds in flight at once (D discretion). */
export const BIRD_POOL_SIZE = 12;
/** Overall bird size (world units). */
const BIRD_SIZE = 0.7;
/** Dark bird tint — a startled-flock silhouette against the daytime scene. */
const BIRD_TINT = 0x2b2b33;
/** How far a flushed bird flies to its new spot (world units). */
const FLEE_MIN = 22;
const FLEE_MAX = 40;
const TAU = Math.PI * 2;

interface Bird {
  spawnX: number;
  spawnZ: number;
  spawnY: number;
  targetX: number;
  targetZ: number;
  targetY: number;
  yaw: number;
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
    spawnY: 0,
    targetX: 0,
    targetZ: 0,
    targetY: 0,
    yaw: 0,
    age: 0,
    active: false,
  }));

  // Winged body+2-wings geometry with a fast GPU wing-flap — a real bird shape,
  // not a fading square. One InstancedMesh, one draw call.
  const flap = createFlapMaterial({ flapSpeed: 22, flapAmp: 0.95 });
  const mesh = new THREE.InstancedMesh(
    createWingedGeometry({ wingSpan: 0.5, wingChord: 0.34, bodyLength: 0.7, bodyWidth: 0.09 }),
    flap.material,
    BIRD_POOL_SIZE
  );
  const flapPhases = attachFlapPhases(mesh, BIRD_POOL_SIZE);
  const flapAttr = mesh.geometry.getAttribute('aFlapPhase') as THREE.InstancedBufferAttribute;
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
  const orientQuat = new THREE.Quaternion();
  const orientEuler = new THREE.Euler();
  const flightScratch = { travel: 0, height: 0, visible: 0 }; // wildlifeMath out-param, built ONCE
  let flapClock = 0;

  /** Claim the first free slot for a bird flying spawn→target. Returns claimed. */
  function claim(
    x: number,
    z: number,
    spawnY: number,
    targetX: number,
    targetZ: number
  ): boolean {
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
    bird.spawnY = spawnY;
    bird.targetX = targetX;
    bird.targetZ = targetZ;
    bird.targetY = getGroundHeight(targetX, targetZ);
    bird.yaw = Math.atan2(targetX - x, targetZ - z); // +Z forward → face the destination
    bird.age = 0;
    bird.active = true;
    flapPhases[slot] = Math.random() * TAU;
    flapAttr.needsUpdate = true;
    return true;
  }

  return {
    spawn(x, z) {
      // Cosmetic RNG (dust precedent): a burst of 2–4 birds, each fleeing on its
      // own outward heading to a DIFFERENT distant resting spot; groundY once.
      const spawnY = getGroundHeight(x, z);
      const count = 2 + Math.floor(Math.random() * 3); // 2, 3 or 4
      for (let n = 0; n < count; n += 1) {
        const angle = Math.random() * TAU;
        const dist = FLEE_MIN + Math.random() * (FLEE_MAX - FLEE_MIN);
        const tx = x + Math.cos(angle) * dist;
        const tz = z + Math.sin(angle) * dist;
        if (!claim(x, z, spawnY, tx, tz)) break; // pool full
      }
    },
    update(deltaSeconds, camera) {
      void camera; // birds orient by heading now, not a flat billboard
      let matrixDirty = false;
      flapClock += deltaSeconds;
      flap.setTime(flapClock);

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
        // Fly spawn→target with a takeoff/land height arch; math from the twin.
        birdFlight(t01, flightScratch);
        scratchPosition.set(
          bird.spawnX + (bird.targetX - bird.spawnX) * flightScratch.travel,
          (bird.spawnY + (bird.targetY - bird.spawnY) * flightScratch.travel) + flightScratch.height,
          bird.spawnZ + (bird.targetZ - bird.spawnZ) * flightScratch.travel
        );
        // Face the destination; nose up on the climb, down toward the landing.
        orientEuler.set(-Math.cos(Math.PI * t01) * 0.5, bird.yaw, 0);
        orientQuat.setFromEuler(orientEuler);
        const size = BIRD_SIZE * (0.6 + 0.4 * flightScratch.visible); // gentle shrink on the soft fade
        scratchScale.set(size, size, size);
        scratchMatrix.compose(scratchPosition, orientQuat, scratchScale);
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
