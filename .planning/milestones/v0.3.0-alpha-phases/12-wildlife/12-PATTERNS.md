# Phase 12: Wildlife - Pattern Map

**Mapped:** 2026-07-18
**Files analyzed:** 7 (6 new, 1 modified)
**Analogs found:** 7 / 7 (every file has a shipped in-repo precedent)

> This is a **three-copies-of-one-pooled-InstancedMesh + one-pure-twin + one-audio-one-shot** phase, entirely client-side. Every hard part (zero-alloc pooling, hard cap, slot recycle, `needsUpdate` gating, grass classification, ground height, day/dusk gate, shared wind clock, sfx bus, gesture unlock) already ships and is already wired into `createGame.frame()`. The only genuinely new code is one pure-math twin (`wildlifeMath.ts`, mirroring `windMath`/`dayNightMath`), three thin `createDustPuffs`-clone factories, and a ~40-line wing synth mirroring `createAmbience.birdChirp`. Resist building anything resembling AI, flocking, or a new particle engine. Confirmed live seams: `CAMERA_YAW` (`createGame.ts:283`), the `fireflyLevel` day/dusk channel (`dayNightMath.ts:53-54`, `:83/96/109/122/135/148`), the grass stamp site (`createGame.ts:1022-1040`), the sfx-bus audio siblings (`:461-471`).

> **Naming note:** the orchestrator prompt calls the bird factory `createFlushBirds.ts`; RESEARCH.md consistently names it `createBirdFlush.ts` (with a `spawn(x,z)` verb). This map uses **`createBirdFlush.ts`** to match RESEARCH; the planner may pick either — the pattern is identical.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/game/systems/wildlifeMath.ts` | utility (pure math, zero-THREE) | transform | `src/game/systems/dayNightMath.ts` + `windMath.ts` | exact (structure/purity) |
| `src/game/systems/__tests__/wildlifeMath.test.ts` | test | transform | `src/game/systems/__tests__/windMath.test.ts` | exact |
| `src/game/systems/createButterflies.ts` | system/factory (pooled InstancedMesh) | frame update + spawn/cull | `src/game/systems/createDustPuffs.ts` | exact (template) |
| `src/game/systems/createFireflies.ts` | system/factory (pooled InstancedMesh) | frame update (gated) | `src/game/systems/createDustPuffs.ts` (unlit-material delta) | exact (template) |
| `src/game/systems/createBirdFlush.ts` | system/factory (pooled InstancedMesh) | event-driven (spawn) + frame update | `src/game/systems/createDustPuffs.ts` (externally-spawned) | exact (template) |
| `src/game/audio/createWildlifeSfx.ts` | audio (procedural one-shot on sfx bus) | event-driven | `src/game/audio/createAmbience.ts:119-138` (`birdChirp`) + `createAudioSystem.ts` guard/interface | role/logic-match |
| `src/game/createGame.ts` (MOD) | orchestrator/game loop | frame loop + bisect flags + spawn hook | self (dust wiring `:347-428`, `:1038-1039`, `:1511`, `:1680`) | in-place |

## Pattern Assignments

### `src/game/systems/wildlifeMath.ts` (utility, pure math) — NEW (WILD-01/02/03)

**Analog:** `src/game/systems/dayNightMath.ts` (imports `samplePalette` from it for the gate) + `windMath.ts` (purity discipline). Both are **ZERO-import-beyond-siblings, THREE-free, out-param, unit-tested** — the single source of truth for every math decision the three factories delegate to. This file carries ALL correctness risk and is test-first.

**Purity header + out-param + `as const` constant discipline to mirror** (`dayNightMath.ts:1-15`, `windMath.ts:1-9`):
- Zero THREE import (the only import is `samplePalette` from `./dayNightMath` for the gate).
- All tunables are exported `as const` bundles (`windMath.ts:18-28 SWAY`, `:36-48 GUST` precedent) — pinned by tests, never inline magic numbers.
- Every helper writes into a caller-owned scratch out-param and returns nothing (or a scalar) — the `dayNightMath.sunDir(phase, out)` / `buildSunBasis(dir, right, up)` zero-alloc precedent (`:284-341`).

**The day/dusk gate — reuse the shipped `fireflyLevel` channel (VERIFIED it exists):**
```typescript
// wildlifeMath.ts
import { samplePalette } from './dayNightMath';
export function isDayTime(phase: number): boolean { return samplePalette(phase).fireflyLevel < 0.01; }
export function fireflyLevelAt(phase: number): number { return samplePalette(phase).fireflyLevel; }
```
`fireflyLevel` is a real per-keyframe field, declared at `dayNightMath.ts:53-54` and set on every keyframe: `1` at deep-night `phase:0.0` (`:83`), `0` at dawn `0.12` (`:96`), `0` at day `0.3` (`:109`), `0` at midday `0.5` (`:122`), `1` at dusk `0.66` (`:135`), `1` at night `0.82` (`:148`); `samplePalette` smoothstep-blends it at `:233`. So `isDayTime` is true across the day band and false at dusk/night — the exact inverse the butterfly/firefly gates need.

**Closed-form math bodies (from RESEARCH Code Example 1, all out-param / scalar, zero-alloc):**
```typescript
export const WANDER = { a1: 0.6, f1: 0.9, a2: 0.25, f2: 2.3, bobAmp: 0.35, bobFreq: 1.1 } as const;
export const PULSE  = { rate: 1.6, floor: 0.15 } as const;
export const SPAWN  = { inner: 8, outer: 22, cull: 30 } as const;
export const BIRD   = { rise: 6, spread: 3, life: 1.4 } as const;
export const FLUSH_COOLDOWN_SEC = 6;

