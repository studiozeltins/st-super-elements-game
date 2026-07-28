# Phase 1: Feasibility Spike - Research

**Researched:** 2026-07-28
**Domain:** WebGPU/TSL renderer migration feasibility — pixel-filter reproduction, Water Pro + Sky Pro integration, on-device perf capture
**Confidence:** HIGH on the vendored APIs and TSL primitives (verified against installed `three@0.185.1` + official vendored docs); MEDIUM on the make-or-break outcome (pixel-filter fidelity + FPS are exactly what the spike exists to measure — not knowable pre-spike).

## Summary

This phase builds a **throwaway, isolated** `waterpro-spike.html` at repo root that answers one make-or-break question before any irreversible game-code change: *does the game's sacred pixel-art look (low-res nearest upscale + one-sided depth-discontinuity outline) survive on `WebGPURenderer` + TSL, and does the target machine run WebGPU compute at acceptable FPS?* It renders vendored Water Pro v3.2.1 + Sky Pro v2.0.0 over a `getTerrainHeight`-sampled beach slice at the game's tilted 45°-FOV camera, reproduces the pixel filter as an **isolated, salvage-structured TSL module** (`src/game/engine/tsl/`, imported by the spike, NOT by the game), measures both WebGPU-compute and WebGL2-fallback FPS in headed Chrome, and de-risks the two no-native-API asks (lit/emissive water, pooled projectile wake/spray). It ends in a **recorded user go/no-go sign-off** with a sanctioned STOP escape hatch.

The good news from research: the two hardest unknowns have strong footing. Three.js ships a built-in `pixelationPass(scene, camera, pixelSize, normalEdgeStrength, depthEdgeStrength)` node that already does pixelation + depth/normal edge detection in TSL post — proving the pattern is viable — though the game's bespoke *sun-facing, lighter-shade* rim will be a custom TSL `Fn`, not a drop-in. Both Water Pro and Sky Pro have complete, verbatim integration recipes in their vendored docs, use only `three/webgpu` + `three/tsl` (zero new npm deps), and `WebGPURenderer` auto-falls-back to WebGL2 with a one-line `forceWebGL: true` override for measuring the fallback tier. Backend is directly readable via `renderer.backend.isWebGPUBackend` and `water.backend`.

**Primary recommendation:** Build the spike as a standalone vanilla-TS entry (`waterpro-spike.html` + `waterpro-spike.ts`) that follows the Sky-Pro-integration recipe verbatim, then wraps the whole thing in a pixel-filter TSL post node. Prototype BOTH resolution shapes (pixelate-whole-chain via a low-res `RenderTarget` scene pass vs. final-pixelate as the last post node) because they trade fidelity against fragment cost differently for the FFT water. Measure `medium` tier on both backends. Do not touch game code; write the reusable pixel-filter as `src/game/engine/tsl/` so Phase 2 inherits the hardest 90%.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 (Vendored-bundle git policy, STCK-03):** `src/vendor/` (paid Water Pro + Sky Pro prebuilt `build/` bundles) lives in a **separate PRIVATE git repo, added to the main repo as a submodule**. The main repo `studiozeltins/st-super-elements-game` **stays PUBLIC** and license-clean (no commercial code in its public history). `.31` deploy pulls with `--recurse-submodules` (needs private-repo auth on `.31`). Reversibility: costly — committing paid code to the public repo is a license violation that lives in public history forever.
- **D-02 (Pixel-filter go/no-go bar, SPIKE-02):** The verdict is a **perceptual sign-off**, NOT a strict numeric pixel-diff. User eyeballs spike vs `master` side-by-side **through the pixel filter**; "same pixel-art identity" = pass. Screenshot-diff is a visual aid, NOT the gate. TSL node math won't be bit-identical to the old GLSL, so a strict threshold would false-STOP on harmless float/rounding noise.
- **D-03 (Spike beach fidelity, SPIKE-01):** Build a **representative slice**, not a bare plane: sand + sea at real `getTerrainHeight` (`SEA_LEVEL = -0.8`) + a handful of rocks/props + a small grass patch, at the game's tilted top-down camera. The depth-outline pass draws on depth discontinuities; a flat plane has none, so the outline would render nothing and the go/no-go would be signed off on an incomplete test.
- **D-04 (Spike code fate):** **Salvage-structured.** Write the TSL pixel-filter + depth-outline as an **isolated module** (e.g. `src/game/engine/tsl/`) that the spike HTML imports but the **game does not** (respects "zero game code touched"). Phase 2 reuses this module directly. Reversibility: reversible — new, unwired module; if the spike STOPs, delete it with no game impact.

### Claude's Discretion

- Exact spike file layout, TSL node structure, and how the representative props are placed.
- Perf-capture mechanism (headed Chrome vs user screenshot) and which quality tiers to bracket when measuring — headless can't run WebGPU compute; start `medium` per the locked tier decision, measure the WebGL2 fallback too per SPIKE-03.
- Whether the isolated TSL module lives under `src/game/engine/tsl/` or a spike-local dir — constraint is only that the game must not import it during Phase 1.

### Deferred Ideas (OUT OF SCOPE)

