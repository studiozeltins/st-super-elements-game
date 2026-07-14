---
phase: 08-wind-core
plan: 06
subsystem: world-ambiance
tags: [wind, materials, lifecycle, three.js, tdd, gap-closure]
requires:
  - phase: 08-wind-core plan 03 (canopy/flag wind shaders, the pooled materials being re-scoped)
  - phase: 08-wind-core plan 05 (08-REVIEW findings CR-01/CR-02/WR-02/WR-03/IN-02)
provides:
  - Wind-instance-scoped material pools for camp flags and canopy trees (StrictMode/reconnect freeze fixed)
  - Tree-base-relative canopy sway ramp via baked aTreeHeight vertex attribute
  - windMaterialLifecycle.test.ts regression suite (10 tests) pinning material lifetime + attribute bake
  - createCampFlag covered by the shared asset invariants suite
affects:
  - 08-VERIFICATION re-run (SC1/WIND-01/WIND-02 unblocked)
  - Phase 12 wildlife (any future pooled wind material must follow the wind-scoped cache pattern)
tech-stack:
  added: []
  patterns:
    - "Wind-guarded module cache: pooled materials keyed on the wind instance identity; different wind => dispose orphans + rebuild, same wind => pool preserved (D-13)"
    - "Per-vertex attribute bake for per-mesh data on pooled materials (aTreeHeight — pooled material cannot take a per-mesh uniform)"
key-files:
  created:
    - src/game/world/assets/__tests__/windMaterialLifecycle.test.ts
  modified:
    - src/game/world/assets/createCampFlag.ts
    - src/game/world/assets/createCanopyTree.ts
    - src/game/systems/windMath.ts
    - src/game/world/assets/__tests__/assets.test.ts
decisions:
  - "Flag pole material joins the wind-guarded cache even though it carries no wind: disposeObject disposes it at world teardown, so its lifetime must match the world (per 08-REVIEW CR-01)"
  - "CAP_SCALE_Y hoisted as the single source for cap.scale.y AND the aTreeHeight bake — baked heights always match rendered vertex heights"
  - "canopyWorld stays in the canopy shader solely for the wind-direction projection (gust front + idle-lean phase); the sway ramp no longer reads world Y"
metrics:
  duration: ~8 min
  completed: 2026-07-14
  tasks: 3
  tests-before: 703
  tests-after: 716
status: complete
---

# Phase 8 Plan 06: Wind Material Lifecycle Gap Closure Summary

**One-liner:** Flag/canopy materials re-scoped from module singletons to wind-instance-keyed caches (fixing the StrictMode/reconnect permanent freeze), canopy sway ramp rebased from world Y to baked tree-local height, and createCampFlag added to the shared asset invariants suite.

## What was built

### Task 1 — Wind-scoped material pools (CR-01, CR-02) [TDD]

**RED (commit 7c4e9c6):** `windMaterialLifecycle.test.ts` written first; 4 of 6 tests failed against the module singletons exactly as predicted:
- canopy: re-injecting a different wind still returned the SAME cap material object; no dispose event fired on re-injection
- flag: a different wind returned the same cloth AND pole materials; no dispose events
- the 2 pooling-preserved tests passed trivially (singletons always pool)

**GREEN (commit 554858a):**
- `initCanopyWind(wind)` now invalidates the pool when the incoming wind differs from the stored one: every pooled material is disposed, `canopyMaterials.clear()` runs, then the new wind is stored. `getCanopyMaterial` unchanged — the next call lazily rebuilds against the NEW uniform objects. Same-wind re-injection is a no-op (D-13 pooling preserved: 4 materials per wind lifetime).
- `createCampFlag.ts`: module-eager `poleMaterial` and the unconditioned lazy `clothMaterial` singleton replaced by a wind-guarded cache (`flagWind`/`poleMaterial`/`clothMaterial` nullable module vars + private `getFlagMaterials(wind)` returning `{ pole, cloth }`). Different wind => both cached materials disposed, nulled, rebuilt; the shader patch (uniform wiring by object reference, GLSL body, `campFlag` cache key, DoubleSide, vertexColors) is byte-identical to before — lifetime-only change.
- Invariant documented in both files: a cached material disposed by `world.dispose()` at teardown is safe because the next game constructs a NEW wind, forcing the rebuild path.

