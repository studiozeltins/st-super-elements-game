# Stack Research

**Domain:** Client-only world-ambiance polish for a Three.js browser game (v0.3.0-alpha "Living World")
**Researched:** 2026-07-13
**Confidence:** HIGH — every load-bearing claim verified against the installed `three@0.185.1` build in `node_modules` or the npm registry directly; web-sourced claims cross-checked (seam tier: MEDIUM).

## Bottom Line

**Zero new dependencies.** Every target feature maps to APIs already in the project: `three@0.185.1` built-ins (which is the **latest npm release** — published 2026-07-01, verified against registry.npmjs.org on 2026-07-13), the browser Web Audio API, and existing project seams (`audioCore`, grass `timeUniform`, `groundInfluence`, `lightPool`). The one capability that might have tempted a dependency — 2D/3D gradient noise for wildlife wander and gust fields — ships **inside the already-installed three package** as addons. Nothing to `pnpm add`.

## Recommended Stack

### Core Technologies (all already installed)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| three | ^0.185.1 (= latest) | Fog, hemisphere tint, instanced wildlife, camera | Already the project renderer; r185 is the current release, no upgrade exists. Fog/HemisphereLight/InstancedMesh/onBeforeCompile APIs unchanged in recent releases (recent churn is all WebGPURenderer/TSL, irrelevant to this WebGL pipeline) |
| Web Audio API | browser built-in | Procedural ambient beds, chirps, positional scaling | Same zero-asset synthesis approach as `pullSounds.ts`; all needed nodes (`AudioBufferSourceNode.loop`, `BiquadFilterNode`, `StereoPannerNode`, `GainNode`, `OscillatorNode`) are Baseline / universal |
| @types/three | ^0.185.0 | Types | Already aligned with three 0.185.x |

### Feature → Built-in API Map

| Feature | API (no dependency) | Integration seam |
|---------|--------------------|------------------|
| Wind-noise bed | `AudioBuffer` filled by leaky-integrator brown noise (`out = (last + 0.02*white)/1.02`, ×~3.5), looped via `AudioBufferSourceNode.loop = true`, shaped by `BiquadFilterNode` (lowpass) with `frequency`/gain modulated by `setTargetAtTime` gusts | New `createBrownNoiseLoop()` beside `createNoiseSource()` in `src/game/audio/audioCore.ts`. Buffer ≥ 2–4 s so the loop seam is inaudible |
| Bird chirps | `OscillatorNode` (sine) + `exponentialRampToValueAtTime` frequency sweeps + `jitter()` — literally the `pullSounds.ts` recipe with different envelopes | Reuse `clampGain`/`jitter`/`panned` from audioCore verbatim |
| Positional/proximity sounds (goliath grunts, rustle) | Existing `panned()` (`StereoPannerNode`) + a distance-scaled `GainNode`. **Not** `PannerNode`: HRTF panning costs real CPU and models 3D listener orientation the top-down camera doesn't have | `panned()` already takes screen-space pan; add a `distanceGain(dist, falloff)` helper |
| Distance fog, hemisphere-tinted | `THREE.Fog` — **already in the scene** (`createMondstadtWorld.ts:203`, `new THREE.Fog(0x8ecae6, 80, 300)`). Mutate `scene.fog.color` per frame — verified in the 0.185.1 build: `refreshFogUniforms` copies `fog.color` into the `fogColor` uniform on every render, no `needsUpdate` required | Lerp `scene.fog.color` toward the `HemisphereLight` sky color (`createMondstadtWorld.ts:112`) each frame from the day/night palette; preallocate the scratch `THREE.Color` |
| Shared wind phase | Plain shared uniform object `{ value: number }` — the exact pattern grass already uses (`timeUniform` in `createGrassField.ts`). Pass the same object reference into every patched material and read it from CPU-animated code (flags, smoke) | Advance once per frame in `createGame.ts`'s loop; hand the same object to the audio gust modulator so wind sound and grass sway share phase |
| Wildlife (butterflies/birds/fireflies) | `THREE.InstancedMesh` + `PlaneGeometry`; setup: `instanceMatrix.setUsage(THREE.DynamicDrawUsage)`; per frame: `setMatrixAt(i, m)` + `instanceMatrix.needsUpdate = true`; per-instance tint via `setColorAt` + `instanceColor.needsUpdate`. Wander noise: `SimplexNoise` / `ImprovedNoise` from `three/addons/math/*` — **verified present in the installed package** | Birds flush via the existing `groundInfluence` hook (player-sprint disturbance already computed); fireflies acquire glow lights from `lightPool` (quads carry the visual, only a handful of real lights) |
| Day/night lite | Pure math + `THREE.Color.lerpColors(a, b, t)` between preallocated palette keyframes; drive `HemisphereLight.color/groundColor/intensity`, sun `DirectionalLight` color/intensity (direction FIXED — respects the texel-snapped shadow basis), and `scene.fog.color` from one palette sampler. Phase = `(serverTimestampMicros / cycleMicros) % 1` from the already-subscribed world timestamp | Lanterns at night: `lightPool.acquire()` with long-lived handles (verify pool capacity budget); zero allocs if all Colors are preallocated |
| Camera lean / FOV kick | `camera.fov = base + kick; camera.updateProjectionMatrix()` — still the required call in r185; cost is one 4×4 rebuild (trivial). Lean: small roll on the camera rig; spring both with hand-rolled exponential smoothing (`v += (target - v) * (1 - exp(-k*dt))`). Skip `updateProjectionMatrix()` when \|fov − base\| < ε | Do last per PROJECT.md; keep amplitudes tiny (top-down = low motion-sickness risk, but lean > ~1.5° reads as broken horizon) |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| vitest 3.2.4 (existing) | Unit-test pure helpers (noise fill, palette sampler, wind phase, distance-gain curve) | Follow pure-helper discipline: palette lerp + brown-noise math are zero-import functions |
| Playwright playtest (existing harness) | End-of-phase visual/audio check | `scripts/fps_playtest.py` catches frame-cost regressions from the new per-frame instance updates |

