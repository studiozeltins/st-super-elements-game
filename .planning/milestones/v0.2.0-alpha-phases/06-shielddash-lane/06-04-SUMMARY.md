---
phase: 06-shielddash-lane
plan: 04
subsystem: ui
tags: [three, telegraph, frost, lane, drape, render]

# Dependency graph
requires:
  - phase: 06-shielddash-lane
    provides: "06-01 client mirror ATTACK_RENDER.shieldDash (shape 'lane', no half-width field, D6-13 deviation) + shape union widened to 'lane'"
  - phase: 06-shielddash-lane
    provides: "06-03 server rows now carry lane geometry: castX/Z = lane start, landingX/Z = lane end (overshoot + world clamp), radius = per-size half-width"
  - phase: 05-swordswing-swordswirl-combo
    provides: "createTelegraphSystem cone seams — anchorGroup cast-anchor + cast->landing yaw, shape-aware re-anchor, arrival-anchored progressFraction (ANIM-01)"
provides:
  - "Lane rectangle telegraph branch in createTelegraphSystem: cast-anchored outline + cast-origin sweeping fill + generic rim flash, all in the shared Frost constants (D6-11)"
  - "fillAxis ('uniform'|'x') scale strategy on ActiveTelegraph — the per-frame update loop stays one loop with zero shape lookups; lanes sweep the lane axis only (RESEARCH Pitfall 3)"
  - "Lane re-cast rebuild rule: a fresh startedAtMicros on a lane rebuilds geometry (clampToWorld can change baked length) while circle/cone keep the cheap re-anchor (RESEARCH Pitfall 4)"
  - "telegraphShapes.ts — carved geometry-builder module (flatRing + buildLaneOutline + Frost geometry constants)"
affects: [06-05 playtest checkpoint]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lane telegraph geometry authored in the XZ plane so the shared per-vertex terrain drape samples ground straight from local (x,z)"
    - "Rectangle outline as a single merged BufferGeometry (subdivided plane rails + inner-gap end caps) — one mesh for drape + flash, zero BufferGeometryUtils dependency"
    - "Per-telegraph fill-axis scale strategy stored at insert time to keep the per-frame loop shape-lookup-free"

key-files:
  created:
    - src/game/systems/telegraphShapes.ts
  modified:
    - src/game/systems/createTelegraphSystem.ts

key-decisions:
  - "Lane branch follows the CURRENT terrain-drape architecture (user rework 3f7be1a), NOT the plan's pre-drape mesh recipe: geometry baked into the XZ plane and draped per-vertex, depth-tested normally — no depthTest:false / renderOrder 999/1000"
  - "Outline built as ONE merged BufferGeometry from subdivided plane strips (local mergeStripPositions, no BufferGeometryUtils) so the shared drape + flash operate on a single mesh; rails carry lengthSegments so the drape follows terraces over an up-to-8u lane"
  - "Carved telegraphShapes.ts (deviation trigger): the lane branch pushed createTelegraphSystem to 322 functional LOC (>300) — extracted the pure geometry builders to hold the ceiling (263 LOC)"

patterns-established:
  - "XZ-plane-authored + draped lane geometry: any flat telegraph shape maps local (x,z) to a ground sample; subdivide long spans so the drape follows terrain"
  - "fillAxis scale-strategy field: store the shape's per-frame scale mode at insert so the update loop branches on a stored enum, never an ATTACK_RENDER lookup"

requirements-completed: [ATK-04]

coverage:
  - id: D1
    description: "Lane rows render the D6-11 rectangle: instant cast-anchored outline (cast->landing yaw), cast-origin fill sweeping over the windup, generic rim flash at strike — Frost #86e2ff, width = row.radius*2, length = |landing-cast|, timing row-derived (ANIM-01)"
    requirement: "ATK-04"
    verification:
      - kind: unit
        ref: "pnpm vitest run src/game/data/__tests__/serverSync.test.ts — 165/165 pass (ATTACK_RENDER lane parity + shieldDash registry invariants)"
        status: pass
      - kind: manual_procedural
        ref: "pixel-filter legibility through the game camera — deferred to 06-05 human playtest (RESEARCH A3)"
        status: unknown
    human_judgment: true
    rationale: "Telegraph visual legibility through the pixel filter is an explicit 06-05 playtest sign-off (RESEARCH Assumption A3); source + parity are automatable, the on-screen read is not"
  - id: D2
    description: "Lane fill scales ONLY along the lane axis via a stored fillAxis strategy (constant width, no growing-wedge); circle/cone uniform path byte-unchanged; one per-frame loop with no shape lookup"
    requirement: "ATK-04"
    verification:
      - kind: unit
        ref: "grep fillAxis (single progress-scaling site branched on the stored strategy) + full suite pnpm test — 582/582 pass"
        status: pass
    human_judgment: false
  - id: D3
    description: "A same-attack lane re-cast rebuilds geometry (fresh startedAtMicros -> remove+insert) so a world-clamped shorter lane never renders stale; circle/cone re-cast + dead-row hygiene unchanged"
    requirement: "ATK-04"
    verification:
      - kind: unit
        ref: "source assertion: laneRecast condition routes 'lane' + changed startedAtMicros through the rebuild path; pnpm build (tsc -b + vite) green"
        status: pass
    human_judgment: false

