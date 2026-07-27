---
phase: 08-wind-core
plan: 08
subsystem: wind
status: complete
tags: [windmath, flag, glsl, tdd, gap-closure]
requirements: [WIND-01, WIND-03]
dependency_graph:
  requires: []
  provides:
    - "FLAG pose constants (swingBase/swingGust/drapeLift/drapeLiftGust/drapePitch/limpAmp/limpFreq)"
    - "flagSwing(strength, gust) / flagDrape(strength, gust) JS mirrors"
    - "flagSwingGlsl / flagDrapeGlsl generators for createCampFlag.ts (plan 08-09)"
  affects:
    - "08-09 flag shader rewire (consumes the generators)"
tech_stack:
  added: []
  patterns:
    - "zero-import pure helper twin: JS mirror + GLSL generator from the same constants (WIND-01 no-drift)"
    - "f() 4-decimal literal path for every GLSL numeric (gustGlsl precedent)"
key_files:
  created: []
  modified:
    - src/game/systems/windMath.ts
    - src/game/systems/__tests__/windMath.test.ts
decisions:
  - "flagSwing = min(1, strength*(0.75 + 0.5*gust)) — steady full wind aligns 75% downwind, a peak gust clamps to fully aligned"
  - "flagDrape = 1 - min(1, strength*(0.7 + 0.25*gust)) — strength 0 is exactly 1 (full limp hang, D-12); full gust leaves 0.05 drape (essentially taut, D-04)"
  - "drapePitch 1.45 rad (~83°) — near-vertical hang at full drape but not π/2, keeps a hint of cloth shape"
  - "limpAmp 0.03 / limpFreq 0.9 — residual micro-sway slower than grass (SWAY.f1=1.7), a lazy pendulum"
metrics:
  duration: "~4 min"
  tasks: 2
  files: 2
  completed: 2026-07-14
---

# Phase 8 Plan 08: Flag Pose Math Foundation Summary

Downwind swing blend + windless drape weight added to windMath.ts as FLAG constants with JS mirrors and GLSL generators, TDD-first, purely additive — the tested math plan 08-09's flag shader rewire consumes.

## What Was Built

- **FLAG pose constants** (7 new keys, appended): `swingBase` 0.75, `swingGust` 0.5, `drapeLift` 0.7, `drapeLiftGust` 0.25, `drapePitch` 1.45, `limpAmp` 0.03, `limpFreq` 0.9 — each documented with its D-04/D-08/D-12 rationale.
- **`flagSwing(strength, gust)`** — 0..1 fraction of yaw from the cloth's baked heading toward the wind. Branch-free clamped blend; `flagSwing(0, g) === 0` exactly for every gust, monotonic in both args, `flagSwing(1,1) = 1` (clamped), `flagSwing(1,0) = 0.75` — gusts visibly increase alignment (UAT 4/5).
- **`flagDrape(strength, gust)`** — 0..1 limp-hang weight. `flagDrape(0, g) === 1` exactly (`?nowind` full drape, D-12), monotonic non-increasing, `flagDrape(1,1) = 0.05` (full gust essentially taut, D-04).
- **`flagSwingGlsl` / `flagDrapeGlsl`** — GLSL text of EXACTLY the same closed forms, from the same FLAG constants through the existing `f()` 4-decimal helper. Tests pin the full rendered expression string, so shader and CPU math cannot drift (WIND-01).

## Verification Results

- `pnpm vitest run src/game/systems/__tests__/windMath.test.ts` — 21/21 (13 pre-existing unmodified + 8 new).
- `pnpm vitest run` full suite — 724/724 green.
- `git diff` on windMath.ts across the plan: **0 deleted lines** — purely additive; `gustGainFactor`, SWAY/GUST/WANDER/CANOPY and every existing FLAG value untouched (D-01 grass hard gate holds).
- windMath.ts: 0 imports, 101 functional LOC (under the 300 cap).

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 (RED) | 0f67694 | test(08-08): failing contracts for flagSwing/flagDrape |
| 1 (GREEN) | 90595d9 | feat(08-08): FLAG pose constants + flagSwing/flagDrape JS mirrors |
| 2 | 6a56540 | feat(08-08): flagSwingGlsl/flagDrapeGlsl generators + expression-pinning tests |

## TDD Gate Compliance

RED gate (0f67694, 6 failing tests observed) → GREEN gate (90595d9, all pass). No refactor commit needed.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None — but note the pose constants are *consumed by nothing yet*; `drapePitch`, `limpAmp`, `limpFreq` and the two generators wire into createCampFlag.ts in plan 08-09 (planned, not a stub).

## Threat Flags

None — pure client-side math, no new trust surface.

## Self-Check: PASSED

- src/game/systems/windMath.ts — FOUND
- src/game/systems/__tests__/windMath.test.ts — FOUND
- Commits 0f67694, 90595d9, 6a56540 — FOUND in git log
