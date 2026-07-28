---
phase: 01-feasibility-spike
plan: 03
subsystem: rendering
tags: [webgpu, tsl, water-pro, sky-pro, perf, wake, spray, spike, stck-02]

# Dependency graph
requires:
  - phase: 01-02
    provides: "Beach slice + both pixel shapes + sun-facing rim wired into waterpro-spike.ts"
provides:
  - "src/spike/perfHud.ts — on-screen rolling FPS + renderer/water backend + spray-availability readout; forceWebGLRequested() helper"
  - "src/spike/derisk.ts — lit-water (sparkle/SSS/lifted waterColor) + additive glow overlay + pooled wake (<=16, horizontal) + optional-chained spray, behind ?derisk=1"
  - "?forceWebGL=1 forces the WebGL2 fallback run; ?derisk=1 toggles the SPIKE-04 section + bloom"
  - "Recorded STCK-02 flag: Sky data/*.bin absent in built dist/ (dynamic new URL, Vite can't track)"
  - "The 17-shader port-surface T-shirt estimate table"
affects: [01-04, phase-3-shader-ports, phase-4-water-pro, phase-5-sky-pro, phase-6-reactive]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "On-screen backend+FPS HUD so headed-Chrome screenshots self-document which backend produced each number (fixed ring buffer, FPS text rewritten only on integer change — no per-frame allocs)"
    - "forceWebGL:true is a constructor option on WebGPURenderer — a second run with ?forceWebGL=1 measures the WebGL2 tier with the identical instrument"
    - "Lit water without an emissiveNode = sparkle/SSS/lifted waterColor/bloom + an ADDITIVE transparent overlay mesh riding the surface (depthWrite:false)"
    - "Pooled wake: fixed <=16 generators registered once, proxies skimmed HORIZONTALLY each frame (vertical-only motion injects nothing); proxy.updateMatrixWorld() before water.update so the wake step sees this frame's delta"
    - "water.spray is null on WebGL2 — every spray call optional-chained so the fallback never crashes"

key-files:
  created:
    - "src/spike/perfHud.ts"
    - "src/spike/derisk.ts"
  modified:
    - "src/spike/waterpro-spike.ts"

key-decisions:
  - "FPS numbers are NOT captured in this plan — SwiftShader/headless can't run WebGPU compute (Pitfall 2). This plan delivers the capture MECHANISM + procedure; the actual WebGPU and WebGL2 medium-tier numbers are recorded at the plan-04 on-device go/no-go in headed Chrome."
  - "bloom is gated on ?derisk=1 so it never alters the plain perceptual/perf side-by-side runs"
  - "STCK-02 is a FLAG, not a pass: the built dist/ omits Sky data/*.bin. Fix (inline Vite copy plugin) is deliberately deferred to Phase 5 per the plan; not a spike blocker."

requirements-completed: [SPIKE-03, SPIKE-04, STCK-02]

# Metrics
duration: 11min
completed: 2026-07-28
status: complete
---

# Phase 1 Plan 03: Perf HUD + SPIKE-04 De-risk + STCK-02 Build Smoke Summary

**The measurement + de-risk instrument for the go/no-go: an on-screen FPS/backend HUD that captures both WebGPU and WebGL2 tiers in headed Chrome, a proven lit-water + pooled-wake/spray de-risk section behind `?derisk=1`, a recorded STCK-02 build flag, and the 17-shader port-surface estimate.**

## Performance

- **Duration:** ~11 min
- **Tasks:** 3
- **Files created/modified:** 3 (2 created, 1 modified)

## Accomplishments

