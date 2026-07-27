---
phase: 09-atmosphere-day-night
plan: 01
subsystem: rendering
tags: [three, day-night, keyframe-palette, vitest, pure-helper, bigint-clock]

# Dependency graph
requires:
  - phase: 08-wind-core
    provides: windMath.ts / windMath.test.ts pure-helper-twin precedent (zero-import THREE-free math + vitest suite)
provides:
  - dayNightMath.ts — THREE-free source of truth for the time-of-day phase (phase01), the 6-key day-weighted color/intensity palette (samplePalette), the night ≥45% exposure floor, and the lanternLevel/fireflyLevel dusk-gate scalars
  - dayNightMath.test.ts — 26-case vitest suite closing the sole Wave 0 gap (DAYNITE-01/02/03/04)
affects: [09-02-sky-gradient, 09-03-lanterns, 09-04-createDayNightCycle, 09-05-wiring, phase-12-fireflies]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-helper twin: zero-import (no THREE) deterministic math module unit-tested without a renderer; the createDayNightCycle wrapper (Plan 04) only lerps these numbers into scratch THREE.Colors"
    - "Keyframe palette: 6 as-const entries over phase [0,1); adjacent keys smoothstep-blended; first key === last key so the cycle wraps seam-continuously"
    - "bigint modulo BEFORE Number() for the time-of-day phase — precise at ~1.78e15 micros (D-08)"

key-files:
  created:
    - src/game/systems/dayNightMath.ts
    - src/game/systems/__tests__/dayNightMath.test.ts
  modified: []

key-decisions:
  - "Phase 0.00 anchored on deep night so the 0.99→0.00 seam is night→night (naturally flash-free); the wrap segment (last key at 0.82 → first key at 0.00) blends across phase+1"
  - "6 keyframes: night(0.00) → dawn(0.12) → day(0.30) → midday-peak(0.50) → dusk(0.66) → night(0.82); day band [0.12,0.50] flat, dusk ramp [0.50,0.82], dawn ramp [0.00,0.12]"
  - "Night held at ~50% of the day peak (sun 0.60 vs 1.20, hemi 0.45 vs 0.90) — clears the 45% floor with margin; the global min intensity across the WHOLE cycle equals the night value, so the floor holds at every phase, not just the night band"
  - "samplePalette returns fully-blended values (colors as per-channel-lerped hex ints) rather than (a,b,t) — the <behavior> contract tests assert on blended fields (night floor, wraparound continuity), so the math owns the blend; the wrapper still re-lerps into Colors for zero-alloc render"
  - "Day horizon key reuses the shipped fog hex 0x8ecae6 for continuity with the existing scene.fog"

patterns-established:
  - "Pattern: derive test reference values (DAY_PEAK_SUN/HEMI) from KEYFRAMES themselves so the night-floor assertion tracks the curve instead of a hard-coded literal"
  - "Pattern: provably-flat sub-bands ([0.15,0.48] day, [0.84,0.99] night) let lanternLevel === 0/=== 1 be asserted exactly, ramp bands assert monotonicity"

requirements-completed: [DAYNITE-01, DAYNITE-02, DAYNITE-03, DAYNITE-04]

coverage:
  - id: D1
    description: "phase01 — day-weighted 20-min phase in [0,1), bigint-modulo-before-Number precision at ~1.78e15 micros, negative-input guard, continuous wraparound"
    requirement: "DAYNITE-01"
    verification:
      - kind: unit
        ref: "src/game/systems/__tests__/dayNightMath.test.ts#phase01 wraparound / bigint-modulo precision / negative-input guard"
        status: pass
    human_judgment: false
  - id: D2
    description: "samplePalette — 6-key smoothstep keyframe blend, seam-continuous wraparound with no daylight flash"
    requirement: "DAYNITE-02"
    verification:
      - kind: unit
        ref: "src/game/systems/__tests__/dayNightMath.test.ts#samplePalette wraparound continuity / smoothstep endpoints and monotonicity"
        status: pass
    human_judgment: false
  - id: D3
    description: "Night exposure floor — sun+hemi intensity ≥ 45% of day peak across the night band AND the whole cycle (night is a palette, not darkness)"
    requirement: "DAYNITE-03"
    verification:
      - kind: unit
        ref: "src/game/systems/__tests__/dayNightMath.test.ts#night exposure floor"
        status: pass
    human_judgment: false
  - id: D4
    description: "lanternLevel 0 by day / 1 by night with monotonic dusk-up + dawn-down ramps; fireflyLevel gated to dusk/night (exposed, unconsumed)"
    requirement: "DAYNITE-04"
    verification:
      - kind: unit
        ref: "src/game/systems/__tests__/dayNightMath.test.ts#lanternLevel band boundaries / fireflyLevel dusk-night gate"
        status: pass
    human_judgment: false