export function butterflyWander(t: number, seed: number, out: { x: number; z: number }): void { /* two summed sines/axis */ }
export function butterflyBob(t: number, seed: number): number { /* slow vertical sine */ }
export function fireflyPulse(t: number, phaseOffset: number): number { /* [floor,1], decorrelated */ }
export function birdArc(t01: number, out: { y: number; spread: number; visible: number }): void { /* ease-out rise + fade */ }
export function inSpawnRing(dx: number, dz: number): boolean { /* [inner²,outer²] */ }
export function beyondCull(dx: number, dz: number): boolean { /* > cull² */ }
export function flushReady(lastSec: number, nowSec: number): boolean { return nowSec - lastSec >= FLUSH_COOLDOWN_SEC; }
```
All are pure functions of `t = wind.timeUniform.value` / the day/night `phase` / the game clock — **no RNG, no allocation** (the `windMath` deterministic-by-construction rule, `windMath.ts:6-8`). Butterfly `out` is `{x,z}`; bird `out` is `{y,spread,visible}` — the factory owns a persistent scratch object and passes it every frame.

---

### `src/game/systems/__tests__/wildlifeMath.test.ts` (test) — NEW (WILD-01/02/03)

**Analog:** `src/game/systems/__tests__/windMath.test.ts` — `import { describe, expect, it } from 'vitest'` (`:1`), a named-import block of the whole pure surface (`:2-19`), then `describe`/`it` blocks that **pin BEHAVIOR, not exact numbers** (the `windMath.test.ts:22-24` comment: exact-value pins only for verbatim-extracted literals; everywhere else assert bounds/continuity/monotonicity).

**Assertions to write** (from RESEARCH §Validation Test Map, `12-RESEARCH.md:568-574`):
- `butterflyWander` bounded (`|x|,|z| ≤ a1+a2`), continuous, non-repeating over a simulated minute.
- `isDayTime` true at day keys (0.3, 0.5), false at dusk/night (0.66, 0.82, 0.0); `fireflyLevelAt` = 0 in day band, > 0 at dusk (0.66)/night (0.82).
- `inSpawnRing`/`beyondCull` boundary correctness at inner/outer/cull radii.
- `birdArc` — `y(0)=0`, monotonic ease-out rise to apex, `visible` fades to 0 by `t01=1`.
- `flushReady` — false within cooldown, true after, boundary exactly at `FLUSH_COOLDOWN_SEC`.
- `fireflyPulse` — range `[floor,1]`, periodic, phase-offset decorrelates two instances.

Run: `pnpm exec vitest run src/game/systems/__tests__/wildlifeMath.test.ts`.

---

### `src/game/systems/createButterflies.ts` (system/factory, pooled) — NEW (WILD-01)

**Analog:** `src/game/systems/createDustPuffs.ts` — the EXACT template (which is itself `createSmokeColumns` with deltas). Copy the pool spine verbatim; delegate all motion to `wildlifeMath`. Day-gated, sparse (`BUTTERFLY_POOL_SIZE ≈ 8`), spawn/cull ring over grass. `?nobugs` gates construction.

**Interface + hard-cap doc to mirror** (`createDustPuffs.ts:12-19`):
```typescript
export interface Butterflies {
  update(deltaSeconds: number, camera: THREE.Camera, playerX: number, playerZ: number, phase: number, t: number): void;
  dispose(): void;
}
export const BUTTERFLY_POOL_SIZE = 8;   // sparse: encounter = event, not wallpaper (D discretion)
```
Unlike dust (externally `spawn()`ed by the player), butterflies self-manage: `update()` culls (`beyondCull`) + tops up (spawn a slot at a `surfaceAt(x,z)==='grass'` point in the ring when below target AND `isDayTime(phase)`), then drifts each live one. No public `spawn()`.

**InstancedMesh setup — copy the flags verbatim** (`createDustPuffs.ts:76-92`):
```typescript
const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial(), BUTTERFLY_POOL_SIZE);
mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
mesh.frustumCulled = false;
mesh.castShadow = false;
mesh.receiveShadow = false;
const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
for (let i = 0; i < BUTTERFLY_POOL_SIZE; i += 1) { mesh.setMatrixAt(i, zeroMatrix); mesh.setColorAt(i, baseColor); }
mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
scene.add(mesh);   // scene ROOT, never the frozen world group
```
(`PlaneGeometry` for a butterfly silhouette + billboard per the Shared Pattern below; a `BoxGeometry` voxel with yaw-only spin like dust is the acceptable no-billboard fallback — discretion.)

**Closure-level scratch — the zero-alloc discipline, copy verbatim** (`createDustPuffs.ts:94-99`):
```typescript
const scratchMatrix = new THREE.Matrix4();
const scratchPosition = new THREE.Vector3();
const scratchScale = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();   // reused as the shared billboard quat
const wanderScratch = { x: 0, z: 0 };               // wildlifeMath out-param, built ONCE
```
Never `new Matrix4()`/`new Vector3()`/`{x,z}` literal inside `update()` — the documented 144→20fps cliff class (`createDustPuffs.ts:94` comment).

**Slot-claim (hard cap)** (`createDustPuffs.ts:102-110`): the `for` scan for the first `!pool[i].active`, `return` when full. **Age/move/recycle loop + `needsUpdate` gating** (`:130-177`): the `matrixDirty`/`colorDirty` flags, `scratchMatrix.compose(pos, quat, scale)` → `setMatrixAt`, and only set `mesh.instanceMatrix.needsUpdate = true` when actually dirty. Butterfly delta: position = `anchor + butterflyWander(t, seed, wanderScratch) + butterflyBob(t, seed)` on `groundY`; cull by `beyondCull(px - anchorX, pz - anchorZ)`; `Math.random()` for anchor placement + seed is fine (cosmetic — `:113` precedent). Recheck spawn on a ~0.5s timer (the `createSmokeColumns` `CULL_RECHECK_INTERVAL` precedent) to avoid a per-frame ring scan.

**dispose()** (`createDustPuffs.ts:179-186`): copy verbatim — `scene.remove`, geometry/material dispose, then `mesh.dispose()` (releases the instance GPU buffers).

---

### `src/game/systems/createFireflies.ts` (system/factory, pooled) — NEW (WILD-03)

**Analog:** `src/game/systems/createDustPuffs.ts` — same pool spine, with ONE material delta and a color-pulse loop. Dusk/night-gated (`FIREFLY_POOL_SIZE ≈ 32`), NO lights. `?nofireflies` gates construction.

**The critical delta — `MeshBasicMaterial`, NOT `MeshLambertMaterial`** (contrast `createDustPuffs.ts:74-80`):
```typescript
// Dust uses Lambert BECAUSE it should dim with the night scene (:74). Fireflies are the
// OPPOSITE intent: unlit so they stay bright while Phase 9 dims every lit material.
const material = new THREE.MeshBasicMaterial();   // unlit → glows against the dark palette
```
Everything else in the InstancedMesh setup (`DynamicDrawUsage`, `frustumCulled=false`, `castShadow/receiveShadow=false`, `zeroMatrix` seed loop, `setColorAt(i, base)` seed, `instanceColor.setUsage`, `scene.add`) is copied verbatim from `createDustPuffs.ts:76-92`. **Never a `PointLight`** — the combat `lightPool` is size-4 combat-owned and a firefly light would recompile every lit material (RESEARCH Anti-Pattern; REQUIREMENTS Out-of-Scope).

**Per-instance brightness pulse via `instanceColor`** (mirrors the dust step-color `setColorAt` + `colorDirty` gate at `createDustPuffs.ts:161-164`, but continuous):
```typescript
// update(dt, camera, playerX, playerZ, phase, t) — dusk/night ONLY:
const level = fireflyLevelAt(phase);
if (level <= 0) { /* collapse all slots to zeroMatrix once, skip the body — clean day no-op */ }
// per live firefly:
scratchColor.copy(BASE_HUE).multiplyScalar(fireflyPulse(t, inst.phaseOffset));
mesh.setColorAt(i, scratchColor); colorDirty = true;   // seed a persistent scratchColor ONCE
```
Seed `setColorAt(i, base)` for EVERY slot at build + `instanceColor.needsUpdate` on any pulse change (RESEARCH Pitfall 6 — un-seeded `instanceColor` renders white/no-pulse). Position: a low-amplitude summed-sine drift (reuse `butterflyWander` with smaller anchors) hovering ~0.5–1.5 above `groundY` over grass near the player. Gate = `fireflyLevelAt(phase) > 0`; optionally scale the count of LIT fireflies by `level` for a dusk fade-in (discretion, RESEARCH Open Q3). `dispose()` copies `createDustPuffs.ts:179-186` verbatim.

---

### `src/game/systems/createBirdFlush.ts` (system/factory, pooled, externally spawned) — NEW (WILD-02)

**Analog:** `src/game/systems/createDustPuffs.ts` — the **externally-spawned** variant is the closest fit (dust also exposes `spawn()` and only ages the pool in `update()`). Copy the spine; the arc math delegates to `wildlifeMath.birdArc`. `?nobirds` gates construction.

**Interface — mirror dust's `spawn()` + `update()` split** (`createDustPuffs.ts:12-16`):
```typescript
export interface BirdFlush {
  spawn(x: number, z: number): void;                       // claims 2–4 slots, one flush
  update(deltaSeconds: number, camera: THREE.Camera): void;// ages the arc, despawns at t01>=1
  dispose(): void;
}
export const BIRD_POOL_SIZE = 12;   // ~3 flushes of 2–4 in flight at once (D discretion)
```

**`spawn(x,z)` — the slot-claim scan, copied from dust** (`createDustPuffs.ts:102-126`): a `Math.random()` count of 2–4 birds (cosmetic non-determinism is fine — `:113` precedent), each claiming the first `!active` slot, given a random outward heading + `age=0` + a per-bird `groundY = getGroundHeight(x,z)`. Return early when the pool is full (the `slot === -1` guard, `:110`).

**`update()` — age/arc/recycle, mirrors dust's loop** (`createDustPuffs.ts:130-177`):
```typescript
bird.age += deltaSeconds;
const t01 = bird.age / BIRD.life;
if (t01 >= 1) { bird.active = false; mesh.setMatrixAt(i, zeroMatrix); matrixDirty = true; continue; }
birdArc(t01, arcScratch);   // arcScratch built ONCE at closure scope
// position = spawn + heading*arcScratch.spread, y = groundY + arcScratch.y; scale/fade by arcScratch.visible
scratchMatrix.compose(scratchPosition.set(...), sharedQuat, scratchScale.set(s, s, s));
mesh.setMatrixAt(i, scratchMatrix); matrixDirty = true;
```
Same `matrixDirty` gate + `mesh.instanceMatrix.needsUpdate` at loop end (`:176`). `PlaneGeometry` + billboard (silhouette matters for birds). `dispose()` copies `:179-186` verbatim. **Debounce lives at the call site** (`flushReady`), NOT here — `spawn()` is unconditional once called.

---

### `src/game/audio/createWildlifeSfx.ts` (audio, procedural one-shot) — NEW (WILD-02)

**Analog:** `src/game/audio/createAmbience.ts:119-138` (`birdChirp` — the procedural creature-synth voice) for the SOUND, and `createAudioSystem.ts:12-26` for the module SHAPE. It is a sibling of `createCombatAudio`/`createWeaponAudio`/`createMovementAudio`, all constructed with `(audioSystem.getContext, buses.sfx)` at `createGame.ts:465-471`.

**Module signature + gesture-unlock guard** (mirror `createAmbience.ts:109-112` `ready()` and the `createAudioSystem` gate):
```typescript
// createWildlifeSfx(getContext: () => AudioContext | null, getSfxBus: () => AudioNode)
export interface WildlifeSfx {
  playWingFlap(gain?: number, pan?: number): void;   // gain 0..1, pan -1..1 — the sibling-SFX convention
  dispose(): void;
}
function ready(): AudioContext | null {
  const context = getContext();
  return context && context.state === 'running' ? context : null;   // never throw mid-frame pre-unlock
}
```
This `ready()`/state-guard is the exact `createAmbience.ts:109-112` pattern — return silently until the context is unlocked; never throw in the frame path.

**The wing synth — mirror `birdChirp` but as an ON-DEMAND one-shot** (`createAmbience.ts:119-138`):
```typescript
// birdChirp shows the recipe: create osc/gain, schedule an envelope off ctx.currentTime,
// connect(out) where out = getSfxBus(), start/stop, and dispose on osc.onended (:134-137).
function playWingFlap(gain = 1, pan = 0): void {
  const ctx = ready(); if (!ctx) return;
  // 2–3 short filtered-noise "flap" transients (bandpass ~300–800Hz, ~40ms each, staggered) —
  // a wing-beat is broadband air, not tonal. Use createNoiseSource/panned from audioCore
  // (createAmbience.ts:7 import precedent). Route → getSfxBus().
}
```
`.onended` disconnect cleanup is mandatory (`createAmbience.ts:134-137`). Recording-fallback is optional and free later (the `createAmbience` `sampleCache.preload` pattern, `:116`) — synth-first ships now, an `.ogg` drops in with zero code change. `gain`/`pan` convention matches `AudioSystem` (`createAudioSystem.ts:10-11`).

---

### `src/game/createGame.ts` (MOD — wire 3 pools + wing sfx + flush hook + flags) — WILD-01/02/03

**Analog:** self — mirror the `dustPuffs` wiring exactly. `createGame.ts` is ~2,160 LOC (the worst offender) — keep ALL creature logic in the sibling factories + the twin; only WIRE here.

**MOD 1 — three `?no*` flags** (beside `dustEnabled` at `createGame.ts:350`, extend the comment at `:332-334`):
```typescript
const butterfliesEnabled = !perfFlags.has('nobugs');
const birdsEnabled = !perfFlags.has('nobirds');
const firefliesEnabled = !perfFlags.has('nofireflies');
```
Append `?nobugs / ?nobirds / ?nofireflies` to the kill-switch comment (`:332-334`, the shipped `?nodust`/`?nosmoke` convention).

**MOD 2 — conditional construction, after `dustPuffs`** (`createGame.ts:426-428`). Skip entirely when disabled (zero objects, clean FPS bisect — the `dustEnabled ? … : undefined` pattern):
```typescript
const butterflies = butterfliesEnabled ? createButterflies(scene, (x, z) => world.getGroundHeight(x, z)) : undefined;
const fireflies   = firefliesEnabled   ? createFireflies(scene, (x, z) => world.getGroundHeight(x, z))   : undefined;
const birdFlush   = birdsEnabled       ? createBirdFlush(scene, (x, z) => world.getGroundHeight(x, z))   : undefined;
```
Wing sfx beside the audio siblings (`createGame.ts:465-471`, after `pickupAudio`): `const wildlifeSfx = createWildlifeSfx(audioSystem.getContext, buses.sfx);`.

**MOD 3 — flush spawn at the grass stamp site** (`createGame.ts:1037-1040`, the `else` complement of the existing dust gate). `playerSurface` is already classified once at `:1037`; `elapsedSeconds` is the game clock (`:1452`):
```typescript
playerSurface = surfaceAt(playerPosition.x, playerPosition.z);   // :1037 — already here
if (playerSurface !== 'grass') {
  dustPuffs?.spawn(playerPosition.x, playerPosition.z, worldMoveX, worldMoveZ);   // existing :1039
} else if (birdFlush && flushReady(lastFlushSec, elapsedSeconds)) {   // NEW: the grass complement
  lastFlushSec = elapsedSeconds;
  birdFlush.spawn(playerPosition.x, playerPosition.z);
  wildlifeSfx?.playWingFlap(OWN_STEP_GAIN, 0);
}
```
This is the CPU `surface==='grass'` gate the walk-trail stamp already uses (`:1022-1040`) — **NEVER a GPU read** of the `groundInfluence` texture (the anti-pattern). Add a `let lastFlushSec = -Infinity;` closure var near the other player-loop state.

**MOD 4 — one `.update()` line each, after `dustPuffs?.update`** (`createGame.ts:1511`). `dayNightPhase` is already computed at `:1478`; `wind.timeUniform.value` is the shared clock advanced at `:1455`; `pixelRenderer.camera` is the fixed-yaw follow cam:
```typescript
dustPuffs?.update(deltaSeconds);   // existing :1511
butterflies?.update(deltaSeconds, pixelRenderer.camera, playerPosition.x, playerPosition.z, dayNightPhase, wind.timeUniform.value);
fireflies?.update(deltaSeconds, pixelRenderer.camera, playerPosition.x, playerPosition.z, dayNightPhase, wind.timeUniform.value);
birdFlush?.update(deltaSeconds, pixelRenderer.camera);
```

**MOD 5 — dispose, beside `dustPuffs?.dispose()`** (`createGame.ts:1680`):
```typescript
dustPuffs?.dispose();   // existing :1680
butterflies?.dispose(); fireflies?.dispose(); birdFlush?.dispose(); wildlifeSfx?.dispose();
```

---

## Shared Patterns

### Zero-per-frame-allocation (closure scratch, mutate in place)
**Source:** `createDustPuffs.ts:94-99` (`scratchMatrix`/`scratchPosition`/`scratchScale`/`scratchQuaternion`/`upAxis` constructed ONCE); `:167-172` (`scratchMatrix.compose(...)` reused every puff). `dayNightMath.ts:284,313` (out-param `sunDir`/`buildSunBasis`).
**Apply to:** all three factories (build `scratchMatrix`/`Vector3`/`Quaternion`/`Color` + a `wanderScratch`/`arcScratch` out-param object ONCE at closure scope) AND `wildlifeMath` (every helper is out-param or returns a scalar — never a fresh object/literal per call). The documented 144→20fps cliff class forbids `new Matrix4()`/`new Vector3()`/`new Color()`/`{x,z}` per frame (RESEARCH Pitfall 4).

### Pooled InstancedMesh spine (hard cap, slot recycle, needsUpdate gating, dispose)
**Source:** `createDustPuffs.ts:76-92` (mesh setup + flags), `:102-110` (slot-claim scan + full-pool guard), `:130-177` (age/recycle + `matrixDirty`/`colorDirty` gating), `:179-186` (`dispose()` ending in `mesh.dispose()` to free the instance GPU buffers).
**Apply to:** `createButterflies`, `createFireflies`, `createBirdFlush` — one `InstancedMesh` (one draw call) per creature type, `frustumCulled=false`, no shadows, added to `scene` root (NOT the frozen world group). Hard-cap every pool small so summed frame cost holds the SC4 gate (RESEARCH Pitfall 1).

### Cheap billboarding for the fixed-yaw follow cam (ONE shared quaternion)
**Source:** `CAMERA_YAW = Math.atan2(CAMERA_OFFSET.x, CAMERA_OFFSET.z)` — a module constant at `createGame.ts:283` (VERIFIED); the follow cam lerps only its position, keeping a constant look angle. The camera is already passed into renderers/`prewarmEntityModels` (`:448`).
**Apply to:** butterflies + birds — read `camera.quaternion` ONCE per frame into a closure scratch quat, reuse for every instance's `scratchMatrix.compose(pos, sharedQuat, scale)` (zero per-instance `lookAt`). Fireflies (tiny points) can skip billboarding. Voxel `BoxGeometry` + yaw-only spin (`setFromAxisAngle(upAxis, yaw)`, the `createDustPuffs.ts:169` precedent) is the no-billboard fallback (RESEARCH Pattern 5 / Open Q2).

### Shared clocks read inside frame() — never React (Pitfall-6 class)
**Source:** `createGame.ts:1455` (`wind.update(deltaSeconds)` — the ONLY clock advance), `:1478` (`dayNightPhase = phase01(serverClock.nowMicros())`), `:1471` (`wind.directionUniform.value` live ref).
**Apply to:** pass `dayNightPhase` + `wind.timeUniform.value` INTO each creature `update()` from `frame()` (MOD 4). Never derive the gate or the drift clock from a React render. `wind.timeUniform.value` is the shared drift clock (`createWind` names Phase-12 butterflies as an intended consumer); no wind-DIRECTION coupling is needed.

### Day/dusk/night gate via the existing `fireflyLevel` channel
**Source:** `dayNightMath.ts:53-54` (the `fireflyLevel` field decl, "Exposed for Phase 12, consumed by nothing here"); per-keyframe values `:83/96/109/122/135/148`; blended at `samplePalette` `:233`.
**Apply to:** `isDayTime(phase)` (butterflies, `fireflyLevel < 0.01`) and `fireflyLevelAt(phase) > 0` (fireflies) in `wildlifeMath`. This is the shipped, server-synced dusk/night channel — do NOT invent a new time-of-day check.

### Procedural-synth-first audio on the sfx bus, gesture-guarded
**Source:** `createAmbience.ts:109-112` (`ready()` state guard), `:119-138` (`birdChirp` synth recipe + `.onended` cleanup); `createAudioSystem.ts:10-26` (module shape, `gain`/`pan` convention); `createGame.ts:461-471` (siblings built with `(audioSystem.getContext, buses.sfx)`).
**Apply to:** `createWildlifeSfx(getContext, getSfxBus)` — synth-first `playWingFlap`, `ready()`-guarded (never throw mid-frame), recording-fallback ready via the `sampleCache` pattern with zero code change later.

### Perf-bisect kill-switch flag (skip construction entirely)
**Source:** `createGame.ts:347-350` (`smokeEnabled`/`dustEnabled`), `:421-428` (`enabled ? create… : undefined`).
**Apply to:** `?nobugs`/`?nobirds`/`?nofireflies` — each skips construction (zero objects, zero draw calls). Run the SC4 FPS gate with ALL on, then bisect: FPS recovering when a flag is added names the culprit.

## No Analog Found

None. Every file has a shipped in-repo precedent. Two pieces have no line-for-line twin but a clear template:

| Piece | Role | Why no exact analog | Guidance |
|-------|------|---------------------|----------|
| `createBirdFlush` scripted rising arc | system/factory | No existing pool animates a spawn-triggered ballistic arc (dust settles under gravity; smoke rises linearly) | `spawn()`/`update()` split copies `createDustPuffs`; the arc is pure `wildlifeMath.birdArc(t01)` (RESEARCH Pattern 3) — a rise is `1 - pow(1-t,2)`, zero-dep |
| `createWildlifeSfx.playWingFlap` | audio | `createAmbience.birdChirp` is a SCHEDULED-timer voice, not an on-demand one-shot; `createAudioSystem` one-shots are tonal attack SFX, not broadband wing air | On-demand one-shot = `birdChirp`'s synth body (`createAmbience.ts:119-138`) triggered on call, with the `AudioSystem` `(gain,pan)` signature + `ready()` guard |

## Metadata

**Analog search scope:** `src/game/systems/`, `src/game/systems/__tests__/`, `src/game/audio/`, `src/game/createGame.ts`, `.planning/REQUIREMENTS.md`
**Files scanned:** createDustPuffs.ts, createSmokeColumns.ts (via 11-PATTERNS + RESEARCH), dayNightMath.ts, windMath.ts, windMath.test.ts, createAmbience.ts, createAudioSystem.ts, createMovementAudio.ts, createGame.ts (flag block :330-358, construction :419-490, stamp site :1018-1041, frame order :1448-1511, dispose :1672-1690, CAMERA_YAW :282-283)
**Seams VERIFIED live this session:** `CAMERA_YAW` (`createGame.ts:283`), `fireflyLevel` day/dusk channel (`dayNightMath.ts:53-54`, per-keyframe :83/96/109/122/135/148, blended :233), grass stamp site + `surfaceAt` classify (`createGame.ts:1022-1040`), sfx-bus audio siblings (`createGame.ts:461-471`), frame update order (`:1508-1511`), dispose (`:1679-1680`)
**Pattern extraction date:** 2026-07-18