- None — discussion stayed within phase scope. Secure-context deploy decision (DPLY-01) and the `medium`-tier FPS gate are scoped to later phases in REQUIREMENTS.md, not deferred here.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STCK-01 | Water Pro + Sky Pro vendored into `src/vendor/` (prebuilt `build/` copied, not aliased to `src/`), importable via `three/webgpu` + `three/tsl` (zero new runtime deps) | Vendored `installation.md` for both packages confirms the `build/` copy pattern; `package.json` already has `three@^0.185.1`. Both docs import only from `three/webgpu` + `three/tsl`. Build step per package: `npm install && npm run build:lib` (independent npm, not repo pnpm). Water Pro peer floor `>=0.181`, Sky Pro floor exactly `0.185.0` — three must NOT be downgraded. |
| STCK-02 | Sky Pro's `data/` (cloud noise) copied into `dist/` by an inline Vite plugin so the built game loads it at the hashed asset path (dev + dist both work) | Confirmed `pro/.../threejs-sky-pro/build/data/` exists; docs state "cloud-noise volumes load from `data/` at runtime, resolved relative to `index.js`". The spike only needs to VERIFY `data/` resolves in a `vite build` output, not fully wire the plugin (that's the Phase-5 hardening). Include a build+preview check. |
| STCK-03 | A git policy for `src/vendor/**` is decided and applied so `.31` git-pull→build deploy succeeds | Locked as D-01 (private submodule). Surface the commands only (see Git Submodule Mechanics); deep `.31` deploy wiring is Phase 2+. |
| SPIKE-01 | Isolated `waterpro-spike.html` renders `WebGPURenderer` + `WaterSystem` + Sky Pro over a `getTerrainHeight`-sampled beach at the game's tilted top-down camera | Full verbatim recipe in `sky-pro-integration.md` / `water-integration.md`. `WaterSystem.create(renderer, scene, camera, "medium")`, `SkySystem.create({renderer, camera, scene})`, `water.setSky(sky.createSkyProvider({envMap:true}))`. Beach slice samples `getTerrainHeight` from `src/game/world/terrain.ts` (importable pure fn, `SEA_LEVEL=-0.8`). |
| SPIKE-02 | Pixel-filter look reproduced in TSL, screenshot-diffed vs `master` WebGL, in BOTH candidate resolution shapes; recorded go/no-go gates Phase 2; unreproducible → STOP | Built-in `pixelationPass` node proves the pattern; custom sun-facing rim is a TSL `Fn` reading `scenePass.getTextureNode('depth')`/`getViewZNode()`. Two shapes = low-res-target scene pass (pixelate-whole-chain) vs final pixelate post node. Perceptual gate per D-02. |
| SPIKE-03 | WebGPU compute confirmed on target machine, WebGL2 auto-fallback measured (FPS at candidate tier) — headed Chrome/user capture | `renderer.backend.isWebGPUBackend === true` (verified in installed three) + `water.backend === "webgpu"`. Force fallback with `new WebGPURenderer({forceWebGL:true})`. Headed Chrome only — headless+SwiftShader can't run WebGPU compute. |
| SPIKE-04 | Both no-native-API asks de-risked with a proven technique: lit/emissive water (sparkle/SSS/waterColor/bloom + additive overlay) and projectile (pooled wake for skim, spray for impact) | `water.sparkle`, `water.sss`, `water.color.waterColor`, `bloom()` post node all documented; emissive = additive transparent overlay mesh (Water Pro has no emissiveNode). Wake via `water.wake.addGenerator/updateGenerator` (≤16/frame, horizontal only); spray via `water.spray` (null on WebGL2 — optional-chain). |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Spike page hosting | Frontend build (Vite) | — | `waterpro-spike.html` is a second Vite entry served at `elements.kingdom.lv/waterpro-spike.html`; never shipped in game `dist/` |
| WebGPU render + FFT water compute | Browser / Client GPU | WebGL2 fallback (same client) | All rendering is client-side; WebGPU compute runs the FFT/wake solver, WebGL2 runs the render-to-texture equivalent |
| Pixel-filter + outline | Browser / Client (TSL post node) | — | Post-processing node graph on `WebGPURenderer`; isolated salvage module |
| Terrain height sampling | Shared pure logic (`terrain.ts`) | — | `getTerrainHeight` is a deterministic pure fn, safe to import into the spike without touching game state |
| Vendored bundle delivery | Build/deploy (submodule + Vite plugin) | — | `src/vendor/` private submodule; Sky `data/` copied to `dist/` by Vite plugin |
| Perf measurement | Dev tooling / human | — | Headed Chrome FPS capture; recorded artifact for sign-off |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `three` (webgpu build) | 0.185.1 (installed) | `WebGPURenderer`, TSL nodes, `PostProcessing` | `[VERIFIED: node_modules/three]` Already a dep; ships `three/webgpu` + `three/tsl` + `three.webgpu.nodes.js`. Both Pro packages require it. |
| `threejs-water-pro` | 3.2.1 (vendored) | FFT ocean, foam, wake, spray, SSS, sparkle | `[CITED: pro/.../water-pro docs]` Purchased, vendored as prebuilt `build/`. Peer three `>=0.181`. |
| `threejs-sky-pro` | 2.0.0 (vendored) | Procedural sky/atmosphere/clouds/sun, day-night, SkyProvider | `[CITED: pro/.../sky-pro docs]` Purchased, vendored as prebuilt `build/` incl. `data/`. Peer three floor exactly `0.185.0`. |

### Supporting (built-in three addons, zero new deps)

