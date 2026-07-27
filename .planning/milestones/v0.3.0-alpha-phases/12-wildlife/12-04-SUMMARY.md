---
phase: 12-wildlife
plan: 04
subsystem: rendering
tags: [wildlife, fireflies, instanced-mesh, unlit, day-night, pooled, zero-alloc, vitest]

# Dependency graph
requires:
  - phase: 12-wildlife
    plan: 01
    provides: wildlifeMath.fireflyPulse / fireflyLevelAt / beyondCull / SPAWN (the pulse + dusk/night gate + ring)
  - phase: 09-atmosphere-day-night
    provides: dayNightMath.fireflyLevel channel (the dusk/night density gate, via wildlifeMath)
provides:
  - createFireflies.ts render factory (WILD-03) — one unlit InstancedMesh dusk/night swarm
  - FIREFLY_POOL_SIZE + Fireflies interface (update/dispose, self-managing, no public spawn)
affects: [12-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Unlit MeshBasicMaterial InstancedMesh for glow-that-survives-night-dimming (the critical delta from the Lambert dust/butterfly template)"
    - "Per-instance instanceColor brightness pulse (setColorAt + colorDirty gate) delegating to the tested wildlifeMath.fireflyPulse"
    - "Level-scaled pooled fade-in: target = ceil(POOL * fireflyLevel) drives a gentle dusk ramp and a clean day no-op"

key-files:
  created:
    - src/game/systems/createFireflies.ts
    - src/game/systems/__tests__/createFireflies.test.ts
  modified: []

key-decisions:
  - "UNLIT MeshBasicMaterial (not Lambert): fireflies must stay bright while Phase 9 dims every lit material at night — glow is an instanceColor brightness pulse, never a scene light (the size-4 lightPool is combat-owned; a firefly PointLight would recompile every lit material)"
  - "Dusk fade-in via level-scaled target (ceil(POOL * fireflyLevel)) with trim-down when the level rises: fewer fireflies at partial dusk, full swarm at night, empty by day"
  - "BoxGeometry voxel + identity quaternion — a firefly is a point, so no billboarding (zero per-instance lookAt); gentle low-amplitude (0.45x) read of the shared butterflyWander for drift"

requirements-completed: [WILD-03]

coverage:
  - id: F1
    description: "One UNLIT InstancedMesh on the scene root with pool flags; no MeshLambertMaterial; no scene light"
    requirement: WILD-03
    verification:
      - kind: unit
        ref: "src/game/systems/__tests__/createFireflies.test.ts#parents ONE unlit InstancedMesh / adds NO scene light"
        status: pass
      - kind: static
        ref: "grep: MeshBasicMaterial>=1 (3); MeshLambertMaterial==0; new THREE.InstancedMesh==1; PointLight/SpotLight/DirectionalLight/createLightPool==0; readPixels==0"
        status: pass
    human_judgment: false
  - id: F2
    description: "Dusk/night gate — empty in full day, level-scaled fade-in at dusk, full swarm at night; grass-only top-up in the SPAWN ring; beyondCull re-anchor"
    requirement: WILD-03
    verification:
      - kind: unit
        ref: "createFireflies.test.ts#spawns over grass at dusk/night / clean day no-op / empties night->day / fades in fewer at partial dusk / culls + re-anchors / hard-caps at FIREFLY_POOL_SIZE"
        status: pass
    human_judgment: false
  - id: F3
    description: "Per-firefly instanceColor brightness pulse (floored, decorrelated) via wildlifeMath.fireflyPulse; seeded at build"
    requirement: WILD-03
    verification:
      - kind: unit
        ref: "createFireflies.test.ts#pulses per-firefly brightness via instanceColor over time (max-min>0.1, min>0)"
        status: pass
    human_judgment: false
  - id: F4
    description: "Zero per-frame allocation; hard-capped pool; dispose frees the instance GPU buffers"
    requirement: WILD-03
    verification:
      - kind: static
        ref: "all THREE scratch (Matrix4/Vector3/Quaternion/Color) + wander out-param at closure/build scope, none inside update(); dispose ends in mesh.dispose()"
        status: pass
      - kind: human
        ref: "SC4 FPS gate + dusk glow/shimmer visual — 12-05 UAT (deferred)"
        status: deferred
    human_judgment: true

# Metrics
duration: 8min
completed: 2026-07-18
status: complete
---

# Phase 12 Plan 04: Firefly Render Factory Summary

**A dusk/night `createFireflies.ts` — one UNLIT `MeshBasicMaterial` InstancedMesh (one draw call) that self-manages a hard-capped swarm of tiny glowing voxels over grass near the player, pulsing each firefly's brightness via `instanceColor`, fading in with the shipped `fireflyLevel` channel and collapsing to a clean no-op by day — never adding a scene light, at zero per-frame allocation, delegating every pulse/gate/ring decision to the tested wildlifeMath twin.**

## Performance
- **Duration:** ~8 min
- **Tasks:** 1 completed (TDD: RED → GREEN)
- **Files modified:** 2 created (1 factory + 1 test); 0 existing files touched (additive)

## Accomplishments
- Created `createFireflies.ts` on the `createDustPuffs`/`createButterflies` pool spine (fixed pool + slot recycle → flat frame cost, unbounded growth impossible), self-managing: no public `spawn()`, all lifecycle inside `update(dt, camera, playerX, playerZ, phase, t)`.
- **The critical delta:** the InstancedMesh is built with a `THREE.MeshBasicMaterial` (UNLIT) instead of the dust/butterfly `MeshLambertMaterial` — fireflies must stay bright while Phase 9's day/night dims every lit material at night. "Glow" is a brightness pulse on `instanceColor`, not a scene light and not additive/alpha (bands under the pixel filter, no bloom pass).
- Dusk/night gate via `fireflyLevelAt(phase)`: `level <= 0` (day) collapses any lingering fireflies once and skips the body (clean day no-op); `level > 0` tops up over `surfaceAt(x,z)==='grass'` points in the `[SPAWN.inner, SPAWN.outer]` ring on a ~0.5s recheck (never a per-frame ring scan).
- Level-scaled fade-in: `target = ceil(FIREFLY_POOL_SIZE * level)` — fewer fireflies at partial dusk, full swarm (32) at night; trims down when the level rises and re-anchors past `beyondCull`.
- Each live firefly pulses `scratchColor.copy(baseHue).multiplyScalar(fireflyPulse(t, phaseOffset))` → `setColorAt` with a decorrelating per-instance `phaseOffset`, seeded for every slot at build (Pitfall 6 — un-seeded `instanceColor` renders white). Position is a gentle low-amplitude (0.45x) read of the shared `butterflyWander` + `butterflyBob`, hovering 0.5–1.5 above ground; a BoxGeometry voxel needs no billboarding.
- Zero per-frame heap allocation (closure-scope `Matrix4`/`Vector3`/`Quaternion`/`Color` + `{x,z}` out-param built once), no GPU readback, `dispose()` ending in `mesh.dispose()` to free the instance GPU buffers.
- Test-first: 11-case headless-THREE twin written RED (module missing), then implementation to GREEN. Full suite 884/884 green (was 873; +11 additive, no regression). 191 functional LOC, well under the 300 cap.

## Task Commits
Each step committed atomically:

1. **Task 1 (RED): failing firefly pool test** — `ca99174` (test)
2. **Task 1 (GREEN): dusk/night firefly swarm** — `06d5e57` (feat)

_TDD cycle: test (RED) → feat (GREEN). No refactor commit needed — clean on first GREEN (191 functional LOC)._

## Files Created/Modified
- `src/game/systems/createFireflies.ts` — the render factory: one `BoxGeometry`/`MeshBasicMaterial` (UNLIT) InstancedMesh (pool flags copied verbatim from dust/butterflies), `fireflyLevelAt` gate with level-scaled top-up over grass, `beyondCull` re-anchor, day force-empty, per-firefly `instanceColor` pulse via `fireflyPulse`, closure-scratch drift, `dispose()` ending in `mesh.dispose()`.
- `src/game/systems/__tests__/createFireflies.test.ts` — headless-THREE twin (mirrors `createButterflies.test.ts`): unlit-material + one-mesh + pool flags, no scene light, no-`spawn()`, dusk/night spawn over grass, hard cap, clean day no-op, night→day empties, partial-dusk fade-in < full-night, `instanceColor` pulse variation over a period, `beyondCull` re-anchor, dispose. Uses `DUSK_PARTIAL=0.58` (smoothstep-blends to `fireflyLevel ~0.5`) to pin the fade-in.

## Decisions Made
- **UNLIT MeshBasicMaterial (the one delta):** fireflies are the opposite intent from dust/butterflies (which are Lambert so they dim with the scene). Glow-that-survives-night-dimming is achieved by an unlit material + instanceColor pulse — never a light (the size-4 `lightPool` is combat-owned; a firefly `PointLight` would recompile every lit material) and never additive/alpha (the nearest-filtered pixel target bands, and there is no bloom pass).
- **Level-scaled fade-in with trim-down:** `target = ceil(POOL * fireflyLevel)` implements the RESEARCH Open-Q3 dusk fade-in for free on the existing top-up path, and trimming when the level rises keeps the swarm honest through a full dusk→night→dawn cycle.
- **No billboarding:** a firefly is a spark, not a silhouette, so a `BoxGeometry` voxel with an identity quaternion avoids any per-instance `lookAt` (the camera arg is accepted for interface parity with the sibling factories but unused).

## Deviations from Plan
None - plan executed exactly as written. The 12-PATTERNS `createFireflies` guidance (MeshBasicMaterial delta, instanceColor pulse loop, Pitfall-6 seeding, low-amplitude wander reuse, dusk fade-in) was implemented verbatim on the butterfly/dust pool spine.

## Issues Encountered
None.

## User Setup Required
None - pure client-side render factory; not yet wired into `createGame.ts` (that wiring + the `?nofireflies` kill-switch + SC4 FPS/visual UAT is 12-05's job, per the PATTERNS MOD list). No external service configuration required.

## Self-Check: PASSED
- FOUND: src/game/systems/createFireflies.ts
- FOUND: src/game/systems/__tests__/createFireflies.test.ts
- FOUND commit: ca99174 (test RED)
- FOUND commit: 06d5e57 (feat GREEN)
- Acceptance greps: MeshBasicMaterial=3 (>=1), MeshLambertMaterial=0, new THREE.InstancedMesh=1, lights-in-code=0, readPixels=0
- Full suite: 884/884 green

## TDD Gate Compliance
- RED gate: `ca99174` `test(12-04)` — twin failed with module missing (confirmed RED-OK).
- GREEN gate: `06d5e57` `feat(12-04)` — 11/11 firefly assertions pass, full suite green.
- REFACTOR gate: not required (clean on first GREEN).
