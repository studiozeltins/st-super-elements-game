---
phase: 08-wind-core
reviewed: 2026-07-14T05:05:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - src/game/world/assets/createCampFlag.ts
  - src/game/world/assets/createCanopyTree.ts
  - src/game/world/assets/__tests__/windMaterialLifecycle.test.ts
  - src/game/world/assets/__tests__/assets.test.ts
  - src/game/systems/windMath.ts
  - src/game/systems/createSmokeColumns.ts
  - src/game/createGame.ts
findings:
  critical: 0
  warning: 0
  info: 2
  total: 2
status: issues_found
---

# Phase 8: Code Review Report (RE-REVIEW after gap closure 08-06/08-07)

**Reviewed:** 2026-07-14T05:05:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found (info-only — no blockers, no warnings)

## Summary

Re-review of the Phase 8 wind-core files after gap-closure plans 08-06 (material lifetime + canopy ramp + flag test coverage) and 08-07 (smoke teardown). Every claimed fix was traced against the code, the world wiring, and the new regression suite; all four test files pass (69 tests). **All 2 criticals, all 3 warnings, and 2 of 3 info items from the prior review are genuinely resolved.** No new blockers or warnings were introduced by the fixes. Two info items remain open: the explicitly declined `createGame.ts` monolith note (IN-03) and a small new DRY nit — the GLSL float-literal helper `f()` is now defined identically in three files (IN-04).

Key verifications performed on the fixes themselves:

- **Wind-keyed caches are identity-sound.** `createWind` (`createWind.ts:40-68`) returns a fresh object literal per call, so `wind !== flagWind` / `wind !== canopyWind` reliably distinguishes game instances. Both caches dispose the orphaned materials before rebuilding, and rebuild lazily against the NEW closure-captured uniforms.
- **No live-world dispose hazard.** `initCanopyWind`/`getFlagMaterials` dispose the previous pool only when a *different* wind arrives — and a different wind only exists after the previous game's `dispose()` has already run (React cleanup precedes effect re-run, including under StrictMode), so pooled materials are never yanked out from under a rendering scene. Double-dispose (world.dispose → disposeObject, then the cache's own dispose on the next game) is harmless in three.js (the renderer's dispose listener self-removes on first fire).
- **Same-wind reuse preserved.** Within one wind lifetime the pools return the identical material objects (asserted by `windMaterialLifecycle.test.ts:53-62, 95-102`) — the D-13 pooling win survives the fix.
- **aTreeHeight bake math is correct.** Rendered vertex height above the tree base = `layerHeight + localY * cap.scale.y`; the bake uses the shared `CAP_SCALE_Y = 0.55` constant for both the mesh scale and the bake (`createCanopyTree.ts:20, 146, 154`). Cap rotation is Y-only (height-invariant), the group carries no scale, and `placeAsset` (`createMondstadtWorld.ts:215-237`) only translates — it never scales asset groups — so the baked heights match rendered heights exactly. Lowest cap vertices land ≈0.8u above base (below `swayBaseY = 2.0` → weight 0 near the trunk), tops ramp to 1: hill and valley trees now get identical weights.
- **Smoke teardown is complete and correctly ordered.** `smokeColumns?.dispose()` sits in `createGame.dispose()` (`createGame.ts:1502`) before `world.dispose()` and `pixelRenderer.dispose()`, so the renderer is still alive to process the dispose events. The dispose path (`createSmokeColumns.ts:201-208`) removes the mesh, frees geometry + material, and calls `mesh.dispose()` — which is what actually releases the instanceMatrix/instanceColor GPU buffers.
- **Test suites are honest.** `assets.test.ts`'s "every factory" claim is true again (flag wrapped with the suite's shared wind, `assets.test.ts:44`); the new `windMaterialLifecycle.test.ts` pins both cache-rebuild-on-new-wind and pool-preserved-on-same-wind, plus four aTreeHeight invariants including determinism. Vitest's per-file module isolation prevents the module-level wind caches from leaking between test files.

## Resolved Findings (prior review)

### CR-01: Camp-flag materials were module-level singletons frozen to the first game's wind — RESOLVED

**Fixed in:** `554858a` — `src/game/world/assets/createCampFlag.ts:30-57`
Both pole and cloth materials are now cached per wind instance (`flagWind` guard). A different wind disposes both and rebuilds them inside `getFlagMaterials`, so the cloth's `onBeforeCompile` closure captures the live game's uniform objects. The pole (color-only) joins the cache deliberately so its lifetime matches `disposeObject`'s teardown reach. Regression-pinned by `windMaterialLifecycle.test.ts:65-102` (fresh materials on new wind, dispose of orphans, single shared pair per wind).

