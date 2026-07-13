---
phase: 08-wind-core
plan: 03
subsystem: world-ambiance
tags: [wind, canopy, flags, glsl, pooled-materials, onBeforeCompile]
requires:
  - "08-01 (windMath CANOPY/FLAG constants + gustGlsl generator)"
  - "08-02 (createWind WindUniforms contract, wind threaded through MondstadtWorldOptions)"
provides:
  - "initCanopyWind(wind) module-level injection + 4 pooled wind-patched canopy cap materials (canopySway cache key)"
  - "createCampFlag(random, wind) asset: rigid pole + subdivided cloth with traveling-flap patch (campFlag cache key)"
  - "One flag per camp placed in the world decoration loop"
affects:
  - 08-05 (playtest verifies canopy/flag character, A2 back-face check)
  - Phase 11 (plaza banners would reuse the campFlag material/pattern)
tech-stack:
  added: []
  patterns:
    - "Module-level wind injection for factories invoked with only a seeded random (initCanopyWind)"
    - "Per-instance color on a single pooled material via geometry vertex-color attribute"
    - "Shader-side sway only — zero per-frame CPU, frozen-matrix rule untouched (D-13)"
key-files:
  created:
    - src/game/world/assets/createCampFlag.ts
  modified:
    - src/game/world/assets/createCanopyTree.ts
    - src/game/world/assets/index.ts
    - src/game/world/createMondstadtWorld.ts
    - src/game/world/assets/__tests__/assets.test.ts
decisions:
  - "Per-flag banner color rides a vertex-color attribute on each cloth geometry so ONE pooled DoubleSide material serves every flag (plan demanded both a lazy singleton material AND seeded per-flag colors)"
  - "initCanopyWind exported through the assets barrel — the plan directs the world to import it from './assets', so the barrel line landed with Task 1"
  - "Asset unit tests call initCanopyWind(createWind(true)) once at module load, mirroring the world's inject-before-scatter contract instead of weakening the fail-fast throw"
metrics:
  duration: ~10 min
  completed: 2026-07-14
  tasks: 3
  files: 5
status: complete
---

# Phase 8 Plan 03: Canopy Sway + Camp Flags Summary

Tree canopies and new per-camp flags now sway as pure vertex-shader displacement on the same wind uniform objects grass holds — canopies lean slow and height-weighted on 4 pooled cap materials (per-cap allocation deleted), flags flap at 2.5× grass frequency with a phase-gradient wave that whips the free end and snaps taut at gust peaks.

## What Was Built

- **`src/game/world/assets/createCanopyTree.ts`** (D-07): `initCanopyWind(wind)` stores the shared uniforms module-level (the scatter table only passes a seeded random); `getCanopyMaterial(color)` lazily pools ONE patched MeshLambertMaterial per canopy color (4 total) with `customProgramCacheKey = 'canopySway'`. The begin_vertex patch computes world position via `modelMatrix` (valid — build matrices are frozen), ramps `heightWeight` from CANOPY.swayBaseY over the inverse span (tops move most), and displaces `transformed.xz += uWindDir * (lean + gust * gustAmp) * heightWeight * uWindStrength` where `lean` is the low-frequency idle sine (0.68 rad/s = 0.4× grass) and `gust` comes from `gustGlsl` — the same traveling front as grass. Trunks keep the plain `lambert()` (rigid); `getCanopyMaterial` throws descriptively if wind was never injected.
- **`src/game/world/assets/createCampFlag.ts`** (new, D-08): pole (CylinderGeometry h=2.2 r=0.04, module-level pooled lambert, castShadow) + cloth `PlaneGeometry(1.1, 0.65, 8, 3)` translated so x∈[0, width] (fixed edge at the pole). ONE lazy-singleton DoubleSide cloth material (`customProgramCacheKey = 'campFlag'`, `vertexColors: true`); each flag's geometry carries its seeded banner color (red/blue/gold) as a vertex-color attribute. Patch: `along = position.x * invLength`, `flap = sin(uTime * 4.25 - along * 6.0) * along² * (idleAmp + gust * gustAmp)`; `transformed.z += flap * uWindStrength`, `transformed.x -= |flap| * tautPull * along` (cloth shortens as it lifts). FLAG.freq = 2.5× grass (WIND-03). Cloth `castShadow = false`; no obstacles entry. Barrel-exported.
- **`src/game/world/createMondstadtWorld.ts`**: `initCanopyWind(options.wind)` before the scatter table; `placeAroundCamp(createCampFlag(campRandom, options.wind), 5.5)` — exactly one flag per camp, seeded placement (plaza banners deferred to Phase 11).

