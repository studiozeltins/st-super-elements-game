# Phase 1: Feasibility Spike - Pattern Map

**Mapped:** 2026-07-28
**Files analyzed:** 8 new/modified
**Analogs found:** 6 with a real in-repo analog / 8 total

> This is an **ISOLATED, throwaway spike**. There is no prior WebGPU/TSL code in this repo, so
> the strongest analogs split two ways: (1) the existing **WebGL** pipelines the spike must
> *reproduce/replace* (`createPixelRenderer.ts`, `terrain.ts`, `createSeaWater.ts`), and (2) the
> **vendored Pro docs** under `./pro/` which are the verbatim recipe for the new bootstrap code.
> The planner should treat the WebGL analogs as the source of the *look/logic to port* and the
> Pro docs as the source of the *wiring to copy*.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `waterpro-spike.html` (repo root) | config/entry | request-response (Vite entry) | `index.html` | role-match |
| `vite.config.ts` (modify) | config | build | `vite.config.ts` (current) | exact (in-place) |
| `src/spike/waterpro-spike.ts` | provider/bootstrap | event-driven (async rAF loop) | `pro/.../water-pro/docs/guide/sky-pro-integration.md` (verbatim recipe) + `createPixelRenderer.ts` render loop | recipe-match |
| `src/spike/beachSlice.ts` | world-builder | transform (sample → mesh) | `src/game/world/terrain.ts` `createTerrainMesh` + `src/game/world/createSeaWater.ts` mesh build | role-match |
| `src/spike/perfHud.ts` | utility | request-response (per-frame readout) | *(none — new)* | no analog |
| `src/game/engine/tsl/pixelFilterNode.ts` | engine (TSL post node) | transform (color+depth → pixelated) | `src/game/engine/createPixelRenderer.ts` (low-res target + blit) + `PixelationPassNode.js` | role-match / port |
| `src/game/engine/tsl/outlineNode.ts` | engine (TSL post node) | transform (depth → sun-rim) | `src/game/engine/createPixelRenderer.ts` fragment shader (`lin`/`jump`/`edge`) + `PixelationPassNode.js` `depthEdgeIndicator` | role-match / port |
| `src/vendor/threejs-{water,sky}-pro/` | build artifact (submodule) | file-I/O (vendored bundle) | *(none — copied `build/`)* | no analog |

## Pattern Assignments

### `src/game/engine/tsl/pixelFilterNode.ts` + `outlineNode.ts` (engine, TSL post nodes)

