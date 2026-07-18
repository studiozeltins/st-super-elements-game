# Phase 9: Atmosphere & Day/Night - Pattern Map

**Mapped:** 2026-07-14
**Files analyzed:** 8 (5 new, 3 modified)
**Analogs found:** 8 / 8 (every file has a shipped in-repo precedent)

> This phase is a pure "copy the Phase-8 wind precedent" phase. `createWind.ts` + `windMath.ts` + `windMath.test.ts` are the exact sibling-factory / pure-twin / vitest triad to mirror. The only genuinely new plumbing is one `Game.syncServerClock` method + one bridge tap (~8 lines each) and a 2-uniform sky-dome ShaderMaterial.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/game/systems/dayNightMath.ts` | utility (pure math, zero-THREE) | transform | `src/game/systems/windMath.ts` | exact |
| `src/game/systems/__tests__/dayNightMath.test.ts` | test | transform | `src/game/systems/__tests__/windMath.test.ts` | exact |
| `src/game/systems/createDayNightCycle.ts` | system/factory | transform (frame pull) | `src/game/systems/createWind.ts` | exact |
| `src/game/net/createServerClock.ts` | utility (clock) | event-driven anchor + estimate | `createAttackViewClock.ts:65-68` | role/logic-match |
| `src/game/world/assets/createLantern.ts` | asset factory | (build-time construction) | `src/game/world/assets/createCampfire.ts:34-78` | exact |
| `src/game/world/createMondstadtWorld.ts` (MOD) | world factory | request-response (handles) | self (existing lighting/fog/traverse) | in-place widen |
| `src/game/createGame.ts` (MOD) | orchestrator/game loop | frame loop + bisect flag | self (`wind` wiring `:311-327`, `:1325-1327`) | in-place |
| `src/hooks/useGameTableBridge.ts` (MOD) | React bridge | event-driven (table callback tap) | self (`mirror` cb `:50-61`) | in-place |

## Pattern Assignments

### `src/game/systems/dayNightMath.ts` (utility, transform)

**Analog:** `src/game/systems/windMath.ts` — the pure-helper twin: zero imports (not even THREE), module-const constants, exported pure functions, deterministic, no allocations. Mirror its structure exactly.

**Module doc + zero-import header** (`windMath.ts:1-11`): open with a doc block stating "single source of truth", "ZERO imports so it is unit-testable without a renderer", "deterministic by construction, no RNG, no allocations". Copy this framing.

**Exported const-struct constants** (`windMath.ts:18-28, 36-48`):
```typescript
export const SWAY = {
  f1: 1.7,
  x1: 0.35,
  // ...
} as const;
```
Day/night mirror: `export const CYCLE_MICROS = 1_200_000_000n;` (20min) and a `KEYFRAMES` array of `{ phase, skyTop, horizon, sunColor, sunIntensity, hemiSky, hemiGround, hemiIntensity, lanternLevel, fireflyLevel }` plain-number/hex structs, `as const`.

**Pure exported function shape** (`windMath.ts:126-131, 138-141, 153-155`):
```typescript
export function sampleWind(t: number, x: number, z: number): number {
  return (
    Math.sin(t * SWAY.f1 + x * SWAY.x1 + z * SWAY.z1) +
    SWAY.amp2 * Math.sin(t * SWAY.f2 + z * SWAY.z2)
  );
}
```
Day/night mirror: `phase01(nowMicros: bigint): number` doing **bigint modulo BEFORE `Number()`** (D-08), plus keyframe-lerp helpers returning plain hex/number tuples (THREE-free — `createDayNightCycle` does the `Color.lerpColors`). Smoothstep blend, not linear (DAYNITE-01). Assert night intensity floor ≥ ~0.45 (DAYNITE-03) and `lanternLevel`/`fireflyLevel` band boundaries in tests.

**Note:** `windMath.ts` also emits GLSL-text helpers (`swayGlsl`, `f(n)` at `:188-190`) because grass is shader-driven. Day/night has **no shader-text twin** — the sky-dome uniforms are set from JS Colors, not generated GLSL. Skip the `*Glsl` half of the windMath template.

---

### `src/game/systems/__tests__/dayNightMath.test.ts` (test, transform)

**Analog:** `src/game/systems/__tests__/windMath.test.ts` — vitest, `describe`/`it`/`expect`, imports the pure module, pins constants exactly where they are a contract and pins *behavior* (not numbers) everywhere else.

**Import + describe structure** (`windMath.test.ts:1-19, 21-36`):
```typescript
import { describe, expect, it } from 'vitest';
import { CANOPY, FLAG, GUST, /* ... */ } from '../windMath';

