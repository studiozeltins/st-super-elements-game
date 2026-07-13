import * as THREE from 'three';
import * as camps from '../world/camps';
import type { Wind } from './createWind';

/**
 * Campfire smoke columns: ONE fixed-pool InstancedMesh of chunky opaque voxel
 * puffs — the phase's only new draw-call source. Puffs rise from camp flame
 * tops and drift laterally on the shared wind (the CPU mirror of the shader
 * gust math), so a gust that leans the grass visibly kinks the plume. Fires
 * are radius-culled around the player at ~2Hz; the pool is a hard cap with
 * slot recycling, so frame cost is flat and unbounded growth is impossible.
 */
export interface SmokeColumns {
  update(deltaSeconds: number, playerX: number, playerZ: number): void;
  dispose(): void;
}

/** ~4 fires in range x 12 puffs per thin wisp — the hard pool cap (D-10). */
const SMOKE_POOL_SIZE = 48;
/** Only fires this close to the player spawn puffs (world units, D-11). */
const SMOKE_CULL_RADIUS = 50;
/** Fire-membership recheck cadence (~2Hz) — never per frame. */
const CULL_RECHECK_INTERVAL = 0.5;
/** Per-fire puff cadence; start offsets staggered so columns never sync. */
const SPAWN_INTERVAL = 0.7;
const RISE_SPEED = 0.8;
/** Recycle height above the emitter — a thin wisp, not a tower (D-10). */
const MAX_RISE = 4.5;
const PUFF_LIFE = MAX_RISE / RISE_SPEED;
/** Lateral drift at full wind strength with no gust (world units / s). */
const BASE_DRIFT = 0.45;
/** Extra downwind speed at a gust front — the visible plume kink (D-04). */
const GUST_KICK = 1.3;
/** Emitter sits at the campfire flame top (~ground + 1.0). */
const EMITTER_HEIGHT = 1.0;
/** Discrete shrink tiers; index doubles as the color-fade step (D-09). */
const SIZE_TIERS = [0.3, 0.24, 0.18, 0.11];
const SMOKE_GRAY = 0x757b82;
/** Puffs fade toward the sky color — opaque stepped dissolution, no alpha. */
const SKY_FADE = 0x8ecae6;

interface SmokePuff {
  x: number;
  y: number;
  z: number;
  yaw: number;
  age: number;
  step: number;
  fireIndex: number;
  active: boolean;
}

export function createSmokeColumns(
  scene: THREE.Scene,
  wind: Wind,
  getGroundHeight: (x: number, z: number) => number
): SmokeColumns {
  // Static fire anchors from camp data, computed once — never scene traversal.
  const emitters = camps.getCampSites().map(({ x, z }) => ({
    x,
    y: getGroundHeight(x, z) + EMITTER_HEIGHT,
    z,
  }));
  const fireActive = emitters.map(() => false);
  const spawnTimers = emitters.map((_, index) => (index * SPAWN_INTERVAL) / emitters.length);

  // Precomputed opaque fade palette — gray dissolving toward the sky (D-09).
  const fadeColors = SIZE_TIERS.map((_, index) =>
    new THREE.Color(SMOKE_GRAY).lerp(new THREE.Color(SKY_FADE), index / (SIZE_TIERS.length - 1))
  );

  const pool: SmokePuff[] = Array.from({ length: SMOKE_POOL_SIZE }, () => ({
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    age: 0,
    step: 0,
    fireIndex: 0,
    active: false,
  }));

  // Lambert, not Basic — Phase 9's day/night dims only lit materials. Opaque:
  // alpha blending bands under the nearest-filtered pixel target (D-09).
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial(),
    SMOKE_POOL_SIZE
  );
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let index = 0; index < SMOKE_POOL_SIZE; index += 1) {
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
  let cullTimer = CULL_RECHECK_INTERVAL; // force a membership check on frame 1

  /** Returns true when a slot was claimed (instance color written). */
  function spawnPuff(fireIndex: number): boolean {
    let slot = -1;
    for (let index = 0; index < SMOKE_POOL_SIZE; index += 1) {
      if (!pool[index].active) {
        slot = index;
        break;
      }
    }
    if (slot === -1) return false; // hard cap: every slot busy, skip this puff
    const puff = pool[slot];
    const emitter = emitters[fireIndex];
    // Non-deterministic Math.random is fine — cosmetic jitter (debris precedent).
    puff.x = emitter.x + (Math.random() - 0.5) * 0.16;
    puff.y = emitter.y;
    puff.z = emitter.z + (Math.random() - 0.5) * 0.16;
    puff.yaw = Math.random() * Math.PI;
    puff.age = 0;
    puff.step = 0;
    puff.fireIndex = fireIndex;
    puff.active = true;
    mesh.setColorAt(slot, fadeColors[0]);
    return true;
  }

  return {
    update(deltaSeconds, playerX, playerZ) {
      cullTimer += deltaSeconds;
      if (cullTimer >= CULL_RECHECK_INTERVAL) {
        cullTimer = 0;
        for (let index = 0; index < emitters.length; index += 1) {
          const dx = emitters[index].x - playerX;
          const dz = emitters[index].z - playerZ;
          fireActive[index] = dx * dx + dz * dz <= SMOKE_CULL_RADIUS * SMOKE_CULL_RADIUS;
        }
      }

      let matrixDirty = false;
      let colorDirty = false;

      for (let index = 0; index < emitters.length; index += 1) {
        if (!fireActive[index]) continue;
        spawnTimers[index] -= deltaSeconds;
        if (spawnTimers[index] <= 0) {
          spawnTimers[index] += SPAWN_INTERVAL;
          if (spawnPuff(index)) colorDirty = true;
        }
      }

      // Read the live uniform values THIS frame — the Vector2 and strength are
      // mutated in place by wind.update(); never cache them across frames.
      const windX = wind.directionUniform.value.x;
      const windZ = wind.directionUniform.value.y;
      const strength = wind.strengthUniform.value;

      for (let index = 0; index < SMOKE_POOL_SIZE; index += 1) {
        const puff = pool[index];
        if (!puff.active) continue;
        puff.age += deltaSeconds;
        if (puff.age >= PUFF_LIFE) {
          puff.active = false;
          mesh.setMatrixAt(index, zeroMatrix);
          matrixDirty = true;
          continue;
        }
        // ?nowind (strength 0) zeroes drift AND kink — fire still smokes straight up.
        puff.y += RISE_SPEED * deltaSeconds;
        const drift =
          (BASE_DRIFT + GUST_KICK * wind.sampleGust(puff.x, puff.z)) * strength * deltaSeconds;
        puff.x += windX * drift;
        puff.z += windZ * drift;
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
    },
  };
}
