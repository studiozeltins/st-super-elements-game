import * as THREE from 'three';
import {
  butterflyWander,
  butterflyBob,
  isDayTime,
  inSpawnRing,
  beyondCull,
  SPAWN,
} from './wildlifeMath';
import { surfaceAt } from './surfaceAt';
import { createWingedGeometry, createFlapMaterial, attachFlapAttrs } from './wingedCreature';

/**
 * Daytime butterflies: ONE sparse, self-managing InstancedMesh pool that spawns
 * and despawns fluttering butterflies over grass near the player — the daytime
 * "encounter = event" living-world payoff at exactly one draw call. Built on the
 * createDustPuffs pool spine (fixed pool + slot recycle → flat frame cost, no
 * unbounded growth), but unlike dust it is NOT externally spawned: update() gates
 * on the shared day/night phase, culls anyone past SPAWN.cull, and tops up over
 * grass in the SPAWN ring on a slow recheck timer. All motion + gate + ring math
 * is delegated to the unit-tested wildlifeMath twin; this file only wires the pool.
 */
export interface Butterflies {
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

/** Hard pool cap — sparse by design: an encounter, not wallpaper (D discretion). */
export const BUTTERFLY_POOL_SIZE = 8;
/** Top-up / cull recheck cadence (~2Hz) — never a per-frame ring scan (smoke precedent). */
const RECHECK_INTERVAL = 0.5;
/** At most this many new butterflies claimed per recheck — a gentle fade-in, not a pop. */
const MAX_SPAWNS_PER_RECHECK = 2;
/** Ring-point candidate attempts per recheck before giving up (avoids an infinite grass hunt). */
const SPAWN_ATTEMPTS = 6;
/** Overall butterfly size (world units) — big enough to read as wings, not a dot. */
const BUTTERFLY_SIZE = 1.3;
/** Small hover above the ground so a butterfly floats, never clips the grass. */
const HOVER = 1.1;
/** Warm butterfly wing tint + a dark body, baked as vertex colors. */
const BUTTERFLY_WING = 0xf2b53a;
const BUTTERFLY_BODY = 0x2a2018;
const TAU = Math.PI * 2;

interface Butterfly {
  anchorX: number;
  anchorZ: number;
  groundY: number;
  seed: number;
  active: boolean;
}

export function createButterflies(
  scene: THREE.Scene,
  getGroundHeight: (x: number, z: number) => number
): Butterflies {
  const pool: Butterfly[] = Array.from({ length: BUTTERFLY_POOL_SIZE }, () => ({
    anchorX: 0,
    anchorZ: 0,
    groundY: 0,
    seed: 0,
    active: false,
  }));

  // Winged body+2-wings geometry with a wide GPU wing-flap (createFlapMaterial) —
  // real depth + flapping wings with a warm wing / dark body two-tone (baked vertex
  // colors), not a jiggling billboard. One InstancedMesh, one draw call.
  const flap = createFlapMaterial({ flapSpeed: 11, flapAmp: 1.35 });
  const mesh = new THREE.InstancedMesh(
    createWingedGeometry({
      wingSpan: 0.55,
      wingChord: 0.5,
      bodyLength: 0.42,
      bodyWidth: 0.06,
      wingColor: BUTTERFLY_WING,
      bodyColor: BUTTERFLY_BODY,
    }),
    flap.material,
    BUTTERFLY_POOL_SIZE
  );
  const { phases: flapPhases, amps: flapAmps, phaseAttr, ampAttr } = attachFlapAttrs(mesh, BUTTERFLY_POOL_SIZE);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  const white = new THREE.Color(0xffffff); // instanceColor is neutral — vertex colors carry the tint
  for (let index = 0; index < BUTTERFLY_POOL_SIZE; index += 1) {
    mesh.setMatrixAt(index, zeroMatrix);
    mesh.setColorAt(index, white);
  }
  mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  // Scene root, never the frozen world group — no updateMatrixWorld bookkeeping.
  scene.add(mesh);

  // Closure-level scratch — zero per-frame allocations (the 144→20fps cliff class).
  const scratchMatrix = new THREE.Matrix4();
  const scratchPosition = new THREE.Vector3();
  const scratchScale = new THREE.Vector3(BUTTERFLY_SIZE, BUTTERFLY_SIZE, BUTTERFLY_SIZE);
  const orientQuat = new THREE.Quaternion();
  const orientEuler = new THREE.Euler();
  const wanderScratch = { x: 0, z: 0 }; // wildlifeMath out-param, built ONCE
  let recheckTimer = RECHECK_INTERVAL; // force a top-up/cull pass on frame 1

  /** Claim the first free slot for a butterfly anchored at (x,z); returns claimed. */
  function claim(x: number, z: number): boolean {
    let slot = -1;
    for (let index = 0; index < BUTTERFLY_POOL_SIZE; index += 1) {
      if (!pool[index].active) {
        slot = index;
        break;
      }
    }
    if (slot === -1) return false; // hard cap: every slot busy
    const b = pool[slot];
    b.anchorX = x;
    b.anchorZ = z;
    b.groundY = getGroundHeight(x, z) + HOVER;
    b.seed = Math.random() * TAU; // cosmetic RNG is fine (dust precedent)
    b.active = true;
    flapPhases[slot] = Math.random() * TAU; // decorrelate the flock's wing-beat
    flapAmps[slot] = 1; // butterflies always flap at full
    phaseAttr.needsUpdate = true;
    ampAttr.needsUpdate = true;
    return true;
  }

  return {
    update(deltaSeconds, camera, playerX, playerZ, phase, t) {
      let matrixDirty = false;
      const day = isDayTime(phase);

      recheckTimer += deltaSeconds;
      if (recheckTimer >= RECHECK_INTERVAL) {
        recheckTimer = 0;

        // Cull pass — anyone past the cull radius despawns. At night, force the
        // whole pool out so it collapses to empty (a clean dusk/night no-op).
        let live = 0;
        for (let index = 0; index < BUTTERFLY_POOL_SIZE; index += 1) {
          const b = pool[index];
          if (!b.active) continue;
          const dx = playerX - b.anchorX;
          const dz = playerZ - b.anchorZ;
          if (!day || beyondCull(dx, dz)) {
            b.active = false;
            mesh.setMatrixAt(index, zeroMatrix);
            matrixDirty = true;
          } else {
            live += 1;
          }
        }

        // Top-up over grass in the SPAWN ring — only by day, gently.
        if (day) {
          let spawned = 0;
          while (live < BUTTERFLY_POOL_SIZE && spawned < MAX_SPAWNS_PER_RECHECK) {
            let placed = false;
            for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt += 1) {
              const angle = Math.random() * TAU;
              const radius = SPAWN.inner + Math.random() * (SPAWN.outer - SPAWN.inner);
              const x = playerX + Math.cos(angle) * radius;
              const z = playerZ + Math.sin(angle) * radius;
              if (!inSpawnRing(x - playerX, z - playerZ)) continue;
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
      }

      // Advance the shared GPU wing-beat once per frame (camera unused now — the
      // creature orients by its own heading, not a flat billboard).
      void camera;
      flap.setTime(t);

      // Per-frame drift — flutter each live butterfly on the shared wind clock,
      // orienting to its slow wander heading with gentle bank. No alloc.
      for (let index = 0; index < BUTTERFLY_POOL_SIZE; index += 1) {
        const b = pool[index];
        if (!b.active) continue;
        butterflyWander(t, b.seed, wanderScratch);
        scratchPosition.set(
          b.anchorX + wanderScratch.x,
          b.groundY + butterflyBob(t, b.seed),
          b.anchorZ + wanderScratch.z
        );
        // Slowly turning yaw + a little pitch bob → a living flight path; wings
        // (horizontal, flapping about the forward spine) read from the 3/4 cam.
        orientEuler.set(Math.sin(t * 0.9 + b.seed) * 0.25, b.seed + t * 0.35, 0);
        orientQuat.setFromEuler(orientEuler);
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
