---
phase: 08-wind-core
reviewed: 2026-07-14T00:02:38Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - src/game/createGame.ts
  - src/game/systems/__tests__/createWind.test.ts
  - src/game/systems/__tests__/windMath.test.ts
  - src/game/systems/createSmokeColumns.ts
  - src/game/systems/createWind.ts
  - src/game/systems/windMath.ts
  - src/game/world/assets/__tests__/assets.test.ts
  - src/game/world/assets/createCampFlag.ts
  - src/game/world/assets/createCanopyTree.ts
  - src/game/world/assets/index.ts
  - src/game/world/createGrassField.ts
  - src/game/world/createMondstadtWorld.ts
findings:
  critical: 2
  warning: 3
  info: 3
  total: 8
status: issues_found
---

# Phase 8: Code Review Report

**Reviewed:** 2026-07-14T00:02:38Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Phase 8 (wind-core) adds a shared wind clock (`createWind` + pure `windMath`), wires it into the grass shader, new canopy-tree and camp-flag vertex shaders, and a wind-driven smoke-column system. The pure math layer (`windMath.ts`) is clean, deterministic, and well-tested — the cadence/rigid-front/wander tests pin behavior rather than numbers, which is the right pinning strategy.

The critical defect class is **module-level material singletons that capture the wind uniforms of the FIRST game instance**. `createGame` is created and disposed by a React effect (`App.tsx:755-810`) whose cleanup calls `game.dispose()` — and the app runs under `<StrictMode>` (`main.tsx:50`), which mounts→cleans up→remounts every effect in dev. Any second game instance (StrictMode dev remount, reconnect, `hasJoined` toggle) builds flags and canopy trees from cached materials still wired to the *previous* game's wind uniforms, whose `update()` is never called again. Result: flags and canopies are permanently frozen — the phase's headline feature is silently dead in every dev session and after every prod reconnect. Grass does NOT have this bug because `createGrassField` builds its material per-world; the two pooled asset materials broke the pattern.

Traced and verified as correct: uniform-by-reference wiring (grass/canopy/flag all assign the uniform *objects*), `wind.update()` ordering before `smokeColumns.update()` and the render, retarded-time gust math CPU/GPU parity (modulo IN-02), smoke pool hard-cap with slot recycling and zero per-frame allocations, distinct `customProgramCacheKey`s, frustum-cull bounds on grass chunks, and the `?nowind` strength-0 identity (`gustGainFactor(0, g) === 1`, smoke drift zeroed, base sway preserved).

## Critical Issues

### CR-01: Camp-flag cloth/pole materials are module-level singletons — second game instance gets a frozen flag bound to a dead wind clock

**File:** `src/game/world/assets/createCampFlag.ts:22-23, 36-78`
**Issue:** `poleMaterial` is created at module load and `clothMaterial` is a lazy module-level singleton whose `onBeforeCompile` captures the `wind` uniforms passed on the **first** `createCampFlag` call ever. Two failure modes:
1. **Stale wind:** When the game is disposed and recreated (React StrictMode dev remount — confirmed active in `main.tsx:50`; prod reconnect via the `connection` dep of the game effect in `App.tsx:810`), the new world builds flags with the cached material still holding game #1's `timeUniform`/`directionUniform`/`strengthUniform`. Game #1's frame loop is cancelled, so `uTime` never advances — every flag renders as a static, near-flat cloth forever. In dev under StrictMode this happens on *every* session, so the feature is invisible during development.
2. **Disposed-material reuse:** `world.dispose()` → `disposeObject(group)` (`disposeObject.ts:10-22`) traverses all meshes and disposes their materials, including these shared ones. The module cache still hands the disposed instances to the next world (three.js recompiles them, but recompilation re-binds the same stale closure uniforms — so the freeze persists).

