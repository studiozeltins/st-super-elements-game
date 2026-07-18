import * as THREE from 'three';
import {
  butterflyWander,
  butterflyBob,
  fireflyPulse,
  fireflyLevelAt,
  beyondCull,
  SPAWN,
} from './wildlifeMath';
import { surfaceAt } from './surfaceAt';

/**
 * Dusk/night fireflies: ONE self-managing InstancedMesh pool of tiny UNLIT quads
 * that glow over grass near the player — the after-dark living-world payoff at
 * exactly one draw call. Built on the createDustPuffs pool spine (fixed pool +
 * slot recycle → flat frame cost, no unbounded growth), with the ONE critical
 * delta from every sibling factory: a MeshBasicMaterial (UNLIT) so fireflies stay
 * bright while Phase 9's day/night dims every LIT material at night. "Glow" is a
 * brightness pulse on instanceColor, NOT a scene light (a firefly PointLight would
 * recompile every lit material; the size-4 lightPool is combat-owned) and NOT
 * additive/alpha (bands under the nearest-filtered pixel target, no bloom pass).
 * update() gates on the shared fireflyLevel channel: empty by day, level-scaled
 * fade-in at dusk, full swarm at night. All pulse/gate/ring math is delegated to
 * the unit-tested wildlifeMath twin; this file only wires the pool.
 */
export interface Fireflies {
  update(
    deltaSeconds: number,
    camera: THREE.Camera,
    playerX: number,
    playerZ: number,
    phase: number,
    t: number
  ): void;
  dispose(): void;
}

/** Hard pool cap — the full-night swarm size; dusk fades in a fraction of it (D discretion). */
export const FIREFLY_POOL_SIZE = 32;
/** Top-up / cull recheck cadence (~2Hz) — never a per-frame ring scan (smoke precedent). */
const RECHECK_INTERVAL = 0.5;
/** At most this many new fireflies claimed per recheck — a gentle dusk fade-in, not a pop. */
const MAX_SPAWNS_PER_RECHECK = 4;
/** Ring-point candidate attempts per recheck before giving up (avoids an infinite grass hunt). */
const SPAWN_ATTEMPTS = 6;
/** Tiny voxel point (world units) — a firefly is a spark, not a silhouette (no billboarding). */
const FIREFLY_SIZE = 0.08;
/** Lowest hover above the ground so a firefly floats over the grass, never clips it. */
const HOVER_MIN = 0.5;
/** Hover spread — per-firefly resting height lands in [HOVER_MIN, HOVER_MIN + HOVER_RANGE]. */
const HOVER_RANGE = 1.0;
/** Low-amplitude read of the shared wander so fireflies drift gently, not flutter like butterflies. */
const DRIFT_SCALE = 0.45;
/** Warm yellow-green firefly hue at full pulse — multiplyScalar(pulse) dims it toward the floor. */
const FIREFLY_HUE = 0xd8ff88;
const TAU = Math.PI * 2;

interface Firefly {
  anchorX: number;
  anchorZ: number;
  baseY: number;
  seed: number;
  phaseOffset: number;
  active: boolean;
}

