---
phase: 12-wildlife
plan: 02
subsystem: rendering
tags: [wildlife, butterflies, instancedmesh, pool, day-gated, wind-clock, one-draw-call, WILD-01]

# Dependency graph
requires:
  - phase: 12-wildlife
    plan: 01
    provides: wildlifeMath pure twin (butterflyWander/butterflyBob/isDayTime/inSpawnRing/beyondCull + SPAWN tunables) this factory delegates ALL motion + gate + ring math to
  - phase: 11-ground-surfaces (surfaceAt)
    provides: surfaceAt CPU grass/dirt/path/town classifier — the spawn gate (no GPU read)
  - phase: dust/smoke pools
    provides: createDustPuffs pool spine (fixed pool + slot recycle + needsUpdate gating) copied as the template
provides:
  - createButterflies.ts render factory — sparse, day-gated butterfly InstancedMesh pool
  - Butterflies interface { update(dt, camera, playerX, playerZ, phase, t); dispose() } + BUTTERFLY_POOL_SIZE
  - self-managing spawn/cull-near-player at ONE draw call (no public spawn())
affects: [12-05, createGame]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Self-managing pooled InstancedMesh (createDustPuffs spine, no external spawn()): update() gates on day/night phase, culls beyondCull, tops up over grass on a slow recheck timer"
    - "All creature motion/gate/ring math delegated to the wildlifeMath pure twin — the render factory stays thin and holds only pool + THREE wiring"
    - "Shared billboard quaternion read once/frame + wildlifeMath out-param scratch built once at closure → zero per-frame allocation"

key-files:
  created:
    - src/game/systems/createButterflies.ts
    - src/game/systems/__tests__/createButterflies.test.ts
  modified: []

key-decisions:
  - "Night is a HARD despawn, not a slow drain: on a night recheck every active butterfly is force-culled so the pool collapses to empty — the plan's 'clean night no-op', deterministic and cheap"
  - "Top-up is gentle (MAX_SPAWNS_PER_RECHECK=2) with a bounded SPAWN_ATTEMPTS grass hunt — a fade-in over a few rechecks, never a per-frame ring scan and never an infinite loop when no grass is nearby"
  - "MeshLambertMaterial with DoubleSide: butterflies are a DAY creature and should read with the daytime scene light (dust precedent); DoubleSide so the billboarded plane is visible from both faces"
  - "PlaneGeometry billboarded via one shared camera quaternion (no per-instance lookAt); anchor holds position, wander/bob are pure offsets so a butterfly flutters around a fixed grass cell"

requirements-completed: [WILD-01]

coverage:
  - id: B1
    description: "One PlaneGeometry/MeshLambertMaterial InstancedMesh (one draw call) parented to scene root with pool flags (frustumCulled off, no shadows), count == BUTTERFLY_POOL_SIZE"
    requirement: WILD-01
    verification:
      - kind: unit
        ref: "src/game/systems/__tests__/createButterflies.test.ts#parents a billboarded, lit InstancedMesh to the scene root with pool flags"
        status: pass
    human_judgment: false
  - id: B2
    description: "Self-managing — exposes no public spawn()"
    requirement: WILD-01
    verification:
      - kind: unit
        ref: "src/game/systems/__tests__/createButterflies.test.ts#is self-managing — exposes no public spawn()"
        status: pass
    human_judgment: false
  - id: B3
    description: "Day + grass → butterflies spawn over the SPAWN ring; hard-capped at BUTTERFLY_POOL_SIZE, pool never grows"
    requirement: WILD-01
    verification:
      - kind: unit
        ref: "src/game/systems/__tests__/createButterflies.test.ts#spawns butterflies over grass during the day / hard-caps live butterflies"
        status: pass
    human_judgment: false
  - id: B4
    description: "Night → no spawns (clean no-op); day-to-night empties the pool"
    requirement: WILD-01
    verification:
      - kind: unit
        ref: "src/game/systems/__tests__/createButterflies.test.ts#spawns none at night / empties the pool when day turns to night"
        status: pass
    human_judgment: false
  - id: B5
    description: "Culls butterflies past SPAWN.cull and re-anchors around a moved player"
    requirement: WILD-01
    verification:
      - kind: unit
        ref: "src/game/systems/__tests__/createButterflies.test.ts#culls butterflies past the cull radius and re-anchors around the moved player"
        status: pass
    human_judgment: false
  - id: B6
    description: "dispose() removes the mesh from the scene and frees GPU buffers without throwing"
    requirement: WILD-01
    verification:
      - kind: unit
        ref: "src/game/systems/__tests__/createButterflies.test.ts#removes the mesh from the scene on dispose without throwing"
        status: pass
    human_judgment: false
  - id: B7
    description: "Zero per-frame allocation + one draw call + no GPU readback + no scene light (client-perf rules)"
    requirement: WILD-01
    verification:
      - kind: static
        ref: "grep: new THREE.InstancedMesh == 1; readPixels/PointLight/DirectionalLight/SpotLight == 0; all THREE scratch at closure/build scope, none inside update()"
        status: pass
      - kind: human
        ref: "SC4 FPS gate — 12-05 Task 3 (deferred UAT)"
        status: deferred
    human_judgment: true