### Task 2 — Tree-base-relative canopy sway ramp (WR-02, IN-02) [TDD]

**RED (commit 20b5cff):** 4 new aTreeHeight tests failed (attribute did not exist).

**GREEN (commit 42adcdd):**
- Cap flatten factor hoisted to module const `CAP_SCALE_Y = 0.55`, used for both `cap.scale.y` and the bake.
- Each cap geometry gets a `Float32Array` attribute `aTreeHeight` (itemSize 1) where entry i = `layerHeight + position.getY(i) * CAP_SCALE_Y` — height above the TREE BASE, immune to terrain height (rotation about Y never changes vertex height; the group carries no scale).
- Shader: `attribute float aTreeHeight;` declared in the common-include block; `heightWeight = clamp((aTreeHeight - swayBaseY) * invSwaySpan, 0.0, 1.0)` — the ramp no longer reads `canopyWorld.y`; `canopyWorld` remains solely for the wind-direction projection.
- `windMath.ts` comment-only: CANOPY doc states the ramp is height-above-base (baked per-vertex); gustGlsl docstring softened to "same formula … literals rounded to 4 decimals (phase drift < 0.2 rad/h — immaterial)" per IN-02. Constants untouched (`swayBaseY: 2.0`, `invSwaySpan: 0.2` verified).

### Task 3 — Flag joins the asset invariants suite (WR-03) (commit ce74406)

- `assets.test.ts`: inline `initCanopyWind(createWind(true))` replaced by hoisted `const testWind = createWind(true); initCanopyWind(testWind);`
- `createCampFlag: { create: random => createCampFlag(random, testWind), climbable: false }` added to FACTORIES — 3 new test cases (group shape, determinism, not climbable) pass unmodified; the table's "every factory" doc claim is accurate again.

## Verification

- `pnpm vitest run`: 716/716 green after every task (703 baseline + 10 lifecycle/attribute + 3 flag-table)
- `pnpm build`: exit 0 after every task
- All plan acceptance grep checks pass (pool invalidation in initCanopyWind: 1; getFlagMaterials: 1; no module-eager pole material: 0; flagWind references: 3; campFlag cache key intact: 1; aTreeHeight: 5; no non-comment canopyWorld.y: 0; CAP_SCALE_Y: 3; constants unchanged)
- Pooling counts within one wind lifetime unchanged: 4 canopy cap materials, 1 cloth, 1 pole (D-13)
- No update-loop registration added — sway remains 100% vertex-shader displacement

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| 1 (RED) | 7c4e9c6 | test | failing wind material lifecycle tests (CR-01/CR-02) |
| 1 (GREEN) | 554858a | fix | scope flag + canopy materials to the wind instance |
| 2 (RED) | 20b5cff | test | failing canopy aTreeHeight attribute tests (WR-02) |
| 2 (GREEN) | 42adcdd | fix | canopy sway ramps on height above the tree base |
| 3 | ce74406 | test | createCampFlag joins the shared asset invariants suite |

## TDD Gate Compliance

RED and GREEN gates satisfied for both TDD tasks: `test(...)` commits precede their `fix(...)` commits in sequence, and the observed RED failures are recorded above. No refactor commits needed.

## Known Stubs

None — no stubs, placeholders, or unwired data paths introduced.

## Threat Flags

None — no new security-relevant surface. GLSL interpolation still sources only compile-time windMath constants; Task 2 adds only the fixed attribute name literal `aTreeHeight` (per plan threat register T-08-06-01). Rebuild churn is bounded to one pool invalidation per game re-creation (T-08-06-02), pinned by the pooling-preserved tests.

## Next Steps

- The human playtest checklist (08-VERIFICATION §Human Verification Required) remains the final gate via `/gsd-verify-work` — SC1/WIND-01/WIND-02 are now unblocked for re-verification.

## Self-Check: PASSED

All 5 key files exist on disk; all 5 task commits (7c4e9c6, 554858a, 20b5cff, 42adcdd, ce74406) present in git log; no unexpected file deletions in the commit range.