describe('SWAY constants (WIND-01, D-01 verbatim extraction)', () => {
  it('pins the nine grass shader literals exactly', () => {
    expect(SWAY.f1).toBe(1.7);
    // ...
  });
});
```

**Behavior-over-a-simulated-range pattern** (`windMath.test.ts:38-60`): loops sample points / a simulated hour and asserts bounds. Day/night mirror: loop the night band asserting the ≥45% exposure floor at every night phase; assert wraparound continuity (`phase 0.99 → 0.01` no daylight flash — RESEARCH Wave-0 gap); assert modulo precision at large micros (~1.78e15); assert `lanternLevel` = 0 in day band, 1 in night, ramps in dusk/dawn (DAYNITE-04); smoothstep monotonicity. Run: `pnpm exec vitest run src/game/systems/__tests__/dayNightMath.test.ts`.

---

### `src/game/systems/createDayNightCycle.ts` (system/factory, transform)

**Analog:** `src/game/systems/createWind.ts` — the sibling factory: an interface, a `createX(enabled)` constructor, held-by-reference mutable state, delegates ALL math to the pure twin, exposes one `update()` called only by `createGame.frame()`.

**Factory doc + "held by reference, mutated in place" contract** (`createWind.ts:1-24`): copy the doc framing ("the ONE X source in the client", "consumers must hold the OBJECTS … `.value` is mutated in place every frame"). Day/night writes through `AmbienceHandles` (held by ref) — never reassigns fog/background/uniforms.

**`enabled` flag → neutral initial state** (`createWind.ts:40-47`):
```typescript
export function createWind(enabled: boolean): Wind {
  const timeUniform = { value: 0 };
  const strengthUniform = { value: enabled ? 1 : 0 };
  // ...
```
Day/night mirror: `createDayNightCycle(enabled: boolean, clock, ambience)` — when `!enabled` (`?nodaynight`, D-09) apply a neutral day keyframe ONCE and make `update()` a no-op (freeze the palette for FPS bisection).

**Delegate-to-pure-twin update + zero-alloc mutation** (`createWind.ts:53-57`):
```typescript
update(deltaSeconds) {
  timeUniform.value += deltaSeconds;
  const theta = windAngle(timeUniform.value);
  directionUniform.value.set(Math.cos(theta), Math.sin(theta));   // .set() in place, no alloc
},
```
Day/night mirror: `update()` pulls `phase01(clock.nowMicros())` from `dayNightMath`, interpolates the palette, `THREE.Color.prototype.lerpColors(a, b, t)` into **preallocated scratch Colors** (module-const keyframe Colors + scratch — Pitfall "day/night lerp allocating Colors"), then `.copy()` into `ambience.fog.color` / `ambience.setSkyTop()` / light `.color`/`.intensity`. The single scratch horizon Color feeds BOTH fog and sky-bottom (ATMO-02 single-source). Never `new Color()` per frame.

---

### `src/game/net/createServerClock.ts` (utility, event-driven anchor + estimate)

**Analog:** `src/game/systems/createAttackViewClock.ts:65-68` — the proven server-clock anchor estimator (`base + (performance.now() - basePerf)*1000`). RESEARCH gives the verbatim target shape.

**The estimator to reuse** (`createAttackViewClock.ts:65-69`):
```typescript
function serverNowEstimate(timing: UnitAttackTiming): bigint {
  return (
    timing.baseServerMicros + BigInt(Math.round((performance.now() - timing.basePerfMs) * 1000))
  );
}
```
And the anchor capture on arrival (`createAttackViewClock.ts:84-92`): `baseServerMicros = <serverMicros>; basePerfMs = performance.now();`.

**Target module** (from RESEARCH Pattern 2, HIGH-confidence):
```typescript
export function createServerClock() {
  let baseServerMicros: bigint | null = null;
  let basePerfMs = 0;
  return {
    anchor(serverMicros: bigint) { baseServerMicros = serverMicros; basePerfMs = performance.now(); },
    nowMicros(): bigint {
      if (baseServerMicros === null) return BigInt(Math.round(Date.now() * 1000)); // Date.now() fallback
      return baseServerMicros + BigInt(Math.round((performance.now() - basePerfMs) * 1000));
    },
  };
}
```
`Date.now()` fallback until the first tick anchors (D-08 / DAYNITE-02). `anchor` is a setter called from a table callback, NEVER a render (Pitfall 6.1).

---

### `src/game/world/assets/createLantern.ts` (asset factory, build-time construction)

**Analog:** `src/game/world/assets/createCampfire.ts:34-78` — voxel boxes + a NAMED PointLight with `layers.enableAll()`, returned as a `WorldAsset { group }`, collected later by name.

**Named-light-constant export** (`createCampfire.ts:11-12`):
```typescript
/** Name of the flame PointLight — the world flickers these each frame. */
export const CAMPFIRE_LIGHT_NAME = 'campfireLight';
```
Lantern mirror: `export const LANTERN_LIGHT_NAME = 'lanternLight';`

**The named-PointLight-at-build pattern to copy verbatim** (`createCampfire.ts:72-78`):
```typescript
const fireLight = new THREE.PointLight(GLOW_COLOR, 2.5, 9, 2);
fireLight.name = CAMPFIRE_LIGHT_NAME;
// Visible to all camera layers — a pass that culls lights flips the
// renderer's lights-state hash and re-inits every lit material per frame.
fireLight.layers.enableAll();
fireLight.position.y = 1;
group.add(fireLight);
```
Lantern: warm `PointLight`, `light.name = LANTERN_LIGHT_NAME`, `light.layers.enableAll()` (mandatory — skipping it triggers per-frame material re-init, RESEARCH Pattern 6). Simple voxel post from `BoxGeometry` + `lambert()` (`createCampfire.ts:1-3` helpers: `lambert`, `randomBetween`, `randomIntBetween` from `./assetHelpers`). Return `{ group }` (`WorldAsset` type). **Do NOT** use `createLightPool` — that's the combat-owned size-4 pool that is never grown (`createLightPool.ts:5-9`, D-07 / Anti-Pattern 3).

---

### `src/game/world/createMondstadtWorld.ts` (MOD — widen return + place lanterns + collect by name)

**MOD 1 — widen `createLighting` to return an `AmbienceHandles`-feeding tuple** (`createMondstadtWorld.ts:129-153`): today `skyLight` (the HemisphereLight at `:130`) is a local const and the fn returns only `sunLight`. Expose both:
```typescript
function createLighting(group: THREE.Group): THREE.DirectionalLight {
  const skyLight = new THREE.HemisphereLight(0xbfe3ff, 0x4a7a3a, 0.9);  // :130 — expose this
  skyLight.layers.enableAll();
  // ...
  const sunLight = new THREE.DirectionalLight(0xfff2d8, 1.4);           // :138 — .color/.intensity drift ONLY
```
Change to `return { skyLight, sunLight }`. **The sun's DIRECTION is frozen** — `sunDirection`/`sunRight`/`sunUp` texel-snap basis (`:124-127`) and `SUN_OFFSET` (`:114`) are untouchable (D-02). Day/night drifts `.color`/`.intensity` only.

**MOD 2 — fog/background already exist; couple them, never reassign** (`createMondstadtWorld.ts:222-223`):
```typescript
scene.background = new THREE.Color(0x8ecae6);
scene.fog = new THREE.Fog(0x8ecae6, 80, 300);
```
Keep both objects; mutate `scene.fog.color`/`.near`/`.far` and `scene.background` (as Color) in place forever (never `new Fog()`, never Texture — Pitfall 4). Tune `near ≥ 80` (well past `SAFE_ZONE_RADIUS=18`), `far` into ~250–320 (D-06). Add the sky-dome ShaderMaterial here (BackSide sphere, `fog:false`, `depthWrite:false`) whose `bottomColor.value` IS the same `THREE.Color` instance as `scene.fog.color` (ATMO-02 single-source — RESEARCH Pattern 3).

**MOD 3 — place 4-6 lanterns in the plaza build** (`createPlaza` `:155`, called `:371`; campfire placement precedent `:440`):
```typescript
placeAsset(createCampfire(campRandom), campSite.x, campSite.z, 0.8);   // :440 — the placement call to mirror
```
Place lanterns within `SAFE_ZONE_RADIUS=18` at world build (once).

**MOD 4 — collect lanterns by name in the existing traverse loop** (`createMondstadtWorld.ts:463-481`):
```typescript
const campfireLights: THREE.PointLight[] = [];
// ...
group.traverse(node => {
  if (node.name === CAMPFIRE_LIGHT_NAME) campfireLights.push(node as THREE.PointLight);
  if (node.name === CAMP_FLAG_CLOTH_NAME) { /* ... */ }
});
```
Add `const lanternLights: THREE.PointLight[] = [];` and `if (node.name === LANTERN_LIGHT_NAME) lanternLights.push(node as THREE.PointLight);` in the SAME loop. Note the world is frozen after this (`group.updateMatrixWorld(true); group.matrixWorldAutoUpdate = false;` at `:456-457`) — intensity changes are free, no matrix cost.

**MOD 5 — widen the return object + `MondstadtWorld` interface** (`:42-66`, `:484`): add `ambience: AmbienceHandles` to the `MondstadtWorld` interface and the returned object:
```typescript
ambience: {
  skyLight, sunLight,
  fog: scene.fog,
  background: scene.background as THREE.Color,
  lanternLights,
  setSkyTop(c: THREE.Color): void,   // writes the dome topColor uniform in place
}
```
Precedent: the existing per-frame flicker loop over `campfireLights` (`:492-494`, `light.intensity = 2.5 + Math.sin(...)`) shows intensity-only mutation is the established free per-frame op — lanterns follow the same shape but driven by `lanternLevel` from day/night (day/night owns the write, via the handle).

---

### `src/game/createGame.ts` (MOD — construct clock/daynight, one frame line, `?nodaynight` flag)

**MOD 1 — bisect flag, mirror the `?nowind`/`?nosmoke` convention** (`createGame.ts:297-313`):
```typescript
const perfFlags = new URLSearchParams(window.location.search);
// ...
const windEnabled = !perfFlags.has('nowind');
const smokeEnabled = !perfFlags.has('nosmoke');
const wind = createWind(windEnabled);
```
Add `const dayNightEnabled = !perfFlags.has('nodaynight');` (D-09) and extend the flag comment at `:297-299`.

**MOD 2 — construct clock + cycle beside `wind`** (`createGame.ts:313-321`): after `createMondstadtWorld` returns (so `world.ambience` exists):
```typescript
const serverClock = createServerClock();
const daynight = createDayNightCycle(dayNightEnabled, serverClock, world.ambience);
```
`createGame` is ~1,963 LOC — keep the logic in the sibling factory, only wire here (Integration note).

**MOD 3 — one frame line, after `wind.update()`** (`createGame.ts:1325-1327`):
```typescript
// Advance the shared wind clock FIRST — every consumer reads this frame's phase.
wind.update(deltaSeconds);
```
Add immediately after: `daynight.update(serverClock.nowMicros());` (pulled by the loop, NEVER derived per React render — Pitfall 6.1). This is the ONLY `daynight.update` call.

**MOD 4 — add `syncServerClock` to the `Game` interface** (`createGame.ts:138-182`): add `/** Re-anchors the day/night clock off a server reducer timestamp. */ syncServerClock(serverMicros: bigint): void;` next to the other `sync*` methods (`syncEnemies` `:171`, `syncGoliaths` `:173`). Implement it as `daynight`/`serverClock` passthrough: `syncServerClock(m) { serverClock.anchor(m); }`.

---

### `src/hooks/useGameTableBridge.ts` (MOD — tap the discarded EventContext)

**Analog:** the existing `mirror` callbacks that currently discard `ctx` (`useGameTableBridge.ts:50-61`).

**The seam — ctx is typed `unknown` and thrown away** (`useGameTableBridge.ts:28-35, 54-57`):
```typescript
onUpdate(cb: (ctx: unknown, oldRow: Row, newRow: Row) => void): void;
// ...
const onUpdate = (_ctx: unknown, _oldRow: Row, row: Row) => {   // _ctx discarded — TAP HERE
  map.set(keyOf(row), row);
  markDirty();
};
```
Widen `_ctx: unknown` → `ctx: EventContext` (import `type { EventContext } from '../module_bindings'`) and tap it (RESEARCH Pattern 2, VERIFIED `spacetimedb@2.6.1`):
```typescript
if (ctx.event.tag === 'Reducer') {
  const micros: bigint = ctx.event.value.timestamp.microsSinceUnixEpoch;
  gameRef.current?.syncServerClock(micros);   // re-anchor; NOT a render
}
```
**Guards:** only tap live callbacks — the `handle.iter()` cache-seed loop (`:48`) has NO ctx, don't anchor from it. The `tag === 'Reducer'` guard already skips the `'SubscribeApplied'` snapshot. The `enemy`/`goliath` `onUpdate` fire every ~150ms `worldTick` — that's the anchor cadence. First build step: one-line log of `ctx.event.tag` on the first goliath update to confirm a scheduled reducer's broadcast to a non-caller arrives `'Reducer'` (Assumption A1; `Date.now()` fallback covers it either way).

---

## Shared Patterns

### Zero-per-frame-allocation (mutate scratch in place)
**Source:** `createWind.ts:43-47` (`directionUniform` constructed ONCE, `.set()` in place); `createAttackViewClock.ts:57-58` (maps rebuilt in place, "no per-frame allocation").
**Apply to:** `createDayNightCycle.ts` (preallocated keyframe + scratch `THREE.Color`s, `lerpColors` into scratch, `.copy()` out), the fog/sky/light mutation path.
```typescript
// Wind precedent — construct once, mutate forever:
const directionUniform = { value: new THREE.Vector2(Math.cos(initialAngle), Math.sin(initialAngle)) };
// update(): directionUniform.value.set(Math.cos(theta), Math.sin(theta));
```

### Mutate-in-place, never-reassign (shared object identity)
**Source:** `createMondstadtWorld.ts:222-223` (fog/background objects); `createMondstadtWorld.ts:467-468` ("The impulse object is the SAME reference the cloth's onBeforeRender reads").
**Apply to:** `scene.fog` (`.color`/`.near`/`.far`), `scene.background` (as Color), sky-dome uniform Colors, light `.color`/`.intensity`. The overlay pass saves/restores `scene.background` by reference (Pitfall 4) — reassigning breaks it and recompiles every world material.

### Named-light-at-build + collect-by-name in the frozen traverse
**Source:** `createCampfire.ts:11-12,72-78` (name const + `layers.enableAll()`); `createMondstadtWorld.ts:463,471-472` (collect in `group.traverse`).
**Apply to:** `createLantern.ts` + the `:471` traverse loop. `layers.enableAll()` is mandatory on every world light (culling a light flips the lights-state hash → per-frame material re-init).

### One shared clock, advanced once in `frame()`
**Source:** `createGame.ts:1325-1327` ("The ONLY clock advance"); `createWind.ts:6-9` ("`createGame.frame()` is the only caller of `update()`").
**Apply to:** `daynight.update(serverClock.nowMicros())` — one line, right after `wind.update()`. No private accumulator; the phase is pulled from `serverClock`, never React (Pitfall 6/10).

### Perf-bisect kill-switch flag
**Source:** `createGame.ts:297-311` (`?nograss`/`?nobend`/`?noshadow`/`?nofx`/`?nowind`/`?nosmoke`).
**Apply to:** `?nodaynight` (D-09) → freeze the palette at a neutral day key (apply once, skip `update`).

## No Analog Found

None. Every file has a shipped in-repo precedent (fog exists, campfire named-light, wind sibling-factory + pure twin + test, server-clock estimator, the discarded EventContext seam). The only two pieces without a line-for-line twin are:

| Piece | Role | Why no exact analog | Guidance |
|-------|------|---------------------|----------|
| Sky-dome `ShaderMaterial` (inside `createMondstadtWorld` MOD) | render | No existing gradient-sky/custom-ShaderMaterial in-world (grass uses `onBeforeCompile` patches, not standalone ShaderMaterial) | Use the classic three.js 2-uniform gradient-sky shader (RESEARCH Pattern 3); `bottomColor.value` = same `THREE.Color` as `scene.fog.color`. Not a new *file*, just new material code in the world factory. |
| `Game.syncServerClock` + bridge tap | interface/glue | New method, but the callback shape is the existing `mirror` cb | ~8 lines each, fully specified in RESEARCH Pattern 2. |

## Metadata

**Analog search scope:** `src/game/systems/`, `src/game/net/` (new dir), `src/game/world/`, `src/game/world/assets/`, `src/hooks/`
**Files scanned:** windMath.ts, createWind.ts, windMath.test.ts, createAttackViewClock.ts, createCampfire.ts, createMondstadtWorld.ts, useGameTableBridge.ts, createGame.ts, createLightPool.ts
**Pattern extraction date:** 2026-07-14
