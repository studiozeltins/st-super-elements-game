---
phase: 11-lived-in-props-wear
plan: 06
subsystem: systems
tags: [surface-classifier, pure-function, roads, footpaths, town, dust, footstep-audio]

# Dependency graph
requires:
  - phase: 11-lived-in-props-wear
    provides: "roadFactor + footpathFactor spline masks (Plan 02, roads.ts)"
  - phase: 11-lived-in-props-wear
    provides: "isInTown solid-pavement predicate (town/townPlan.ts)"
provides:
  - "Surface tag type ('grass' | 'dirt' | 'path' | 'town') — the shared surface vocabulary"
  - "surfaceAt(x,z): the single authoritative ground-surface classifier (dust gating + footstep audio read it)"
affects: [11-08, createGame, createMovementAudio, createDustPuffs]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "surfaceAt composes the three existing pure masks in strict precedence (town>dirt>path>grass) rather than re-deriving geometry"
    - "Road cutoff (>0.5) pinned to grassPlacement.ts:74 so dust never spawns where grass still grows — one boundary, two consumers"
    - "Pure, THREE-free, zero-alloc, no GPU read — classifier returns a string literal only (windMath purity mirror)"

key-files:
  created:
    - src/game/systems/surfaceAt.ts
    - src/game/systems/__tests__/surfaceAt.test.ts
  modified: []

key-decisions:
  - "Precedence order town>dirt>path>grass encoded as early-return chain (D-12) — first match wins, no ambiguity"
  - "roadFactor threshold >0.5 kept identical to grassPlacement.ts:74 (single source of truth for the road/grass boundary)"
  - "footpathFactor threshold >0.25 selects the worn spine while leaving faint edges (capped mask ≤0.6) as grass"
  - "Test points derived at runtime from getRoads()/getFootpaths()/TOWN_DISTRICTS — tracks real world data, no magic coordinates"

patterns-established:
  - "Compose-existing-pure-masks over cloning: a new surface question is a 4-line early-return chain, not a new subsystem"

requirements-completed: [WEAR-05]

coverage:
  - id: D-12
    description: "surfaceAt returns the correct ground surface at any world point, pure and zero-alloc"
    requirement: "WEAR-05"
    verification:
      - kind: unit
        ref: "src/game/systems/__tests__/surfaceAt.test.ts#classifies the plaza origin as 'town'"
        status: pass
      - kind: unit
        ref: "src/game/systems/__tests__/surfaceAt.test.ts#classifies a road centerline point (off town) as 'dirt'"
        status: pass
      - kind: unit
        ref: "src/game/systems/__tests__/surfaceAt.test.ts#classifies a worn footpath spine (off road, off town) as 'path'"
        status: pass
      - kind: unit
        ref: "src/game/systems/__tests__/surfaceAt.test.ts#classifies open meadow far from town/roads/footpaths as 'grass'"
        status: pass
    human_judgment: false
  - id: precedence
    description: "Classification precedence town>dirt>path>grass, road threshold matches grassPlacement (>0.5)"
    requirement: "WEAR-05"
    verification:
      - kind: unit
        ref: "src/game/systems/__tests__/surfaceAt.test.ts#town beats road: a road vertex inside town classifies as 'town'"
        status: pass
      - kind: unit
        ref: "src/game/systems/__tests__/surfaceAt.test.ts#road beats footpath: a point on both a road and a footpath classifies as 'dirt'"
        status: pass
      - kind: unit
        ref: "src/game/systems/__tests__/surfaceAt.test.ts#footpath beats grass: a footpath-only vertex classifies as 'path' not 'grass'"
        status: pass
    human_judgment: false
  - id: exhaustive
    description: "surfaceAt always returns exactly one of the four tags (mutually exclusive, exhaustive)"
    requirement: "WEAR-05"
    verification:
      - kind: unit
        ref: "src/game/systems/__tests__/surfaceAt.test.ts#returns exactly one of the four tags for every sampled world point"
        status: pass
    human_judgment: false

