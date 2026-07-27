---
phase: 11-lived-in-props-wear
plan: 04
subsystem: rendering
tags: [three, instancedmesh, particle-pool, dust, performance, tdd]

# Dependency graph
requires:
  - phase: 11-lived-in-props-wear
    provides: createSmokeColumns pooled-InstancedMesh template (structure copied wholesale)
provides:
  - createDustPuffs factory — a ground-hugging, hard-capped (24) pooled dust InstancedMesh
  - DustPuffs interface (spawn(x,z,dirX,dirZ) / update(dt) / dispose()) for external player-driven emission
  - DUST_POOL_SIZE export for the pool-cap contract
affects: [11-08, dust, wear, createGame]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Externally-spawned pooled InstancedMesh (spawn() claims a slot; update() only ages the live pool) — unlike self-emitting smoke"
    - "Zero per-frame alloc: all Matrix4/Vector3/Quaternion scratch constructed once at closure scope"
    - "Opaque Lambert + stepped color-tier fade (never alpha) for the nearest-neighbor pixel filter"

key-files:
  created:
    - src/game/systems/createDustPuffs.ts
    - src/game/systems/__tests__/createDustPuffs.test.ts
  modified: []

key-decisions:
  - "Physics model: low upward kick (RISE_SPEED*jitter) + GRAVITY settle clamped to spawn ground, plus a backward drift opposite movement dir with per-second drag — a puff, not a streak"
  - "PUFF_LIFE=0.5s, SIZE_TIERS=[0.18,0.14,0.10,0.06], DUST_TAN 0xc2a878 → DUST_FADE 0xd8cbb0 (discretion A4)"
  - "Per-puff groundY cached at spawn so update() never re-calls getGroundHeight (zero-alloc, no per-frame closure work)"

patterns-established:
  - "Player-driven pooled particle system: spawn() is the external emitter, update(dt) takes deltaSeconds only"

requirements-completed: [WEAR-05]

coverage:
  - id: D1
    description: "Ground-hugging pooled dust InstancedMesh with spawn/update/dispose, hard-capped at 24, zero per-frame allocation, opaque on scene root"
    requirement: WEAR-05
    verification:
      - kind: unit
        ref: "src/game/systems/__tests__/createDustPuffs.test.ts#hard-caps live puffs at DUST_POOL_SIZE when over-spawned"
        status: pass
      - kind: unit
        ref: "src/game/systems/__tests__/createDustPuffs.test.ts#expires puffs after their lifetime and recycles their slots"
        status: pass
      - kind: unit
        ref: "src/game/systems/__tests__/createDustPuffs.test.ts#parents an opaque, unlit-safe InstancedMesh to the scene root with pool flags"
        status: pass
    human_judgment: false

# Metrics
duration: 4min
completed: 2026-07-18
status: complete
---

# Phase 11 Plan 04: createDustPuffs Summary

**A hard-capped (24), zero-alloc, opaque ground-hugging dust pool — the phase's only new per-frame draw-call source — built as a copy-with-deltas of `createSmokeColumns` and behaviorally pinned, ready to wire in Plan 08.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-07-18T11:47:07Z
- **Completed:** 2026-07-18T11:51:10Z
- **Tasks:** 1
- **Files modified:** 2 (both created)

## Accomplishments
- `createDustPuffs(scene, getGroundHeight)` factory: a fixed 24-slot `InstancedMesh` pool of small opaque voxel puffs added to the scene ROOT (never the frozen world group).
- Externally-spawned model: `spawn(x, z, dirX, dirZ)` claims the first inactive slot (returning early when full — the hard cap), births the puff at ground height with a low upward kick and a small backward offset/drift opposite the movement direction. `update(deltaSeconds)` only ages, settles, recycles, and re-composes the already-live pool.
- Zero per-frame allocation: `scratchMatrix`/`scratchPosition`/`scratchScale`/`scratchQuaternion`/`upAxis` are constructed once at closure scope and reused every frame; `matrixDirty`/`colorDirty` gate `needsUpdate` (144→20fps cliff class avoided).
- Opaque `MeshLambertMaterial` with a precomputed stepped tan→pale fade palette (never alpha — alpha bands under the nearest-neighbor pixel filter); `frustumCulled=false`, `castShadow=false`, `receiveShadow=false`, `DynamicDrawUsage` on both instance buffers.

## Task Commits

Each task was committed atomically (TDD: test → feat):

1. **Task 1 (RED): failing pool-cap/expiry/dispose test** - `a03d649` (test)
2. **Task 1 (GREEN): createDustPuffs implementation** - `407d6c4` (feat)

_No refactor commit — implementation was clean on first green._

## Files Created/Modified
- `src/game/systems/createDustPuffs.ts` - Ground-hugging pooled dust `InstancedMesh` factory + `DustPuffs` interface + `DUST_POOL_SIZE` export.
- `src/game/systems/__tests__/createDustPuffs.test.ts` - Headless (no-WebGL) tests: hard cap ≤ 24, expiry/recycle, slot reuse, scene parenting + opaque material + pool flags, clean dispose.

## Decisions Made
- **Cache `groundY` per puff at spawn** rather than re-calling `getGroundHeight` in `update()` — keeps `update()` allocation-free and avoids per-puff-per-frame closure calls. The settle clamps `y` to this cached ground.
- **Backward drift with per-second drag** (`DRIFT_SPEED=0.55`, `DRIFT_DRAG=3.5`) so puffs ease outward opposite the step and stop, instead of streaking. Vertical uses `RISE_SPEED*jitter` up + `GRAVITY=5.0` settle within `PUFF_LIFE=0.5s`. Exact tuning is cosmetic discretion (plan A4); behavior tests don't pin the visuals.

## Deviations from Plan

None — plan executed exactly as written. One test-helper bug was fixed during the GREEN step (see Issues Encountered); it corrected the measurement, not the implementation, and did not change any behavioral assertion.

## Issues Encountered
- **THREE `Matrix4.decompose` returns scale 1 for a zero-scale matrix.** The RED test's `countLive` helper detected inactive slots via `decompose().scale.x`, but inactive slots (written as `makeScale(0,0,0)`) decompose to scale 1 in this THREE version even though their matrix elements are correctly all-zero. This made the over-spawn/expiry counts wrong. Fixed by reading the instance matrix's upper-3x3 block magnitude directly (a live puff's block is non-zero; a recycled slot's is all-zero). The implementation's zeroing was already correct — verified via an isolated roundtrip check.

## User Setup Required
None - client-only cosmetic render system, no external service configuration.

## Next Phase Readiness
- Ready for Plan 08 wiring. Signature is `createDustPuffs(scene, getGroundHeight)`; `spawn(x, z, dirX, dirZ)`; `update(deltaSeconds)` takes only dt (dust ages the already-spawned pool — spawning is external, gated by the caller on `isMoving && isGrounded() && surfaceAt !== 'grass'`, behind the `?nodust` flag).
- Full suite green (824 tests, 53 files); typecheck clean on the new file.

## Self-Check: PASSED
- FOUND: src/game/systems/createDustPuffs.ts
- FOUND: src/game/systems/__tests__/createDustPuffs.test.ts
- FOUND commit: a03d649 (test RED)
- FOUND commit: 407d6c4 (feat GREEN)

---
*Phase: 11-lived-in-props-wear*
*Completed: 2026-07-18*