| Import | Purpose | When to Use |
|--------|---------|-------------|
| `pass` from `three/tsl` | Scene render pass node; `.getTextureNode('output'\|'depth')`, `.getViewZNode()` | `[VERIFIED]` Base of the post chain and the pixel-filter depth read |
| `pixelationPass` from `three/addons/tsl/display/PixelationPassNode.js` | Built-in pixelation + normal/depth edge node | `[VERIFIED: node_modules/three/examples/jsm/tsl/display/PixelationPassNode.js]` Reference/starting point for the final-pixelate shape; NOT a drop-in for the sun-facing rim |
| `bloom` from `three/addons/tsl/display/BloomNode.js` | Bloom post node | `[CITED: water docs]` Used in every Water Pro example; part of the lit-water approach (SPIKE-04) |
| `mrt`, `output`, `texture`, `uv`, `vec2/3/4`, `Fn`, `uniform` from `three/tsl` | Author the custom pixel/outline node | `[VERIFIED]` TSL primitives for the salvage module |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom sun-facing outline `Fn` | Built-in `pixelationPass` depth/normal edges | Built-in draws dark edges on BOTH normal+depth discontinuities symmetrically; the game rim is *one-sided toward the sun* and a *lighter shade of the base color*. Built-in ≠ the game look. Use it as scaffolding, port the bespoke rim logic from `createPixelRenderer.ts`. |
| Vendored `build/` copy (STCK-01 locked) | Vite alias to each package `src/` | Alias pulls TS source (heavier, unstable across their internal refactors, exposes source in dev). Locked decision = copy `build/`. |
| Two Vite entries | Separate throwaway static server | Vite already serves `elements.kingdom.lv`; a second `.html` entry is one config line and reuses the host allowlist. |

**Installation (vendoring, per STCK-01 — run inside `./pro`, independent npm):**
```bash
# Build each purchased package's ESM bundle (uses their own npm, NOT repo pnpm)
cd "pro/Three.js Water Pro v3.2.1/threejs-water-pro" && npm install && npm run build:lib
cd "pro/Three.js Sky Pro v2.0.0/threejs-sky-pro"     && npm install && npm run build:lib
# Copy prebuilt bundles into the (submodule) vendor dir
#   src/vendor/threejs-water-pro/{index.js,index.js.map,index.d.ts}
#   src/vendor/threejs-sky-pro/{index.js,index.js.map,index.d.ts,data/}   <-- data/ MANDATORY
```

**Version verification (done this session):**
```
three            → 0.185.1  [VERIFIED: node_modules/three, ships three.webgpu.js + three.tsl.js + three.webgpu.nodes.js]
@types/three     → ^0.185.0 [VERIFIED: package.json]
threejs-water-pro→ 3.2.1    [VERIFIED: pro/ dir present, docs peer three >=0.181]
threejs-sky-pro  → 2.0.0    [VERIFIED: pro/ dir present incl. build/data/, docs peer three ^0.185/0.185.0]
```

## Package Legitimacy Audit

**Not applicable — this phase installs ZERO packages from any public registry.** `three@0.185.1` is already an installed, pinned dependency. Water Pro and Sky Pro are **purchased, license-owned bundles** delivered as local ZIPs in `./pro/` (present on disk, verified) and vendored by copying their prebuilt `build/` directories — they are never `npm install`ed and never resolve from npm/PyPI/crates. There is no slopsquat/hallucination surface. The only supply-chain consideration is license hygiene (D-01: keep the paid bundles out of the public repo via a private submodule), which is a git-policy matter, not a registry-legitimacy matter.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                         waterpro-spike.html  (Vite entry, repo root, NEVER in game dist/)
                                    │  loads
                                    ▼
                         waterpro-spike.ts  (async main())
                                    │
        ┌───────────────────────────┼─────────────────────────────────────────┐
        │ bootstrap                  │ scene build                              │ salvage module
        ▼                            ▼                                          ▼
  WebGPURenderer            Scene + PerspectiveCamera(45°, tilted top-down)   src/game/engine/tsl/
  await renderer.init()     ├─ beach slice mesh  ◄── getTerrainHeight(x,z)      createPixelFilterNode()
  (auto WebGL2 fallback;    │   (sand+sea shelf, SEA_LEVEL=-0.8, terrain.ts)    · low-res / pixelSize
   forceWebGL:true to       ├─ rocks / props (depth discontinuities → outline)  · one-sided sun rim
   force fallback)          ├─ small grass patch                                  reading depth node
        │                    └─ (later) projectile proxy + emissive overlay      (imported by spike,
        │                                                                          NOT by the game)
        ▼
  WaterSystem.create(renderer, scene, camera, "medium")   ── FFT compute (WebGPU) / RTT (WebGL2)
        │  water.setSky( sky.createSkyProvider({envMap:true}) )
        ▼
  SkySystem.create({renderer, camera, scene})   ── atmosphere + clouds + sun (drives water lighting)
        │
        ▼
  ── PER FRAME (async loop) ──────────────────────────────────────────────────
     sky.update(dt)                         # sky FIRST
     await water.update(dt)                 # water samples this frame's sky; awaited
     postProcessing.render()                # NOT renderer.render()
     └─ node graph:
          scenePass = pass(water.scene, water.camera)
          out = scenePass.getTextureNode('output')
          out = water.postProcessing.buildNode(scenePass, out)   # fog/underwater/sunshafts
          out = sky.applyTo(out, scenePass)                      # clouds/god-rays/fog (reads depth)
          out = out.add( bloom(out, ...) )                       # lit-water bloom
          out = pixelFilterNode(out, scenePass)                  # <<< pixel-art identity, LAST
          postProcessing.outputNode = out
  ─────────────────────────────────────────────────────────────────────────────
        │
        ▼
  Canvas  →  headed Chrome  →  FPS capture + screenshot-vs-master  →  recorded go/no-go
