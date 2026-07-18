# Phase 12: Wildlife - Research

**Researched:** 2026-07-18
**Domain:** three.js client rendering — three sparse instanced-quad creature systems (butterflies, flush birds, fireflies) on existing pooled-sprite + wind-clock + day/night + sfx-bus seams. Zero new deps, zero server work.
**Confidence:** HIGH (every claim grounded in in-repo source read this session; the pooled-InstancedMesh, day/night-gate, wind-clock, and sfx-bus seams all ship and are already wired into `createGame.frame()`)

## Summary

This is a **three-copies-of-an-existing-pattern** phase, not green-field. All three requirements are new *instanced-quad creature pools* built on the exact `createSmokeColumns` / `createDustPuffs` template (fixed `InstancedMesh`, closure-scratch zero-alloc, hard cap, slot recycle, `matrixDirty`/`colorDirty` gating, opaque stepped color — never alpha) that shipped in Phases 8 and 11. Each ties into a seam that already exists and is already advanced once per frame: the shared **wind clock** (`wind.timeUniform`, Phase 8) drives butterfly wander drift; the **day/night phase** (`dayNightMath.samplePalette(...).fireflyLevel`, Phase 9) gates butterflies to day and fireflies to dusk/night; the **CPU groundInfluence stamp site** in `updateLocalPlayer` (`createGame.ts:1022-1040`, where the player's grass-bend/walk trail is stamped) is the exact non-GPU trigger for the bird flush; and the **Phase-10 sfx bus** (`buses.sfx()` / `createAudioSystem` procedural-synth pattern) carries the wing one-shot with a synth-first fallback.

The real risk is **not** algorithmic — it is the client-performance cliff class documented in CLAUDE.md (the 144→20fps regression, and the 2026-07-18 un-instanced-geometry 24-30fps city regression). Three new per-frame systems mean three new draw calls (one `InstancedMesh` per creature type — mandatory) and three new update loops. Every one must be zero-alloc, GPU-readback-free, game-loop-owned (never React), pooled + hard-capped, and ship a `?no*` bisect flag (`?nobugs` / `?nobirds` / `?nofireflies`). Phase 12 SC4 is the **milestone-wide FPS gate**: `scripts/fps_playtest.py` in a golem-class fight with ALL ambiance (wind + daynight + audio + wear + wildlife) enabled — per-phase costs sum.

**One free architectural win:** the camera is a fixed-offset follow cam (`CAMERA_YAW` is a module constant at `createGame.ts:283`; the camera lerps *position* toward the player but `lookAt` keeps a constant angle). So billboarding costs a single shared quaternion read once per frame (or once at build) reused for every instance — **no per-instance `lookAt`/matrix churn**. And the pixel renderer is a plain render-to-low-res-target + blit with **no bloom / EffectComposer** (`createPixelRenderer.ts:54,74`), so firefly "glow" is a bright *unlit* `MeshBasicMaterial` quad with a per-instance brightness pulse — not additive blending (which bands under the nearest-neighbor filter, the smoke/dust lesson) and not a light.

**Primary recommendation:** Build one pure-math twin file (`wildlifeMath.ts`, THREE-free, vitest-twinned — mirrors `windMath.ts`/`dayNightMath.ts`) holding butterfly wander, firefly pulse, bird rising-arc, spawn-cull radius, day/dusk gate, and flush-debounce math. Then three thin sibling factories (`createButterflies.ts`, `createFireflies.ts`, `createBirdFlush.ts`) that copy the `createDustPuffs` pool discipline verbatim and delegate ALL math to the twin. Wire in `createGame` exactly like dust/smoke: construct after `dustPuffs` (`:426-428`), spawn the flush at the existing grass stamp site (`:1022-1040`), update once per frame after `dustPuffs?.update` (`:1511`), each behind its `?no*` flag. Wing one-shot: a small `createWildlifeSfx(getContext, buses.sfx)` with a synth `playWingFlap()`, mirroring the `createAmbience` creature-synth + recording-fallback pattern.

---

<user_constraints>
## Locked Contract (no CONTEXT.md — ROADMAP success criteria + WILD requirements + STATE are the design contract)

This phase was routed directly to planning (no `/gsd-discuss-phase`). Per the orchestrator, the ROADMAP Phase 12 success criteria and the WILD-01/02/03 requirements ARE the locked decisions — treat them as non-negotiable and fill only the technical + gray-area gaps.

### Locked Decisions (from ROADMAP SC + STATE accumulated context + CLAUDE.md)
- **Zero new dependencies** — `three@^0.185.1` built-ins only (+ Web Audio via existing buses). No noise/particle/tween packages. (STATE Decisions; CLAUDE.md pnpm-only.)
- **Zero server publishes** — client-only milestone. No reducers, no schema, no bindings.
- **Instancing is mandatory** — one `InstancedMesh` (one draw call) per creature type. The 2026-07-18 lesson: un-merged/un-instanced geometry caused a 24-30fps city regression.
- **No per-frame allocations; no GPU texture readbacks; game-loop-owned clocks (never React); pooled + hard-capped populations.** (The 144→20fps cliff class.)
- **Bird flush hooks the CPU `groundInfluence` STAMP site** where the player's grass-bend/walk trail is stamped (`surface==='grass'` + moving + grounded) — NEVER a GPU read of the influence texture.
- **Fireflies are emissive instanced quads, NEVER pooled lights.** The combat `lightPool` is size-4, combat-owned, never grown (D-07 / anti-pattern; REQUIREMENTS "Out of Scope": fireflies/lanterns as pooled runtime lights recompile all lit materials).
- **Every new per-frame system ships a `?no*` bisect flag** (`?nobugs` / `?nobirds` / `?nofireflies` or similar).
- **Butterflies are SPARSE** — "encounter = event, not wallpaper." Day-gated. Spawn/despawn near the player.
- **Reuse existing seams:** wind clock (Phase 8 `createWind`), day/night `fireflyLevel`/dusk gate (Phase 9 `dayNightMath`/`createDayNightCycle`), the Phase-10 sfx bus for the wing one-shot (`buses.sfx()` / `createAudioSystem` synth pattern), and the CPU `groundInfluence` stamp call site in `createGame` for the flush trigger.
- **Wildlife with real AI (pathfinding/flocking/persistence) is OUT OF SCOPE** (REQUIREMENTS: "CPU + complexity nobody inspects; violates no-alloc rules").

### Claude's Discretion (gray areas the planner/perceptual-UAT resolve)
- Exact population counts (butterfly sparse count, firefly swarm size, birds-per-flush 2–4), pool caps, spawn radii, cull radii.
- Quad look (size, color, texture-vs-flat, angled-vs-billboard), wander amplitudes/periods, pulse rate, arc height/duration, flush cooldown value.
- Whether the wing one-shot lives in a new `createWildlifeSfx` module vs an added `AudioSystem.playWingFlap` method (SRP call).
- Whether butterflies use a fixed shared billboard quaternion computed once at build vs re-read once per frame.

### Deferred / Out of Scope
- Weather (WTHR-01), time-of-day gameplay (TODG-01) — deferred milestone-wide.
- Real wildlife AI (flocking, pathfinding, persistence) — explicitly out of scope.
- Camera feel (Phase 13). Any new audio *design* beyond the wing one-shot (owned by the audio phase — reuse the seam only).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WILD-01 | Butterflies wander over grass patches by day — instanced quads, summed-sine/noise wander, sparse (encounter = event), spawn/despawn near player | New `createButterflies.ts` on the `createDustPuffs` pool template; day gate from `samplePalette(phase).fireflyLevel < ε` (or `isDayTime` twin); summed-sine wander on the shared `wind.timeUniform` clock; spawn-cull ring around the player over `surfaceAt(x,z)==='grass'` cells. §Architecture Pattern 1–2 |
| WILD-02 | Birds flush — sprinting through grass bursts 2–4 birds on a rising arc + wing one-shot, then despawn (hooked at the CPU groundInfluence stamp site, never the GPU texture) | New `createBirdFlush.ts` pool + `createWildlifeSfx.playWingFlap()`; triggered in `updateLocalPlayer` at the existing grass stamp site (`createGame.ts:1022-1040`) when `surface==='grass' && moving && grounded`, debounced by a cooldown; scripted `birdArc(t01)` rise then despawn. §Architecture Pattern 3 |
| WILD-03 | Fireflies at dusk/night — emissive instanced quads, randomized glow pulse phase; NO pooled runtime lights | New `createFireflies.ts` pool with unlit `MeshBasicMaterial` (bright regardless of night dimming) + per-instance `pulse(t, phaseOffset)` via `instanceColor` brightness; gated on `samplePalette(phase).fireflyLevel > 0` (dusk/night band). No `createLightPool` touch. §Architecture Pattern 4 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **≤300 LOC functional per file, no monolith.** `createGame.ts` is ~2,160 LOC (the worst offender) — keep ALL creature logic in sibling factories + the pure twin; only WIRE in `createGame` (flag, construct, spawn call, one update line, dispose). Each new factory is its own file under `systems/`; the wing synth is its own file under `audio/`.
- **No legacy / dead code.** Additive phase — nothing to delete. Do not leave commented tuning values; pin behavior in the twin's tests.
- **Client performance rules (the milestone's real risk).** No per-frame allocations (closure scratch, mutate in place); no GPU texture readbacks; game-loop-owned clocks (never React); pooled + hard-capped. The three creature pools are the only new per-frame draw-call sources.
- **Every new per-frame system ships a `?no*` bisect flag** (`?nobugs` / `?nobirds` / `?nofireflies`).
- **pnpm only**; test command `pnpm exec vitest run`. **SpacetimeDB rules apply to server work only** — this phase is client-only, zero publishes, zero reducers, zero schema.
- **No project skills** — `.claude/skills/` does not exist in this repo; no `rules/*.md` to load.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Butterfly wander math | Client / pure CPU (`wildlifeMath`) | — | Deterministic summed-sine on the shared wind clock; zero-THREE, unit-testable |
| Butterfly render | Client / one InstancedMesh draw | — | Sparse pool, day-gated, spawn/cull around player; billboard via shared quaternion |
| Firefly pulse math | Client / pure CPU (`wildlifeMath`) | — | Per-instance phase-offset sine; zero-THREE, unit-testable |
| Firefly render | Client / one InstancedMesh draw | — | Unlit bright quads (glow without a light); `instanceColor` brightness pulse; dusk/night-gated |
| Bird flush trigger | Client / per-frame CPU at the grass stamp site | — | Reads the SAME CPU `surface==='grass' && moving && grounded` signal the wear stamp uses — never the GPU texture |
| Bird rising-arc animation | Client / one InstancedMesh draw | Client / pure math (`birdArc`) | Scripted arc, no AI/pathfinding; pool despawns on arc completion |
| Wing one-shot | Client / Web Audio on the sfx bus | — | Procedural synth-first, recording-fallback (mirrors `createAmbience`); routed through `buses.sfx()` |
| Day/dusk/night gate | Client / pure CPU (`dayNightMath`) | — | `samplePalette(phase).fireflyLevel` already exists as the dusk/night channel |
| Wind-clock drift | Client / shared uniform read | — | `wind.timeUniform.value` — the ONE clock, already advanced at frame top |

**No tier misassignment risk:** every capability is client-side (client-only milestone). The one guard: keep the flush trigger on the **CPU** `surface` classification (`surfaceAt` / the existing grounded-grass gate), never a `readPixels`/render-target read of `groundInfluence` (a GPU readback stalls the pipeline — the documented anti-pattern).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| three | ^0.185.1 | `InstancedMesh` pools, `MeshLambertMaterial`/`MeshBasicMaterial`, `BoxGeometry`/`PlaneGeometry`, `Quaternion`/`Matrix4` scratch | Already the project's only 3D dependency; every seam in this phase is built on it [VERIFIED: package.json] |
| vitest | 3.2.4 | Pure-math twins for wander / pulse / arc / gate / debounce (WILD-01/02/03) | Established runner; every prior systems phase (`windMath.test.ts`, `dayNightMath.test.ts`, `groundInfluenceMath.test.ts`) uses it [VERIFIED: package.json] |

### Supporting
Zero new packages. All work reuses in-repo modules:
`systems/createSmokeColumns.ts`, `systems/createDustPuffs.ts` (pool templates), `systems/createWind.ts` + `systems/windMath.ts` (wind clock), `systems/dayNightMath.ts` + `systems/createDayNightCycle.ts` (day/dusk/night gate, `fireflyLevel`), `systems/surfaceAt.ts` (grass classification), `audio/createAudioSystem.ts` + `audio/createAudioBuses.ts` + `audio/createAmbience.ts` + `audio/audioCore.ts` (sfx bus + procedural-synth-with-recording-fallback pattern), `world/terrain.ts` (`meadowLushness`, `getTerrainHeight`, `ISLANDS`), `createGame.ts` (wiring: flags, construction, stamp site, frame order, dispose).

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `InstancedMesh` per creature type | `THREE.Sprite` per creature (like `createDamageNumbers`) | Rejected — a Sprite is one draw call *each*; sparse butterflies maybe survive it but a firefly swarm (24–40) would be 24–40 draw calls = the exact 2026-07-18 un-instanced regression |
| Per-instance billboard `lookAt` | Shared quaternion (camera is fixed-yaw) | Per-instance camera-facing recomputes 40 quaternions/frame for zero visible gain (fixed follow cam); use ONE shared quaternion |
| Additive/alpha "glow" for fireflies | Opaque bright `MeshBasicMaterial` + `instanceColor` pulse | Alpha bands under the nearest-neighbor pixel filter (smoke/dust lesson); no bloom pass exists to make additive pay off — bright unlit opaque quad reads as glow against the dark night palette |
| A new tween/easing dep for the bird arc | Pure `birdArc(t01)` closed form | Zero-dep rule; a rising-arc is 3 lines of `sin`/`pow` |
| Reading `groundInfluence` texture to detect "in grass" | The existing CPU `surface==='grass'` gate | GPU readback stalls the pipeline (anti-pattern); the CPU classification already exists at the stamp site |

**Installation:** None. `pnpm install` already satisfies all needs (repo uses pnpm — see MEMORY; `npm i` crashes on the symlink layout).

## Package Legitimacy Audit

**Not applicable — this phase installs zero external packages.** All code reuses existing in-repo modules + the already-present `three@^0.185.1` and `vitest@3.2.4`. No registry lookups, no new `package.json` entries. If the planner discovers a task that would add a dependency, that task is out of scope (zero-new-dependencies is a locked constraint) and must be flagged rather than executed.

## Architecture Patterns

### System Architecture Diagram

```
                    EXISTING SEAMS (advanced/owned elsewhere, read-only here)
  ┌──────────────────────────────────────────────────────────────────────────┐
  │ wind.timeUniform.value  ── shared wind clock (createGame.ts:1455)          │
  │ phase01(serverClock)    ── day/night phase (createGame.ts:1478)            │
  │ samplePalette(phase)    ── .fireflyLevel dusk/night gate (dayNightMath)    │
  │ surfaceAt(x,z)          ── 'grass'|'dirt'|'path'|'town' (systems/surfaceAt)│
  │ buses.sfx()             ── Phase-10 sfx bus (createGame.ts:461-469)        │
  │ world.getGroundHeight   ── analytic terrain height (no raycast)            │
  │ pixelRenderer.camera    ── fixed-yaw follow cam → ONE billboard quaternion │
  └──────────────────────────────────────────────────────────────────────────┘
            │                 │                    │                │
            ▼                 ▼                    ▼                ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │                  wildlifeMath.ts  (PURE, zero-THREE, vitest-twinned)       │
  │  butterflyWander(t,seed)  fireflyPulse(t,phase)  birdArc(t01)             │
  │  isDayTime(phase)/fireflyLevelAt(phase)  inSpawnRing(dx,dz)  flushReady()  │
  └──────────────────────────────────────────────────────────────────────────┘
       │                          │                          │
       ▼                          ▼                          ▼
  ┌───────────────┐        ┌───────────────┐         ┌────────────────────┐
  │ createButter- │        │ createFire-   │         │ createBirdFlush     │
  │ flies (Instan-│        │ flies (Instan-│         │ (InstancedMesh pool)│
  │ cedMesh pool) │        │ cedMesh pool) │         │  + spawn(x,z)       │
  │ DAY gate      │        │ DUSK/NIGHT    │         │ + createWildlifeSfx │
  │ spawn/cull    │        │ gate, pulse   │         │   .playWingFlap()   │
  │ near player   │        │ swarm, NO     │         │   → buses.sfx()     │
  │ over grass    │        │ LIGHTS        │         │                     │
  └───────────────┘        └───────────────┘         └────────────────────┘
       │                          │                          ▲
       │ update(dt, camera,       │ update(dt, camera,       │ spawn() called from
       │  playerX,Z, phase, t)    │  phase, t)               │ updateLocalPlayer at
       ▼                          ▼                          │ the grass stamp site
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  createGame.frame():  wind.update → daynight.update → ... →                │
  │    smokeColumns.update → dustPuffs.update                                  │
  │    → butterflies?.update(...) → fireflies?.update(...) → birdFlush?.update │
  │  updateLocalPlayer(): if(grounded && moving){ surface=surfaceAt(...);      │
  │    if(surface==='grass' && flushReady(...)) birdFlush?.spawn(px,pz) }      │
  └──────────────────────────────────────────────────────────────────────────┘
```

Component responsibilities (file → job):

| File | New/Modified | Responsibility |
|------|--------------|----------------|
| `systems/wildlifeMath.ts` | NEW | Pure twin: `butterflyWander`, `fireflyPulse`, `birdArc`, `isDayTime`/`fireflyLevelAt`, `inSpawnRing`, `flushReady` + tuning consts. Zero THREE. |
| `systems/__tests__/wildlifeMath.test.ts` | NEW | vitest: bounds, continuity, periodicity, gate boundaries, debounce, arc shape |
| `systems/createButterflies.ts` | NEW | Sparse InstancedMesh pool; day-gated; spawn/cull ring over grass; wander drift on wind clock (WILD-01) |
| `systems/createFireflies.ts` | NEW | InstancedMesh swarm; dusk/night-gated; unlit bright quads + per-instance pulse via `instanceColor`; NO lights (WILD-03) |
| `systems/createBirdFlush.ts` | NEW | InstancedMesh pool; `spawn(x,z)` 2–4 birds; scripted rising arc then despawn (WILD-02) |
| `audio/createWildlifeSfx.ts` | NEW | `playWingFlap(gain?, pan?)` synth-first (recording-fallback ready) on `buses.sfx()` (WILD-02) |
| `createGame.ts` | MOD | `?nobugs`/`?nobirds`/`?nofireflies` flags; construct 3 pools + wildlife sfx; flush `spawn()` at the grass stamp site; 3 `.update()` lines; 3 `dispose()` lines |

### Recommended Project Structure
```
src/game/
├── systems/
│   ├── wildlifeMath.ts              # NEW: pure twin (all creature math)
│   ├── createButterflies.ts         # NEW: WILD-01
│   ├── createFireflies.ts           # NEW: WILD-03
│   ├── createBirdFlush.ts           # NEW: WILD-02
│   └── __tests__/
│       └── wildlifeMath.test.ts     # NEW
├── audio/
│   └── createWildlifeSfx.ts         # NEW: wing one-shot (WILD-02)
└── createGame.ts                    # MOD: wire 3 pools + sfx + flush + flags
```

### Pattern 1: Instanced-quad creature pool (the `createDustPuffs` template, verbatim discipline)

**What:** A fixed-size `InstancedMesh`, hard-capped, slot-recycled, closure-scratch, `matrixDirty`/`colorDirty` needsUpdate-gated — the exact structure of `createDustPuffs.ts` (which is itself `createSmokeColumns.ts` with deltas). This is the single reusable spine for ALL THREE creature systems.

**Why it matters (the key insight):** The pool is the *only* thing standing between "sparse wildlife" and the 2026-07-18 un-instanced 24-30fps regression. One `InstancedMesh` = one draw call per creature type regardless of population. `frustumCulled = false` (the pool is small and near the player), `castShadow = false`/`receiveShadow = false` (no shadow-map cost), `DynamicDrawUsage` on both `instanceMatrix` and `instanceColor`.

**When to use:** all of WILD-01/02/03.

**The verbatim discipline to copy** (`createDustPuffs.ts:76-99`):
```typescript
// Source: createDustPuffs.ts:76-99 (itself the createSmokeColumns template)
const mesh = new THREE.InstancedMesh(geometry, material, POOL_SIZE);
mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
mesh.frustumCulled = false;
mesh.castShadow = false;
mesh.receiveShadow = false;
const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
for (let i = 0; i < POOL_SIZE; i += 1) {
  mesh.setMatrixAt(i, zeroMatrix);       // inactive slots collapse to a point
  mesh.setColorAt(i, fadeColors[0]);
}
mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
scene.add(mesh);                          // scene ROOT, never the frozen world group

// Closure-level scratch — zero per-frame allocations (the 144→20fps cliff class):
const scratchMatrix = new THREE.Matrix4();
const scratchPosition = new THREE.Vector3();
const scratchScale = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
```
Slot-claim (hard cap) copies `createDustPuffs.ts:102-110` (`for` scan for first `!pool[i].active`, `return` when full). Age/recycle + `needsUpdate` gating copies `:130-177`. `dispose()` copies `:179-186` verbatim (`scene.remove` → geometry/material dispose → **`mesh.dispose()`** which releases the instance GPU buffers — geometry/material alone don't). [VERIFIED: createDustPuffs.ts, createSmokeColumns.ts read this session]

**Geometry choice:** `PlaneGeometry(1,1)` (a flat quad — natural for a butterfly/firefly/bird silhouette) OR the smoke/dust `BoxGeometry(1,1,1)` voxel (matches the game's voxel art, no billboard needed at all if you accept a small angled cube). Discretion. If using a plane, billboard per Pattern 5.

### Pattern 2: Butterfly wander + spawn/cull ring (WILD-01)

**What:** A sparse pool (discretion, e.g. `BUTTERFLY_POOL_SIZE ≈ 8`) that keeps only a few butterflies alive within a ring around the player, over grass, by day. Each drifts on a **summed-sine wander** driven by the shared wind clock so they never stall and never need RNG per frame.

**Day gate:** butterflies show when it is NOT dusk/night. Reuse the day/night phase already computed at `createGame.ts:1478` (`dayNightPhase`) and a pure gate:
```typescript
// wildlifeMath.ts — day = the fireflyLevel-zero band (inverse of the firefly gate)
import { samplePalette } from './dayNightMath';  // or lerp only the one channel
export function isDayTime(phase: number): boolean {
  return samplePalette(phase).fireflyLevel < 0.01;  // day band per KEYFRAMES
}
```
(`fireflyLevel` is 0 across the day keys 0.12→0.50 and ramps at dusk 0.66 — see `dayNightMath.KEYFRAMES:85-136`. A lighter twin could lerp only that channel to avoid the full palette struct, but one struct/frame is acceptable — `createDayNightCycle` already samples it every frame.)

**Summed-sine wander (pure, deterministic, bounded):**
```typescript
// wildlifeMath.ts — per-butterfly drift offset from its wander anchor, on the wind clock.
// Two incommensurate sines per axis → an organic non-repeating flutter path within a
// bounded box (never runs off; no RNG per frame). `seed` decorrelates instances.
export const WANDER = { a1: 0.6, f1: 0.9, a2: 0.25, f2: 2.3 } as const;
export function butterflyWander(t: number, seed: number, out: { x: number; z: number }): void {
  out.x = WANDER.a1 * Math.sin(t * WANDER.f1 + seed) + WANDER.a2 * Math.sin(t * WANDER.f2 + seed * 1.7);
  out.z = WANDER.a1 * Math.cos(t * WANDER.f1 + seed * 1.3) + WANDER.a2 * Math.cos(t * WANDER.f2 + seed * 0.7);
}
// height bob: a slow vertical sine so they rise/dip over the grass (add to a base y).
```
The system holds a per-instance `anchorX/anchorZ` (the grass cell it wanders around) + `seed`; each frame it reads `t = wind.timeUniform.value`, calls `butterflyWander(t, seed, scratch)`, and sets position = anchor + offset + groundY. **No wind *direction* coupling needed** (butterflies aren't blown; they flutter) — but reading the wind *clock* keeps them on the one shared time source (STATE: `createWind` names Phase-12 butterflies as an intended consumer).

**Spawn/cull ring (pure test + closure state):**
```typescript
// wildlifeMath.ts
export const SPAWN = { inner: 8, outer: 22, cull: 30 } as const; // world units
export function inSpawnRing(dx: number, dz: number): boolean {
  const d2 = dx * dx + dz * dz;
  return d2 >= SPAWN.inner * SPAWN.inner && d2 <= SPAWN.outer * SPAWN.outer;
}
export function beyondCull(dx: number, dz: number): boolean {
  return dx * dx + dz * dz > SPAWN.cull * SPAWN.cull;
}
```
Each frame (or on a ~0.5s recheck timer like `createSmokeColumns`' `CULL_RECHECK_INTERVAL`, to avoid per-frame spawn scans): if the live count is below target AND it is day, pick a candidate point in the ring around the player, accept it only if `surfaceAt(x,z) === 'grass'` (reuse the shipped classifier — grass only, D-11 dust precedent inverted), and claim a slot. Cull any butterfly `beyondCull` (despawn = free the slot, collapse to zeroMatrix). This is the "sparse, spawn/despawn near player, over grass" contract with zero AI. [VERIFIED: surfaceAt.ts, createSmokeColumns.ts cull pattern read this session]

**Grass location:** grass exists where `surfaceAt==='grass'` (not town/road/path) on the walkable islands (`terrain.ts:ISLANDS`; `meadowLushness(x,z)` gives density if you want to bias spawns toward lush cells). `world.getGroundHeight(x,z)` gives the y (analytic, no raycast). [VERIFIED: terrain.ts:31-36,144-146 read this session]

### Pattern 3: Bird flush at the CPU stamp site (WILD-02)

**What:** When the player runs through grass, 2–4 birds burst up on a scripted rising arc and despawn, with a wing one-shot. The trigger is the **exact CPU site where the grass-bend/walk trail is stamped** — never a GPU read.

**The exact hook site** (`createGame.ts:1022-1040`, inside `updateLocalPlayer`, the `isMoving` block):
```typescript
// Source: createGame.ts:1022-1040 (the grass-bend stamp + surface classify, verbatim)
if (isGrounded()) {
  groundInfluence.stamp(playerPosition.x, playerPosition.z, 0.8, 1, worldMoveX, worldMoveZ, 0.03); // walk trail
  playerSurface = surfaceAt(playerPosition.x, playerPosition.z);   // ONE classify/frame (:1037)
  if (playerSurface !== 'grass') {
    dustPuffs?.spawn(playerPosition.x, playerPosition.z, worldMoveX, worldMoveZ);  // existing (dirt/path/town)
  }
  // ── ADD (WILD-02): the INVERSE surface — flush birds only when running through GRASS ──
  else if (birdFlush && flushReady(lastFlushSec, elapsedSeconds)) {
    lastFlushSec = elapsedSeconds;
    birdFlush.spawn(playerPosition.x, playerPosition.z);   // 2–4 birds, internal RNG count
    wildlifeSfx?.playWingFlap(OWN_STEP_GAIN, 0);           // wing one-shot on the sfx bus
  }
}
```
The `else` branch is free: `surface==='grass'` is the exact complement of the existing dust gate, computed once at `:1037`. This is the CPU classification the walk-trail stamp already uses — **no GPU texture read** (the D-12 / anti-pattern rule). [VERIFIED: createGame.ts:1022-1040 read this session]

**Debounce (pure, mandatory):** without it a bird bursts every frame you're in grass. A simple cooldown:
```typescript
// wildlifeMath.ts
export const FLUSH_COOLDOWN_SEC = 6;  // discretion — an "event", not a stream
export function flushReady(lastSec: number, nowSec: number): boolean {
  return nowSec - lastSec >= FLUSH_COOLDOWN_SEC;
}
```
Optionally require the player to have *entered* a fresh grass region (track last-flush position and require a min distance) so pacing back and forth doesn't re-flush — discretion; the cooldown alone satisfies the contract. `elapsedSeconds` is the game-loop clock already in scope (`createGame.ts:1452`).

**Scripted rising arc (pure):**
```typescript
// wildlifeMath.ts — per-bird flight over its life [0..1]: fast rise that eases out, fade near the end.
export const BIRD = { rise: 6, spread: 3, life: 1.4 } as const; // height units, lateral units, seconds
export function birdArc(t01: number, out: { y: number; out: number; visible: number }): void {
  const e = 1 - Math.pow(1 - t01, 2);       // ease-out rise (fast off the ground, slows at apex)
  out.y = BIRD.rise * e;                     // height above spawn ground
  out.out = BIRD.spread * t01;              // lateral scatter grows with time
  out.visible = t01 < 0.85 ? 1 : 1 - (t01 - 0.85) / 0.15; // fade the last 15% before despawn
}
```
`spawn(x,z)` claims 2–4 slots (`Math.random()` count — cosmetic, non-deterministic is fine, the smoke/dust precedent), each with a random outward heading + `age=0`; `update(dt)` advances `age`, computes `t01 = age/BIRD.life`, positions each bird at `spawnGround + birdArc` scattered on its heading, and frees the slot at `t01 >= 1`. Same slot/recycle discipline as the pool template.

**Wing one-shot (`createWildlifeSfx.ts`):** mirror the `createAmbience` creature-synth pattern (`createAmbience.ts:119-138` `birdChirp`) but as an **on-demand one-shot** (not a scheduled timer), routed through `buses.sfx()`. Synth: 2–3 short filtered-noise "flap" transients (bandpass ~300–800Hz, ~40ms each, staggered) — a wing-beat is broadband air, not tonal. Recording-fallback hook optional (drop-in `.ogg` later, zero code change — the `createAmbience` `sampleCache` pattern). The module takes `(getContext, getSfxBus)` exactly like `createCombatAudio`/`createWeaponAudio` (`createGame.ts:465-469`). Guard `if (!context || context.state !== 'running') return;` (the `createAudioSystem` pattern — never throw mid-frame before the gesture unlock). [VERIFIED: createAudioSystem.ts:84-92, createAmbience.ts:119-138, createGame.ts:461-469 read this session]

### Pattern 4: Fireflies — emissive quads, no lights (WILD-03)

**What:** A dusk/night swarm of small bright quads that pulse. "Emissive" here = **unlit `MeshBasicMaterial`** (renders at full color regardless of the dimmed night hemisphere/sun) so they glow against the dark palette — NOT a light, NOT additive blending.

**Why unlit-not-additive, unlit-not-a-light:**
- The pixel renderer has **no bloom / EffectComposer** (`createPixelRenderer.ts` is render-to-low-res + blit) — additive blending buys no bloom and *bands* under the nearest-neighbor filter (the smoke/dust opaque-only lesson, `createSmokeColumns.ts:81-82`). Use opaque `MeshBasicMaterial`.
- A firefly `PointLight` would flip the renderer's lights-state hash and **recompile every lit material** — the size-4 combat `lightPool` is never grown (STATE D-07; REQUIREMENTS Out-of-Scope explicitly bans fireflies-as-lights). `MeshBasicMaterial` ignores scene lights entirely, so it needs no light and never touches the pool.

**The material + pulse:**
```typescript
// createFireflies.ts — unlit so it stays bright while night dims Lambert materials.
const material = new THREE.MeshBasicMaterial();  // NOT Lambert (Lambert would dim at night)
// per-instance pulse via instanceColor brightness (a warm firefly hue scaled 0..1):
```
```typescript
// wildlifeMath.ts — per-instance glow 0..1 with a decorrelated phase so the swarm shimmers.
export const PULSE = { rate: 1.6, floor: 0.15 } as const;
export function fireflyPulse(t: number, phaseOffset: number): number {
  const s = 0.5 + 0.5 * Math.sin(t * PULSE.rate + phaseOffset); // [0,1]
  return PULSE.floor + (1 - PULSE.floor) * s;                    // never fully dark → readable
}
```
Each frame (dusk/night only): `t = wind.timeUniform.value` (or the day/night phase — either shared clock), for each active firefly write `scratchColor.copy(BASE_HUE).multiplyScalar(fireflyPulse(t, inst.phase))` → `setColorAt`, gate `colorDirty`. Position: a slow drift (small summed-sine like butterflies, lower amplitude) around anchors over grass near the player, hovering ~0.5–1.5 above ground. **Gate:** `samplePalette(phase).fireflyLevel > 0` (dusk 0.66 → night → dawn 0.12); when `fireflyLevel === 0` (day) collapse all slots to `zeroMatrix` and skip the update body (a clean day no-op). Scale the number of *lit* fireflies by `fireflyLevel` for a fade-in at dusk (discretion). Swarm size discretion (e.g. `FIREFLY_POOL_SIZE ≈ 32`). [VERIFIED: dayNightMath.ts:53-54,124-149; createPixelRenderer.ts:54,74 read this session]

### Pattern 5: Cheap billboarding for a fixed-yaw follow cam

**What:** Make the quads face the camera without per-instance `lookAt`.

**Why it's nearly free here:** `CAMERA_YAW` is a module constant (`createGame.ts:283`) and the follow cam lerps only its *position* toward the player, keeping a constant look angle (`createGame.ts:1390-1391`). So all instances share ONE billboard orientation.

**Recommended:** read the camera quaternion once per frame into a closure scratch and reuse it for every instance's `scratchMatrix.compose(pos, sharedQuat, scale)`:
```typescript
// update(deltaSeconds, camera, ...): read ONCE, reuse for all instances (zero per-instance alloc).
sharedQuat.copy(camera.quaternion);
// ...per instance:
scratchMatrix.compose(scratchPosition.set(x, y, z), sharedQuat, scratchScale.set(s, s, s));
```
Pass `pixelRenderer.camera` into each creature `update()` (the enemy/goliath renderers and `prewarmEntityModels` already receive the camera — precedent). **Simpler acceptable fallback (discretion):** use `BoxGeometry` voxel quads with the smoke/dust yaw-only spin (`setFromAxisAngle(upAxis, yaw)`) and skip camera-facing entirely — voxel cubes read fine from the fixed top-down angle and match the game's art (this is what smoke/dust do). Butterflies/birds probably want the billboard; fireflies (tiny points of light) do not care. [VERIFIED: createGame.ts:283,448,1390-1391; createSmokeColumns.ts:191 read this session]

### Anti-Patterns to Avoid
- **A `THREE.Sprite` or separate `Mesh` per creature.** One draw call each → the 2026-07-18 un-instanced 24-30fps regression. One `InstancedMesh` per type, always.
- **A `PointLight` on any firefly / bird / butterfly.** Recompiles every lit material; the light pool is combat-owned size-4 (D-07). Fireflies glow via unlit `MeshBasicMaterial`.
- **Additive or alpha-blended quads.** Band under the nearest-neighbor pixel filter (smoke/dust comment `createSmokeColumns.ts:81-82`). Opaque + brightness pulse via `instanceColor`.
- **Reading the `groundInfluence` render target to detect grass.** GPU readback stalls the pipeline. Use the CPU `surfaceAt(...)==='grass'` gate already computed at the stamp site.
- **Per-frame allocation in any `update()`/`spawn()`** (`new Matrix4/Vector3/Color/Quaternion`). Closure scratch, mutate in place — the documented cliff class.
- **Per-instance `camera.lookAt`/quaternion rebuild.** Fixed-yaw cam → one shared quaternion.
- **Flushing birds every frame.** Debounce with `flushReady` (a cooldown) — an "event," not a stream.
- **Deriving the day/dusk gate or the creature clock from a React render.** Read `wind.timeUniform.value` / `dayNightPhase` inside `frame()` only (the Pitfall-6 class).
- **Un-gated construction under the `?no*` flag.** Skip construction entirely when disabled (zero objects, clean FPS bisect — the `smokeColumns`/`dustPuffs` `enabled ? create... : undefined` pattern).
- **Adding the pools to the frozen world group.** Add to `scene` root (the smoke/dust precedent) — the world group is frozen (`matrixWorldAutoUpdate=false`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pooled particle/creature system | A fresh emitter/lifecycle | `createDustPuffs`/`createSmokeColumns` structure (pool, slot recycle, scratch, needsUpdate gating, dispose) | Zero-alloc pooling + hard cap already solved; unbounded growth is a documented time bomb |
| "What surface am I on / is this grass" | New mask or GPU read | `surfaceAt(x,z)` (already the one source of truth) | Pure, zero-alloc, CPU; already called once/frame at the stamp site |
| Ground height at a point | Mesh raycast | `world.getGroundHeight(x,z)` (analytic) | No raycasts, deterministic; every pool factory already receives it |
| Day / dusk / night gate | A new time-of-day check | `samplePalette(phase).fireflyLevel` (+ the shared `dayNightPhase` at `createGame.ts:1478`) | The dusk/night channel already exists and is server-synced |
| Creature drift clock | A private accumulator | `wind.timeUniform.value` (the ONE wind clock) | Advanced once at frame top; `createWind` names Phase-12 butterflies as an intended consumer |
| Wing sound | A new audio subsystem | `createWildlifeSfx(getContext, buses.sfx)` mirroring `createCombatAudio`/`createAmbience` synth + recording-fallback | The sfx bus + gesture-unlock + synth pattern already ship |
| Camera-facing quads | Per-instance `lookAt` | ONE shared quaternion from the fixed-yaw follow cam | The cam angle is constant; per-instance is pure waste |
| Easing/tween for the bird arc | A tween library | Pure `birdArc(t01)` closed form | Zero-dep rule; a rise is `1-pow(1-t,2)` |

**Key insight:** Every hard part (zero-alloc pooling, grass classification, ground height, day gate, shared clock, sfx bus) already ships and is already wired into `createGame.frame()`. The only genuinely new code is one pure-math twin + three thin pool factories that are `createDustPuffs` with different tuning + a ~40-line wing synth. Resist building anything resembling AI, flocking, or a new particle engine.

## Runtime State Inventory

Not a rename/refactor/migration phase — greenfield-additive on the client.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — verified: no datastore keys/IDs/collections touched (client-only, no reducers/schema) | none |
| Live service config | None — verified: no external service config (no n8n/Datadog/Tailscale/etc. surface) | none |
| OS-registered state | None — verified: no Task Scheduler/pm2/systemd/launchd registration | none |
| Secrets/env vars | None — verified: no SOPS keys, no `.env` names, no CI vars referenced | none |
| Build artifacts | None — verified: additive TS modules; no package rename, no egg-info/binary/image-tag | none |

**Nothing found in any category** — this phase adds pure functions, three pooled render systems, and one audio module; it renames nothing and touches no persistent/server/OS state.

## Common Pitfalls

### Pitfall 1: Summed frame cost fails SC4 even though each system looks cheap in isolation
**What goes wrong:** Butterflies + fireflies + birds each look fine alone, but with wind + daynight + audio + wear all live during a golem-class fight, `scripts/fps_playtest.py` regresses.
**Why it happens:** Three new draw calls + three update loops + the audio one-shots sum on top of Phases 8–11. SC4 is the milestone-wide gate, not a per-system one.
**How to avoid:** Hard-cap every pool small; skip construction under `?no*`; keep each `update()` a flat scan over its (small) pool with `needsUpdate` gating so an empty/day-only pool costs almost nothing. Run the gate with ALL flags on, then bisect with `?nobugs`/`?nobirds`/`?nofireflies`.
**Warning signs:** FPS recovers when a `?no*` flag is added — that flag names the culprit.

### Pitfall 2: Firefly quads go dark at night
**What goes wrong:** Fireflies dim into the night palette instead of glowing.
**Why it happens:** Using `MeshLambertMaterial` (like smoke/dust) — Lambert is lit, and Phase 9 dims lights at night.
**How to avoid:** `MeshBasicMaterial` (unlit) for fireflies specifically; brightness pulse via `instanceColor`. (Smoke/dust use Lambert *because* they should dim with the scene — the opposite intent.)
**Warning signs:** Fireflies invisible or muddy at `?time=0` (night).

### Pitfall 3: Birds flush every frame (a stream, not an event)
**What goes wrong:** Running through grass emits a continuous fountain of birds + a machine-gun of wing sounds.
**Why it happens:** No debounce on the per-frame grass gate.
**How to avoid:** `flushReady(lastFlushSec, elapsedSeconds)` cooldown (+ optional min-travel-distance). Store `lastFlushSec` in a closure, set it on spawn.
**Warning signs:** Birds visibly spawn at 60Hz; the wing synth overlaps into noise.

### Pitfall 4: Per-frame allocation in the wander/pulse path
**What goes wrong:** GC hitches; the 144→20fps cliff class returns.
**Why it happens:** `new Vector3()`/`new Color()`/`{x,z}` literal inside `update()`, or `butterflyWander` returning a fresh object.
**How to avoid:** Out-param scratch everywhere (`butterflyWander(t, seed, outScratch)`), closure-scope Color/Quaternion/Matrix4/Vector3 constructed once (the `dayNightMath.sunDir` out-param precedent + the smoke/dust scratch discipline).
**Warning signs:** Sawtooth FPS in the profiler; allocation spikes correlated with pool activity.

### Pitfall 5: Butterflies wandering onto roads/town/water or off the walkable island
**What goes wrong:** Butterflies flutter over pavement or the sea.
**Why it happens:** Spawning in the ring without the grass check, or letting the wander drift carry them arbitrarily far.
**How to avoid:** Gate spawn on `surfaceAt(x,z)==='grass'`; keep `WANDER` amplitudes small (bounded flutter box around the anchor) so a butterfly anchored on grass never drifts far enough to leave it; cull beyond `SPAWN.cull`. `world.getGroundHeight` for y keeps them on the terrain.
**Warning signs:** Butterflies over the plaza fountain or past the shoreline.

### Pitfall 6: Firefly `instanceColor` never initialized → default white / no pulse
**What goes wrong:** Fireflies render but don't pulse, or start white.
**Why it happens:** `instanceColor` buffer not seeded, or `needsUpdate` not set after the pulse write.
**How to avoid:** Seed `setColorAt(i, base)` for every slot at build (the dust `:87-88` pattern), `instanceColor.setUsage(DynamicDrawUsage)`, and set `instanceColor.needsUpdate = true` when any pulse value changed that frame (the `colorDirty` gate).

## Code Examples

### Example 1: `wildlifeMath.ts` skeleton (pure twin — the vitest-provable core)
```typescript
// systems/wildlifeMath.ts — ZERO imports beyond dayNightMath (mirror windMath/dayNightMath).
// Single source of truth for every creature math decision; deterministic, allocation-free
// (out-params), unit-testable without a renderer.
import { samplePalette } from './dayNightMath';

export const WANDER = { a1: 0.6, f1: 0.9, a2: 0.25, f2: 2.3, bobAmp: 0.35, bobFreq: 1.1 } as const;
export const PULSE = { rate: 1.6, floor: 0.15 } as const;
export const SPAWN = { inner: 8, outer: 22, cull: 30 } as const;
export const BIRD = { rise: 6, spread: 3, life: 1.4 } as const;
export const FLUSH_COOLDOWN_SEC = 6;

export function isDayTime(phase: number): boolean { return samplePalette(phase).fireflyLevel < 0.01; }
export function fireflyLevelAt(phase: number): number { return samplePalette(phase).fireflyLevel; }

export function butterflyWander(t: number, seed: number, out: { x: number; z: number }): void {
  out.x = WANDER.a1 * Math.sin(t * WANDER.f1 + seed) + WANDER.a2 * Math.sin(t * WANDER.f2 + seed * 1.7);
  out.z = WANDER.a1 * Math.cos(t * WANDER.f1 + seed * 1.3) + WANDER.a2 * Math.cos(t * WANDER.f2 + seed * 0.7);
}
export function butterflyBob(t: number, seed: number): number {
  return WANDER.bobAmp * Math.sin(t * WANDER.bobFreq + seed);
}
export function fireflyPulse(t: number, phaseOffset: number): number {
  const s = 0.5 + 0.5 * Math.sin(t * PULSE.rate + phaseOffset);
  return PULSE.floor + (1 - PULSE.floor) * s;
}
export function birdArc(t01: number, out: { y: number; spread: number; visible: number }): void {
  const e = 1 - Math.pow(1 - t01, 2);
  out.y = BIRD.rise * e;
  out.spread = BIRD.spread * t01;
  out.visible = t01 < 0.85 ? 1 : Math.max(0, 1 - (t01 - 0.85) / 0.15);
}
export function inSpawnRing(dx: number, dz: number): boolean {
  const d2 = dx * dx + dz * dz;
  return d2 >= SPAWN.inner * SPAWN.inner && d2 <= SPAWN.outer * SPAWN.outer;
}
export function beyondCull(dx: number, dz: number): boolean {
  return dx * dx + dz * dz > SPAWN.cull * SPAWN.cull;
}
export function flushReady(lastSec: number, nowSec: number): boolean {
  return nowSec - lastSec >= FLUSH_COOLDOWN_SEC;
}
```

### Example 2: `createGame` wiring deltas (mirror the smoke/dust wiring exactly)
```typescript
// Flags — extend the comment at createGame.ts:332-334 and add beside dustEnabled (:350):
const butterfliesEnabled = !perfFlags.has('nobugs');
const birdsEnabled = !perfFlags.has('nobirds');
const firefliesEnabled = !perfFlags.has('nofireflies');

// Construction — after dustPuffs (createGame.ts:426-428). Skip entirely when disabled.
const butterflies = butterfliesEnabled
  ? createButterflies(scene, (x, z) => world.getGroundHeight(x, z))
  : undefined;
const fireflies = firefliesEnabled
  ? createFireflies(scene, (x, z) => world.getGroundHeight(x, z))
  : undefined;
const birdFlush = birdsEnabled
  ? createBirdFlush(scene, (x, z) => world.getGroundHeight(x, z))
  : undefined;
const wildlifeSfx = createWildlifeSfx(audioSystem.getContext, buses.sfx); // beside :465-469

// Spawn — in updateLocalPlayer at the grass stamp site (createGame.ts:1037-1040 else branch, Pattern 3).

// Frame update — after dustPuffs?.update(deltaSeconds) at createGame.ts:1511:
butterflies?.update(deltaSeconds, pixelRenderer.camera, playerPosition.x, playerPosition.z, dayNightPhase, wind.timeUniform.value);
fireflies?.update(deltaSeconds, pixelRenderer.camera, playerPosition.x, playerPosition.z, dayNightPhase, wind.timeUniform.value);
birdFlush?.update(deltaSeconds, pixelRenderer.camera);
// (dayNightPhase already computed at :1478; wind.timeUniform.value is the shared clock advanced at :1455)

// Dispose — beside smokeColumns?.dispose() at createGame.ts:1679:
butterflies?.dispose(); fireflies?.dispose(); birdFlush?.dispose(); wildlifeSfx?.dispose();
```
[VERIFIED: createGame.ts flag block :332-358, construction :426-428, audio :461-469, stamp site :1022-1040, frame order :1455-1511, dispose :1679 read this session]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| World is static/creatureless between fights | Sparse instanced butterflies (day), flush birds (grass sprint), firefly swarm (dusk/night) | This phase (WILD-01/02/03) | The "encounter = event" living-world payoff, at one draw call per creature type |
| Un-merged/un-instanced geometry (city regression 2026-07-18) | Mandatory `InstancedMesh` per creature type | This phase (learned lesson) | One draw call regardless of population; no repeat of the 24-30fps regression |
| Emissive glow assumed to need bloom/additive | Unlit `MeshBasicMaterial` + `instanceColor` pulse | This phase | No bloom pass exists; additive bands under the pixel filter — bright unlit opaque reads as glow |

**Deprecated/outdated:** nothing removed — purely additive.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `MeshBasicMaterial` unlit fireflies read as "glow" against the night palette without bloom/additive | Pattern 4 | Low — perceptual; if too flat, raise base hue brightness or add a faint emissive-color pulse range. Confirmed no bloom pass exists |
| A2 | A single shared camera quaternion (fixed-yaw follow cam) billboards convincingly for all instances | Pattern 5 | Low — the cam angle is constant by construction; worst case fall back to voxel yaw-spin (smoke/dust) |
| A3 | Reading `samplePalette(phase)` once/frame per creature system for the gate is acceptable cost | Patterns 2,4 | Low — one struct alloc/frame each; `createDayNightCycle` already does it. If flagged, add a `fireflyLevelAt` that lerps only that channel, or read the value once in `frame()` and pass it in |
| A4 | Population/pool sizes (butterflies ~8, fireflies ~32, birds 2–4/flush) hit "sparse event" + "dusk swarm" | Patterns 1–4 | Low — Claude's-discretion tuning pinned by perceptual UAT + the FPS gate |
| A5 | `FLUSH_COOLDOWN_SEC ≈ 6` (± optional min-travel) reads as a startle event, not a stream | Pattern 3 | Low — discretion; tune in UAT |
| A6 | The synth wing-flap (staggered bandpass noise transients) reads as wings pre-recording | Pattern 3 | Low — mirrors the shipped `createAmbience` synth-first approach; recording drops in later with zero code change |
| A7 | `wind.timeUniform.value` is a suitable shared drift clock for butterflies/fireflies (no wind *direction* coupling needed) | Patterns 2,4 | Low — `createWind` explicitly names Phase-12 butterflies as a consumer; direction coupling is optional flavor |

**No assumption carries compliance/security/retention/performance-contract risk.** All are cosmetic tuning values pinned by perceptual UAT + the FPS gate.

## Open Questions

1. **Wing one-shot home — new module vs `AudioSystem` method?**
   - What we know: `createAudioSystem` owns the sfx-bus procedural-synth pattern; `createCombatAudio`/`createWeaponAudio`/`createMovementAudio` are siblings taking `(getContext, buses.sfx)`.
   - Recommendation: a small dedicated `createWildlifeSfx.ts` sibling (SRP + no-monolith; `createAudioSystem` is attack SFX). Trivial to fold into `AudioSystem` if the planner prefers fewer files.

2. **Billboard vs voxel quads per creature type.**
   - What we know: fixed-yaw cam makes billboarding nearly free; voxel cubes (smoke/dust) need no billboard and match the art.
   - Recommendation: billboard butterflies + birds (silhouette matters), voxel/no-billboard fireflies (tiny points). Discretion — perceptual UAT decides.

3. **Firefly gate: hard on/off at `fireflyLevel>0` vs scaling swarm size by `fireflyLevel`.**
   - Recommendation: scale the count of lit fireflies by `fireflyLevel` for a dusk fade-in (nicer), hard-collapse to zeroMatrix in full day. Discretion.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| three | all rendering | ✓ | ^0.185.1 | — |
| vitest | WILD-01/02/03 pure-math twins | ✓ | 3.2.4 | — |
| pnpm | install/test | ✓ (repo standard) | — | — |
| Python + `scripts/fps_playtest.py` | SC4 milestone FPS gate | ✓ (per MEMORY: combat-fps-playtest harness ships) | — | manual FPS observation |

**No external services, runtimes, or CLIs beyond the existing toolchain.** No SpacetimeDB server needed (client-only). No missing dependencies.

## Validation Architecture

> nyquist_validation is enabled (config.json `workflow.nyquist_validation: true`). Section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.2.4 |
| Config file | none dedicated — `scripts.test: "vitest run"` in package.json |
| Quick run command | `pnpm exec vitest run src/game/systems/__tests__/wildlifeMath.test.ts` |
| Full suite command | `pnpm exec vitest run` (`pnpm test`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WILD-01 | `butterflyWander` bounded (`|x|,|z| ≤ a1+a2`), C∞-continuous, non-repeating over a simulated minute | unit (pure) | `pnpm exec vitest run src/game/systems/__tests__/wildlifeMath.test.ts` | ❌ Wave 0 |
| WILD-01 | `isDayTime` true across day keys (0.3, 0.5), false at dusk/night (0.66, 0.82, 0.0) | unit (pure) | same | ❌ Wave 0 |
| WILD-01 | `inSpawnRing`/`beyondCull` boundary correctness (inner/outer/cull radii) | unit (pure) | same | ❌ Wave 0 |
| WILD-02 | `birdArc` — y(0)=0, monotonic ease-out rise to apex, `visible` fades to 0 by t01=1 | unit (pure) | same | ❌ Wave 0 |
| WILD-02 | `flushReady` — false within cooldown, true after; boundary at exactly `FLUSH_COOLDOWN_SEC` | unit (pure) | same | ❌ Wave 0 |
| WILD-03 | `fireflyPulse` — range `[floor,1]`, periodic, phase-offset decorrelates two instances | unit (pure) | same | ❌ Wave 0 |
| WILD-03 | `fireflyLevelAt` — 0 in day band, >0 at dusk (0.66)/night (0.82) | unit (pure) | same | ❌ Wave 0 |
| WILD-01/02/03 | Pool never exceeds hard cap under over-spawn (slot recycle) | unit (optional, factory-level, headless — needs a THREE stub) OR human | — | prefer perceptual + FPS |
| WILD-01 | Butterflies read as sparse/"event", over grass, by day | **human-verify only** | — (perceptual) | n/a |
| WILD-02 | Birds burst up on a believable arc + wing sound, then vanish; not a stream | **human-verify only** | — (perceptual, `?time=0.3` day) | n/a |
| WILD-03 | Fireflies glow + shimmer at dusk/night, absent by day; no light-pool change | **human-verify only** | — (perceptual, `?time=0.82` night; confirm no material-recompile hitch) | n/a |
| WILD-01/02/03 | **SC4 milestone FPS gate** — golem-class fight with ALL ambiance on holds frame rate | **FPS harness** | `scripts/fps_playtest.py` (+ `?nobugs`/`?nobirds`/`?nofireflies` bisect) | ✅ (per MEMORY) |

### Test-provable vs human-verify-only
- **Test-provable (pure math / deterministic):** all wander/pulse/arc/gate/ring/debounce math — the entire `wildlifeMath.ts` surface. This is the bulk of the correctness risk and MUST be unit-tested test-first (the `windMath`/`dayNightMath` discipline).
- **Human-verify-only (perceptual — no assertion captures "sparse feels like an event"/"reads as glow"/"believable flush"):** all three visual feels. UAT perceptual checks at `?time=` overrides for day (butterflies), night (fireflies).
- **Performance gate (not correctness):** SC4 — `scripts/fps_playtest.py` with everything on; `?no*` bisect isolates any regressor. This is the milestone-wide gate, run last.

### Sampling Rate
- **Per task commit:** `pnpm exec vitest run src/game/systems/__tests__/wildlifeMath.test.ts` (the touched twin).
- **Per wave merge:** `pnpm exec vitest run` (full suite green).
- **Phase gate:** full suite green + perceptual UAT (butterflies day / fireflies night / bird flush) + **SC4 FPS non-regression with ALL ambiance enabled** before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/game/systems/__tests__/wildlifeMath.test.ts` — bounds/continuity/gate/arc/pulse/ring/debounce — covers WILD-01/02/03 math (test-first).
- [ ] Framework install: none — vitest present.
- [ ] (No existing test breaks — additive phase; new files only.)

## Security Domain

> security_enforcement enabled (ASVS level 1). This is a **client-only, cosmetic** phase: no network, no auth, no user-input parsing, no persistence, no reducers, no new data surfaces.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth touched |
| V3 Session Management | no | No session touched |
| V4 Access Control | no | No access-control surface |
| V5 Input Validation | no | Only new external input is boolean `?nobugs`/`?nobirds`/`?nofireflies` presence flags (cosmetic kill-switches, matching the shipped `?no*` convention) |
| V6 Cryptography | no | None |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| URL query-flag tampering (`?nobugs` etc.) | Tampering | Boolean presence only; disables a cosmetic system — no privilege, no state change. No mitigation needed beyond the existing pattern |
| Client determinism divergence | — (not security) | Wildlife is purely cosmetic + player-local (spawn near the local player); no shared/authoritative state, so per-client variance is invisible and harmless |

**No security tasks required.** The only external inputs are cosmetic URL bisect flags matching the established `?no*` convention.

## Sources

### Primary (HIGH confidence — in-repo source read this session)
- `src/game/systems/createSmokeColumns.ts`, `createDustPuffs.ts` — the pooled `InstancedMesh` template (scratch discipline, hard cap, slot recycle, `needsUpdate` gating, opaque stepped fade, `dispose()` with `mesh.dispose()`, scene-root add).
- `src/game/systems/createWind.ts`, `windMath.ts` — the shared wind clock (`timeUniform`) + pure-twin discipline; names Phase-12 butterflies as an intended consumer.
- `src/game/systems/dayNightMath.ts` (`KEYFRAMES`, `samplePalette`, `fireflyLevel` channel, `sunDir` out-param zero-alloc precedent), `createDayNightCycle.ts` (per-frame palette sampling, zero-alloc scratch pattern).
- `src/game/systems/surfaceAt.ts` — the CPU grass/dirt/path/town classifier (the flush trigger + butterfly-spawn grass gate; no GPU read).
- `src/game/audio/createAudioSystem.ts` (procedural synth + gesture-unlock + `getSfxBus` guard pattern), `createAmbience.ts` (creature synth-first with recording fallback), `createAudioBuses`/`buses.sfx` wiring.
- `src/game/createGame.ts` — flag block (`:332-358`), system construction (`:360-429`, `:461-490`), the grass stamp site + surface classify (`:1022-1040`), frame update order (`:1448-1511`), dispose (`:1679`), `CAMERA_YAW` constant (`:283`), follow-cam lerp (`:1390-1391`), camera passed to renderers/prewarm.
- `src/game/engine/createPixelRenderer.ts` — PerspectiveCamera + blit pipeline, **no bloom/EffectComposer** (fireflies = unlit opaque).
- `src/game/world/terrain.ts` — `ISLANDS`, `meadowLushness`, `getTerrainHeight` (grass location + ground height).
- `package.json` / `.planning/config.json` — versions, nyquist/security toggles.
- `.planning/phases/09-atmosphere-day-night/09-PATTERNS.md`, `.planning/phases/11-lived-in-props-wear/11-RESEARCH.md` + `11-PATTERNS.md` — precedent triad (pure-twin + vitest, named-light discipline, frozen-matrix, zero-alloc, `?no*` flag, pooled-sprite template).
- `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md` — locked contract (SC + WILD reqs), accumulated decisions, out-of-scope bans.

### Secondary (MEDIUM confidence)
- None — every claim is grounded in the codebase read this session.

### Tertiary (LOW confidence)
- None. No web sources needed; the phase is fully grounded in the existing codebase + shipped precedents.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new deps; every seam read directly.
- Architecture: HIGH — all three systems map to the `createDustPuffs`/`createSmokeColumns` template with line-referenced deltas; every wiring point verified in `createGame.ts`.
- Pure-math design (wander/pulse/arc/gate/debounce): HIGH — closed forms, testable, mirror `windMath`/`dayNightMath`.
- Population/tuning constants: MEDIUM — behavior/structure verified; exact aesthetic values are discretion (Assumptions A1–A7), pinned by perceptual UAT + the FPS gate.
- Pitfalls: HIGH — unlit-vs-Lambert, additive-banding, GPU-readback ban, flush-debounce, and summed frame cost are all confirmed against source/comments/MEMORY.

**Research date:** 2026-07-18
**Valid until:** 2026-08-17 (stable — internal codebase, no fast-moving external deps)
