---
phase: 09-atmosphere-day-night
plan: 03
subsystem: ui
tags: [three, pointlight, lantern, world-build, lighting]

# Dependency graph
requires:
  - phase: 09-atmosphere-day-night (Plan 02)
    provides: "AmbienceHandles.lanternLights array placeholder on the world return"
provides:
  - "createLantern(random): WorldAsset — voxel lantern post carrying a named warm PointLight"
  - "LANTERN_LIGHT_NAME const — the collect-by-name key for the frozen-world traverse"
  - "6 plaza lanterns placed at world build, collected into ambience.lanternLights"
affects: [createDayNightCycle, plan-04-drift, plan-05-playtest]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Named build-time PointLight collected in the existing frozen-world traverse (campfire pattern) — no second scene walk, no runtime add/remove"
    - "Dedicated seeded RNG per decor family (lanternRandom) so count/jitter is deterministic and independent of prior placement draws"

key-files:
  created:
    - src/game/world/assets/createLantern.ts
  modified:
    - src/game/world/assets/index.ts
    - src/game/world/createMondstadtWorld.ts

key-decisions:
  - "6 lanterns (fixed) in a ring at radius 14 — well inside SAFE_ZONE_RADIUS=18 and clear of the fountain basin (r 3); plaza-only per D-07"
  - "LANTERN_BASE_INTENSITY=1.8 exported as the lit base — Plan 04 scales it by lanternLevel; light starts lit at build (fade handled downstream)"
  - "Collected in the SAME group.traverse loop as campfireLights/campFlags (single walk), assigned to the ambience.lanternLights handle declared by Plan 02"

patterns-established:
  - "Pattern: per-decor-family dedicated seeded RNG to keep placement deterministic without perturbing the shared world random stream"

requirements-completed: [DAYNITE-04]

coverage:
  - id: D1
    description: "createLantern returns a WorldAsset whose group holds a voxel post + one named warm PointLight with layers.enableAll(); no createLightPool usage"
    requirement: DAYNITE-04
    verification:
      - kind: unit
        ref: "npx tsc -b clean; grep: createLightPool absent from createLantern.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "6 plaza lanterns placed within SAFE_ZONE_RADIUS at build and collected into ambience.lanternLights via the named traverse; lanternLights non-empty on the handle"
    requirement: DAYNITE-04
    verification:
      - kind: unit
        ref: "grep: LANTERN_LIGHT_NAME collected in the same traverse loop as CAMPFIRE_LIGHT_NAME"
        status: pass
      - kind: integration
        ref: "pnpm build succeeds; vitest 757/757 pass"
        status: pass
    human_judgment: true
    rationale: "That the lantern glow reads warm and fades correctly through the pixel filter at dusk/dawn is a visual playtest — deferred to the Plan 05 phase gate once Plan 04 drives the fade"

# Metrics
duration: 4min
completed: 2026-07-14
status: complete
---

# Phase 9 Plan 03: Plaza Lanterns Summary

**Added `createLantern.ts` (a voxel post carrying a named warm build-time `PointLight`), placed 6 lanterns in the plaza inside the safe zone, and collected them by name into `ambience.lanternLights` in the existing frozen-world traverse — ready for Plan 04's day/night cycle to fade by intensity, with zero runtime light add/remove.**

## Performance
- **Duration:** ~4 min
- **Started:** 2026-07-14T14:07:00Z
- **Completed:** 2026-07-14T14:11:00Z
- **Tasks:** 2
- **Files created:** 1 / **modified:** 2

## Accomplishments
- New `createLantern.ts`: wooden post + cross-arm + dark frame + warm emissive lamp box, plus one `THREE.PointLight` named `LANTERN_LIGHT_NAME` with `light.layers.enableAll()` (mandatory — skipping it flips the renderer lights-state hash and re-inits every lit material per pass). Exported `LANTERN_BASE_INTENSITY=1.8` as the lit base Plan 04 scales.
- Barrel-exported `createLantern` + `LANTERN_LIGHT_NAME` from `assets/index.ts`.
- Placed 6 lanterns in a ring at radius 14 (< `SAFE_ZONE_RADIUS=18`, clear of the fountain basin r 3) at world build via the existing `placeAsset` helper, using a dedicated `lanternRandom` seeded RNG so placement is deterministic and independent of prior draws.
- Collected the lanterns by name in the SAME `group.traverse` loop that gathers `campfireLights`/`campFlags` (no second walk); declared `lanternLights` before the loop and assigned it to the `ambience.lanternLights` handle, removing Plan 02's empty placeholder.

