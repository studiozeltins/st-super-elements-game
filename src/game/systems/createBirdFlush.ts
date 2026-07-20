import * as THREE from 'three';
import { BIRD, birdFlight, peckDip, isDayTime, inSpawnRing, beyondCull, SPAWN } from './wildlifeMath';
import { surfaceAt } from './surfaceAt';
import { loadCrowModel, createCrowWingGeometry, CROW_WING_COLOR, type CrowModel } from './crowModel';
import { createSolidFlapMaterial, attachFlapAttrs } from './wingedCreature';

/**
 * Ground crows + startle flush (WILD-02): ONE fixed-pool InstancedMesh of the
 * CC-BY crow model (see ATTRIBUTION.md) that PECK on the grass by day near the
 * player (self-managing like the butterflies), and FLUSH into flight when the
 * player scuffs grass nearby — the call site (12-05) invokes spawn(x,z). A flushed
 * crow takes off, flies to a DIFFERENT nearby grassy spot (each on its own scatter
 * heading, close enough to stay visible and inside the cull radius), LANDS, and
 * resumes PECKING. Crows only leave when they wander out of the cull radius, never
 * a fade-in-place. Hard-capped pool, one draw call, zero per-frame allocation.
 *
 * The crow glb is a single static mesh (no skeleton), so pose is done on the CPU
 * per instance from the unit-tested wildlifeMath twin: pecking dips a forward body
 * pitch (head to the ground), flight follows the scripted take-off/land arch. The
 * model loads asynchronously — update() runs the pool state machine every frame and
 * only writes instance matrices once the mesh is built (see `ready`).
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
  /** Resolves once the crow model has loaded and the InstancedMesh is on the scene. */
  ready: Promise<void>;
}

/** Hard pool cap — a small scattering of ground crows + a flush or two in flight. */
export const BIRD_POOL_SIZE = 12;
/** A grass scuff flushes grounded birds within this radius of the player's step. */
const FLUSH_RADIUS = 6;
/**
 * How far a flushed bird flies to its new spot (world units). Kept short enough
 * that the landing spot stays inside SPAWN.cull (30) of the player — so the bird
 * settles somewhere still visible and does NOT get instantly culled on landing.
 */
