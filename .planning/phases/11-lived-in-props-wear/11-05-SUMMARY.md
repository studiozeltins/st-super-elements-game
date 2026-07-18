---
phase: 11-lived-in-props-wear
plan: 05
subsystem: world
tags: [footpaths, terrain, vertex-color, grass, thinning, worn-paths]

# Dependency graph
requires:
  - phase: 11-lived-in-props-wear
    provides: "footpathFactor(x,z) capped partial worn-path mask from roads.ts (Plan 02)"
provides:
  - "FOOTPATH_TINT baked into terrainColorAt vertex color — a light trampled tint, greener/lighter than ROAD_DIRT, blended BEFORE the road blend so roads win on overlap"
  - "Probabilistic footpath grass thinning in generateGrassBlades — blades poke through (trampled, not cleared)"
affects: [11-06, terrainColorAt, grassPlacement]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Worn-footpath look baked through the two existing static seams (terrain vertex color + grass placement) driven by one source of truth (footpathFactor) — no new subsystem, zero per-frame cost"
    - "Footpath tint kept OFF the aRoad/aRoadCross cart-rut fragment path — vertex-color bake only (no ruts/clods on footpaths)"
    - "Deterministic grass thinning reuses the seeded random() already threaded through generateGrassBlades"

key-files:
  created: []
  modified:
    - src/game/world/terrain.ts
    - src/game/world/grassPlacement.ts
    - src/game/world/__tests__/terrain.test.ts
    - src/game/world/__tests__/grassPlacement.test.ts

key-decisions:
  - "Footpath tint 0x7d8a54 (green-dominant) is lighter/greener than ROAD_DIRT 0x9a7a4e (red-dominant) so footpaths read distinct from packed-dirt roads (D-03; hue is discretion A2)"
  - "Tint lerp strength foot*0.5 keeps footpaths worn-but-not-bare; blended BEFORE the road blend so roads override on overlap"
  - "Grass thinning uses continue-with-probability foot (capped at FOOTPATH_MAX 0.6) — a partial thin, never the hard reject roads use"

patterns-established:
  - "New worn-surface visuals extend the existing bake seams (terrainColorAt, generateGrassBlades) fed by footpathFactor, rather than adding a parallel subsystem or a shader edit"

requirements-completed: [WEAR-01]

coverage:
  - id: D-03-tint
    description: "terrainColorAt on a footpath spine (off any road) returns a color distinct from meadow, greener than road, and still green (grass poking through)"
    requirement: "WEAR-01"
    verification:
      - kind: unit
        ref: "src/game/world/__tests__/terrain.test.ts#shifts the ground color toward the footpath tint on a footpath spine"
        status: pass
      - kind: unit
        ref: "src/game/world/__tests__/terrain.test.ts#reads greener/lighter than the packed-dirt road (footpath is not a road)"
        status: pass
      - kind: unit
        ref: "src/game/world/__tests__/terrain.test.ts#leaves the footpath color green (grass poking through, not bare dirt)"
        status: pass
    human_judgment: false
  - id: D-03-thin
    description: "Grass is partially thinned along footpath spines (blades still poke through) — spine density markedly lower than matched non-path meadow, meadow density preserved"
    requirement: "WEAR-01"
    verification:
      - kind: unit
        ref: "src/game/world/__tests__/grassPlacement.test.ts#thins — but does not clear — grass along footpath spines"
        status: pass
    human_judgment: false
  - id: WEAR-01-human
    description: "Footpaths read as worn/trampled routes along real camp↔plaza↔bridge lines and never fade"
    requirement: "WEAR-01"
    verification:
      - kind: human
        ref: "phase gate — walk the routes on the LAN page"
        status: pending
    human_judgment: true

# Metrics
duration: 5min
completed: 2026-07-18
status: complete
---

# Phase 11 Plan 05: Footpath tint + grass thinning bake Summary

