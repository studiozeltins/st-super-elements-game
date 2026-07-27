---
phase: 13-camera-feel
plan: 03
subsystem: rendering
tags: [three, camera, spring, character-model, lean, breathing, accessibility]

# Dependency graph
requires:
  - phase: 13-camera-feel
    plan: 01
    provides: "cameraFeelMath.ts pure twin — smooth spring, leanTarget, breatheOffset, CAMERA_FEEL"
provides:
  - "createCharacterModel.animate 4th optional MotionConfig arg — local-only run-lean + idle breathing"
  - "MotionConfig interface { reduceMotion, pixelScale } exported for createGame to build the scratch"
  - "leanX per-model spring state on bodyPivot.rotation.x (facing frame, conflict-free with swings)"
  - "idle breathing on bodyPivot.position.y via breatheOffset"
affects: [13-04 reduce-motion toggle + createGame wiring of MOTION_CFG_SCRATCH]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional trailing MotionConfig arg makes the effect local-only by construction — remote 3-arg callers are byte-identical"
    - "Lean/breathing ride the free bodyPivot.rotation.x / .position.y channels; swings write only .rotation.y — no channel conflict"
    - "All magnitude/zeroing/scaling delegated to cameraFeelMath — no tunables duplicated in the renderer"

key-files:
  created: []
  modified:
    - src/game/entities/createCharacterModel.ts

key-decisions:
  - "13-03: MotionConfig is an optional TRAILING parameter on animate — the presence of the arg IS the local/remote switch (D-05), so remote models need no flag and stay unchanged"
  - "13-03: leanX is per-model closure state (not shared) so a future remote-breathing extension keeps independent springs"
  - "13-03: lean rides bodyPivot.rotation.x (child of the yaw-facing group → pitches in the FACING frame, never world-space group.rotation.x — Pitfall 1); breathing stays positional (.position.y), never rotational, and no texel-snapping (D-02)"

requirements-completed: [CAM-01, CAM-02, CAM-04]

coverage:
  - id: D1
    description: "animate accepts optional MotionConfig; local path springs bodyPivot.rotation.x toward leanTarget and sets bodyPivot.position.y to breatheOffset"
    requirement: CAM-01
    verification:
      - kind: build
        ref: "npx tsc -b clean"
        status: pass
      - kind: manual
        ref: "13-04 manual playtest — lean reads right running E/W and N/S"
        status: deferred
    human_judgment: true
  - id: D2
    description: "idle breathing sway on bodyPivot.position.y gated on !isMoving via breatheOffset"
    requirement: CAM-02
    verification:
      - kind: build
        ref: "npx tsc -b clean"
        status: pass
      - kind: manual
        ref: "13-04 manual playtest — standing breathing calm and crawl-free in pixel mode"
        status: deferred
    human_judgment: true
  - id: D3
    description: "reduce-motion zeroes both lean and breathing; pixelScale scales magnitude — inherited from cameraFeelMath (18/18 green)"
    requirement: CAM-04
    verification:
      - kind: unit
        ref: "src/game/systems/__tests__/cameraFeelMath.test.ts (leanTarget/breatheOffset reduce-motion + pixel-scale cases)"
        status: pass
    human_judgment: false

# Metrics
duration: 4min
completed: 2026-07-20
status: complete
---

# Phase 13 Plan 03: Model Lean + Idle Breathing Summary

**`createCharacterModel.animate` gained an optional trailing `MotionConfig` arg that springs a forward run-lean onto `bodyPivot.rotation.x` and a slow idle-breathing sway onto `bodyPivot.position.y` — local-player-only by construction, all math delegated to the 13-01 `cameraFeelMath` twin (reduce-motion + pixel-scale inherited).**

## Performance

- **Duration:** ~4 min
- **Completed:** 2026-07-20
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Extended `CharacterModel.animate` (interface + impl) with a 4th optional `motion?: MotionConfig` parameter.
- Added and exported the `MotionConfig { reduceMotion: boolean; pixelScale: number }` interface so `createGame` (13-04) can build the reused scratch object.
- Added per-model `let leanX = 0` spring state beside the existing swing state; the local path closes `leanX` toward `leanTarget(...)` at `CAMERA_FEEL.LEAN_K` each frame and writes it to `bodyPivot.rotation.x`.
- Wrote `bodyPivot.position.y = breatheOffset(...)` for the idle breathing sway.
- Remote/3-arg callers are byte-identical — the `if (motion)` guard means no config = no lean, no breathing.
- `npx tsc -b` clean; `cameraFeelMath` twin still 18/18 green.

## Task Commits

1. **Task 1: Model lean spring + idle breathing on the free bodyPivot channels** - `5b0ac23` (feat)

_TDD note: this plan is thin renderer wiring over the already-behavior-pinned `cameraFeelMath` twin (18 tests, 13-01). The tunable math (spring monotonicity, lean/breathing bounds, reduce-motion + pixel-scale zeroing) is unit-tested at the pure seam; the model-wiring correctness (facing-frame lean, channel non-conflict, calm pixel-mode breathing) is verified by build + grep here and by the 13-04 manual perceptual playtest. No new renderer test was added — it would require a three.js scene mock and would only re-assert the already-tested twin._

## Files Created/Modified
- `src/game/entities/createCharacterModel.ts` - `animate` extended with optional `MotionConfig`; per-model `leanX` spring on `bodyPivot.rotation.x`; breathing on `bodyPivot.position.y`; import of `smooth`/`leanTarget`/`breatheOffset`/`CAMERA_FEEL` from `../systems/cameraFeelMath`.

## Decisions Made
- `MotionConfig` is an optional **trailing** parameter — its presence IS the local/remote switch (D-05). Remote models need no extra flag; they simply keep calling `animate(elapsed, delta, isMoving)` and are unaffected.
- `leanX` is per-model closure state (not module-shared) so a future remote-breathing extension keeps independent springs.
- Lean rides `bodyPivot.rotation.x` — `bodyPivot` is a child of the yaw-facing `group`, so `.x` pitches in the FACING frame, avoiding the world-space Euler trap (Pitfall 1). Breathing stays positional (`.position.y`), never rotational (D-03). No texel-snapping on either value (D-02) — pixel-crawl is handled by the conservative `PIXEL_SCALE`, not quantization.
- Lean/breathing use `bodyPivot.rotation.x` / `.position.y`; swings write only `bodyPivot.rotation.y` — provably conflict-free.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## Known Stubs
None — the effect is fully wired at the model seam. The remaining step is 13-04 passing the reused `MOTION_CFG_SCRATCH` into the LOCAL `animate()` call (explicitly scoped to 13-04, not a stub of this plan).

## User Setup Required
None.

## Next Phase Readiness
- `MotionConfig` is exported and the local path is live. 13-04 builds a reused scratch `{ reduceMotion, pixelScale }` (fed from the persisted reduce-motion toggle + pixel-mode flag) and passes it into the LOCAL player's `animate()` call only.
- Perceptual correctness (lean reads right running E/W as well as N/S; standing breathing is calm and crawl-free in pixel mode) is the 13-04 manual playtest gate — out of scope for this wiring plan.

## Threat Flags
None — client-side model animation only; no input crosses a trust boundary. T-13-03a (pixel-crawl DoS) is mitigated by the positional (non-rotational) sway + conservative `PIXEL_SCALE`, validated at the 13-04 playtest.

## Self-Check: PASSED
- FOUND: src/game/entities/createCharacterModel.ts
- FOUND: commit 5b0ac23

---
*Phase: 13-camera-feel*
*Completed: 2026-07-20*
