---
phase: 08-wind-core
plan: 11
subsystem: ui
tags: [three.js, glsl, shader, wind, flag, projectile, gap-closure]

# Dependency graph
requires:
  - phase: 08-10
    provides: gust-envelope-driven flag drape/droop wind pose (FLAG.drapeLift/drapeLiftGust in windMath.ts)
provides:
  - projectile->flag directional impulse pipeline (Gap 2 close, UAT round-2 test 4)
  - per-flag additive uImpulseDir/uImpulseMag uniforms on the pooled campFlag material
  - distance-gated world.disturbFlags(x,z,dirX,dirZ) + per-frame impulse decay
  - flagImpulse.ts pure decay/gate math (shared JS, unit-tested)
affects: [08-UAT round 3, wind-core]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-mesh uniform variation on a POOLED material via onBeforeRender (writes shared uniforms right before this mesh draws) — the sanctioned way to vary a uniform per-flag without a new material or cache-key churn"
    - "stampGround-mirror coupling: an optional callback wired into the projectile update loop pushes world influence (grass parting -> flag impulse) to distance-gated responders"

key-files:
  created:
    - src/game/world/assets/flagImpulse.ts
    - src/game/world/assets/__tests__/flagImpulse.test.ts
  modified:
    - src/game/world/assets/createCampFlag.ts
    - src/game/world/createMondstadtWorld.ts
    - src/game/systems/createEffectSystem.ts
    - src/game/createGame.ts

key-decisions:
  - "Impulse displacement applied POST-yaw so the kick reads as pure projectile travel direction, independent of the wind-driven yaw pose"
  - "Decay window (0.45s) + disturb radius (3.0) centralized in flagImpulse.ts as shared constants; IMPULSE_AMP (shader amplitude, 0.7) local to createCampFlag.ts — no drift, single source"
  - "Fresh kick overwrites (mag=1) rather than max-accumulates: the newest shot owns the flag pose — simpler and reads cleaner"

patterns-established:
  - "onBeforeRender per-mesh uniform writer on a pooled material (varies uImpulseDir/uImpulseMag per flag, cache key 'campFlag' intact)"
  - "Frozen-world collect-by-name + capture-world-xz-once, then distance-gate without walking the matrix (mirror of campfireLights)"

requirements-completed: [WIND-03]

coverage:
  - id: D1
    description: "Pure projectile-impulse math: magnitude-1 kick decays to 0 within the ~0.45s window and never goes negative; distance gate includes inside / excludes outside samples"
    requirement: WIND-03
    verification:
      - kind: unit
        ref: "src/game/world/assets/__tests__/flagImpulse.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Pooled 'campFlag' material + cache key + wind-scoped CR-01/CR-02 lifetime survive the additive per-flag impulse uniforms"
    requirement: WIND-03
    verification:
      - kind: unit
        ref: "src/game/world/assets/__tests__/windMaterialLifecycle.test.ts"
        status: pass
      - kind: unit
        ref: "src/game/world/assets/__tests__/assets.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "A projectile flying PAST a camp flag kicks the cloth in the shot's travel direction, then settles back to the wind pose within ~0.5s; distant flags do not react; kick sums on top of the 08-10 droop and under ?nowind"
    requirement: WIND-03
    verification: []
    human_judgment: true
    rationale: "Visual/feel truth — the direction-aligned snap, the settle, and the distance gate read are only verifiable by a human in UAT round 3; CI cannot assert cloth appearance"

# Metrics
duration: 8min
completed: 2026-07-14
status: complete
---

# Phase 08 Plan 11: Projectile → Flag Impulse (Gap 2) Summary

**A projectile flying past a camp flag now kicks the cloth in its travel direction and the flag settles back to the wind pose within ~0.45s — Gap 2 (UAT round-2 test 4) closed by mirroring the stampGround grass-parting coupling end to end, with additive per-flag uniforms on the untouched pooled campFlag material.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-14T11:46Z
- **Completed:** 2026-07-14T11:51Z
- **Tasks:** 3 completed
- **Files modified:** 4 modified, 2 created

