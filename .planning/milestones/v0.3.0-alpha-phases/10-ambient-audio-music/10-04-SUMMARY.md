---
phase: 10-ambient-audio-music
plan: 04
subsystem: audio
tags: [webaudio, procedural-sfx, footsteps, ambience, grass, movement-audio]
status: complete

# Dependency graph
requires:
  - phase: 10-ambient-audio-music (10-02)
    provides: buses.sfx() — the shared SFX bus the rustle routes through (getSfxBus seam)
  - existing: audioCore.createNoiseSource / jitter / panned / clampGain (the procedural burst primitives reused verbatim)
  - existing: createMovementAudio playPlayerStep noise-burst idiom + underSpamBudget guard (the analog mirrored)
provides:
  - createMovementAudio.playGrassRustle — a breathy high-band (2.6kHz bandpass) procedural noise wash layered under the local player's own footstep over grass
  - updateUnit optional `surface?: 'grass'` param → threads terrain to playStep; rustle only fires for the player kind, shares the global footstep spam budget, routed via getSfxBus()
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Reused the createNoiseSource→biquad→gain burst recipe (same idiom as playPlayerStep) — no new subsystem
    - Layered the rustle onto the EXISTING step emission so it inherits underSpamBudget for free (a crowded frame never rains)
    - Cheap terrain flag from an already-available signal (isGrounded()) — no GPU texture read, no per-frame allocation (client-perf rules)

key-files:
  created: []
  modified:
    - src/game/audio/createMovementAudio.ts
    - src/game/createGame.ts

key-decisions:
  - "Rustle is a bandpass (2.6kHz, Q 0.7) breathy swish, NOT a lowpass — sits in a distinct high band ABOVE the low step tap so the two layers read separately (a wider, airier leaf-brush)"
  - "GRASS_RUSTLE_PEAK = 0.05, well below PLAYER_STEP_PEAK 0.12 — felt under the footstep, not heard as a separate sound"
  - "Longer/softer envelope (0.14s attack-0.03/decay) vs the 0.06s tap — breathier, matches leaves brushing past rather than a discrete tick"
  - "onGrass derived from isGrounded() alone: the grounded local-player step call already gates on it, and the whole walkable island is grass. No terrain-type read (road exclusion deferred — plan explicitly allows the cheap approximation)"
  - "isMoving is handled implicitly — updateUnit only emits a step (and thus the rustle) once travel crosses a stride length, so a stationary grounded player is silent with no extra check"
  - "surface threaded as an optional trailing param on updateUnit → other callers (enemies, goliaths, remote players) are byte-for-byte unaffected"

metrics:
  duration: ~12 min
  tasks: 1
  files: 2
  completed: 2026-07-18
---

# Phase 10 Plan 04: Grass Rustle Summary

Grass rustle (AMBI-04, D-06): the local player now hears a soft procedural grass-rustle burst layered
under their footsteps while moving over grass, routed through the Wave-1 sfx bus. Pure procedural
synthesis reusing the module's existing noise-burst recipe — no new subsystem, no assets, no GPU
readback.

## What Was Built

**Task 1 — rustle layer in `createMovementAudio` + the createGame grass flag.**

- **`playGrassRustle(context, level, out, now)`** — a new burst mirroring the `playPlayerStep` idiom: a
  `createNoiseSource(0.14)` wash through a `bandpass` biquad (2.6kHz × `jitter(0.2)`, `Q 0.7`) into a
  gain that ramps up to `GRASS_RUSTLE_PEAK` (0.05) over 30ms then decays to silence at 140ms. It sits in
  a distinct high band above the low `800Hz`-lowpassed step tap and peaks well below it, so it reads as
  a breathy leaf-brush felt under the footstep rather than a competing sound.
- **`surface?: 'grass'`** threaded as an optional trailing param on `updateUnit` (and the
  `MovementAudio` interface) → forwarded into the private `playStep`. When a player step actually fires
  and `surface === 'grass'`, `playGrassRustle` is layered onto the same `out` node
  (`panned(context, pan, sfxBus)`), so it routes through **`getSfxBus()`** (never the raw destination)
  and rides the **same `underSpamBudget` guard** as the tap — a crowded frame drops both together, never
  turning to rain. Enemy/goliath/remote-player callers pass no `surface` and are unaffected.
- **`createGame` (grounded local-player step, ~line 1287)** now passes `'grass'` as the `surface` arg.
  The signal is cheap: the call already gates on `isGrounded()`, and the walkable island is grass — no
  terrain texture read, no per-frame allocation. Movement is handled implicitly because `updateUnit`
  only emits a step (and thus the rustle) once travel crosses the player stride length, so a stationary
  grounded player stays silent.

## Verification

- **Full suite:** `npx vitest run` → 790 passed, 1 failed — the failure is the **pre-existing,
  unrelated** `grassPlacement.test.ts > "clusters blades into lush meadow patches only"` (world
  grass-blade geometry, not audio). Re-confirmed pre-existing by `git stash`-ing this plan's change and
  re-running on the clean tree (still red). Logged in `deferred-items.md`; not fixed (scope boundary).
- **Greps:** `getSfxBus` present in `createMovementAudio.ts`; `surface|rustle|Rustle` present.
- **Typecheck:** `tsc -b` (the real project build — the root `tsconfig.json` is a solution file with
  `files: []`, so the plan's `tsc --noEmit -p tsconfig.json` checks nothing and trivially reports 0)
  → **0 errors**.
- **LOC budget:** `createMovementAudio.ts` = 287 total / ~224 functional lines, ≤300 (CLAUDE.md).

## Deviations from Plan

**None functional — plan executed as written.** One process note:

1. **Pre-existing out-of-scope test failure (NOT introduced here).** `grassPlacement.test.ts` fails on
   the full suite; confirmed pre-existing on the stashed clean tree. This plan touches only
   `createMovementAudio.ts` + one call in `createGame.ts` (audio-only); grassPlacement is not in the
   diff. Logged in `deferred-items.md`, not fixed (scope boundary).

## Known Stubs

None. The rustle is fully wired end-to-end: procedural synth → sfx bus → destination, triggered by the
live grounded player-step call. No placeholder data, no unwired path.

## Notes for Downstream Plans

- **Terrain-precise grass detection (optional future refinement):** `onGrass` is currently the cheap
  approximation "grounded on the walkable island". If a later plan wants the rustle to fall silent on
  the cobblestone road, thread a real terrain-type lookup — but keep it a cheap already-computed signal
  (no GPU texture read), per client-perf rules.
- **Manual playtest:** audio is gesture-gated WebAudio, so verify by ear — walking over grass should add
  a soft airy swish under the footstep tap, silent when standing still or airborne.

## Self-Check: PASSED

- `src/game/audio/createMovementAudio.ts` and `src/game/createGame.ts` — both modified and FOUND on disk.
- Commit `a7b0650` (Task 1) — FOUND in `git log`.
- `tsc -b` clean; rustle greps pass; suite green except the documented pre-existing grassPlacement failure.