## Installation

```bash
# Nothing. Zero new dependencies.
# Noise addons import from the already-installed package:
#   import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
#   import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Keep linear `THREE.Fog` (already in scene) | `THREE.FogExp2` | Only if the linear near/far band visibly bands on the fixed-distance top-down camera. Note: fog **type** is a compile-time define (`FOG_EXP2`, verified in the 0.185.1 shader chunks) — switching type at runtime recompiles every material. Pick one up front; tune color/near/far at runtime freely |
| Looped brown-noise `AudioBuffer` | `AudioWorkletNode` generating noise live | Only if you need runtime-parametric noise *spectra* (you don't — gusts are gain/filter modulation on a static bed). Worklet adds a second JS thread, a module file, and autoplay-policy edge cases for zero audible win |
| `StereoPannerNode` + distance gain | `PannerNode` (HRTF/equalpower) | Only for true 3D listener orientation (first-person). Top-down screen-space pan + proximity gain is the standard 2.5D pattern and matches the existing `panned()` helper |
| CPU `setMatrixAt` wildlife (tens of instances) | Vertex-shader flap/wander via instance attributes + `uTime` | If wildlife counts grow into hundreds+; wing flap in the vertex stage (per-instance phase attribute) is the first escalation, reusing the grass material-patch pattern |
| Hemisphere/sun/fog color lerp for grading | `EffectComposer` + LUT/color-grade pass | Only if a later milestone wants film-style grading; a full-screen pass interacts with the pixel-filter pipeline and costs a render target. Light-driven grading is free |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `pnpm add simplex-noise` (or `open-simplex`, `noisejs`) | Redundant — `SimplexNoise` + `ImprovedNoise` ship inside the installed three package (`three/addons/math/`), verified on disk | `three/addons/math/SimplexNoise.js` |
| three's `AudioListener` / `Audio` / `PositionalAudio` | Asset-playback wrappers around `PannerNode`; redundant with (and would fragment) the existing zero-asset `audioCore` context; `PositionalAudio` drags in HRTF panning | Extend `audioCore` |
| Tone.js / howler.js | Tone is a large synthesis framework duplicating ~40 lines of needed WebAudio; howler is asset-file playback — this project has zero audio assets by design | Hand-rolled nodes in `audioCore` |
| GSAP / tween.js / `maath` for camera micro-feel | A tween lib for two scalars (fov, lean) violates the zero-dep rule held across two milestones | Exponential smoothing in the game loop |
| A second `AudioContext` for ambience | Browsers cap concurrent contexts; `pullSounds.ts` already lazy-owns one (`src/ui/pullSounds.ts:12`) | Hoist the context singleton into `audioCore` (or export it from pullSounds) and hang a persistent `ambientBus` GainNode off it — also gives combat-vs-ambience ducking for free |
| Runtime `Fog` ↔ `FogExp2` swap or fog on/off toggling | `USE_FOG`/`FOG_EXP2` are program defines — toggling forces shader recompiles across the scene mid-play | Keep fog always on; animate `color`/`near`/`far` (uniforms, refreshed every render) |
| Moving the sun for day/night | Fights the texel-snapped shadow basis (locked in PROJECT.md) | Color/intensity drift only, direction fixed |

## Stack Patterns by Variant

**If wildlife instance counts stay ≤ ~100 (expected):**
- CPU wander + `setMatrixAt` each frame is fine; keep matrices/quats as preallocated scratch objects (no per-frame allocs).

**If a wildlife layer needs hundreds of instances:**
- Move flap/bob into the vertex stage via an instanced float phase attribute + the shared wind `timeUniform`; CPU then only writes matrices on wander-target changes.

**If any raw `ShaderMaterial` FX must respect fog** (patched built-ins are already covered):
- It needs `fog: true` in its constructor **plus** the `fog_pars_*`/`fog_vertex`/`fog_fragment` chunks and fog uniforms — built-ins get this free; raw shaders don't. Audit `createEffectSystem.ts` materials for horizon-distance FX; most close-range FX can skip fog entirely.

## Version Compatibility

| Package | Compatible With | Notes |
|-----------|-----------------|-------|
| three@0.185.1 | @types/three@0.185.0 | Already matched in package.json; keep the minor versions in lockstep |
| three@0.185.1 | vite@7.1.x | Current combo already building; `three/addons/*` resolves via the package `exports` map (verified in the installed package.json) — no vite config needed |
| Web Audio nodes used | All evergreen browsers | `StereoPannerNode`, `BiquadFilterNode`, looped `AudioBufferSourceNode` are Baseline; no polyfills |

## Key Verified Facts (for the planner)

1. **`scene.fog.color` is per-frame mutable for free** — `refreshFogUniforms` (three.module.js:14990, called per material render at :18724) does `fog.color.getRGB(uniforms.fogColor.value, …)` every frame. No `material.needsUpdate`.
2. **`onBeforeCompile` patches don't break fog** — fog lives in its own shader chunks (`fog_pars_fragment`, `fog_fragment`), separate from the chunks the grass material patches; `MeshLambertMaterial` has `fog: true` by default. The existing grass will fog correctly with zero changes.
3. **Fog type is a compile-time define** — `#ifdef FOG_EXP2` in the chunk source; choose Fog vs FogExp2 once.
4. **`SimplexNoise` / `ImprovedNoise` exist at `node_modules/three/examples/jsm/math/`** — importable as `three/addons/math/*`.
5. **three 0.185.1 is the newest release** (npm registry: 0.185.0 → 2026-06-25, 0.185.1 → 2026-07-01). No upgrade decision exists for this milestone.
6. **InstancedMesh dynamic path unchanged in r185**: `setUsage(DynamicDrawUsage)` once, `setMatrixAt` + `instanceMatrix.needsUpdate = true` per frame, `mesh.count` to cap visible instances.

## Sources

- npm registry (`registry.npmjs.org/three`) — latest version + release dates, fetched directly 2026-07-13 (HIGH: primary source)
- Installed `node_modules/three/build/three.module.js` @ 0.185.1 — `refreshFogUniforms`, fog shader chunks, `FOG_EXP2` define (HIGH: verified in shipped source)
- Installed `node_modules/three/examples/jsm/math/` — SimplexNoise/ImprovedNoise presence (HIGH: verified on disk)
- [threejs.org docs — InstancedMesh](https://threejs.org/docs/#api/en/objects/InstancedMesh) (seam tier: LOW-webfetch, corroborated by project's own working grass InstancedMesh usage)
- [MDN — StereoPannerNode](https://developer.mozilla.org/en-US/docs/Web/API/StereoPannerNode), [MDN — Web Audio advanced techniques](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques), [Noisehack — Generate noise with Web Audio](https://noisehack.com/generate-noise-web-audio-api/) (seam tier: MEDIUM-verified web)
- Project seams read directly: `src/game/audio/audioCore.ts`, `src/game/world/createGrassField.ts`, `src/game/world/createMondstadtWorld.ts` (fog + hemisphere already exist), `src/ui/pullSounds.ts` (AudioContext singleton), `package.json`

---
*Stack research for: v0.3.0-alpha Living World (client-only ambiance)*
*Researched: 2026-07-13*