## Task Commits
1. **Task 1: createLantern.ts — voxel post + named warm PointLight** - `e50e295` (feat)
2. **Task 2: Place 6 plaza lanterns + collect into ambience.lanternLights** - `1333398` (feat)

## Files Created/Modified
- `src/game/world/assets/createLantern.ts` (created) - lantern factory + `LANTERN_LIGHT_NAME` + `LANTERN_BASE_INTENSITY`.
- `src/game/world/assets/index.ts` (modified) - barrel export.
- `src/game/world/createMondstadtWorld.ts` (modified) - import; lantern ring placement after the camp loop; `lanternLights` declared before the traverse loop with the named-collect line added; removed the Plan 02 placeholder declaration.

## Decisions Made
- **6 lanterns, fixed ring at radius 14**: inside the 4–6 range the plan allowed; radius 14 keeps them within `SAFE_ZONE_RADIUS=18` and clear of the fountain basin. Even spacing with a 0.3rad phase offset reads as an intentional plaza ring (D-07 plaza-only).
- **Dedicated `lanternRandom` seed** (`WORLD_DECOR_SEED ^ 0x1a27`): the lantern factory only jitters the post rotation, but giving it its own stream keeps the shared `random` draw sequence — and therefore every downstream placement — byte-identical, which the world tests depend on (757/757 stayed green).
- **`LANTERN_BASE_INTENSITY` exported**: makes the lit value a single named source Plan 04 can reference when scaling by `lanternLevel`, instead of a magic number duplicated across files.

## Deviations from Plan
None - plan executed exactly as written.

Two additive touches within the plan's intent (not rule deviations):
- Exported `LANTERN_BASE_INTENSITY` (plan said "sensible lit value") so Plan 04 has a named base rather than a literal.
- Barrel-exported `createLantern`/`LANTERN_LIGHT_NAME` from `assets/index.ts`, matching how every sibling asset is exported.

## Issues Encountered
None. `npx tsc -b` clean, `pnpm build` succeeded, vitest 757/757 green. (Note: the `pnpm exec tsc -b` form in the plan's `<automated>` block resolved to a no-op "Already up to date" on this machine; `npx tsc -b` is the equivalent that actually type-checks — used that.)

## Known Stubs
None. `ambience.lanternLights` is now populated with 6 real PointLights; it is no longer an empty placeholder.

## User Setup Required
None - client-only build-time geometry + lights.

## Next Phase Readiness
- `ambience.lanternLights` is a non-empty `THREE.PointLight[]` on the world handle — Plan 04's `createDayNightCycle` fades each `.intensity` from `lanternLevel` each frame (zero matrix cost; the world subtree is matrix-frozen). Base lit value is `LANTERN_BASE_INTENSITY`.
- Visual read (warm glow through the pixel filter, dusk fade-in / dawn fade-out) is manual — carried to the Plan 05 phase gate.

## Self-Check: PASSED
- FOUND: src/game/world/assets/createLantern.ts
- FOUND: src/game/world/createMondstadtWorld.ts (modified)
- FOUND commit: e50e295 (Task 1)
- FOUND commit: 1333398 (Task 2)
- VERIFIED: LANTERN_LIGHT_NAME defined in createLantern.ts and collected in createMondstadtWorld.ts (same traverse loop as CAMPFIRE_LIGHT_NAME)
- VERIFIED: no createLightPool reference in createLantern.ts
- VERIFIED: tsc clean, pnpm build succeeded, 757/757 tests pass

---
*Phase: 09-atmosphere-day-night*
*Completed: 2026-07-14*
