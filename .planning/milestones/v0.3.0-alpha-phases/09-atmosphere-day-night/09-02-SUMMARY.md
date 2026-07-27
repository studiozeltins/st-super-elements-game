---
phase: 09-atmosphere-day-night
plan: 02
subsystem: ui
tags: [three, shadermaterial, fog, sky-dome, lighting, rendering]

# Dependency graph
requires:
  - phase: 09-atmosphere-day-night (Plan 01)
    provides: dayNightMath keyframe helper (the palette values that will drive these handles in Plan 04)
provides:
  - "AmbienceHandles interface exported from createMondstadtWorld (skyLight, sunLight, fog, background, lanternLights, setSkyTop)"
  - "world.ambience write surface — the day/night cycle mutates through it, never touching the scene directly"
  - "Gradient sky-dome whose bottomColor uniform IS scene.fog.color (ATMO-02 single-source contract)"
  - "Tuned distance fog (near 80 / far 300) that dissolves the world edge while keeping the gameplay radius crisp"
affects: [createDayNightCycle, createLantern, plaza-lanterns, plan-04-drift, plan-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-source color contract: a shader uniform value holds the SAME THREE.Color instance as scene.fog.color, so they physically cannot diverge"
    - "xyww far-plane pin for a fixed-origin sky dome — background fill never clipped by the camera far plane as the player roams"
    - "Handle-object return widening: expose mutable render objects (lights/fog/uniform) for a downstream system to drift, keeping the frozen-matrix world intact"

key-files:
  created: []
  modified:
    - src/game/world/createMondstadtWorld.ts

key-decisions:
  - "Fixed-origin dome + xyww vertex depth pin (not camera-tracking) — keeps Plan 05 frame wiring to a single daynight.update() line, dome radius is cosmetically irrelevant, and it is never far-plane-clipped (camera far=500, fog.far=300, WORLD_BOUND=130)"
  - "setSkyTop scratch (skyTopColor) IS the dome topColor uniform value — writing into it drives the dome directly with zero per-frame allocation, mirroring the fog.color single-source"
  - "Fog kept at near=80/far=300 via named constants FOG_NEAR/FOG_FAR (already compliant; made explicit + documented for ATMO-03/ATMO-01 rationale) rather than an arbitrary retune"

patterns-established:
  - "Pattern: shader-uniform-shares-scene-Color-instance for guaranteed single-source (ATMO-02)"
  - "Pattern: skybox xyww depth trick for a static-origin gradient dome in a roaming-camera world"

requirements-completed: [ATMO-01, ATMO-02, ATMO-03]

coverage:
  - id: D1
    description: "createLighting widened to return { skyLight, sunLight }; AmbienceHandles exported; world.ambience present on interface + return object with all six members; sun direction basis untouched"
    requirement: ATMO-02
    verification:
      - kind: unit
        ref: "tsc -p tsconfig.app.json --noEmit (type-level shape check)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Gradient sky-dome renders behind the world; bottomColor uniform is the identical THREE.Color instance as scene.fog.color (same reference by construction); setSkyTop writes topColor"
    requirement: ATMO-02
    verification:
      - kind: unit
        ref: "grep: createSkyDome(scene.fog.color, ...) — bottomColor sourced from fog.color reference"
        status: pass
      - kind: integration
        ref: "vite build — sky-dome ShaderMaterial compiles"
        status: pass
    human_judgment: true
    rationale: "Same-reference wiring is asserted by construction/grep, but that the gradient actually reads as top=sky/bottom=horizon and dissolves the terrain edge through the pixel filter needs a visual playtest (carried to Plan 05)"
  - id: D3
    description: "Fog near >= 80 (>> SAFE_ZONE_RADIUS 18 → combat contrast preserved) and far in 250-320 (dissolves WORLD_BOUND=130 edge), mutated in place; scene.fog/scene.background identities never reassigned"
    requirement: ATMO-03
    verification:
      - kind: unit
        ref: "grep: scene.fog = / scene.background = each appear exactly once (creation only)"
        status: pass
    human_judgment: true
    rationale: "ATMO-01/ATMO-03 combat-readability + edge-dissolve are manual-only per RESEARCH test map (two-client night playtest + edge-pan) — deferred to Plan 05 phase gate"

# Metrics
duration: 12min
completed: 2026-07-14
status: complete
---

# Phase 9 Plan 02: AmbienceHandles + Gradient Sky Summary

**Widened `createMondstadtWorld` to expose an `AmbienceHandles` write surface and added a fixed-origin gradient sky-dome whose bottom color IS the fog color (ATMO-02 single-source), with distance fog tuned to dissolve the world edge while keeping the gameplay radius crisp.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-14T13:51:00Z
- **Completed:** 2026-07-14T14:03:03Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Exported `AmbienceHandles` (skyLight, sunLight, fog, background, lanternLights, setSkyTop) and added `ambience` to the `MondstadtWorld` interface + return object — the handle surface Plan 04's day/night drift writes through, never touching the scene directly.
- Widened `createLighting` to return `{ skyLight, sunLight }`, exposing the previously-local `HemisphereLight` without touching the frozen sun DIRECTION basis (D-02).
- Added a gradient sky-dome (classic 2-uniform three.js sky shader) whose `bottomColor` uniform is the SAME `THREE.Color` instance as `scene.fog.color` — fog and sky-bottom physically cannot diverge (ATMO-02 / D-04).
- Pinned the fixed-origin dome to the far plane with the `xyww` vertex trick so it is never clipped as the camera roams `WORLD_BOUND=130` (camera far=500, fog.far=300) — no per-frame camera tracking needed.
- Tuned distance fog (`FOG_NEAR=80` >> `SAFE_ZONE_RADIUS=18` → ATMO-03 combat contrast; `FOG_FAR=300` dissolves the world edge → ATMO-01), mutated in place — `scene.fog`/`scene.background` identities never reassigned.

## Task Commits

Each task was committed atomically:

1. **Task 1: Widen createLighting + define AmbienceHandles + return it** - `51b2741` (feat)
2. **Task 2: Add gradient sky-dome (bottomColor === fog.color) + tune fog** - `d0e4c89` (feat)

## Files Created/Modified
- `src/game/world/createMondstadtWorld.ts` - Widened `createLighting` return; exported `AmbienceHandles` + added `ambience` handle to the world interface/return; added `createSkyDome` factory + `FOG_NEAR`/`FOG_FAR`/`SKY_DOME_RADIUS` constants; wired the dome bottomColor to `scene.fog.color` and topColor to the `setSkyTop` scratch; dispose the scene-level dome.

## Decisions Made
- **Fixed-origin dome + `xyww` far-plane pin** (not camera-tracking): the plan's preferred choice (RESEARCH Open Question 1 resolved to fixed-origin). Camera far is 500 and the player roams 130, so a plain radius-based dome risked far-plane clipping; the `xyww` skybox trick makes the dome radius cosmetically irrelevant and clipping-proof while keeping Plan 05's frame wiring to a single `daynight.update()` line.
- **`setSkyTop` scratch is the topColor uniform value**: `skyTopColor` is passed into `createSkyDome` as the `topColor.value`, so `setSkyTop(c)` copying into it drives the dome with zero per-frame allocation — the same single-source discipline used for `fog.color`.
- **Fog left at 80/300, made explicit**: current values already satisfied D-06 (near ≥ 80, far in 250–320); promoted to named constants with the ATMO rationale documented rather than an arbitrary retune.

## Deviations from Plan

None - plan executed exactly as written.

Two minor additive touches within the plan's intent (not deviations requiring a rule):
- Named the fog values as `FOG_NEAR`/`FOG_FAR` constants (plan said "tune"; kept the compliant values, documented the rationale).
- Added dome teardown in `dispose()` (the dome lives on `scene`, outside the frozen `group` that `dispose` already cleans — leaving it would leak the geometry/material). Aligns with the project's no-leak discipline.

## Issues Encountered
None. `tsc -p tsconfig.app.json --noEmit` clean, `vite build` succeeded (ShaderMaterial compiles), full vitest suite 757/757 green.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `world.ambience` is the ready write surface for Plan 04 (`createDayNightCycle`): drift `skyLight.color/.groundColor/.intensity`, `sunLight.color/.intensity` (direction frozen), `fog.color/.near/.far` in place, `background` in place, and `setSkyTop(scratchSkyTop)` — all zero-alloc.
- `lanternLights` is an empty array placeholder; Plan 03 (`createLantern` + plaza placement) populates it in the existing `group.traverse` collection loop.
- Visual/playtest checks (gradient reads correctly through the pixel filter, edge dissolve, combat contrast at night, two-client sync) are manual-only per the RESEARCH test map — carried to the Plan 05 phase gate.

## Self-Check: PASSED
- FOUND: src/game/world/createMondstadtWorld.ts (modified)
- FOUND commit: 51b2741 (Task 1)
- FOUND commit: d0e4c89 (Task 2)
- VERIFIED: `scene.fog =` and `scene.background =` each appear exactly once (creation only)
- VERIFIED: dome bottomColor sourced from `scene.fog.color` (same reference)
- VERIFIED: tsc clean, vite build succeeded, 757/757 tests pass

---
*Phase: 09-atmosphere-day-night*
*Completed: 2026-07-14*
