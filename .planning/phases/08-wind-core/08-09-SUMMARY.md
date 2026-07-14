---
phase: 08-wind-core
plan: 09
subsystem: wind
status: complete
tags: [flag, glsl, shader, gap-closure, voxel]
requirements: [WIND-01, WIND-03]
dependency_graph:
  requires:
    - "08-08 flagSwingGlsl/flagDrapeGlsl generators + FLAG pose constants"
  provides:
    - "Direction-aware flag cloth: in-shader downwind yaw from modelMatrix[0].xz toward uWindDir"
    - "Windless drape pose: ?nowind hangs the cloth limp with drape-gated micro-sway (D-12)"
    - "Voxel-stepped faceted cloth (CLOTH_BANDS quantization + flatShading, D-09 identity)"
  affects:
    - "Phase 8 UAT re-verify (tests 4/5/6/8/9 reopened items)"
tech_stack:
  added: []
  patterns:
    - "in-shader pose from modelMatrix basis columns — per-object variation with zero new uniforms on a pooled material"
    - "art constants live beside the asset (CLOTH_BANDS), wind math lives in windMath.ts — documented boundary"
key_files:
  created: []
  modified:
    - src/game/world/assets/createCampFlag.ts
decisions:
  - "Yaw eased by (0.7 + 0.3*along) so the free end leads — cloth streams toward the wind instead of pivoting rigidly (executor visual call within the truth)"
  - "Drape y-drop uses the QUANTIZED along distance (stepped hang) while the x foreshorten stays continuous — bands step without column collapse/z-fighting"
  - "CLOTH_BANDS = 6 with 12x4 plane segmentation (two vertex columns per band, 65 verts) — clean facet edges, stays tens of vertices (D-13)"
  - "Micro-sway is a single lazy pendulum sin(uTime*limpFreq) scaled by drape*alongQ — no extra spatial literal beyond the 08-08 constants"
metrics:
  duration: "~5 min"
  tasks: 2
  files: 1
  completed: 2026-07-14
---

# Phase 8 Plan 09: Flag Wind Response Gap Closure Summary

Flag cloth now yaws/streams toward uWindDir in-shader (heading recovered from modelMatrix[0].xz, blend from windMath flagSwingGlsl), hangs limp under ?nowind via the flagDrapeGlsl drape pitch with a drape-gated micro-sway, and reads as chunky voxel bands via flat shading + floor-quantized deformation — zero new uniforms, pooled 'campFlag' material and frozen-matrix rule intact.

## What Was Built

- **Downwind yaw (UAT 4/5/9):** the begin_vertex patch computes the cloth's baked world heading from `modelMatrix[0].xz` (exact — the build-time bake is a pure y-rotation), the signed angle to `uWindDir` via `atan(sinA, cosA)` (dot + 2D cross), and yaws the vertex offset about the pole hinge by that angle scaled by the `flagSwingGlsl` blend of strength and the existing retarded-time gust. A `(0.7 + 0.3*along)` ease lets the free end lead so the cloth streams. Gusts snap alignment further downwind (swing 0.75 steady → 1.0 at gust peak, D-04); strength 0 leaves the baked heading untouched.
- **Windless drape (UAT 6, D-12):** `flagDrapeGlsl` weight pitches vertices down about the pole edge by up to `drapePitch` (1.45 rad) — y drops with banded distance, x foreshortens by cos. `?nowind` (drape = exactly 1) hangs the cloth nearly vertical with only the limp micro-sway `sin(uTime*limpFreq) * limpAmp * drape * alongQ` — the one term NOT gated on uWindStrength, so the flag never freezes rigid. Ripple flap + taut pull stay ×uWindStrength and correctly die at 0.
- **Voxel-stepped cloth (UAT 8, D-09):** `CLOTH_BANDS = 6` art constant (documented as NOT wind math); ripple/drape/micro-sway floor-quantize `along` into discrete bands while the yaw uses raw `along` (a stepped yaw would read as tearing); cloth Lambert gains `flatShading: true` (fragment-derivative normals follow the patch for free); plane segmentation 8x3 → 12x4 (two columns per band).
- **Constraints held:** uniforms remain exactly uTime/uWindDir/uWindStrength (zero new), one pooled cloth material per wind lifetime (cache key `'campFlag'`), no per-frame CPU rotation, `cloth.castShadow` false, 112 functional LOC (under 300).

## Verification Results

- Task 1 targeted: `pnpm vitest run windMaterialLifecycle assets` — 49/49; grep confirms both `flagSwingGlsl` and `flagDrapeGlsl` consumed (no locally re-derived pose math, WIND-01 single source).
- Full suite: `pnpm vitest run` — **724/724 green**; no assertion pinned the old 8x3 segmentation, so **zero test files needed modification** (child ordering pole→cloth and CR-01/CR-02 lifetime suites untouched and passing).
- `pnpm build` — production bundle compiles clean (template-literal shader assembly is TS-checked).

## Human UAT Re-verify Items (routed to /gsd-verify-work)

1. During a gust the flag swings/streams the SAME direction the fireplace smoke kinks; harder gusts swing harder (tests 4/5/9).
2. Over several minutes the flag's pointing direction follows the slow wind wander (D-05), not one fixed axis.
3. `?nowind`: cloth hangs limp down the pole with a faint micro-sway — not a rigid horizontal quad (test 6).
4. Cloth reads chunky/faceted per the voxel identity (test 8).
5. Frame feel unchanged (D-13); run `scripts/fps_playtest.py` if suspicious.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 936a87f | feat(08-09): directional downwind swing + windless drape in flag cloth shader |
| 2 | 8047e97 | feat(08-09): voxel-stepped cloth bands + flat shading (UAT test 8) |

## Deviations from Plan

None - plan executed exactly as written. (Task 2's conditional test updates were not needed — no assertion pinned the changed geometry constants.)

## Known Stubs

None.

## Threat Flags

None — client-side vertex-shader work only; T-08-03/T-08-04 mitigations held (tens of vertices, wind-guarded cache unchanged, CR-01/CR-02 suite green).

## Self-Check: PASSED

- src/game/world/assets/createCampFlag.ts — FOUND
- Commits 936a87f, 8047e97 — FOUND in git log
