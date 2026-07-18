---
phase: 12-wildlife
plan: 01
subsystem: rendering
tags: [wildlife, pure-math, deterministic, three-free, vitest, day-night, wind-clock]

# Dependency graph
requires:
  - phase: 09-atmosphere-day-night
    provides: dayNightMath.samplePalette fireflyLevel channel (the day/dusk gate)
  - phase: 08-wind-core
    provides: shared wind clock convention the wander/pulse helpers read (t = wind.timeUniform.value)
provides:
  - wildlifeMath.ts pure THREE-free twin carrying ALL Wave-1 creature math
  - butterfly wander/bob, firefly pulse, bird rising-arc, spawn/cull ring, day gate, flush debounce
  - as-const tunable bundles (WANDER/PULSE/SPAWN/BIRD) + FLUSH_COOLDOWN_SEC single-sourced by the vitest twin
affects: [12-02, 12-03, 12-04, createButterflies, createFireflies, createBirdFlush]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure THREE-free math twin (windMath/dayNightMath discipline): deterministic, allocation-free out-params, vitest-twinned"
    - "Tunables live in exported `as const` bundles so tests single-source them and CPU math cannot drift from tuning"

key-files:
  created:
    - src/game/systems/wildlifeMath.ts
    - src/game/systems/__tests__/wildlifeMath.test.ts
  modified: []

key-decisions:
  - "isDayTime is the strict inverse of a lit firefly gate (fireflyLevel < 0.01), reusing the ONE shipped time-of-day channel — day and dusk can never disagree"
  - "Motion helpers are out-param mutators / scalar returns (zero per-call allocation), mirroring dayNightMath.sunDir"
  - "birdArc visibility holds at 1 until the last 15% of life, then fades linearly to 0 by t01=1"

patterns-established:
  - "Wave-0 pure-math twin concentrates a phase's correctness risk in one unit-testable module so Wave-1 render factories stay thin"

requirements-completed: [WILD-01, WILD-02, WILD-03]

coverage:
  - id: D1
    description: "Butterfly wander/bob math — bounded (|x|,|z| <= a1+a2), continuous, non-repeating flutter box on the wind clock"
    requirement: WILD-01
    verification:
      - kind: unit
        ref: "src/game/systems/__tests__/wildlifeMath.test.ts#butterflyWander (WILD-01 bounded, continuous, non-repeating flutter)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Day-vs-dusk gate — isDayTime true across day band, false at dusk/night; fireflyLevelAt >0 at dusk/night"
    requirement: WILD-01
    verification:
      - kind: unit
        ref: "src/game/systems/__tests__/wildlifeMath.test.ts#isDayTime / fireflyLevelAt (WILD-01/WILD-03 day-vs-dusk gate)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Spawn/cull annulus — inSpawnRing correct at inner/outer boundaries, beyondCull correct at cull radius"
    requirement: WILD-01
    verification:
      - kind: unit
        ref: "src/game/systems/__tests__/wildlifeMath.test.ts#inSpawnRing / beyondCull (WILD-01 spawn-cull annulus)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Bird rising-arc — y(0)=0, monotonic ease-out rise, visible fades to 0 by t01=1"
    requirement: WILD-02
    verification:
      - kind: unit
        ref: "src/game/systems/__tests__/wildlifeMath.test.ts#birdArc (WILD-02 scripted rising arc + fade)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Flush debounce — flushReady false within cooldown, true at/after FLUSH_COOLDOWN_SEC"
    requirement: WILD-02
    verification:
      - kind: unit
        ref: "src/game/systems/__tests__/wildlifeMath.test.ts#flushReady (WILD-02 flush debounce)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Firefly pulse — range [floor,1], periodic (2*PI/rate), phase-offset decorrelates two instances"
    requirement: WILD-03
    verification:
      - kind: unit
        ref: "src/game/systems/__tests__/wildlifeMath.test.ts#fireflyPulse (WILD-03 shimmer, floored, periodic, decorrelated)"
        status: pass
    human_judgment: false