# Metrics
duration: 22min
completed: 2026-07-11
status: complete
---

# Phase 06 Plan 04: shieldDash lane rectangle telegraph Summary

**D6-11 lane telegraph in createTelegraphSystem: a cast-anchored rectangle outline (merged draped plane strips) with a cast-origin fill that sweeps the lane axis at constant width and a generic rim flash — all row-derived in the shared Frost language, with the geometry builders carved into telegraphShapes.ts to hold the 300-LOC ceiling**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-07-11T21:06Z
- **Completed:** 2026-07-11T21:16Z
- **Tasks:** 2 (+ 1 conditional carve refactor)
- **Files modified:** 1 modified, 1 created

## Accomplishments

- **Lane anchor + construction (Task 1):** `anchorGroup` now anchors lanes at the CAST end yawed by the shared cone `atan2(-(landingZ-castZ), landingX-castX)` seam; `insert()` gained a `shape === 'lane'` branch that derives length = `hypot(landing-cast)` and width = `row.radius * 2` entirely from the row — NO client mirror half-width field (the documented D6-13 deviation; a scalar cannot parity-lock to the 3-value server `radiusBySize`). The outline is one merged draped BufferGeometry (two subdivided rails + two inner-gap end caps); the fill is one plane inset by `PROGRESS_RIM_WIDTH` across the width and translated `+length/2` on X so its origin is the cast end.
- **Axis-aware fill + re-cast rebuild (Task 2):** the per-frame `update()` scaling now honors a stored `fillAxis` — lanes write `scale.x` only (constant width, RESEARCH Pitfall 3), circle/cone keep the byte-identical uniform XZ path — so the loop stays ONE loop with zero shape lookups (T-06-05). The sync loop rebuilds a lane on a fresh `startedAtMicros` (remove+insert) instead of re-anchoring, because `clampToWorld` can change the baked `|landing-cast|` length between casts (Pitfall 4); circle/cone re-cast and the dead-row hygiene path are untouched.
- **Drape-faithful geometry:** the branch follows the user's CURRENT terrain-drape architecture (commit `3f7be1a`), not the plan's pre-drape mesh recipe — all lane vertices are authored in the XZ plane and draped per-vertex onto the terrain (depth-tested normally, no `depthTest:false`/renderOrder). Rails carry `lengthSegments` so the drape follows terraces across an up-to-8u lane.
- **Ceiling held via carve:** the lane branch pushed `createTelegraphSystem.ts` to 322 functional LOC — extracted the pure geometry builders into `telegraphShapes.ts` (createTelegraphSystem back to 263, shapes 67).
- **Green gates:** `serverSync` 165/165, full suite 582/582, `pnpm build` (tsc -b + vite) clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: Lane anchor arm + rectangle mesh construction** - `4f1806c` (feat)
2. **Task 2: Axis-aware fill scaling + lane re-cast rebuild rule** - `d685b7c` (feat)
3. **Carve (deviation Rule 3 — LOC ceiling):** telegraphShapes.ts extraction - `dc2a684` (refactor)

## Files Created/Modified

- `src/game/systems/createTelegraphSystem.ts` - lane arm in `anchorGroup` (cast anchor + cast->landing yaw), lane branch in `insert()` (merged outline + cast-origin fill, no mirror field), `fillAxis` field on `ActiveTelegraph`, axis-aware `update()` scaling, lane re-cast rebuild in `syncAttacks`; geometry builders + Frost geometry constants moved out
- `src/game/systems/telegraphShapes.ts` (new) - `flatRing`, `buildLaneOutline` (+ internal `flatStrip`/`mergeStripPositions`), and the `RIM_WIDTH`/`PROGRESS_RIM_WIDTH`/`RING_SEGMENTS`/`CONE_FILL_RINGS` constants; zero new deps

## Decisions Made

