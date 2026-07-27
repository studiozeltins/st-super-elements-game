# Phase 11: Lived-in Props & Wear - Pattern Map

**Mapped:** 2026-07-18
**Files analyzed:** 14 (6 new, 8 modified)
**Analogs found:** 14 / 14 (every file has a shipped in-repo precedent)

> This is a **tune-existing-systems + static-bake + one-new-pooled-sprite** phase. Four of five requirements are parameter/data changes on machinery that already ships. The only genuinely new code is `createDustPuffs.ts` (a copy-with-deltas of `createSmokeColumns.ts`) and `surfaceAt.ts` (a 4-line composition of existing pure functions). Every new asset factory is a sibling of `createCampfire.ts` / `createLantern.ts`. Resist building new subsystems.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/game/systems/createDustPuffs.ts` | system/factory (pooled InstancedMesh) | event-driven (spawn) + frame update | `src/game/systems/createSmokeColumns.ts` | exact |
| `src/game/systems/surfaceAt.ts` | utility (pure classifier, zero-THREE) | transform | `src/game/world/roads.ts:95-105` (`roadFactor`) + `windMath.ts` purity | role/logic-match |
| `src/game/systems/__tests__/surfaceAt.test.ts` | test | transform | `src/game/systems/__tests__/groundInfluenceMath.test.ts` | exact |
| `src/game/world/assets/createCrate.ts` | asset factory | build-time construction | `src/game/world/assets/createLantern.ts:6-16` (merged box helpers) | exact |
| `src/game/world/assets/createBarrel.ts` | asset factory | build-time construction | `src/game/world/assets/createLantern.ts` / `createCampfire.ts:15-32` | exact |
| `src/game/world/assets/createFence.ts` | asset factory | build-time construction | `src/game/world/assets/createLantern.ts:71-104` (merged runs) | exact |
| `src/game/systems/groundInfluenceMath.ts` (MOD) | utility (pure math) | transform | self (constants at `:14`, `:44`) | in-place constant edit |
| `src/game/systems/__tests__/groundInfluenceMath.test.ts` (MOD) | test | transform | self (`:81-85` stale wear block) | in-place |
| `src/game/world/roads.ts` (MOD) | world math (pure, memoized) | transform | self (`roadFactor` `:95-105`, `getRoads` `:37-64`) | in-place widen |
| `src/game/world/terrain.ts` (MOD) | world math (color bake) | transform | self (`terrainColorAt` `:143-158`) | in-place widen |
| `src/game/world/grassPlacement.ts` (MOD) | world factory (pure) | transform / batch | self (rejection seam `:74-75`) | in-place |
| `src/game/world/createMondstadtWorld.ts` (MOD) | world factory | request-response (handles) | self (lantern placement `:606-620`, freeze `:660-661`) | in-place |
| `src/game/createGame.ts` (MOD) | orchestrator/game loop | frame loop + bisect flag | self (smoke wiring `:344-418`, `:1484`) | in-place |
| `src/game/audio/createMovementAudio.ts` (MOD) | audio (type widen) | event-driven | self (`FootstepSurface` `:14`, `updateUnit` `:238-246`) | in-place |

## Pattern Assignments

### `src/game/systems/createDustPuffs.ts` (system/factory, pooled) — NEW

**Analog:** `src/game/systems/createSmokeColumns.ts` — the EXACT template. Copy its structure wholesale, apply the ground-hugging deltas. This is the phase's only new per-frame draw-call source; `?nodust` gates it (D-14).

**Interface + hard-cap doc** (`createSmokeColumns.ts:13-19`):
```typescript
export interface SmokeColumns {
  update(deltaSeconds: number, playerX: number, playerZ: number): void;
  dispose(): void;
}
/** ~4 fires in range x 12 puffs per thin wisp — the hard pool cap (D-10). */
const SMOKE_POOL_SIZE = 48;
```
Dust mirror: `DustPuffs { spawn(x,z,dirX,dirZ): void; update(deltaSeconds): void; dispose(): void }` and `const DUST_POOL_SIZE = 24;` (D-11). Unlike smoke (self-culls static camp emitters at ~2Hz), dust is **externally spawned** by the moving player — add a `spawn()` method; `update()` only ages/moves live puffs.

**Tuning constants to re-derive** (`createSmokeColumns.ts:26-40`) — the delta table from RESEARCH Pattern 4:
```typescript
const RISE_SPEED = 0.8;
const MAX_RISE = 4.5;               // → DUST: MAX_RISE ≈ 0.4 (ground-hug, no tower)
const PUFF_LIFE = MAX_RISE / RISE_SPEED;   // → DUST: PUFF_LIFE ≈ 0.4–0.6s
const SIZE_TIERS = [0.3, 0.24, 0.18, 0.11];  // → DUST: [0.18,0.14,0.10,0.06] dusty tan
const SMOKE_GRAY = 0x757b82;        // → DUST: a dusty tan
const SKY_FADE = 0x8ecae6;          // opaque stepped fade toward ground/sky — NO alpha
```

**Precomputed opaque fade palette** (`createSmokeColumns.ts:66-69`): copy verbatim — `SIZE_TIERS.map((_, i) => new THREE.Color(A).lerp(new THREE.Color(B), i/(n-1)))`. Opaque Lambert + stepped color, never alpha (bands under the nearest-neighbor pixel filter — Anti-Pattern in RESEARCH).

**InstancedMesh setup — copy the flags verbatim** (`createSmokeColumns.ts:83-99`):
```typescript
const mesh = new THREE.InstancedMesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshLambertMaterial(),   // Lambert not Basic — day/night dims lit materials
  SMOKE_POOL_SIZE
);
mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
mesh.frustumCulled = false;
mesh.castShadow = false;
mesh.receiveShadow = false;
// ... setMatrixAt(i, zeroMatrix) + setColorAt(i, fadeColors[0]) for every slot
mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
scene.add(mesh);   // scene ROOT, never the frozen world group
```

**Closure-level scratch — the zero-alloc discipline (copy verbatim)** (`createSmokeColumns.ts:101-107`):
```typescript
const scratchMatrix = new THREE.Matrix4();
const scratchPosition = new THREE.Vector3();
const scratchScale = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const upAxis = new THREE.Vector3(0, 1, 0);
```
Never `new Matrix4()`/`new Vector3()` inside `update()`/`spawn()` — the documented 144→20fps cliff class.

**Slot-claim (hard cap) pattern** (`createSmokeColumns.ts:110-131`): the `for` scan for the first `!pool[i].active` slot, `return false` when full. Reuse for `spawn()`. Non-deterministic `Math.random()` jitter is fine (cosmetic — line 121 comment).

**Age/move/recycle loop + needsUpdate gating** (`createSmokeColumns.ts:163-199`): the `matrixDirty`/`colorDirty` flags, `scratchMatrix.compose(position, quaternion, scale)` → `setMatrixAt`, step-tier color change → `setColorAt`, and only `mesh.instanceMatrix.needsUpdate = true` when actually dirty. Dust delta: low upward `RISE_SPEED` (~0.15–0.3), small backward/outward kick from the passed movement dir, minimal/no wind coupling.

**dispose()** (`createSmokeColumns.ts:201-208`): copy verbatim — `scene.remove`, geometry/material dispose, then `mesh.dispose()` (releases instance GPU buffers).

---

### `src/game/systems/surfaceAt.ts` (utility, pure classifier) — NEW

**Analog:** `src/game/world/roads.ts:95-105` (`roadFactor` — pure, memoized, THREE-free) composed with `town/townPlan.isInTown` and the new `footpathFactor`. Purity/testability framing mirrors `windMath.ts` (zero-THREE header). No GPU read, no per-frame alloc (D-12, client-perf rule).

**Composition (from RESEARCH Pattern 5, verified against the seams):**
```typescript
import { roadFactor, footpathFactor } from '../world/roads';
import { isInTown } from '../world/town/townPlan';
export type Surface = 'grass' | 'dirt' | 'path' | 'town';
export function surfaceAt(x: number, z: number): Surface {
  if (isInTown(x, z)) return 'town';
  if (roadFactor(x, z) > 0.5) return 'dirt';      // packed-dirt road (matches grassPlacement.ts:74 threshold)
  if (footpathFactor(x, z) > 0.25) return 'path'; // worn footpath
  return 'grass';
}
```
The `> 0.5` road threshold MUST match the grass-rejection threshold at `grassPlacement.ts:74` (single source of truth — dust never spawns where grass still grows). `roadFactor`/`footpathFactor` loop a handful of memoized segments — cheap per frame (Assumption A3); if profiling flags it, add a 1-entry position-quantized cache.

---

### `src/game/systems/__tests__/surfaceAt.test.ts` (test) — NEW

**Analog:** `src/game/systems/__tests__/groundInfluenceMath.test.ts` — vitest `describe`/`it`/`expect`, imports the pure module, asserts behavior at boundary points. Also mirror the pure-helper discipline shown in `grassPlacement`/`roads` (deterministic → assertable).

**Structure to mirror** (`groundInfluenceMath.test.ts:1-9, 59-69`):
```typescript
import { describe, expect, it } from 'vitest';
import { surfaceAt } from '../surfaceAt';
```
Assert: origin/plaza → `'town'` (inside `isInTown`); a point on a `getRoads()` centerline → `'dirt'`; a point on a `getFootpaths()` spine (off any road) → `'path'`; open meadow far from all → `'grass'`; and the boundary ordering (town wins over road wins over footpath). Run: `pnpm exec vitest run src/game/systems/__tests__/surfaceAt.test.ts`.

---

### `src/game/world/assets/createCrate.ts` / `createBarrel.ts` / `createFence.ts` (asset factories) — NEW

**Analog:** `src/game/world/assets/createLantern.ts` (PREFERRED — merges same-material boxes into one draw call) and `src/game/world/assets/createCampfire.ts` (simplest — individual meshes). Both return `WorldAsset { group }` and take a `SeededRandom`. Props carry NO PointLight (D-10, light-pool recompile ban).

**The merged-box helpers to copy verbatim** (`createLantern.ts:6-16`):
```typescript
function box(w, h, d, x, y, z): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}
function mergedMesh(geos: THREE.BufferGeometry[], material: THREE.Material): THREE.Mesh {
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  return new THREE.Mesh(merged, material);
}
```

**Material + RNG helpers** (`assetHelpers.ts:4-24`): `edgeLit(color)` (flat-shaded Lambert, crisp voxel read — preferred for props), `lambert(color)`, `randomBetween`, `randomIntBetween`. Import from `./assetHelpers`; type `SeededRandom, WorldAsset` from `./types`.

**Factory signature + seeded yaw variety** (`createCampfire.ts:34-35` / `createLantern.ts:63-68, 117-118`):
```typescript
export function createCrate(random: SeededRandom): WorldAsset {
  const s = randomBetween(random, 0.7, 0.95);
  const group = new THREE.Group();
  group.add(mergedMesh([ /* six planks framing a cube via box(...) */ ], edgeLit(CRATE_WOOD)));
  group.rotation.y = randomBetween(random, -0.15, 0.15);
  return { group, obstacles: [{ x: 0, z: 0, radius: s * 0.6, height: s }] };
}
```

**Collision contract** (`types.ts:13-35` + honored at `createMondstadtWorld.ts:367-375`): declare `obstacles: AssetObstacle[]` so players path around crates/barrels/fence posts. `AssetObstacle = { x, z, radius, height? }` in asset-local coords. **Fences are runs** — build the whole run (posts + rails, merged) in ONE factory, one obstacle per post (like the lantern's multi-part single group).

---

### `src/game/systems/groundInfluenceMath.ts` (MOD — two constants) — WEAR-03/04

**Analog:** self. Two in-place constant edits (no dead code, no commented old value — CLAUDE.md no-legacy rule). The decay helpers are already frame-rate-independent by construction; only the rate changes.

**Bend decay** (`groundInfluenceMath.ts:13-14`):
```typescript
/** Trail persistence tuned at 60fps; footsteps stay readable ~4–5s. */
const DECAY_PER_FRAME_AT_60 = 0.985;   // → 0.980 (WEAR-04: decayForDelta(2)=0.0885 <10% by 2s, D-05)
```
Update the doc comment too (`~4–5s` → `~2s readable fade`).

**Wear/scorch regrow** (`groundInfluenceMath.ts:44`):
```typescript
const WEAR_REGROW_TIME_CONSTANT_SECONDS = 25;   // → 75 (WEAR-03/D-06: >0.4 @60s, <0.1 @180s ≈ 2.88min)
```
This ONE constant is read by both `wearDecayForDelta` (line 47) consumers — `createGroundInfluence` (wear A channel) AND `createScorchMap` (R). One edit, both heal slower (D-06). Update the doc block at `:39-43` (the `exp(-t/25)`/`~58s` text) to the new curve.

---

### `src/game/systems/__tests__/groundInfluenceMath.test.ts` (MOD) — WEAR-03/04

**Analog:** self. **Pitfall 1 (RESEARCH):** the stale wear block WILL fail after the retune — update it in the SAME change.

**The stale block to REPLACE** (`groundInfluenceMath.test.ts:81-85`):
```typescript
it('full wear regrows within about a minute, but not much sooner', () => {
  expect(wearDecayForDelta(30)).toBeGreaterThan(0.1);
  expect(wearDecayForDelta(60)).toBeLessThan(0.1);   // FAILS at τ=75 (becomes 0.449)
});
```
Replace with the τ=75 curve (RESEARCH Example 2): `wearDecayForDelta(60) > 0.4`, `wearDecayForDelta(180) < 0.1`. Keep the existing composition test at `:71-75` and the "regrows slower than bend" test at `:77-79` (still valid).

**Add a bend-2s block** mirroring the existing `decayForDelta` describe at `:59-69`: `decayForDelta(1) > 0.1`, `decayForDelta(2) < 0.1` (D-05), `decayForDelta(3) < 0.03`, plus the frame-rate-independence composition test (already present at `:65-68`, extend to the new value). Run: `pnpm exec vitest run src/game/systems/__tests__/groundInfluenceMath.test.ts`.

---

### `src/game/world/roads.ts` (MOD — add `getFootpaths` + `footpathFactor`) — WEAR-01

**Analog:** self. `footpathFactor` is a narrower, partial SIBLING of `roadFactor` — reuse the existing `smoothstep` and `distanceToSegment` helpers, NEVER duplicate them (D-01).

**Reuse the existing helpers verbatim** (`roads.ts:66-70` smoothstep, `:72-87` distanceToSegment) — they are module-private; `footpathFactor` calls them exactly as `roadFactor` does.

**`roadFactor` — the exact shape to mirror** (`roads.ts:95-105`):
```typescript
export function roadFactor(x: number, z: number): number {
  let best = 0;
  for (const road of getRoads()) {
    for (let i = 0; i < road.length - 1; i += 1) {
      const distance = distanceToSegment(x, z, road[i].x, road[i].z, road[i + 1].x, road[i + 1].z);
      const factor = smoothstep(ROAD_HALF_WIDTH + ROAD_BLEND, ROAD_HALF_WIDTH, distance);
      if (factor > best) best = factor;
    }
  }
  return best;
}
```
Footpath delta: `FOOTPATH_HALF_WIDTH ≈ 1.1` (narrower than `ROAD_HALF_WIDTH 2.5` at `:19`), and return `best * FOOTPATH_MAX` (`≈ 0.6`) so it is partial by construction (never a full clear).

**`getRoads` memoization pattern to mirror** (`roads.ts:26, 37-64`): `let cachedFootpaths = null; if (cachedFootpaths) return cachedFootpaths;`. Build route polylines from `getCampSites()` (import from `./camps`), `getBridges()` (already imported at `:2`), and the plaza origin — **same-island segments only** (plaza→bridge-start both city-side; bridge-end→camp both outer-side) so `distanceToSegment` never bakes a path across water (Open Question 1: same-island direct footpaths; outer camps reached via plaza→bridge→camp). Anchors are data-driven, never magic coordinates (D-02).

**⚠️ Do NOT add a `footpathAcross`/`aFootpath` attribute.** The `roadAcross` fn (`:113-133`) feeds the packed-dirt cart-rut fragment shader — footpaths must stay OFF that path (Pattern 1 key insight / Pitfall 2).

---

### `src/game/world/terrain.ts` (MOD — footpath tint in `terrainColorAt` only) — WEAR-01

**Analog:** self. Add a light trampled tint BEFORE the road blend so the road wins on overlap. This is the BAKED vertex-color path (runs once per vertex at build) — no shader edit, zero per-frame cost.

**The exact blend site** (`terrain.ts:154-157`):
```typescript
// Worn dirt road on top of the grass — the road mask wins where it is strong.
const road = roadFactor(x, z);
if (road > 0) grassColor.lerp(ROAD_DIRT, road * 0.9);
return grassColor;
```
Insert BEFORE these two lines:
```typescript
const foot = footpathFactor(x, z);
if (foot > 0) grassColor.lerp(FOOTPATH_TINT, foot * 0.5);   // then road overrides on overlap
```
Add `const FOOTPATH_TINT = new THREE.Color(0x7d8a54);` near `ROAD_DIRT` (`:131-132`) — a desaturated trampled-grass tone, LIGHTER/greener than `ROAD_DIRT 0x9a7a4e` so footpaths read distinct from packed-dirt roads (D-03, Assumption A2 — perceptual UAT tunes the hue/blend).

**Anti-pattern (Pitfall 2):** never write `footpathFactor` into the `aRoad`/`aRoadCross` vertex attributes or sum it with `roadFactor` — that triggers the packed-dirt + cart-rut fragment branch (`terrain.ts:175-179` `SCORCH_BAND_GLSL` region uses `ROAD_CELLS_PER_UNIT`; the road fragment gate lives below). Keep `aRoad = roadFactor` only.

---

### `src/game/world/grassPlacement.ts` (MOD — softer footpath thinning) — WEAR-01

**Analog:** self. Add probabilistic thinning after the existing hard rejections so blades still poke through the worn path (D-03, trampled not cleared).

**The rejection seam to extend** (`grassPlacement.ts:74-76`):
```typescript
if (roadFactor(x, z) > 0.5) continue; // keep the road surface clear
if (isInTown(x, z)) continue; // no grass on the pavement — only faked seam grass
const y = getTerrainHeight(x, z);
```
Insert probabilistic thinning between the town reject and the `getTerrainHeight` call:
```typescript
const foot = footpathFactor(x, z);
if (foot > 0 && random() < foot) continue; // partial: trampled, not bare (cap FOOTPATH_MAX=0.6)
```
`random()` is the seeded generator already threaded through `generateGrassBlades` (`:46, 66-84`) — deterministic. Import `footpathFactor` alongside the existing `roadFactor` import (`:11`).

**⚠️ Test impact (Pitfall 3):** `src/game/world/__tests__/grassPlacement.test.ts` asserts blade/cluster counts (last touched by commit `d643c24`). Footpath thinning changes counts near splines — re-run and update assertions in the same change.

---

### `src/game/world/createMondstadtWorld.ts` (MOD — place props before the freeze) — WEAR-02

**Analog:** self. The lantern-ring placement (`:601-620`) is the exact precedent: own seeded RNG, `placeAsset` in a loop, all BEFORE the world freeze at `:660-661`.

**`placeAsset` — the placement primitive** (`:362-384`): sets `group.position` at `getTerrainHeight(x,z)`, adds to the frozen `group`, pushes `collisionRadius` + each `asset.obstacles` entry into `obstacles`. Crates/barrels/fences declare footprints (see the factory obstacle contract above).

**Own seeded RNG + placement loop to mirror** (`:606-620`):
```typescript
const lanternRandom = createSeededRandom(WORLD_DECOR_SEED ^ 0x1a27);   // :606
// ... for (...) placeAsset(createLantern(lanternRandom), x, z, 0.3);
```
Props mirror: `const propRandom = createSeededRandom(WORLD_DECOR_SEED ^ 0xc4a7e);` (`WORLD_DECOR_SEED = 0xa11ce` at `:121`; own salt so counts/jitter are deterministic + independent of prior draws, D-09). Stack ~6–10 crates/barrels at the market-tile edge facing the fountain; run 2–3 short fences at plaza-boundary gaps. Market anchors from `TOWN_DISTRICTS` (`market-e`/`market-ne`) via `town/townPlan.ts` — data-driven (D-09).

**The freeze contract — place BEFORE this** (`:656-661`, Pitfall 5):
```typescript
group.updateMatrixWorld(true);
group.matrixWorldAutoUpdate = false;
```
All prop placement goes between the existing decor block (~`:600-652`) and this freeze. Runtime scene adds to `group` are forbidden.

**Frozen-batch alternative** (`addInstancedMatrices` `:407-417`) — for many identical crates, one InstancedMesh instead of N `placeAsset` calls (used for grass/rocks at `:457-511`). Discretion; `placeAsset` is fine at these counts.

---

### `src/game/createGame.ts` (MOD — wire dust + surfaceAt + flag) — WEAR-05

**Analog:** self — mirror the `smokeColumns` wiring exactly. `createGame.ts` is ~1,963 LOC (the worst offender) — keep ALL logic in the sibling factory, only WIRE here.

**MOD 1 — `?nodust` flag** (`createGame.ts:330-345`):
```typescript
// Perf bisect kill-switches: append ?nograss / ?nobend / ?noshadow / ?nofx
// / ?nowind / ?nosmoke / ?nodaynight / ?nomovingsun to the URL ...
const smokeEnabled = !perfFlags.has('nosmoke');   // :345
```
Add `const dustEnabled = !perfFlags.has('nodust');` and extend the flag comment at `:330-332` to list `?nodust` (D-14).

**MOD 2 — conditional construction beside smoke** (`createGame.ts:414-418`):
```typescript
const smokeColumns = smokeEnabled
  ? createSmokeColumns(scene, wind, (x, z) => world.getGroundHeight(x, z))
  : undefined;
