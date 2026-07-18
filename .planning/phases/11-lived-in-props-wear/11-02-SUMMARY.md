---
phase: 11-lived-in-props-wear
plan: 02
subsystem: world
tags: [footpaths, roads, terrain, geometry, worn-paths, spline-mask]

# Dependency graph
requires:
  - phase: 11-lived-in-props-wear
    provides: "roads.ts road spline machinery (smoothstep, distanceToSegment, roadFactor, getRoads memoize pattern)"
provides:
  - "getFootpaths(): memoized same-island footpath route graph over real traffic (plaza↔bridge, bridge↔outer camp, plaza↔city camp, city camp↔camp)"
  - "footpathFactor(x,z): capped [0, FOOTPATH_MAX] partial worn-path mask — the single source downstream terrain tint / grass thinning / surface classifier read"
  - "FOOTPATH_HALF_WIDTH and FOOTPATH_MAX module constants (exported)"
affects: [11-05, 11-06, terrainColorAt, grassPlacement, surfaceAt]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Footpaths as a partial sibling of roads: reuse roads.ts spline helpers (smoothstep + distanceToSegment) rather than a second subsystem"
    - "Same-island-only route segments: the bridge carries every water crossing so distanceToSegment never bakes a path across the gap"
    - "footpathFactor kept OFF the roadAcross/aRoad cart-rut attribute path (footpaths have no wheel ruts)"

key-files:
  created:
    - src/game/world/__tests__/roads.test.ts
  modified:
    - src/game/world/roads.ts

key-decisions:
  - "footpathFactor = best * FOOTPATH_MAX (0.6) — partial by construction, never a full clear like a road (D-01)"
  - "Route graph built purely from data-driven anchors (camps, bridges, plaza origin) — no magic coordinates (D-02)"
  - "City vs outer camps split by distance-from-city-island-centre, not archetype id — data-driven and robust"
  - "Reused ROAD_BLEND as the footpath soft-edge band rather than adding a fourth constant (no new subsystem knob)"

patterns-established:
  - "Pattern 1: New worn-surface tiers extend roads.ts by reusing its private geometry helpers + lazy memoize, not by cloning them"
  - "Pattern 2: Any baked route segment must join two same-island endpoints; cross-island continuity comes from the bridge, never from a segment"

requirements-completed: [WEAR-01]

coverage:
  - id: D1
    description: "getFootpaths() returns a non-empty, memoized (referentially stable) same-island footpath route graph"
    requirement: "WEAR-01"
    verification:
      - kind: unit
        ref: "src/game/world/__tests__/roads.test.ts#returns a non-empty route graph"
        status: pass
      - kind: unit
        ref: "src/game/world/__tests__/roads.test.ts#is memoized: two calls return the referentially stable array"
        status: pass
    human_judgment: false
  - id: D2
    description: "footpathFactor is a capped partial mask (>0 on-route, 0 off-route, <=FOOTPATH_MAX everywhere, 0 across the water gap)"
    requirement: "WEAR-01"
    verification:
      - kind: unit
        ref: "src/game/world/__tests__/roads.test.ts#is > 0 on a city-island camp (a real route endpoint)"
        status: pass
      - kind: unit
        ref: "src/game/world/__tests__/roads.test.ts#is 0 far off in the open sea, away from every route"
        status: pass
      - kind: unit
        ref: "src/game/world/__tests__/roads.test.ts#never exceeds FOOTPATH_MAX — partial by construction, never a full clear"
        status: pass
      - kind: unit
        ref: "src/game/world/__tests__/roads.test.ts#bakes no path across the water gap between two islands"
        status: pass
    human_judgment: false

# Metrics
duration: 6min
completed: 2026-07-18
status: complete
---

# Phase 11 Plan 02: Footpath route graph + footpathFactor Summary

**A worn "footpath" tier added to roads.ts — a memoized same-island route graph (getFootpaths) plus a capped partial spline mask (footpathFactor, ≤0.6) that reuses the road spline helpers and never bakes a path across water.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-07-18T14:32:00Z
- **Completed:** 2026-07-18T14:35:00Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- `getFootpaths()` builds the worn desire-line graph from real traffic anchors only: plaza-edge→bridge landing (city side), bridge landing→nearest outer camp (outer side), plaza origin→each city camp, and city-camp↔city-camp — every segment same-island so the bridge carries each crossing.
- `footpathFactor(x,z)` returns a capped `[0, FOOTPATH_MAX=0.6]` partial mask, reusing the existing private `smoothstep` + `distanceToSegment` (no duplication) at the narrower `FOOTPATH_HALF_WIDTH=1.1`.
- Deliberately kept off the `roadAcross`/`aRoad` cart-rut attribute path — no `footpathAcross`/`aFootpath` added.
- New `roads.test.ts` pins the contract: on-route >0, off-route =0, capped ≤0.6 across a sampled grid, no across-water baking, and memoized stability.

## Task Commits

1. **Task 1: Add getFootpaths() route graph + footpathFactor() to roads.ts** - `6884402` (feat)
2. **Task 2: Pin footpathFactor contract with roads.test.ts** - `698aac3` (test)

_Note: Task 2 is a single test-pin commit — the implementation was intentionally built in Task 1 per the plan's task split, so this is a behavior-pin, not a strict RED-first cycle._

## Files Created/Modified
- `src/game/world/roads.ts` - Added `FOOTPATH_HALF_WIDTH`/`FOOTPATH_MAX` constants, `cachedFootpaths`, `getFootpaths()`, and `footpathFactor()`. Reuses existing spline helpers; roads/roadAcross untouched.
- `src/game/world/__tests__/roads.test.ts` - New test file pinning the footpathFactor + getFootpaths contract from real camp/bridge data.

## Decisions Made
- **Partial by construction:** `footpathFactor` scales `best` by `FOOTPATH_MAX` so it can never reach a full clear (road behaviour), honouring D-01.
- **Data-driven city/outer split:** camps classified by distance from the city island centre rather than archetype id — no magic and robust to camp-count changes.
- **Reused ROAD_BLEND** for the footpath soft edge instead of introducing another constant.
- **Outer-side pairing by nearest camp** to the bridge landing, which is guaranteed same-island (both on the outer island the bridge lands on).

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
- Potential import cycle: `roads.ts` now imports `getCampSites` from `camps.ts`, which imports from `terrain.ts`, which imports `roadFactor` from `roads.ts`. Resolved by the file's existing lazy pattern — all cross-module reads happen inside function bodies (runtime), never at module top-level, so ES-module evaluation order is unaffected. Full suite (810 tests) confirms no breakage.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `footpathFactor` is the single source Plans 05 (terrain tint) and 06 (grass thinning / surface classifier) will read. Ready to consume.
- Values `FOOTPATH_HALF_WIDTH=1.1` / `FOOTPATH_MAX=0.6` are discretionary — flagged for UAT tuning.

## Self-Check: PASSED

---
*Phase: 11-lived-in-props-wear*
*Completed: 2026-07-18*
