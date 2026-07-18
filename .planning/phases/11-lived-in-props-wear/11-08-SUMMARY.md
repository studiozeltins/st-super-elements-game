---
phase: 11-lived-in-props-wear
plan: 08
subsystem: rendering
tags: [three, dust, surface-classifier, footstep-audio, wiring, perf-bisect, wear]

# Dependency graph
requires:
  - phase: 11-lived-in-props-wear
    provides: "createDustPuffs(scene, getGroundHeight) pooled dust InstancedMesh (Plan 04)"
  - phase: 11-lived-in-props-wear
    provides: "surfaceAt(x,z) + Surface tag type — the shared ground-surface classifier (Plan 06)"
provides:
  - "Live footstep dust wired into the game loop (spawns on dirt/path/town, never grass)"
  - "Surface-aware footstep audio (real surfaceAt value, no longer hard-coded 'grass')"
  - "?nodust perf-bisect flag (skips dust-pool construction entirely)"
affects: [createGame, createMovementAudio, dust, wear, footstep-audio]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One classifier call per frame at the grounded player step, shared via a closure var between the spawn site (updateLocalPlayer) and the audio site (updateFootsteps, runs later same frame) — surfaceAt never called twice"
    - "FootstepSurface re-exported from surfaceAt.Surface so dust + audio can never drift on the tag set (single source of truth)"
    - "?nodust follows the established ?no* convention: gate on flag → skip construction (zero objects, clean FPS bisect)"

key-files:
  created: []
  modified:
    - src/game/audio/createMovementAudio.ts
    - src/game/createGame.ts

key-decisions:
  - "FootstepSurface = Surface (re-export, not a duplicated union) — one tag set for dust + audio, no-legacy"
  - "surfaceAt computed inside the grounded player-step block (moving && grounded) — at most once/frame; playerSurface closure var carries it to the footstep audio call in updateFootsteps"
  - "Dust gate is moving && grounded && surface !== 'grass' — no sprint state exists (grep-verified); spawn uses worldMoveX/Z already in scope at the wear-stamp site"

requirements-completed: [WEAR-05]

coverage:
  - id: WIRE-1
    description: "FootstepSurface widened to the four surfaceAt tags; grass-rustle still fires only on grass"
    requirement: WEAR-05
    verification:
      - kind: suite
        ref: "pnpm exec vitest run (837 tests, 54 files)"
        status: pass
      - kind: typecheck
        ref: "tsc -b clean"
        status: pass
    human_judgment: false
  - id: WIRE-2
    description: "Dust pool + surfaceAt + ?nodust wired into createGame; dust spawns on non-grass only, audio uses real surface, one classify/frame, update + dispose wired"
    requirement: WEAR-05
    verification:
      - kind: suite
        ref: "pnpm exec vitest run (837 tests, 54 files)"
        status: pass
      - kind: typecheck
        ref: "tsc -b clean"
        status: pass
    human_judgment: false
  - id: WEAR-05-perceptual
    description: "[human-verify] Dust subtle + ground-hugging on dirt/path/town only; grass never puffs; ?nodust disables it; FPS holds with all ambiance enabled (golem-class fight, scripts/fps_playtest.py)"
    requirement: WEAR-05
    verification:
      - kind: manual
        ref: "11-08-PLAN.md Task 3 checklist (phase-wide WEAR-01..05 perceptual + FPS gate)"
        status: deferred
    human_judgment: true

# Metrics
duration: 3min
completed: 2026-07-18
status: complete
---

# Phase 11 Plan 08: Dust + Surface Wiring Summary

**The Phase 11 integration point — worn-path dust, surface-aware footsteps, and a `?nodust` FPS bisect all wired into the game loop with a single per-frame `surfaceAt()` call shared by dust and audio; `createGame` stays wire-only, all logic lives in `createDustPuffs`/`surfaceAt`.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-07-18T12:14:00Z
- **Completed:** 2026-07-18T12:17:00Z
- **Tasks:** 2 code (Task 3 is a deferred human gate)
- **Files modified:** 2

## Accomplishments
- **Task 1 — FootstepSurface widened:** `export type FootstepSurface = Surface;` re-exports the four-tag union (`grass | dirt | path | town`) straight from `surfaceAt.ts`, so dust spawning and footstep audio share ONE tag set (D-13). The grass-rustle gate (`=== 'grass'`) is untouched, so dirt/path/town steps simply skip the rustle — no new audio code.
- **Task 2 — dust pool + surfaceAt + `?nodust` wired into `createGame`:**
  - `?nodust` added to the perf-flag comment; `const dustEnabled = !perfFlags.has('nodust')` beside `smokeEnabled`.
  - `const dustPuffs = dustEnabled ? createDustPuffs(scene, (x,z) => world.getGroundHeight(x,z)) : undefined;` beside the smoke construction — `?nodust` skips construction entirely (zero objects, clean bisect).
  - `surfaceAt(playerPosition.x, playerPosition.z)` computed EXACTLY ONCE per frame inside the grounded player-step block in `updateLocalPlayer`, stored in a `playerSurface` closure var.
  - Dust spawns only when `surface !== 'grass'` (moving + grounded is the whole gate — no sprint state exists), reusing `worldMoveX/worldMoveZ` already in scope.
  - The hard-coded `'grass'` in the footstep `movementAudio.updateUnit(...)` call is replaced with the shared `playerSurface` (D-13) — the audio site (`updateFootsteps`) runs later in the same frame and reads the value with no second `surfaceAt` call.
  - `dustPuffs?.update(deltaSeconds)` after the smoke update line; `dustPuffs?.dispose()` beside the smoke dispose at teardown.

