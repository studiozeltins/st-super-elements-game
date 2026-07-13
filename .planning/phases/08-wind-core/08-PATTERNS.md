# Phase 8: Wind Core - Pattern Map

**Mapped:** 2026-07-14
**Files analyzed:** 9 (5 new, 4 modified)
**Analogs found:** 9 / 9 (all files have an in-repo analog; only the gust-envelope math itself is novel — covered by RESEARCH.md Pattern 3)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/game/systems/windMath.ts` (NEW) | pure-helper utility | transform (pure functions) | `src/game/systems/debrisMath.ts` | exact |
| `src/game/systems/__tests__/windMath.test.ts` (NEW) | test | — | `src/game/systems/__tests__/debrisMath.test.ts` | exact |
| `src/game/systems/createWind.ts` (NEW) | system factory (uniform provider) | per-frame update, uniform-by-reference | `src/game/systems/createGroundInfluence.ts` | exact (contract), role-match (internals are simpler) |
| `src/game/systems/createSmokeColumns.ts` (NEW) | system factory (instanced pool) | per-frame CPU pool → GPU instanceMatrix | `src/game/systems/createDebrisSystem.ts` | exact |
| `src/game/world/assets/createCampFlag.ts` (NEW) | asset factory | build-once static geometry + shader sway | `src/game/world/assets/createCampfire.ts` (factory shape) + `createGrassField.ts` (shader patch) | exact (two-source composite) |
| `src/game/world/createGrassField.ts` (MOD) | world subsystem | GPU vertex sway | itself (extraction refactor) | exact |
| `src/game/world/assets/createCanopyTree.ts` (MOD) | asset factory | build-once + shader sway | `createGrassField.ts` material pattern (pooled, patched) | role-match |
| `src/game/world/createMondstadtWorld.ts` (MOD) | world composition | build-once + per-frame update | itself (options threading + camp loop already exist) | exact |
| `src/game/createGame.ts` (MOD) | bootstrap/wiring | request-per-frame loop | itself (perfFlags + system construction + `frame()` conventions) | exact |

## Pattern Assignments

### `src/game/systems/windMath.ts` (pure-helper utility)

**Analog:** `src/game/systems/debrisMath.ts` (the pure-helper twin discipline: zero imports, exported constants, exported types, doc comment stating WHY it is pure)

**File-header + constants pattern** (`debrisMath.ts:1-23`):
```typescript
/**
 * Pure physics for the cube-debris pool — integrable without THREE so the
 * bounce/expiry rules are unit-testable.
 */
export interface DebrisParticle { x: number; y: number; /* ... */ active: boolean; }