# Metrics
duration: 12min
completed: 2026-07-14
status: complete
---

# Phase 9 Plan 01: dayNightMath Pure Twin Summary

**THREE-free day/night source of truth — bigint-modulo phase01, a 6-key day-weighted smoothstep palette held to a blue-moonlight ≥45% night floor, and lantern/firefly dusk-gate scalars — backed by a 26-case vitest suite closing the phase's sole Wave 0 gap.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-07-14
- **Tasks:** 2
- **Files created:** 2

## Accomplishments
- `dayNightMath.ts` — zero-import (not even THREE) module: `CYCLE_MICROS` (1_200_000_000n = 20 min), `phase01` (bigint modulo before Number, negative-guarded), `smoothstep`, `KEYFRAMES` (6 asymmetric day-weighted keys), `samplePalette` (smoothstep blend of every field, seam-continuous wrap), plus `NIGHT_FLOOR`, `Keyframe`/`DayNightPalette` types.
- Night palette is blue moonlight held at ~50% of the day peak — clears the D-03 45% floor with margin; the global minimum intensity across the whole cycle equals the night value, so the floor is proven at every phase.
- `dayNightMath.test.ts` — 26 cases mirroring `windMath.test.ts`: phase wraparound, ~1.78e15-micros modulo precision, negative guard, night-floor sweep, lantern band boundaries + dusk/dawn ramp monotonicity, firefly gate, smoothstep endpoints/monotonicity, seam continuity, and keyframe-structure contracts.

## Task Commits

1. **Task 1: Create dayNightMath.ts** — `e7840a4` (feat) — `pnpm exec tsc -b` clean
2. **Task 2: Create dayNightMath.test.ts** — `7e89b6b` (test) — 26/26 green in 2.35s; full suite 757/757 green

## Files Created/Modified
- `src/game/systems/dayNightMath.ts` - Pure phase/palette/scalar math, zero imports, the createDayNightCycle source of truth
- `src/game/systems/__tests__/dayNightMath.test.ts` - Exhaustive vitest suite (DAYNITE-01/02/03/04)

## Decisions Made
- Anchored phase 0.00 on deep night so the wrap seam is night→night and cannot flash daylight; the wrap segment blends the last key (0.82) toward the first key at phase+1.
- `samplePalette` returns fully-blended values (colors as per-channel sRGB-byte hex lerps) rather than an (a,b,t) triple, because the `<behavior>` contract asserts directly on blended fields (night floor, wraparound). The Plan-04 wrapper still re-lerps into preallocated Colors for the zero-alloc render path.
- Night ≈50% of day peak (sun 0.60/1.20, hemi 0.45/0.90) — deliberately above the 45% floor so pixel-filter quantization never dips a sampled frame under it.
- Day horizon keyframe reuses the shipped fog hex `0x8ecae6` for continuity with the existing `scene.fog`.

## Deviations from Plan

None - plan executed exactly as written. (One self-authored test assertion was initially too strict — a `toBeCloseTo(…, 6)` seam-continuity check flagged a genuinely-continuous 5e-5 intensity easing from the dawn ramp beginning at phase 0.00. The module was correct; the tolerance was relaxed to assert a small step, `< 5e-3`, which is the actual continuity contract. This was a test-authoring correction within Task 2, not a change to shipped behavior.)

## Issues Encountered
- Under this environment, `pnpm exec tsc` prefixes pnpm's own "Already up to date" install-check noise to the output; verification was confirmed by running the tsc binary directly (`./node_modules/.bin/tsc -b --force`, exit 0, no diagnostics) and `./node_modules/.bin/vitest run`.

## User Setup Required
None - no external service configuration required. No dependencies added (three/vitest already present); no server publish.

## Next Phase Readiness
- `dayNightMath` exports are the stable contract Plan 04 (`createDayNightCycle`) consumes: pull `phase01(serverClock.nowMicros())`, `samplePalette(phase)`, then `Color.lerpColors`/`.set` the returned hex/intensity fields through `AmbienceHandles`.
- `fireflyLevel` is exposed for Phase 12 and consumed by nothing this phase, as specified.
- Wave 0 gap closed → `09-VALIDATION.md` `wave_0_complete` can flip true; Plans 02/03 (Wave 1) and 04/05 may proceed.

## Self-Check: PASSED

- FOUND: src/game/systems/dayNightMath.ts
- FOUND: src/game/systems/__tests__/dayNightMath.test.ts
- FOUND: .planning/phases/09-atmosphere-day-night/09-01-SUMMARY.md
- FOUND commit e7840a4 (Task 1), 7e89b6b (Task 2)

---
*Phase: 09-atmosphere-day-night*
*Completed: 2026-07-14*
