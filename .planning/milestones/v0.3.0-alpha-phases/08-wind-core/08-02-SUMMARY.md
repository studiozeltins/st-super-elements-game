---
phase: 08-wind-core
plan: 02
subsystem: world-ambiance
tags: [wind, shared-clock, glsl, gust, uniform-by-reference, tdd]
requires:
  - "08-01 (windMath.ts constants + swayGlsl/gustGlsl generators + windAngle/gustAt/gustEnvelope)"
provides:
  - "createWind(enabled) factory: WindUniforms (timeUniform/directionUniform/strengthUniform) + Wind (update/sampleWind/sampleGust/getGustEnvelope)"
  - "Grass field on the shared wind clock with multiplicative traveling-gust term (uWindDir/uWindStrength uniforms)"
  - "?nowind uniform-driven kill switch (strengthUniform=0, zero recompile)"
  - "getGustEnvelope() — the Phase 10 audio sidechain contract, shipped now"
affects:
  - 08-03/08-04/08-05 (canopy, flags, smoke consume WindUniforms + wind threading via MondstadtWorldOptions)
  - Phase 10 audio (getGustEnvelope), Phase 12 butterflies (sampleWind/sampleGust)
tech-stack:
  added: []
  patterns:
    - "Uniform-object-by-reference contract (groundInfluence precedent): consumers hold the OBJECT, never cache .value"
    - "GLSL interpolated from windMath constants via toFixed(4) — shader/CPU single source of truth"
    - "Closure factory with zero per-frame allocs: one Vector2, mutated via .set()"
key-files:
  created:
    - src/game/systems/createWind.ts
    - src/game/systems/__tests__/createWind.test.ts
  modified:
    - src/game/world/createGrassField.ts
    - src/game/world/createMondstadtWorld.ts
    - src/game/createGame.ts
decisions:
  - "Sway axis vec2 + scale interpolated from SWAY.ampX/ampZ/scale via toFixed(4) — all nine grass literals now single-sourced in windMath while the axis stays fixed (no uWindDir in base sway, zero-regression per RESEARCH Pattern 2 / D-01)"
  - "GrassField.update() deleted entirely (interface + object + call site) — the shared clock made it empty; no-legacy rule"
  - "wind.update(deltaSeconds) placed at the very top of frame(), right after the delta computation — every consumer this frame reads the same phase"
metrics:
  duration: ~6 min
  completed: 2026-07-14
  tasks: 2
  files: 5
status: complete
---

# Phase 8 Plan 02: Shared Wind Clock + Grass Extraction Summary

createWind.ts now owns the client's single wind clock (uniform objects mutated in place, CPU sampling delegating to windMath), and grass was extracted onto it in one atomic change: private clock deleted, sway GLSL generated from the SWAY constants, a multiplicative retarded-time gust front traveling along uWindDir, and `?nowind` zeroing the strength uniform with no shader recompile.

## What Was Built

- **`src/game/systems/createWind.ts`** (68 lines):
  - `WindUniforms` — standalone interface (`timeUniform`, `directionUniform`, `strengthUniform`) importable on its own, exactly like `GroundInfluenceUniforms`; carries the IMPORTANT hold-the-object doc comment.
  - `Wind extends WindUniforms` — `update(deltaSeconds)` (clock += delta; `directionUniform.value.set(cos θ, sin θ)` from `windAngle(t)` — the Vector2 is constructed once, mutated forever, D-06/D-13), `sampleWind`/`sampleGust`/`getGustEnvelope` delegating to windMath's `sampleWind`/`gustAt`/`gustEnvelope` at the live clock.
  - `createWind(enabled)` — `strengthUniform.value` = 1/0 from the flag (D-12 uniform-driven kill).
- **`src/game/systems/__tests__/createWind.test.ts`** — 7 tests: kill-switch values, clock accumulation, same-Vector2-across-updates identity, direction = (cos, sin) of windAngle, and exact delegation equality for all three sampling functions.
- **`src/game/world/createGrassField.ts`** — options gain `wind: WindUniforms`; `createGrassMaterial` wires `uTime`/`uWindDir`/`uWindStrength` by object reference; the nine hard-coded sway literals replaced by `swayGlsl(...)` + `SWAY.ampX/ampZ/scale` interpolation; gust term `* (1.0 + uWindStrength * 1.6000 * gust)` with `gust` from `gustGlsl('uTime', 'dot(bladeOrigin.xz, uWindDir)')`; local `timeUniform` and `update()` DELETED (interface too). Cache key `'grassField'` unchanged.
- **`src/game/world/createMondstadtWorld.ts`** — `MondstadtWorldOptions.wind: WindUniforms` threaded into `createGrassField`; dead `grassField.update(deltaSeconds)` call removed.
- **`src/game/createGame.ts`** — `?nowind` added to the perf-flag comment; `const windEnabled = !perfFlags.has('nowind')`; `const wind = createWind(windEnabled)` constructed before the world; `wind.update(deltaSeconds)` at the top of `frame()` — the ONLY clock advance in the client (net growth 8 lines).

## TDD Gate Compliance

- RED: `6733279` — createWind.test.ts committed failing (module did not exist; vitest exit 1).
- GREEN: `5a444d6` — createWind.ts committed with 7/7 tests passing.
- REFACTOR: not needed — implementation landed clean.

## Verification

- `pnpm vitest run` — full suite 45 files / 703 tests green (696 pre-existing + 7 new).
- `pnpm build` — tsc -b + vite build exit 0 after each task.
- Arithmetic identity between gusts: the gust envelope rests at 0, so the displacement multiplies by `(1.0 + uWindStrength * 1.6 * 0.0) = 1.0`; all sway literals render via toFixed(4) to the same values (0.8500 ≡ 0.85) — WIND-01 honored.
- All 13 acceptance greps pass (interface/factory exports = 3, one `new THREE.Vector2`, `getGustEnvelope` ×2, wind.timeUniform wired, gust uniforms ×8, sway/gust GLSL generators ×3, zero `deltaSeconds` in grass field, zero `grassField.update`, `nowind` ×3, exactly one `wind.update(deltaSeconds)`, cache key intact).

## Known Accepted Limitation

Shadow depth passes ignore `onBeforeCompile` surface patches — grass shadows already behaved this way (grass has `castShadow = false` anyway); unchanged by this plan.

## Deviations from Plan

None - plan executed exactly as written. (One discretion note: the plan said to keep `vec2(0.85, 0.55)` "exactly as-is"; the axis stays fixed as directed, with its values interpolated from `SWAY.ampX/ampZ` via toFixed(4) — textually `vec2(0.8500, 0.5500)`, numerically identical — so all nine literals are single-sourced per the WIND-01 must-have.)

## Known Stubs

None — the module and extraction are complete; no placeholder values or unwired paths.

## Threat Flags

None — `?nowind` is a `URLSearchParams.has()` presence check (per T-08-03 mitigation); all GLSL interpolation comes from compile-time windMath constants (T-08-01), never user input.

## Success Criteria Status

- ONE wind clock exists; grass consumes it; gusts travel across the field (WIND-01, WIND-02) ✓
- `?nowind` is uniform-driven — strength uniform zeroed, no recompile path exists (Pitfall 4) ✓
- Phase 10's `getGustEnvelope()` contract shipped ✓
- Visual parity is human-verified in Plan 08-05 (as planned)

## Self-Check: PASSED

- FOUND: src/game/systems/createWind.ts
- FOUND: src/game/systems/__tests__/createWind.test.ts
- FOUND commit: 6733279 (test)
- FOUND commit: 5a444d6 (feat)
- FOUND commit: 197e816 (feat)
