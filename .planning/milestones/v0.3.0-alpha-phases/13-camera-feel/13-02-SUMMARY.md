---
phase: 13-camera-feel
plan: 02
subsystem: rendering
tags: [three, camera, fov, shake, accessibility, zero-alloc]

# Dependency graph
requires:
  - phase: 13-camera-feel
    plan: 01
    provides: "cameraFeelMath.ts pure twin — smooth/startKick/stepFovKick/projectionActive/canKick/CAMERA_FEEL"
provides:
  - "createCameraFeel.ts — the single owner of all discretionary camera motion (FOV kick + combat shake)"
  - "CameraFeel interface: apply / kickFov / shake / setReduceMotion / setPixelScale"
  - "New home for the shake constants (SHAKE_DECAY_RATE=7, SHAKE_FLOOR=0.005) absorbed from createGame"
  - "Single gated updateProjectionMatrix() site pair (apply settle + setReduceMotion restore, D-07)"
affects: [13-03 createCharacterModel pixelScale, 13-04 createGame wiring + legacy shake deletion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Factory + interface + per-frame apply() (createWind convention), zero per-frame allocation"
    - "All spring/gate math delegated to the pure cameraFeelMath twin — no new spring idiom"
    - "updateProjectionMatrix gated in ONE auditable spot via projectionActive + a single settle frame"
    - "Reduce-motion has one home: no-ops future impulses AND snaps in-flight motion to 0 with one final rebuild"

key-files:
  created:
    - src/game/systems/createCameraFeel.ts
  modified: []

key-decisions:
  - "13-02: createCameraFeel owns the shake state now; the createGame block (shakeMagnitude/SHAKE_DECAY_RATE/SHAKE_FLOOR :1364-1404 + 5 assignment sites) is NOT yet deleted — that deletion + wiring is 13-04's scope per the plan's files_modified (this plan touches only the new file, so no duplication ships to a running build until 13-04 lands both halves together)"
  - "13-02: setPixelScale stores the factor but is otherwise a no-op here (forward-compatible); the pixel-mode magnitude is actually consumed by the 13-03 model. Guarded with `void pixelScale` so noUnusedLocals stays clean without dead-code suppression"
  - "13-02: apply() computes projectionActive against the PRIOR-frame wasActive, then recomputes wasActive after — so the exact-0 snap frame still gets its single settle rebuild, and the frame after is a true no-op"

requirements-completed: [CAM-03, CAM-04]

coverage:
  - id: D-07-gate
    description: "updateProjectionMatrix called ONLY when projectionActive true (apply) or on reduce-motion restore"
    requirement: CAM-03
    verification:
      - kind: manual-grep
        ref: "grep updateProjectionMatrix src/game/systems/createCameraFeel.ts — exactly 2 call sites (line 75 apply-gated, line 113 setReduceMotion restore); line 22 is doc"
        status: pass
    human_judgment: false
  - id: fov-kick
    description: "kickFov fires a two-phase FOV punch, rate-gated by KICK_COOLDOWN_S"
    requirement: CAM-03
    verification:
      - kind: unit
        ref: "src/game/systems/__tests__/cameraFeelMath.test.ts (delegated startKick/stepFovKick/canKick, 18/18 green)"
        status: pass
    human_judgment: false
  - id: reduce-motion
    description: "setReduceMotion(true) no-ops future kicks/shakes AND snaps in-flight fov+shake to 0 with one final rebuild"
    requirement: CAM-04
    verification:
      - kind: typecheck
        ref: "npx tsc -b clean; behavior pinned by inspection against Pitfall 6 (perceptual UAT deferred to phase gate)"
        status: pass
    human_judgment: true

# Metrics
duration: 2min
completed: 2026-07-20
status: complete
---

# Phase 13 Plan 02: createCameraFeel Summary

**`createCameraFeel.ts` — the single owner of all discretionary camera motion: the two-phase FOV kick (rate-gated + projection-gated, CAM-03) and the combat shake absorbed wholesale from createGame's block, with reduce-motion (CAM-04) zeroing both instantly. Every spring/gate decision delegates to the 13-01 `cameraFeelMath` twin; `apply()` mutates `desiredPosition` in place with zero per-frame allocation.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-07-20T17:59:01Z
- **Completed:** 2026-07-20T18:01:00Z
- **Tasks:** 1
- **Files modified:** 1 (created)

## Accomplishments
- `createCameraFeel({ camera, reduceMotion }): CameraFeel` factory following the `createWind` convention (factory + interface + per-frame `apply`, preallocated state, zero per-frame allocs).
- `apply(desiredPosition, dt)`: advances the FOV kick via `stepFovKick`, rebuilds the projection ONLY through the `projectionActive` gate + one settle frame (D-07), then adds the decaying shake offset to `desiredPosition` in place.
- `kickFov(now)`: reduce-motion guard + `canKick` rate gate (anti-strobe, D-06) → `startKick`.
- `shake(mag)`: reduce-motion no-op, else `Math.max` accumulation (the 5 call-site `Math.max` folds in here).
- `setReduceMotion(enabled)`: stores the flag and, when enabled, snaps `fovState`/`shakeMagnitude`/`wasActive` to rest, restores `camera.fov = BASE_FOV`, and issues ONE final `updateProjectionMatrix()` (Pitfall 6).
- `setPixelScale(n)`: stores the pixel-mode magnitude factor (renderer has no getter — RESEARCH A5), forward-compatible.
- Shake constants `SHAKE_DECAY_RATE=7` + `SHAKE_FLOOR=0.005` absorbed here as their new home.

## Task Commits

1. **Task 1: createCameraFeel factory — FOV kick + absorbed shake + reduce-motion owner** — `4d5f22c` (feat)

_TDD note: the behavior of this system is entirely delegated to `cameraFeelMath` (springs, cooldown, projection gate), which ships its own behavior-pinned vitest twin from 13-01 (18/18 green). This plan's own verification is `tsc -b` + the delegated suite staying green + a grep on the gated projection site — matching the plan's `<verify>`/`<verification>` blocks (no new test artifact was specified)._

## Files Created/Modified
- `src/game/systems/createCameraFeel.ts` — the single camera-motion owner consumed by createGame's updateCamera and the crit handlers once 13-04 wires it.

## Decisions Made
- The legacy shake block in `createGame.ts` (`shakeMagnitude`/`SHAKE_DECAY_RATE`/`SHAKE_FLOOR` at :1364–:1404 and the 5 `shakeMagnitude = Math.max(...)` assignment sites) is intentionally **NOT** deleted in this plan. The plan's `files_modified` lists only `createCameraFeel.ts`; the createGame wiring + legacy deletion is 13-04's atomic scope. Splitting the deletion out would leave createGame calling a non-existent owner mid-wave. Both halves land together in 13-04 — no duplication reaches a running build.
- `setPixelScale` stores the factor but is otherwise inert here (the pixel-mode magnitude is consumed by the 13-03 character model). Kept forward-compatible per the plan and guarded with `void pixelScale` so `noUnusedLocals` stays clean without a lint suppression.
- `apply()` evaluates `projectionActive(offset, wasActive)` against the **prior-frame** `wasActive`, then recomputes `wasActive` afterward — guaranteeing the exact-0 snap frame still gets its single settle rebuild and the following frame is a genuine no-op.

## Deviations from Plan
None — plan executed exactly as written. All five methods, the absorbed shake constants, the single gated projection site pair, and the pure-twin delegation are delivered; `tsc -b` clean and the delegated suite stays 18/18 green.

## Issues Encountered
None.

## Known Stubs
`setPixelScale` stores its argument without acting on it in this system — this is **intentional and documented in the plan** (`accept and store; forward-compatible`). The value is consumed by the 13-03 character model, not by any camera effect yet. Not a blocking stub for CAM-03/CAM-04.

## User Setup Required
None.

## Next Phase Readiness
- The camera-motion owner is ready. 13-04 wires `createCameraFeel` into `createGame.updateCamera` (calling `apply(desiredPosition, deltaSeconds)`), replaces the 5 `shakeMagnitude = Math.max(...)` sites with `cameraFeel.shake(...)`, routes crit handlers to `cameraFeel.kickFov(now)`, deletes the now-orphaned shake block, and drives `setReduceMotion` from the persisted toggle.
- No blockers. The perceptual pass (FOV feel, shake weight, toggle kills all motion instantly) is the phase-gate manual checklist, out of scope for this Wave-2 plan.

## Self-Check: PASSED
- FOUND: src/game/systems/createCameraFeel.ts
- FOUND: commit 4d5f22c

---
*Phase: 13-camera-feel*
*Completed: 2026-07-20*
