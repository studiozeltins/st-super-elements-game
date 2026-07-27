---
phase: 11-lived-in-props-wear
plan: 03
subsystem: world/assets
tags: [voxel-props, collision, determinism, light-pool-discipline, WEAR-02]
requires:
  - "assetHelpers (edgeLit/randomBetween/randomIntBetween)"
  - "assets/types (SeededRandom, WorldAsset, AssetObstacle)"
  - "three BufferGeometryUtils.mergeGeometries"
provides:
  - "createCrate(random): WorldAsset — merged-box voxel crate + collision footprint"
  - "createBarrel(random): WorldAsset — stacked-box voxel barrel + collision footprint"
  - "createFence(random): WorldAsset — merged post+rail run + one obstacle per post"
affects:
  - "src/game/world/assets/index.ts (new exports; crate/barrel repointed off createTownProps)"
  - "src/game/world/town/buildTown.ts (market crate/barrel now carry a collision footprint via the barrel export)"
tech-stack:
  added: []
  patterns:
    - "lantern merged-box (box()/mergedMesh()) one-draw-call factory"
    - "seeded scale + yaw for deterministic per-client props"
    - "WorldAsset.obstacles collision contract (Plan 07 placeAsset consumes it)"
    - "props are lightless (D-10) — verified by traversing for THREE.Light in tests"
key-files:
  created:
    - src/game/world/assets/createCrate.ts
    - src/game/world/assets/createBarrel.ts
    - src/game/world/assets/createFence.ts
  modified:
    - src/game/world/assets/index.ts
    - src/game/world/assets/createTownProps.ts
    - src/game/world/assets/__tests__/assets.test.ts
decisions:
  - "Resolved createCrate/createBarrel naming collision by moving the pre-existing decor factories out of createTownProps.ts into dedicated files and upgrading them to the merged-box voxel + collision + lightless spec (CLAUDE.md no-legacy / refactor-in-place). One canonical crate/barrel, not two."
  - "Fence run is centered on the local origin along +x; one obstacle per post (radius 0.2) so players path around each upright, not the whole span."
  - "Barrel silhouette faked with stacked boxes (narrow caps + wider mid-band) + two merged iron hoops — voxel-crisp, no cylinder, matches the box-voxel look."
metrics:
  duration: ~12 min
  completed: 2026-07-18
status: complete
---

# Phase 11 Plan 03: Lived-in Voxel Prop Factories Summary

Three lightless, deterministic voxel prop factories — `createCrate`, `createBarrel`, `createFence` — as merged-box siblings of `createLantern`/`createCampfire`, each returning a `WorldAsset` with a collision footprint and NO PointLight. Ready for placement in Plan 07 (WEAR-02, D-08, D-10).

## What was built

- **`createCrate.ts`** — a slatted cube from six face panels + four corner edge battens, merged into one `edgeLit(CRATE_WOOD)` draw call; seeded scale (0.7–0.95) + yaw (±0.15); one circular obstacle `{ radius: s*0.6, height: s }`.
- **`createBarrel.ts`** — a bulging staved silhouette faked with stacked boxes (narrow caps + wider mid-band) wearing two merged dark-iron hoops; seeded scale/yaw; one obstacle `{ radius: s*0.5, height: barrelH }`.
- **`createFence.ts`** — the WHOLE run in one factory: 3–5 seeded posts + two horizontal rails per gap, all merged into one `edgeLit(FENCE_WOOD)` mesh; run centered on the local origin; one obstacle per post (radius 0.2).
- **`assets.test.ts`** — a dedicated `PROP_FACTORIES` block asserting for all three: merged mesh present + ≥1 positive-radius obstacle; lightlessness (traverse for any `THREE.Light`); determinism (two equal-seed builds produce identical child + obstacle counts and deep-equal obstacles).

## Deviations from Plan

### Auto-fixed / structural

**1. [Rule 3 - Blocking collision] `createCrate`/`createBarrel` already existed**
- **Found during:** Task 1 (pre-flight framing check — the `verify-plan-framing-vs-codebase` habit).
- **Issue:** The plan (and 11-RESEARCH / 11-PATTERNS) treated `createCrate`/`createBarrel` as brand-new files, but both already shipped in `src/game/world/assets/createTownProps.ts` as walk-through decor (cylinder barrel, plain stacked-box crate, no obstacles) and were exported from `index.ts` + consumed by `buildTown.ts` (market district scatter). Adding same-named exports from new files would be a duplicate-export build error.
- **Fix:** Per CLAUDE.md (no legacy, refactor in place, one canonical asset) I moved crate/barrel OUT of `createTownProps.ts`, re-implemented them in dedicated `createCrate.ts`/`createBarrel.ts` to the plan's merged-box voxel + collision + lightless spec, and repointed `index.ts`. `buildTown` imports the same names from the barrel and is unchanged.
- **Side effect (intended):** `buildTown`'s market-district crates/barrels now carry a collision footprint (previously walk-through). This matches the plan's whole premise (players path around props) and is guarded by no test. Documented here for the Plan 07 placement work.
- **Files:** createCrate.ts, createBarrel.ts, createTownProps.ts, index.ts.
- **Commit:** 872bbad.

No other deviations. No auth gates. No architectural (Rule 4) changes were required — the collision resolution is mandated by project conventions and touches no data model.

## Verification

- `pnpm exec vitest run src/game/world/assets/__tests__/assets.test.ts` — 48 passed.
- `npx tsc -b` — clean (exit 0).
- `pnpm test` (full suite) — 52 files, 819 tests, all green.

## Known Stubs

None. All three factories are fully implemented and return live geometry + obstacles; no placeholder data. (Placement into the world is intentionally deferred to Plan 07 per the plan objective.)

## Notes for Plan 07

- Consume `createCrate`/`createBarrel`/`createFence` from `../assets` and place via `placeAsset` BEFORE the world freeze in `createMondstadtWorld.ts`.
- Each factory already declares `WorldAsset.obstacles` in asset-local coords — `placeAsset` pushes them into the collision set automatically.
- Fence obstacles are one-per-post (not one for the whole run), so a run leaves walk-through gaps between posts unless you butt runs together.

## Self-Check: PASSED

- Files: createCrate.ts, createBarrel.ts, createFence.ts, assets.test.ts — all FOUND.
- Commits: 872bbad, a0a9ac6 — all FOUND.
