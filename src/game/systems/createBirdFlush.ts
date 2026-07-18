import * as THREE from 'three';
import { BIRD, PECK, birdFlight, peckDip, isDayTime, inSpawnRing, beyondCull, SPAWN } from './wildlifeMath';
import { surfaceAt } from './surfaceAt';
import { createWingedGeometry, createFlapMaterial, attachFlapAttrs } from './wingedCreature';

/**
 * Ground birds + startle flush (WILD-02): ONE fixed-pool InstancedMesh of winged
 * birds that PECK on the grass by day near the player (self-managing like the
 * butterflies), and FLUSH into flight when the player scuffs grass nearby — the
 * call site (12-05) invokes spawn(x,z) on a grass-sprint. A flushed bird takes off
 * with fast-beating wings, flies to a DIFFERENT grassy spot a good distance away
 * (each on its own scatter heading — never the same direction), LANDS, and resumes
 * PECKING there. Birds only leave when they wander out of the cull radius, never a
 * fade-in-place. Hard-capped pool, one draw call, zero per-frame allocation.
 *
 * Flight + peck rhythm delegate to the unit-tested wildlifeMath twin; wings flap on
 * the GPU (per-instance amplitude: full while flying, folded while pecking).
 */
export interface BirdFlush {
  /** Flush any grounded birds near (x,z) into flight (a grass-scuff disturbance). */
  spawn(x: number, z: number): void;
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

/** Hard pool cap — a small scattering of ground birds + a flush or two in flight. */
export const BIRD_POOL_SIZE = 12;
/** Overall bird size (world units). */
const BIRD_SIZE = 0.75;
const BIRD_WING = 0x6b6f78;
const BIRD_BODY = 0x2b2b33;
/** A grass scuff flushes grounded birds within this radius of the player's step. */
const FLUSH_RADIUS = 9;
/** How far a flushed bird flies to its new spot (world units). */
const FLEE_MIN = 20;
const FLEE_MAX = 38;
const RECHECK_INTERVAL = 0.5;
const MAX_SPAWNS_PER_RECHECK = 2;
const SPAWN_ATTEMPTS = 6;
const HOP_HOVER = 0.12; // a grounded bird sits a hair above the blades
const TAU = Math.PI * 2;

type BirdState = 'peck' | 'fly';

interface Bird {
  // Resting/pecking anchor (also the landing spot after a flight).
  anchorX: number;
  anchorZ: number;
  groundY: number;
  yaw: number;
  seed: number;
  state: BirdState;
  active: boolean;
  // Flight-only:
  spawnX: number;
  spawnZ: number;
  spawnY: number;
  age: number;
}

export function createBirdFlush(
  scene: THREE.Scene,
  getGroundHeight: (x: number, z: number) => number
): BirdFlush {
  const pool: Bird[] = Array.from({ length: BIRD_POOL_SIZE }, () => ({
    anchorX: 0,
    anchorZ: 0,
    groundY: 0,
    yaw: 0,
    seed: 0,
    state: 'peck' as BirdState,
    active: false,
    spawnX: 0,
    spawnZ: 0,
    spawnY: 0,
    age: 0,
  }));

  const flap = createFlapMaterial({ flapSpeed: 22, flapAmp: 0.95 });
  const mesh = new THREE.InstancedMesh(
    createWingedGeometry({
      wingSpan: 0.5,
      wingChord: 0.34,
      bodyLength: 0.7,
      bodyWidth: 0.11,
      wingColor: BIRD_WING,
      bodyColor: BIRD_BODY,
    }),
    flap.material,
    BIRD_POOL_SIZE
  );
  const { phases: flapPhases, amps: flapAmps, phaseAttr, ampAttr } = attachFlapAttrs(mesh, BIRD_POOL_SIZE);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  const white = new THREE.Color(0xffffff);
  for (let index = 0; index < BIRD_POOL_SIZE; index += 1) {
    mesh.setMatrixAt(index, zeroMatrix);
    mesh.setColorAt(index, white);
  }
  mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);

  // Closure-level scratch — zero per-frame allocations.
  const scratchMatrix = new THREE.Matrix4();
  const scratchPosition = new THREE.Vector3();
  const scratchScale = new THREE.Vector3(BIRD_SIZE, BIRD_SIZE, BIRD_SIZE);
  const orientQuat = new THREE.Quaternion();
  const orientEuler = new THREE.Euler();
  const flightScratch = { travel: 0, height: 0, visible: 0 };
  let recheckTimer = RECHECK_INTERVAL;
  let flapClock = 0;

  function setAmp(slot: number, amp: number): void {
    flapAmps[slot] = amp;
    ampAttr.needsUpdate = true;
  }

  /** Claim a free slot as a grounded pecking bird at (x,z). Returns the slot or -1. */
  function claimPeck(x: number, z: number): number {
    let slot = -1;
    for (let index = 0; index < BIRD_POOL_SIZE; index += 1) {
      if (!pool[index].active) {
        slot = index;
        break;
      }
    }
    if (slot === -1) return -1;
    const bird = pool[slot];
    bird.anchorX = x;
    bird.anchorZ = z;
    bird.groundY = getGroundHeight(x, z);
    bird.yaw = Math.random() * TAU;
    bird.seed = Math.random() * TAU;
    bird.state = 'peck';
    bird.active = true;
    flapPhases[slot] = Math.random() * TAU;
    phaseAttr.needsUpdate = true;
    setAmp(slot, 0); // folded wings on the ground
    return slot;
  }

