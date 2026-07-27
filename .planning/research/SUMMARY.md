# Project Research Summary

**Project:** super-elements — v0.4.0-alpha WebGPU Sky & Water
**Domain:** WebGL→WebGPU/TSL renderer migration + commercial FFT water (Water Pro v3.2.1) & procedural sky (Sky Pro v2.0.0) drop-in, inside an existing perf-obsessed pixel-art top-down multiplayer game
**Researched:** 2026-07-28
**Confidence:** HIGH (every version, export name, load path, and shader-port count was verified directly against the vendored ./pro bundles, installed node_modules, and the real src/game source; the only MEDIUM/LOW items are on-device WebGPU perf and pixel-filter reproduction, which are exactly what the P0 spike must resolve)

## Executive Summary

This milestone is **not** a "swap the water shader" task — it is a **whole-engine renderer migration**. Water Pro and Sky Pro both import THREE from "three/webgpu" and are TSL node systems, so adopting them forces the entire game off WebGLRenderer and onto WebGPURenderer + THREE.PostProcessing. The vendored water/sky APIs are the easy 10%; the load-bearing 90% is (a) reproducing the game's identity — the ~320x240 nearest-upscale pixel filter with a depth-discontinuity outline — as a TSL node graph, and (b) porting **17 custom GLSL surfaces** (ShaderMaterial/onBeforeCompile, confirmed by grep) to node materials, since WebGPU will not compile raw GLSL. The good news from STACK research: **there is nothing to install.** three@0.185.1 (already present) ships three/webgpu + three/tsl; the two Pro libraries are vendored by copying their prebuilt build/ into src/vendor/, plus one ~10-line inline Vite plugin to copy Sky Pro's data/ cloud-noise into dist/.

The recommended approach is **spike-first, then a strict dependency chain**, and all four research streams converge on the identical phase order: **P0 feasibility spike -> P1 renderer + pixel-filter port -> P2 shader ports (one subsystem per commit) -> P3 Water Pro -> P4 Sky Pro -> P5 reactive + emissive water.** The pixel filter vs. the vendors' depth-reading post chain is the true make-or-break: both Water (buildNode) and Sky (applyTo) are nodes that read the scene-pass depth to composite fog/god-rays/clouds, and the pixel/outline pass is a new consumer of that same depth at a new resolution the vendors never designed for. P0 must screenshot-diff **two resolution shapes** (pixelate the whole low-res chain vs. pixelate full-res at the end) against master before any game code changes, and carries a sanctioned escape hatch: if the pixel look can't be reproduced, STOP and keep the WebGL renderer.

Two risks were **de-escalated** and one was **re-scoped** by research. De-escalated: the LAN-http "no WebGPU" fear is half-wrong — WebGPURenderer auto-falls back to WebGL2 and both Pro libs run on it, so LAN players do **not** white-screen; they lose WebGPU *performance* and WebGPU-only spray particles, making the force-https-vs-WebGL2-tier deploy choice a go/no-go gate rather than a scene-breaker. Re-scoped: the two NEW asks have **no native API** — "emissive water" is not a Water Pro property (its glow is Beer-Lambert + SSS + sparkle + bloom, so "lit" = sparkle/SSS/lifted waterColor/bloom, with additive overlays for local glow), and "projectile hits the sea" is the wrong mental model for wake (wake injects only on *horizontal* motion, capped at 16 generators/frame — vertical impacts need spray or decals, and per-projectile churn must be a fixed reused pool). Both must be de-risked in P0 before P5 is planned. API correction carried through all files: the day/night driver is sky.timeOfDay.time.value with autoAdvanceSecondsPerDay = 0 (server clock stays authoritative), **not** SunDriver.

## Key Findings

### Recommended Stack

Zero new runtime dependencies. The existing three/TypeScript/Vite/pnpm stack is validated and unchanged; the WebGPU + TSL capability already ships inside the installed three@0.185.1. The two commercial libraries are **vendored** (licensed, not on npm) by copying each prebuilt build/ into src/vendor/ — chosen over aliasing their src/ because a frozen bundle drops cleanly into the pnpm/Vite/TS graph with no transitive dev-deps and no npm-vs-pnpm collision. See [STACK.md](STACK.md).