- **Follow the current drape architecture over the plan's mesh recipe** (drift warning honored): the plan and PATTERNS.md were written at `a1b6f1e`, before the user's `3f7be1a` drape rework. Lane geometry is baked into the XZ plane and draped per-vertex, depth-tested normally — the plan's `depthTest:false` + renderOrder 999/1000 recipe no longer exists in the file. Honored the plan's INTENT (D6-11 rectangle, outline + sweeping fill + rim flash, cast anchor + aim yaw, axis-only fill scale, re-cast rebuild) against the current seams.
- **Outline as one merged BufferGeometry, not four separate meshes** — the shared `drapeToGround`/`flash` operate on a single `telegraph.outline` mesh, so the rectangle perimeter is built from subdivided plane strips concatenated by a local `mergeStripPositions` (no `BufferGeometryUtils` import — that module is not in the project and zero-new-deps is locked). Rails span the full length (covering corners); end caps span only the inner gap so the additive material never double-brightens the corners.
- **Subdivided rails/fill for drape fidelity** — terrain terraces at 1.8u over a ~1.9u terrain-mesh resolution, so an 8u lane needs `Math.round(length)` length segments or the frame's long edges would clip through/float over the ground between corner samples (matching the circle's 48-segment / cone's 8-ring drape density philosophy).
- **Carve telegraphShapes.ts** — the plan's conditional LOC rule tripped (322 > 300 functional); extracted the pure geometry builders as a single-job module (PATTERNS "Conditional Carve-Outs").

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking / plan-conditional] Carved telegraphShapes.ts to hold the ≤300 LOC ceiling**
- **Found during:** Task 1 (lane branch construction)
- **Issue:** the lane branch + geometry helpers pushed `createTelegraphSystem.ts` to 322 functional LOC, over the CLAUDE.md / plan ≤300 ceiling
- **Fix:** extracted `flatRing` + `buildLaneOutline` (+ internal `flatStrip`/`mergeStripPositions`) and the Frost geometry constants into `src/game/systems/telegraphShapes.ts`, imported back — pure extraction, no behavior change (createTelegraphSystem 322 -> 263 functional LOC)
- **Files modified:** src/game/systems/createTelegraphSystem.ts, src/game/systems/telegraphShapes.ts
- **Verification:** typecheck clean, serverSync 165/165, full suite 582/582, build green
- **Committed in:** `dc2a684` (refactor)

**2. [Adaptation - drift] Lane geometry uses the current terrain-drape recipe, not the plan's pre-drape mesh settings**
- **Found during:** Task 1
- **Issue:** the plan / PATTERNS.md prescribed `outline.rotation.x = -PI/2`, `flatMaterial` with `depthTest:false` + renderOrder 999/1000 — none of which exist after the user's `3f7be1a` drape rework
- **Fix:** authored lane geometry in the XZ plane (rotateX baked in) and draped it per-vertex via the existing `drapeToGround`, depth-tested normally, exactly like the reworked circle/cone branches
- **Files modified:** src/game/systems/createTelegraphSystem.ts
- **Verification:** typecheck + build green; on-screen legibility deferred to the 06-05 playtest (RESEARCH A3)
- **Committed in:** `4f1806c` (Task 1 commit)

---

**Total deviations:** 1 plan-conditional carve (Rule 3) + 1 documented drift adaptation
**Impact on plan:** The carve was explicitly authorized by the plan's LOC rule; the drape adaptation was mandated by the drift warning (current file wins over stale plan line numbers/material recipe). Plan INTENT (D6-11) fully honored. No scope creep.

## Issues Encountered

- **Concurrent user commit mid-execution:** the working tree started with an in-progress USER audio refactor (App.tsx, createGame.ts, createAudioSystem.ts + new audioCore.ts/createCombatAudio.ts). The user committed that work as `d9573bc` while this plan ran; it became the parent of this plan's commit stack. This executor never staged, modified, reverted, or touched any of those files — all four commits here touch ONLY `createTelegraphSystem.ts` and `telegraphShapes.ts` (verified via `git show --stat`).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The lane telegraph now renders end-to-end from server rows: `row.castX/Z` (anchor), `row.landingX/Z` (yaw + length), `row.radius` (half-width), `startedAtMicros`/`strikeAtMicros` (fill timing). 06-03 populates all of these.
- 06-05 (playtest capstone) owns: pixel-filter legibility sign-off (RESEARCH A3), the three queued seed-deviation rulings (slam band 5.5, size-2 lane 7.95, no half-width mirror), the size-2 no-teleport check (Pitfall 2), and the exclusive full-suite/full-build gate.
- No deploy in this plan — the module was already published locally by 06-03; this is a client-render-only change (`pnpm build` serves fresh `dist/`).

---
*Phase: 06-shielddash-lane*
*Completed: 2026-07-11*

## Self-Check: PASSED

Both source files present (telegraphShapes.ts created, createTelegraphSystem.ts modified) + SUMMARY on disk; all three task commits (4f1806c, d685b7c, dc2a684) found in git log. No foreign files staged in any commit (verified via git show --stat).
