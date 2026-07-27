# Pitfalls Research

**Domain:** WebGL→WebGPU/TSL renderer migration + commercial FFT water (Water Pro v3.2.1) & procedural sky (Sky Pro v2.0.0) integration into a perf-obsessed pixel-art top-down game
**Researched:** 2026-07-28
**Confidence:** HIGH (integration/API pitfalls verified against `./pro/*/docs`; perf-budget numbers MEDIUM — no on-device WebGPU profile yet)

> Phase map used throughout (from the v0.4.0 handoff):
> **P0** Feasibility spike · **P1** Renderer migration + pixel-filter TSL port · **P2** 17 shader ports · **P3** Water Pro · **P4** Sky Pro · **P5** Projectile-reactive + emissive water.

---

## Critical Pitfalls

### Pitfall 1: The pixel-filter + depth-outline pass fights Water Pro / Sky Pro's own depth-reading post chain (THE make-or-break escape hatch)

**What goes wrong:**
`createPixelRenderer` today owns the whole frame: it renders the world to a ~320×240 `WebGLRenderTarget` (nearest), then a full-screen `ShaderMaterial` blit does sRGB-encode + a depth-discontinuity outline sampling an attached `DepthTexture`. On WebGPU there is no `renderer.render(scene)` you wrap — the frame is a **TSL node graph** ending at `postProcessing.outputNode`, and BOTH Water Pro (`water.postProcessing.buildNode(scenePass, out)`) and Sky Pro (`sky.applyTo(out, scenePass)`) are nodes that read the **scene pass's depth** to composite fog / god rays / clouds / underwater correctly. The pixel filter wants to (a) render the scene at LOW resolution and (b) read depth for the outline. If you pixelate the scene pass to 320×240, Water/Sky read that low-res depth and their effects get chunky/misaligned; if you pixelate AFTER water+sky at full res, the outline's depth is full-res (fine) but the "render the world small" pixelation must be re-expressed as a downsample-then-nearest-upscale node, and the outline must sample the *node-graph* depth (`scenePass.getTextureNode('depth')` / a depth node), not a `THREE.DepthTexture` you own. Get the ordering or the depth source wrong and you get: no outlines, outlines on the wrong resolution, a black/dark scene (missing sRGB/tonemap), or water/sky effects that don't line up with geometry.

**Why it happens:**
The GLSL pipeline is imperative and self-contained; the WebGPU pipeline is a declarative node DAG whose depth is shared and reconstructed once. Developers port the *visual* math and forget the *ordering contract*: "Water effects first, then `sky.applyTo`, then bloom, then tonemap — all reading the scene pass depth" (verified, sky-pro-integration.md + sky post-processing.md). The pixel/outline pass is a NEW consumer of that same depth and a NEW resolution stage the vendors never designed for.

