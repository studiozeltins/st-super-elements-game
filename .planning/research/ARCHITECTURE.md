# Architecture Research

**Domain:** WebGPU render-pipeline migration inside an existing Three.js pixel-filter game (Water Pro + Sky Pro drop-in)
**Researched:** 2026-07-28
**Confidence:** HIGH (existing code + vendor docs read directly; MEDIUM only on pixel-filter reproduction, which is exactly what the Phase 0 spike must answer)

> This is a whole-engine renderer migration. The Water/Sky APIs are the easy 10%; the 90% is
> `WebGLRenderer`→`WebGPURenderer` + reproducing the pixel filter/outline in TSL + porting 17
> custom GLSL surfaces to node materials. Every claim below is grounded in the real files
> (`src/game/...`) and the real vendor docs (`./pro/.../docs/guide/*`).

---

## Standard Architecture

### System Overview — current (WebGL) vs target (WebGPU)

```
CURRENT (WebGLRenderer, createPixelRenderer.ts)                    frame() in createGame.ts
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  Pass 1: scene(layer 0) ──renderer.render──▶ worldTarget (LOW-RES ~320w, NearestFilter)│
│                                               + DepthTexture (silhouettes)             │
│  Pass 2: blitScene(ShaderMaterial) ──────▶ canvas   [sRGB encode + depth-jump OUTLINE] │
│  Pass 3: scene(OVERLAY_LAYER sprites) ───▶ canvas   [native res, crisp HUD]            │
│                                                                                        │
│  Feeders (per frame, WebGL RT compute): groundInfluence.update(renderer) /             │
│           scorchMap.update(renderer)  ── ping-pong WebGLRenderTarget fade+stamp passes  │
└──────────────────────────────────────────────────────────────────────────────────────┘

TARGET (WebGPURenderer + THREE.PostProcessing + three/tsl node graph)
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  await renderer.init()  /  await renderer.compileAsync(scene, camera)                   │
│                                                                                        │
│  scenePass = pass(scene, camera)          ── TSL scene pass (color + depth texture)     │
│  out = scenePass.getTextureNode('output')                                              │
│  out = water.postProcessing.buildNode(scenePass, out)   ── atmos fog/underwater/shafts  │
│  out = sky.applyTo(out, scenePass)                      ── clouds/god-rays/dist fog      │
│  out = outlineNode(out, scenePass depth)                ── PORTED pixel-outline (TSL)    │
│  out = pixelate(out)  (low-res render target + Nearest upscale)  ── THE pixel look       │
│  postProcessing.outputNode = out                                                       │
│                                                                                        │
│  frame(): sky.update(dt) → await water.update(dt) → postProcessing.render()             │
│           → nearest upscale blit → overlay sprite pass (native)                         │
│  Feeders: groundInfluence/scorchMap RT passes re-expressed as WebGPU node/compute passes│
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities (what changes)

| Component | Today | After migration |
|-----------|-------|-----------------|
| `createPixelRenderer.ts` | Owns `WebGLRenderer`, 3-pass loop, blit+outline `ShaderMaterial`, low-res RT | Owns `WebGPURenderer` (async init), `THREE.PostProcessing`, TSL outline node, low-res target + nearest upscale, overlay pass. **The single hardest file.** |
| `createGame.frame()` | `pixelRenderer.render(scene)` at tail | Insert `sky.update` + `await water.update` before render; render becomes async-aware |
| `createSeaWater.ts` | Custom sea `ShaderMaterial` plane at `SEA_LEVEL` | **RETIRED** → `WaterSystem` (Phase 3) |
| `createDayNightCycle.ts` + sky dome | Server-clock → palette → fog/sky/sun/water uniforms | Sky/fog/sun path **RETIRED** → Sky Pro; clock source **KEPT**, now feeds `sky.timeOfDay.time` |
| `groundInfluence` / `scorchMap` | WebGL RT ping-pong fade/stamp | Re-expressed as WebGPU render-to-texture / compute (infra port, Phase 2a) |
| 15 world/prop/wildlife GLSL surfaces | `ShaderMaterial` / `onBeforeCompile` | Ported to TSL node materials, one subsystem at a time (Phase 2) |

---

## The 17 shaders — full inventory + port order

`grep -rlE "ShaderMaterial|onBeforeCompile" src/game` → exactly 17 files. Grouped by subsystem,
tagged coupled/independent, with the phase that ports them. **This list drives phase sizing.**

| # | File | What it shades | Coupling | Port |
|---|------|----------------|----------|------|
| 1 | `engine/createPixelRenderer.ts` | Blit quad: linear→sRGB + **depth-discontinuity outline** (sun-facing rim). THE pixel filter. | Reads worldTarget color + DepthTexture; `uSunScreen` fed each frame | **Phase 1** (make-or-break) |
| 2 | `systems/createGroundInfluence.ts` | RT ping-pong fade+stamp `ShaderMaterial` passes (bend/wear map) | `renderer.setRenderTarget`+`render`; consumed by terrain+grass | **Phase 2a** (infra) |
| 3 | `systems/createScorchMap.ts` | RT ping-pong fade+stamp (scorch R channel) | same RT pattern; consumed by terrain | **Phase 2a** (infra) |
| 4 | `world/terrainShader.ts` | `onBeforeCompile` on terrain Lambert: pixel grass clods, road+cart-ruts, scorch craters+vertex dents, beach sand + **swash surf** + footprints | Samples #2 #3 maps + `wind.timeUniform`; shares `shoreShaderChunks` (HASH2, PIXEL_BUBBLES) | **Phase 2b** |
| 5 | `world/createGrassField.ts` | Instanced grass Lambert: wind sway + ground-influence bend (vertex) | `windMath` GLSL + #2 map + `sunUniform` | **Phase 2c** |
| 6 | `world/town/buildingMaterials.ts` | Wall/roof pixel-pattern Lambert (object-space) | `pixelSurfaceShaders` (PIXEL_SURFACE_COMMON, sunEdgeApply) + `sunUniform` | **Phase 2d** (town) |
| 7 | `world/town/createTownGround.ts` | Voronoi cobble town ground (mortar, grunge, moss, edge scatter) | `sunUniform` | **Phase 2d** (town) |
| 8 | `world/town/createCobbleMaterial.ts` | Triplanar Voronoi cobble (windmill tower) | `pixelSurfaceShaders` + `sunUniform` | **Phase 2d** (town) |
| 9 | `world/createPlazaStructures.ts` | Aggregator: windmill + fountain; surfaces the fountain `ShaderMaterial` (`waterMaterial`) | Wraps #10 + #8 | **Phase 2d** (town) — no own shader beyond #10 |
| 10 | `world/createFountainWater.ts` | Still pond `ShaderMaterial`: fresnel sky reflection, day/night uniforms | `uSkyTop/uHorizon` driven by day/night (→ sky provider after Phase 4) | **Phase 2e** (or defer to Phase 4 rewire) |
| 11 | `world/assets/createRockMesh.ts` | Rock material: pixel stone mottle + noise-perturbed normal crags | `pixelSurfaceShaders` | **Phase 2e** (props) |
| 12 | `world/assets/createBeachProps.ts` | Beach clutter: smooth Lambert + `onBeforeCompile` pixel clod texture | independent | **Phase 2e** (props) |
| 13 | `world/assets/createCampFlag.ts` | Flag cloth: wind drape/swing + projectile impulse (vertex) | `windMath` (FLAG, gustGlsl) | **Phase 2f** (wind props) |
| 14 | `world/assets/createCanopyTree.ts` | Canopy: wind gust sway (vertex) | `windMath` (CANOPY, gustGlsl) | **Phase 2f** (wind props) |
| 15 | `systems/wingedCreature.ts` | Butterfly wing-flap (pure vertex, per-instance phase/amp) | independent | **Phase 2g** (wildlife) |
| 16 | `world/createMondstadtWorld.ts` | 2-uniform gradient **sky dome** `ShaderMaterial` (+ assembles `waterMaterials[]`, fog) | bottomColor === `scene.fog.color` (ATMO-02); driven by day/night | **Phase 4** — **RETIRED** by Sky Pro |
| 17 | `world/createSeaWater.ts` | Sea `ShaderMaterial`: depth gradient, caustics, glint, rock foam, horizon fade | `wind.timeUniform`, day/night uniforms, `ISLANDS` gaps | **Phase 3** — **RETIRED** by Water Pro |

**Shared GLSL chunk modules that must be ported to TSL helpers first** (not in the 17, but every
port depends on them): `world/town/pixelSurfaceShaders.ts` (PIXEL_SURFACE_COMMON, sunEdgeApply →
#6 #8 #11), `world/shoreShaderChunks.ts` (HASH2_GLSL, PIXEL_BUBBLES_GLSL → #4 #17),
`systems/windMath.ts` (gustGlsl/swayGlsl/CANOPY/FLAG → #5 #13 #14), `systems/sunUniform.ts`
(`sunDirUniform`, the shared edge-highlight → #5 #6 #7 #8). Porting these chunks once unblocks
several materials — do them at the head of each subsystem port.

### Which can be flat-shaded / downgraded during Phase 1

WebGPURenderer natively renders the **built-in** materials (`MeshLambertMaterial`,
`MeshBasicMaterial`, `Sprite`, instanced meshes) via automatic node conversion — only **custom
GLSL** (`ShaderMaterial` + `onBeforeCompile`) breaks. So Phase 1 keeps the scene rendering by
**temporarily neutralising the custom layer**:

- Strip `onBeforeCompile` patches → plain flat/smooth Lambert (terrain #4, grass #5, town #6-8,
  cobble, rock #11, beach #12). Loses pixel clods/ruts/scorch/sand detail, keeps silhouettes + color.
- Replace `ShaderMaterial`s with plain stand-ins: sea #17 → flat translucent plane; fountain #10
  → flat blue; sky dome #16 → solid `scene.background` color. RT feeders #2 #3 → no-op stubs
  (terrain samples nothing while downgraded).
- Wind vertex motion (#5 #13 #14) and butterfly flap (#15) → static (no sway) — purely cosmetic loss.

Everything above is **restored in Phase 2** as node materials. The **only** thing that must be
pixel-correct at the Phase 1 gate is the **pixel filter + outline (#1)** — that is the identity.

---

## Recommended Project Structure (new/modified)

```
waterpro-spike.html            # NEW (Phase 0) repo-root spike; vite serves it, never ships
src/vendor/
├── threejs-water-pro/         # NEW vendored build/ (index.js + .d.ts) — pnpm root, built via own npm
└── threejs-sky-pro/           # NEW vendored build/ + data/ (cloud noise MUST ship alongside)
src/game/engine/
├── createPixelRenderer.ts     # REWRITTEN → WebGPURenderer + PostProcessing + async init
└── tsl/                       # NEW home for ported node materials / TSL chunk helpers
│   ├── outlineNode.ts         #   ported #1 outline pass
│   ├── pixelateNode.ts        #   low-res target + nearest upscale
│   ├── windNodes.ts           #   ported windMath chunks
│   ├── pixelSurfaceNodes.ts   #   ported PIXEL_SURFACE_COMMON / sunEdge
│   └── shoreNodes.ts          #   ported HASH2 / PIXEL_BUBBLES
src/game/world/
├── createWaterSystem.ts       # NEW (Phase 3) wraps WaterSystem at SEA_LEVEL; retires createSeaWater.ts
├── createSkySystem.ts         # NEW (Phase 4) wraps SkySystem; retires sky dome + daynight sky path
├── createSeaWater.ts          # DELETE at Phase 3 (kept as fallback until Water Pro renders)
├── terrainShader.ts           # port to TSL (Phase 2b)
├── createFountainWater.ts     # port to TSL (Phase 2e) then rewire to sky provider (Phase 4)
└── ...                        # per-subsystem ports
src/game/systems/
├── createGroundInfluence.ts   # RT passes → WebGPU (Phase 2a)
├── createScorchMap.ts         # RT passes → WebGPU (Phase 2a)
├── createDayNightCycle.ts     # GUT the sky/fog/water-uniform path; KEEP the sun-light/hemi driver → read sky.sun
└── createReactiveWater.ts     # NEW (Phase 5) projectile wake-generator pool + emissive contribution
```

### Structure Rationale

- **`src/vendor/`** — the handoff prefers copying each package's `build/` for a stable vendored
  bundle over Vite aliasing the packages' `src`. Sky Pro's `build/data/` (cloud noise) MUST be
  copied next to its bundle or it will not run.
- **`engine/tsl/`** — keeps ported node materials out of the ≤300-LOC render entry and lets the
  shared TSL chunk helpers be imported by many materials (mirrors today's shared-GLSL-chunk layout).
- **`createWaterSystem.ts` / `createSkySystem.ts`** — thin wrappers so `createGame` wires two
  handles, matching today's `createSeaWater` / `createDayNightCycle` seam (minimal blast radius).

---

## Architectural Patterns

### Pattern 1: TSL node post-processing graph replaces the manual 3-pass blit

**What:** `THREE.PostProcessing(renderer)` with an `outputNode` built from `pass()` + chained TSL
nodes, instead of `renderer.render(blitScene, blitCamera)`.
**When:** the whole Phase-1 render entry.
**Trade-offs:** async (`await renderer.init/compileAsync`, `postProcessing.render()`); but composes
water fog/underwater/shafts, sky clouds/god-rays, and the ported outline into one graph.

```typescript
// Phase 1 skeleton (createPixelRenderer rewrite). Water/sky nodes are no-ops until 3/4.
const post = new THREE.PostProcessing(renderer);
const scenePass = pass(scene, camera);
let out = scenePass.getTextureNode('output');
// Phase 3: out = water.postProcessing.buildNode(scenePass, out);
// Phase 4: out = sky.applyTo(out, scenePass);
out = outlineNode(out, scenePass.getTextureNode('depth'), sunScreenUniform); // ported #1
out = pixelate(out); // low-res render-target + Nearest upscale = the chunky look
post.outputNode = out;
```

### Pattern 2: "Retire, don't reinvent" for sea + sky

**What:** delete `createSeaWater` / sky dome / day-night sky path; wire the vendor systems.
**When:** Phases 3 (water) and 4 (sky), only AFTER the pixel look is proven and shaders are ported.
**Trade-offs:** loses the bespoke stylized sea look → must re-tune Water Pro presets/wave params to
read correctly *through* the pixel filter (top-down, low internal res). Keep `createSeaWater` on
disk as a fallback until Water Pro renders acceptably (handoff rule).

```typescript
// Phase 3 — sea plane at SEA_LEVEL, wake, cove masking
const water = await WaterSystem.create(renderer, scene, camera, 'medium'); // quality tier for FPS
water.loadPreset(getPresetParams('dusk'));
// Islands poke through a large continuous ocean; only mask ENCLOSED coves if the abyss shows:
// coveMask.visible = false; water.masking.add(coveMask);
water.wake.addGenerator(playerModel.group, { depth: 1.2, radius: 4.0, teleportThreshold: 5.0 });
```

### Pattern 3: Server-anchored clock keeps driving time-of-day (source kept, sink swapped)

**What:** `createServerClock` + `phase01(micros)` stays the single time source; instead of feeding
`createDayNightCycle`, it writes `sky.timeOfDay.time.value` each frame; Sky Pro drives sun/sky/fog.
**When:** Phase 4. This is the invariant that keeps all LAN clients on the same time of day.
**Trade-offs:** do NOT use Sky Pro's `autoAdvanceSecondsPerDay` (that self-advances, diverging
clients) — set `time.value` explicitly from the server clock, `autoAdvanceSecondsPerDay = 0`.

```typescript
// Phase 4 frame wiring
sky.timeOfDay.autoAdvanceSecondsPerDay = 0;             // server clock owns time, not Sky Pro
sky.timeOfDay.time.value = phase01(serverClock.nowMicros()); // 0..1, LAN-shared
sky.update(dt);
water.setSky(sky.createSkyProvider({ envMap: true }));  // ONE wiring call, build once & reuse
// Shadow-casting DirectionalLight + hemisphere fill: rewire to read sky.sun direction (see below)
```

---

## Data Flow

### Render flow (target)

```
serverClock.nowMicros ─▶ phase01 ─▶ sky.timeOfDay.time  ─▶ sky.update(dt) ─┐
groundInfluence/scorch RT feeders ──────────────────────────────────────┐ │
world/entity node materials sample maps + sky ◀──────────────────────────┘ │
                                                                            ▼