```
Add: `const dustPuffs = dustEnabled ? createDustPuffs(scene) : undefined;` (`?nodust` skips construction entirely — zero objects, clean FPS bisect).

**MOD 3 — spawn at the player step, gated on surface** (`createGame.ts:995-1018`): the `updateLocalPlayer` movement block already computes `isMoving` (`:995`), `worldMoveX/worldMoveZ` (`:998-1001`), and `isGrounded()` (`:1006`) — the cleanest spawn site (Assumption A5). There is NO `sprint` state (grep-verified) — gate on `isMoving && isGrounded()`:
```typescript
if (isGrounded()) {   // :1006 — already here for the wear stamp
  const surface = surfaceAt(playerPosition.x, playerPosition.z);
  if (surface !== 'grass') dustPuffs?.spawn(playerPosition.x, playerPosition.z, worldMoveX, worldMoveZ);
  // ... existing groundInfluence.stamp(...) at :1008-1016
}
```

**MOD 4 — thread real surface into footstep audio (D-13 bonus)** (`createGame.ts:1305-1314`): replace the hard-coded `'grass'`:
```typescript
if (isGrounded()) {
  movementAudio.updateUnit('me', 'player', playerPosition.x, playerPosition.z,
    OWN_STEP_GAIN, 0, 'grass');   // :1313 — replace 'grass' with surfaceAt(...) value
}
```
Compute `surfaceAt` ONCE per frame (share the value between MOD 3 and MOD 4 — single classifier call). The audio only fires the rustle on `=== 'grass'`, so non-grass simply skips it (no new audio code).

**MOD 5 — one `.update()` line** (`createGame.ts:1484`): after `smokeColumns?.update(...)`:
```typescript
smokeColumns?.update(deltaSeconds, playerPosition.x, playerPosition.z);   // :1484
```
Add: `dustPuffs?.update(deltaSeconds);` (dust needs no player pos in `update` — it ages the already-spawned pool; spawning is externally driven at MOD 3). Frame order context: `daynight.update()` `:1435`, `groundInfluence.update` `:1516`, `scorchMap.update` `:1517` (the bend/wear retunes flow through these existing lines — no wiring change).

---

### `src/game/audio/createMovementAudio.ts` (MOD — widen `FootstepSurface`) — WEAR-05/D-13

**Analog:** self. One-token type widen; the play path already conditionally fires on `'grass'`.

**The type to widen** (`createMovementAudio.ts:14`):
```typescript
export type FootstepSurface = 'grass';   // → 'grass' | 'dirt' | 'path' | 'town'
```
`updateUnit(..., surface?)` (`:238-246`) and `playStep(..., surface)` (`:215-236`) already thread the value through. The grass-rustle gate is at `:232`:
```typescript
if (surface === 'grass') playGrassRustle(context, level, out, now);
```
No behavior change beyond the wider type — non-grass surfaces skip the rustle (the intended D-13 bonus). Align the `Surface` type from `surfaceAt.ts` with this (same string tags), or import one from the other to keep a single tag set.

---

## Shared Patterns

### Zero-per-frame-allocation (closure scratch, mutate in place)
**Source:** `createSmokeColumns.ts:101-107` (`scratchMatrix`/`scratchPosition`/`scratchScale`/`scratchQuaternion`/`upAxis` constructed ONCE); `:189-194` (`scratchMatrix.compose(...)` reused every puff).
**Apply to:** `createDustPuffs.ts` (spawn + update paths) and `surfaceAt.ts` (returns a string literal — no object). The documented 144→20fps cliff class forbids `new Matrix4()`/`new Vector3()`/`new Color()` per frame.

### Seeded, deterministic build-time placement
**Source:** `createMondstadtWorld.ts:358` (`createSeededRandom(WORLD_DECOR_SEED)`), `:606` (own-salt RNG per decor pass); `grassPlacement.ts:46` (`createSeededRandom(GRASS_SEED)`); `roads.ts:26,38` (lazy memoized route cache).
**Apply to:** prop placement (`WORLD_DECOR_SEED ^ salt`), `getFootpaths()` (memoized like `getRoads`), footpath grass thinning (`random() < foot`). Every client must bake identical props/paths.

### Single source of truth for "what surface is here"
**Source:** `roads.ts:89-94` doc ("The ONE source of truth for 'is this a road here'") — terrain tint, grass rejection, and lantern placement all read `roadFactor`.
**Apply to:** `footpathFactor` (terrain tint + grass thinning + `surfaceAt`) and `surfaceAt` (dust gating + footstep audio). The `> 0.5` road threshold in `surfaceAt` MUST match `grassPlacement.ts:74`.

### Frozen-matrix static meshes (place before the freeze)
**Source:** `createMondstadtWorld.ts:660-661` (`updateMatrixWorld(true)` then `matrixWorldAutoUpdate = false`); prop placement all above it.
**Apply to:** crates/barrels/fences via `placeAsset` before `:660`. Dust `InstancedMesh` goes on `scene` root (`createSmokeColumns.ts:98-99`), NOT the frozen group.

### Named-light discipline / NO light on props
**Source:** `createCampfire.ts:72-78` + `createLantern.ts:123-131` (`light.name = ...`, `light.layers.enableAll()`); `createLantern.ts:56-62` (`withLight:false` — emissive-only, no PointLight, because every real light is looped per-fragment by every lit material).
**Apply to:** props carry NO PointLight (D-10). If any prop ever needs a glow, use an emissive `MeshBasicMaterial` body (lantern lamp pattern), never a new light.

### Perf-bisect kill-switch flag
**Source:** `createGame.ts:330-345` (`?nograss`/`?nobend`/`?nowind`/`?nosmoke`/`?nodaynight`); construction-skip at `:414-418`.
**Apply to:** `?nodust` (D-14). Bend/scorch retunes reuse the existing `?nobend` (`:341`); footpaths are a static bake (no flag).

## No Analog Found

None. Every file has a shipped in-repo precedent. Two pieces have no line-for-line twin but a clear template:

| Piece | Role | Why no exact analog | Guidance |
|-------|------|---------------------|----------|
| `surfaceAt.ts` composition | utility | No existing single fn composes road+footpath+town | 4-line composition of `roadFactor`/`footpathFactor`/`isInTown` (RESEARCH Pattern 5) — trivial, purity mirrors `windMath.ts` |
| `getFootpaths()` route graph | world math | `getRoads()` builds one fixed city→island route; footpaths need a multi-endpoint graph (camps/bridges/plaza) | Same memoize + polyline shape as `getRoads` (`roads.ts:37-64`); endpoints from `getCampSites`/`getBridges`/origin, same-island segments only (Open Question 1) |

## Metadata

**Analog search scope:** `src/game/systems/`, `src/game/systems/__tests__/`, `src/game/world/`, `src/game/world/assets/`, `src/game/world/town/`, `src/game/audio/`, `src/game/createGame.ts`
**Files scanned:** createSmokeColumns.ts, groundInfluenceMath.ts, groundInfluenceMath.test.ts, createCampfire.ts, createLantern.ts, assetHelpers.ts, types.ts, roads.ts, grassPlacement.ts, terrain.ts, camps.ts, createMovementAudio.ts, createMondstadtWorld.ts, createGame.ts
**Pattern extraction date:** 2026-07-18