# Metrics
duration: 4min
completed: 2026-07-18
status: complete
---

# Phase 11 Plan 06: surfaceAt pure surface classifier Summary

**A single authoritative, boundary-tested `surfaceAt(x,z)` classifier that composes `isInTown` + `roadFactor` + `footpathFactor` into one of four ground tags (town > dirt > path > grass), with the road cutoff pinned to grassPlacement so dust and footstep audio can never disagree with where grass grows.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-07-18T15:02:00Z
- **Completed:** 2026-07-18T15:06:00Z
- **Tasks:** 1 (TDD: RED test + GREEN implementation)
- **Files modified:** 2 (both created)

## Accomplishments
- `surfaceAt(x,z)` returns `'town' | 'dirt' | 'path' | 'grass'` via a strict early-return precedence chain — first match wins, so overlaps (a road inside town, a footpath under a road) resolve to the higher-priority surface.
- The `roadFactor > 0.5` cutoff is identical to `grassPlacement.ts:74`, guaranteeing dust never spawns on ground where grass still grows (one boundary, two consumers).
- Pure and perf-safe by construction: zero allocation, no GPU read, THREE-free — returns only a string literal (D-12, client-perf 144→20fps rule).
- `Surface` type is the shared four-tag vocabulary Plan 08 widens `FootstepSurface` to match.
- Exhaustive boundary test derives its town/dirt/path/grass sample points from real `getRoads()`/`getFootpaths()`/`TOWN_DISTRICTS` data at runtime, so it tracks the actual world rather than hard-coded coordinates.

## Task Commits

1. **Task 1 (RED): failing boundary test for surfaceAt** - `98e6f50` (test)
2. **Task 1 (GREEN): pure surfaceAt(x,z) classifier** - `b346068` (feat)

_No REFACTOR commit: the GREEN implementation is already the minimal 4-line composition the plan specifies — nothing to clean up._

## Files Created/Modified
- `src/game/systems/surfaceAt.ts` - New pure classifier: `Surface` type + `surfaceAt(x,z)` composing `isInTown`/`roadFactor`/`footpathFactor` in precedence order.
- `src/game/systems/__tests__/surfaceAt.test.ts` - New vitest suite (9 tests): four-tag classification, town>dirt>path>grass precedence at real overlap points, and an exhaustive single-tag grid sweep.

## Decisions Made
- **Early-return precedence chain** encodes town>dirt>path>grass unambiguously (first match wins), matching the plan's exact composition.
- **Road threshold >0.5 pinned to grassPlacement.ts:74** — kept the same numeric cutoff rather than a new constant, preserving the single source of truth for the road/grass boundary.
- **Footpath threshold >0.25** on the capped (≤0.6) footpath mask selects the worn spine and leaves the faint tapered edges as grass.
- **Runtime-derived test points** (from `getRoads()`/`getFootpaths()`/`TOWN_DISTRICTS`) instead of magic coordinates, so the test stays valid as world data evolves.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None. RED test failed on the missing module (as expected), GREEN implementation passed all 9 new tests and the full 837-test suite with no regressions.

## User Setup Required
None - client-only pure function, no external service configuration.

## Next Phase Readiness
- `surfaceAt` is ready for Plan 08 to consume: gate dust spawning on `surface !== 'grass'` and thread the real surface into `movementAudio.updateUnit(...)`.
- The `Surface` tag set is the alignment target for widening `createMovementAudio.FootstepSurface` (Plan 08) — keep both to the same four tags.

## TDD Gate Compliance
- RED gate: `98e6f50` (`test(...)`) — failing test committed before implementation.
- GREEN gate: `b346068` (`feat(...)`) — implementation committed after test passes.
- REFACTOR: not needed (minimal composition).

## Self-Check: PASSED

---
*Phase: 11-lived-in-props-wear*
*Completed: 2026-07-18*