frame(): sky.update(dt) ─▶ await water.update(dt) ─▶ postProcessing.render()
        (scenePass → water.buildNode → sky.applyTo → outline → pixelate)
        ─▶ nearest upscale blit ─▶ overlay sprite pass (native res HUD)
```

### Time-of-day / lighting flow change

```
TODAY:  serverClock ─▶ createDayNightCycle.apply(phase)
            ├─▶ fog.color / skyDome topColor        (RETIRED → Sky Pro)
            ├─▶ waterMaterials[] uSkyTop/uHorizon    (RETIRED → water.setSky)
            ├─▶ sunLight.color/intensity/DIRECTION   (KEEP light, drive from sky.sun)
            ├─▶ HemisphereLight sky/ground/intensity (KEEP, or take Sky Pro ambient)
            └─▶ lantern flicker + lamp emissive      (KEEP — unrelated to sky vendor)
TARGET: serverClock ─▶ sky.timeOfDay.time ; Sky Pro owns sky/fog/sun-visual ;
        a thin residual driver copies sky.sun.direction → DirectionalLight.position
        (scene shadows) and → sunDirUniform / setEdgeSunDir (outline rim, cobble/roof edges).
```

**Key data-flow gotchas the roadmapper must schedule:**
1. `setEdgeSunDir` (outline rim) is derived from `sunLight.position − target`. After Phase 4 it must
   read Sky Pro's sun direction — otherwise the outline rims the wrong side.
2. `sunDirUniform` (shared by cobble/roof/grass edge highlights) is the same rewire.
3. The shadow-casting `DirectionalLight` and `HemisphereLight` are NOT part of Water/Sky Pro — the
   `createDayNightCycle` residual that positions/tints them must survive, now sourced from `sky.sun`.

### Reactive water flow (Phase 5)

```
effectSystem.spawnProjectile ─▶ (if flying low over SEA_LEVEL) borrow a wake-generator SLOT
projectile.update (per frame)  ─▶ generator samples the projectile mesh's horizontal motion
projectile despawn / onImpact  ─▶ release slot (removeGenerator) + transient impact stamp
water emissive/light           ─▶ preset emissive tint + caustic light; impacts add lightPool light
```

**Hard constraint from the Wake API:** *"Up to 16 generators may inject in a single frame."*
Projectiles are frequent in combat. Do NOT `addGenerator` per projectile unbounded — use a small
**fixed pool of wake-generator slots** reused across active over-water projectiles (matches this
project's perf discipline: pooling, hard caps, zero per-spawn churn). Wake only injects on
horizontal motion, so a hovering/rising projectile costs nothing.

---

## Scaling / performance considerations (this project's real axis: FPS, not users)

| Concern | Approach |
|---------|----------|
| Water Pro adds SSR/refraction/wake compute passes | Start `WaterSystem.create(..., 'medium')`; expose the `QUALITY_LEVELS` tier; wake grid is 256/512/1024 on medium/high/ultra, disabled on low. Profile every step (past 144→20 and 24fps regressions). |
| Async render loop | `await water.update(dt)` before `postProcessing.render()`; `sky.update` before water. Keep the loop's existing 0.05s dt clamp. |
| Shadow map | Today: `BasicShadowMap`, `autoUpdate=false`, every-other-frame `needsUpdate`. WebGPU shadow API differs — verify the throttle equivalent survives; treat as a Phase 1 risk item. |
| Overlay HUD sprites | Keep the native-res overlay pass AFTER post-processing (HUD must stay crisp, never through the low-res target). |
| Env-map bake for reflections | `createSkyProvider({ envMap: true })` bakes clouds into reflections — build once, reuse; each call disposes the previous baker. |

### First bottleneck / order of attack
1. **Does the machine run WebGPU compute at all, and does the pixel filter survive?** → Phase 0 spike answers before any game code changes.
2. **Water quality tier vs framerate** → pick the tier at Phase 3, re-profile at Phase 5 (reactive wake adds field cost).

---

## Anti-Patterns

### Anti-Pattern 1: Mixing WebGL + WebGPU / expecting ShaderMaterial to run on WebGPU
**Mistake:** keeping `WebGLRenderer` for the world and adding a WebGPU water canvas, or assuming
`onBeforeCompile` still works.
**Why wrong:** you cannot mix the two on one canvas; WebGPURenderer runs **only** TSL node
materials — every one of the 17 breaks.
**Instead:** single `WebGPURenderer`; downgrade custom materials to built-ins in Phase 1, port to
TSL in Phase 2.

### Anti-Pattern 2: Blind full rewrite (no spike)
**Mistake:** porting all 17 shaders + swapping renderer + wiring water/sky in one branch.
**Why wrong:** if the pixel filter can't be reproduced on WebGPU, the whole migration is worthless
(the pixel look is the game's identity) — you'd discover it after weeks.
**Instead:** Phase 0 isolated `waterpro-spike.html` proves pixel-filter + WebGPU compute FIRST; get
user sign-off; then migrate. Checkpoint per phase, never one mega-commit.

### Anti-Pattern 3: One wake generator per projectile
**Mistake:** `addGenerator` on every spawned projectile.
**Why wrong:** ≤16 injections/frame cap; combat spawns far more; unbounded churn violates the
perf rules.
**Instead:** fixed slot pool of reused generators for over-water projectiles.

### Anti-Pattern 4: Letting Sky Pro self-advance time
**Mistake:** `sky.timeOfDay.autoAdvanceSecondsPerDay = 600`.
**Why wrong:** each client advances its own clock → LAN players desync time-of-day, breaking the
server-anchored invariant.
**Instead:** `autoAdvanceSecondsPerDay = 0`; write `time.value = phase01(serverClock.nowMicros())`.

### Anti-Pattern 5: Deleting createSeaWater / sky dome before the replacements render
**Mistake:** removing the custom sea/sky in the same commit that adds Water/Sky Pro.
**Why wrong:** no fallback if the vendor look fails through the pixel filter.
**Instead:** keep the custom versions on disk until the Pro system renders acceptably (handoff rule), then delete as part of the same phase.

---

## Integration Points

### External (vendored) systems

| System | Integration | Notes / gotchas |
|--------|-------------|-----------------|
| Water Pro `WaterSystem` | `await WaterSystem.create(renderer, scene, camera, tier)`; `water.postProcessing.buildNode(scenePass, out)` slots into the node graph BEFORE `sky.applyTo`; `await water.update(dt)` each frame BEFORE `postProcessing.render()`; `water.resize()` on resize | Ocean is large/continuous — islands poke through naturally; `water.masking.add` only for enclosed coves. After `setQualityLevel` you MUST rebuild the post-processing node graph. |
| Sky Pro `SkySystem` | `await SkySystem.create({renderer, camera, scene, quality})`; `sky.applyTo(out, scenePass)` AFTER water in the graph; `sky.update(dt)` BEFORE `water.update`; `water.setSky(sky.createSkyProvider({envMap:true}))` | Star panorama NOT bundled → night renders black unless you pass `nightSky.texture` (moon IS bundled). `build/data/` cloud noise must ship. Sun via `sky.sun.setFromAngles` / driven by `timeOfDay`. |
| three `three/webgpu` + `three/tsl` | `import * as THREE from 'three/webgpu'` + `import { pass } from 'three/tsl'` | Repo already on three `0.185.1` (Water Pro peer `>=0.181`). WebGPU needs a **secure context** — `elements.kingdom.lv` (https) OK; plain-http LAN players on `.32` may lose WebGPU → deploy decision (force https, or gate a WebGL fallback). |

> **API note for the roadmapper:** the handoff/PROJECT mention `SunDriver`/`TimeOfDay` as the
> day-night driver. The real Sky Pro v2 surface is `sky.timeOfDay.time` (0..1),
> `sky.timeOfDay.autoAdvanceSecondsPerDay`, `sky.sun.setFromAngles(...)`, `sky.applyTo(out, scenePass)`,
> `sky.createSkyProvider({envMap})`. Plan against these actual names.

### Internal boundaries (blast radius)

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `createGame` ↔ `createPixelRenderer` | `render(scene)` today | becomes async render + owns PostProcessing; `setEdgeSunDir` sun source changes at Phase 4 |
| terrain/grass ↔ groundInfluence/scorch | shared `textureUniform` objects (ping-pong) | maps become WebGPU targets; consumers still hold the uniform object |
| water/sky ↔ time | `serverClock` → `phase01` | unchanged source; new sink `sky.timeOfDay.time` |
| effectSystem ↔ reactive water | new `createReactiveWater` reads projectile lifecycle | Phase 5; slot-pool wake + emissive |

---

## Suggested build order (spike-first, respects the dependency chain)

```
Phase 0  Feasibility SPIKE (waterpro-spike.html, zero game changes)
         WebGPURenderer + WaterSystem.create + Sky Pro over a sand plane sampling the REAL
         getTerrainHeight, tilted top-down. Reproduce the pixel filter (low-res + nearest + TSL
         outline). ANSWER: does the pixel look survive on WebGPU, and does the machine run WebGPU
         compute? Report shader-port surface estimate. → USER SIGN-OFF gate.