### CR-02: Canopy material pool ignored `initCanopyWind` re-injection — RESOLVED

**Fixed in:** `554858a` — `src/game/world/assets/createCanopyTree.ts:43-49`
`initCanopyWind` now disposes and clears the color pool when a different wind is injected (exactly the fix the prior review specified), so `getCanopyMaterial` rebuilds against the new uniforms on the next tree build. Same-wind re-injection is a no-op, preserving the 4-materials-per-world pooling. Regression-pinned by `windMaterialLifecycle.test.ts:26-62`.

### WR-01: `createGame.dispose()` never disposed the smoke columns — RESOLVED

**Fixed in:** `b0fcdb7` — `src/game/createGame.ts:1502`, `src/game/systems/createSmokeColumns.ts:201-208`
`smokeColumns?.dispose()` added next to `debrisSystem?.dispose()`; the system's dispose now also calls `mesh.dispose()` (with an accurate comment noting that geometry/material disposal alone does not free the instance buffers).

### WR-02: Canopy sway height-weight used absolute world Y — RESOLVED

**Fixed in:** `20b5cff` + `42adcdd` — `src/game/world/assets/createCanopyTree.ts:96-104, 137-148`, `src/game/systems/windMath.ts:64-70`
The ramp now reads a per-vertex `aTreeHeight` attribute baked at build time (height above the TREE base), so terrain height never enters the weight. Bake math verified correct including the `CAP_SCALE_Y` factor and the no-group-scale scatter invariant (see Summary). The `windMath.ts` CANOPY docstring was updated to match. Four new tests pin attribute presence, span, layer ordering, and determinism (`windMaterialLifecycle.test.ts:105-163`).

### WR-03: `assets.test.ts` omitted `createCampFlag` from the "every factory" table — RESOLVED

**Fixed in:** `ce74406` — `src/game/world/assets/__tests__/assets.test.ts:27-28, 44`
The flag joins `FACTORIES` via a wrapper binding the suite's shared test wind, exactly as the prior review suggested. The doc comment's invariant ("every factory exported from assets/index.ts") is true again; the flag now passes the group-shape, determinism, and non-climbable checks.

### IN-01: `SmokePuff.fireIndex` dead state — RESOLVED

`fireIndex` is gone from the interface, the pool initializer, and `spawnPuff` (`createSmokeColumns.ts:42-50, 110-131`).

### IN-02: "Byte-for-byte" GLSL parity over-claim — RESOLVED

The `gustGlsl` docstring now reads "the same formula gustAt computes on the CPU with literals rounded to 4 decimals (phase drift < 0.2 rad/h — immaterial)" (`windMath.ts:154-160`) — the softened wording the prior review offered as the acceptable alternative.

## Info

### IN-03: `createGame.ts` (1,983 lines) remains a monolith — OPEN (explicitly declined this phase)

**File:** `src/game/createGame.ts` (wind/smoke wiring at 296-360, 1325, 1344-1345, 1502)
**Issue:** CLAUDE.md caps files at ≤300 functional LOC and requires carving chunks out of monoliths when touched. Phase 8 (including the 08-07 fix) touched the file again without extraction. The gap plans explicitly declined this item, so it stays as a recorded debt, not a phase blocker.
**Fix:** Next touch, extract the ambiance wiring (perf flags, ground influence, scorch, wind, smoke, grass options) into a `createAmbiance(scene, quality)` sibling module returning the handles `createGame` consumes.

### IN-04: GLSL float-literal helper `f()` is defined identically in three files

**File:** `src/game/systems/windMath.ts:139-141`, `src/game/world/assets/createCampFlag.ts:17`, `src/game/world/assets/createCanopyTree.ts:14`
**Issue:** The one-line `const f = (n: number): string => n.toFixed(4)` (with the same "raw ints break the shader compile" comment) now exists in three modules. `windMath.ts` already positions itself as the single source of GLSL generation and exports `swayGlsl`/`gustGlsl`; the literal formatter belongs there too. Trivial today, but a future precision change (e.g. the IN-02 `toPrecision(9)` option) would have to find all three copies.
**Fix:** Export it from `windMath.ts` (e.g. `export const glslFloat = (n: number): string => n.toFixed(4);`), delete the two local copies, and have the shader-building callsites import it.

---

_Reviewed: 2026-07-14T05:05:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard (re-review of gap-closure fixes 08-06/08-07)_
_Prior review: 2026-07-14T00:02:38Z (2 critical, 3 warning, 3 info — all resolved except IN-03)_