const FLEE_MIN = 10;
const FLEE_MAX = 18;
const RECHECK_INTERVAL = 0.5;
const MAX_SPAWNS_PER_RECHECK = 2;
const SPAWN_ATTEMPTS = 6;
const HOP_HOVER = 0.02; // a grounded crow's feet sit a hair above the blades
/** Peak forward body-pitch at the bottom of a peck (radians). */
const PECK_PITCH = 0.7;
/** Slight nose-up/down pitch across a flight (radians). */
const FLIGHT_PITCH = 0.35;
/** Wing-beat: radians/sec and peak rotation of the crow's procedural wings. */
const WING_FLAP_SPEED = 16;
const WING_FLAP_AMP = 1.15;
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
  getGroundHeight: (x: number, z: number) => number,
  loadModel: (url?: string) => Promise<CrowModel> = loadCrowModel
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

  // Built once the crow model resolves; until then update() runs the pool logic but
  // writes no matrices (nothing to render yet). `mesh` is the crow body; `wingMesh`
  // is the procedural flapping wings, sharing the body's per-instance matrix.
  let mesh: THREE.InstancedMesh | null = null;
  let wingMesh: THREE.InstancedMesh | null = null;
  let disposed = false;
  const wingFlap = createSolidFlapMaterial({
    flapSpeed: WING_FLAP_SPEED,
    flapAmp: WING_FLAP_AMP,
    color: CROW_WING_COLOR,
  });
  let flapAmps: Float32Array | null = null;
  let flapPhases: Float32Array | null = null;
  let ampAttr: THREE.InstancedBufferAttribute | null = null;
  let phaseAttr: THREE.InstancedBufferAttribute | null = null;
  let flapClock = 0;

  const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  // Closure-level scratch — zero per-frame allocations.
  const scratchMatrix = new THREE.Matrix4();
  const scratchPosition = new THREE.Vector3();
  const scratchScale = new THREE.Vector3(1, 1, 1); // geometry is pre-sized in crowModel
  const orientQuat = new THREE.Quaternion();
  const orientEuler = new THREE.Euler();
  const flightScratch = { travel: 0, height: 0, visible: 0 };
  let recheckTimer = RECHECK_INTERVAL;

  /** aFlapAmp for a slot: 0 tucks the wings, 1 spreads + beats them. */
  function setFlapAmp(slot: number, amp: number): void {
    if (!flapAmps || !ampAttr) return;
    flapAmps[slot] = amp;
    ampAttr.needsUpdate = true;
  }

  const ready = loadModel()
    .then((model) => {
      if (disposed) {
        model.geometry.dispose();
        (model.material as THREE.Material).dispose();
        wingFlap.material.dispose();
        return;
      }
      const built = new THREE.InstancedMesh(model.geometry, model.material, BIRD_POOL_SIZE);
      built.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      built.frustumCulled = false;
      built.castShadow = false;
      built.receiveShadow = false;

      const wings = new THREE.InstancedMesh(createCrowWingGeometry(), wingFlap.material, BIRD_POOL_SIZE);
      wings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      wings.frustumCulled = false;
      wings.castShadow = false;
      wings.receiveShadow = false;
      const attrs = attachFlapAttrs(wings, BIRD_POOL_SIZE);
      flapAmps = attrs.amps;
      flapPhases = attrs.phases;
      ampAttr = attrs.ampAttr;
      phaseAttr = attrs.phaseAttr;

      for (let index = 0; index < BIRD_POOL_SIZE; index += 1) {
        built.setMatrixAt(index, zeroMatrix);
        wings.setMatrixAt(index, zeroMatrix);
        flapPhases[index] = Math.random() * TAU;
      }
      built.instanceMatrix.needsUpdate = true;
      wings.instanceMatrix.needsUpdate = true;
      phaseAttr.needsUpdate = true;
      scene.add(built);
      scene.add(wings);
      mesh = built;
      wingMesh = wings;
    })
    .catch((err) => {
      // A missing/broken crow.glb must not crash the game — just no ground birds.
      console.error('[birdFlush] crow model failed to load:', err);
    });

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
    setFlapAmp(slot, 0); // grounded → wings tucked
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
    setFlapAmp(slot, 1); // airborne → wings spread and beat
  }

  return {
    ready,
    spawn(x, z) {
      // A grass scuff: flush the grounded birds that were ACTUALLY pecking nearby.
      // No synthetic fallback burst — birds never materialize from nothing just to
      // bolt; the ambient recheck keeps the ground populated with real peckers, and
      // only those flush when the player scuffs close to them.
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
    },
    update(deltaSeconds, camera, playerX, playerZ, phase, t) {
      void camera;
      const day = isDayTime(phase);

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
            if (mesh) mesh.setMatrixAt(index, zeroMatrix);
            if (wingMesh) wingMesh.setMatrixAt(index, zeroMatrix);
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

      if (!mesh || !wingMesh) return; // model still loading — pool advanced, nothing to draw yet

      flapClock += deltaSeconds;
      wingFlap.setTime(flapClock);

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
            setFlapAmp(index, 0); // wings tuck on touchdown
            scratchPosition.set(bird.anchorX, bird.groundY + HOP_HOVER, bird.anchorZ);
            orientEuler.set(0, bird.yaw, 0);
          } else {
            birdFlight(t01, flightScratch);
            scratchPosition.set(
              bird.spawnX + (bird.anchorX - bird.spawnX) * flightScratch.travel,
              bird.spawnY + (bird.groundY - bird.spawnY) * flightScratch.travel + flightScratch.height,
              bird.spawnZ + (bird.anchorZ - bird.spawnZ) * flightScratch.travel
            );
            // Nose up on the climb, level on descent.
            orientEuler.set(-Math.cos(Math.PI * t01) * FLIGHT_PITCH, bird.yaw, 0);
          }
        } else {
          // Pecking on the ground: a quick forward body-pitch dips the head toward
          // the grass, resting upright between jabs.
          const dip = peckDip(t, bird.seed);
          scratchPosition.set(bird.anchorX, bird.groundY + HOP_HOVER, bird.anchorZ);
          orientEuler.set(dip * PECK_PITCH, bird.yaw, 0);
        }

        orientQuat.setFromEuler(orientEuler);
        scratchMatrix.compose(scratchPosition, orientQuat, scratchScale);
        mesh.setMatrixAt(index, scratchMatrix);
        wingMesh.setMatrixAt(index, scratchMatrix); // wings share the body transform
      }

      mesh.instanceMatrix.needsUpdate = true;
      wingMesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      disposed = true;
      if (mesh) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        mesh.dispose();
        mesh = null;
      }
      if (wingMesh) {
        scene.remove(wingMesh);
        wingMesh.geometry.dispose();
        wingMesh.dispose();
        wingMesh = null;
      }
      wingFlap.material.dispose();
    },
  };
}
