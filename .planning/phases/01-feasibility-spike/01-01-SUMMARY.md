---
phase: 01-feasibility-spike
plan: 01
subsystem: rendering
tags: [webgpu, tsl, water-pro, sky-pro, vendoring, submodule, spike]
status: complete
requires: []
provides:
  - "src/vendor private submodule (Water Pro v3.2.1 + Sky Pro v2.0.0 prebuilt bundles)"
  - "waterpro-spike.html 2nd Vite entry"
  - "src/spike/waterpro-spike.ts end-to-end WebGPU+Water+Sky+pixel tracer"
  - "src/game/engine/tsl/pixelFilterNode.ts minimal salvage pixel node"
affects:
  - "vite.config.ts (rollupOptions.input.spike)"
  - ".gitmodules"
tech-stack:
  added:
    - "threejs-water-pro@3.2.1 (vendored, private submodule)"
    - "threejs-sky-pro@2.0.0 (vendored, private submodule)"
  patterns:
    - "async WebGPU bootstrap: await renderer.init() before backend read; postProcessing.render() not renderer.render()"
    - "final-pixelate TSL node via screenUV/screenSize cell-snapping + convertToTexture"
    - "vendored paid bundles isolated in a private git submodule (public repo records only a 160000 gitlink)"
key-files:
  created:
    - "waterpro-spike.html"
    - "src/spike/waterpro-spike.ts"
    - "src/game/engine/tsl/pixelFilterNode.ts"
    - ".gitmodules"
  modified:
    - "vite.config.ts"
decisions:
  - "Vendor repo owner = logingrupa org (Option B), not studiozeltins — the CLI identity (roulendz) cannot create repos under the studiozeltins user namespace"
  - "Vendored the existing prebuilt build/ output (Jul 21); copied the FULL build/ tree so tsc -b resolves the bundle's sibling .d.ts re-exports"
metrics:
  duration_min: 9
  completed: 2026-07-28
  tasks: 2
  files: 6
---

# Phase 1 Plan 01: Feasibility Spike — Vendoring + Tracer Summary

Vendored Water Pro v3.2.1 + Sky Pro v2.0.0 as a **private git submodule** (public repo stays license-clean) and landed the leading **tracer**: a standalone `waterpro-spike.html` that boots `WebGPURenderer → WaterSystem → Sky → a minimal TSL pixel node` over a `getTerrainHeight`-sampled beach slice at the game's 45° tilted camera, self-reporting the resolved backend — proving the whole WebGPU + vendored-Pro + TSL-post chain builds and wires before any expansion.

## What Was Built

**Task 1 — Vendoring + spike entry (commit `5a20d3c`)**
- Created the **private** repo `logingrupa/st-super-elements-vendor` and added it as the `src/vendor` submodule via SSH.
- Copied both packages' full prebuilt `build/` trees into the submodule (`threejs-water-pro/`, `threejs-sky-pro/` incl. mandatory `data/*.bin` cloud-noise), committed + pushed **inside the submodule only** (submodule commit `b49799b`).
- The **public** main repo records only a `160000` gitlink for `src/vendor` — verified via `git ls-files -s src/vendor` (no paid blobs in public history; `pro/` stays gitignored). This applies D-01 / STCK-03.
- `vite.config.ts` gained `build.rollupOptions.input = { main, spike }`, preserving the `react()` plugin and the `elements.kingdom.lv` allowedHosts block verbatim.

**Task 2 — Tracer (commit `d6d9e63`)**
- `waterpro-spike.ts` follows the `sky-pro-integration.md` recipe: `three/webgpu` import, `await renderer.init()` before reading the backend, game 45° FOV camera with `far` extended to 20000 (Pitfall 1), a `getTerrainHeight`-sampled beach `PlaneGeometry` over `ISLANDS[0]` (waterline shifted to y=0), Water + Sky created and coupled once via `water.setSky(sky.createSkyProvider({ envMap: true }))`, a post chain ending in the pixel node, and an async loop using `postProcessing.render()`.
- `pixelFilterNode.ts` is a minimal nearest-downsample node (final-pixelate shape) using `screenUV`/`screenSize` cell-snapping — the salvage seed plan 02 expands into both shapes + the sun-facing rim.
- Backend is logged (`renderer backend`, `water.backend`, `spray available`) for the SPIKE-03 perf artifact.
- `pnpm build` (`tsc -b && vite build`) exits 0 and emits `dist/assets/spike-*.js` + `dist/waterpro-spike.html`.

## Deviations from Plan

### Approved (coordinator-confirmed)