- **SPIKE-03 (Task 1):** `perfHud.ts` draws a rolling-average FPS plus the resolved `renderer.backend.isWebGPUBackend`, `water.backend`, and `water.spray !== null` on top of the canvas, so a screenshot proves which backend produced each number. Backend values are read only AFTER `renderer.init()` (three #30024). `?forceWebGL=1` (via `forceWebGLRequested()`) constructs `new WebGPURenderer({ forceWebGL: true })` so a second headed run measures the WebGL2 fallback tier with the identical instrument. Fixed ring buffer + FPS text rewritten only on integer change → no per-frame allocations.
- **SPIKE-04 (Task 2):** `derisk.ts` (behind `?derisk=1`) proves both no-native-API asks with real techniques:
  - Lit water: `water.sparkle.intensity`/`water.sss.intensity`/`water.color.waterColor` lifted + `bloom()` in the post chain, plus an ADDITIVE transparent glow overlay mesh (`MeshBasicMaterial{ transparent, blending: AdditiveBlending, depthWrite: false }`) riding just above the surface — Water Pro has no `emissiveNode`, so this is the REAC-03/04 overlay approach.
  - Pooled projectile reactivity: a FIXED pool of 8 (`<=16`) wake generators registered once via `water.wake.addGenerator`, driven every frame by skimming their proxies HORIZONTALLY low over the sea (`updateGenerator`, never add/remove per projectile — REAC-01; vertical-only motion leaves no wake — Pitfall 4). Vertical impacts use `water.spray?.addEmitter(...)` optional-chained (null on WebGL2, must not crash the fallback).
- **STCK-02 (Task 3):** `pnpm build` emits the spike entry (`dist/assets/spike-<hash>.js`) but **NO `data/` dir** — recorded as a Phase-5 flag with the exact failing paths (below).
- **17-shader port-surface estimate** produced (table below).
- `pnpm build` exits 0 for all three tasks; the game still does not import `src/game/engine/tsl/` or `src/spike/`.

## Task Commits

1. **Task 1 — perf HUD + both-backend FPS capture** — `974464a` (feat)
2. **Task 2 — lit water + pooled wake/spray de-risk** — `16e121c` (feat)
3. **Task 3 — STCK-02 build-smoke flag** — `c8249db` (docs)

## Files Created/Modified

- `src/spike/perfHud.ts` — on-screen FPS + backend/water-backend/spray readout; `forceWebGLRequested()`
- `src/spike/derisk.ts` — lit-water params + additive glow overlay + pooled wake + optional-chained spray; `isDeriskEnabled()`
- `src/spike/waterpro-spike.ts` — wires the HUD, `?forceWebGL=1` renderer option, `?derisk=1` install + gated bloom, per-frame `elapsed` accumulator, and the STCK-02 flag comment at the sky wiring site

## FPS Capture (SPIKE-03) — mechanism ready, numbers pending on-device

The FPS numbers are a headed-Chrome deliverable, captured at the plan-04 go/no-go. Headless/SwiftShader **cannot** run WebGPU compute (Pitfall 2), so no number is recorded here — faking one would defeat the measurement. The capture procedure:

| Run | URL (on `elements.kingdom.lv`) | Reads on-screen | Records |
|-----|-------------------------------|-----------------|---------|
| WebGPU, medium tier | `/waterpro-spike.html` | `renderer WebGPU` / `water webgpu` / `spray available` | the FPS number |
| WebGL2 fallback, medium tier | `/waterpro-spike.html?forceWebGL=1` | `renderer WebGL2 (forced)` / `water webgl` / `spray null (webgl2)` | the fallback FPS number |

Screenshot each; the HUD legend makes each number self-attributing. `?derisk=1` may be added to either to also confirm the lit-water/wake/spray techniques (and that `?forceWebGL=1&derisk=1` does not crash on the null spray).

## STCK-02 result — FLAG (deferred to Phase 5)

**Built `dist/` does NOT ship Sky Pro's cloud-noise `data/`.** Root cause: the vendored bundle loads volumes with a dynamically-constructed URL —

```js
h9 = "./data/"; I9 = s => new URL(h9 + s + ".bin", import.meta.url);
```

Vite's static asset analyzer only rewrites `new URL('<string-literal>', import.meta.url)`; a runtime-concatenated path is invisible to it, so `src/vendor/threejs-sky-pro/data/{baseShape16,baseShape32,baseShape64}.bin` are never copied. In the built output `import.meta.url` is `dist/assets/spike-<hash>.js`, so those loads resolve to:

- `/assets/data/baseShape16.bin` → 404
- `/assets/data/baseShape32.bin` → 404
- `/assets/data/baseShape64.bin` → 404

Dev works (served from `src/vendor/`); the BUILT page's clouds break / sky goes black. **Fix (Phase 5, STCK-02 hardening):** an inline Vite plugin copying `src/vendor/threejs-sky-pro/data/*.bin` → `dist/assets/data/`. Not over-built here per the plan; recorded as a flag, not a spike blocker. Breadcrumb comment left at the sky wiring site in `waterpro-spike.ts`.

## 17-Shader Port-Surface Estimate (SPIKE-04 sign-off input)

`grep -rlE "ShaderMaterial|onBeforeCompile" src/game` = 17 files. T-shirt sizing = effort to move each GLSL surface to a TSL node material (Phase 3, one subsystem per commit, screenshot-gated). Three are **retired** (replaced, not ported); 14 are **ported**.

| # | File | Subsystem / GLSL chunk | Fate | Size |
|---|------|------------------------|------|------|
| 1 | `world/terrainShader.ts` | terrain sand/swash/beach blend (highest GLSL density) | port | **L** |
| 2 | `world/town/buildingMaterials.ts` | town building facades | port | **L** |
| 3 | `world/createGrassField.ts` | grass wind (vertex animation) | port | **L** |
| 4 | `systems/createGroundInfluence.ts` | ground-influence RTT (footprint/decal field) | port | **L** |
| 5 | `world/assets/createRockMesh.ts` | rock mottle | port | **L** |
| 6 | `world/town/createTownGround.ts` | town ground | port | **M** |
| 7 | `world/town/createCobbleMaterial.ts` | cobble | port | **M** |
| 8 | `systems/createScorchMap.ts` | scorch decal map (RTT) | port | **M** |
| 9 | `world/assets/createCampFlag.ts` | flag wind (vertex) | port | **M** |
| 10 | `world/assets/createCanopyTree.ts` | canopy wind | port | **M** |
| 11 | `systems/wingedCreature.ts` | wildlife wing-flap (vertex) | port | **S** |
| 12 | `world/assets/createBeachProps.ts` | beach props (mostly MeshStandard + minor tweak) | port | **S** |
| 13 | `world/createPlazaStructures.ts` | plaza (glsl≈1, near-MeshStandard) | port | **S** |
| 14 | `world/createMondstadtWorld.ts` | world assembly — few shader hooks into the above | port | **S** |
| 15 | `engine/createPixelRenderer.ts` | WebGL pixel renderer → TSL post chain | retire (≈90% salvaged into the spike's `pixelFilterNode`/`outlineNode`) | **L** |
| 16 | `world/createSeaWater.ts` | custom WebGL sea → Water Pro | retire | **N/A** |
| 17 | `world/createFountainWater.ts` | small fountain water → small Water Pro/node | retire/replace | **S** |

**Rough rollup (ports, Phase 3):** 5×L + 5×M + 4×S. The two make-or-break perf surfaces are `terrainShader` and `createGrassField` (both L, both drive most of the frame's pixels). `createMondstadtWorld` is 930 LOC but its shader surface is small (orchestration).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TSL typed-node overloads rejected `bloom(out)` / `out.add(...)`**
- **Found during:** Task 2 (`pnpm build`)
- **Issue:** `out` is annotated as the base `Node`; `bloom` requires `Node<"vec4">` and `.add` is a fluent-node method not on the base type — identical to the 01-02 salvage-node friction.
- **Fix:** Cast the operands to the loose fluent form inline (`out as unknown as Parameters<typeof bloom>[0]`, `out as unknown as { add(n: Node): Node }`). Runtime node graph unchanged — type-surface only.
- **Files modified:** `src/spike/waterpro-spike.ts`
- **Committed in:** `16e121c`

**Total deviations:** 1 auto-fixed (Rule 3 - blocking, type-surface only). No behavior or scope change.

## Issues Encountered

- Bundle-size warning on `spike-<hash>.js` (~7 MB / 4.6 MB gzip) — expected for a throwaway spike that eagerly imports full Water Pro + Sky Pro; not a shipping concern (the spike never ships in the game `dist/`). No action.

## Known Stubs

None. `perfHud.ts` and `derisk.ts` are complete working instruments. The one intentional non-deliverable is the FPS number itself, which is a headed-Chrome capture at plan 04 by design (not a stub — the mechanism and procedure are complete).

## User Setup Required

None — client-only rendering spike. The plan-04 go/no-go needs a human to open the two URLs in headed Chrome and read/screenshot the HUD.

## Next Phase Readiness

- Every input the go/no-go (plan 04) needs is in place: the perceptual instrument (plan 02), the FPS/backend HUD + both-backend capture procedure (this plan), the two proven no-API techniques behind `?derisk=1`, the STCK-02 build fact, and the 17-shader estimate.
- **Pending human gate (by design):** headed-Chrome FPS capture on both backends + the `?derisk=1` visual confirmation, recorded at plan 04.
- **Phase-5 carry:** the STCK-02 inline Vite copy plugin for Sky `data/`.

## Self-Check: PASSED

- Files `src/spike/perfHud.ts`, `src/spike/derisk.ts`, `src/spike/waterpro-spike.ts` — all present.
- Commits `974464a`, `16e121c`, `c8249db` — all present.
- `pnpm build` exits 0; `data/` confirmed absent from `dist/` (STCK-02 flag verified). Game imports neither `src/spike/` nor `src/game/engine/tsl/`.

---
*Phase: 01-feasibility-spike*
*Completed: 2026-07-28*
