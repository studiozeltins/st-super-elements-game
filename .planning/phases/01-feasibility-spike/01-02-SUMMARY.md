---
phase: 01-feasibility-spike
plan: 02
subsystem: rendering
tags: [webgpu, tsl, pixel-filter, depth-outline, water-pro, terrain, spike]

# Dependency graph
requires:
  - phase: 01-01
    provides: "WebGPU + Water Pro + Sky Pro + pixel-node tracer, vendored bundles, spike entry, minimal pixelFilterNode stub"
provides:
  - "src/spike/beachSlice.ts — getTerrainHeight-sampled representative slice (sand + shoreline + rocks + grass patch)"
  - "src/spike/beachSlice.test.ts — pure height-sampling test crossing SEA_LEVEL"
  - "src/game/engine/tsl/pixelFilterNode.ts — both resolution shapes behind ?shape=whole|final"
  - "src/game/engine/tsl/outlineNode.ts — one-sided sun-facing depth-outline rim (TSL Fn)"
  - "?tone= toggle (ACES vs neutral) + per-frame sun screen direction wiring in waterpro-spike.ts"
affects: [01-03, 01-04, phase-2-webgpu-migration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TSL depth-outline: linear-depth rebuild from scenePass depth texture (proven lin() math), sample only the sun-facing neighbour, mix toward a lighter shade (one-sided rim, not symmetric white)"
    - "Two pixelation shapes behind ?shape=: pixelate-whole-chain (chunky low-res rim) vs rim-at-full-res-then-pixelate-last"
    - "Pure height sampler extracted from the mesh builder so the shoreline-crossing assertion is unit-testable without a GPU"
    - "Spike props (rocks/grass) use plain MeshStandardMaterial — the game's onBeforeCompile GLSL shaders cannot compile on WebGPURenderer"

key-files:
  created:
    - "src/spike/beachSlice.ts"
    - "src/spike/beachSlice.test.ts"
    - "src/game/engine/tsl/outlineNode.ts"
  modified:
    - "src/game/engine/tsl/pixelFilterNode.ts"
    - "src/spike/waterpro-spike.ts"

key-decisions:
  - "Spike rocks/grass are simple MeshStandardMaterial low-poly meshes, NOT the game's createRockMesh — its onBeforeCompile GLSL won't compile on WebGPURenderer"
  - "Shape A (whole) and Shape B (final) are both realized as post nodes: A pixelates first then rims the low-res image (chunky pixel-aligned outline); B rims full-res then pixelates last. A true low-res scene pass is the deeper Phase-2 variant if the perceptual sign-off favors 'whole'"
  - "Outline reads depth via scenePass.getTextureNode('depth') + the proven lin() reconstruction (RESEARCH A1 fallback), not getViewZNode — a plain texture read allows sampling the offset sun-facing neighbour"

patterns-established:
  - "One-sided sun-facing rim ported to TSL from createPixelRenderer.ts (edgeStrength 0.95, threshold 0.06, texelScale 1.4)"
  - "No sRGB re-encode inside the nodes — PostProcessing + renderer color management own output encoding (RESEARCH Pitfall 5)"

requirements-completed: [SPIKE-01, SPIKE-02]

coverage:
  - id: D1
    description: "Representative beach slice samples real getTerrainHeight and straddles the waterline (SEA_LEVEL = -0.8) so the outline has real shoreline edges (SPIKE-01, D-03)"
    requirement: "SPIKE-01"
    verification:
      - kind: unit
        ref: "src/spike/beachSlice.test.ts#straddles the waterline: min below SEA_LEVEL, max above it"
        status: pass
    human_judgment: false
  - id: D2
    description: "Pixel-art look reproduced in TSL in BOTH resolution shapes, switchable via ?shape=whole|final; identity matches master through the filter (SPIKE-02, D-02)"
    requirement: "SPIKE-02"
    verification:
      - kind: automated
        ref: "pnpm build (tsc -b && vite build) exits 0 — both ?shape= branches compile into the bundle"
        status: pass
      - kind: manual_procedural
        ref: "headed Chrome: load ?shape=whole and ?shape=final; both render pixelated; identity vs master"
        status: unknown
    human_judgment: true
    rationale: "Perceptual sign-off is the locked go/no-go bar (D-02); runtime WGSL compile + look can only be judged in headed Chrome (SwiftShader has no WebGPU compute)"
  - id: D3
    description: "One-sided sun-facing lighter rim reproduced as a TSL node reading scene-pass depth (not the symmetric built-in edge) (SPIKE-02, RNDR-03 precursor)"
    requirement: "SPIKE-02"
    verification:
      - kind: manual_procedural
        ref: "headed Chrome: rock/shoreline edges show a one-sided lighter rim on the sun side only"
        status: unknown
    human_judgment: true
    rationale: "The rim only appears against live Water/Sky depth on a WebGPU backend; visual one-sidedness is a perceptual judgment"

# Metrics
duration: 22min
completed: 2026-07-28
status: complete
---

# Phase 1 Plan 02: Representative Beach Slice + TSL Pixel Filter Summary

**The full salvage instrument for the SPIKE-02 go/no-go: a getTerrainHeight-sampled beach slice (sand + shoreline + rocks + grass) plus the game's pixel-art identity reproduced in TSL in both resolution shapes with the signature one-sided sun-facing depth-outline rim.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-07-28T17:12Z
- **Completed:** 2026-07-28T17:26Z
- **Tasks:** 2
- **Files modified/created:** 5 (3 created, 2 modified)

## Accomplishments
- Extracted and expanded the tracer's inline flat slice into `beachSlice.ts`: a real `getTerrainHeight`-sampled mesh over the ISLANDS[0] beach arc, plus shoreline rocks and an inland grass patch (single-draw InstancedMesh) — genuine depth discontinuities for the outline (D-03).
- Pure `sampleBeachSliceHeights` helper + `beachSlice.test.ts` pin that the slice straddles SEA_LEVEL (-0.8) — 897 tests green.
- Ported the game's signature one-sided sun-facing rim to a TSL `Fn` (`outlineNode.ts`): linear-depth rebuild from the scene-pass depth texture, sample only the neighbour toward the sun screen dir, mix toward a lighter shade (never a symmetric white edge).
- `pixelFilterNode.ts` now offers BOTH resolution shapes behind `?shape=whole|final` and appends the rim; `?tone=` toggles ACES vs neutral; the sun screen direction is projected and fed to the rim each frame.
- `pnpm build` exits 0 (both shape branches compile); the game does not import `src/game/engine/tsl/` (D-04 held).

## Task Commits

1. **Task 1 (RED): failing height-sampling test** - `d1c4e7b` (test)
2. **Task 1 (GREEN): representative beach slice** - `cd0388b` (feat)
3. **Task 2: TSL pixel filter — both shapes + sun-facing rim** - `b2f556d` (feat)

_Task 2 is a GPU post-node with no pure-unit behavior to assert; its gate is `pnpm build` (compile) + the headed perceptual sign-off, so it is a single feat commit rather than a RED/GREEN pair._

## Files Created/Modified
- `src/spike/beachSlice.ts` - getTerrainHeight-sampled mesh + rocks + grass patch; pure `sampleBeachSliceHeights` helper
- `src/spike/beachSlice.test.ts` - asserts the sampled field crosses SEA_LEVEL with real relief
- `src/game/engine/tsl/outlineNode.ts` - one-sided sun-facing depth-outline rim (TSL Fn) + `setOutlineSunDir`
- `src/game/engine/tsl/pixelFilterNode.ts` - both resolution shapes behind `?shape=`, appends the rim, reads scenePass depth
- `src/spike/waterpro-spike.ts` - wires `buildBeachSlice`, passes scenePass + near/far, `?tone=` toggle, per-frame sun screen dir

## Decisions Made
- **Simple spike props, not the game's rock/terrain builders.** `createRockMesh` / `patchTerrainShader` use `onBeforeCompile` raw GLSL, which does not compile on `WebGPURenderer`. Rocks and grass are plain `MeshStandardMaterial` low-poly meshes — enough for real depth edges, and keeps the spike honestly on the WebGPU path.
- **Both shapes as post nodes.** Shape A pixelates the whole composited chain first then computes the rim at the cell grid (chunky, pixel-aligned); Shape B rims full-res then pixelates last. A genuinely low-res *scene pass* (rendering water/sky at reduced internal resolution) is the deeper Phase-2 variant to build only if the perceptual sign-off favors 'whole'.
- **Depth via `getTextureNode('depth')` + `lin()`**, not `getViewZNode()` — the neighbour sample toward the sun needs a plain texture read at an offset UV, which the raw depth texture path allows (RESEARCH A1 fallback, matches the old GLSL exactly).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TSL typed-node generics rejected the untyped `Node` params**
- **Found during:** Task 2 (`pnpm build`)
- **Issue:** `outlineNode`/`pixelFilterNode` do fluent TSL math (`.mul`/`.div`/`.add`/`.mix`/`.clamp`) on incoming nodes typed as the base `Node`; TSL's `@types/three` overloads require the concrete `Node<"vec2">`/`Node<"float">` generics, so the base type failed every overload.
- **Fix:** Cast the TSL operands to the loose fluent node form inside the salvage nodes (scoped `eslint-disable` for the casts) and use method-chained `.clamp`/`.mix` to sidestep free-function overload resolution. Runtime WGSL is unchanged — this is type-surface only.
- **Files modified:** `src/game/engine/tsl/outlineNode.ts`, `src/game/engine/tsl/pixelFilterNode.ts`
- **Verification:** `pnpm build` exits 0.
- **Committed in:** `b2f556d`

**2. [Rule 3 - Blocking] Prettier reformat of the new spike files**
- **Found during:** Task 2 wrap-up (`prettier --write`)
- **Issue:** New files used single quotes / different wrapping than the repo's prettier config.
- **Fix:** Ran `prettier --write` over the five touched files; folded the Task 1 file reformat into the Task 2 commit.
- **Verification:** `pnpm build` + `pnpm test` still green.
- **Committed in:** `b2f556d`

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking, type-surface/formatting only)
**Impact on plan:** No behavior or scope change. Both were mechanical unblocks to make the salvage nodes compile cleanly.