**1. [Rule 4 — Ownership decision] Vendor repo owner = `logingrupa`, not `studiozeltins`**
- **Found during:** Task 1 setup.
- **Issue:** The plan/D-01 named `studiozeltins/st-super-elements-vendor`, but `studiozeltins` is a separate **user** account (not an org); the authenticated CLI (`roulendz`) has only push/triage on the main repo and cannot create repos in another user's namespace.
- **Resolution:** HALTED with a decision checkpoint (per the plan's critical D-01 constraint — never guess the owner or leak paid code). Coordinator chose **Option B — `logingrupa`** (an org `roulendz` owns). Created `logingrupa/st-super-elements-vendor` (private) and wired it as the submodule.
- **Commit:** `5a20d3c`

**2. [Rule 3 — Approved deviation] Vendored existing prebuilt `build/` output**
- **Issue:** The plan action said run `npm install && npm run build:lib` inside `./pro`. The prebuilt `build/` output already existed (dated Jul 21).
- **Resolution:** Coordinator approved vendoring the existing bundles rather than forcing a fresh rebuild (rebuild adds no value, risks a flaky install).
- **Commit:** `5a20d3c`

### Auto-fixed

**3. [Rule 3 — Blocking issue] Copied the FULL `build/` tree, not just `index.js`/`index.d.ts`**
- **Found during:** Task 2 (`pnpm build`).
- **Issue:** The repo build runs `tsc -b`. Each bundle's `index.d.ts` re-exports from ~152 sibling `.d.ts` files. Copying only `index.js`/`index.js.map`/`index.d.ts` (as the plan literally specified) would break type resolution. The `index.js` itself is a single self-contained bundle (no runtime sibling imports), so runtime was fine — only types needed the siblings.
- **Fix:** Vendored each package's complete `build/` tree into the submodule. `tsc -b` now resolves cleanly (`skipLibCheck: true` skips their internals).
- **Commit:** `5a20d3c`

**4. [Rule 1 — Type errors] Tracer type annotations**
- **Issue:** `let out = scenePass.getTextureNode('output')` inferred `TextureNode`, rejecting the `Node` returned by `buildNode`/`applyTo`; and `renderer.backend.isWebGPUBackend` is set at runtime but absent from the `Backend` `.d.ts`.
- **Fix:** Annotated `out: Node` (as the vendored doc does) and cast the backend read. Both are type-surface-only; runtime behavior unchanged.
- **Commit:** `d6d9e63`

## Verification

- `pnpm build` exits 0, emits the spike bundle + `dist/waterpro-spike.html`. ✓ (automated tracer `<verify>`)
- Public repo records only a `160000` gitlink for `src/vendor`; no paid blobs; `pro/` gitignored. ✓
- `.gitmodules` → `git@github.com:logingrupa/st-super-elements-vendor.git`. ✓
- Tracer feedback gate (auto mode): re-ran the automated `<verify>` end-to-end — passed. Expansion permitted (no expansion tasks in this plan).

**Pending human gate (by design):** The tracer's `<human-check>` — opening `elements.kingdom.lv/waterpro-spike.html` in **headed Chrome** to confirm the scene renders pixelated and logs the WebGPU backend — cannot run headless (SwiftShader has no WebGPU compute, RESEARCH Pitfall 2). This is the recorded phase go/no-go (plan 04), not a blocker for this plan.

## Known Stubs

| File | Reason | Resolved by |
|------|--------|-------------|
| `src/game/engine/tsl/pixelFilterNode.ts` | Intentional minimal tracer node — final-pixelate only, no sun-facing rim / depth outline yet | Plan 02 (both resolution shapes + ported outline). Documented in the plan; not a defect. |

## Notes / Flags for Later Phases

- **STCK-02 / Pitfall 3 (Phase 5):** Sky Pro's `data/*.bin` is **not** auto-copied to `dist/` by `vite build` (confirmed empty in `dist`). The tracer boots in dev (data resolves relative to `src/vendor`); the `dist` inline-Vite-plugin copy is the Phase 5 hardening. `vite preview` of the spike would 404 on `data/` until then.
- **`.31` deploy (Phase 2):** the submodule is private — `.31`'s git-pull→build must add `--recurse-submodules` and **read-only private-repo auth scoped to the `logingrupa` org**. Flagged in the submodule README. Not provisioned this phase.
- Bundle bloat: the spike chunk is ~7 MB (Water Pro bundle). Expected for a spike; not shipped in the game `dist/`.

## Self-Check: PASSED

- Files: `src/vendor/threejs-water-pro/index.js`, `src/vendor/threejs-sky-pro/index.js`, `src/vendor/threejs-sky-pro/data`, `waterpro-spike.html`, `src/spike/waterpro-spike.ts`, `src/game/engine/tsl/pixelFilterNode.ts`, `.gitmodules` — all FOUND.
- Commits `5a20d3c`, `d6d9e63` — both FOUND.
- `src/vendor` gitlink mode `160000` — confirmed (no blobs in public repo).