# Metrics
duration: 4min
completed: 2026-07-18
status: complete
---

# Phase 12 Plan 02: Butterfly Render Factory Summary

**A sparse, day-gated `createButterflies.ts` — one billboarded InstancedMesh (one draw call) that self-manages a hard-capped pool of fluttering butterflies over grass near the player, culling past SPAWN.cull, emptying at dusk, and delegating every motion/gate/ring decision to the tested wildlifeMath twin at zero per-frame allocation.**

## Performance
- **Duration:** ~4 min
- **Tasks:** 1 completed (TDD: RED → GREEN)
- **Files modified:** 2 created (1 factory + 1 test); 0 existing files touched (additive)

## Accomplishments
- Created `createButterflies.ts` on the `createDustPuffs` pool spine (fixed pool + slot recycle → flat frame cost, unbounded growth impossible), but self-managing: no public `spawn()`, all lifecycle inside `update(dt, camera, playerX, playerZ, phase, t)`.
- Day gate via `isDayTime(phase)`: tops up only while day, over `surfaceAt(x,z)==='grass'` points in the `[SPAWN.inner, SPAWN.outer]` ring, on a ~0.5s recheck (the smoke-column `CULL_RECHECK_INTERVAL` precedent) — never a per-frame ring scan.
- `beyondCull` re-anchor: butterflies past the cull radius despawn and the pool re-populates around the moved player; a night recheck force-empties the pool (clean dusk/night no-op).
- Each live butterfly = anchor + `butterflyWander(t, seed, wanderScratch)` + `groundY` + `butterflyBob(t, seed)`, billboarded by one shared camera quaternion read once/frame — zero per-instance `lookAt`, zero per-frame heap allocation.
- Test-first: 8-case headless-THREE twin written RED (module missing), then implementation to GREEN. Full suite 867/867 green (was 859; +8 additive, no regression).

## Task Commits
1. **Task 1 (RED): failing butterfly pool test** — `96ef00f` (test)
2. **Task 1 (GREEN): sparse day-gated butterfly pool** — `8772d0d` (feat)

_TDD cycle: test (RED) → feat (GREEN). No refactor commit needed — clean on first GREEN (153 functional LOC, well under the 300 cap)._

## Files Created/Modified
- `src/game/systems/createButterflies.ts` — the render factory: one `PlaneGeometry`/`MeshLambertMaterial(DoubleSide)` `InstancedMesh` (pool flags copied verbatim from dust), day-gated top-up over grass, `beyondCull` re-anchor, night force-empty, closure-scratch drift, `dispose()` ending in `mesh.dispose()`.
- `src/game/systems/__tests__/createButterflies.test.ts` — headless-THREE twin (mirrors `createDustPuffs.test.ts`): pool flags, no-`spawn()`, day spawn over grass, hard cap, night no-op, day→night empties, `beyondCull` re-anchor, dispose. Probed `surfaceAt` for an all-grass expanse (200,200)/(400,400) so the ring top-up is deterministic.

## Decisions Made
- **Night = hard despawn**, not a slow drain: on a night recheck every active butterfly is force-culled, so the pool collapses to empty deterministically — the plan's "clean night no-op" without waiting for the player to walk away.
- **Gentle top-up** (`MAX_SPAWNS_PER_RECHECK=2`) with a bounded `SPAWN_ATTEMPTS` grass hunt: a few-recheck fade-in, and a guaranteed exit when no grass is nearby (no infinite ring hunt on pavement/road).
- **Lambert + DoubleSide**: butterflies are a day creature (should read with the daytime scene light, dust precedent); DoubleSide so the billboarded plane is visible from either face.

## Deviations from Plan
None — plan executed exactly as written. The `createDustPuffs` pool spine (mesh flags, closure scratch, slot-claim scan, `needsUpdate` gating, `dispose()`) was copied verbatim with the documented butterfly deltas (no velocity, day gate, self-managing top-up, wander/bob motion, shared billboard quat).

## Issues Encountered
None.

## User Setup Required
None — pure client-side cosmetic render module; not yet wired into `createGame` (wiring + `?nobugs` bisect flag + SC4 FPS gate land in 12-05).

## Known Stubs
None. The factory is fully functional; only the `createGame` wiring and the human FPS/perceptual UAT are deferred to 12-05 (as the plan intends — this plan produces the factory, not its integration).

## Self-Check: PASSED
- FOUND: src/game/systems/createButterflies.ts
- FOUND: src/game/systems/__tests__/createButterflies.test.ts
- FOUND commit: 96ef00f (test RED)
- FOUND commit: 8772d0d (feat GREEN)
- `new THREE.InstancedMesh` == 1; readPixels/PointLight/DirectionalLight/SpotLight == 0; all THREE scratch at closure/build scope
- Full suite: 867/867 green; tsc --noEmit clean

## TDD Gate Compliance
- RED gate: `96ef00f` `test(12-02)` — twin failed with module missing (confirmed RED-OK).
- GREEN gate: `8772d0d` `feat(12-02)` — 8/8 twin cases pass, full suite green.
- REFACTOR gate: not required (clean on first GREEN).
