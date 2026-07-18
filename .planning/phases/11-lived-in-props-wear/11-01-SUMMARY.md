---
phase: 11-lived-in-props-wear
plan: 01
subsystem: grass/ground-influence
tags: [grass, wear, decay, tuning, tdd]
requires: []
provides:
  - "~2s grass-bend trail fade (DECAY_PER_FRAME_AT_60 = 0.980)"
  - "minutes-long scorch/wear healing (WEAR_REGROW_TIME_CONSTANT_SECONDS = 75)"
affects:
  - src/game/systems/groundInfluenceMath.ts
tech-stack:
  added: []
  patterns:
    - "Pure, THREE-free decay math pinned by frame-rate-independent composition tests"
    - "One shared time-constant read by both scorch (R) and wear (A) fade shaders"
key-files:
  created: []
  modified:
    - src/game/systems/groundInfluenceMath.ts
    - src/game/systems/__tests__/groundInfluenceMath.test.ts
decisions:
  - "Bend trail decay 0.985 -> 0.980 to hit the ~2s springy readable fade (D-04/D-05)"
  - "Wear/scorch regrow time constant 25s -> 75s so fresh damage still reads at ~1min and heals below 10% by ~2.88min (D-06)"
metrics:
  duration: ~6m
  completed: 2026-07-18
  tasks: 1
  files: 2
status: complete
requirements: [WEAR-03, WEAR-04]
---

# Phase 11 Plan 01: Retune Ground-Influence Decay Constants Summary

Retuned the two shared ground-influence decay constants so the grass-bend trail reads a ~2s springy fade (WEAR-04) and scorch/wear heals over minutes (WEAR-03), re-pinning the stale unit test to the new feel in the same change.

## What Was Built

- **`DECAY_PER_FRAME_AT_60` 0.985 → 0.980** — the springy grass-bend trail now fades to a ~2s readable feel (`0.980^120 ≈ 0.089` at 2s, `≈ 0.026` by 3s), still visible at 1s (`≈ 0.30`). Doc comment updated in place.
- **`WEAR_REGROW_TIME_CONSTANT_SECONDS` 25 → 75** — trampled/scorched grass now still visibly reads on return (`exp(-60/75) ≈ 0.449` at 1min) and heals below 10% over a couple more minutes (`exp(-180/75) ≈ 0.091` at ~2.88min). Surrounding doc block rewritten to describe the τ=75 curve.
- **`groundInfluenceMath.test.ts`** — replaced the stale "regrows within about a minute" wear block (its `wearDecayForDelta(60) < 0.1` assertion is false at τ=75) with the new wear contract (>0.4 at 60s, <0.1 at 180s), and added a bend describe block pinning the ~2s feel. Existing composition / frame-rate-independence / "wear regrows slower than bend" tests all retained.

Both constants feed the existing per-frame ping-pong fade shaders unchanged — zero new per-frame cost, no wiring changes, no new exported symbols or files.

## Task Commits

| Task | Name | Type | Commit |
| ---- | ---- | ---- | ------ |
| 1 (RED) | Pin new bend/wear behavior in tests | test | 624e3f1 |
| 1 (GREEN) | Retune both decay constants in place | feat | 54b6c62 |

TDD gates satisfied: `test(...)` RED commit precedes the `feat(...)` GREEN commit. No refactor needed.

## Verification

- `pnpm exec vitest run src/game/systems/__tests__/groundInfluenceMath.test.ts` — 11/11 green (2 new assertions confirmed RED against the old constants before the retune).
- `pnpm test` (full suite) — 804/804 green across 51 files; no other test relied on the old constants.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- FOUND: src/game/systems/groundInfluenceMath.ts (DECAY_PER_FRAME_AT_60 = 0.980, WEAR_REGROW_TIME_CONSTANT_SECONDS = 75)
- FOUND: src/game/systems/__tests__/groundInfluenceMath.test.ts (new bend + wear assertions)
- FOUND commit: 624e3f1 (RED test)
- FOUND commit: 54b6c62 (GREEN retune)