# Metrics
duration: 6min
completed: 2026-07-18
status: complete
---

# Phase 12 Plan 01: Wildlife Math Twin Summary

**A THREE-free, deterministic, allocation-free `wildlifeMath.ts` pure twin that concentrates all of Phase 12's creature correctness risk — wander, bob, firefly pulse, bird rising-arc, spawn/cull ring, day/dusk gate, and flush debounce — behind a 22-assertion vitest suite, ready for the three thin Wave-1 render factories to delegate to.**

## Performance

- **Duration:** ~6 min
- **Tasks:** 2 completed
- **Files modified:** 2 created (1 module + 1 test)

## Accomplishments
- Created `wildlifeMath.ts` as a pure THREE-free twin whose only import is `samplePalette` from `dayNightMath` (the one shipped time-of-day channel), mirroring the `windMath.ts` / `dayNightMath.ts` discipline.
- All tunables (`WANDER`, `PULSE`, `SPAWN`, `BIRD`, `FLUSH_COOLDOWN_SEC`) exported as `as const` bundles at the researcher's recommended values; the test single-sources them so tuning and CPU math cannot drift.
- Every math decision for WILD-01/02/03 (wander, bob, day gate, spawn/cull ring, bird arc, flush debounce, firefly pulse) is a closed form with out-param scratch / scalar returns — zero per-call allocation.
- Test-first: 22-assertion twin written RED (module missing), then implementation to GREEN. Full suite 859 tests still green (additive, no regression).

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): failing wildlifeMath twin** - `4d5bf78` (test)
2. **Task 2 (GREEN): wildlifeMath pure twin** - `451349e` (feat)

_TDD cycle: test (RED) → feat (GREEN). No refactor commit needed — implementation was clean on first GREEN._

## Files Created/Modified
- `src/game/systems/wildlifeMath.ts` - Pure twin: tunable bundles + isDayTime/fireflyLevelAt gates, butterflyWander/butterflyBob/fireflyPulse/birdArc motion, inSpawnRing/beyondCull/flushReady ring+debounce.
- `src/game/systems/__tests__/wildlifeMath.test.ts` - vitest twin pinning bounds, continuity, monotonicity, periodicity, gate boundaries, and debounce (verbatim exact-value pins only for the tunables).

## Decisions Made
- **isDayTime = strict inverse of the lit firefly gate** (`fireflyLevel < 0.01`): butterflies (day) and fireflies (dusk/night) read the same shipped channel, so they can never disagree about the time of day.
- **Out-param mutators everywhere** (butterflyWander → `{x,z}`, birdArc → `{y,spread,visible}`) plus scalar returns for bob/pulse: matches the `dayNightMath.sunDir` zero-alloc precedent so the Wave-1 render loop never heap-allocates.
- **birdArc fade window** = last 15% of life (visible held at 1 until t01=0.85, linear to 0 at t01=1), per the researcher's closed form.

## Deviations from Plan

None - plan executed exactly as written. The RESEARCH Code Example 1 skeleton was implemented verbatim (signatures, tunable values, closed forms).

## Issues Encountered
None.

## User Setup Required
None - pure client-side math module; no external service configuration required.

## Self-Check: PASSED
- FOUND: src/game/systems/wildlifeMath.ts
- FOUND: src/game/systems/__tests__/wildlifeMath.test.ts
- FOUND commit: 4d5bf78 (test RED)
- FOUND commit: 451349e (feat GREEN)
- THREE-free confirmed: `grep -c "from 'three'"` = 0
- Full suite: 859/859 green

## TDD Gate Compliance
- RED gate: `4d5bf78` `test(12-01)` — twin failed with module missing (confirmed RED-OK).
- GREEN gate: `451349e` `feat(12-01)` — 22/22 twin assertions pass, full suite green.
- REFACTOR gate: not required (clean on first GREEN).