Phase 1  RENDERER migration. WebGL→WebGPU (async init/compileAsync); port #1 pixel-filter+outline
         to TSL post-processing; downgrade all custom materials to built-ins (flat). Gate: build +
         pixel-correct screenshot. NOTHING else must look right yet except the pixel filter.
Phase 2  SHADER ports (one subsystem per commit, screenshot after each):
         2a maps: #2 groundInfluence, #3 scorch (RT→WebGPU) ── unblocks terrain/grass
         2b #4 terrain   2c #5 grass   2d town (#6 #7 #8 #9)   2e props (#10 #11 #12)
         2f wind props (#13 #14)       2g wildlife (#15)
         (port shared chunks pixelSurface/shore/wind/sun first within their subsystem)
Phase 3  WATER PRO. Retire #17 createSeaWater → WaterSystem at SEA_LEVEL; player wake; cove
         masking; tune preset/waves for the pixel look. Profile FPS, pick quality tier.
Phase 4  SKY PRO. Retire #16 sky dome + createDayNightCycle sky/fog/water-uniform path → SkySystem
         driven by serverClock→timeOfDay; water.setSky(provider); rewire sun light + edge-sun + fountain
         (#10) to the sky provider. Retire old fog.
Phase 5  REACTIVE water. Slot-pool wake generators wired to projectile spawn/despawn in
         effectSystem; emissive/caustic light contribution + impact lights. Re-profile.
```

Dependency chain honoured: **renderer → pixel-filter → RT maps → terrain/grass → town/props/wildlife
→ water → sky → reactive**. Each phase is independently screenshot-gated; the spike de-risks the
make-or-break identity question before any irreversible game-code change.

## Sources

- Existing codebase (read directly): `src/game/engine/createPixelRenderer.ts`, `createGame.ts`
  (frame loop L1476-1601), `world/terrain.ts`, `world/createSeaWater.ts`,
  `systems/createDayNightCycle.ts`, `world/createMondstadtWorld.ts` (sky dome L242-372,
  `waterMaterials` L119/850), `world/terrainShader.ts`, `createGrassField.ts`, `createFountainWater.ts`,
  town materials, asset shaders, `createGroundInfluence.ts`/`createScorchMap.ts` (RT passes),
  `wingedCreature.ts` — HIGH confidence. `grep -rlE "ShaderMaterial|onBeforeCompile" src/game` = 17 files.
- Vendor docs (read directly): Water Pro `docs/guide/{post-processing,sky-pro-integration,wake,water-masking}.md`;
  Sky Pro `docs/guide/day-night-cycle.md`; `.planning/v0.4.0-alpha-WEBGPU-WATERPRO-HANDOFF.md` — HIGH.
- Pixel-filter reproduction on WebGPU + WebGPU-compute availability on the target machine — **MEDIUM,
  resolved only by the Phase 0 spike** (explicitly the make-or-break question).

---
*Architecture research for: WebGPU renderer migration + Water Pro / Sky Pro integration*
*Researched: 2026-07-28*
