# Technology Stack

**Project:** super-elements — v0.4.0-alpha WebGPU Sky & Water
**Researched:** 2026-07-28
**Scope:** Only the NEW capability — WebGPU backend + TSL + vendoring Water Pro v3.2.1 and Sky Pro v2.0.0. The existing three/TS/Vite/pnpm stack is validated and unchanged.
**Overall confidence:** HIGH (every version, export name, and load path verified directly against the vendored `./pro` packages and installed `node_modules`).

## TL;DR

- **Nothing new to install for WebGPU/TSL.** `three@0.185.1` (already installed) ships the `three/webgpu` and `three/tsl` subpath entry points; `@types/three@0.185.0` (already installed) ships their type subpaths. Verified in `node_modules`.
- **Vendor the two Pro libs by copying their prebuilt `build/`** into `src/vendor/threejs-water-pro/` and `src/vendor/threejs-sky-pro/` (with Sky's `data/`). Do NOT alias to their `src/`.
- **Sky Pro loads cloud-noise at runtime** via `fetch(new URL("./data/"+name+".bin", import.meta.url))` — a *dynamic* path Vite cannot statically analyze. Dev works natively; the **build** needs a ~10-line inline Vite plugin to copy `data/` into `dist/assets/data/`.
- **The secure-context risk is smaller than the handoff feared:** `WebGPURenderer` auto-falls back to a **WebGL2 backend**, and both Pro libs ship WebGL2 paths. Plain-http LAN players still render (same TSL materials) — they lose WebGPU *performance*, not the whole scene. No dual-renderer code needed.

## Recommended Stack

### Core (already installed — DO NOT reinstall or change)

| Technology | Version | Purpose | Why / Verification |
|------------|---------|---------|--------------------|
| `three` | `0.185.1` | WebGPU renderer, TSL node system | `node_modules/three/package.json` `exports` has `"./webgpu" → build/three.webgpu.js` and `"./tsl" → build/three.tsl.js`. Both files exist in `build/`. Nothing extra to add. |
| `@types/three` | `0.185.0` | Types for `three/webgpu`, `three/tsl` | `exports["./webgpu"]` and `exports["./tsl"]` present. Vendored `.d.ts` files import `three/webgpu` — resolves cleanly under `moduleResolution: "bundler"`. |
| `vite` | `7.1.x` | Dev server + build | Serves the extra `.html` spike page and the vendored ESM as-is. |
| `typescript` | `~5.6.2` | Typecheck | `tsconfig.app.json` already uses `moduleResolution: "bundler"` — required for the `three/webgpu` subpath + directory-import resolution of the vendored libs. |
| `pnpm` | (repo) | Package manager | Repo root only. The Pro packages are NOT installed through pnpm (see vendoring). |

### Vendored (licensed — copied from `./pro`, NOT from npm)

| Library | Version | Peer `three` | Runtime assets | Import specifier |
|---------|---------|--------------|----------------|------------------|
| `threejs-water-pro` | `3.2.1` | `>=0.181.0` (repo 0.185.1 ✅) | **None** — foam textures are bundled/data-URL (`loadBuiltInFoamTexture`); no external files. Verified: no `import.meta.url` asset fetch in `build/index.js`. | `./vendor/threejs-water-pro` |
| `threejs-sky-pro` | `2.0.0` | `>=0.185.0` (repo 0.185.1 ✅ — **tight**, do not downgrade three) | **`data/*.bin`** cloud-noise volumes (`baseShape16/32/64.bin`, ~1 MB) loaded at runtime relative to `index.js`. Must ship next to the bundle. | `./vendor/threejs-sky-pro` |

> ⚠️ Sky Pro's `three` peer floor is exactly the repo's `0.185.1`. Any future three downgrade breaks it.

### New dev dependency (one small, optional)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@webgpu/types` | `^0.1.x` | Types for `navigator.gpu` / `GPUAdapter` in *our* feature-detect code | Only if you write `navigator.gpu` checks in TS. Add to `tsconfig.app.json` `"types"`. `skipLibCheck: true` means you don't need it for the vendored/three types, only for code you author. Alternatively read the backend off `renderer.backend` after `init()` and skip this entirely. |

No other packages are required. In particular there is **no** `vite-plugin-static-copy` in the recommended path — a tiny inline plugin (below) handles Sky's `data/` with zero new dependencies (matches the project's lean/perf ethos).