**The worn-footpath look baked through the two existing static seams — a light trampled tint in `terrainColorAt` (greener/lighter than the packed-dirt road, blended before the road so roads win on overlap) and probabilistic grass thinning in `generateGrassBlades` — both driven by `footpathFactor` (Plan 02), at zero per-frame cost and entirely off the `aRoad` cart-rut fragment path.**

## Performance

- **Duration:** ~5 min
- **Tasks:** 2
- **Files modified:** 4 (0 created, 4 modified)

## Accomplishments
- Added `FOOTPATH_TINT = 0x7d8a54` near `ROAD_DIRT`; `terrainColorAt` reads `footpathFactor(x,z)` and lerps `grassColor` toward the tint by `foot * 0.5`, placed BEFORE the road blend so roads override on overlap.
- Left the `aRoad`/`aRoadCross` attribute writes untouched (`aRoad = roadFactor` only) — the footpath tint feeds the baked vertex-color path exclusively, never the packed-dirt cart-rut fragment branch (CLAUDE.md constraint + Pitfall 2).
- Added probabilistic footpath thinning in `generateGrassBlades`: after the town-reject and before `getTerrainHeight`, `continue` with probability `footpathFactor(x,z)` using the already-threaded seeded `random()`. Capped at `FOOTPATH_MAX = 0.6`, so ~60% of blades drop on the spine, tapering to 0 at the edges — trampled, not cleared.
- Pinned both behaviours with pure tests: terrain tint is distinct-from-meadow, greener-than-road, and still green; grass spine density measured (grid-normalised by lushness-matched area) at ~0.3x the matched meadow density, with meadow density preserved.

## Task Commits

1. **Task 1: Footpath tint in terrainColorAt (baked vertex color only)** - `e0ef57b` (feat)
2. **Task 2: Partial grass thinning along footpaths + grassPlacement test recheck** - `c5201f8` (feat)

## Files Created/Modified
- `src/game/world/terrain.ts` - Imported `footpathFactor`; added `FOOTPATH_TINT`; footpath tint lerp in `terrainColorAt` before the road blend. `aRoad` attribute writes untouched.
- `src/game/world/grassPlacement.ts` - Imported `footpathFactor`; probabilistic thinning seam between the town-reject and `getTerrainHeight`.
- `src/game/world/__tests__/terrain.test.ts` - New `terrainColorAt footpath tint` block: distinct-from-meadow, greener-than-road, still-green.
- `src/game/world/__tests__/grassPlacement.test.ts` - New density-comparison test pinning trampled-not-cleared thinning; meadow-clustering invariants intact.

## Decisions Made
- **Tint hue (0x7d8a54):** green-dominant desaturated worn-grass tone, deliberately greener/lighter than `ROAD_DIRT` (red-dominant) so footpaths read as trodden-but-not-bare and never as roads (D-03, A2 discretion).
- **Blend order:** footpath tint lerped BEFORE the road blend so any road overlap fully overrides it.
- **Thinning is partial by construction:** probability = `footpathFactor` (≤0.6), a soft `continue`, never the hard reject roads use — blades still poke through.

## Deviations from Plan
None - plan executed exactly as written. (The grassPlacement recheck per Pitfall 3 found no stale count assertions — the existing range-based assertions and meadow-clustering invariants held with thinning active; a new density-comparison test was added to positively pin the new behaviour.)

## Issues Encountered
None. Full suite green (828 tests).

## User Setup Required
None - client-only cosmetic build-time bake; no packages, reducers, or config.

## Next Phase Readiness
- The visual half of the worn-path system is now baked. `footpathFactor` remains the single source; Plan 06 (surface classifier) can read it independently.
- Footpath tint strength (`foot * 0.5`) and thinning cap (`FOOTPATH_MAX = 0.6`) are discretionary — flagged for the phase-gate human walk-through (camp↔plaza↔bridge routes).

## Self-Check: PASSED

---
*Phase: 11-lived-in-props-wear*
*Completed: 2026-07-18*