  /** Launch a bird into flight toward its OWN scattered far target. */
  function launch(bird: Bird, slot: number): void {
    const angle = Math.random() * TAU; // each bird its own heading — never a shared direction
    const dist = FLEE_MIN + Math.random() * (FLEE_MAX - FLEE_MIN);
    bird.spawnX = bird.anchorX;
    bird.spawnZ = bird.anchorZ;
    bird.spawnY = bird.groundY;
    bird.anchorX += Math.cos(angle) * dist; // anchor becomes the landing spot
    bird.anchorZ += Math.sin(angle) * dist;
    bird.groundY = getGroundHeight(bird.anchorX, bird.anchorZ);
    bird.yaw = Math.atan2(bird.anchorX - bird.spawnX, bird.anchorZ - bird.spawnZ);
    bird.age = 0;
    bird.state = 'fly';
    setAmp(slot, 1); // full flap in the air
  }

  return {
    spawn(x, z) {
      // A grass scuff: flush nearby grounded birds into flight. If none are close
      // (or the pool is empty), spawn a fresh burst so the flush always reads.
      let flushed = 0;
      for (let index = 0; index < BIRD_POOL_SIZE; index += 1) {
        const bird = pool[index];
        if (!bird.active || bird.state !== 'peck') continue;
        const dx = bird.anchorX - x;
        const dz = bird.anchorZ - z;
        if (dx * dx + dz * dz <= FLUSH_RADIUS * FLUSH_RADIUS) {
          launch(bird, index);
          flushed += 1;
          if (flushed >= 4) break;
        }
      }
      if (flushed === 0) {
        const count = 2 + Math.floor(Math.random() * 2); // 2–3 fresh birds bolt off
        for (let n = 0; n < count; n += 1) {
          const slot = claimPeck(x, z);
          if (slot === -1) break; // pool full
          launch(pool[slot], slot);
        }
      }
    },
    update(deltaSeconds, camera, playerX, playerZ, phase, t) {
      void camera;
      let matrixDirty = false;
      const day = isDayTime(phase);
      flapClock += deltaSeconds;
      flap.setTime(flapClock);

      recheckTimer += deltaSeconds;
      if (recheckTimer >= RECHECK_INTERVAL) {
        recheckTimer = 0;
        let live = 0;
        for (let index = 0; index < BIRD_POOL_SIZE; index += 1) {
          const bird = pool[index];
          if (!bird.active) continue;
          const dx = playerX - bird.anchorX;
          const dz = playerZ - bird.anchorZ;
          // Cull grounded birds that fell too far behind; night clears everyone.
          // Flying birds are never culled mid-air (they finish their landing).
          if (bird.state === 'peck' && (!day || beyondCull(dx, dz))) {
            bird.active = false;
            mesh.setMatrixAt(index, zeroMatrix);
            matrixDirty = true;
          } else {
            live += 1;
          }
        }
        if (day) {
          let spawned = 0;
          while (live < BIRD_POOL_SIZE && spawned < MAX_SPAWNS_PER_RECHECK) {
            let placed = false;
            for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt += 1) {
              const angle = Math.random() * TAU;
              const radius = SPAWN.inner + Math.random() * (SPAWN.outer - SPAWN.inner);
              const x = playerX + Math.cos(angle) * radius;
              const z = playerZ + Math.sin(angle) * radius;
              if (!inSpawnRing(x - playerX, z - playerZ)) continue;
              if (surfaceAt(x, z) !== 'grass') continue;
              if (claimPeck(x, z) === -1) break;
              placed = true;
              break;
            }
            if (!placed) break;
            live += 1;
            spawned += 1;
          }
        }
      }

      for (let index = 0; index < BIRD_POOL_SIZE; index += 1) {
        const bird = pool[index];
        if (!bird.active) continue;

        if (bird.state === 'fly') {
          bird.age += deltaSeconds;
          const t01 = bird.age / BIRD.life;
          if (t01 >= 1) {
            // Landed — resume pecking at the new spot (NOT despawn).
            bird.state = 'peck';
            bird.age = 0;
            setAmp(index, 0);
            scratchPosition.set(bird.anchorX, bird.groundY + HOP_HOVER, bird.anchorZ);
            orientEuler.set(0, bird.yaw, 0);
          } else {
            birdFlight(t01, flightScratch);
            scratchPosition.set(
              bird.spawnX + (bird.anchorX - bird.spawnX) * flightScratch.travel,
              bird.spawnY + (bird.groundY - bird.spawnY) * flightScratch.travel + flightScratch.height,
              bird.spawnZ + (bird.anchorZ - bird.spawnZ) * flightScratch.travel
            );
            orientEuler.set(-Math.cos(Math.PI * t01) * 0.5, bird.yaw, 0);
          }
        } else {
          // Pecking on the ground: a quick head-down jab dips the body + tips the
          // nose down, resting between jabs. Wings folded (aFlapAmp 0).
          const dip = peckDip(t, bird.seed);
          scratchPosition.set(
            bird.anchorX,
            bird.groundY + HOP_HOVER + PECK.rest - PECK.depth * dip,
            bird.anchorZ
          );
          orientEuler.set(dip * 0.9, bird.yaw, 0); // nose pitches down into the peck
        }

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
      mesh.dispose();
    },
  };
}
