---
phase: 08-wind-core
plan: 01
subsystem: world-ambiance
tags: [wind, pure-helper, tdd, glsl-generation, vitest]
requires: []
provides:
  - "windMath.ts exported constants: SWAY (nine grass literals verbatim), GUST, WANDER, CANOPY, FLAG"
  - "Pure functions: sampleWind, gustEnvelope, gustAt, windAngle, gustGainFactor"
  - "GLSL snippet generators swayGlsl/gustGlsl built from the same constants"
affects:
  - 08-02 (grass extraction consumes SWAY + swayGlsl/gustGlsl)
  - 08-03/08-04/08-05 (canopy, flags, smoke consume CANOPY/FLAG/gustAt)
  - Phase 10 audio (gustEnvelope contract), Phase 12 butterflies (sampleWind)
tech-stack:
  added: []
  patterns:
    - "Zero-import pure helper, test-first (pure-helper testing discipline)"
    - "GLSL text generated from exported JS constants via toFixed(4) — shader/CPU single source of truth"
    - "Product-of-3-incommensurate-sines gust envelope; retarded-time traveling front"
key-files:
  created:
    - src/game/systems/windMath.ts
    - src/game/systems/__tests__/windMath.test.ts
  modified: []
decisions:
  - "GUST periods tuned to 9/10/22s (RESEARCH's 37/23/53s starting values failed the cadence spec with gaps up to 369s); the test is the spec per plan discretion grant"
  - "WANDER tuned to a1=0.25/T=600s + a2=0.12/T=1300s — max rate 0.0032 rad/s (~11 deg/min), inside the 0.0035 test bound"
metrics:
  duration: ~6 min
  completed: 2026-07-13
  tasks: 2
  files: 2
status: complete
---

# Phase 8 Plan 01: Wind Math Pure Helper Summary

Zero-import windMath.ts pins the traveling gust front and non-metronomic 30-60s cadence with 13 behavioral vitest assertions written test-first, exporting the nine grass sway literals verbatim plus GLSL generators so shader and CPU math share one constant source.

## What Was Built

- **`src/game/systems/windMath.ts`** (165 lines, zero imports, no RNG):
  - `SWAY` — the nine grass shader literals verbatim (1.7 / 0.35 / 0.25 / 3.3 / 0.7 / 0.4 / 0.85 / 0.55 / 0.09), the D-01 extraction contract for Plan 02.
  - `GUST` — envelope shape (periods 9/10/22s, sharpness 3.0, gain 1.6, speed 12 u/s, wavelength 40u).
  - `WANDER` — direction drift (base 0.6 rad + 0.25·sin(2π t/600) + 0.12·sin(2π t/1300)).
  - `CANOPY` / `FLAG` — per-consumer character constants (canopy 0.4×, flag 2.5× grass frequency per WIND-03).
  - `sampleWind` (JS mirror of the grass two-octave GLSL), `gustEnvelope` (0..1, ~86% of samples below 0.05 — gusts are events), `gustAt` (retarded-time traveling front), `windAngle` (deterministic wander), `gustGainFactor` (1 at strength 0; 2.6 at full-strength peak).
  - `swayGlsl` / `gustGlsl` — GLSL expression text generated from the SAME constants via a `toFixed(4)` float formatter (grass `:118` precedent — raw ints break GLSL compile).
- **`src/game/systems/__tests__/windMath.test.ts`** — 13 tests / 28 assertion call sites covering: SWAY exact pins, sampleWind formula mirror, envelope bounds + rest fraction, peak cadence (every gap ∈ [20,90]s, mean ∈ [30,60]s, spread > 5s), rigid front translation (|Δ| < 1e-9), windAngle determinism + rate ≤ 0.0035 rad/s + ≥0.035 rad range per 10-min window, gustGainFactor kill/gain, FLAG > grass > CANOPY ordering, GLSL literal rendering.

## TDD Gate Compliance

- RED: `c234a47` — test file committed failing (module `../windMath` did not exist; vitest exit 1).
- GREEN: `2908c4a` — implementation committed with all 13 tests passing.
- REFACTOR: not needed — implementation landed clean on first green pass.

## Verification

- `pnpm vitest run src/game/systems/__tests__/windMath.test.ts` — 13/13 green in ~4s.
- `pnpm vitest run` — full suite 44 files / 696 tests green (no other suite disturbed).
- Acceptance greps: 0 `^import`, 0 `Math.random`, 5 exported const groups, 7 exported functions, ≥15 assertions, no `.skip`/`.todo`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] RESEARCH Pattern 3 starting GUST periods failed the cadence spec**
- **Found during:** Task 2 (pre-validated numerically before RED to avoid GREEN churn)
- **Issue:** The suggested 37/23/53s periods produce inter-peak gaps up to 369s (mean 125s) — far outside the plan's [20, 90]s per-gap and [30, 60]s mean bounds.
- **Fix:** Grid-searched incommensurate period triples over a simulated hour; selected 9/10/22s at sharpness 3 → gaps [31.0, 54.6]s, mean 44.8s, spread 23.6s, rest fraction 86%. Explicitly sanctioned by the plan: "Tune sharpness/periods until the cadence test passes — the TEST is the spec."
- **Files modified:** src/game/systems/windMath.ts
- **Commit:** 2908c4a

**2. [Rule 1 - Bug] RESEARCH WANDER example exceeded the rate bound**
- **Found during:** Task 2 (same pre-validation)
- **Issue:** RESEARCH's `a1=0.20/T=170s + a2=0.12/T=311s` gives max rate 0.0098 rad/s — ~3× over the 0.0035 rad/s test bound.
- **Fix:** Retuned to `a1=0.25/T=600s + a2=0.12/T=1300s` → max rate 0.0032 rad/s with 0.35 rad range per 10-min window (bound: 0.035).
- **Files modified:** src/game/systems/windMath.ts
- **Commit:** 2908c4a

## Known Stubs

None — the module is complete; no placeholder values or unwired paths.

## Success Criteria Status

- Wave 0 gap from 08-VALIDATION.md closed: windMath.test.ts exists and is green ✓
- WIND-02 math (traveling front, non-metronomic cadence) proven by unit test before any renderer code exists ✓
- The nine grass constants live in exactly one place, exported, ready for the Plan 02 extraction ✓

## Self-Check: PASSED

- FOUND: src/game/systems/windMath.ts
- FOUND: src/game/systems/__tests__/windMath.test.ts
- FOUND commit: c234a47 (test)
- FOUND commit: 2908c4a (feat)
