# Requirements: super-elements — v0.4.0-alpha WebGPU Sky & Water

**Defined:** 2026-07-28
**Core Value:** A retained PVPvE loop with no progress-wipe churn. This milestone re-platforms the
renderer (WebGL→WebGPU/TSL) so the world's sea and sky become commercial-grade and reactive,
without losing the sacred pixel-art identity.

**Goal:** Migrate the whole render pipeline to `WebGPURenderer`, port the pixel-filter + 17 custom
shaders to TSL node materials, then drop the custom sea/day-night for **Water Pro v3.2.1** +
**Sky Pro v2.0.0**, and make the sea **reactive** (projectile-aware + lit).

## v1 Requirements

Requirements for this milestone. Each maps to exactly one roadmap phase. Phase order is
dependency-forced (spike → renderer → shaders → water → sky → reactive) — see ROADMAP.md.

### Vendoring & Stack (STCK)

- [ ] **STCK-01**: Water Pro v3.2.1 + Sky Pro v2.0.0 are vendored into `src/vendor/` (prebuilt
  `build/` copied, not aliased to their `src/`), importable via `three/webgpu` + `three/tsl`
  (zero new runtime deps — `three@0.185.1` already ships both).
- [ ] **STCK-02**: Sky Pro's `data/` (cloud noise) is copied into `dist/` by an inline Vite plugin
  so the built game loads it at the hashed asset path (dev + `dist` both work).
- [ ] **STCK-03**: A git policy for `src/vendor/**` (licensed bundles) is decided and applied so
  the `.31` git-pull→build deploy succeeds.

### Feasibility Spike (SPIKE) — make-or-break gate, zero game changes

- [ ] **SPIKE-01**: An isolated `waterpro-spike.html` renders `WebGPURenderer` + `WaterSystem` +
  Sky Pro over a `getTerrainHeight`-sampled beach at the game's tilted top-down camera.
- [ ] **SPIKE-02**: The pixel-filter look (low-res nearest upscale + depth-discontinuity outline)
  is reproduced in TSL and screenshot-diffed against the `master` WebGL look, in **both** candidate
  resolution shapes (pixelate-whole-chain vs final-pixelate). A recorded go/no-go sign-off gates
  Phase 2; if unreproducible → **STOP**, keep the WebGL renderer (sanctioned escape hatch).
- [ ] **SPIKE-03**: WebGPU compute is confirmed running on the target machine, and the WebGL2
  auto-fallback path is measured (FPS at the candidate quality tier) — headed Chrome / user
  capture, since headless can't run WebGPU compute.
- [ ] **SPIKE-04**: Both no-native-API asks are de-risked with a proven technique before Phase 6 is
  planned: the lit/emissive-water approach (sparkle/SSS/waterColor/bloom + additive overlay) and
  the projectile approach (pooled wake for skim, spray for impact).

### Renderer Migration + Pixel Filter (RNDR)

- [ ] **RNDR-01**: The game renders through `WebGPURenderer` (async `init()`/`compileAsync`) with no
  `WebGLRenderer` remaining in the game path.
- [ ] **RNDR-02**: The pixel filter (low-res render target + nearest upscale) is a TSL post node;
  the game reads pixel-correct at the game camera.
- [ ] **RNDR-03**: The depth-discontinuity outline pass is ported to TSL with the sun-facing rim
  intact, reading the scene-pass depth.
- [ ] **RNDR-04**: The frame loop is async-aware and correctly ordered
  (`sky.update` → `await water.update` → `postProcessing.render`; water node before sky node).
- [ ] **RNDR-05**: With custom shaders temporarily flat-shaded, the game still renders (silhouettes
  + color correct) at the Phase gate — proving the migration independent of the shader port.

### Shader Ports to TSL (SHDR) — one subsystem per commit, screenshot-gated

- [ ] **SHDR-01**: RT feeders (`createGroundInfluence`, `createScorchMap`) re-expressed as WebGPU
  render-to-texture / compute passes (infra — terrain/grass depend on them).