**How to avoid:**
- Decide resolution strategy in **P0** on the isolated spike, not P1. Two viable shapes: (A) render `pass(scene,camera)` at reduced internal resolution so the whole node chain is low-res and nearest-upscaled last — cheapest, and it pixelates water+sky for free (probably the desired look); (B) keep the node chain full-res and add a final "pixelate + outline" TSL node that samples the composited color + the shared depth node. Prototype BOTH in P0 and screenshot-compare against the current build.
- Reproduce the outline in TSL using the node-graph depth (`scenePass.getTextureNode('depth')`, linearize with TSL's perspective-depth helpers), NOT a hand-attached `DepthTexture`.
- Re-implement the manual linear→sRGB encode as the node chain's `renderer.outputColorSpace` / final tonemap step; do not hand-roll it inside the pixelate node (that was a WebGL workaround because a raw `ShaderMaterial` blit skipped `outputColorSpace`).
- Keep the crisp OVERLAY_LAYER pass (health bars, damage numbers) OUT of the pixelated chain — it must still draw native-res on top. In the node world that's a second `pass()` / a second render composited after tonemap.

**Warning signs:**
Spike screenshots where outlines vanish, double, or sit at the wrong scale; water fog/god-rays "shimmering" at chunky resolution while geometry is crisp (or vice-versa); whole scene renders dark (sRGB lost) or blown out (double tonemap).

**Phase to address:** **P0** (go/no-go gate — if neither shape reproduces the look acceptably, STOP and report per the handoff escape hatch). Locked in **P1**.

---

### Pitfall 2: `navigator.gpu` is undefined on plain-http LAN — but the fear is half-wrong, and BOTH the "break" and the "silent WebGL fallback" outcomes bite

**What goes wrong:**
The handoff says LAN http players on `192.168.1.32` "may LOSE WebGPU". Verified nuance from vendor docs: **`WebGPURenderer` automatically falls back to WebGL2, and both Water Pro and Sky Pro run on the WebGL2 backend** (Water: "a compute pass on WebGPU, or an equivalent render-to-texture pass on WebGL. Wakes look the same on either renderer"; Sky: "runs on both backends"; Water installation.md: "WebGPURenderer automatically falls back to WebGL if WebGPU is not available … you don't need to handle renderer selection yourself"). So LAN http players do NOT get a white screen — they get the WebGL2 backend of the SAME node pipeline. The real problems are subtler: (1) **`water.spray` is `null` on the WebGL backend** (verified spray.md) — projectile splash particles silently do nothing for LAN players; (2) the FFT/wake/env-map work that is a GPU compute pass on WebGPU becomes render-to-texture on WebGL2 — **much slower**, and this project has a documented 144→20fps history; (3) any code that assumes compute-only features, or that gates on `navigator.gpu`, branches differently per player with no visible error.

**Why it happens:**
`navigator.gpu` is spec-gated to secure contexts (https / localhost). Devs test on `elements.kingdom.lv` (https, WebGPU) and never see the WebGL2 path that LAN http players silently land on. "It falls back automatically" hides a large perf and feature cliff rather than a crash.

**How to avoid:**
- In **P0**, explicitly test the WebGL2 backend path (force it via a WebGL-only renderer flag or an http origin) and measure FPS with Water Pro at the chosen tier — treat WebGL2 as a first-class target, not an afterthought.
- Detect the active backend at runtime (`renderer.backend` / WebGPU-vs-WebGL flag) and surface it (HUD/debug) so per-player differences are visible in playtests.
- Make the deploy decision an explicit **P0/P3 gate with the user**: (a) force-https for LAN (cloudflared already terminates https at `elements.kingdom.lv`; the raw `192.168.1.32:5173` http path is the exposure), or (b) accept WebGL2 fallback for LAN with a lower quality tier and spray disabled, or (c) keep the old WebGL `createSeaWater` behind a feature flag for WebGL2 players. Do NOT ship until this is chosen.
- Guard every `water.spray?.` call (it's already `null` on WebGL — the docs use optional chaining for exactly this) and treat spray as a High/Ultra + WebGPU-only enhancement, never a load-bearing gameplay signal.

**Warning signs:**
Projectile splashes work on your https dev box but "do nothing" for a LAN tester; a LAN player reports 20fps while https players are smooth; `navigator.gpu`-gated code paths.

**Phase to address:** **P0** (measure WebGL2 path) + **P3/P5** (spray gating) + explicit deploy gate before ship.

---

### Pitfall 3: Async renderer init / `compileAsync` races and the `await water.update()` frame loop — white screen and uninitialised-pipeline crashes

**What goes wrong:**
WebGPU init is asynchronous in places the current WebGL code never had: `await renderer.init()`, `await WaterSystem.create(...)`, `await SkySystem.create(...)`, `await renderer.compileAsync(scene, camera)`, and **`await water.update(dt)` every frame** (verified — all demos `await` the per-frame water update). If the game's existing synchronous bootstrap (`createGame`, resize handlers, first `render()`) runs before these promises resolve, you get: a white/black canvas, "cannot read properties of undefined" on pipeline objects, or `postProcessing.render()` throwing because `outputNode` references passes that don't exist yet. A subtler one: `await water.update(dt)` makes the animation loop async — if you keep a sync `requestAnimationFrame` callback that doesn't await, water advances on a stale/racing schedule and wake/FFT desync.

**Why it happens:**
The whole codebase assumes a synchronous three.js. One un-awaited promise or one early `render()` call breaks a pipeline that used to be constructable in one tick.

**How to avoid:**
- Make bootstrap explicitly async: `await renderer.init()` → build scene → `await WaterSystem.create` / `await SkySystem.create` → wire `setSky` → build `PostProcessing`/`RenderPipeline` outputNode → `await renderer.compileAsync(scene, camera)` → only THEN start the loop. Show a loader until compile resolves.
- Keep the animate loop async and await water every frame: `async function animate(){ requestAnimationFrame(animate); sky.update(dt); await water.update(dt); postProcessing.render(); }` (verified pattern). Do not fire-and-forget the update.
- Gate the first frame on a `ready` flag; never call `postProcessing.render()` before `compileAsync` resolves.
- Resize handlers must call `water.resize()` and `sky.resize(w,h)` (verified) — and must no-op until the systems exist.

**Warning signs:**
White canvas for the first ~second then it pops in (compile race), intermittent boot crashes on slower machines, wake trails that stutter or lag the player.

**Phase to address:** **P1** (async bootstrap + compile gate), reinforced in **P3/P4**.

---

### Pitfall 4: WebGPURenderer does not run raw GLSL `ShaderMaterial` — all 17 custom shaders must become TSL node materials, and a half-ported scene silently loses subsystems

**What goes wrong:**
`grep` confirms **17 files** use `ShaderMaterial`/`onBeforeCompile` (createSeaWater, terrainShader, createGrassField, createScorchMap, createGroundInfluence, wingedCreature, town materials, canopy/flag/rock/beach props, fountain, plaza, cobble, buildings, and the pixel blit itself). `WebGPURenderer` will not compile GLSL `ShaderMaterial` — it needs TSL node materials. A partially-migrated scene doesn't error loudly; individual meshes render wrong (flat, magenta/default, or invisible) while the rest looks fine, so regressions hide until someone looks at that specific prop/biome.

**Why it happens:**
The port surface is large and tempting to do "big bang". `onBeforeCompile` string-injection has NO direct TSL equivalent — you must re-express the injected GLSL as node operations, which is a rewrite, not a translation. Wind, ground-influence, scorch, and grass all likely *share* uniforms/patterns, so a wrong abstraction early multiplies cost.

**How to avoid:**
- Port **one subsystem per commit** with a build + screenshot gate after each (handoff P2 mandate). Order by dependency and blast radius: terrain first (largest surface, everything sits on it), then grass/wind (shared animation), then town/props, then FX (scorch, ground-influence, winged creatures).
- In **P0**, produce a REALISTIC estimate of the port surface per the handoff — count uniforms and `onBeforeCompile` injection points per file, flag the ones sharing a wind/time uniform so they migrate together.
- Keep a running "ported/not-ported" checklist; a mesh rendering as default material == not ported yet, not a bug to chase.
- Preserve the perf-critical tricks when porting: `matrixWorldAutoUpdate=false` + one `updateMatrixWorld()` per frame, merged meshes, gated shadows (memory: threejs-cpu-overhead-traps, always-analyze-performance). TSL doesn't excuse per-frame material churn.

**Warning signs:**
A biome/prop renders flat-shaded or magenta; FPS fine but a subsystem looks "off"; console warnings about unsupported material on WebGPU backend.

**Phase to address:** **P2** (one subsystem per commit); surface-sizing in **P0**.

---

### Pitfall 5: `setQualityLevel()` invalidates render-pass textures — forgetting to rebuild post-processing leaves a stale/black pipeline

**What goes wrong:**
Both vendors let you change quality at runtime, and BOTH warn the post chain must be rebuilt afterward. Water: "`setQualityLevel()` … invalidates internal render pass textures, so you must rebuild your post-processing pipeline afterwards" (verified quality-levels.md + post-processing.md "Rebuilding After Quality Changes"). If you add a settings toggle or an adaptive-quality auto-downgrade and just call `await water.setQualityLevel('medium', params)` without reassigning `postProcessing.outputNode = buildOutputNode(water)`, the pipeline keeps pointing at freed textures → black screen, stale water, or a crash.

**Why it happens:**
`setQualityLevel` reads like a simple setter; the texture-invalidation coupling is non-obvious and only surfaces when someone actually flips quality at runtime (often late, in a settings menu or an FPS-adaptive path).

**How to avoid:**
- Wrap quality changes in one function that ALWAYS rebuilds: `await water.setQualityLevel(l, params); postProcessing.outputNode = buildOutputNode(water, sky);` and re-run `compileAsync`. Never call `setQualityLevel` bare.
- Also rebuild after any Sky `setQualityLevel` if the sky node feeds the chain.
- If you build FPS-adaptive quality (tempting given this project's history), debounce it hard — do not thrash quality per frame; each change rebuilds + recompiles the pipeline (expensive).

**Warning signs:**
Water goes black or freezes the instant a quality slider moves; a crash referencing a disposed texture right after a settings change.

**Phase to address:** **P3** (water quality) + **P4** (sky quality); any settings UI phase.

---

### Pitfall 6: Per-projectile wake/spray generator churn blows the 16-generator cap and injects nothing on vertical hits

**What goes wrong:**
The P5 plan is "per-projectile wake generators." Two hard limits collide with that: (1) **max 16 wake generators inject per frame** and **max 16 spray emitters** (verified wake.md + spray.md); a busy fight with dozens of projectiles overflows instantly and later projectiles silently get no wake/spray. (2) A wake generator **only injects while its object moves horizontally — a stationary or purely bobbing object leaves no wake** (verified). A projectile that *hits* the surface (vertical impact / splash-down) produces NO wake; only a projectile skimming low and horizontally over the water does. So "projectile hits the sea and disturbs it" is the WRONG API — that's a spray/particle/impulse event, not a wake. And **spray is null on WebGL and unallocated on Low/Medium** (verified), so splash particles need WebGPU + High/Ultra. Add per-frame `addGenerator`/`removeGenerator` on every projectile spawn/despawn = allocation churn, exactly the "unbounded per-frame churn" class that caused past regressions.

**Why it happens:**
`addGenerator(mesh)` reads as cheap and general; the horizontal-only injection rule and the 16-cap are buried in the guide. The mental model "disturb the water where the projectile is" doesn't match the wake solver (which models displacement-hull tracks, not impacts).

**How to avoid:**
- **Pool a fixed set of generators (≤16), reassign not recreate.** Keep e.g. 8 reusable wake generators; when a projectile needs one, reuse the least-recently-used via `updateGenerator` (`active`, `depth`, `radius`) instead of add/remove churn. Same for spray emitters.
- Use the RIGHT API per event: horizontal fly-over → wake generator on the moving projectile; surface *impact* → spray emitter probe crossing the surface (`velocityThreshold`), or a one-shot ripple, NOT a wake. Confirm whether a cheap "stamp a ripple at a point" primitive exists (check wake/rain API) before committing; if not, an impact = spray plume + a short-lived buoyant decal.
- Gate impact spray behind backend+tier detection (WebGPU + High/Ultra); provide a cheap fallback (a decal/sprite splash) for WebGL2/Medium so LAN players still see feedback.
- Respect `teleportThreshold` so projectile spawns/warps don't read as a huge wake stamp.

**Warning signs:**
Wakes/splashes appear for the first few projectiles then stop in a busy fight; splash-down produces no ripple; alloc/GC spikes correlated with projectile volume; splashes invisible for LAN testers.

**Phase to address:** **P5** (pool design + API choice), with the cap/backend constraints scoped in **P0**.

---

### Pitfall 7: "Water emits light" (emissive) is NOT a native Water Pro feature — the requirement may need custom TSL

**What goes wrong:**
The milestone requires the sea to "emit light (emissive tint + caustic/light contribution) so the sea reads as lit, not flat." Water Pro's color model is physical **Beer-Lambert absorption + SSS `transmissionColor` + Fresnel + sparkle/sun-glint** (verified color.md) — there is **no `emissive` property**. Treating "emissive water" as a preset toggle will fail; you'll discover mid-P5 there's no API for it.

**Why it happens:**
The word "emissive" implies a material property; Water Pro is a physically-based ocean, not a `MeshStandardMaterial`, and its glow comes from SSS/sparkle/sun, not self-emission.

**How to avoid:**
- Re-scope "emissive" in **P0/requirements** as one of: (a) crank `transmissionColor` (SSS) + `sparkle` + bloom to *read* as lit (cheapest, no custom shader); (b) an additive emissive plane/decal at wake/impact points that bloom picks up; (c) a genuine custom TSL emissive term added to the water node (largest scope, needs Option-2 source access to Water Pro, not just the prebuilt bundle). Pick before P5.
- Bloom is already in the chain (vendor demos add it after water+sky) — much of the "lit" look is exposure + bloom tuning, not literal emission.

**Warning signs:**
P5 stalls hunting for a `water.emissive`/`emissiveColor` field that doesn't exist; the "lit" look only appears when you also touch bloom/exposure.

**Phase to address:** **P0/requirements** (define what "emissive" means) → **P5** (implement).

---

### Pitfall 8: Sky Pro's `data/` (cloud noise) and the star panorama are not shipped by default → runtime failure / black night sky

**What goes wrong:**
Two separate missing-asset traps. (1) Sky Pro loads **cloud-noise volumes from `build/data/` at runtime, resolved relative to `index.js`** (verified installation + water-integration.md). If you vendor only `index.js` and forget `data/`, the sky fails to load clouds at runtime — and Vite's bundling/hashing can move `index.js` so the relative `data/` fetch 404s in the built `dist/`. (2) The **star panorama is NOT bundled** — "Omit `nightSky` and the night sky renders black" (verified day-night-cycle.md). Since this milestone drives a full day/night cycle, night will render pitch-black unless you supply a licensed equirectangular starmap via `nightSky: { texture }`.

**Why it happens:**
Devs test at noon (vendor demos keep the sun up precisely to avoid needing a starmap) and never see night; the `data/` relative-fetch works in `npm run dev` from `src/` but breaks after Vite hashes/relocates the bundle in `dist/`.

**How to avoid:**
- Vendor Sky Pro's ENTIRE `build/` including `data/`, and verify the built `dist/` actually serves `data/` next to the resolved bundle (check laragon-served `dist/` at `elements.kingdom.lv`, not just vite dev). Consider a Vite `publicDir`/`?url` asset strategy so the relative fetch survives hashing.
- Ship a public-domain starmap (NASA/Goddard Deep Star Maps, listed as PD in the docs) and wire `nightSky: { texture }` in **P4**; the moon texture IS bundled (`BUNDLED_MOON_TEXTURE_URL`).
- Add a boot check that logs if cloud data or starmap failed to load.

**Warning signs:**
Clouds missing / console 404 on a `data/*` fetch only in the built `dist/` (works in `npm run dev`); sky goes solid black past sunset.

**Phase to address:** **P4** (sky + starmap) — but verify `data/` survives the build in **P0** when the spike first loads Sky Pro.

---

### Pitfall 9: Wiring order — build the `SkyProvider` once, `sky.update` before `water.update`, water node before `sky.applyTo`, tonemap last

**What goes wrong:**
The integration has a strict order the docs call out (verified sky-pro-integration.md + water-integration.md + sky post-processing.md):
- Per frame: `sky.update(dt)` **before** `await water.update(dt)` (water samples the current frame's sky), both **before** `postProcessing.render()`.
- Post chain: `water.postProcessing.buildNode(...)` **first**, then `sky.applyTo(...)`, then exposure/bloom, then tonemap LAST — because both read the shared scene-pass depth and the sky emits linear HDR that must be exposed/tonemapped last (skip the tonemap and every bright pixel clips to white).
- **Build the `SkyProvider` once and reuse it** — "each `createSkyProvider()` call disposes the previous one's baker." Calling it per frame thrashes the env-map baker.
Get any of these wrong → water lighting lags the sky by a frame (visible on fast time-of-day changes), clouds/fog composite in front of geometry, the scene is dark (no tonemap) or double-exposed, or the env-map baker churns and tanks FPS.

**Why it happens:**
Order looks arbitrary until you know depth is shared and HDR must tonemap last; `createSkyProvider` looks idempotent but owns a disposable baker.

**How to avoid:**
- Encode the frame order in one animate function and the post order in one `buildOutputNode(water, sky)` helper; add a code comment citing the docs so nobody "tidies" it.
- Call `water.setSky(sky.createSkyProvider({ envMap: true }))` ONCE at setup; store the provider. Only rebuild it if you deliberately change env-map settings.
- Use `envMap: true` only if cloud reflections are worth the per-frame equirect bake; `createSkyProvider()` (no args) is the cheaper sky-only reflection — decide by FPS.

**Warning signs:**
Water color/reflection lags a frame behind a fast sunset; clouds draw over foreground geometry; scene dark or blown out; FPS drop that appears only once `setSky(envMap:true)` is wired.

**Phase to address:** **P4** (sky wiring), foundations in **P3**.

---

### Pitfall 10: SEA_LEVEL alignment, island masking, and retiring the old sea/day-night without leaving dead code

**What goes wrong:**
Water Pro's ocean is a large continuous FFT surface; the game is an archipelago (`SEA_LEVEL` referenced in terrain.ts, createSeaWater.ts, terrainShader.ts). Three coupled hazards: (1) the Water Pro plane must sit at exactly the game's `SEA_LEVEL` and the camera's near/far + tilt must match, or beaches flood or the sea floats above sand (the spike is explicitly meant to sample real `getTerrainHeight` and tilt top-down to catch this). (2) Islands "poke through" the continuous ocean; `water.masking` hides water inside mask volumes but is designed for boat-hull interiors, and its cost scales with screen resolution — over-masking every island is wrong; the handoff says use masking only for enclosed coves. (3) CLAUDE.md forbids dead code — dropping `createSeaWater` and `createDayNightCycle` + sky dome must be a clean removal in the same commit that replaces them, not a commented-out fallback (the handoff's "keep the old water until Water Pro renders" is a BRANCH-level safety net, not a shipped dual path).

**Why it happens:**
Continuous-ocean vs discrete-islands is a modeling mismatch; masking looks like the obvious fix and gets over-applied; and "keep the fallback" tempts a permanent dead branch that violates the no-legacy rule.

**How to avoid:**
- Nail `SEA_LEVEL` + camera params in **P0**'s spike over real sampled terrain; treat waterline-vs-beach as an explicit screenshot check.
- Prefer terrain/shoreline blending (Water Pro has shoreline foam + depth-based absorption that fade at beaches) over masking; reserve `water.masking` for genuinely enclosed coves. Mask cost scales with screen resolution, not mask count/complexity (verified).
- Keep the old sea/day-night ONLY on the working branch as a fallback until Water/Sky render correctly; the moment they do, DELETE `createSeaWater`, `createDayNightCycle`, and the sky dome in the same commit that wires the replacement (CLAUDE.md no-dead-code). No feature-flag dual path unless it's the deliberate WebGL2-LAN fallback decided in Pitfall 2.

**Warning signs:**
Beaches underwater or sea hovering over sand; FPS drop proportional to number of masked islands; two water systems both present in a merged commit; `createSeaWater` still imported after Water Pro ships.

**Phase to address:** **P3** (water placement/masking + old-sea removal) + **P4** (old day-night removal).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Big-bang port all 17 shaders in one commit | Feels faster | A single broken subsystem hides among 17; unbisectable regression; violates one-commit-per-phase | Never — one subsystem per commit + screenshot |
| Pixelate the whole node chain low-res (Option A) without testing Water/Sky depth alignment | Cheapest pixel look, water pixelates for free | Water/Sky depth effects may look wrong at chunky res; hard to unwind later | Only after P0 screenshot-confirms it |
| `addGenerator`/`removeGenerator` per projectile | Simple 1:1 mapping | 16-cap overflow, alloc churn, no wake on impacts | Never — pool + reuse |
| Ship without a starmap (test at noon) | No asset licensing/wiring now | Night sky ships pitch-black; discovered by players | Never for a day/night milestone |
| `createSkyProvider()` every frame | "Refreshes" reflections | Disposes+rebuilds the env baker each frame → FPS cliff | Never — build once, reuse |
| Leave old `createSeaWater` as a runtime fallback path | Safety if Water Pro misbehaves | Dead-code violation, double maintenance, confusion | Only as the deliberate WebGL2-LAN fallback (Pitfall 2), flagged and documented |
| Skip WebGL2-backend testing (only test https/WebGPU) | Faster iteration | LAN http players silently on slow WebGL2 with no spray | Never — P0 must measure the WebGL2 path |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Water Pro post-processing | Calling `renderer.render(scene)` like WebGL | Build `pass()` → `water.postProcessing.buildNode` → `sky.applyTo` → bloom → tonemap into `postProcessing.outputNode`; call `postProcessing.render()` |
| `setQualityLevel` | Not rebuilding the post chain after | Always reassign `outputNode` + recompile after any quality change |
| Sky Pro assets | Vendoring only `index.js` | Copy entire `build/` incl. `data/`; verify `data/` resolves in built `dist/`, not just dev |
| Night sky | No `nightSky.texture` | Ship a PD equirectangular starmap; moon texture is bundled |
| `water.setSky` | Rebuilding provider per frame | `createSkyProvider` once, reuse; reads sky live each frame automatically |
| `water.spray` | Assuming it exists everywhere | `null` on WebGL backend, unallocated on Low/Medium; always optional-chain + gate on High/Ultra+WebGPU |
| Wake | Expecting impacts/bobbing to ripple | Wake only injects on horizontal motion; impacts need spray/decals |
| Frame loop | Un-awaited `water.update` | `await water.update(dt)` every frame; keep loop async |
| Deterministic multiplayer waves (optional) | Assuming shared look by default | `deterministic:true` + shared `seed` + `syncToTick` if LAN players must see the same sea |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Starting at High/Ultra tier | 20-40fps like past regressions | Start "medium"; SSR/refraction/domain-warp foam are High+ only (verified) | Immediately on this project's hardware history |
| `envMap:true` cloud-reflection bake | FPS drop appears only after `setSky` | Use sky-only `createSkyProvider()` unless cloud reflections earn it; lower `envMapWidth`/`marchSteps` | On weaker GPUs / WebGL2 |
| WebGL2 backend running FFT/wake as render-to-texture | LAN http players at low FPS while https smooth | Measure WebGL2 path in P0; lower tier for that backend | On every LAN http player |
| Per-frame `createSkyProvider` / quality thrash | Stutter tied to settings or adaptive logic | Build provider once; debounce adaptive quality | On any runtime quality change |
| Wake/spray cap overflow | Effects stop mid-fight | Pool ≤16 generators/emitters, reuse | In busy projectile fights |
| Cloud resolution (`cloudHistoryDiv`) | Sky is the frame-time sink | It's the dominant sky lever — raise divisor before other knobs; drop god rays (free when off) | When clouds fill the screen |
| Lost matrix/shadow throttles in the port | CPU-bound frame like threejs-cpu-overhead-traps | Re-apply `matrixWorldAutoUpdate=false`, one `updateMatrixWorld`, throttled/gated shadows in TSL port | If the port "just uses defaults" |

## Profiling Method (headless can't run WebGPU compute)

The existing headless Playwright + swiftshader harness (`192.168.1.32:5173/<page>.html`) will NOT run WebGPU compute (handoff). Replace it for this milestone:
- **Headed Chrome** with `chrome://gpu` confirming WebGPU active; use the DevTools Performance panel and the `?fps`/frame-cost HUD the project already uses.
- **User screenshots / screen capture** for the pixel-filter go/no-go and night sky (things headless can't validate).
- **Force the WebGL2 backend** for a second profiling pass so the LAN player's real cost is measured, not assumed.
- Keep the DevTools identity-serialization flood check (CLAUDE.md) — the React re-render churn traps are orthogonal to the renderer swap and still apply.

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Forcing https for LAN to get WebGPU without confirming the cloudflared/`.31`→`.32` topology still routes | LAN players can't connect (login hangs, per remote-domain-topology memory) | Confirm the tunnel + `:3000` routing before flipping any force-https deploy decision (deploy-pipeline-31 memory) |
| Fetching starmap/`data/` from a third-party CDN at runtime | External dependency / availability / licensing exposure | Vendor PD assets locally under the game's own origin |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Losing the pixel-art identity to "prettier" HDR water/sky | Game stops looking like itself — the sacred constraint | P0 go/no-go on the pixel filter; tune Water/Sky THROUGH the pixel filter, not around it |
| Spray/emissive feedback only for https+High players | Inconsistent combat feedback across players | Cheap decal/sprite fallback for WebGL2/Medium so everyone sees splash feedback |
| Long black/white boot while WebGPU compiles | Looks broken | Loader gated on `compileAsync`; don't render before ready |
| Pitch-black night after sunset | Looks like a bug | Ship the starmap + moon ambient (`moonAmbient`) so night is lit, not black |

## "Looks Done But Isn't" Checklist

- [ ] **Pixel filter on WebGPU:** Verify outline pass reads node-graph depth AND survives at the real internal resolution — screenshot-diff vs current `master` build, not just "looks pixelated".
- [ ] **Night sky:** Verify past `time=0.75` it renders stars/moon, not black — the demos hide this by keeping the sun up.
- [ ] **Built `dist/`:** Verify Sky Pro `data/` and starmap load from the laragon-served `dist/` at `elements.kingdom.lv`, not only `npm run dev`.
- [ ] **WebGL2 fallback:** Verify a plain-http LAN player boots (WebGL2 backend), and measure their FPS + confirm spray gracefully absent.
- [ ] **Quality change:** Verify the post chain rebuilds — flip the tier at runtime and confirm no black screen/crash.
- [ ] **Wake reality:** Verify a surface *impact* actually produces feedback (it won't via wake alone) and that the 17th projectile still shows an effect (cap).
- [ ] **Dead code:** Verify `createSeaWater` / `createDayNightCycle` / sky dome are DELETED (or the single documented WebGL2 fallback), not left commented.
- [ ] **All 17 shaders:** Verify each subsystem renders correctly (no default-material meshes) — walk the whole world, not just spawn.
- [ ] **Frame order:** Verify `sky.update` → `await water.update` → `render`; provider built once.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Pixel filter unreproducible on WebGPU | HIGH | Stop at P0 gate; report to user; keep WebGL renderer (migration abandoned) — the sanctioned escape hatch |
| LAN http players broken/slow | MEDIUM | Decide force-https (confirm tunnel routing) OR WebGL2-tier fallback OR keep WebGL sea behind a flag |
| Half-ported shaders shipped | LOW | One-subsystem-per-commit makes it bisectable; finish/revert the offending commit |
| Post chain black after quality change | LOW | Wrap quality change to always rebuild `outputNode` + recompile |
| Wake/spray cap overflow | LOW | Introduce the pooled-generator manager; reuse via `updateGenerator` |
| Emissive water has no API | MEDIUM | Fall back to SSS+sparkle+bloom look, or additive decal; only escalate to custom TSL (needs source-option vendor build) if required |
| Missing `data/`/starmap in prod | LOW | Fix Vite asset handling; vendor assets under the game origin |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 Pixel filter vs post-chain depth | P0 gate → P1 | Screenshot-diff vs `master`; both resolution shapes prototyped |
| 2 LAN http WebGPU loss / spray null | P0 measure + deploy gate | Boot a WebGL2 http client; measure FPS; user decision recorded |
| 3 Async init / compile races | P1 | No first-frame crash; loader until `compileAsync` |
| 4 17 GLSL→TSL ports | P0 sizing → P2 | One commit per subsystem; no default-material meshes |
| 5 `setQualityLevel` rebuild | P3/P4 | Runtime tier flip: no black/crash |
| 6 Per-projectile wake/spray churn | P0 constraints → P5 | 17th projectile still shows effect; no alloc spikes; impact feedback exists |
| 7 Emissive water has no API | P0/requirements → P5 | "Emissive" definition chosen before P5 code |
| 8 Sky `data/`/starmap missing | P0 load-check → P4 | Night lit in built `dist/`; no `data/` 404 |
| 9 Wiring/update order | P3 → P4 | Water tracks fast sunset with no 1-frame lag; provider built once |
| 10 SEA_LEVEL/masking/dead code | P3/P4 | Waterline correct over sampled terrain; old sea/day-night deleted |

## Sources

- `./pro/Three.js Water Pro v3.2.1/threejs-water-pro/docs/guide/{quality-levels, post-processing, wake, water-masking, sky-pro-integration, installation, multiplayer}.md` and `docs/api/{spray, color}.md` — HIGH (curated vendor docs)
- `./pro/Three.js Sky Pro v2.0.0/threejs-sky-pro/docs/guide/{installation, water-integration, day-night-cycle, tuning-performance, post-processing}.md` — HIGH (curated vendor docs)
- `src/game/engine/createPixelRenderer.ts` (current pixel/outline pipeline) — HIGH (source)
- `grep ShaderMaterial|onBeforeCompile src/game` → 17 files — HIGH (source)
- `.planning/v0.4.0-alpha-WEBGPU-WATERPRO-HANDOFF.md`, `.planning/PROJECT.md`, CLAUDE.md, project memory (always-analyze-performance, threejs-cpu-overhead-traps, identity-hex-perf-cliff, remote-domain-topology, deploy-pipeline-31) — HIGH (project context)
- WebGPU secure-context requirement (`navigator.gpu`) and `WebGPURenderer`→WebGL2 auto-fallback — MEDIUM (vendor docs assert the fallback; secure-context gating is WebGPU spec, not re-verified on this hardware)
- Perf-tier FPS numbers on target hardware — LOW/UNMEASURED (no on-device WebGPU profile yet; P0 must produce it)

---
*Pitfalls research for: WebGPU/TSL migration + Water Pro & Sky Pro integration into a pixel-art top-down multiplayer game*
*Researched: 2026-07-28*