## Vendoring: recommended approach (concrete)

**Chosen: Option 1 — copy each prebuilt `build/` into `src/vendor/…`.**
Rejected: Option 3 (Vite alias to the packages' `src/index.ts`).

**Why copy `build/`, not alias to `src/`:**
- The `build/` output is a self-contained, `sideEffects: false` ESM bundle with bundled `.d.ts` — it drops straight into our Vite/TS graph with no transitive dev-deps.
- Aliasing to their `src/` would drag each package's full TypeScript source (and its own `@types/three`, eslint, tsx expectations) through **our** compiler and Vite, and their build scripts run under **npm**, colliding with our **pnpm-only** rule.
- A frozen vendored bundle is reproducible and immune to their `npm install && npm run build:lib` step drifting. The handoff and both packages' own docs recommend copying `build/`.

**One-time build of the bundles (inside `./pro`, using their own npm — independent of repo pnpm):** only needed if you patch their `src/`. The shipped `./pro/**/build/` is already built, so you can copy it directly.

**Target layout (import specifier = the directory; Vite resolves `index.js`, TS resolves `index.d.ts`):**

```
src/vendor/
├── threejs-water-pro/
│   ├── index.js
│   ├── index.js.map
│   └── index.d.ts
└── threejs-sky-pro/
    ├── index.js
    ├── index.js.map
    ├── index.d.ts
    └── data/            ← baseShape16.bin, baseShape32.bin, baseShape64.bin (MUST copy)
```

```ts
import { WaterSystem, getPresetParams } from "./vendor/threejs-water-pro";
import { SkySystem, PRESETS } from "./vendor/threejs-sky-pro";
```

### The Sky `data/` load path — the one real gotcha

`build/index.js` resolves noise at runtime as (verified by disassembling the minified bundle):

```js
fetch(new URL("./data/" + shapeName + ".bin", import.meta.url))
```

Because the path is **concatenated** (not a static string literal), Vite/Rollup's `new URL('literal', import.meta.url)` asset handling does **not** pick it up. Behaviour per mode:

- **Dev (`vite`):** `import.meta.url` → `/src/vendor/threejs-sky-pro/index.js`, so `./data/*.bin` → `/src/vendor/threejs-sky-pro/data/*.bin`, which Vite's dev server serves from disk. **Works with no config.**
- **Build (`vite build`):** the vendored code lands in a hashed chunk under `dist/assets/`, so `import.meta.url` → `dist/assets/…`, and `./data/*.bin` → `dist/assets/data/*.bin` — which Vite does NOT emit. **Broken unless you copy `data/` there.**

**Fix — inline plugin in `vite.config.ts` (no new dependency):**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-sky-pro-noise',
      apply: 'build',
      // dist/assets/data/ is where import.meta.url (the hashed chunk) resolves ./data/
      closeBundle() {
        cpSync(
          resolve(__dirname, 'src/vendor/threejs-sky-pro/data'),
          resolve(__dirname, 'dist/assets/data'),
          { recursive: true },
        );
      },
    },
  ],
  server: {
    host: true,
    allowedHosts: ['elements.kingdom.lv'],
  },
});
```

- It is directory-relative (`assets/data`), so it is **hash-independent** — the chunk name doesn't matter.
- Packaged alternative if preferred: `vite-plugin-static-copy` (verify its Vite 7 peer range first). The inline plugin avoids that dependency and the peer-range risk.
- Fallback if a future Vite splits the sky code into a nested chunk dir: also mirror `data/` into `public/data/` — cheap insurance, harmless.

**tsconfig:** no change required. `tsconfig.app.json` already has `moduleResolution: "bundler"` (resolves the `three/webgpu` subpath and the directory import to `index.d.ts`) and `include: ["src"]` (covers `src/vendor`). `allowJs` is off, so the vendored `index.js` is never type-checked — types come from the sibling `index.d.ts`. `skipLibCheck: true` absorbs any minor type friction in the vendored declarations.

### Licensing / git decision (flag for requirements)

`./pro` is gitignored (licensed, never commit). But `src/vendor/**` under the copy approach **would** be committed by default. The deploy pipeline (`.31`: git pull → build) needs the vendored files present at build time. Pick one, up front:
- **Commit `src/vendor/**` into the private repo** (simplest; the repo is `private: true`, single-owner) — accept the licensed bundles live in git history. **Recommended** given the pull-then-build deploy.
- OR gitignore `src/vendor/**` and add a deploy step that copies from a licensed source onto `.31` — more moving parts, and breaks a clean `git pull && build`.

## Exact public entry points (verified against `build/index.d.ts`)

### Water Pro `3.2.1` — `from "./vendor/threejs-water-pro"`

Exports used by the integration (all confirmed in `build/index.d.ts`): `WaterSystem`, `Sky`, `getPresetParams`, `PRESETS`, `applyPresetToParams`, `QUALITY_LEVELS`, `getQualityFeatures`, `type QualityLevel`, `type WaterPreset`, `type PresetName`, `SkyProvider` (type), plus optional systems `BuoyancySystem`, `WakeSystem`, `SpraySystem`, `RainSystem`, `OceanFloor`.

`WaterSystem` public API (from `WaterSystem.d.ts`):

```ts
static create(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  quality?: QualityLevel,          // 'low' | 'medium' | 'high' | 'ultra'
  options?: WaterSystemOptions,
): Promise<WaterSystem>;

get scene(): THREE.Scene;          // pass(water.scene, water.camera) for post
get camera(): THREE.PerspectiveCamera;
get lighting(): Lighting;          // lighting.sun.direction = sun vector
get postProcessing(): PostProcessingPipeline;  // .buildNode(scenePass, out)
get wake(): WakeSystem;            // wake.addGenerator(mesh, opts) → id; wake.removeGenerator(id)
readonly buoyancy: BuoyancySystem; // buoyancy.addObject(mesh, opts)
readonly masking: WaterMasking;    // masking.add(mesh) / masking.remove(mesh)

setSky(sky: SkyProvider | null): void;   // ← Sky Pro plugs in here
loadPreset(preset: PresetName | WaterPreset): void;
update(deltaTime: number): Promise<void>;         // await each frame, BEFORE post.render()
resize(width?: number, height?: number): void;
setQualityLevel(quality: QualityLevel, params: WaterSceneParams): Promise<void>; // rebuild post after
```

### Sky Pro `2.0.0` — `from "./vendor/threejs-sky-pro"`

Exports (from `build/index.d.ts`): `SkySystem`, `SunDriver`, `TimeOfDay`, `Atmosphere`, `Sun`, `Clouds`, `GodRays`, `PRESETS`, `SkyProvider` (type), `NightSkyPanorama`, `BUNDLED_MOON_TEXTURE_URL`, `QUALITY_LEVELS`, `RenderLayer`, `equirectUVFromDir`.

`SkySystem` public API (from `SkySystem.d.ts`):

```ts
static create(config: {
  renderer: THREE.WebGPURenderer;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;              // backdrop meshes auto-added here
  quality?: QualityLevel;          // default 'high'
  godRays?: boolean;
  timeOfDay?: TimeOfDayParams;
  nightSky?: NightSkyPanoramaOptions;  // { texture } — else night renders BLACK
}): Promise<SkySystem>;

readonly atmosphere: Atmosphere;
readonly sun: Sun;                 // sun.setFromAngles(elevationDeg, azimuthDeg)
readonly clouds: Clouds;
readonly godRays: GodRays;
readonly timeOfDay: TimeOfDay;     // ← the dynamic day/night clock (see below)

update(dt: number): void;                       // call BEFORE water.update
applyTo(sceneColor, scenePass): Node;           // splice into post AFTER water's node
applyPreset(preset: SkyParams): Promise<void>;
createSkyProvider(options?: { envMap?: boolean | SkyEnvironmentOptions }): SkyProvider; // → water.setSky
resize(width: number, height: number): void;
setQualityLevel(level: QualityLevel, overrides?): Promise<void>;
```

**Correction to the handoff's mental model of the day/night driver:** the *public* clock is `sky.timeOfDay`, not `SunDriver`. `SunDriver` is exported but is owned internally by `SkySystem` (a private `_sunDriver`). Drive day/night through:

```ts
sky.timeOfDay.time.value = 0.5;                  // 0=midnight, .25=sunrise, .5=noon, .75=sunset
sky.timeOfDay.autoAdvanceSecondsPerDay = 600;    // or let sky.update(dt) advance it; 0 = paused
sky.timeOfDay.latitude = 60; sky.timeOfDay.azimuth = 135;
```

Feed the existing LAN-shared server clock into `timeOfDay.time.value` each frame (map server timestamp → 0..1), and set `autoAdvanceSecondsPerDay = 0` so the server remains authoritative — this replaces `createDayNightCycle.ts` cleanly.

### The wiring (one call, verified in both packages' integration guides)

```ts
sky.update(dt);                                    // 1. sky first
await water.update(dt);                             // 2. then water samples this frame's sky
water.setSky(sky.createSkyProvider({ envMap: true }));  // once at setup; envMap:true = cloud reflections
```

Post chain order (both guides agree): `pass(water.scene, water.camera)` → `water.postProcessing.buildNode(scenePass, out)` → `sky.applyTo(out, scenePass)` → your pixel-filter/outline TSL → bloom/tone-map. Both nodes read the scene pass depth, so fog/clouds/god-rays composite against geometry.

## WebGPU / secure-context reality

**Support (from both installation docs):** Chrome/Edge 113+, Safari 18+ (Sky says Safari 26+), Firefox 141+ (Nightly for Water). `navigator.gpu` requires a **secure context**: `https://` or `http://localhost` / `127.0.0.1`. Plain-http LAN origins (`http://192.168.1.32`) have **no** `navigator.gpu`.

**Why this is NOT the milestone-killer the handoff worried about:**
- `WebGPURenderer` **automatically falls back to a WebGL2 backend** when WebGPU is unavailable (stated in both installation docs).
- Water Pro ships WebGL2 code paths — `index.d.ts` exports `WebGLWaveSimulation` and has `simulation/waves/webgl` + `wake/webgl` folders. Sky Pro's install doc: "runs on both backends."
- **TSL node materials compile to both backends.** So the pixel-filter/outline port to TSL and the 17 shader ports run on WebGL2 too — the *same* code, one pipeline.
- Net: plain-http LAN players still see water + sky + pixel filter via WebGL2; they lose WebGPU compute *performance* (FFT/SSR tiers), not the scene. This removes the need for a "force https everywhere or keep the old WebGL water" fork.

**Runtime feature-detect (know which backend you got, to pick a quality tier):**

```ts
const renderer = new THREE.WebGPURenderer();
await renderer.init();                              // async — App bootstrap becomes async
const onWebGPU = (renderer.backend as any)?.isWebGPUBackend === true;
// pick water/sky quality from onWebGPU + a quick FPS probe; do NOT branch renderers.
```

Optional pre-check before constructing: `const webgpuOK = !!navigator.gpu && !!(await navigator.gpu.requestAdapter());` (needs `@webgpu/types` for TS, or `// @ts-expect-error`).

**Dev config:**
- `localhost` dev over http: WebGPU works (localhost is a secure context). No change.
- To exercise **real WebGPU over LAN**, serve https (Vite `server.https`) or launch Chrome with `--enable-unsafe-webgpu --unsafely-treat-insecure-origin-as-secure=http://192.168.1.32:5173`. `elements.kingdom.lv` is https → WebGPU works there already.
- Validation gotcha (from handoff, still true): headless Playwright + SwiftShader will not run WebGPU compute — validate with headed Chrome or user screenshots.

## What NOT to add

| Do NOT | Why |
|--------|-----|
| `pnpm add` any separate WebGPU/TSL three build (`three-webgpu`, `three/examples` copies) | `three@0.185.1` already exports `three/webgpu` + `three/tsl`. Verified. |
| Install `threejs-water-pro` / `threejs-sky-pro` from npm | Licensed, not on npm. Vendor from `./pro` `build/`. |
| Run `pnpm install` inside `./pro`, or route the Pro build through pnpm | Their build uses **npm**; and the shipped `build/` is already compiled — copy it directly. Only re-run `npm run build:lib` (with their npm) if you patch their `src`. |
| Alias `threejs-*-pro` → their `src/index.ts` (Option 3) | Drags their full TS source + dev-deps through our compiler/Vite and collides with pnpm-only. Copy `build/` instead. |
| Add a second/parallel `WebGLRenderer`, a WebGL-fallback shim, or a dual pipeline | `WebGPURenderer` + TSL already covers the WebGL2 fallback. One renderer, one material path. |
| Keep any `THREE.ShaderMaterial` / `onBeforeCompile` GLSL path "as a fallback" | `WebGPURenderer` ignores raw GLSL; the 17 shaders MUST become TSL (that's phase work, not a stack addition). No dead GLSL left behind (project rule). |
| Globally alias `three` → `three/webgpu` in Vite/tsconfig | Breaks plain `three` type/runtime imports elsewhere. Import `three/webgpu` explicitly only where the WebGPU scene lives. |
| Add `@react-three/fiber` / `drei` | Game renders with vanilla three; keep it. |
| Add `vite-plugin-static-copy` (unless you want it) | The inline `closeBundle` copy covers Sky's `data/` with zero deps and no Vite-7 peer-range risk. |
| Add a starmap package | Night sky needs an equirectangular starmap **asset** (public-domain NASA maps listed in Sky docs), passed as `nightSky.texture` — an asset decision, not a dependency. Without it, night renders black (acceptable if the cycle keeps the sun up). |

## Installation / setup summary

```bash
# 1. Nothing to install for WebGPU/TSL — three@0.185.1 + @types/three@0.185.0 already present.

# 2. (Optional) types for navigator.gpu feature-detect
pnpm add -D @webgpu/types      # then add "@webgpu/types" to tsconfig.app.json "types"

# 3. Vendor the licensed bundles (copy from ./pro build/):
#    src/vendor/threejs-water-pro/  <- ./pro/Three.js Water Pro v3.2.1/threejs-water-pro/build/{index.js,index.js.map,index.d.ts}
#    src/vendor/threejs-sky-pro/    <- ./pro/Three.js Sky Pro v2.0.0/threejs-sky-pro/build/{index.js,index.js.map,index.d.ts,data/}

# 4. Add the inline copy-sky-pro-noise plugin to vite.config.ts (see above).

# 5. Decide git policy for src/vendor/** (commit into private repo — recommended for the pull+build deploy).
```

## Sources

- Vendored packages (authoritative, read directly): `./pro/**/build/index.d.ts`, `WaterSystem.d.ts`, `SkySystem.d.ts`, both `package.json`, and disassembled `build/index.js` (Sky `new URL("./data/"+name+".bin", import.meta.url)`; Water = no external asset fetch). Confidence HIGH.
- Package docs: Water `docs/guide/{installation,quality-levels,sky-pro-integration}.md`; Sky `docs/guide/{installation,basic-example,water-integration,day-night-cycle}.md`. Confidence HIGH.
- Installed toolchain: `node_modules/three@0.185.1` and `@types/three@0.185.0` `exports` maps (`./webgpu`, `./tsl` present); `tsconfig.app.json`; `vite.config.ts`; `package.json`. Confidence HIGH.
- Project handoff: `.planning/v0.4.0-alpha-WEBGPU-WATERPRO-HANDOFF.md`, `.planning/PROJECT.md`. Confidence HIGH (corrected the `SunDriver` vs `sky.timeOfDay` public-API detail and the WebGL2-fallback risk).
</content>
