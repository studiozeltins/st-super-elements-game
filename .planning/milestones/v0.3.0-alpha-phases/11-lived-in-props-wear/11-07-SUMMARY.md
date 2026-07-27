---
phase: 11-lived-in-props-wear
plan: 07
subsystem: world
tags: [voxel-props, placement, determinism, collision, WEAR-02, D-09, D-10]
requires:
  - "createCrate/createBarrel/createFence (Plan 03) — each returns a WorldAsset with self-declared collision obstacles and no PointLight"
  - "TOWN_DISTRICTS (market-e/market-ne/plaza tile anchors) from town/townPlan.ts"
  - "placeAsset + WORLD_DECOR_SEED + createSeededRandom (createMondstadtWorld.ts)"
provides:
  - "Deterministic build-time plaza props: market stall crate/barrel run + plaza-boundary fence runs, placed before the world freeze"
affects:
  - "src/game/world/createMondstadtWorld.ts (new prop-placement block + two imports)"
tech-stack:
  added: []
  patterns:
    - "own-salt seeded RNG (WORLD_DECOR_SEED ^ 0xc4a7e) so prop counts/jitter are deterministic and independent of prior decor draws (mirrors the lantern-ring precedent)"
    - "data-driven anchors derived from TOWN_DISTRICTS (no magic coordinates)"
    - "placeAsset consumes each factory's self-declared asset.obstacles — collisionRadius omitted to avoid a doubled footprint"
key-files:
  created: []
  modified:
    - src/game/world/createMondstadtWorld.ts
decisions:
  - "Omitted the collisionRadius argument the plan's example call passed to placeAsset: the Plan 03 factories already declare their own WorldAsset.obstacles, which placeAsset pushes automatically, so passing collisionRadius too would register a redundant second obstacle at the prop center."
  - "Kept fence runs at their factory +x orientation (unrotated) and placed them along x-aligned plaza boundaries: placeAsset does not rotate an asset's obstacles, so rotating a fence would leave its per-post collision footprints misaligned from the visible posts."
metrics:
  duration: ~8 min
  completed: 2026-07-18
status: complete
---

# Phase 11 Plan 07: Plaza Prop Placement Summary

Crate/barrel market stalls and plaza-boundary fence runs are now placed deterministically at build time in `createMondstadtWorld`, seeded off an own-salt RNG and wired in BEFORE the world freeze, with collision registered via each factory's self-declared obstacles and zero added lights (WEAR-02, D-09, D-10).

## What was built

- **Own-salt prop RNG** — `createSeededRandom(WORLD_DECOR_SEED ^ 0xc4a7e)` plus a small `propJitter(range)` helper, so counts/jitter are deterministic and independent of the prior decor/lantern draws (the same discipline the lantern ring uses).
- **Market stall run** — 6 alternating crates/barrels lined along `market-e`'s fountain-facing (west) edge, derived from `TOWN_DISTRICTS` (`cx - half + inset`), with small seeded x/z jitter so it reads as a stacked stall, not a scatter — the "who put this here" market read facing the square.
- **Market-ne corner stack** — 3 more crates/barrels tucked at `market-ne`'s corner nearest the plaza, running back along its west edge.
- **Fence runs at boundary gaps** — 3 short fence runs: two flanking the south plaza-boundary path with a central walk-through gap left open, plus one along the north edge. Kept at the factory's +x orientation so post collision footprints stay aligned.
- All placement sits between the existing decor/road-lantern block and the `group.updateMatrixWorld(true)` / `matrixWorldAutoUpdate = false` freeze (Pitfall 5). No `PointLight` added (D-10). Collision comes from each factory's `asset.obstacles`, which `placeAsset` pushes into the world obstacle set.

## Deviations from Plan

### Auto-fixed / correctness

**1. [Rule 1 - Redundant obstacle] Dropped the `collisionRadius` argument the plan's example passed to `placeAsset`**
- **Found during:** Task 1 (cross-checking the Plan 03 summary's collision contract).
- **Issue:** The plan's action text showed `placeAsset(createCrate|createBarrel(propRandom), x, z, collisionRadius)`. But Plan 03 upgraded the crate/barrel/fence factories to each declare their own `WorldAsset.obstacles`, which `placeAsset` already pushes into the obstacle set. Passing `collisionRadius` on top would register a *second*, redundant obstacle at the prop center.
- **Fix:** Placed every prop with the 3-arg form (`placeAsset(asset, x, z)`) and let each factory's self-declared obstacle provide collision. Collision is still fully registered — verified by the factories' Plan 03 tests and the compiling call sites.
- **Files:** src/game/world/createMondstadtWorld.ts.
- **Commit:** cb8d2ac.

**2. [Rule 1 - Collision alignment] Fence runs left at +x factory orientation (no rotation)**
- **Found during:** Task 1 (reading `createFence` + `placeAsset`).
- **Issue:** `createFence` builds its posts along +x and declares one obstacle per post in asset-local coords; `placeAsset` translates but does NOT rotate an asset's obstacles. Rotating a fence group to line a z-aligned boundary would visually turn the posts while their collision footprints stayed on the +x axis — misaligned collision.
- **Fix:** Placed fence runs along x-aligned plaza boundaries (south path gap + north edge) at their native orientation, keeping every post's footprint aligned with its mesh.
- **Files:** src/game/world/createMondstadtWorld.ts.
- **Commit:** cb8d2ac.

No auth gates. No architectural (Rule 4) changes.

## Verification

- `npx tsc -b` — clean (exit 0); the new imports (`createCrate`/`createBarrel`/`createFence`, `TOWN_DISTRICTS`) compile.
- `pnpm exec vitest run` (full suite) — 54 files, 837 tests, all green (no regression).
- [human-verify — phase gate] Load the plaza: crates/barrels stacked at the market edge facing the fountain, fence runs at the south path gap / north edge; the arrangement should read deliberate ("who put this here"), and players should path around the props.

## Known Stubs

None. Props are live geometry from the Plan 03 factories with real collision footprints; placement is complete. The lived-in read is subject to the human-verify phase gate above.

## Self-Check: PASSED

- File: src/game/world/createMondstadtWorld.ts — FOUND (prop block + imports present).
- Commit: cb8d2ac — FOUND.
