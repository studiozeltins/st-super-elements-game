---
phase: 08-wind-core
plan: 04
subsystem: world-ambiance
tags: [wind, smoke, instanced-mesh, fixed-pool, radius-cull, perf-flag]
requires:
  - "08-01 (windMath gustAt via wind.sampleGust — the CPU mirror of the shader gust)"
  - "08-02 (createWind Wind contract: sampleGust + directionUniform/strengthUniform live reads; ?nowind wiring)"
provides:
  - "createSmokeColumns(scene, wind, getGroundHeight): fixed 48-slot InstancedMesh puff pool over campfires"
  - "?nosmoke bisect flag — skips construction entirely (zero objects, zero draw calls)"
  - "Fourth WIND-01 consumer, the only CPU-side one — proves the sampleGust JS mirror against the GPU consumers"
affects:
  - 08-05 (playtest verifies plume kink at gust fronts, ?nosmoke/?nowind semantics)
  - Phase 9 (Lambert smoke dims correctly under day/night)
tech-stack:
  added: []
  patterns:
    - "Debris-system discipline: fixed pool + one InstancedMesh + closure scratch objects + needsUpdate-once-per-frame"
    - "Stepped opaque dissolution: discrete size tiers + setColorAt fade toward sky — no alpha under the pixel filter"
    - "2Hz accumulator for cull membership — spatial checks never per frame"
key-files:
  created:
    - src/game/systems/createSmokeColumns.ts
  modified:
    - src/game/createGame.ts
decisions:
  - "Puff lifecycle driven by age with PUFF_LIFE = MAX_RISE/RISE_SPEED (equivalent to the height recycle at constant rise, one field fewer)"
  - "camps imported as a namespace (camps.getCampSites()) — one construction-time call site, matching the data-driven-anchors acceptance grep exactly"
  - "Per-puff random yaw at spawn (static after) so axis-aligned cubes read chunkier without any per-frame rotation cost"
metrics:
  duration: ~6 min
  completed: 2026-07-14
  tasks: 2
  files: 2
status: complete
---

# Phase 8 Plan 04: Campfire Smoke Columns Summary

Campfires within 50u of the player now emit thin columns of chunky opaque voxel puffs from one fixed 48-slot InstancedMesh — puffs rise at 0.8 u/s and drift downwind on live wind-uniform reads with a sampleGust kick that visibly kinks the plume at gust fronts, shrinking/fading toward the sky color in 4 hard steps, all behind `?nosmoke`.

## What Was Built

- **`src/game/systems/createSmokeColumns.ts`** (~155 functional LOC):
  - `SmokeColumns` interface (`update(deltaSeconds, playerX, playerZ)`, `dispose()`) + `createSmokeColumns(scene, wind, getGroundHeight)` factory.
  - **Anchors (D-11):** `camps.getCampSites()` mapped once at construction to `{x, y: ground + 1.0, z}` emitters (flame top) — no scene traversal, ever.
  - **Pool (D-10/D-13):** `SMOKE_POOL_SIZE = 48` hard cap; ONE `InstancedMesh(BoxGeometry, MeshLambertMaterial)` — Lambert (Phase 9 night dims it), opaque (no alpha banding under the pixel target); `DynamicDrawUsage` on instanceMatrix AND instanceColor; `frustumCulled = false`; shadows off; zero-scale matrices hide inactive slots; added to the scene root, never the frozen world group.
  - **Update:** 2Hz accumulator rechecks fire membership inside `SMOKE_CULL_RADIUS = 50`; per-fire spawn every 0.7s with index-staggered start offsets (columns never pulse in sync). Per puff: rise 0.8 u/s; drift `windDir * (0.45 + 1.3 * wind.sampleGust(x,z)) * strengthUniform.value * dt` reading directionUniform components live each frame; age drives 4 discrete size tiers (0.30→0.11) and 4 `setColorAt` steps fading gray 0x757b82 toward sky 0x8ecae6; recycle at 4.5u rise. All matrix composition via closure-level scratch Matrix4/Vector3/Quaternion — zero constructor calls inside update; `needsUpdate` flags set once per frame only when something moved.
  - `?nowind` semantics: `strengthUniform.value = 0` zeroes drift and gust kick, puffs still rise — fire without wind still smokes.
- **`src/game/createGame.ts`** (net +11 lines): `smokeEnabled = !perfFlags.has('nosmoke')` beside the other flags with the bisect comment extended; conditional construction next to the debris precedent (skipped entirely under the flag — smoke is the phase's only new draw-call source, so `?nosmoke` is the clean FPS bisect); `smokeColumns?.update(deltaSeconds, playerPosition.x, playerPosition.z)` in `frame()` beside the debris update, after `wind.update(deltaSeconds)` so puffs read this frame's phase.

## Verification

- `pnpm vitest run` — 45 files / 703 tests green after each task; `pnpm build` (tsc -b + vite) exit 0 after each task.
- All Task 1 acceptance greps pass: `DynamicDrawUsage` ×2, `frustumCulled = false` ×1, `MeshLambertMaterial` ×1 with zero non-comment `MeshBasicMaterial`, zero non-comment `transparent`, `getCampSites` ×1, `sampleGust` ≥1, and every `new THREE.(Vector3|Matrix4|Quaternion|Color)` sits at construction/closure level (lines 69–108; update body starts at 141).
- All Task 2 acceptance greps pass: `nosmoke` ×3, `smokeColumns?.update` ×1, `createSmokeColumns` ×2 (import + construction), `wind.update(deltaSeconds)` at :1325 before `smokeColumns?.update` at :1345 inside frame().
- Pool math holds the cap: steady-state ≈ 8 puffs/fire (5.625s life / 0.7s cadence) × 6 camps worst-case = 48; spawn skips (never grows) when every slot is busy — T-08-03 mitigation structurally enforced.

## Deviations from Plan

None - plan executed exactly as written. (Discretion notes: puff recycle uses `age >= PUFF_LIFE` where `PUFF_LIFE = MAX_RISE/RISE_SPEED` — numerically identical to the height check at constant rise speed; `camps` is a namespace import so the construction-time call is the file's single `getCampSites` occurrence per the acceptance grep.)

## Known Stubs

None — the system is fully wired to the live wind uniforms and the frame loop; no placeholder values or unwired paths.

## Threat Flags

None — `?nosmoke` is a `URLSearchParams.has()` presence check (the plan's declared trust boundary); smoke stays 100% cosmetic (T-08-02) and the fixed pool with slot recycling makes unbounded growth impossible (T-08-03 mitigation).

## Success Criteria Status

- Smoke columns rise from campfires near the player, drift downwind, and kink at gust fronts via the shared wind's sampleGust (WIND-01, WIND-03) ✓
- Chunky stepped voxel puffs, opaque, Lambert — pixel-filter and Phase-9-night safe (D-09) ✓
- Flat frame cost: fixed 48-instance pool, 2Hz cull recheck, zero per-frame allocations (D-11, D-13) ✓
- Visual verification (plume kink, ?nosmoke/?nowind eyeball) lands in Plan 08-05's playtest (as planned)

## Self-Check: PASSED

- FOUND: src/game/systems/createSmokeColumns.ts
- FOUND: src/game/createGame.ts wiring (nosmoke ×3, conditional construction, frame update)
- FOUND commit: da983c2 (feat — smoke pool)
- FOUND commit: a420e0c (feat — createGame wiring)