export const DEBRIS_GRAVITY = 18;
export const DEBRIS_RESTITUTION = 0.4;
```
Copy this shape exactly: `windMath.ts` has NO imports (not even THREE), exports `SWAY`/`GUST`/`WANDER` constant objects (`as const`) and pure functions (`sampleWind`, `gustEnvelope`, `windAngle`, plus the GLSL-snippet generators). RESEARCH.md "Code Examples → windMath pure-helper" gives the exact function bodies.

**Pure-function pattern** (`debrisMath.ts:26-48`): plain function, mutates/computes from arguments only, doc comment states the contract in one line:
```typescript
/** Integrates one particle; bounces off groundY; returns false when expired. */
export function stepDebris(particle: DebrisParticle, deltaSeconds: number, groundY: number): boolean {
```

**Novel content (no analog):** the gust envelope (product of 3 incommensurate sines), retarded-time front, and wander sum have no in-repo precedent — use RESEARCH.md Pattern 3 verbatim as the reference implementation.

---

### `src/game/systems/__tests__/windMath.test.ts` (test)

**Analog:** `src/game/systems/__tests__/debrisMath.test.ts`

**Imports + structure pattern** (`debrisMath.test.ts:1-9, 31-38`):
```typescript
import { describe, expect, it } from 'vitest';
import { DEBRIS_GRAVITY, /* ... */, type DebrisParticle } from '../debrisMath';

describe('stepDebris', () => {
  it('applies gravity and moves the particle', () => {
    const particle = makeParticle();
    stepDebris(particle, 0.1, 0);
    expect(particle.vy).toBeLessThan(0);
```
Copy: relative import from `../windMath`, one `describe` per exported function, behavioral assertions (bounds, monotonicity) rather than exact-value pins — matches RESEARCH.md's guidance that constants are playtest-tunable but the behavioral envelope (peak cadence 30–60s, non-uniform gaps, wander ≤ deg/min bound, envelope ∈ [0,1], rigid front translation, strength=0 kill) is pinned. Runner: `pnpm vitest run src/game/systems/__tests__/windMath.test.ts` — no config needed, `__tests__/*.test.ts` is auto-discovered.

---

### `src/game/systems/createWind.ts` (system factory, uniform provider)

**Analog:** `src/game/systems/createGroundInfluence.ts` — THE uniform-object-by-reference contract this module must replicate.

**Uniform contract + doc pattern** (`createGroundInfluence.ts:23-34`):
```typescript
/**
 * IMPORTANT: the target ping-pongs every frame, so consumers must hold the
 * shared `textureUniform` OBJECT (its .value is swapped internally) — caching
 * `.value`/`.texture` directly reads a stale frame forever.
 */
export interface GroundInfluenceUniforms {
  textureUniform: { value: THREE.Texture };
  /** (minX, minZ, 1/size, 1/size) for world→UV in consuming shaders. */
  boundsUniform: { value: THREE.Vector4 };
}
```
Copy: a separate exported `WindUniforms`-style interface (so `createGrassField`/asset files can type only the uniforms, exactly like `GroundInfluenceUniforms` is imported standalone at `createGrassField.ts:2`), plus a full `Wind` interface extending it with `update`/`sampleWind`/`sampleGust`/`getGustEnvelope` (API shape in RESEARCH.md Pattern 1). Include the same style of IMPORTANT doc comment stating the hold-the-object rule.

**Factory + closure-state pattern** (`createGroundInfluence.ts:142-155, 263-305`):
```typescript
export function createGroundInfluence(resolution: number): GroundInfluence {
  const textureUniform = { value: front.texture as THREE.Texture };
  const boundsUniform = { value: new THREE.Vector4(/* ... */) };
  // ...
  return {
    textureUniform,
    boundsUniform,
    update(renderer, deltaSeconds) { /* mutates .value in place */ },
    dispose() { /* ... */ },
  };
}
```
Copy the closure-factory shape. `update(dt)` mutates `timeUniform.value += dt` and `directionUniform.value.set(cosθ, sinθ)` in place — never re-create the Vector2 (same rule as the ping-pong texture swap at `:301`, `textureUniform.value = front.texture`, which reassigns `.value`, never the object). `strengthUniform.value` is set once from the `?nowind` flag at construction.

**Delta source:** the clamped delta already exists — `createGame.ts:1306`:
```typescript
const deltaSeconds = Math.min(0.05, (frameTime - lastFrameTime) / 1000 || 0.016);
```
Wind receives this via `wind.update(deltaSeconds)`; it never reads clocks itself.

---

### `src/game/systems/createSmokeColumns.ts` (instanced pool system)

**Analog:** `src/game/systems/createDebrisSystem.ts` — the sanctioned fixed-pool InstancedMesh system, scene-root, scratch objects.

**Imports + interface pattern** (`createDebrisSystem.ts:1-20`):
```typescript
import * as THREE from 'three';
import { acquireDebrisSlot, debrisScale, stepDebris, type DebrisParticle } from './debrisMath';

export interface DebrisSystem {
  spawn(/* ... */): void;
  update(deltaSeconds: number): void;
  dispose(): void;
}
```
Smoke mirrors this but takes `wind: Wind` and fire anchors at construction; `update(deltaSeconds, playerX, playerZ)` per D-11.

**Pool + mesh setup pattern** (`createDebrisSystem.ts:22, 30-60`):
```typescript
const MAX_DEBRIS = 96;
// ...
const pool: DebrisParticle[] = Array.from({ length: MAX_DEBRIS }, () => ({ /* zeroed fields */ }));
const mesh = new THREE.InstancedMesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshLambertMaterial(),
  MAX_DEBRIS
);
mesh.frustumCulled = false;
mesh.castShadow = false;
mesh.receiveShadow = false;
const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
for (let index = 0; index < MAX_DEBRIS; index += 1) {
  mesh.setMatrixAt(index, zeroMatrix);
  mesh.setColorAt(index, new THREE.Color(1, 1, 1));
}
scene.add(mesh);
```
Copy all of it: fixed `POOL_SIZE` const, plain-object pool, Box+Lambert InstancedMesh, `frustumCulled = false`, no shadows, zero-scale matrix for hidden slots, added at SCENE root (never inside the frozen `world.group`). Add `mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)` (debris predates that guidance; RESEARCH.md Pitfall 5 requires it here).

**Scratch-objects + per-frame update pattern** (`createDebrisSystem.ts:62-67, 100-121`):
```typescript
const shade = new THREE.Color();
const matrix = new THREE.Matrix4();
const rotation = new THREE.Euler();
const quaternion = new THREE.Quaternion();
const positionVector = new THREE.Vector3();
const scaleVector = new THREE.Vector3();
// ...
update(deltaSeconds) {
  let anyActive = false;
  for (let index = 0; index < MAX_DEBRIS; index += 1) {
    const particle = pool[index];
    if (!particle.active) continue;
    anyActive = true;
    // ... integrate, then:
    matrix.compose(positionVector.set(/*...*/), quaternion.setFromEuler(rotation), scaleVector.set(scale, scale, scale));
    mesh.setMatrixAt(index, matrix);
  }
  if (anyActive) mesh.instanceMatrix.needsUpdate = true;
},
```
Copy: module/closure-level scratch objects, early-continue on inactive, `needsUpdate` only when something moved. Puff lifecycle math (rise, drift = `wind.sampleWind`/`sampleGust`, stepped scale/color tiers) is new logic — but keep it in the same pure-helper style if it grows (a `smokeMath` split is optional; debris did split).

**Fire anchors** (`src/game/world/camps.ts:29`): `getCampSites(): CampSite[]` (`{ x, z, archetypeId }`) + `world.getGroundHeight(x, z)` once at construction. Do NOT traverse the world group — anchors come from data, not the scene graph.

**Dispose pattern** (`createDebrisSystem.ts:122-127`):
```typescript
dispose() {
  scene.remove(mesh);
  mesh.geometry.dispose();
  (mesh.material as THREE.Material).dispose();
},
```

---

### `src/game/world/assets/createCampFlag.ts` (asset factory + shader patch)

**Analog A (factory shape):** `src/game/world/assets/createCampfire.ts`

**Imports + factory signature** (`createCampfire.ts:1-12, 34-36`):
```typescript
import * as THREE from 'three';
import type { SeededRandom, WorldAsset } from './types';
import { lambert, randomBetween, randomIntBetween } from './assetHelpers';

const STONE_COLOR = 0x5a6678;
// ...
export function createCampfire(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
```
Copy: hex-color consts at top, `(random: SeededRandom, ...) => WorldAsset` returning `{ group }` (flag adds a `wind` uniforms param — precedent for extra params is the options threading, see `createGrassField` below). `WorldAsset` may include `obstacles?: AssetObstacle[]` (`types.ts:22-36`) if the pole should block movement — a thin pole likely omits it, matching flowers/bushes.

**Analog B (cloth shader patch):** grass material pattern — see Shared Pattern "onBeforeCompile patch" below. Cloth specifics (subdivided `PlaneGeometry(w, h, ~8, ~3)`, phase-along-length flap GLSL) come from RESEARCH.md Pattern 5. One pooled cloth material for ALL flags (module-level lazy singleton — see the pooling note under `createCanopyTree.ts`), `customProgramCacheKey = () => 'campFlag'`, `castShadow = false`.

**Registration:** add the export to `src/game/world/assets/index.ts` (barrel — see `createMondstadtWorld.ts:9-24` importing from `./assets`).

---

### `src/game/world/createGrassField.ts` (MOD — extraction source)

**Analog:** itself. Three surgical changes:

**1. Options gain wind; local clock DIES** (current code `createGrassField.ts:141-148, 182-186`):
```typescript
export function createGrassField(options: {
  bladeCount: number;
  influence: GroundInfluenceUniforms;
  scorch: ScorchMapUniforms;
}): GrassField {
  const group = new THREE.Group();
  const timeUniform = { value: 0 };                    // ← DELETE
  const material = createGrassMaterial(options.influence, options.scorch, timeUniform);
  // ...
    update(deltaSeconds) {
      timeUniform.value += deltaSeconds;               // ← DELETE (update() likely deleted whole)
    },
```
`options` gains `wind` (the uniforms interface from `createWind.ts`); `createGrassMaterial` receives `options.wind.timeUniform` in place of the local object. Per the no-legacy rule, if `update()` becomes empty, delete the method from the `GrassField` interface (`:16-20`) AND its call at `createMondstadtWorld.ts:447`.

**2. Uniform hookup is a one-line swap** (`createGrassField.ts:95-99`):
```typescript
shader.uniforms.uTime = timeUniform;                       // ← becomes options.wind.timeUniform
shader.uniforms.uInfluenceMap = influence.textureUniform;  // pattern: uniform OBJECT by reference
```
Add `shader.uniforms.uWindDir` / `shader.uniforms.uWindStrength` the same way.

**3. Sway GLSL — constants move to windMath, gust term multiplies** (`createGrassField.ts:113-122`, exact current text):
```glsl
vec3 transformed = vec3(position);
vec4 bladeOrigin = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
float heightFactor = position.y * ${(1 / BLADE_HEIGHT).toFixed(4)};
// Wind: two-octave sway, phase from world position so gusts roll across the field.
float sway = sin(uTime * 1.7 + bladeOrigin.x * 0.35 + bladeOrigin.z * 0.25)
           + 0.4 * sin(uTime * 3.3 + bladeOrigin.z * 0.7);
transformed.xz += vec2(0.85, 0.55) * sway * 0.09 * heightFactor;
```
Constants `1.7 / 0.35 / 0.25 / 3.3 / 0.7 / 0.4 / 0.85 / 0.55 / 0.09` move VERBATIM into `windMath.ts` `SWAY` and get template-interpolated back with `.toFixed(4)` — the interpolation precedent is `${(1 / BLADE_HEIGHT).toFixed(4)}` at `:118`. Gust layers multiplicatively: `* (1.0 + uWindStrength * ${GUST_GAIN} * gust)` where the envelope rests at 0 (WIND-01 bit-identical between gusts). Keep the fixed sway axis `vec2(0.85, 0.55)` — only gust travel direction uses `uWindDir` (the zero-regression discretion pick, per RESEARCH Pattern 2).

---

### `src/game/world/assets/createCanopyTree.ts` (MOD — pooled patched cap materials)

**Analog (counter-pattern to remove):** `assetHelpers.ts:4-6` — `lambert()` allocates per call:
```typescript
export function lambert(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color });
}
```
Current cap construction (`createCanopyTree.ts:33-46`) calls `lambert(canopyColors[...])` per cap — 16–24 material instances across 8 trees. Replace with a module-level pooled map: one patched material per canopy color (`0xe8722f`, `0xd8621f`, `0x4f9147`, `0x58a24f` — consts at `:6-9`), lazily created with the wind uniforms. The trunk (`:16-19`) keeps plain `lambert(TRUNK_COLOR)` — rigid, unpatched.

**Analog (the patch itself):** grass material — see Shared Pattern "onBeforeCompile patch". Distinct key required:
```typescript
material.customProgramCacheKey = () => 'canopySway';   // NOT 'grassField' — Pitfall 3
```
Height-weighted world-space displacement GLSL comes from RESEARCH.md Pattern 4 (`modelMatrix * vec4(position,1.0)` world height, valid under frozen matrices because build-time matrices never change). Known accepted limitation to state in the plan: shadows do not sway (depth pass ignores `onBeforeCompile` surface patches).

**Wiring gotcha:** `createCanopyTree(random)` is invoked through the scatter table (`createMondstadtWorld.ts:385` — `{ create: createCanopyTree, count: 8, ... }`), so the wind uniforms must reach it either via a module-level `setWindUniforms`-style init or by wrapping the `create` reference — planner picks; the pooled-material module-level cache makes a one-time module init the lighter touch.

---

### `src/game/world/createMondstadtWorld.ts` (MOD — options threading + flag placement)

**Analog:** itself.

**Options threading pattern** (`createMondstadtWorld.ts:189-196, 354`):
```typescript
export interface MondstadtWorldOptions {
  grass: {
    bladeCount: number;
    influence: GroundInfluenceUniforms;
  };
  /** Strike-impact scorch map — browns the terrain and dries the grass. */
  scorch: ScorchMapUniforms;
}
// ...
const grassField = createGrassField({ ...options.grass, scorch: options.scorch });
```
Add `wind` to `MondstadtWorldOptions` exactly like `scorch`; spread it into `createGrassField` and pass to flag/canopy creators.

**Flag placement pattern — the camp decoration loop** (`createMondstadtWorld.ts:399-418`):
```typescript
for (const campSite of getCampSites()) {
  const campRandom = createSeededRandom(
    WORLD_DECOR_SEED ^ (Math.round(campSite.x * 31 + campSite.z * 17) | 0)
  );
  const placeAroundCamp = (asset: WorldAsset, radius: number, collisionRadius?: number) => {
    const angle = campRandom() * Math.PI * 2;
    placeAsset(asset, campSite.x + Math.cos(angle) * radius, campSite.z + Math.sin(angle) * radius, collisionRadius);
  };
  placeAsset(createCampfire(campRandom), campSite.x, campSite.z, 0.8);
  placeAroundCamp(createTeepee(campRandom), 4.5, 1.4);
  // ... Phase 8 adds: placeAroundCamp(createCampFlag(campRandom, wind), ~5.5);
```

**Frozen-matrix rule + `update()` cleanup** (`createMondstadtWorld.ts:423-451`):
```typescript
group.updateMatrixWorld(true);
group.matrixWorldAutoUpdate = false;
// ...
update(deltaSeconds) {
  blades.rotation.z += deltaSeconds * 0.6;
  blades.updateMatrixWorld(true);   // the sanctioned mover pattern — Phase 8 must NOT need this
  grassField.update(deltaSeconds);  // ← DELETE with the grass clock (no-legacy rule)
  flickerSeconds += deltaSeconds;
  campfireLights.forEach((light, index) => { /* flicker stays */ });
},
```
Flags/canopies sway in-shader, so nothing new touches `updateMatrixWorld`. Delete the `grassField.update` call in the same change that removes the grass clock.

---

### `src/game/createGame.ts` (MOD — flags, construction order, frame wiring)

**Analog:** itself. ~12 net lines, three sites:

**1. Bisect flags** (`createGame.ts:295-311`):
```typescript
// Perf bisect kill-switches: append ?nograss / ?nobend / ?noshadow / ?nofx
// to the URL to disable one ambiance system and find a frame-cost culprit.
const perfFlags = new URLSearchParams(window.location.search);
if (perfFlags.has('noshadow')) pixelRenderer.renderer.shadowMap.enabled = false;
// ...
const influenceEnabled = !perfFlags.has('nobend');
```
Copy: `const windEnabled = !perfFlags.has('nowind');` → `strengthUniform.value = windEnabled ? 1 : 0` (uniform, never a define); `const smokeEnabled = !perfFlags.has('nosmoke');` → skip smoke construction entirely (the `fxEnabled ? createDebrisSystem(...) : undefined` conditional at `:344-346` is the exact precedent). Extend the comment listing at `:295-296` with the two new flags.

**2. Construction order** (`createGame.ts:300-312`): `createWind` must be built BEFORE `createMondstadtWorld` (`:306`) so its uniforms travel through `MondstadtWorldOptions` — same position as `groundInfluence` (`:301`), which is constructed then passed in. Smoke follows the debris precedent (`:344-346` — needs `world.getGroundHeight`, so after world):
```typescript
const debrisSystem = fxEnabled
  ? createDebrisSystem(scene, (x, z) => world.getGroundHeight(x, z))
  : undefined;
```

**3. `frame()` wiring** (`createGame.ts:1304-1340`):
```typescript
const deltaSeconds = Math.min(0.05, (frameTime - lastFrameTime) / 1000 || 0.016);
// ...
effectSystem.update(deltaSeconds);
debrisSystem?.update(deltaSeconds);          // ← smokeColumns?.update(deltaSeconds, x, z) goes beside this
// ...
world.update(deltaSeconds);
```
`wind.update(deltaSeconds)` goes early in `frame()` (before anything that reads the clock this frame — i.e. before `world.update`/render); `smokeColumns?.update(deltaSeconds, playerPosition.x, playerPosition.z)` uses the optional-chaining convention of `debrisSystem?.update`.

## Shared Patterns

### onBeforeCompile shader patch (grass → canopy, flag, grass-gust)
**Source:** `src/game/world/createGrassField.ts:60-138`
**Apply to:** grass gust term (MOD), pooled canopy cap material, pooled flag cloth material
```typescript
const material = new THREE.MeshLambertMaterial({ /* ... */ });
material.onBeforeCompile = shader => {
  shader.uniforms.uTime = timeUniform;                     // uniform OBJECT by reference (:95)
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', /* glsl */ `
      #include <common>
      uniform float uTime;
      /* + uniform vec2 uWindDir; uniform float uWindStrength; */
      `)
    .replace('#include <begin_vertex>', /* glsl */ `
      vec3 transformed = vec3(position);
      /* displacement math; constants interpolated as ${'${CONST.toFixed(4)}'} — :118 */
      `);
};
// Distinct cache key — the patched program must not collide with plain Lambert. (:136-137)
material.customProgramCacheKey = () => 'grassField';   // 'canopySway' / 'campFlag' for the new ones
```
Rules bound to this pattern: (a) every interpolated JS number formats via `.toFixed(4)` (raw `2` is a GLSL int — breaks compile); (b) one UNIQUE `customProgramCacheKey` per patched variant (Pitfall 3); (c) toggles are uniforms, never `#define`s (recompile hitch). The GLSL displacement snippets themselves are generated by `windMath.ts` functions so JS mirrors (`sampleWind`) and shaders can never drift.

### Uniform objects shared by reference
**Source:** `src/game/systems/createGroundInfluence.ts:23-34` (contract doc), consumed at `createGrassField.ts:96`
**Apply to:** `createWind.ts` (producer), grass/canopy/flag materials + smoke CPU reads (consumers)
```typescript
// Producer exposes { value } objects; update() mutates .value in place:
const timeUniform = { value: 0 };
// Consumer holds the OBJECT — never copies .value:
shader.uniforms.uTime = wind.timeUniform;
```
Anti-pattern (from the influence doc): caching `.value` reads a stale frame forever.

### Fixed-pool InstancedMesh + scratch objects (zero per-frame allocs)
**Source:** `src/game/systems/createDebrisSystem.ts:30-67, 100-121`
**Apply to:** `createSmokeColumns.ts`
Key excerpts under that file's assignment above. Non-negotiables: fixed pool size const, zero-scale matrix hides inactive slots, `frustumCulled=false`, no shadows, module/closure scratch `Matrix4/Vector3/Quaternion/Color`, `needsUpdate` flags set once per frame, scene-root placement.

### Bisect-flag convention
**Source:** `src/game/createGame.ts:295-317`
**Apply to:** `?nowind`, `?nosmoke`
`URLSearchParams.has()` boolean presence only; effect is either a uniform value (`nowind`) or skipped construction with optional-chained updates (`nosmoke`, precedent: `fxEnabled`/`debrisSystem?`).

### Asset factory convention
**Source:** `src/game/world/assets/createCampfire.ts:34` + `types.ts:22-36` + barrel `assets/index.ts`
**Apply to:** `createCampFlag.ts`
`(random: SeededRandom, ...extras) => WorldAsset`; hex color consts at top; seeded randomness only (`randomBetween`, `random() * Math.PI * 2`); export through the barrel.

### Frozen-matrix rule (constraint, not a pattern to copy)
**Source:** `src/game/world/createMondstadtWorld.ts:423-446`
**Apply to:** everything placed in `world.group`
The world subtree freezes after build (`matrixWorldAutoUpdate = false`). Phase 8's design (shader sway, scene-root smoke) exists to never need the blades-style manual `updateMatrixWorld` mover. Any plan task that would mutate a transform inside `world.group` per frame is wrong.

### Pure-helper twin + test-first
**Source:** `debrisMath.ts` / `debrisMath.test.ts` (also `groundInfluenceMath.ts` / `.test.ts`)
**Apply to:** `windMath.ts` (+ optional smoke math split if puff logic grows)
Zero-import helper file, behavioral tests, THREE wrapper consumes it. Project memory: write the test first.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| — | — | — | Every file has an analog. The only novel CONTENT is the gust-envelope/wander math inside `windMath.ts` (no prior wind/noise math in repo) — planner should lift RESEARCH.md Pattern 3's code verbatim as the starting implementation. |

## Metadata

**Analog search scope:** `src/game/systems/`, `src/game/world/`, `src/game/world/assets/`, `src/game/createGame.ts`, test dirs `src/game/systems/__tests__/`, `src/game/world/__tests__/`
**Files scanned:** 12 read in full or targeted (createGrassField, createGroundInfluence, debrisMath, createDebrisSystem, createCampfire, createCanopyTree, assets/types, assetHelpers, camps, debrisMath.test, createMondstadtWorld [targeted], createGame [targeted :285-360, :1298-1367])
**Pattern extraction date:** 2026-07-14
**Line numbers verified against live code this session** — they match RESEARCH.md's citations (no drift).
