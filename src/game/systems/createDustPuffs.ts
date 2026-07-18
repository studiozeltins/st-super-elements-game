import * as THREE from 'three';

/**
 * Ground-hugging footstep dust: ONE fixed-pool InstancedMesh of small opaque
 * voxel puffs — the phase's only new draw-call source. Unlike campfire smoke
 * (self-emitting static camps), dust is externally spawned by the moving player,
 * so it exposes spawn(); update() only ages/settles the already-live pool. Puffs
 * kick low off the foot, drift a touch backward from the movement direction, and
 * settle back to the ground within a fraction of a second. The pool is a hard cap
 * with slot recycling, so frame cost is flat and unbounded growth is impossible.
 */
export interface DustPuffs {
  spawn(x: number, z: number, dirX: number, dirZ: number): void;
  update(deltaSeconds: number): void;
  dispose(): void;
}

/** Hard pool cap — over-spawning never grows live instances past this (D-11). */
export const DUST_POOL_SIZE = 24;
/** Initial upward kick off the foot (world units / s) — a low puff, not a tower. */
const RISE_SPEED = 0.8;
/** Downward settle so the puff falls back near the ground within its life. */
const GRAVITY = 5.0;
/** Ground-hug ceiling reference (~0.4) — dust stays low; matches the short life. */
const PUFF_LIFE = 0.5;
/** Backward/outward drift speed away from the movement direction (units / s). */
const DRIFT_SPEED = 0.55;
/** Per-second horizontal drag so the backward kick eases out, never streaks. */
const DRIFT_DRAG = 3.5;
/** Discrete shrink tiers; index doubles as the color-fade step (D-09). Smaller than smoke. */
const SIZE_TIERS = [0.18, 0.14, 0.1, 0.06];
/** Dusty tan at birth. */
const DUST_TAN = 0xc2a878;
/** Fades toward a paler settled dust — opaque stepped dissolution, never alpha. */
const DUST_FADE = 0xd8cbb0;

interface DustPuff {
  x: number;
  y: number;
  z: number;
  groundY: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  age: number;
  step: number;
  active: boolean;
}

export function createDustPuffs(
  scene: THREE.Scene,
  getGroundHeight: (x: number, z: number) => number
): DustPuffs {
  // Precomputed opaque fade palette — tan dissolving toward pale dust (D-09).
  const fadeColors = SIZE_TIERS.map((_, index) =>
    new THREE.Color(DUST_TAN).lerp(new THREE.Color(DUST_FADE), index / (SIZE_TIERS.length - 1))
  );

  const pool: DustPuff[] = Array.from({ length: DUST_POOL_SIZE }, () => ({
    x: 0,
    y: 0,
    z: 0,
    groundY: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    age: 0,
    step: 0,
    active: false,
  }));

  // Lambert, not Basic — Phase 9's day/night dims only lit materials. Opaque:
  // alpha blending bands under the nearest-filtered pixel target (D-09).
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial(),
    DUST_POOL_SIZE
  );
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let index = 0; index < DUST_POOL_SIZE; index += 1) {
    mesh.setMatrixAt(index, zeroMatrix);
    mesh.setColorAt(index, fadeColors[0]);
  }
  mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  // Scene root, never the frozen world group — no updateMatrixWorld bookkeeping.
  scene.add(mesh);

  // Closure-level scratch — zero per-frame allocations (D-13).
  const scratchMatrix = new THREE.Matrix4();
  const scratchPosition = new THREE.Vector3();
  const scratchScale = new THREE.Vector3();
  const scratchQuaternion = new THREE.Quaternion();
  const upAxis = new THREE.Vector3(0, 1, 0);

  return {
    spawn(x, z, dirX, dirZ) {
      let slot = -1;
      for (let index = 0; index < DUST_POOL_SIZE; index += 1) {
        if (!pool[index].active) {
          slot = index;
          break;
        }
      }
      if (slot === -1) return; // hard cap: every slot busy, skip this puff
      const puff = pool[slot];
      const groundY = getGroundHeight(x, z);
      // Non-deterministic Math.random is fine — cosmetic jitter (debris precedent).
      // Puff births a touch behind the foot, offset opposite the movement dir.
      puff.x = x - dirX * 0.12 + (Math.random() - 0.5) * 0.12;
      puff.z = z - dirZ * 0.12 + (Math.random() - 0.5) * 0.12;
      puff.groundY = groundY;
      puff.y = groundY;
      puff.vy = RISE_SPEED * (0.7 + Math.random() * 0.6);
      // Backward/outward kick away from where the foot is heading.
      puff.vx = -dirX * DRIFT_SPEED + (Math.random() - 0.5) * 0.2;
      puff.vz = -dirZ * DRIFT_SPEED + (Math.random() - 0.5) * 0.2;
      puff.yaw = Math.random() * Math.PI;
      puff.age = 0;
      puff.step = 0;
      puff.active = true;
      mesh.setColorAt(slot, fadeColors[0]);
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    update(deltaSeconds) {
      let matrixDirty = false;
      let colorDirty = false;

      for (let index = 0; index < DUST_POOL_SIZE; index += 1) {
        const puff = pool[index];
        if (!puff.active) continue;
        puff.age += deltaSeconds;
        if (puff.age >= PUFF_LIFE) {
          puff.active = false;
          mesh.setMatrixAt(index, zeroMatrix);
          matrixDirty = true;
          continue;
        }
        // Low kick up, settle under gravity, never sink below the spawn ground.
        puff.vy -= GRAVITY * deltaSeconds;
        puff.y += puff.vy * deltaSeconds;
        if (puff.y < puff.groundY) {
          puff.y = puff.groundY;
          puff.vy = 0;
        }
        // Horizontal drift eases out — a puff, not a streak.
        puff.x += puff.vx * deltaSeconds;
        puff.z += puff.vz * deltaSeconds;
        const drag = Math.max(0, 1 - DRIFT_DRAG * deltaSeconds);
        puff.vx *= drag;
        puff.vz *= drag;
        const step = Math.min(
          SIZE_TIERS.length - 1,
          Math.floor((puff.age / PUFF_LIFE) * SIZE_TIERS.length)
        );
        if (step !== puff.step) {
          puff.step = step;
          mesh.setColorAt(index, fadeColors[step]);
          colorDirty = true;
        }
        const size = SIZE_TIERS[step];
        scratchMatrix.compose(
          scratchPosition.set(puff.x, puff.y, puff.z),
          scratchQuaternion.setFromAxisAngle(upAxis, puff.yaw),
          scratchScale.set(size, size, size)
        );
        mesh.setMatrixAt(index, scratchMatrix);
        matrixDirty = true;
      }

      if (matrixDirty) mesh.instanceMatrix.needsUpdate = true;
      if (colorDirty) mesh.instanceColor!.needsUpdate = true;
    },
    dispose() {
      scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      // InstancedMesh.dispose() dispatches the dispose event that releases the
      // instanceMatrix/instanceColor GPU buffers — geometry/material alone don't.
      mesh.dispose();
    },
  };
}