- [ ] **SHDR-02**: Terrain shader ported to TSL (pixel grass clods, roads + cart-ruts, scorch
  craters + vertex dents, beach sand + swash surf, footprints).
- [ ] **SHDR-03**: Grass field ported to TSL (wind sway + ground-influence bend), sharing the ported
  `windMath` node helpers.
- [ ] **SHDR-04**: Town surfaces ported to TSL (building walls/roofs, town cobble ground, windmill
  triplanar cobble) via ported `pixelSurfaceShaders` node helpers.
- [ ] **SHDR-05**: Props ported to TSL (rock mottle/crags, beach clutter clods, fountain pond water).
- [ ] **SHDR-06**: Wind props ported to TSL (camp flag drape/swing + projectile impulse, canopy tree
  gust sway).
- [ ] **SHDR-07**: Wildlife ported to TSL (butterfly wing-flap vertex animation).

### Water Pro Integration (WATR)

- [ ] **WATR-01**: `createSeaWater` is retired (deleted, no dead code) and `WaterSystem` renders the
  sea plane at `SEA_LEVEL`.
- [ ] **WATR-02**: The player leaves a wake trail via `water.wake.addGenerator(playerMesh, …)`.
- [ ] **WATR-03**: Depth water-color, shoreline foam, swell, whitecaps, and sun/moon sparkle are
  tuned for the stylized top-down look through the pixel filter (like-for-like upgrade of the old
  sea's visible set).
- [ ] **WATR-04**: Water anti-features (underwater stack, SSR, screen-space refraction) are left
  disabled for perf, and a `QUALITY_LEVELS` tier is chosen (start `medium`) that holds framerate;
  `setQualityLevel` rebuilds the post chain.
- [ ] **WATR-05**: Archipelago islands read correctly against the continuous ocean plane;
  `water.masking` is applied only if an enclosed cove actually needs it.

### Sky Pro Integration (SKY)

- [ ] **SKY-01**: The sky dome + day/night sky/fog/sun path is retired; `SkySystem` renders the
  procedural sky + atmosphere.
- [ ] **SKY-02**: The LAN server-anchored clock drives `sky.timeOfDay.time.value`
  (`autoAdvanceSecondsPerDay = 0`) so all players share the same time of day; `Date.now()` fallback.
- [ ] **SKY-03**: `water.setSky(sky.createSkyProvider({ envMap: true }))` couples sky→water
  (reflection env, sun glint, fog color) and is built exactly once.
- [ ] **SKY-04**: The shadow-casting sun and the outline rim (`setEdgeSunDir` / `sunDirUniform`) are
  re-sourced from Sky Pro's sun so shadows and rim-light track the sky.
- [ ] **SKY-05**: Night renders a starfield (starmap asset shipped), not pitch black.

### Reactive & Lit Water (REAC) — the new asks

- [ ] **REAC-01**: Projectiles skimming low over the sea disturb the water via a **fixed reused
  pool** of wake generators (`updateGenerator`, ≤16/frame — never unbounded add/remove per
  projectile).
- [ ] **REAC-02**: Projectile surface impacts emit a `water.spray` plume on WebGPU; the effect is
  gracefully absent (no crash) on the WebGL2 fallback.
- [ ] **REAC-03**: The sea reads as **lit** — sparkle / SSS / lifted `waterColor` / bloom tuned so
  the surface is not a flat sheet.
- [ ] **REAC-04**: Localized emissive glow (e.g. a glowing impact) lights the surface via additive
  transparent overlays riding the water — Water Pro has no `emissiveNode`, so this is an overlay,
  not the water material emitting.
- [ ] **REAC-05**: Reactive-water frame cost holds target FPS in a golem-class combat scene with
  projectiles + all ambiance enabled (profiled, headed).

### Deploy / Secure Context (DPLY)

- [ ] **DPLY-01**: The WebGPU secure-context deploy decision (force-https everywhere vs. accept the
  WebGL2-tier fallback for plain-http LAN players) is resolved at the ship gate with real FPS
  numbers, and a graceful `WebGPURenderer`→WebGL2 feature-detect fallback is verified (scene renders
  on both; spray degrades silently).

## v2 Requirements

Deferred to a future milestone. Tracked, not in this roadmap.

### Water Depth Effects (WDEP)

- **WDEP-01**: Buoyancy / floating-object physics (`water.buoyancy`) for drifting props.
- **WDEP-02**: Underwater camera mode (would re-enable the entire underwater stack).

## Out of Scope

Explicitly excluded. Anti-features from research live here with the reason.

| Feature | Reason |
|---------|--------|
| Underwater rendering (haze, god-rays, ocean floor, caustics, waterline meniscus, Snell TIR) | Camera never submerges in this top-down game — pure cost, invisible |
| SSR / screen-space refraction micro-detail | Averaged away by the ~320×240 pixel filter — cost with no visible payoff |
| Custom emissive TSL term in the water material | Chose additive-overlay approach (REAC-04); a real emissive term would force vendoring Water Pro source (fragile) |
| Buoyancy / floating objects (this milestone) | No gameplay need yet (YAGNI) — deferred to WDEP-01 |
| Global rain / `rain.ripples` weather | Weather (WTHR-01) already deferred at v0.3.0; not this milestone |
| Server changes / time-of-day gameplay hooks | Client-only milestone — no SpacetimeDB publish |
| Force-https-now / a first-class built WebGL2 quality tier | Deploy decision deferred to ship gate (DPLY-01); WebGL2 auto-fallback already renders the scene |

## Traceability

Phase mapping **confirmed by roadmapper** 2026-07-28 (provisional mapping stood; no renumbering
needed — the dependency-forced order matches category boundaries 1:1). Phase numbering reset to 1
this milestone (`--reset-phase-numbers`).

| Requirement | Phase | Status |
|-------------|-------|--------|
| STCK-01 | Phase 1 | Pending |
| STCK-02 | Phase 1 | Pending |
| STCK-03 | Phase 1 | Pending |
| SPIKE-01 | Phase 1 | Pending |
| SPIKE-02 | Phase 1 | Pending |
| SPIKE-03 | Phase 1 | Pending |
| SPIKE-04 | Phase 1 | Pending |
| RNDR-01 | Phase 2 | Pending |
| RNDR-02 | Phase 2 | Pending |
| RNDR-03 | Phase 2 | Pending |
| RNDR-04 | Phase 2 | Pending |
| RNDR-05 | Phase 2 | Pending |
| SHDR-01 | Phase 3 | Pending |
| SHDR-02 | Phase 3 | Pending |
| SHDR-03 | Phase 3 | Pending |
| SHDR-04 | Phase 3 | Pending |
| SHDR-05 | Phase 3 | Pending |
| SHDR-06 | Phase 3 | Pending |
| SHDR-07 | Phase 3 | Pending |
| WATR-01 | Phase 4 | Pending |
| WATR-02 | Phase 4 | Pending |
| WATR-03 | Phase 4 | Pending |
| WATR-04 | Phase 4 | Pending |
| WATR-05 | Phase 4 | Pending |
| SKY-01 | Phase 5 | Pending |
| SKY-02 | Phase 5 | Pending |
| SKY-03 | Phase 5 | Pending |
| SKY-04 | Phase 5 | Pending |
| SKY-05 | Phase 5 | Pending |
| REAC-01 | Phase 6 | Pending |
| REAC-02 | Phase 6 | Pending |
| REAC-03 | Phase 6 | Pending |
| REAC-04 | Phase 6 | Pending |
| REAC-05 | Phase 6 | Pending |
| DPLY-01 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 35 total (STCK×3, SPIKE×4, RNDR×5, SHDR×7, WATR×5, SKY×5, REAC×5, DPLY×1)
- Mapped to phases: 35
- Unmapped: 0 ✓

> **Count correction (2026-07-28):** the initial definition summary read "36 total"; the actual
> distinct requirement-ID count is **35**. No requirement was dropped — the "36" was an off-by-one
> in the summary line. Every listed ID is mapped exactly once.

---
*Requirements defined: 2026-07-28*
*Last updated: 2026-07-28 — roadmapper confirmed traceability; corrected v1 count 36→35*
</content>