```

### Recommended Project Structure
```
/ (repo root)
├── waterpro-spike.html          # 2nd Vite entry (served, never in game dist/)
├── src/
│   ├── spike/                    # spike-only glue (throwaway)
│   │   ├── waterpro-spike.ts     #   async main(): bootstrap + loop
│   │   ├── beachSlice.ts         #   getTerrainHeight-sampled mesh + props
│   │   └── perfHud.ts            #   on-screen FPS + backend readout
│   ├── vendor/                   # PRIVATE submodule (D-01) — paid bundles
│   │   ├── threejs-water-pro/    #   build/ copy
│   │   └── threejs-sky-pro/      #   build/ copy incl. data/
│   └── game/engine/tsl/          # SALVAGE module (D-04) — reused by Phase 2
│       ├── pixelFilterNode.ts    #   low-res + nearest upscale (both shapes)
│       └── outlineNode.ts        #   sun-facing depth-discontinuity rim
└── vite.config.ts               # add rollupOptions.input for the 2nd entry
```

### Pattern 1: Async WebGPU bootstrap + node post-processing
**What:** `WebGPURenderer` needs `await renderer.init()` before use and `await renderer.compileAsync(scene, camera)` before the loop; the frame loop is async (`await water.update`).
**When to use:** Always for this stack.
**Example:**
```typescript
// Source: pro/.../water-pro/docs/guide/basic-example.md (verbatim pattern)
import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
const renderer = new THREE.WebGPURenderer();          // add { forceWebGL: true } to test fallback
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
await renderer.init();                                 // <-- resolves the actual backend
const water = await WaterSystem.create(renderer, scene, camera, 'medium');
await renderer.compileAsync(scene, camera);
async function animate() {
  requestAnimationFrame(animate);
  sky.update(dt);
  await water.update(dt);                              // MUST be awaited, BEFORE render
  postProcessing.render();                             // NOT renderer.render()
}
```

### Pattern 2: Pixel-filter as the FINAL post node reading the scene depth
**What:** The pixel identity is a TSL node applied last. Depth for the outline comes from `scenePass.getTextureNode('depth')` (or `getViewZNode()` for linear view-space Z — cleaner than the manual `lin()` in the old GLSL).
**When to use:** The "final-pixelate" candidate shape (SPIKE-02).
**Example:**
```typescript
// Source: verified against three/addons/tsl/display/PixelationPassNode.js + createPixelRenderer.ts
import { pass } from 'three/tsl';
const scenePass = pass(water.scene, water.camera);
const color = scenePass.getTextureNode('output');
const depth = scenePass.getTextureNode('depth');   // always available, no MRT config needed
// custom Fn: nearest-sample color at reduced res, then add one-sided sun-facing rim from depth jumps
outputNode = pixelFilterNode(color, depth, { pixelSize, sunScreenDir, edgeStrength, threshold });
```

### Pattern 3: Two candidate resolution shapes (the core SPIKE-02 experiment)
**What:** The old renderer renders the WORLD into a small (~320×240) `WebGLRenderTarget` first (fewer fragments = cheaper) then nearest-upscales. On WebGPU there are two ways to reproduce this, and they trade fidelity vs cost differently for the FFT water/sky post chain:
- **Shape A — pixelate-whole-chain (low-res scene pass):** render the whole scene (incl. water surface + sky) at low internal resolution, then nearest-upscale. Cheapest, closest to the current look, but Water Pro's post passes (fog, refraction, SSR, god-rays) run against a low-res framebuffer — may look coarse or fight the FFT detail.
- **Shape B — final-pixelate:** render + run all Water/Sky post at full res, then pixelate/downsample as the LAST node (like `pixelationPass`). Higher water/sky fidelity, but pays full-res fragment cost for the expensive passes before throwing resolution away — the exact FPS risk to measure.
**When to use:** Build both; the perceptual sign-off + FPS numbers decide which Phase 2 adopts.

### Anti-Patterns to Avoid
- **Importing `three` (not `three/webgpu`)** for anything touching the Pro packages — they require the webgpu build; the plain build lacks the nodes. `[CITED: both installation.md]`
- **Calling `renderer.render()` instead of `postProcessing.render()`** — skips the whole water/sky/pixel node graph.
- **Reading the backend before `await renderer.init()`** — `new WebGPURenderer().backend.isWebGPUBackend` is `true` even when WebGPU is unavailable; only correct after init. `[VERIFIED: three issue #30024 + source]`
- **Letting the game import `src/game/engine/tsl/`** during Phase 1 — violates "zero game code touched" (D-04). Keep it referenced only by the spike.
- **Committing `src/vendor/` paid bundles to the public repo** — license violation in public history (D-01). Submodule only.
- **Rebuilding the SkyProvider each frame** — `createSkyProvider()` disposes the previous baker; build once. `[CITED: sky-provider.md]`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pixelation + edge detect in TSL | A from-scratch node | `pixelationPass` as scaffolding, then port the bespoke rim | Built-in already solves nearest-downsample + depth/normal edge; only the sun-facing lighter rim is custom |
| Linear depth from raw depth | The manual `lin()` reconstruction from the GLSL | `scenePass.getViewZNode()` | TSL exposes view-space Z directly; less rounding drift, cleaner |
| FFT ocean / wake / spray | Any custom water sim | Water Pro `WaterSystem` / `water.wake` / `water.spray` | The entire point of the purchase; wake/spray run compute on WebGPU, RTT on WebGL2 automatically |
| Sky/atmosphere/day-night | Custom sky dome math | Sky Pro `SkySystem` + `TimeOfDay` | Purchased; `SkyProvider` couples it to the water in one call |
| Sky→water reflection/fog/sun coupling | Manual uniform syncing | `water.setSky(sky.createSkyProvider({envMap:true}))` | One call; sky's live sun drives water lighting every frame |
| WebGL2 fallback path | Manual renderer selection | `WebGPURenderer` auto-fallback (+ `forceWebGL:true` to test) | Built into the renderer; `renderer.backend.isWebGPUBackend` reports the result |

**Key insight:** For a *feasibility* spike the job is to WIRE the purchased systems exactly per their docs and MEASURE — not to reinvent or deeply customize. The only genuinely new code is the pixel-filter salvage node; everything else is recipe-following.

## Common Pitfalls

### Pitfall 1: Camera far plane clips the ocean / sky
**What goes wrong:** The game camera is `PerspectiveCamera(45, aspect, 0.1, 500)` — far = 500. Water Pro / Sky Pro examples use far 20000–50000 because the ocean plane and sky backdrops are huge. At far=500 the sea horizon and sky dome may clip.
**Why it happens:** The stylized game world is small; the Pro assets assume open-ocean scale.
**How to avoid:** For the spike, keep the game's 45° FOV and tilt (fidelity of the look) but extend `far` (e.g. 2000–50000) and confirm the beach slice still reads correctly through the pixel filter. Note the chosen far in the go/no-go artifact — Phase 2 must reconcile this with the game's fog far plane.
**Warning signs:** Sea cuts to background color at a fixed distance; sky dome edge visible.

### Pitfall 2: Headless capture reports WebGL2 (or fails) — never WebGPU compute
**What goes wrong:** The project's existing screenshot harness (headless Playwright + SwiftShader) cannot run WebGPU compute; it silently runs the WebGL2 fallback or errors.
**Why it happens:** SwiftShader has no WebGPU compute backend.
**How to avoid:** Capture WebGPU numbers in **headed Chrome** (SPIKE-03, locked in CONTEXT). Assert the backend on-screen (`renderer.backend.isWebGPUBackend`, `water.backend`) so the artifact proves which backend produced each FPS number. Measure the WebGL2 tier by launching a second run with `forceWebGL:true`.
**Warning signs:** `water.backend === 'webgl'` when you expected `'webgpu'`; `water.spray === null`.

### Pitfall 3: Sky `data/` doesn't resolve in `dist/`
**What goes wrong:** Sky Pro loads cloud-noise volumes from `data/` relative to `index.js` at runtime; a naive `vite build` may not emit `data/` to the hashed asset path, so the built spike/game fails only in production.
**Why it happens:** Vite fingerprints/relocates assets; runtime-relative `data/` loads aren't tracked by the bundler.
**How to avoid:** STCK-02 — an inline Vite plugin copies `data/` into `dist/`. In Phase 1, at minimum run `vite build` + `vite preview` for the spike and confirm the sky renders (not just `npm run dev`). Full plugin hardening is Phase 5, but flag any failure now.
**Warning signs:** Sky/clouds render in dev but the built page shows a broken/black sky or a 404 on a `data/` file.

### Pitfall 4: Wake never appears (vertical-only motion)
**What goes wrong:** A wake generator "only injects while its object moves horizontally"; a projectile arcing mostly vertically, or a stationary proxy, leaves no wake.
**Why it happens:** By design — wake is horizontal-motion driven; vertical impacts are `spray`, not wake.
**How to avoid:** For the SPIKE-04 skim de-risk, move the proxy horizontally low over the sea (`updateGenerator`, ≤16 pooled — REAC-01). Use `water.spray` for vertical impacts. Optional-chain `water.spray?` (null on WebGL2).
**Warning signs:** Flat water under a moving proxy; console null on `water.spray`.

### Pitfall 5: sRGB / tone-mapping mismatch vs the old blit
**What goes wrong:** The old GLSL blit manually encoded linear→sRGB (a raw `ShaderMaterial` blit doesn't get `outputColorSpace`); getting this wrong made the whole scene render dark historically.
**Why it happens:** Post-node output color management differs from the ad-hoc GLSL path. Water examples set `renderer.toneMapping = THREE.ACESFilmicToneMapping`.
**How to avoid:** Let the `PostProcessing` pipeline + renderer color management handle sRGB; do NOT re-encode inside the pixel node. Verify brightness matches `master` in the side-by-side (D-02). Decide whether ACES tone mapping (Water Pro default) is acceptable for the pixel-art look or must be neutralized to match the game.
**Warning signs:** Spike noticeably darker/brighter or more filmic than `master` through the filter.

## Runtime State Inventory

> Rename/refactor/migration inventory. This phase is **additive and isolated** (new spike files + new vendor submodule + new unwired TSL module); it changes NO existing runtime state. Verified below.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — the spike reads no DB and writes none; `getTerrainHeight` is a pure fn. Verified by scope (zero game code touched, no SpacetimeDB publish — client-only milestone). | None |
| Live service config | None — no n8n/Datadog/Cloudflare change this phase. The spike is served by the existing Vite host (`elements.kingdom.lv`); `allowedHosts` already includes it (verified in `vite.config.ts`). | None |
| OS-registered state | None — no Task Scheduler / pm2 / service changes. `.31` deploy `--recurse-submodules` change is scoped to Phase 2+ per D-01. | None (flag for Phase 2) |
| Secrets/env vars | New: `.31` will need **private-repo credentials** to pull the `src/vendor/` submodule (D-01). Not consumed by the spike itself; required only when the submodule deploy is wired (Phase 2+). | Provision `.31` git auth for the private submodule before the first deploy that includes vendored code |
| Build artifacts | New: `src/vendor/threejs-water-pro/`, `src/vendor/threejs-sky-pro/` (+`data/`) prebuilt bundles produced by `npm run build:lib` inside `./pro`. Vite `dist/` must emit Sky `data/` (STCK-02). | Verify `vite build` output includes `data/`; no stale artifacts (new files only) |

**Nothing found in Stored data / Live service config / OS-registered state:** verified — the phase adds isolated files and a submodule; it modifies no existing record, service, or OS registration.

## Code Examples

### Verbatim Water+Sky bootstrap (adapt camera to game's 45° tilt)
```typescript
// Source: pro/.../sky-pro/docs/guide/water-integration.md (CITED, verbatim recipe)
import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { WaterSystem, getPresetParams } from '../vendor/threejs-water-pro';
import { SkySystem, PRESETS } from '../vendor/threejs-sky-pro';

const renderer = new THREE.WebGPURenderer();           // { forceWebGL: true } => measure fallback
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
await renderer.init();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, 0.1, 20000); // game FOV, extended far
// ... position/tilt to match the game's top-down camera; add beach slice + rocks + grass ...

const water = await WaterSystem.create(renderer, scene, camera, 'medium');
water.loadPreset(getPresetParams('blackFlag'));
const sky = await SkySystem.create({ renderer, camera, scene, quality: 'medium' });
await sky.applyPreset(PRESETS.partlyCloudy);
water.setSky(sky.createSkyProvider({ envMap: true }));  // ONE-CALL coupling; build once

// post chain (add the pixel node LAST — see Pattern 2/3)
const postProcessing = new THREE.PostProcessing(renderer);
const scenePass = pass(water.scene, water.camera);
let out = scenePass.getTextureNode('output');
out = water.postProcessing.buildNode(scenePass, out);
out = sky.applyTo(out, scenePass);
out = out.add(bloom(out, 0.5, 0.4, 0.85));
out = pixelFilter(out, scenePass);                      // salvage module (SPIKE-02)
postProcessing.outputNode = out;
await renderer.compileAsync(scene, camera);
```

### Backend confirmation for the perf artifact (SPIKE-03)
```typescript
// Source: VERIFIED against node_modules/three (renderer.backend.isWebGPUBackend) + water-system.md
const usingWebGPU = renderer.backend.isWebGPUBackend === true; // valid only AFTER await renderer.init()
console.log('renderer backend:', usingWebGPU ? 'WebGPU' : 'WebGL2');
console.log('water backend   :', water.backend);              // 'webgpu' | 'webgl'
console.log('spray available :', water.spray !== null);       // null on WebGL2
// render both on-screen so screenshots prove which backend produced each FPS number
```

### Lit water + emissive overlay (SPIKE-04)
```typescript
// Source: api/sparkle.md, api/sss.md, api/color.md (CITED)
water.sparkle.intensity = 0.7;              // sun glints
water.sss.intensity = 1.5;                  // subsurface glow against the sun
water.color.waterColor = new THREE.Color('#124973'); // lifted intrinsic color
// bloom added in the post chain above. Emissive glow = ADDITIVE overlay mesh riding the surface:
const glow = new THREE.Mesh(
  new THREE.PlaneGeometry(6, 6),
  new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
);
glow.rotation.x = -Math.PI/2; glow.position.set(x, SEA_LEVEL + 0.02, z); // Water Pro has NO emissiveNode
```

### Pooled projectile wake + spray (SPIKE-04 / REAC-01/02)
```typescript
// Source: guide/wake.md, guide/spray.md (CITED). ≤16 pooled generators, horizontal-only.
const id = water.wake.addGenerator(projectileProxy, { depth: 0.6, radius: 2.0, teleportThreshold: 5.0 });
// each frame, reuse the pool — never add/remove per projectile:
water.wake.updateGenerator(id, { active: skimmingLowOverSea });
// vertical impact splash (WebGPU only; silently absent on WebGL2):
water.spray?.addEmitter(projectileProxy, { probes: [{ local: new THREE.Vector3(0, -0.3, 0) }] });
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `WebGLRenderer` + raw GLSL `ShaderMaterial` pixel blit | `WebGPURenderer` + TSL node post-processing | three r150+ node system, matured through r18x | Can't mix WebGL + WebGPU on one canvas; no raw GLSL on WebGPU — must port to nodes |
| Manual linear-depth reconstruction (`lin()` in GLSL) | `scenePass.getViewZNode()` / `getTextureNode('depth')` | TSL PassNode API | Cleaner, less rounding drift for the outline |
| Hand-rolled pixelation quad | `pixelationPass` built-in node | PR #28802 (in installed r185) | Reference scaffolding for the final-pixelate shape |
| `renderer.render()` | `postProcessing.render()` with an `outputNode` graph | Node post-processing | Whole look is a composed node graph |

**Deprecated/outdated:**
- Docs occasionally cite `three@^0.181/0.183`; this repo is pinned to `0.185.1` (Sky Pro's floor). Do NOT downgrade three.
- `new THREE.RenderPipeline(renderer, output)` appears in one Sky doc variant vs `THREE.PostProcessing` in others — both are valid node-pipeline wrappers in r185; prefer `PostProcessing` (used in the Water docs and more widely documented). `[ASSUMED — verify the exact class name against the installed build when wiring]`

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `getViewZNode()` is exposed on the `pass()` scene-pass node in installed r185 | Patterns / Don't Hand-Roll | Low — fallback is `getTextureNode('depth')` + manual linear reconstruction (the proven GLSL math). Verify at wire time. |
| A2 | `THREE.PostProcessing` (not `RenderPipeline`) is the class to use in r185 | State of the Art | Low — both documented; grep the installed build (`node_modules/three/build/three.webgpu.js`) for the exact export before finalizing. |
| A3 | Extending camera far to ~2000–50000 keeps the pixel-art look acceptable at the game's 45° tilt | Pitfall 1 | Medium — if the huge far plane changes depth precision enough to hurt the outline, the spike must tune near/far. This is part of what the spike measures. |
| A4 | `medium` tier holds acceptable FPS on the target machine on WebGPU | throughout | HIGH-impact UNKNOWN — this is precisely what SPIKE-03 exists to measure. Do not treat as fact; the number is the deliverable. |
| A5 | Sky `data/` survives `vite build` with only a minimal copy step in Phase 1 | Pitfall 3 / STCK-02 | Medium — full plugin is Phase 5; if the minimal build check fails, note it, don't block the spike's core go/no-go. |
| A6 | The perceptual pixel-art match is achievable at all on TSL | whole phase | HIGH-impact UNKNOWN — the make-or-break question (D-02). STOP escape hatch exists precisely because this can't be pre-confirmed. |

**Note:** A4 and A6 are unknowns *by design* — the spike is the instrument that resolves them. They are logged here so the planner treats the FPS numbers and the perceptual verdict as *deliverables to produce*, not facts to assume.

## Open Questions

1. **Which resolution shape (A vs B) wins?**
   - What we know: both are buildable; A is cheaper + closer to current look, B is higher water/sky fidelity.
   - What's unclear: which one the user perceives as "same identity" AND holds FPS.
   - Recommendation: build both behind a query-param toggle (`?shape=whole|final`) so the sign-off compares them directly.

2. **Does Water Pro's ACES tone mapping clash with the flat pixel-art palette?**
   - What we know: Water examples set `ACESFilmicToneMapping`; the game's look is flat/stylized.
   - What's unclear: whether ACES must be disabled/neutralized to match `master`.
   - Recommendation: expose a tone-mapping toggle in the spike; capture both in the artifact.

3. **How much of the 17-shader port surface does the spike reveal (SPIKE-04 estimate)?**
   - What we know: `grep -rlE "ShaderMaterial|onBeforeCompile" src/game` = 17 files (per handoff); spike ports NONE.
   - What's unclear: realistic per-subsystem effort — needed for the Phase-3 estimate the sign-off wants.
   - Recommendation: while building the beach slice, note which game shader chunks (terrain sand/swash, rock mottle, grass) would need node equivalents; produce a rough T-shirt-size estimate table as a spike artifact.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `three` (webgpu build) | entire spike | ✓ | 0.185.1 | — |
| Water Pro ZIP/dir | STCK-01, SPIKE-01/04 | ✓ | 3.2.1 (`pro/`) | — |
| Sky Pro ZIP/dir incl. `data/` | STCK-01/02, SPIKE-01 | ✓ | 2.0.0 (`pro/`, `build/data/` present) | — |
| Vite | serve/build spike | ✓ | ^7.1.5 | — |
| pnpm (repo) / npm (inside `./pro`) | repo deps / build Pro bundles | ✓ | pnpm repo, `./pro` uses own npm | — |
| Headed Chrome 113+ (WebGPU) | SPIKE-03 perf capture | ✓ (assumed on dev machine) | — | WebGL2 fallback measured via `forceWebGL:true` |
| WebGPU compute on target GPU | SPIKE-03 confirm | UNKNOWN — the spike confirms this | — | WebGL2 auto-fallback (this is the point of measuring both) |

**Missing dependencies with no fallback:** none identified — all vendored assets and toolchain present on disk (verified).
**Missing dependencies with fallback:** WebGPU compute availability is *the unknown the spike resolves*; WebGL2 is the sanctioned fallback and is measured, not blocked on.

## Validation Architecture

> `workflow.nyquist_validation: true` (verified in `.planning/config.json`) — section included. Note: this is a **throwaway spike**, not shipping game code, so validation is dominated by **human perceptual sign-off + on-device FPS capture**, not automated unit tests. Over-investing in automated tests for throwaway spike glue would be waste; the Nyquist "sample" here is the recorded go/no-go artifact.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 (installed) — used only if a pure helper is extracted |
| Config file | none dedicated (repo uses vitest defaults via `npm test`) |
| Quick run command | `pnpm test` (repo root) |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SPIKE-01 | Beach slice mesh samples `getTerrainHeight`, spans `SEA_LEVEL` | unit (pure) | `pnpm test` on a `beachSlice` height-sampling helper | ❌ Wave 0 (optional) |
| SPIKE-02 | Pixel-art identity matches `master` through the filter | **manual — perceptual sign-off (D-02)** | headed side-by-side, screenshot aid | N/A (human gate) |
| SPIKE-03 | WebGPU compute runs; WebGL2 fallback FPS measured | **manual — headed Chrome capture** | headed run + `forceWebGL:true` run; on-screen backend + FPS | N/A (human gate) |
| SPIKE-04 | Wake/spray + lit/emissive techniques proven | **manual — visual confirmation** | headed run, toggle effects | N/A (human gate) |
| STCK-01 | Vendored bundles import + render | smoke (does the spike boot?) | `vite build && vite preview` boots without import errors | ❌ Wave 0 |
| STCK-02 | Sky `data/` resolves in `dist/` | smoke (build) | `vite build && vite preview`, sky renders | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** spike boots in `npm run dev` (headed) without console errors.
- **Per wave merge:** `vite build && vite preview` boots; backend + FPS HUD renders.
- **Phase gate:** recorded go/no-go artifact set (spike-vs-master screenshots through the filter + WebGPU and WebGL2 FPS numbers) signed off by the user.

### Wave 0 Gaps
- [ ] (optional) `src/spike/beachSlice.test.ts` — asserts height sampling crosses `SEA_LEVEL` — only if a pure helper is worth extracting; skip if it adds ceremony to throwaway code.
- [ ] No framework install needed — Vitest already present.
- [ ] Primary "validation" is the **recorded human sign-off**, not automated tests — this is correct for a feasibility spike.

## Security Domain

> `security_enforcement: true`, ASVS level 1. This phase is a **client-only, local rendering spike** with no auth, no user input parsing, no network endpoints, no persistence, no secrets consumed at runtime. The attack surface is effectively nil. ASVS applicability below reflects that.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Spike has no auth; no login path touched |
| V3 Session Management | no | No sessions |
| V4 Access Control | no | No protected resources |
| V5 Input Validation | no (marginal) | Only input is a dev-controlled `?shape=`/`?tone=` query param toggling render modes — not attacker-reachable in the shipped game (spike never ships) |
| V6 Cryptography | no | No crypto |
| V14 Config / Supply Chain | **yes** | Vendored paid bundles must stay out of the PUBLIC repo (D-01 private submodule) — license + supply-chain hygiene; `.31` needs scoped private-repo credentials, not broad access |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Paid code leaked into public git history | Information Disclosure | Private submodule (D-01); never commit `src/vendor/**` to the public repo; keep `./pro/` gitignored (already is) |
| Over-broad `.31` deploy credential for private submodule | Elevation of Privilege | Scope the `.31` credential to read-only pull of the single private vendor repo (Phase 2+ concern; flag now) |
| Malicious/tampered vendor bundle | Tampering | Bundles come from the purchased ZIPs on disk (verified), built locally via `npm run build:lib`; no third-party registry fetch |

## Sources

### Primary (HIGH confidence)
- `node_modules/three@0.185.1` — VERIFIED: `three.webgpu.js` exports `isWebGPUBackend`/`isWebGLBackend`; `examples/jsm/tsl/display/PixelationPassNode.js` exports `pixelationPass(scene, camera, pixelSize, normalEdgeStrength, depthEdgeStrength)`.
- `pro/Three.js Water Pro v3.2.1/threejs-water-pro/docs/{guide,api}/*` — CITED: installation, basic-example, quality-levels, post-processing, wake, spray, water-masking, sky-pro-integration, presets; api/{water-system, color, foam, sparkle, sss, sun}.
- `pro/Three.js Sky Pro v2.0.0/threejs-sky-pro/docs/{guide,api}/*` — CITED: installation, day-night-cycle, water-integration, scene-integration; api/{time-of-day, sky-provider}. `build/data/` present on disk.
- `src/game/engine/createPixelRenderer.ts`, `src/game/world/terrain.ts`, `src/game/world/createSeaWater.ts` — the exact pipelines to reproduce/replace; read in full.
- `.planning/config.json`, `package.json`, `vite.config.ts` — VERIFIED project constraints.

### Secondary (MEDIUM confidence)
- three.js docs (TSL page, WebGPURenderer manual) + GitHub PR #28802 (PixelationPassNode) / issue #30024 (backend detection after init) — web-searched, corroborated against installed source.

### Tertiary (LOW confidence)
- `RenderPipeline` vs `PostProcessing` class-name variance across Sky/Water docs — resolve by grepping the installed build at wire time (A2).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified on disk; both Pro APIs from official vendored docs; zero new registry installs.
- Architecture / integration recipes: HIGH — verbatim from vendored docs, cross-checked against installed three primitives.
- Pixel-filter TSL reproduction *approach*: MEDIUM-HIGH — pattern proven (built-in pixelation + depth node exist); exact perceptual fidelity is the unknown the spike measures (A6).
- Perf outcome: UNKNOWN by design — SPIKE-03 produces the numbers (A4).
- Pitfalls: HIGH — grounded in the existing code's own comments (sRGB, camera far, shadow throttle) and the vendored docs' explicit warnings.

**Research date:** 2026-07-28
**Valid until:** ~2026-08-27 (30 days; three.js node API evolves but the installed version is pinned, so the spike is stable against upstream churn)