**Fix:** Scope the pool to the wind instance instead of the module. Simplest: cache keyed on the wind object, resetting when it changes:
```typescript
let clothMaterial: THREE.MeshLambertMaterial | null = null;
let clothMaterialWind: WindUniforms | null = null;

function getClothMaterial(wind: WindUniforms): THREE.MeshLambertMaterial {
  if (clothMaterial && clothMaterialWind === wind) return clothMaterial;
  clothMaterial?.dispose();
  clothMaterialWind = wind;
  const material = new THREE.MeshLambertMaterial({ /* ... unchanged ... */ });
  // ... existing onBeforeCompile ...
  clothMaterial = material;
  return material;
}
```
Apply the same treatment to `poleMaterial` (or accept it as color-only and exclude it from `disposeObject`'s reach — but then it must never be disposed). A cleaner long-term shape: a per-world flag-factory closure created by `createMondstadtWorld`, matching how `createGrassField` owns its material per-instance.

### CR-02: Canopy material pool ignores `initCanopyWind` re-injection — cached cap materials keep the first game's wind uniforms

**File:** `src/game/world/assets/createCanopyTree.ts:19-28, 40-86`
**Issue:** `canopyMaterials` is a module-level `Map<number, material>` that is never invalidated. `initCanopyWind(options.wind)` *is* correctly re-called by every new world (`createMondstadtWorld.ts:391`), but `getCanopyMaterial` returns the pooled material whose `onBeforeCompile` closure captured `wind` (the local `const wind = canopyWind` at line 41) **at material-creation time** — i.e. game #1's uniforms. So the re-injection is dead code for any color already in the map: on the second game instance (StrictMode remount, reconnect) all canopy caps sway on a clock that never ticks — trees freeze at one pose. As with CR-01, `disposeObject` also disposes the pooled materials while the map keeps handing them out. The test file masks this: `assets.test.ts:25` injects wind once and builds trees once, so the staleness across re-injection is never exercised.

**Fix:** Clear the pool when a new wind is injected, and dispose the orphaned materials:
```typescript
export function initCanopyWind(wind: WindUniforms): void {
  if (canopyWind !== wind) {
    for (const material of canopyMaterials.values()) material.dispose();
    canopyMaterials.clear();
  }
  canopyWind = wind;
}
```
This keeps the pooling win (4 materials per world, shared across all caps) while making the pool's lifetime match the wind it is wired to. Add a test asserting that a second `initCanopyWind` with a different wind yields materials distinct from the first batch.

## Warnings

### WR-01: `createGame.dispose()` never disposes the smoke columns

**File:** `src/game/createGame.ts:1482-1511` (creation at 358-360)
**Issue:** `smokeColumns` is created with its `InstancedMesh` added to the scene root (`createSmokeColumns.ts:101`) and exposes a `dispose()` that removes the mesh and frees geometry/material — but `game.dispose()` never calls it. Every other optional system there (`debrisSystem?.dispose()`, `lightPool?.dispose()`) is torn down. On game re-creation (StrictMode, reconnect) the old smoke mesh's box geometry, Lambert material, and instance buffers leak, and the mesh lingers in the abandoned scene graph.
**Fix:** Add `smokeColumns?.dispose();` next to `debrisSystem?.dispose();` in the dispose block (after line 1501).

### WR-02: Canopy sway height-weight uses absolute world Y — the ramp only works for trees at sea level

**File:** `src/game/world/assets/createCanopyTree.ts:74` (constants at `windMath.ts:69-76`)
**Issue:** `heightWeight = clamp((canopyWorld.y - swayBaseY) * invSwaySpan, 0, 1)` with `swayBaseY = 2.0` measured in **world** Y. The `windMath.ts` comment ("Trees stand 5-7u with caps from ~2.5u — height weight ramps from swayBaseY over a 5u span") assumes the tree base sits at world y ≈ 0, but the terrain reaches ~7.5u (`MAX_HILL_HEIGHT = 10`, offset −2.5, `terrain.ts:8-9`) and canopy trees scatter with `maxSlope: 0.45` across the whole map (`createMondstadtWorld.ts:398`). A tree at groundY ≥ ~3 has weight 1 on *every* cap vertex including the cap bottoms, so the whole canopy translates rigidly — under a gust it reads as the canopy sliding sideways off the stationary trunk instead of the top leaning, and hill trees visibly move more than valley trees under identical wind.
**Fix:** Make the ramp relative to the tree's base. The cap meshes' `modelMatrix` already encodes the group's ground placement, so subtract the instance ground height instead of a constant — e.g. bake the tree's world base Y into the geometry (or a per-mesh uniform is impossible with pooled materials, so encode it): the cheapest correct route is to ramp on **local** height by storing the cap's height-above-base in a vertex attribute at build time, or compute `heightWeight` from `position.y + capBaseOffset` baked per cap via `geometry.translate`. Alternatively accept full-canopy weight and delete the ramp + comment — but do not keep a ramp that silently no-ops on half the map.

### WR-03: `assets.test.ts` claims to cover "every factory exported from assets/index.ts" but omits `createCampFlag`

**File:** `src/game/world/assets/__tests__/assets.test.ts:29-43` (vs `assets/index.ts:12`)
**Issue:** The `FACTORIES` table's doc comment states it lists every exported factory; `createCampFlag` (exported at `index.ts:12`, and a Phase 8 addition) is absent — presumably because its signature takes `(random, wind)` and doesn't fit the `AssetFactory` type. The flag therefore escapes the group-shape and determinism checks that gate every other asset, and the suite's stated invariant is now false — the next reader will trust a guarantee the suite doesn't provide. The wind injection needed is already available (the file calls `initCanopyWind(createWind(true))` at line 25).
**Fix:** Adapt the entry so the flag joins the table:
```typescript
const testWind = createWind(true);
initCanopyWind(testWind);
// ...
createCampFlag: { create: (random) => createCampFlag(random, testWind), climbable: false },
```

## Info

### IN-01: `SmokePuff.fireIndex` is written but never read

**File:** `src/game/systems/createSmokeColumns.ts:49, 130`
**Issue:** `fireIndex` is assigned on spawn but no code reads it — dead state, which the project's no-dead-code rule forbids ("delete unused code the moment it becomes unused").
**Fix:** Delete the field from the `SmokePuff` interface, the pool initializer, and `spawnPuff`.

### IN-02: "Byte-for-byte the same math" doc claim is inaccurate — GLSL literals are rounded to 4 decimals

**File:** `src/game/systems/windMath.ts:137-165` (claim at 154-157)
**Issue:** `f(n) = n.toFixed(4)` rounds `GUST.w1 = TAU/9 ≈ 0.6981317` to `0.6981` (etc.), so the GPU gust phase drifts from the CPU mirror by ~0.11 rad per hour of wind clock — the smoke plume's gust kink (CPU `gustAt`) will slowly desync from the grass gust wave (GPU) over long sessions. Behaviorally negligible, but the `gustGlsl` docstring's "byte-for-byte the same math gustAt computes on the CPU" overstates the guarantee.
**Fix:** Either raise precision (`n.toPrecision(9)` still yields a valid GLSL float literal with a decimal point for these constants) or soften the comment to "same formula, literals rounded to 4 decimals (phase drift < 0.2 rad/h — immaterial)".

### IN-03: `createGame.ts` (1,983 lines) grew again this phase despite the monolith rule

**File:** `src/game/createGame.ts` (wind/smoke wiring at 296-360, 1325, 1344-1345)
**Issue:** CLAUDE.md caps files at ≤300 functional LOC and requires carving chunks out of monoliths when touched. Phase 8 added the perf-flag parsing, wind construction, and smoke wiring inline. The additions are small and cohesive, but the file keeps compounding.
**Fix:** Next touch, extract the ambiance wiring (perf flags, ground influence, scorch, wind, smoke, grass options) into a `createAmbiance(scene, quality)` sibling module returning the handles `createGame` consumes.

---

_Reviewed: 2026-07-14T00:02:38Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