## Accomplishments
- Closed Gap 2: projectiles now push a decaying, direction-aligned impulse to nearby camp flags (WIND-03), the reactive-world combat feel the UAT asked for.
- Added additive per-flag `uImpulseDir`/`uImpulseMag` uniforms to the pooled cloth material and varied them PER-FLAG via `onBeforeRender` — the pooled material, `customProgramCacheKey 'campFlag'`, and CR-01/CR-02 wind-scoped lifetime are all preserved (regression suites green).
- Only flags near an active projectile do work: `disturbFlags` is distance-gated (squared compare, no sqrt/alloc) and the decay loop skips flags at rest — the three.js CPU-overhead rule held.
- Pure impulse math (decay-to-0 window + distance gate) covered test-first in a zero-import `flagImpulse.ts`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Per-flag impulse uniforms + shader term + pure decay/gate math** — `f60cc2a` (feat)
2. **Task 2: Collect camp flags + distance-gated disturbFlags + impulse decay in world** — `97dc508` (feat)
3. **Task 3: Fire disturbFlags from the projectile loop + wire in createGame** — `d1786a1` (feat)

## Files Created/Modified
- `src/game/world/assets/flagImpulse.ts` (created) - Zero-import `decayFlagImpulse` + `withinDisturbRadius` + shared `FLAG_IMPULSE_DECAY_SECONDS`/`FLAG_DISTURB_RADIUS`/`FlagImpulse` type.
- `src/game/world/assets/__tests__/flagImpulse.test.ts` (created) - Pins the decay window and the distance gate (test-first).
- `src/game/world/assets/createCampFlag.ts` (modified) - `CAMP_FLAG_CLOTH_NAME`, module-level shared additive `uImpulseDir`/`uImpulseMag`, post-yaw local-frame displacement term (free end whips via along²), per-flag `userData.flagImpulse` + `onBeforeRender` writer.
- `src/game/world/createMondstadtWorld.ts` (modified) - Collect flag cloths by name + capture world xz once, `disturbFlags(x,z,dirX,dirZ)` on the world object, decay live impulses in `update()`.
- `src/game/systems/createEffectSystem.ts` (modified) - Optional `disturbFlags` callback fired beside `stampGround` in the alive/flying projectile branch with the normalized travel direction.
- `src/game/createGame.ts` (modified) - Closure passthrough wiring `world.disturbFlags` into `createEffectSystem`.

## Decisions Made
- **Impulse applied post-yaw** (in the cloth's local frame, projected from world dir via the same baked heading the yaw uses): the kick reads as pure shot direction, not rotated by the current wind yaw.
- **Decay/radius constants live in flagImpulse.ts** (shared by the world loop) while the shader amplitude `IMPULSE_AMP` stays local to createCampFlag.ts — single source, no CPU/GLSL drift, matching the windMath discipline.
- **Fresh kick overwrites** (`mag = 1`) rather than accumulating — the newest/nearest shot owns the flag pose; simpler, no clamp needed.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## Must-Have Truths — Status
- ✅ A projectile flying past a camp flag kicks the cloth aligned with travel direction, decaying back to the wind pose over ~0.45s (routed to human UAT round 3 for the visual read).
- ✅ Only flags near an active projectile do work: `disturbFlags` distance-gated; decay loop touches only live impulses; idle flags cost a single 3-float uniform write.
- ✅ Impulse is additive + per-flag: shared `uImpulseDir`/`uImpulseMag` written per-flag via `onBeforeRender` on the SAME pooled material; cache key, CR-01/CR-02 lifetime NOT regressed (windMaterialLifecycle + assets suites green).
- ✅ 08-10 wind pose preserved: impulse sums on top of drape/flap/yaw; wind uniforms stay exactly `uTime`/`uWindDir`/`uWindStrength`; `cloth.castShadow` stays false; frozen-matrix rule holds (onBeforeRender writes uniforms only).
- ✅ Coupling mirrors stampGround: `disturbFlags(x,z,dirX,dirZ)` wired into the projectile update loop beside the grass-parting call.
- ✅ Full test suite green (731 passed); pure impulse math (decay + gate) covered test-first.

## Verification
- `pnpm vitest run` — 47 files, 731 tests passed (incl. new flagImpulse, windMaterialLifecycle CR-01/CR-02, assets invariants).
- `pnpm build` — production bundle compiled clean (pre-existing chunk-size warning only).
- Human (UAT round 3): fire past a flag (directional kick + settle), fire far from flags (no reaction), confirm kick sums on the lull droop and under `?nowind`, and frame-feel unchanged in a projectile-heavy fight.

## Self-Check: PASSED