## Verification

- `pnpm vitest run` — 45 files / 703 tests green after each task; `pnpm build` (tsc -b + vite) exit 0 after each task.
- Three distinct patched cache keys now in `src/game/world/`: `grassField`, `canopySway`, `campFlag` (plus pre-existing `terrainScorch`) — Pitfall 3 collision impossible.
- Zero per-frame CPU added: neither file registers in any update loop; no `updateMatrixWorld` touched (D-13, frozen-matrix rule intact).
- All acceptance greps pass: `canopySway` ≥1, `initCanopyWind` export =1 and wired in the world, non-comment `lambert(` calls in createCanopyTree =1 (trunk only), `gustGlsl` ≥1 in both patches, `customDepthMaterial` =0, `createCampFlag` export =1, barrel =1, `PlaneGeometry` =1 (with 8, 3 segments), `DoubleSide` =1, `new THREE.MeshLambertMaterial` =1 (cloth pool; pole uses assetHelpers), `placeAroundCamp(createCampFlag` =1.

## Known Accepted Limitation

Canopy and flag shadows do NOT sway — the shadow depth pass uses the material's depth variant, which ignores `onBeforeCompile` surface patches (Pitfall 6). At D-07's low canopy amplitude this is invisible; the flag cloth sets `castShadow = false` outright. No customDepthMaterial was added (cost without visible payoff, per plan).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Existing asset tests broke on the fail-fast wind throw**
- **Found during:** Task 1 verification
- **Issue:** `assets.test.ts` builds every factory (including createCanopyTree) with only a seeded random; the new descriptive throw in `getCanopyMaterial` failed 3 tests.
- **Fix:** Test module now calls `initCanopyWind(createWind(true))` once before the factory table — mirroring the world's inject-before-scatter contract rather than weakening the fail-fast behavior.
- **Files modified:** src/game/world/assets/__tests__/assets.test.ts
- **Commit:** d45d87d

**2. [Rule 3 - Blocking] initCanopyWind needed a barrel export in Task 1**
- **Found during:** Task 1 (world wiring)
- **Issue:** The plan directs createMondstadtWorld to import `initCanopyWind` from `./assets`, but listed index.ts only under Task 2's files.
- **Fix:** Added `initCanopyWind` to the existing createCanopyTree barrel line in Task 1's commit.
- **Files modified:** src/game/world/assets/index.ts
- **Commit:** d45d87d

## Known Stubs

None — both consumers are fully wired to the live wind uniforms; no placeholder values or unwired paths. (Assumption A2 — cloth back-face shading — is a scheduled Plan 08-05 visual check, not a stub.)

## Threat Flags

None — all GLSL interpolation comes from compile-time windMath constants (T-08-01 mitigation honored); sway remains 100% cosmetic (T-08-02).

## Success Criteria Status

- Canopies sway low-amplitude/low-frequency and flags flap ~2.5× faster, both reading the SAME uniform objects grass holds (WIND-01, WIND-03) ✓
- Cap materials pooled (4 total) and cloth material pooled (1 total) — per-instance allocation gone ✓
- Visual character/coherence human-verified in Plan 08-05 (as planned)

## Self-Check: PASSED

- FOUND: src/game/world/assets/createCampFlag.ts
- FOUND: src/game/world/assets/createCanopyTree.ts (initCanopyWind + canopySway)
- FOUND commit: d45d87d (feat — canopy sway)
- FOUND commit: 5df96ba (feat — camp flag asset)
- FOUND commit: 933310c (feat — flag placement)