## Task Commits

1. **Task 1:** `aee28bc` — feat(11-08): widen FootstepSurface to surfaceAt's four-tag Surface
2. **Task 2:** `58805ea` — feat(11-08): wire dust pool + surfaceAt + ?nodust into game loop

## Files Created/Modified
- `src/game/audio/createMovementAudio.ts` — `FootstepSurface` re-exported from `surfaceAt.Surface`; stale `'grass'`-only JSDoc updated.
- `src/game/createGame.ts` — `?nodust` flag + comment, conditional `createDustPuffs` construction, one-per-frame `surfaceAt` classify shared via `playerSurface`, non-grass dust spawn at the wear-stamp site, real surface into footstep audio, dust `update` + `dispose` wiring. Imports `createDustPuffs` + `surfaceAt`/`Surface`.

## Decisions Made
- **Re-export over duplicate union:** `FootstepSurface = Surface` keeps a single tag set (no-legacy) instead of maintaining two identical unions that could silently drift.
- **Classify once at the grounded step, share via closure var:** the spawn site (`updateLocalPlayer`) and the audio site (`updateFootsteps`) are different functions but run in a fixed order within `frame()`; a `playerSurface` closure var carries the single computed value across, so `surfaceAt` is called at most once per frame (D-12) and dust + audio can never disagree. When airborne/idle the value is simply not refreshed, which is correct since no step fires then.
- **Gate = moving && grounded && non-grass:** confirmed no sprint state exists; the wear-stamp block (already `if (isMoving)` → `if (isGrounded())`) is the natural spawn site with `worldMoveX/Z` in scope.

## Deviations from Plan
None — plan executed exactly as written (wire-only; all dust logic stayed in `createDustPuffs`).

## Deferred / Human Verification (Task 3 — `--auto` policy)

Task 3 is a `checkpoint:human-verify` (blocking, `autonomous: false`): the phase-wide perceptual + FPS gate. Per this project's `--auto` policy (Phase 8 precedent, 08-05), all code-wiring is complete and the automated suite + typecheck are green, so the human/FPS gate is **DEFERRED to `/gsd-verify-work`** rather than blocking the run. No human result is fabricated.

**Steps for the human (run on the LAN build — `pnpm build`, laragon-served page, NOT the dev server):**
1. **WEAR-01** — Walk camp↔plaza↔bridge routes: footpaths read worn/trampled (lighter, greener tint than packed-dirt roads; grass thinned but blades still poke through) and never fade.
2. **WEAR-02** — Inspect the plaza: crates/barrels stacked at the market edge facing the fountain, fences at path/plaza gaps; arrangement reads deliberate and you path around props.
3. **WEAR-03/04** — Fight to scorch the ground, leave and return after ~1–3 min (scorch visible on quick return, healed after longer); while running, watch your own grass-bend trail fade in ~2s.
4. **WEAR-05** — Run over grass (NO dust) vs dirt/path/town (subtle ground-hug puffs, not a spray). Append `?nodust` to the URL and confirm the puffs disappear (bisect flag works).
5. **Perf gate** — Run `scripts/fps_playtest.py` in a golem-class fight with wind + day/night + audio + wear all enabled; confirm no FPS regression vs baseline (toggle `?nodust` to isolate dust cost if needed).

Resume signal for the verifier: "approved" or itemized per-requirement failures.

## Issues Encountered
None. Typecheck (`tsc -b`) clean and the full 837-test / 54-file suite green after both tasks.

## User Setup Required
None — client-only cosmetic wiring, no external service or server publish.

## Next Phase Readiness
- Phase 11 code is complete: worn footpaths (Plans 02/05), plaza props (03/07), bend-trail + regrowth tuning (01), dust pool (04), surface classifier (06), and this integration (08). The only outstanding Phase 11 item is the deferred human perceptual + FPS gate above, to be cleared in `/gsd-verify-work`.

## Self-Check: PASSED
- FOUND: src/game/systems/createDustPuffs.ts (consumed)
- FOUND: src/game/systems/surfaceAt.ts (consumed)
- FOUND commit: aee28bc (Task 1)
- FOUND commit: 58805ea (Task 2)
- Suite: 837 passed / 54 files; typecheck: tsc -b clean

---
*Phase: 11-lived-in-props-wear*
*Completed: 2026-07-18*
