# Feature Research

**Domain:** WebGPU ocean + sky for a stylized top-down pixel-filter Three.js game (Water Pro v3.2.1 + Sky Pro v2.0.0 replacing a custom 1-quad sea + custom day/night)
**Researched:** 2026-07-28
**Confidence:** HIGH — every capability below cites a real Water Pro / Sky Pro doc or exported API from the unzipped packages under `./pro/`. The only MEDIUM items are the two NEW asks (projectile-reaction, emissive light), where the packages expose no purpose-built API and the recommendation is an assembly of documented primitives.

## Framing: what "table stakes" means through THIS lens

The game is a tilted **top-down** camera rendered through a **low-res (~320×240) nearest-upscale pixel filter** with a depth-outline pass. Two consequences drive every categorization below:

1. **The camera never goes underwater.** Every Water Pro *underwater* subsystem (underwater haze/fog, sun shafts/god rays underwater, ambient particles, ocean floor + caustics, waterline meniscus, Snell's-window TIR) renders content the player never sees. These are **anti-features** here — pure cost.
2. **The pixel filter destroys sub-pixel, high-frequency detail.** Fine FFT ripple detail, screen-space refraction wobble, tiny sparkle spots, and SSR micro-reflections mostly get averaged away by the downres. What survives and matters at this scale: **depth-based water color, shoreline foam, large wave/swell motion, sky-driven tint (day/night), a broad sun/moon glint, and wake trails.** That is exactly the feature set the old `createSeaWater.ts` hand-rolled — so the Pro swap is a like-for-like upgrade of the *visible* set, with the rest turned off for framerate.

Everything here is gated on the **renderer migration** — Water Pro and Sky Pro both `import * as THREE from "three/webgpu"`, require `WebGPURenderer`, node post-processing, and TSL. Nothing in this file can land before Phases 1–2 (WebGPU + pixel-filter port) are proven. Complexity ratings below are *integration* complexity on top of that migration, not the migration itself.

## Feature Landscape — Water Pro v3.2.1

### Table Stakes (a believable sea from top-down needs these)

| Feature | Why Expected (maps to old custom sea) | Complexity | Notes / API |
|---------|----------------------------------------|------------|-------------|
| Depth-based water color | Replaces the custom `SHALLOW→MID→DEEP` teal→navy gradient. Physical Beer-Lambert absorption + intrinsic `waterColor`. | LOW | `water.color.{waterColor, absorptionColor, transmissionColor, waterDepth}`. Always on at all quality tiers. Tune to the stylized teal. |
| Shoreline foam | Replaces the old rock-ring surf + pixel-bubble swash lip. Depth-based foam at terrain/object interfaces. | LOW | `water.foam.shoreline.{coverage, range, size, color, opacity}`. Always on. Islands poke through the ocean plane → shoreline foam forms at each coast automatically. |
| Wave motion (swell) | A flat quad reads dead; the old sea faked motion with 2 sines. Gerstner large-scale swell + FFT displacement. | LOW | `water.gerstner` (swell) + `water.waves` (FFT). Displacement always on; mesh segments/FFT scale with quality tier. Keep amplitude modest for the stylized look. |
| Sky-driven reflection + fog color | The old sea read `uSkyTop`/`uHorizon` from the day/night palette; this must follow Sky Pro instead. | LOW | `water.setSky(skyProvider)` — one call; provider drives reflection sampler + atmospheric fog color + sun every frame. See Sky Pro section. |
| Sun / moon glint (sparkle) | Replaces the custom specular streak + moon-glint swap. View-dependent glints scaled by normal, distance-faded. | LOW | `water.sparkle.{intensity, power, minDistance, fadeDistance}`. Always on. Sun vector comes from the sky provider, so the day→night sun→moon handoff is automatic (old code did this by hand). |
| Wave-crest foam (whitecaps) | Chunky white on crests reads well even downres'd; the old sea had none, only shore foam. | LOW | `water.foam.waves` + `water.foam.waves.persistence.{crestStrength, decayTime, windwardStrength}`. Always on. |
| Atmospheric fog (above-water) | The old pipeline melted the far sea into the fogged horizon; Water Pro's fog does this and samples sky color. | LOW | `water.fog`, applied per-material via `scene.fogNode`; built into `water.postProcessing.buildNode`. Replaces the custom `horizonFade`. |
| Subsurface scattering | Light through wave crests against the sun — cheap "the water is lit, not a flat sheet" cue that survives downres as brightness. | LOW | `water.sss.{intensity, power}`, tint via `water.color.transmissionColor`. Always on. Relevant to the emissive ask (below). |

### Differentiators (competitive lift over the old custom sea)

| Feature | Value Proposition | Complexity | Notes / API |
|---------|-------------------|------------|-------------|
| **Player wake** | A trail behind the moving player/boats — the single biggest "this is real water" tell. The old sea had nothing. | MEDIUM | `water.wake.addGenerator(mesh, {depth, radius, offset, teleportThreshold})` / `removeGenerator` / `updateGenerator`. Object-driven, samples world motion each frame, **horizontal moves only**. Runs on WebGPU + WebGL, **disabled on `low` quality**, ≤16 generators/frame. Field is camera-centered (`worldSize` default 700). |
| Cloud reflections in the water | Clouds mirrored on the surface when Sky Pro clouds are on. Reads as broad bright/dark patches even downres'd. | LOW (wiring) / MEDIUM (cost) | `water.setSky(sky.createSkyProvider({ envMap: true }))`. Costs a per-frame equirect bake; `createSkyProvider()` with no options = cheaper sky-only reflection fallback. |
| Screen-space reflections (SSR) | Sharper reflections of islands/props on the surface. | MEDIUM | `water.ssr`. **`high`/`ultra` only.** Largely lost to the pixel filter from top-down — evaluate as optional, likely not worth the tier bump. |
| Screen refraction | Seabed/shore wobble seen through the surface. | LOW (toggle) | `high`/`ultra` only. Camera never dives; refraction wobble is sub-pixel from top-down. Low payoff here. |
| Water masking | Hide water inside enclosed volumes (coves, harbor interiors, a boat hull). | LOW | `water.masking.add(mesh)/remove(mesh)`. The handoff notes the ocean is continuous and islands poke through, so masking is only needed for *enclosed* coves, if any. Screen-space cost scales with resolution, skipped when empty. |
| Buoyancy | Floating props (crates, buoys, debris) bob/tilt with the waves. | MEDIUM | `water.buoyancy.addObject(mesh, {heightOffset, rotationInfluence, heightSmoothing, rotationSmoothing, multiPoint})`. Up to 128 sample points. Nice ambient life; not required for the sea to read. |
| Presets | 8 ready looks (`sunset`, `dusk`, `moonlit`, `storm`, `seaOfThieves`, `arctic`, `blackFlag`, `foggy`) as a tuning starting point. | LOW | `water.loadPreset(getPresetParams(name))` / `WaterPreset` object. **Presets configure water only, never the sky.** Use one as a base, then hand-tune for the stylized palette. |

### Anti-Features (turn OFF for perf or for the top-down pixel look)

| Feature | Why It Exists | Why Problematic HERE | What to Do Instead |
|---------|---------------|----------------------|--------------------|
| Underwater haze / fog | Submerged camera realism | Camera never submerges; pure post-processing cost | Leave in the built graph but `water.underwater.enabled = false`; `cameraSubmerged` stays false. |
| Sun shafts / god rays (underwater) | Volumetric shafts seen underwater | Never visible from top-down above water | `water.sunShafts.enabled = false`. |
| Ambient underwater particles | Sediment/plankton when submerged | Never visible | `water.particles.enabled = false` (or preset default off). |
| Ocean floor + caustics | Seabed detail + light patterns for shallow/clear water | Extra mesh + caustics shader; the seabed is the game's own terrain, not Water Pro's floor | `water.floor.setVisible(false)`. Do NOT use Water Pro's floor — the game has `getTerrainHeight` terrain already. (Caustics as an *emissive-read* idea is addressed below but is not the seabed floor.) |
| Waterline meniscus | Rim highlight at the camera near-clip when half-submerged | Only fires at the clip-plane boundary; camera never straddles the surface | `water.waterline.enabled = false`. |
| Rain (streaks + ripples) | Storm weather | Out of scope this milestone (weather deferred per PROJECT.md); global ripple field is not a projectile tool | Keep off (`water.rain.particles.enabled = false`). See projectile note — rain ripples are global, not per-point. |
| `ultra` quality tier | Hero screenshots | 128 mesh segments, 256 FFT, 1× scene-color res — wasted under a 320×240 filter on a perf-obsessed target | Start **`medium`**; the wake needs ≥`medium` (off on `low`). Bench `high` only if a specific tell is missing. |
| Deterministic / `syncToTick` multiplayer water | Same wave field across networked clients | Wave detail is cosmetic here and lost to the filter; heights aren't bit-exact across GPUs anyway | Leave `deterministic:false`. Don't network the water; it's pure client cosmetics. |

## Feature Landscape — Sky Pro v2.0.0

### Table Stakes (replaces the custom day/night + sky dome)

| Feature | Why Expected (maps to `createDayNightCycle.ts`) | Complexity | Notes / API |
|---------|--------------------------------------------------|------------|-------------|
| Procedural atmosphere / sky dome | Replaces the hand-lerped `skyTop`/`horizon` palette + sky-dome uniform. | LOW | `SkySystem.create({renderer, camera, scene, quality})` adds its backdrops to the scene; `sky.atmosphere` (turbidity/exposure/scattering). |
| Dynamic day/night clock | Replaces the ~20-min server-anchored phase → palette drift. | MEDIUM | `sky.timeOfDay.time.value` runs 0..1 (0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset). **Drive it externally** by writing `time.value` from the LAN server clock and setting `autoAdvanceSecondsPerDay = 0` (pause the internal driver so our clock is authoritative). See the day/night ask below. |
| Physical sun (arc + color + intensity) | Replaces the custom `sunDir(phase)` capped-arc + sun color/intensity drift. | LOW | `sky.sun.{setFromAngles(el,az), applyParams, peakIntensity, color, direction}`. The clock rewrites `sun.direction` from `time`/`latitude`/`azimuth`. `latitude`/`azimuth` line the arc up with the world. |
| Sky → water coupling | The old code manually copied sky colors + sun into the water uniforms every frame. | LOW | `water.setSky(sky.createSkyProvider({envMap}))`. Provider syncs sun (dir/color/intensity), reflection env, and fog color into the water automatically each frame. **Call `sky.update(dt)` before `water.update(dt)`.** |
| Sky composite in post | The sky must draw behind geometry with correct depth. | LOW | `output = sky.applyTo(output, scenePass)` — chained **after** `water.postProcessing.buildNode` and **before** bloom/tone-map. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes / API |
|---------|-------------------|------------|-------------|
| Volumetric clouds | Real drifting clouds (shape/wind/cirrus) — a huge lift over a flat gradient dome, and they reflect in the water. | MEDIUM | `sky.clouds`. Cloud image renders at `screen ÷ cloudHistoryDiv` (dominant cost lever). Needs `build/data/` cloud-noise copied alongside the bundle. |
| Moon + phases at night | The old code faked a "moon glint" by flipping the sun antipode. Sky Pro gives a real moon disc, phase, moonlight, cloud rim-light. | LOW | `sky.timeOfDay.{moonPhase, moonIntensity, moonColor, moonAmbient}`. Moon sits opposite the sun automatically. Water reflections include the moon. |
| Stars at night | Twilight star fade-in overhead. | LOW (asset) | Requires supplying an equirectangular starmap: `SkySystem.create({..., nightSky:{texture}})`. **Not bundled** — without it the night sky renders black. NASA/SSS public-domain sources listed in docs. |
| God rays (sky) | Crepuscular shafts from sun/moon through clouds. | MEDIUM | `sky.godRays`; on for `medium`+, off on `low`. Switches sun→moon after sunset (`moonGodRayScale`). Payoff small when sun is high; easy to disable. |
| Cloud ground shadows | Clouds shadow the world (`sky.cloudShadow(worldPos)` multiplied into direct sun of your materials). | HIGH | Requires wiring into our (ported) material sun terms — significant TSL work atop the shader port. Defer. |
| Presets | Ready looks (`partlyCloudy`, `stunningSunset`, `thunderstorm`, …) via `PRESETS`. | LOW | `sky.applyPreset(PRESETS.x)`; look-only, never touches quality tier. `sky.toParams()`/`applyParams` to snapshot/restore a tuned look. |

### Anti-Features (Sky Pro)

| Feature | Why It Exists | Why Problematic HERE | Alternative |
|---------|---------------|----------------------|-------------|
| `ultra` / high cloud resolution | Hero shots | `cloudHistoryDiv` is the #1 frame cost; the filter softens clouds anyway | Start `medium`; tune `cloudHistoryDiv` up (cheaper) before anything else. |
| Env-map cloud reflections at high res | Sharp cloud mirror in water | Per-frame equirect bake; sharpness lost under the filter | Use `createSkyProvider({envMap:true})` at default/low res, or bare `createSkyProvider()` (sky-only) if clouds-in-water isn't worth the bake. |
| Baked seasons/latitude realism | Physically-correct sun arcs | The game's day/night is a mood clock, not an almanac | Pick one flattering `latitude`/`azimuth` and leave it; drive only `time`. |
| Cloud ground shadows | Grounded realism | Needs bespoke TSL wiring into every ported material | Defer past this milestone. |

## THE TWO NEW ASKS — API-grounded answers

### Ask A — Projectile-aware water (projectiles disturb the surface)

**There is no public "inject a ripple at point P" height-field API.** The height field is only disturbed by three documented mechanisms — `wake` (path-swept, object-driven), `spray` (impact plumes), and `rain.ripples` (global). Map each projectile behavior to the right one:

| Projectile behavior | Right tool | Why | API |
|---------------------|-----------|-----|-----|
| **Skimming low, horizontally over the surface** (grazing shots, water-run abilities) | **`water.wake.addGenerator`** | Wake injects only on **horizontal** XZ motion — exactly a skimming projectile. Leaves a feathered trail. | Pool ≤16 generators; assign to active near-surface projectiles, `updateGenerator({active})` to park, small `depth`/`radius` (e.g. `depth:0.3, radius:1.5` like a buoy). Set `teleportThreshold` above a projectile's max per-frame travel so spawn/despawn snaps inject nothing. |
| **Plunging / impacting from above (vertical)** | **`water.spray`** (WebGPU only) | Wake **ignores vertical motion** — a straight-down impact produces no wake. Spray fires a plume when a probe crosses the surface faster than `velocityThreshold`. | `water.spray.addEmitter(projectileMesh, {probes:[{local:(0,0,0)}], velocityThreshold, size})`. WebGPU-only (`water.spray` is `null` on WebGL) — fine, we're migrating to WebGPU. Fires a **billboard plume**, not a ring ripple. |
| **A persistent ripple ring from a point impact** | *Not natively exposed* | `rain.ripples` is a **global** analytic field (whole surface), not per-point; no point-poke API exists. | Approximate: a short-lived **additive transparent decal/sprite** on the surface (composes with fog automatically — see transparent-objects), or accept the spray plume as the splash read. |

**Concrete recommendation (Ask A):** a small **wake-generator pool (≤16)** driven by the projectile system is the primary, cross-backend, documented mechanism — best for skimming/travelling projectiles and cheap. Layer **spray emitters** (WebGPU) on projectiles that actually strike the surface for the vertical-impact splash. Do **not** expect wake to react to a vertical plunge, and do **not** reach for `rain.ripples` (it's global, not targeted). Complexity: **MEDIUM** — a pooled generator manager + per-projectile lifecycle, plus the ≤16/frame budget and `low`-tier disable to respect.

> Perf note (project's #1 constraint): the wake solver is a compute/RT pass whose grid scales with tier (256/512/1024 on medium/high/ultra) and is **camera-centered** — its cost is fixed by tier, not by generator count, but you still must cap at 16 injecting generators/frame. Wake is **off on `low`**, so the projectile feature forces a **≥`medium`** floor.

### Ask B — Emissive / "the water emits light, reads as lit"

**Water Pro exposes no `emissiveNode`.** The surface is a custom material lit by exactly two inputs: the **sky provider's sun** (`water.lighting.sun` — direction/color/intensity, *overwritten every frame by the provider*) and **`scene.environment` ambient** (scaled by `water.environment.intensity`). Arbitrary `THREE.PointLight`s are **not** documented to light the Water Pro surface. So "make the water glow" splits into two different problems with two different answers:

**B1 — Global "the sea reads as lit, not a flat sheet" (recommended, LOW):** assemble documented brightness cues + HDR bloom:
- `water.sparkle.{intensity, power}` — sun/moon glints (the strongest lit cue that survives downres as brightness).
- `water.sss.{intensity, power}` + `water.color.transmissionColor` — light transmitted through crests.
- `water.color.waterColor` pushed brighter / toward a stylized tint — it is *intrinsic in-scattered radiance*, so raising it reads as the water body glowing from within (a bioluminescent look is achievable purely here).
- **Bloom in post** — the integration's own example chains `bloom(output, 0.5, 0.4, 0.85)` after the sky composite; foam (default white) and sparkle spike into HDR and bloom into a glow. This is the single most effective "emits light" lever and it's already in the reference pipeline.

**B2 — Localized emissive glow riding the surface (e.g. a glowing projectile lighting the water) (MEDIUM):** because the Water Pro surface will not respond to a scene point light, the API-honest approach is an **additive transparent overlay** that rides on the water plane at the glow position. Transparent/additive materials compose with the water's fog automatically and "fade out with distance instead of tinting toward fog" (transparent-objects guide) — no registration needed. The emissive *is a separate additive mesh*, not the Water Pro surface emitting. Do **not** try to hijack `water.lighting.sun` for a local light: the sky provider overwrites it every frame, and it's directional/global anyway.

**Concrete recommendation (Ask B):** ship **B1** (sparkle + SSS + a lifted/tinted `waterColor` + bloom) as the "lit sea" — LOW complexity, all first-class API, and it's what the reference pipeline already does. Use **B2** (additive surface decals/sprites) for any *localized* emissive spots (glowing projectile trails, ability FX on the water). Treat "the Water Pro surface itself emits at an arbitrary point" as **not supported** — it's an overlay, not a material feature.

## Feature Dependencies

```
WebGPURenderer migration (Phase 1)  ── hard requirement for ──> EVERYTHING below
    └── pixel-filter + outline ported to TSL (Phase 1)
    └── 17 custom shaders ported to node materials (Phase 2)
                                          │
Water Pro (Phase 3) ───requires───> WebGPURenderer + node post-processing
    ├── water.setSky(provider) ──requires──> Sky Pro (Phase 4)
    ├── player wake ──requires──> quality >= medium (off on low)
    ├── spray (impact splash) ──requires──> WebGPU backend (null on WebGL)
    └── cloud reflections in water ──requires──> Sky Pro clouds + envMap:true

Sky Pro (Phase 4) ───requires───> WebGPURenderer + node post-processing
    ├── external day/night ──requires──> LAN server clock -> timeOfDay.time (autoAdvance=0)
    └── stars at night ──requires──> supplied equirectangular starmap asset

Projectile reaction (Phase 5) ──requires──> Water Pro wake pool (+ spray on WebGPU)
Emissive/lit water (Phase 5) ──requires──> Water Pro (sparkle/sss/waterColor) + bloom in post
    └── localized emissive ──uses──> additive transparent overlay (not the water material)

Post chain ORDER (conflicts if reordered): water.postProcessing.buildNode -> sky.applyTo -> bloom
Update ORDER (conflicts if reordered): sky.update(dt) BEFORE water.update(dt) BEFORE postProcessing.render()
```

### Dependency notes
- **`water.setSky` requires the Sky Pro provider built once and reused** — each `createSkyProvider()` call disposes the previous env-map baker. Build it after both systems exist, then never rebuild casually.
- **Wake requires ≥`medium`** and the projectile feature therefore sets the quality floor; it can't ship on a `low` fallback.
- **Spray requires WebGPU** — it is the vertical-impact tool and is `null` on any WebGL fallback path, so the LAN-http-WebGL-fallback risk (from the handoff) would silently drop impact splashes.
- **External day/night requires pausing Sky Pro's internal driver** (`autoAdvanceSecondsPerDay = 0`) and writing `timeOfDay.time.value` from the server clock each frame — otherwise the two clocks fight.
- **Sky/water post nodes both read the scene-pass depth** — reordering the chain breaks fog/cloud/geometry compositing.

## MVP Definition (for this milestone's water/sky slice)

### Launch With (the sea + sky must read correctly)
- [ ] Depth water color + shoreline foam + wave swell — the sea reads as a sea (replaces the custom quad 1:1).
- [ ] `water.setSky(skyProvider)` + Sky Pro atmosphere/sun + **external day/night** driven by the LAN clock — replaces `createDayNightCycle.ts`.
- [ ] Sun/moon glint (sparkle) following the sky — replaces the hand-rolled glint + moon-antipode hack.
- [ ] All underwater subsystems disabled (haze, sun shafts, particles, ocean floor, waterline) — perf.
- [ ] Quality **`medium`**, FPS profiled at every step against the perf budget.

### Add After Validation (differentiators, once the sea holds framerate)
- [ ] Player wake (generator on the player mesh) — trigger: base sea validated + FPS headroom.
- [ ] Sky Pro volumetric clouds + cloud reflections in water (`envMap:true`) — trigger: framerate holds at medium.
- [ ] Moon + stars at night (supply starmap) — trigger: night phase looks empty/black.
- [ ] **Ask A** projectile wake pool (+ spray on impact) — trigger: sea + wake proven, projectile system wired.
- [ ] **Ask B** lit/emissive water (sparkle + sss + waterColor + bloom; additive overlays for local glow) — trigger: sea proven.

### Future Consideration (defer past this milestone)
- [ ] Buoyancy for floating props — nice ambient life, not required.
- [ ] Cloud ground shadows (`sky.cloudShadow`) — heavy per-material TSL wiring.
- [ ] SSR / screen refraction (`high`+ only) — mostly lost to the filter; revisit only if a specific tell is missing.
- [ ] Rain/weather — explicitly deferred in PROJECT.md.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|-----------|---------------------|----------|
| Depth color + shoreline foam + swell | HIGH | LOW | P1 |
| Sky Pro atmosphere + sun + external day/night | HIGH | MEDIUM | P1 |
| `water.setSky` coupling + sparkle glint | HIGH | LOW | P1 |
| Disable all underwater subsystems | HIGH (perf) | LOW | P1 |
| Player wake | HIGH | MEDIUM | P2 |
| Lit/emissive water (B1: sparkle+sss+waterColor+bloom) | MEDIUM | LOW | P2 |
| Projectile wake pool (Ask A, skimmers) | MEDIUM | MEDIUM | P2 |
| Volumetric clouds + cloud reflections | MEDIUM | MEDIUM | P2 |
| Moon + stars at night | MEDIUM | LOW (asset) | P2 |
| Spray on projectile impact (Ask A, vertical) | MEDIUM | MEDIUM | P3 |
| Localized emissive overlay (Ask B2) | MEDIUM | MEDIUM | P3 |
| Buoyancy / SSR / cloud shadows / rain | LOW | HIGH | P3 |

## Replacement mapping — custom systems → Pro APIs

| Old custom behavior | File | Pro replacement |
|---------------------|------|-----------------|
| Teal→navy depth gradient | `createSeaWater.ts` FRAG | `water.color.{waterColor, absorptionColor}` (always on) |
| Rock-ring surf + pixel-bubble swash | `createSeaWater.ts` `setRocks` + `PIXEL_BUBBLES_GLSL` | `water.foam.shoreline` (auto at island coasts) |
| 2-sine wave normal + specular streak | `createSeaWater.ts` FRAG | `water.gerstner` + `water.waves` + `water.sparkle` |
| `uSkyTop`/`uHorizon` sky reflection + `horizonFade` | `createSeaWater.ts` + day/night writing water uniforms | `water.setSky(skyProvider)` + `water.fog` |
| Sun/moon glint + antipode moon swap | `createDayNightCycle.ts` glint block | Sky Pro real moon (`timeOfDay.moon*`) + provider sun sync |
| `samplePalette(phase)` sky/fog/light drift | `createDayNightCycle.ts` + `dayNightMath` | `sky.timeOfDay.time` (driven by server clock) + `sky.sun`/`sky.atmosphere` |
| Sky dome mesh + `setSkyTop` uniform | `createMondstadtWorld` ambience | `SkySystem.create` backdrops + `sky.applyTo` post composite |
| Lantern flicker / mood lights | `createDayNightCycle.ts` `updateLanternFlicker` | **Keep** — not a sky/water concern; unaffected by the swap |

> Note: Water Pro's `water.lighting.sunLight` is a real `THREE.DirectionalLight` it owns and overwrites each frame from the sky provider's sun. Decide whether it or the game's existing sun/shadow light is authoritative for scene shadows — do not drive both, or shadows fight (this is a migration integration decision, flagged for ARCHITECTURE/PITFALLS).

## Sources

- Water Pro v3.2.1 docs (`./pro/Three.js Water Pro v3.2.1/threejs-water-pro/docs/`): guide/{wake, spray, floating-objects, transparent-objects, water-masking, quality-levels, post-processing, presets, sky-pro-integration}; api/{water-system, wake, sun, color, sparkle, sss, foam, ocean-floor, rain, particles, waterline}. HIGH.
- Sky Pro v2.0.0 docs (`./pro/Three.js Sky Pro v2.0.0/threejs-sky-pro/docs/`): guide/{day-night-cycle, water-integration, tuning-performance}; api/{sky-system, time-of-day, sun, sky-provider}. HIGH.
- Reference wiring: both packages' `sky-pro-integration.md` / `water-integration.md` end-to-end demo code (post chain, update order, `createSkyProvider`, bloom). HIGH.
- Existing systems replaced: `src/game/world/createSeaWater.ts`, `src/game/systems/createDayNightCycle.ts`. HIGH.
- Milestone intent + constraints: `.planning/PROJECT.md`, `.planning/v0.4.0-alpha-WEBGPU-WATERPRO-HANDOFF.md`. HIGH.

---
*Feature research for: WebGPU ocean + sky (Water Pro v3.2.1 + Sky Pro v2.0.0) in a top-down pixel-filter game*
*Researched: 2026-07-28*