export function createFireflies(
  scene: THREE.Scene,
  getGroundHeight: (x: number, z: number) => number
): Fireflies {
  const pool: Firefly[] = Array.from({ length: FIREFLY_POOL_SIZE }, () => ({
    anchorX: 0,
    anchorZ: 0,
    baseY: 0,
    seed: 0,
    phaseOffset: 0,
    active: false,
  }));

  // The critical delta from dust/butterflies: MeshBasicMaterial (UNLIT). Dust/
  // butterflies use Lambert BECAUSE they should dim with the scene; fireflies are
  // the OPPOSITE intent — unlit so they stay bright against the dark night palette.
  // A small BoxGeometry voxel needs no billboarding (a firefly is a point).
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
    FIREFLY_POOL_SIZE
  );
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const baseHue = new THREE.Color(FIREFLY_HUE);
  const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let index = 0; index < FIREFLY_POOL_SIZE; index += 1) {
    mesh.setMatrixAt(index, zeroMatrix);
    // Seed EVERY slot's color at build — an un-seeded instanceColor renders white
    // (no pulse). Set DynamicDrawUsage since it pulses every frame (Pitfall 6).
    mesh.setColorAt(index, baseHue);
  }
  mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  // Scene root, never the frozen world group — no updateMatrixWorld bookkeeping.
  scene.add(mesh);

  // Closure-level scratch — zero per-frame allocations (the 144→20fps cliff class).
  const scratchMatrix = new THREE.Matrix4();
  const scratchPosition = new THREE.Vector3();
  const scratchScale = new THREE.Vector3(FIREFLY_SIZE, FIREFLY_SIZE, FIREFLY_SIZE);
  const identityQuat = new THREE.Quaternion(); // no billboarding — a firefly is a point
  const scratchColor = new THREE.Color();
  const wanderScratch = { x: 0, z: 0 }; // wildlifeMath out-param, built ONCE
  let recheckTimer = RECHECK_INTERVAL; // force a top-up/cull pass on the first lit frame

  /** Claim the first free slot for a firefly anchored at (x,z); returns claimed. */
  function claim(x: number, z: number): boolean {
    let slot = -1;
    for (let index = 0; index < FIREFLY_POOL_SIZE; index += 1) {
      if (!pool[index].active) {
        slot = index;
        break;
      }
    }
    if (slot === -1) return false; // hard cap: every slot busy
    const fly = pool[slot];
    fly.anchorX = x;
    fly.anchorZ = z;
    fly.baseY = getGroundHeight(x, z) + HOVER_MIN + Math.random() * HOVER_RANGE;
    fly.seed = Math.random() * TAU; // cosmetic RNG is fine (dust precedent)
    fly.phaseOffset = Math.random() * TAU; // decorrelate the pulse so the swarm shimmers
    fly.active = true;
    return true;
  }

  /** Deactivate slot `index` and collapse it to the zero matrix. */
  function retire(index: number): void {
    pool[index].active = false;
    mesh.setMatrixAt(index, zeroMatrix);
  }

  return {
    update(deltaSeconds, _camera, playerX, playerZ, phase, t) {
      let matrixDirty = false;
      let colorDirty = false;
      const level = fireflyLevelAt(phase);

      // Clean day no-op: collapse any lingering fireflies once, then skip the body.
      // Subsequent day frames find nothing active, so this costs one empty scan.
      if (level <= 0) {
        for (let index = 0; index < FIREFLY_POOL_SIZE; index += 1) {
          if (pool[index].active) {
            retire(index);
            matrixDirty = true;
          }
        }
        if (matrixDirty) mesh.instanceMatrix.needsUpdate = true;
        return;
      }

      recheckTimer += deltaSeconds;
      if (recheckTimer >= RECHECK_INTERVAL) {
        recheckTimer = 0;

        // Cull pass — anyone past the cull radius despawns; count survivors.
        let live = 0;
        for (let index = 0; index < FIREFLY_POOL_SIZE; index += 1) {
          const fly = pool[index];
          if (!fly.active) continue;
          if (beyondCull(playerX - fly.anchorX, playerZ - fly.anchorZ)) {
            retire(index);
            matrixDirty = true;
          } else {
            live += 1;
          }
        }

        // Dusk fade-in: the LIT count scales with the firefly level (0 by day → full
        // at night). Trim down when the level drops (dusk→brighter), top up otherwise.
        const target = Math.min(FIREFLY_POOL_SIZE, Math.ceil(FIREFLY_POOL_SIZE * level));
        for (let index = 0; index < FIREFLY_POOL_SIZE && live > target; index += 1) {
          if (pool[index].active) {
            retire(index);
            matrixDirty = true;
            live -= 1;
          }
        }

        let spawned = 0;
        while (live < target && spawned < MAX_SPAWNS_PER_RECHECK) {
          let placed = false;
          for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt += 1) {
            const angle = Math.random() * TAU;
            const radius = SPAWN.inner + Math.random() * (SPAWN.outer - SPAWN.inner);
            const x = playerX + Math.cos(angle) * radius;
            const z = playerZ + Math.sin(angle) * radius;
            if (surfaceAt(x, z) !== 'grass') continue;
            if (!claim(x, z)) break;
            placed = true;
            break;
          }
          if (!placed) break; // no grass found this recheck — try again next time
          live += 1;
          spawned += 1;
        }
      }

      // Per-frame gentle drift + brightness pulse. No per-instance lookAt, no alloc.
      for (let index = 0; index < FIREFLY_POOL_SIZE; index += 1) {
        const fly = pool[index];
        if (!fly.active) continue;
        butterflyWander(t, fly.seed, wanderScratch);
        scratchPosition.set(
          fly.anchorX + wanderScratch.x * DRIFT_SCALE,
          fly.baseY + butterflyBob(t, fly.seed) * DRIFT_SCALE,
          fly.anchorZ + wanderScratch.z * DRIFT_SCALE
        );
        scratchMatrix.compose(scratchPosition, identityQuat, scratchScale);
        mesh.setMatrixAt(index, scratchMatrix);
        matrixDirty = true;
        // Glow = base hue dimmed by the floored, decorrelated pulse (never a light).
        scratchColor.copy(baseHue).multiplyScalar(fireflyPulse(t, fly.phaseOffset));
        mesh.setColorAt(index, scratchColor);
        colorDirty = true;
      }

      if (matrixDirty) mesh.instanceMatrix.needsUpdate = true;
      if (colorDirty) mesh.instanceColor!.needsUpdate = true;
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