**Primary analog:** `src/game/engine/createPixelRenderer.ts` — this is the exact WebGL look to
reproduce in TSL (D-02, D-04). **Secondary analog:** `node_modules/three/examples/jsm/tsl/display/PixelationPassNode.js`
(built-in scaffolding for the node structure — port the bespoke rim into it, don't drop it in).

The load-bearing pixel-art logic to port lives in the blit fragment shader
(`createPixelRenderer.ts` lines 98-131). Three chunks the TSL nodes MUST reproduce:

**1. Linear-depth reconstruction** (lines 106-109) — the outline reads depth jumps. The research
says prefer `scenePass.getViewZNode()` over re-implementing this `lin()`, but this is the exact
math to match if `getViewZNode` is unavailable (assumption A1):
```glsl
float lin(vec2 uv) {
  float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}
```

**2. One-sided, sun-facing rim** (lines 117-128) — this is the game's signature, and is what
makes the built-in `PixelationPassNode` (symmetric 4-neighbour depth edges) NOT a drop-in. Only
the neighbour *toward the sun* is sampled, giving a rim on one side, colored a *lighter shade of
the base color* (not white):
```glsl
vec2 sdir = normalize(uSunScreen + vec2(1e-5, 1e-5));
float fwd = lin(vUv + sdir * uTexel * 1.4);
float jump = (fwd - c) / c;
float edge = (c < uFar * 0.7) ? step(uThreshold, jump) : 0.0;
vec3 lit = clamp(col * (1.0 + uEdgeStrength) + 0.05, 0.0, 1.0);
col = mix(col, lit, edge);   // LIGHTER shade underneath, not white
```
Uniform values to carry over as node uniforms (lines 83-86): `uEdge = 0xd6dae6`,
`uEdgeStrength = 0.95`, `uThreshold = 0.06`, `uSunScreen` fed per-frame from the sun's screen dir
(the game calls `setEdgeSunDir(x,y)`, lines 216-218).

**3. sRGB encode after the linear target** (lines 112-116) — CRITICAL and called out as a
historical dark-scene bug (Pitfall 5). In the WebGL path a raw `ShaderMaterial` blit had to
hand-encode linear→sRGB. On the TSL/`PostProcessing` path, **do NOT re-encode inside the node** —
let `PostProcessing` + renderer color management do it. Port the *intent* (match `master`
brightness), not this literal block:
```glsl
col = mix(col * 12.92, 1.055 * pow(max(col, vec3(0.0)), vec3(1.0/2.4)) - 0.055,
          step(vec3(0.0031308), col));
```

**Node-structure scaffolding from `PixelationPassNode.js`** — the low-res render-target-at-reduced-resolution
approach (`setSize` floors width/height by `pixelSize`, lines 292-301) maps directly to Shape A
(pixelate-whole-chain). The `depthEdgeIndicator` `Fn` (lines 129-139) shows the TSL idiom for
sampling depth neighbours (`sampleDepth(x,y)` via `_resolution.zw` texel offsets) — reshape its
4-neighbour symmetric sample into the single sun-facing sample from chunk 2:
```javascript
const sampleDepth = ( x, y ) => depthNode.sample( uvNodeDepth.add( vec2( x, y ).mul( this._resolution.zw ) ) ).r;
```

**Two candidate shapes (SPIKE-02, build BOTH behind `?shape=whole|final`):**
- **Shape A (pixelate-whole-chain):** render the whole scene into a low-res `pass`/target then
  nearest-upscale — mirrors `createPixelRenderer.ts` Pass 1+2 (lines 183-190: render to
  `worldTarget` at internal res, blit to canvas). Cheapest, closest to current look.
- **Shape B (final-pixelate):** full-res Water/Sky post, pixelate as the LAST node — mirrors
  `PixelationPassNode` (`{ minFilter: NearestFilter, magFilter: NearestFilter }`, line 244).

---

### `src/spike/beachSlice.ts` (world-builder, transform)

**Primary analog:** `src/game/world/terrain.ts` `createTerrainMesh` (lines 300-346).
**Secondary analog:** `src/game/world/createSeaWater.ts` mesh construction (lines 238-243).

D-03 requires a *representative slice* (sand + sea at real `getTerrainHeight`, rocks, grass patch),
not a bare plane, so the depth-outline has real edges to bite on.

**Import the pure height/color fns directly** (they are side-effect-free and safe to pull into the
spike without touching game state) — `terrain.ts` exports: `getTerrainHeight(x,z)`,
`getTerrainSlope`, `terrainColorAt`, `beachSandFactor`, `SEA_LEVEL = -0.8`, `ISLANDS`.
The city island (`ISLANDS[0]`) is the only one with a beach arc (`beachArc: 1.05`, faces `-x`,
lines 84-89) — sample the slice there so the sand+shoreline actually renders.

**Mesh-build pattern to copy** (`terrain.ts` lines 305-345) — per-vertex `getTerrainHeight` into a
`PlaneGeometry`, vertex colors from `terrainColorAt`:
```typescript
geometry.rotateX(-Math.PI / 2);
const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
for (let i = 0; i < positions.count; i++) {
  const x = positions.getX(i), z = positions.getZ(i);
  positions.setY(i, getTerrainHeight(x, z));
  const color = terrainColorAt(x, z, getTerrainHeight(x, z)); // → colors[]
}
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
```
The spike need NOT reproduce the full custom `patchTerrainShader` chain (that is Phase 3); a plain
`MeshStandardMaterial({ vertexColors: true, flatShading: true })` is enough to give the outline
depth discontinuities. **Note the sea in the slice is Water Pro, NOT `createSeaWater.ts`** — that
custom sea is the WebGL thing being replaced; use it only as reference for the SEA_LEVEL plane
placement (`mesh.rotation.x = -Math.PI/2; mesh.position.y = SEA_LEVEL;`, lines 239-240).

---

### `src/spike/waterpro-spike.ts` (bootstrap, event-driven async loop)

**Primary analog:** `pro/Three.js Water Pro v3.2.1/threejs-water-pro/docs/guide/sky-pro-integration.md`
(the verbatim TS+Vite recipe, lines 98-195) — follow it exactly, only adapting the camera to the
game's 45° tilt and the post chain to append the pixel node last.

**Async bootstrap order (MUST-follow, Pattern 1 / Anti-patterns):**
```typescript
import * as THREE from 'three/webgpu';         // NOT 'three' — Pro packages need the webgpu build
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { WaterSystem, getPresetParams } from '../vendor/threejs-water-pro';
import { SkySystem, PRESETS } from '../vendor/threejs-sky-pro';

const renderer = new THREE.WebGPURenderer();    // { forceWebGL: true } to measure the WebGL2 tier
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
renderer.toneMapping = THREE.ACESFilmicToneMapping;   // expose a toggle — may clash w/ flat palette
await renderer.init();                          // <-- read backend ONLY after this (anti-pattern)
const water = await WaterSystem.create(renderer, scene, camera, 'medium');
water.loadPreset(getPresetParams('blackFlag'));
const sky = await SkySystem.create({ renderer, camera, scene, quality: 'medium' });
await sky.applyPreset(PRESETS.partlyCloudy);
water.setSky(sky.createSkyProvider({ envMap: true }));  // ONE-CALL coupling; build ONCE
await renderer.compileAsync(scene, camera);
```

**Camera — adapt, do not copy the doc's `PerspectiveCamera(60, …, 20000)`.** Use the game's FOV/tilt
from `createPixelRenderer.ts` line 54 (`new THREE.PerspectiveCamera(45, 1, 0.1, 500)`) but extend
`far` per Pitfall 1 (500 clips the Pro ocean/sky; try 2000–50000) and record the chosen far in the
go/no-go artifact.

**Post chain — append the pixel node LAST** (sky-pro-integration.md lines 106-128 + Pattern 2):
```typescript
const postProcessing = new THREE.PostProcessing(renderer);
const scenePass = pass(water.scene, water.camera);
let out = scenePass.getTextureNode('output');
out = water.postProcessing.buildNode(scenePass, out);   // fog/underwater/sunshafts
out = sky.applyTo(out, scenePass);                       // clouds/god-rays (reads depth)
out = out.add(bloom(out, 0.5, 0.4, 0.85));               // lit-water bloom
out = pixelFilterNode(out, scenePass);                   // <<< salvage module, pixel identity LAST
postProcessing.outputNode = out;
```

**Frame loop — async, sky before water, `postProcessing.render()` NOT `renderer.render()`**
(sky-pro-integration.md lines 178-191):
```typescript
async function animate() {
  requestAnimationFrame(animate);
  sky.update(dt);
  await water.update(dt);        // MUST be awaited, AFTER sky, BEFORE render
  postProcessing.render();       // renderer.render() would skip the whole node graph
}
```

**Frame-loop render structure** also echoes `createPixelRenderer.ts` `render()` (lines 169-212):
matrix-update-once discipline (`scene.matrixWorldAutoUpdate = false; scene.updateMatrixWorld()`,
lines 179-180) is worth carrying if the spike shows CPU overhead (memory `threejs-cpu-overhead-traps`).

---

### `waterpro-spike.html` (entry) + `vite.config.ts` (modify)

**Analog for the HTML:** existing `index.html` (structure) + Pro doc `index.html` (Water basic-example
lines 59-85). The spike HTML is standalone — it does NOT mount React (`#root`/`main.tsx`); it loads
the vanilla spike entry:
```html
<body>
  <script type="module" src="/src/spike/waterpro-spike.ts"></script>
</body>
```

**`vite.config.ts` modification** — the current config (all 11 lines) already has the
`allowedHosts: ['elements.kingdom.lv']` + `host: true` that the spike needs (memory `vite-allowed-host`).
Add a second Rollup input for the spike entry so `vite build` emits it; keep the `react()` plugin
and the `server` block intact:
```typescript
export default defineConfig({
  plugins: [react()],
  server: { host: true, allowedHosts: ['elements.kingdom.lv'] },
  build: { rollupOptions: { input: { main: 'index.html', spike: 'waterpro-spike.html' } } },
});
```

---

### `src/spike/perfHud.ts` (utility) — NO ANALOG

New on-screen FPS + backend readout. No in-repo analog (the existing FPS harness is a Python
headless script, `scripts/fps_playtest.py`, which cannot run WebGPU compute — Pitfall 2). Backend
assertion source is verbatim from RESEARCH (SPIKE-03), read AFTER `renderer.init()`:
```typescript
const usingWebGPU = renderer.backend.isWebGPUBackend === true;  // valid only post-init
// water.backend => 'webgpu' | 'webgl';  water.spray === null on WebGL2
```
Render backend + FPS on-screen so screenshots self-document which backend produced each number.

---

## Shared Patterns

### Async WebGPU bootstrap + node post-processing
**Source:** `pro/.../water-pro/docs/guide/sky-pro-integration.md` (lines 130-191).
**Apply to:** `waterpro-spike.ts`.
Key invariants (also Anti-Patterns in RESEARCH): import `three/webgpu` (not `three`); `await
renderer.init()` before reading `.backend`; `postProcessing.render()` not `renderer.render()`;
`sky.update` before `await water.update`; build the `SkyProvider` once.

### getTerrainHeight sampling (pure, safe to import)
**Source:** `src/game/world/terrain.ts` (`getTerrainHeight`/`terrainColorAt`/`beachSandFactor`/`SEA_LEVEL`/`ISLANDS`).
**Apply to:** `beachSlice.ts`.
Deterministic, zero game-state — the one sanctioned game-code import (it is *read*, not modified;
respects "zero game code touched" since nothing in `src/game` imports the spike back).

### Pixel-art identity (the port target)
**Source:** `src/game/engine/createPixelRenderer.ts` (blit fragment shader lines 98-131; render
loop lines 169-212).
**Apply to:** `pixelFilterNode.ts` + `outlineNode.ts`.
The three load-bearing chunks: linear-depth reconstruction, one-sided sun-facing lighter rim,
sRGB/tone-mapping parity with `master` (do the last via `PostProcessing`, not a manual node encode).

### SPIKE-04 lit-water + pooled wake/spray (de-risk techniques)
**Source:** `pro/.../water-pro/docs/guide/wake.md` (lines 11-73) + RESEARCH Code Examples.
**Apply to:** `waterpro-spike.ts` (optional projectile-proxy section).
Pooled generators (≤16, memory-invariant REAC-01), horizontal motion only (`updateGenerator`,
Pitfall 4); `water.spray?.addEmitter(...)` optional-chained (null on WebGL2); emissive glow is an
ADDITIVE transparent overlay mesh (Water Pro has no `emissiveNode`).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/spike/perfHud.ts` | utility | request-response | No WebGPU-capable perf HUD exists; the repo's FPS harness (`scripts/fps_playtest.py`) is headless and can't run WebGPU compute (Pitfall 2). Build from the SPIKE-03 backend-assertion snippet. |
| `src/vendor/threejs-water-pro/` `threejs-sky-pro/` | build artifact | file-I/O | Vendored prebuilt `build/` copies (STCK-01), delivered via private submodule (D-01). Not authored code — produced by `npm run build:lib` inside `./pro`, copied per sky-pro-integration.md Step 3. Sky's `data/` dir is MANDATORY alongside `index.js`. |

## Metadata

**Analog search scope:** `src/game/engine/`, `src/game/world/`, repo-root `index.html` +
`vite.config.ts`, `node_modules/three/examples/jsm/tsl/display/`, `pro/**/docs/guide/`.
**Files scanned:** 7 read in full (createPixelRenderer, terrain, createSeaWater, vite.config,
index.html, water basic-example, sky-pro-integration, PixelationPassNode) + wake.md (partial).
**Pattern extraction date:** 2026-07-28
</content>
</invoke>