## Issues Encountered
- `npx eslint` from the package dir cannot find the monorepo-root ESLint config, so lint could not be run standalone. Not the plan's gate (`pnpm build` is); prettier formatting was applied instead. Flagged for the repo's normal `pnpm lint` (root-resolved) path.

## Known Stubs
None. The Wave-1 stub (`pixelFilterNode.ts` final-pixelate-only) is now resolved — both shapes + the ported sun rim are implemented.

## User Setup Required
None - client-only rendering spike, no external service configuration.

## Next Phase Readiness
- The complete SPIKE-02 instrument is rendering: representative slice + both pixel shapes + one-sided sun rim, tone-matched via PostProcessing.
- **Pending human gate (by design, D-02):** the perceptual go/no-go — open `elements.kingdom.lv/waterpro-spike.html` in headed Chrome, compare `?shape=whole` vs `?shape=final` (and `?tone=neutral`) against master through the filter. Headless/SwiftShader cannot run WebGPU compute (RESEARCH Pitfall 2). This is the recorded phase go/no-go (plan 04), not a blocker for this plan.
- Plan 03 (perf HUD + SPIKE-04 de-risk) and plan 04 (go/no-go sign-off) can proceed.

## Self-Check: PASSED

- Files: `src/spike/beachSlice.ts`, `src/spike/beachSlice.test.ts`, `src/game/engine/tsl/outlineNode.ts`, `src/game/engine/tsl/pixelFilterNode.ts`, `src/spike/waterpro-spike.ts` — all FOUND.
- Commits `d1c4e7b` (test RED), `cd0388b` (Task 1 GREEN), `b2f556d` (Task 2) — all FOUND.
- `pnpm build` exits 0; `pnpm test` 897 passing. Game does not import `src/game/engine/tsl/` (grep-verified).

---
*Phase: 01-feasibility-spike*
*Completed: 2026-07-28*