**Core technologies:**
- three@0.185.1 (installed) — WebGPU renderer + TSL node system via the three/webgpu and three/tsl subpath exports; nothing to add. Sky Pro's peer floor is *exactly* 0.185.0, so three must never be downgraded.
- threejs-water-pro@3.2.1 (vendored from ./pro) — FFT ocean, wake, spray, foam, SSS, sparkle; no external runtime assets (foam is bundled).
- threejs-sky-pro@2.0.0 (vendored from ./pro) — procedural atmosphere, sun/moon, volumetric clouds, day/night clock; **requires data/*.bin cloud-noise copied next to the bundle** (dev works free; vite build needs the inline closeBundle copy plugin).
- Inline Vite plugin (no new dep) — copies Sky Pro data/ -> dist/assets/data/ so the runtime fetch(new URL of ./data/name.bin, import.meta.url) survives hashing.
- @webgpu/types (optional dev-only) — only if you author navigator.gpu feature-detect in TS; can be skipped by reading renderer.backend after init().

**Decision flagged for requirements:** src/vendor/ should be **committed into the private repo** (simplest for the .31 git-pull->build deploy) despite holding licensed bundles.

### Expected Features

Framed through THIS game's lens: a tilted top-down camera through a low-res pixel filter. The camera **never goes underwater** and the filter **destroys sub-pixel detail**, so what matters is depth-based water color, shoreline foam, large swell, sky-driven tint, broad sun/moon glint, and wake — a like-for-like upgrade of what createSeaWater.ts hand-rolled. See [FEATURES.md](FEATURES.md).

**Must have (table stakes — the sea + sky must read correctly):**
- Depth water color + shoreline foam + wave swell (replaces the custom quad 1:1) — all LOW, always-on.
- Sky Pro atmosphere/sun + **external day/night** driven by the LAN server clock (timeOfDay.time.value, autoAdvance=0) — replaces createDayNightCycle.ts.
- water.setSky(provider) coupling + sun/moon sparkle glint — one call; provider auto-syncs sun/reflection/fog each frame.
- All underwater subsystems OFF (haze, sun shafts, particles, ocean floor, waterline) — pure perf; camera never submerges.
- Quality tier **medium** as the floor, FPS profiled every step.

**Should have (competitive differentiators, add after the base sea holds framerate):**
- Player wake trail (the single biggest "real water" tell; requires >=medium).
- Volumetric clouds + cloud reflections in water (envMap:true).
- Moon + stars at night (stars need a supplied equirectangular starmap asset, else night is black).
- **Ask A** projectile reaction — pooled wake generators (skimmers) + spray on impact (vertical, WebGPU-only).
- **Ask B** lit/emissive water — sparkle + SSS + lifted/tinted waterColor + bloom (B1, LOW, first-class API); additive surface overlays for localized glow (B2).

**Defer (past this milestone):**
- Buoyancy for floating props; SSR / screen refraction (High+ only, lost to the filter); cloud ground shadows (heavy per-material TSL); rain/weather (explicitly deferred in PROJECT.md).

### Architecture Approach

Single WebGPURenderer (no mixed WebGL/WebGPU, no dual pipeline). The frame becomes a declarative TSL node DAG ending at postProcessing.outputNode, with a strict, non-negotiable order. "Retire, don't reinvent": createSeaWater, the sky dome, and the day/night sky/fog/water-uniform path are deleted and replaced by thin wrappers — but the **server clock stays the single time source**, now writing sky.timeOfDay.time. See [ARCHITECTURE.md](ARCHITECTURE.md).

**Major components:**
1. createPixelRenderer.ts (REWRITTEN — the single hardest file) — owns WebGPURenderer (async init), THREE.PostProcessing, the ported TSL outline node, low-res target + nearest upscale, and the crisp native-res overlay pass.
2. engine/tsl/ (NEW) — home for ported node materials + shared TSL chunk helpers (outline, pixelate, wind, pixel-surface, shore) that many of the 17 materials import.
3. createWaterSystem.ts / createSkySystem.ts (NEW wrappers) — mirror today's createSeaWater/createDayNightCycle seam for minimal blast radius.
4. createGroundInfluence / createScorchMap — WebGL RT ping-pong feeders re-expressed as WebGPU render-to-texture/compute (infra port, unblocks terrain/grass).
5. createReactiveWater.ts (NEW, P5) — fixed-pool projectile wake generators + emissive/impact contribution.

**Contract order (breaks if reordered):** post chain = pass() -> water.postProcessing.buildNode -> sky.applyTo -> outline -> pixelate -> bloom/tonemap-last; frame = sky.update(dt) -> await water.update(dt) -> postProcessing.render(). Build the SkyProvider **once** and reuse it.

### Critical Pitfalls

Top pitfalls across the migration (full list of 10 in [PITFALLS.md](PITFALLS.md)):

1. **Pixel filter vs. the vendors' depth-reading post chain (make-or-break)** — Water/Sky nodes read scene-pass depth; the pixel/outline pass is a new depth consumer at a new resolution. Prototype BOTH resolution shapes in P0 and screenshot-diff vs master; sample node-graph depth via scenePass.getTextureNode, not a hand-attached DepthTexture.
2. **LAN-http silent WebGL2 fallback** — no white screen, but FFT/wake run as slow render-to-texture and water.spray is null. Measure the WebGL2 path in P0; make force-https-vs-WebGL2-tier an explicit deploy gate; optional-chain every water.spray call.
3. **Async init / await water.update() races** — one un-awaited promise or early render() = white screen / undefined-pipeline crash. Make bootstrap explicitly async, gate the first frame on a ready/compileAsync flag, keep the loop async.
4. **17 GLSL shaders must become TSL; a half-ported scene fails silently** — meshes render flat/magenta/invisible, not erroring. Port **one subsystem per commit** with a screenshot gate; port shared chunks first.
5. **setQualityLevel() invalidates render-pass textures** — must rebuild postProcessing.outputNode + recompile after every tier change; wrap it so it's never called bare; debounce any adaptive quality.
6. **Wake/spray cap + wrong API** — max 16 generators/frame, wake injects on *horizontal* motion only. Pool and reuse (updateGenerator), never add/remove per projectile; vertical impacts = spray/decals, not wake.
7. **"Emissive water" has no API** — re-scope in requirements as SSS+sparkle+lifted-waterColor+bloom (or additive decals), not a water.emissive property.
8. **Sky data/ + starmap not shipped by default** — verify data/ resolves in the built dist/ (not just dev); ship a PD starmap or night renders black.

## Implications for Roadmap

Research forces a single **spike-first dependency chain** (numbering reset to P0..P5). Every file independently produced this same order; each phase is independently screenshot-gated.

### Phase 0: Feasibility Spike (waterpro-spike.html, zero game changes)
**Rationale:** The pixel look is the game's identity; if it can't be reproduced on WebGPU the whole migration is worthless — and that must be known before any irreversible game-code change (sanctioned escape hatch).
**Delivers:** An isolated spike — WebGPURenderer + WaterSystem.create + Sky Pro over a sand plane sampling the REAL getTerrainHeight, tilted top-down; both pixel-filter resolution shapes prototyped and screenshot-diffed vs master.
**Addresses:** Four go/no-go gates — (1) pixel filter + outline survives on WebGPU; (2) the target machine runs WebGPU compute AND the WebGL2 fallback path FPS is measured; (3) the two NEW asks (emissive = sparkle/SSS/bloom feasibility; projectile-hits-sea = wake horizontal-only + spray reality) are proven; (4) realistic 17-shader port-surface estimate + SEA_LEVEL/camera waterline check + Sky data/ load in built dist/.
**Avoids:** Pitfalls 1, 2, 6, 7, 8, 10 (all "scope/de-risk in P0"). **USER SIGN-OFF gate.**

### Phase 1: Renderer Migration + Pixel-Filter TSL Port
**Rationale:** Everything downstream requires WebGPURenderer + the node post-processing graph; the pixel filter is the only thing that must be pixel-correct at this gate.
**Delivers:** WebGL->WebGPU (async init/compileAsync); ported #1 pixel-filter + depth-outline as a TSL post node; all custom materials temporarily downgraded to flat built-ins so the scene still renders.
**Uses:** three/webgpu, three/tsl, THREE.PostProcessing, the vendored bundles wired as no-ops.
**Avoids:** Pitfall 3 (async bootstrap + compile gate), locks Pitfall 1. Gate: build + pixel-correct screenshot-diff.

### Phase 2: Shader Ports (one subsystem per commit)
**Rationale:** WebGPU won't compile the 17 GLSL surfaces; a big-bang port is unbisectable. Ordered by dependency/blast radius; shared chunks (pixelSurface/shore/wind/sun) ported first within each subsystem.
**Delivers:** 2a RT map feeders (groundInfluence, scorch -> WebGPU) -> 2b terrain -> 2c grass -> 2d town -> 2e props -> 2f wind props -> 2g wildlife.
**Implements:** engine/tsl/ node materials + chunk helpers.
**Avoids:** Pitfall 4 (screenshot after each; no default-material meshes); preserves matrix/shadow throttles per project perf memory.

### Phase 3: Water Pro
**Rationale:** Requires the proven renderer + node graph + ported terrain to blend shorelines correctly.
**Delivers:** Retire createSeaWater -> WaterSystem at SEA_LEVEL; player wake; cove masking only where enclosed; preset/wave tuning THROUGH the pixel filter; FPS-profiled quality tier (start medium).
**Uses:** water.postProcessing.buildNode, water.wake, water.masking.
**Avoids:** Pitfalls 5 (rebuild post on tier change), 10 (waterline vs sampled terrain; delete old sea in the same commit — no dead code).

### Phase 4: Sky Pro
**Rationale:** Water's setSky provider needs Sky Pro to exist; day/night must stay server-anchored.
**Delivers:** Retire sky dome + day/night sky/fog/water-uniform path -> SkySystem driven by serverClock -> timeOfDay.time (autoAdvance=0); water.setSky(createSkyProvider) built once; rewire sun light + edge-sun-dir + fountain (#10) to the sky provider; ship PD starmap.
**Uses:** sky.applyTo, sky.timeOfDay, sky.createSkyProvider, nightSky.texture.
**Avoids:** Pitfalls 8 (starmap/data/ in dist/), 9 (wiring/update order, provider-once), Anti-Pattern 4 (no self-advancing clock).

### Phase 5: Reactive + Emissive Water
**Rationale:** Requires Water Pro wake + the proven sea; both NEW asks need P0's de-risking baked in.
**Delivers:** Fixed-pool wake generators wired to projectile spawn/despawn (skimmers) + spray on vertical impact (WebGPU) with a decal/sprite fallback for WebGL2; lit water via sparkle + SSS + lifted waterColor + bloom (B1) and additive overlays for localized glow (B2). Re-profile.
**Avoids:** Pitfalls 6 (pool max-16, reuse; right API per event), 7 (emissive = assembled cues, not a property).

### Phase Ordering Rationale
- **Dependency-forced:** renderer -> pixel-filter -> RT maps -> terrain/grass -> town/props/wildlife -> water -> sky -> reactive. Water needs the node graph; Sky feeds Water's provider; reactive needs Water's wake.
- **Spike-first de-risks the identity question** (pixel filter) and both no-API asks before any irreversible change; P0 also produces the perf/port-surface numbers everything else is sized against.
- **Screenshot-gated per phase + one-subsystem-per-commit** keeps the large port bisectable and honors the no-dead-code rule (old sea/sky deleted in the same commit that replaces them).

### Research Flags

Phases likely needing deeper research during planning (gsd-plan-phase --research-phase N):
- **Phase 0:** The make-or-break spike — pixel-filter TSL reproduction, WebGPU-compute + WebGL2 availability on target hardware, and both no-API asks are all MEDIUM/unmeasured until this runs. Highest-uncertainty phase.
- **Phase 1:** TSL outline-node depth linearization + WebGPU shadow-throttle equivalent (BasicShadowMap, autoUpdate=false, every-other-frame) need verification against the actual WebGPU shadow API.
- **Phase 5:** Emissive-water technique choice (B1 vs additive vs custom-TSL) and the wake/spray pool design depend on P0 findings; spray fallback for WebGL2 needs a concrete decal plan.

Phases with well-documented patterns (lighter research):
- **Phase 2:** Mechanical GLSL->TSL translation, one subsystem at a time — tedious but pattern-established once the shared chunks are ported.
- **Phases 3 & 4:** Vendor integration is doc-backed end-to-end (post chain, update order, setSky, day/night); the work is wiring + tuning, not discovery.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Every version/export/load-path verified against vendored ./pro bundles + installed node_modules; corrected the SunDriver->sky.timeOfDay and WebGL2-fallback details |
| Features | HIGH | Every capability cites a real Water/Sky Pro doc or exported API; only the two NEW asks are MEDIUM (assembled from documented primitives, no purpose-built API) |
| Architecture | HIGH | Existing 17-shader inventory from grep + real src/game files; MEDIUM only on pixel-filter reproduction (the explicit P0 question) |
| Pitfalls | HIGH | Integration/API pitfalls verified against vendor docs; perf-budget FPS numbers MEDIUM/LOW (no on-device WebGPU profile yet) |

**Overall confidence:** HIGH on approach and API surface; MEDIUM on feasibility of the identity-preserving pixel filter and on-device perf — both intentionally deferred to the P0 spike gate.

### Gaps to Address
- **Pixel-filter reproduction on WebGPU** — the make-or-break unknown; resolve in P0 by prototyping both resolution shapes and screenshot-diffing vs master. If neither works, halt (keep WebGL).
- **On-device WebGPU + WebGL2 FPS** — unmeasured; P0 must produce headed-Chrome profiles for both backends (headless Playwright + SwiftShader can't run WebGPU compute).
- **Deploy decision for LAN-http players** — force-https (must first confirm the cloudflared .31->.32 :3000 routing survives) vs. WebGL2-tier fallback vs. feature-flagged WebGL sea. Explicit user gate before ship.
- **"Emissive" definition** — must be pinned in requirements (SSS+sparkle+bloom vs additive decals vs custom TSL) before P5.
- **Starmap asset** — a PD equirectangular starmap must be sourced/licensed and vendored under the game origin, or night ships black.
- **src/vendor/ git policy** — commit into the private repo (recommended) vs. deploy-time copy; decide before P1.

## Sources

### Primary (HIGH confidence)
- Vendored packages read directly — ./pro/Three.js Water Pro v3.2.1/ and ./pro/Three.js Sky Pro v2.0.0/: build/index.d.ts, WaterSystem.d.ts, SkySystem.d.ts, both package.json, disassembled build/index.js, and docs/guide/ + docs/api/.
- Installed toolchain — node_modules/three@0.185.1 + @types/three@0.185.0 exports maps (./webgpu, ./tsl), tsconfig.app.json, vite.config.ts, package.json.
- Existing codebase — src/game/engine/createPixelRenderer.ts, createGame.ts, world/createSeaWater.ts, systems/createDayNightCycle.ts, world/createMondstadtWorld.ts, terrain/grass/town/prop shaders, RT feeders; grep of ShaderMaterial/onBeforeCompile in src/game = 17 files.
- Project context — .planning/v0.4.0-alpha-WEBGPU-WATERPRO-HANDOFF.md, .planning/PROJECT.md, CLAUDE.md, project memory (always-analyze-performance, threejs-cpu-overhead-traps, identity-hex-perf-cliff, remote-domain-topology, deploy-pipeline-31).

### Secondary (MEDIUM confidence)
- WebGPU secure-context (navigator.gpu) gating + WebGPURenderer->WebGL2 auto-fallback — vendor docs assert it; not re-verified on this hardware.
- The two NEW asks (projectile reaction, emissive) — assembled from documented primitives (wake/spray/decals; sparkle/SSS/bloom), no purpose-built API.

### Tertiary (LOW confidence — needs validation in P0)
- Per-tier FPS on target hardware — unmeasured; no on-device WebGPU profile exists yet.
- Pixel-filter reproduction acceptability through the low internal resolution — the explicit make-or-break spike question.

---
*Research completed: 2026-07-28*
*Ready for roadmap: yes*
