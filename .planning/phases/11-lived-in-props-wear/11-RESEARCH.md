# Phase 11: Lived-in Props & Wear - Research

**Researched:** 2026-07-18
**Domain:** three.js client rendering — pure-math retunes, static world bakes, one pooled-sprite system (zero new deps, zero server work)
**Confidence:** HIGH (every claim grounded in in-repo source read this session + verified arithmetic)

## Summary

This is a **tune-existing-systems + static-bake + one-new-pooled-sprite** phase, not green-field. All five requirements map onto seams that already exist and are already wired into `createGame.frame()`. Two requirements (WEAR-03, WEAR-04) are **single-constant retunes** of `groundInfluenceMath.ts` plus a test update; one (WEAR-01) extends the existing `roads.ts` → `terrain.ts` → `grassPlacement.ts` pipeline with a *lighter* worn-path tier baked once at build; one (WEAR-02) adds three box-voxel asset factories mirroring `createCampfire`; one (WEAR-05) adds a `createSmokeColumns`-shaped ground-hugging dust pool fed by a new pure `surfaceAt(x,z)` classifier that also fixes the hard-coded `'grass'` footstep surface.

The real risk is **not** algorithmic difficulty — it is the client-performance cliff class documented in CLAUDE.md (the 144→20fps regression). The dust pool and `surfaceAt()` are the only new per-frame code; both must be zero-alloc, mutate-in-place, GPU-readback-free, and carry the `?nodust` bisect flag. Everything else is either a build-time bake (footpaths, props — free after the world freeze) or a pure constant (bend/scorch — no new per-frame cost at all).

**Primary recommendation:** Do the two constant retunes + their test updates first (smallest, highest-confidence, unblocks perceptual tuning); add `footpathFactor` as a **sibling of `roadFactor` in `roads.ts`** that feeds terrain color + grass thinning but **NOT** the `aRoad` attribute (so it gets the light baked tint, never the packed-dirt/cart-rut fragment shader); build the three prop factories on the `createCampfire` template; and land the dust pool + `surfaceAt()` classifier last so the classifier can also thread real surface into the footstep-audio seam in the same change.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Footpaths reuse the existing `roads.ts` spline system as a new lighter "worn path" tier — NOT a separate subsystem. A worn path = narrower, lighter-tint road that only *partially* thins grass (trampled, not bare packed-dirt).
- **D-02:** Route set is the real traffic graph: camp↔camp (from `getCampSites()`), plaza↔bridge, plaza↔camp. Anchors are data-driven from existing `camps.ts` / plaza / bridge positions — never hand-placed magic coordinates.
- **D-03:** Grass thinning along paths reuses the `grassPlacement.ts` rejection seam. Worn-path tier gets a *softer* thinning threshold than full roads so blades still poke through. Tint via `terrainColorAt` — a lighter dirt over grass, distinct hue from `ROAD_DIRT 0x9a7a4e`, driven by a footpath factor.
- **D-04:** Retune the single shared bend-decay clock to ~2s. `groundInfluenceMath.DECAY_PER_FRAME_AT_60` (currently `0.985` ≈ 4–5s) drops to the ~2s value. NO second influence texture — the flatten channel (B) is the bend-trail channel; one shared clock serves player + enemies + landing thump.
- **D-05:** Bend behavior verified via `groundInfluenceMath` unit tests (pure twin, THREE-free) — assert the new decay reaches <~10% by ~2s at 60fps.
- **D-06:** Raise the shared `WEAR_REGROW_TIME_CONSTANT_SECONDS` from `25` → ~75s (heals over ~2–3 min). Drives BOTH the scorch map (A/R) and the wear-A channel; keep them shared. `SCORCH_PER_STRIKE = 0.21` stays. Verify regrow curve in the pure math test.
- **D-07:** Footpaths are the STATIC bake (D-01); the dynamic wear-A channel stays for emergent trampling where players linger, now healing at the slower ~75s.
- **D-08:** Add 3 new frozen-matrix voxel assets — `createCrate`, `createBarrel`, `createFence` — mirroring the existing voxel-box factories. Lanterns already exist (`createLantern`) — reuse, don't rebuild.
- **D-09:** Placement is deterministic (seeded off `WORLD_DECOR_SEED`), at build time BEFORE the world freeze, via `placeAsset` (singles) / `addInstancedMatrices` (frozen batch). Crates/barrels stacked at the market edge near the fountain; fence runs line path entries / plaza boundary gaps. Counts are Claude's discretion (~6–10 crates/barrels, 2–3 short fence runs).
- **D-10:** All props are static (no per-frame cost). No new lights beyond the existing plaza lanterns.
- **D-11:** New dedicated pooled puff system `createDustPuffs` (small InstancedMesh pool ~24) mirroring `createSmokeColumns` but ground-hugging (low kick, quick settle, no tall rise).
- **D-12:** Shared `surfaceAt(x,z)` classifier (grass | dirt/path | town) from `roadFactor` + the new footpath factor + `isInTown` — no GPU texture read, no per-frame alloc. Dust spawns only on dirt/path/town, never grass. Single source of truth.
- **D-13:** The same `surfaceAt()` feeds the already-wired footstep-audio seam `createMovementAudio.updateUnit(..., surface?)` — currently hard-coded `'grass'` at `createGame.ts:1305-1314`. Threading real surface is a low-cost bonus; no new audio work beyond passing the value.
- **D-14:** Perf-bisect flag `?nodust` for the new pool. Bend/scorch retunes are covered by existing `?nobend`; footpaths are a static bake (no flag needed).

### Claude's Discretion
- Exact retuned decay/regrow numeric values (D-04/D-06) — hit the *feel*, pin the behavior in tests, not the magic constant.
- Prop counts, exact plaza arrangement, footpath tint hue, dust pool size / puff sprite look.
- Whether `createBarrel` ships or crate+fence suffice for the "lived-in" read.

### Deferred Ideas (OUT OF SCOPE)
- Weather (rain, puddles) — WTHR-01 (deferred).
- Time-of-day gameplay hooks — TODG-01 (needs server work, violates client-only scope).
- Grass-vs-dirt footstep-audio *full* treatment — D-13 threads the value through the existing seam only; any new per-surface audio design belongs to an audio phase.
- Wildlife (Phase 12), camera feel (Phase 13).
- The 4 keyword-false-positive todos (boost-orbit paths, deferred raid/combat specs, flower color) — NOT folded.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WEAR-01 | Worn footpaths along real routes (camp↔camp, plaza↔bridge) — static bake: grass thinned along path splines + ground tint strip (never the decaying channels) | New `footpathFactor()` in `roads.ts` (sibling of `roadFactor`, narrower/partial); route graph from `getCampSites()` + `getBridges()` + origin; tint baked per-vertex via `terrainColorAt`; partial thinning via `grassPlacement.ts` rejection seam. Static — no shader change, no per-frame cost. §Architecture Patterns 1–2 |
| WEAR-02 | Plaza lived-in props — crates/barrels/fences/lanterns, frozen-matrix static meshes | `createCrate`/`createBarrel`/`createFence` on the `createCampfire` box-voxel template; `placeAsset`/`addInstancedMatrices` before the freeze at `createMondstadtWorld.ts:660`; deterministic off `WORLD_DECOR_SEED`; anchors from `TOWN_DISTRICTS` market tiles + fountain origin. §Architecture Pattern 3 |
| WEAR-03 | Scorch marks regrow — battle wear heals over minutes | `WEAR_REGROW_TIME_CONSTANT_SECONDS` 25→75 (one constant, shared by `createScorchMap` + `createGroundInfluence` wear channel). Verified arithmetic §Code Examples 1. MUST update stale test `groundInfluenceMath.test.ts:81-85`. |
| WEAR-04 | ~2s grass-bend trail — existing groundInfluence bend decay tuned/verified | `DECAY_PER_FRAME_AT_60` 0.985→0.980 (`decayForDelta(2) < 0.10`). Frame-rate-independent already. Cross-consumer verified: only the grass shader reads channel B, no CPU readback → no breakage. §Code Examples 1 |
| WEAR-05 | Sprint steps on dirt/path puff pooled dust sprites | `createDustPuffs` pool on the `createSmokeColumns` template, ground-hugging; spawn gated by pure `surfaceAt(x,z) !== 'grass'`; `?nodust` flag; one `.update()` line after `smokeColumns.update` at `createGame.ts:1484`. NOTE: no `sprint` state exists — gate on `isMoving && isGrounded`. §Architecture Pattern 4 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **≤300 LOC functional per file, no monolith.** `createGame.ts` is ~1,963 LOC (the worst offender) — keep all new logic in sibling factories (`createDustPuffs.ts`, new functions in `roads.ts`/`terrain.ts`), only *wire* in `createGame.ts`. New asset factories are their own files under `world/assets/`.
- **No legacy / dead code.** The retunes change constants in place — do not leave the old value commented. Update the stale test rather than adding a parallel one.
- **Client performance rules (the milestone's real risk).** No per-frame allocations; no GPU texture readbacks; game-loop-owned clocks (never React); frozen matrices; pooled materials. `surfaceAt()` and the dust pool are the only new per-frame surfaces and must obey all of these.
- **Every new per-frame system ships a `?no*` bisect flag** (`?nodust`).
- **SpacetimeDB rules** apply to server work only — this phase is client-only, zero publishes, zero reducers, zero schema. No SpacetimeDB surface touched.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Footpath route geometry | Client / build-time world factory | — | Pure deterministic math from existing island/camp/bridge data; baked into terrain vertex color + grass placement once |
| Footpath ground tint | Client / GPU (baked vertex attribute) | — | `terrainColorAt` runs once per vertex at `createTerrainMesh`; color is a static buffer attribute, no runtime shader work |
| Grass thinning along paths | Client / build-time (`generateGrassBlades`) | — | Blade set generated once at world build; rejection is CPU, pure, deterministic |
| Plaza props | Client / build-time world factory | — | Frozen-matrix static meshes added before `matrixWorldAutoUpdate=false` |
| Bend-trail decay | Client / GPU (ping-pong fade pass) | Client / pure math (`groundInfluenceMath`) | Decay runs in the existing per-frame fade shader; the *rate* is a pure constant |
| Scorch/wear regrow | Client / GPU (ping-pong fade pass) | Client / pure math | Same — shared `wearDecayForDelta` constant |
| Dust puffs | Client / per-frame CPU + one InstancedMesh draw | — | The only new per-frame draw-call source; pooled, hard-capped |
| Surface classification | Client / pure CPU (`surfaceAt`) | — | Zero-alloc pure function; feeds dust gating + footstep audio |

**No tier misassignment risk:** every capability lives client-side (client-only milestone). The one thing to guard is keeping footpath tint on the *baked vertex color* path (correct, free) rather than accidentally routing it through the `aRoad` fragment branch (wrong look + would need a shader edit).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| three | ^0.185.1 | All rendering, InstancedMesh pools, RawShaderMaterial ping-pong maps | Already the project's only 3D dependency; every seam in this phase is built on it [VERIFIED: package.json] |
| vitest | 3.2.4 | Pure-math unit tests for the retunes (WEAR-03/04) | Established test runner; existing `groundInfluenceMath.test.ts` uses it [VERIFIED: package.json] |

### Supporting
Zero new packages. This phase adds **no dependencies** (locked constraint). All work reuses in-repo modules:
`groundInfluenceMath.ts`, `createGroundInfluence.ts`, `createScorchMap.ts`, `roads.ts`, `terrain.ts`, `grassPlacement.ts`, `camps.ts`, `bridges.ts`, `town/townPlan.ts`, `createMondstadtWorld.ts`, `assets/createCampfire.ts`, `assets/assetHelpers.ts`, `assets/types.ts`, `systems/createSmokeColumns.ts`, `audio/createMovementAudio.ts`, `createGame.ts`.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extending `roads.ts` with a footpath tier | A second spline/mask subsystem | Rejected by D-01: would duplicate spline→factor→grass-thinning→tint three times |
| One shared bend-decay clock | A second influence render target for the trail | Rejected by D-04: extra GPU target + complexity for zero benefit; all bend sources want the same feel |
| `createSmokeColumns` pattern for dust | `createDebrisSystem` (cube-shatter) / `createEffectSystem` (combat FX) | Rejected by D-11: wrong look / wrong domain; reuse the *pool pattern*, not the systems |

**Installation:** None. `pnpm install` already satisfies all needs (repo uses pnpm, not npm — see MEMORY).

## Package Legitimacy Audit

**Not applicable — this phase installs zero external packages.** All code reuses existing in-repo modules and the already-present `three` + `vitest`. No registry lookups, no new `package.json` entries. If the planner discovers a task that would add a dependency, that task is out of scope (zero-new-dependencies is a locked constraint) and must be flagged rather than executed.

## Architecture Patterns

### System Architecture Diagram

```
                         BUILD TIME (once, then frozen)
  ┌────────────────────────────────────────────────────────────────────────┐
  │  getCampSites()  getBridges()  origin(0,0)  TOWN_DISTRICTS               │
  │        │              │            │              │                       │
  │        └──────┬───────┴────────────┘              │                       │
  │               ▼                                    ▼                       │
  │        footpath route polylines            prop anchor points             │
  │        (roads.ts: FOOTPATHS)               (market edge, path gaps)        │
  │               │                                    │                       │
  │        ┌──────┴───────┐                     placeAsset / addInstancedMatrices
  │        ▼              ▼                             │ (WORLD_DECOR_SEED)     │
  │  footpathFactor   footpathFactor            createCrate/Barrel/Fence        │
  │        │              │                            │                       │
  │        ▼              ▼                            ▼                       │
  │  terrainColorAt   grassPlacement            group.add(...)                 │
  │  (baked vertex    (softer rejection                │                       │
  │   color, tint)     → partial thin)                 ▼                       │
  │        │              │                     group.updateMatrixWorld(true)   │
  │        └──────┬───────┘                     matrixWorldAutoUpdate = false   │
  │               ▼                                    (L660-661) ── FROZEN     │
  └────────────── terrain mesh + grass field ─────────────────────────────────┘

                         PER FRAME  (createGame.frame)
  ┌────────────────────────────────────────────────────────────────────────┐
  │  input → updateLocalPlayer ──► isMoving && isGrounded                     │
  │                                     │                                      │
  │                                     ▼                                      │
  │                          surfaceAt(px,pz)  ◄── roadFactor + footpathFactor │
  │                             │        │           + isInTown  (pure, no GPU)│
  │              surface≠grass  │        │  surface value                      │
  │                             ▼        ▼                                      │
  │                   dustPuffs.spawn   movementAudio.updateUnit(...,surface)  │
  │                             │            (L1306 — replaces hard 'grass')   │
  │                             ▼                                              │
  │   frame(): wind.update → daynight.update → ... → smokeColumns.update       │
  │            → dustPuffs.update(dt, px, pz)      ← NEW single line           │
  │            → groundInfluence.update(renderer, dt)  (fade uses decayForDelta │
  │            → scorchMap.update(renderer, dt)         + wearDecayForDelta)   │
  └────────────────────────────────────────────────────────────────────────┘
```

Component responsibilities (file → job):

| File | New/Modified | Responsibility |
|------|--------------|----------------|
| `systems/groundInfluenceMath.ts` | MOD (2 constants) | `DECAY_PER_FRAME_AT_60` 0.985→0.980; `WEAR_REGROW_TIME_CONSTANT_SECONDS` 25→75 |
| `systems/__tests__/groundInfluenceMath.test.ts` | MOD | Update stale wear assertion (lines 81-85); add bend-2s + wear-~75s + frame-rate-independence assertions |
| `world/roads.ts` | MOD | Add `getFootpaths()` (route polylines) + `footpathFactor(x,z)` (narrower/partial sibling of `roadFactor`) |
| `world/terrain.ts` | MOD | `terrainColorAt` blends a light trampled tint by `footpathFactor` (baked per-vertex; no shader edit) |
| `world/grassPlacement.ts` | MOD | Softer probabilistic footpath rejection (thin, not clear) via `footpathFactor` |
| `world/assets/createCrate.ts` | NEW | Box-voxel crate factory (`WorldAsset`) |
| `world/assets/createBarrel.ts` | NEW | Box/oct-voxel barrel factory (`WorldAsset`) — discretion whether to ship |
| `world/assets/createFence.ts` | NEW | Post+rail run factory (`WorldAsset`) |
| `world/createMondstadtWorld.ts` | MOD | Place props before freeze (deterministic anchors, seeded) |
| `systems/surfaceAt.ts` (or in `roads.ts`) | NEW | Pure `surfaceAt(x,z): 'grass'|'dirt'|'path'|'town'` classifier |
| `systems/createDustPuffs.ts` | NEW | Ground-hugging pooled InstancedMesh puff system |
| `audio/createMovementAudio.ts` | MOD | Widen `FootstepSurface` from `'grass'`-only |
| `createGame.ts` | MOD | `?nodust` flag; construct `createDustPuffs`; one `.update()` line; call `surfaceAt` at the L1306 step + dust spawn |

### Recommended Project Structure
```
src/game/
├── systems/
│   ├── groundInfluenceMath.ts        # MOD: two constants
│   ├── createDustPuffs.ts            # NEW: ground-hugging pool
│   ├── surfaceAt.ts                  # NEW: pure classifier (or fold into roads.ts)
│   └── __tests__/
│       ├── groundInfluenceMath.test.ts   # MOD: retune assertions
│       └── surfaceAt.test.ts             # NEW: classifier boundaries
├── world/
│   ├── roads.ts                      # MOD: footpath spline tier
│   ├── terrain.ts                    # MOD: footpath tint in terrainColorAt
│   ├── grassPlacement.ts             # MOD: footpath thinning
│   ├── createMondstadtWorld.ts       # MOD: place props before freeze
│   └── assets/
│       ├── createCrate.ts            # NEW
│       ├── createBarrel.ts           # NEW
│       └── createFence.ts            # NEW
└── createGame.ts                     # MOD: wire dust + surfaceAt + flag
```

### Pattern 1: Worn-path tier as a `roadFactor` sibling — DISTINCT from `aRoad`

**What:** Footpaths are a second, narrower, partial spline mask that shares the `roads.ts` machinery but is deliberately kept OUT of the `aRoad` vertex attribute.

**Why it matters (the key insight):** `terrain.ts` uses the road in TWO different places with different mechanisms:
1. **`terrainColorAt(x,z,height)`** (line 155-156) — runs once per vertex at build (`createTerrainMesh` loop, line 337), blends `ROAD_DIRT` into the *baked vertex color* by `roadFactor`. This is the STATIC, correct path — no shader change, zero per-frame cost.
2. **The fragment shader** (lines 272-291), gated on `if (vRoad > 0.02)` where `vRoad` = the `aRoad` attribute — paints packed-dirt pixel clods + cart-wheel ruts. This is the *packed-dirt road* look, WRONG for a worn footpath.

So the worn-path tier must feed **only path (1)**: add a light trampled tint in `terrainColorAt` driven by `footpathFactor`, and must **NOT** be written into `aRoad`/`aRoadCross` (leave those = `roadFactor`/`roadAcross`). Result: footpaths get a subtle baked tint + blades poking through, real roads keep their packed-dirt ruts. No shader edit, no per-frame cost.

**When to use:** WEAR-01.

**Example (footpathFactor sibling in `roads.ts`):**
```typescript
// Source: mirrors roads.ts:95-105 (roadFactor), narrower + partial
export const FOOTPATH_HALF_WIDTH = 1.1;   // narrower than ROAD_HALF_WIDTH 2.5
const FOOTPATH_BLEND = 1.0;
const FOOTPATH_MAX = 0.6;                  // partial: never a full clear like a road

let cachedFootpaths: RoadPoint[][] | null = null;

export function getFootpaths(): RoadPoint[][] {
  if (cachedFootpaths) return cachedFootpaths;
  const paths: RoadPoint[][] = [];
  const camps = getCampSites();          // from ./camps
  const bridges = getBridges();          // from ./bridges
  const PLAZA_EXIT = 16;
  // plaza → each bridge city-landing (real traffic to the crossings)
  for (const b of bridges) {
    const len = Math.hypot(b.startX, b.startZ) || 1;
    paths.push([
      { x: (b.startX / len) * PLAZA_EXIT, z: (b.startZ / len) * PLAZA_EXIT },
      { x: b.startX, z: b.startZ },
    ]);
    // bridge outer-landing → the camp on that outer island (the "last mile")
    const camp = nearestCampTo(camps, b.endX, b.endZ);
    if (camp) paths.push([{ x: b.endX, z: b.endZ }, { x: camp.x, z: camp.z }]);
  }
  // plaza → city-island camps, and city camp ↔ city camp (same-island foot traffic)
  const cityCamps = camps.filter(c => onCityIsland(c));
  for (const c of cityCamps) paths.push([{ x: 0, z: 0 }, { x: c.x, z: c.z }]);
  if (cityCamps.length >= 2)
    paths.push([{ x: cityCamps[0].x, z: cityCamps[0].z },
                { x: cityCamps[1].x, z: cityCamps[1].z }]);
  cachedFootpaths = paths;
  return paths;
}

// Same distanceToSegment/smoothstep helpers already in roads.ts.
export function footpathFactor(x: number, z: number): number {
  let best = 0;
  for (const path of getFootpaths()) {
    for (let i = 0; i < path.length - 1; i += 1) {
      const d = distanceToSegment(x, z, path[i].x, path[i].z, path[i + 1].x, path[i + 1].z);
      const f = smoothstep(FOOTPATH_HALF_WIDTH + FOOTPATH_BLEND, FOOTPATH_HALF_WIDTH, d);
      if (f > best) best = f;
    }
  }
  return best * FOOTPATH_MAX;             // partial by construction
}
```
Segments only ever connect endpoints on the SAME island (plaza→bridge-start both on the city island; bridge-end→camp both on the outer island) — never spanning the water gap, so `distanceToSegment` never bakes a "path across the sea." The bridge itself carries the crossing. [VERIFIED: roads.ts, camps.ts, bridges.ts read this session]

**Tint in `terrainColorAt` (baked, no shader change):**
```typescript
// Source: terrain.ts:143-158 — add BEFORE the road blend so road wins on overlap
const FOOTPATH_TINT = new THREE.Color(0x7d8a54); // desaturated trampled-grass, lighter than ROAD_DIRT 0x9a7a4e
// ...inside terrainColorAt, after meadow blends, before the road block:
const foot = footpathFactor(x, z);
if (foot > 0) grassColor.lerp(FOOTPATH_TINT, foot * 0.5);
const road = roadFactor(x, z);
if (road > 0) grassColor.lerp(ROAD_DIRT, road * 0.9);   // road overrides on overlap
```

### Pattern 2: Partial grass thinning (worn, not cleared)

**What:** `generateGrassBlades` already hard-rejects blades where `roadFactor > 0.5` (line 74). Footpaths need *probabilistic* thinning so blades still poke through.

**When to use:** WEAR-01, D-03.

**Example:**
```typescript
// Source: grassPlacement.ts:74-75 (existing hard rejections)
if (roadFactor(x, z) > 0.5) continue;      // roads: full clear (unchanged)
if (isInTown(x, z)) continue;              // pavement (unchanged)
// Footpath: probabilistic thinning — keep ~ (1 - factor) of blades.
const foot = footpathFactor(x, z);
if (foot > 0 && random() < foot) continue; // partial: trampled, not bare
```
`random()` is the seeded generator already threaded through the function — deterministic. Because `footpathFactor` is capped at `FOOTPATH_MAX = 0.6`, at most ~60% of blades are removed on the path spine, tapering to 0 at the edges. [VERIFIED: grassPlacement.ts read this session]

**⚠️ Test impact:** `world/__tests__/grassPlacement.test.ts` exists and asserts blade/cluster behavior (the last commit `d643c24` fixed a "stale meadow-cluster assertion"). Adding footpath thinning changes blade counts near path splines — the planner MUST re-run and, if needed, update this test.

### Pattern 3: Box-voxel prop factories on the `createCampfire` template

**What:** `createCrate`/`createBarrel`/`createFence` are siblings of the existing voxel-box factories.

**Two template shapes are already in the repo:**
- `createCampfire.ts` (individual `THREE.Mesh` boxes added to a `Group`, `lambert(color)`, `randomBetween`/`randomIntBetween`, seeded) — simplest.
- `createLantern.ts` (merges same-material boxes with `mergeGeometries` into one draw call via `mergedMesh`, `edgeLit(color)` flat-shaded, pre-translated `box(w,h,d,x,y,z)` helper). **Preferred** for multi-box props — fewer draw calls.

**When to use:** WEAR-02.

**Example (crate — return a `WorldAsset` with a collision obstacle):**
```typescript
// Source: mirrors createLantern.ts:1-16 (box/mergedMesh helpers) + createCampfire.ts:34 shape
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { SeededRandom, WorldAsset } from './types';
import { edgeLit, randomBetween } from './assetHelpers';

const CRATE_WOOD = 0x8a6a3f;
export function createCrate(random: SeededRandom): WorldAsset {
  const s = randomBetween(random, 0.7, 0.95);
  const geos = [ /* six thin planks framing a cube, pre-translated with box(...) */ ];
  const group = new THREE.Group();
  group.add(mergedMesh(geos, edgeLit(CRATE_WOOD)));
  group.rotation.y = randomBetween(random, -0.15, 0.15);
  // Solid so entities path around it — placeAsset pushes this into obstacles.
  return { group, obstacles: [{ x: 0, z: 0, radius: s * 0.6, height: s }] };
}
```
`WorldAsset.obstacles` (types.ts:22-36) is honored by `placeAsset` (createMondstadtWorld.ts:367-375) — crates/barrels/fence posts should declare footprints so players can't walk through them. Fences are runs: build the whole run inside one factory (posts + rails merged), one `placeAsset` call, one obstacle per post. [VERIFIED: createLantern.ts, createCampfire.ts, types.ts, createMondstadtWorld.ts read this session]

**Placement (before the freeze):**
```typescript
// Source: createMondstadtWorld.ts:601-620 (lantern-ring precedent), placed BEFORE L660 freeze.
// Own seeded RNG so counts/jitter are deterministic + independent of prior draws.
const propRandom = createSeededRandom(WORLD_DECOR_SEED ^ 0xc4a7e);
// Market tiles are at (STEP, 0) and (STEP, -STEP); STEP = DISTRICT_HALF*2 = 15. Fountain at origin.
// Stack crates/barrels along the market-tile edge FACING the fountain (the "who put this here" read).
// ... placeAsset(createCrate(propRandom), x, z, collisionRadius) for ~6-10 anchors.
// Fence runs at plaza-boundary gaps / path entries: placeAsset(createFence(propRandom), x, z).
```
Market district anchors come from `TOWN_DISTRICTS` (`market-e` cx=STEP cz=0, `market-ne` cx=STEP cz=-STEP; `DISTRICT_HALF=7.5`, `STEP=15`) — data-driven, not magic coordinates. [VERIFIED: townPlan.ts read this session]

### Pattern 4: Ground-hugging pooled dust on the `createSmokeColumns` template

**What:** A fixed-pool `InstancedMesh` of small opaque voxel puffs, hard-capped, slot-recycled, zero per-frame alloc — but low/quick instead of tall/rising.

**When to use:** WEAR-05.

**Delta from `createSmokeColumns` (which is the exact template):**
| Smoke (existing) | Dust (new) |
|---|---|
| `SMOKE_POOL_SIZE = 48` | `DUST_POOL_SIZE ≈ 24` (D-11) |
| Emitters = static camp fires | Emitter = the moving player (spawn at foot position on a step) |
| `RISE_SPEED = 0.8`, `MAX_RISE = 4.5` (tall wisp) | Low kick (~0.15–0.3 up) + quick settle; `MAX_RISE ≈ 0.4`, short `PUFF_LIFE ≈ 0.4–0.6s` |
| Lateral drift on wind gust | Small backward/outward kick from movement dir; minimal wind |
| `SIZE_TIERS = [0.3,0.24,0.18,0.11]` shrinking | Smaller tiers, e.g. `[0.18,0.14,0.10,0.06]`, dusty tan color |
| Opaque `MeshLambertMaterial`, fade toward sky color | Opaque Lambert, fade toward ground/sky — **opaque, not alpha** (alpha bands under the nearest-filter pixel target, D-09/smoke comment lines 39-40) |
| Spawn cadence per fire | Spawn one puff per footstep-equivalent while `surfaceAt !== 'grass'` |

**Critical reuse:** copy the closure-scratch discipline verbatim (`createSmokeColumns.ts:101-107`: `scratchMatrix`/`scratchPosition`/`scratchScale`/`scratchQuaternion`/`upAxis` constructed ONCE), the `DynamicDrawUsage` flags, `frustumCulled=false`, `castShadow=false`, and the `matrixDirty`/`colorDirty` needsUpdate gating. Add `mesh` to `scene` (root, not the frozen world group) — same as smoke line 98-99. [VERIFIED: createSmokeColumns.ts read this session]

**Spawn gating (in `createGame.ts`, at/near the player step):**
```typescript
// Source: createGame.ts:1305-1315 (the isGrounded/isMoving step site)
// There is NO sprint state in the codebase (grep: zero `sprint` hits in createGame.ts).
// "Sprint steps" = normal running. Gate on movement + non-grass surface.
if (isGrounded() && isMoving) {
  const surface = surfaceAt(playerPosition.x, playerPosition.z);
  if (surface !== 'grass') dustPuffs?.spawn(playerPosition.x, playerPosition.z, worldMoveX, worldMoveZ);
  movementAudio.updateUnit('me', 'player', playerPosition.x, playerPosition.z,
    OWN_STEP_GAIN, 0, surface);              // D-13: replaces hard-coded 'grass'
}
```
Note `isMoving` is computed in `updateLocalPlayer` (line 995); the step audio call currently lives in `updateFootsteps` (line 1305) which only checks `isGrounded()`. The planner should decide whether to spawn dust in `updateLocalPlayer` (where `isMoving` + `worldMoveX/Z` are in scope, lines 995-1018) or thread a small movement flag to `updateFootsteps`. The `updateLocalPlayer` site is cleaner (movement direction already computed for the wear stamp at lines 1008-1016).

**`?nodust` flag + `.update()` line:**
```typescript
// Source: createGame.ts:345 (nosmoke), 416-418 (conditional construction), 1484 (smoke update line)
const dustEnabled = !perfFlags.has('nodust');
const dustPuffs = dustEnabled ? createDustPuffs(scene) : undefined;
// ...in frame(), right after smokeColumns?.update(...) at L1484:
dustPuffs?.update(deltaSeconds, playerPosition.x, playerPosition.z);
```
Extend the flag comment at `createGame.ts:330-331` to list `?nodust`. [VERIFIED: createGame.ts read this session]

### Pattern 5: Pure `surfaceAt(x,z)` classifier

**What:** One THREE-free pure function returning the ground surface at a world point, composed from three functions that already exist and are already pure.

**When to use:** WEAR-05, D-12/D-13. Feeds dust gating AND footstep audio (single source of truth).

**Example:**
```typescript
// Source: composes roads.roadFactor, roads.footpathFactor (new), town/townPlan.isInTown
export type Surface = 'grass' | 'dirt' | 'path' | 'town';
export function surfaceAt(x: number, z: number): Surface {
  if (isInTown(x, z)) return 'town';
  if (roadFactor(x, z) > 0.5) return 'dirt';     // packed-dirt road
  if (footpathFactor(x, z) > 0.25) return 'path'; // worn footpath
  return 'grass';
}
```
Zero allocation, no GPU read, deterministic → unit-testable (mirror `grassPlacement`/`roads` pure-helper discipline). `roadFactor`/`footpathFactor` do a small loop over a handful of segments (memoized route lists) — cheap enough per frame; if profiling ever flags it, cache the last result keyed on quantized position. `FootstepSurface` in `createMovementAudio.ts` widens from `'grass'` to include the new tags; the audio only fires the rustle on `=== 'grass'` (line 232), so non-grass surfaces simply skip the rustle — the intended bonus, no new audio code. [VERIFIED: createMovementAudio.ts:14,232 read this session]

### Anti-Patterns to Avoid
- **Feeding `footpathFactor` into the `aRoad` attribute.** Triggers the packed-dirt + cart-rut fragment branch (`terrain.ts:272-291`) — wrong worn-path look and would force a shader edit. Keep footpaths on the baked vertex-color path only.
- **A second influence render target for the trail.** Rejected by D-04. The B channel already IS the bend trail; retune the one shared clock.
- **Per-frame allocation in `surfaceAt` or `createDustPuffs`.** The documented 144→20fps cliff class. Use closure scratch, mutate in place.
- **Alpha-blended dust sprites.** Bands under the nearest-neighbor pixel filter (smoke comment lines 39-40, D-09). Use opaque Lambert with stepped color fade.
- **Adding props / dust after `group.updateMatrixWorld(true); group.matrixWorldAutoUpdate=false` (L660-661).** Frozen-world contract; runtime scene adds to `group` are forbidden. Props go before the freeze; dust `InstancedMesh` goes on `scene` root, never the frozen group.
- **A new PointLight on any prop.** D-10 + the light-pool recompile ban. Crates/barrels/fences carry no light.
- **Leaving the stale wear test.** `groundInfluenceMath.test.ts:81-85` asserts the OLD 25s behavior and WILL fail after the retune — update it in the same change (no-legacy-code rule).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Frame-rate-independent decay | A new `dt`-scaled exp/pow helper | Existing `decayForDelta` / `wearDecayForDelta` (already `pow(d, dt*60)` / `exp(-dt/τ)`) | Already frame-rate-independent by construction; retune the constant only |
| Spline distance / road mask | A new geometry mask or distance field | `roadFactor`/`distanceToSegment`/`smoothstep` in `roads.ts` | Battle-tested, memoized, THREE-free; footpath is a parameter change |
| Deterministic placement RNG | `Math.random()` / a new PRNG | `createSeededRandom(WORLD_DECOR_SEED ^ salt)` | Every client must place identical props/paths; the seed convention is established |
| Pooled particle system | A fresh emitter/lifecycle from scratch | `createSmokeColumns` structure (pool, slot recycle, scratch matrices, needsUpdate gating) | Zero-alloc pooling + hard cap already solved; unbounded growth is a documented time bomb |
| Prop collision | Manual obstacle push | `WorldAsset.obstacles` honored by `placeAsset` | Existing contract; declaring footprints is a data change |
| Ground-height at a point | Mesh raycast | `getTerrainHeight(x,z)` (analytic) | No raycasts, deterministic; `placeAsset` already calls it |
| Surface for footstep audio | New per-surface audio design | Widen `FootstepSurface` + pass `surfaceAt()` | D-13: the seam exists; only the value is missing |

**Key insight:** Four of the five requirements are *parameter/data changes on existing machinery*. The only genuinely new code is `createDustPuffs` (a copy-with-deltas of `createSmokeColumns`) and `surfaceAt` (a 4-line composition of existing pure functions). Resist building new subsystems.

## Runtime State Inventory

Not a rename/refactor/migration phase — greenfield-additive on the client. No stored data, live service config, OS-registered state, secrets, or build artifacts carry any renamed string. **None — verified: this phase adds constants, pure functions, asset factories, and one pooled system; it renames nothing and touches no persistent/server state.**

## Common Pitfalls

### Pitfall 1: The retune silently breaks the existing wear test
**What goes wrong:** `groundInfluenceMath.test.ts:81-85` asserts `wearDecayForDelta(60) < 0.1`. At τ=75 it becomes `0.449` → test fails.
**Why it happens:** The test pins the OLD 25s absolute behavior.
**How to avoid:** Update those lines to the new curve (`>0.4` at 60s, `<0.1` at 180s) in the same commit as the constant change.
**Warning signs:** `pnpm exec vitest run` red on `groundInfluenceMath.test.ts` immediately after the constant edit.

### Pitfall 2: Footpath tint routed through the road fragment shader
**What goes wrong:** Footpaths render as packed-dirt with cart-wheel ruts instead of subtle worn grass.
**Why it happens:** Writing `footpathFactor` into `aRoad` / summing it with `roadFactor` in the vertex attribute.
**How to avoid:** Keep `aRoad = roadFactor` only; put the footpath tint solely in the baked `terrainColorAt` color.
**Warning signs:** Visible ruts/brown clods along camp↔camp routes.

### Pitfall 3: Grass thinning test regression
**What goes wrong:** `grassPlacement.test.ts` asserts blade/cluster counts; footpath rejection changes them.
**Why it happens:** Any thinning near a spline reduces blades in that region.
**How to avoid:** Re-run the grass test after the thinning change; update assertions to reflect the new deterministic counts (the last commit already did this once for the meadow change).
**Warning signs:** Red grass-placement test.

### Pitfall 4: Dust alpha banding / per-frame alloc
**What goes wrong:** Puffs shimmer/band or FPS drops during movement.
**Why it happens:** Alpha blending under the pixel filter; `new Matrix4()`/`new Vector3()` inside `update()`.
**How to avoid:** Opaque Lambert + stepped color fade (smoke precedent); construct all scratch once at closure level.
**Warning signs:** `?nodust` recovers FPS (that's the flag working — but the pool should be flat-cost regardless).

### Pitfall 5: Prop added after the world freeze
**What goes wrong:** Prop invisible or mispositioned; matrix not updated.
**Why it happens:** `placeAsset` after `matrixWorldAutoUpdate=false` at L661.
**How to avoid:** All prop placement between the existing decor placement (~L600) and the freeze (L660).
**Warning signs:** Prop at origin or not rendering.

## Code Examples

### Example 1: The two retunes (verified arithmetic)

```typescript
// groundInfluenceMath.ts

// WEAR-04: ~2s readable bend fade. 0.985 left 16.3% at 2s (too long).
// 0.980 → decayForDelta(2) = 0.0885 (<10% by 2s, D-05), decayForDelta(1)=0.298,
// decayForDelta(3)=0.0263 (gradual, gone by ~3s). 0.981 gives 0.1001 — too close
// to the <10% edge for a strict assertion; use 0.980.
const DECAY_PER_FRAME_AT_60 = 0.980;   // was 0.985

// WEAR-03/D-06: scorch + wear heal "over minutes". τ=75 → still 45% at 60s (a
// returning player sees fresh damage), <10% at 172.7s ≈ 2.88 min ("over minutes").
// Shared by createScorchMap (R) AND createGroundInfluence (wear A) — one edit, both.
const WEAR_REGROW_TIME_CONSTANT_SECONDS = 75;   // was 25
```

Verified compounded values (via `node`):
| t | `decayForDelta` @0.980 (bend) | `wearDecayForDelta` @τ75 (scorch/wear) |
|---|---|---|
| 1s | 0.298 | — |
| 2s | 0.0885 | — |
| 3s | 0.0263 | — |
| 30s | — | 0.670 |
| 60s | — | 0.449 |
| 120s | — | 0.202 |
| 180s | — | 0.091 |
| 225s | — | 0.050 |

`decayForDelta(2)` directly equals the 2-second compounded factor because `decayForDelta(dt)=pow(d, dt*60)` and the product over any frame subdivision of total time T is `pow(d, T*60)` — the test can call `decayForDelta(2)` instead of looping frames. [VERIFIED: arithmetic run this session; groundInfluenceMath.ts read this session]

### Example 2: Updated / added test assertions (WEAR-03/04, D-05)

```typescript
// groundInfluenceMath.test.ts

describe('decayForDelta (WEAR-04 — ~2s readable bend fade)', () => {
  it('is gradual, not instant, and mostly gone by ~2s', () => {
    expect(decayForDelta(1)).toBeGreaterThan(0.1);   // still visible at 1s
    expect(decayForDelta(2)).toBeLessThan(0.1);      // faded by ~2s (D-05)
    expect(decayForDelta(3)).toBeLessThan(0.03);     // essentially gone by 3s
  });
  it('is frame-rate independent (composition invariant)', () => {
    const half = decayForDelta(1 / 120);
    expect(half * half).toBeCloseTo(decayForDelta(1 / 60), 10);
  });
});

describe('wearDecayForDelta (WEAR-03 — scorch/wear heals over minutes)', () => {
  it('still reads after a minute, healed within a few minutes', () => {
    expect(wearDecayForDelta(60)).toBeGreaterThan(0.4);   // fresh damage on return
    expect(wearDecayForDelta(180)).toBeLessThan(0.1);     // "over minutes"
  });
  it('regrows much slower than the bend decay', () => {
    expect(wearDecayForDelta(1 / 60)).toBeGreaterThan(decayForDelta(1 / 60));
  });
  // REMOVE the old lines 81-85 (assert <0.1 at 60s) — stale after the retune.
});
```

Run: `pnpm exec vitest run src/game/systems/__tests__/groundInfluenceMath.test.ts`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Bend trail readable ~4–5s | ~2s readable fade | This phase (WEAR-04) | `DECAY_PER_FRAME_AT_60` 0.985→0.980; player sees their own recent path, gone within a couple seconds |
| Scorch/wear heal ~1 min | Heal over ~2–3 min | This phase (WEAR-03) | `WEAR_REGROW_TIME_CONSTANT_SECONDS` 25→75; battlefields stay marked longer |
| Footstep surface hard-coded `'grass'` | Real `surfaceAt()` value | This phase (WEAR-05/D-13) | No rustle on dirt/path/town; single classifier source |

**Deprecated/outdated:** nothing removed — additive. The two changed constants replace their old values in place (no dead code left behind).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Exact footpath route pairing (which camps connect to which, plaza-exit radius, nearest-camp choice) reads as the intended "real traffic graph" | Pattern 1 | Low — visual/discretion (D-02 fixes the endpoints as data-driven; the *pairing policy* is a judgment call the planner/perceptual UAT confirms) |
| A2 | `FOOTPATH_HALF_WIDTH ≈ 1.1`, `FOOTPATH_MAX ≈ 0.6`, tint `0x7d8a54` at 0.5 blend give a "worn, blades poke through" read distinct from packed-dirt roads | Patterns 1-2 | Low — Claude's-discretion tuning; adjust in perceptual UAT |
| A3 | `surfaceAt` per-frame cost (a few segment-distance loops) is negligible and needs no position-quantized cache | Pattern 5 | Low — route lists are short + memoized; if profiling flags it, add a 1-entry cache. `?nodust` isolates the dust half |
| A4 | Dust pool ~24, life ~0.4–0.6s, opaque tan tiers give a "subtle ground-hug puff" not a spray | Pattern 4 | Low — discretion; tune against the smoke precedent + UAT |
| A5 | Spawning dust in `updateLocalPlayer` (where `isMoving`/`worldMoveX,Z` are in scope) is preferable to threading a flag into `updateFootsteps` | Pattern 4 | Low — both work; a wiring choice for the planner |

**No assumptions carry compliance/security/retention/performance-contract risk.** All are cosmetic tuning values pinned by perceptual UAT, plus two behavior-pinned constants (A-log excludes those — they are VERIFIED by arithmetic + tests).

## Open Questions

1. **Camp↔camp pairing across islands**
   - What we know: outer islands have exactly 1 camp each; camps on different islands are separated by water (crossed by bridges).
   - What's unclear: whether "camp↔camp" should route outer-island camps to each other (via the bridge/plaza, effectively plaza↔camp segments) or only same-island camp pairs get a direct footpath.
   - Recommendation: same-island direct footpaths only (city island's 2 camps to each other + to plaza); outer camps reached via plaza→bridge→camp segments. No path drawn across water. Confirm in discuss/planning.

2. **Barrel inclusion (D — Claude's discretion)**
   - What we know: crate + fence may suffice for the lived-in read.
   - Recommendation: ship all three (barrel is a trivial variant of crate); drop barrel only if plan LOC budget is tight.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| three | all rendering | ✓ | ^0.185.1 | — |
| vitest | WEAR-03/04 tests | ✓ | 3.2.4 | — |
| pnpm | install/test scripts | ✓ (repo standard) | — | — |

**No external services, runtimes, or CLIs beyond the existing toolchain.** No SpacetimeDB server needed (client-only). No missing dependencies.

## Validation Architecture

> nyquist_validation is enabled (config.json `workflow.nyquist_validation: true`).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.2.4 |
| Config file | none dedicated — `scripts.test: "vitest run"` in package.json |
| Quick run command | `pnpm exec vitest run src/game/systems/__tests__/groundInfluenceMath.test.ts` |
| Full suite command | `pnpm test` (`vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WEAR-03 | Scorch/wear heals over minutes (τ=75: >0.4@60s, <0.1@180s; frame-rate-independent) | unit (pure) | `pnpm exec vitest run src/game/systems/__tests__/groundInfluenceMath.test.ts` | ✅ (MOD — update stale lines 81-85) |
| WEAR-04 | Bend trail <10% by 2s, gradual, frame-rate-independent | unit (pure) | same command | ✅ (MOD — add decayForDelta 2s block) |
| WEAR-05 | `surfaceAt(x,z)` returns correct grass/dirt/path/town at boundary points | unit (pure) | `pnpm exec vitest run src/game/systems/__tests__/surfaceAt.test.ts` | ❌ Wave 0 |
| WEAR-01 | Footpath route geometry + thinning deterministic; blades still poke through | unit (partial) + human | `pnpm exec vitest run src/game/world/__tests__/grassPlacement.test.ts` (counts) | ✅ (MOD — recheck counts); **visual = human-verify** |
| WEAR-01 | Footpath reads as worn/trampled, distinct from packed-dirt road | **human-verify only** | — (perceptual) | n/a |
| WEAR-02 | Plaza props read "who put this here" (arrangement/scale) | **human-verify only** | — (perceptual) | n/a |
| WEAR-05 | Dust puffs subtle, ground-hug, dirt/path only, no FPS regression | **human-verify + FPS harness** | `scripts/fps_playtest.py` (regression gate) | ✅ (FPS harness exists per MEMORY) |

### Test-provable vs human-verify-only
- **Test-provable (pure math / deterministic):** WEAR-03, WEAR-04 (full), WEAR-05 classifier logic, WEAR-01 deterministic blade counts + route geometry.
- **Human-verify-only (perceptual — no assertion can capture "reads as worn"/"reads as lived-in"/"subtle"):** WEAR-01 visual tint, WEAR-02 prop arrangement, WEAR-05 dust look. These get UAT perceptual checks.
- **Performance gate (not correctness):** WEAR-05 must not regress FPS — `scripts/fps_playtest.py` + `?nodust` bisect.

### Sampling Rate
- **Per task commit:** `pnpm exec vitest run src/game/systems/__tests__/groundInfluenceMath.test.ts` (retunes) or the touched test file.
- **Per wave merge:** `pnpm test` (full suite green).
- **Phase gate:** Full suite green + perceptual UAT (footpaths/props/dust) + FPS non-regression before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/game/systems/__tests__/surfaceAt.test.ts` — boundary cases for `surfaceAt()` (grass vs dirt vs path vs town) — covers WEAR-05 classifier.
- [ ] Update `src/game/systems/__tests__/groundInfluenceMath.test.ts` — remove stale wear assertion (lines 81-85), add bend-2s + wear-~75s blocks — covers WEAR-03/04.
- [ ] Recheck `src/game/world/__tests__/grassPlacement.test.ts` after footpath thinning — covers WEAR-01 determinism.
- [ ] Framework install: none — vitest present.

## Security Domain

> security_enforcement is enabled (ASVS level 1). This is a **client-only, cosmetic** phase: no network, no auth, no user input parsing, no persistence, no reducers, no new data surfaces.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth touched |
| V3 Session Management | no | No session touched |
| V4 Access Control | no | No access-control surface |
| V5 Input Validation | no | No new external input (`?nodust`/`?time` URL flags are boolean/numeric presence checks; `?time` already `Number()`-guarded at createGame.ts:370) |
| V6 Cryptography | no | None |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| URL query-flag tampering (`?nodust`) | Tampering | Boolean presence only; disables a cosmetic system — no privilege, no state change. No mitigation needed beyond the existing pattern |
| Client determinism divergence (props/paths differ per client) | — (not security) | Seeded RNG off `WORLD_DECOR_SEED` / fixed route data — all clients bake identical geometry |

**No security tasks required.** The only external inputs are cosmetic URL bisect flags matching the established `?no*` convention.

## Sources

### Primary (HIGH confidence — in-repo source read this session)
- `src/game/systems/groundInfluenceMath.ts`, `createGroundInfluence.ts`, `createScorchMap.ts` — decay math, channel contract, shared `wearDecayForDelta`.
- `src/game/systems/__tests__/groundInfluenceMath.test.ts` — stale assertion + test style.
- `src/game/world/roads.ts`, `terrain.ts`, `grassPlacement.ts`, `camps.ts`, `bridges.ts`, `town/townPlan.ts` — footpath pipeline seams, route anchors, tint bake, `aRoad` fragment gating.
- `src/game/world/createMondstadtWorld.ts` — `placeAsset`/`addInstancedMatrices`/`scatterAssets`, `WORLD_DECOR_SEED`, freeze at L660-661, lantern/prop placement precedent.
- `src/game/world/assets/createCampfire.ts`, `createLantern.ts`, `assetHelpers.ts`, `types.ts` — voxel-box factory template, merged-mesh helper, `WorldAsset` obstacle contract.
- `src/game/world/createGrassField.ts` — confirmed the grass shader is the SOLE consumer of the influence B/RG/A channels (no CPU readback → D-04 cross-consumer safe).
- `src/game/systems/createSmokeColumns.ts` — pooled InstancedMesh template (scratch discipline, DynamicDrawUsage, opaque fade).
- `src/game/audio/createMovementAudio.ts` — `FootstepSurface` type + `updateUnit(surface?)` seam.
- `src/game/createGame.ts` — flag block (330-353), system construction (335-418), player step/stamp (995-1018, 1305-1315), frame update order (1424-1518).
- `package.json` / `.planning/config.json` — versions, nyquist/security toggles.
- `.planning/phases/09-atmosphere-day-night/09-PATTERNS.md` — precedent triad (pure-twin + vitest, named-light-at-build, frozen-matrix, zero-alloc, `?no*` flag).

### Secondary (MEDIUM confidence)
- Verified arithmetic (node) for the retuned decay/regrow curves — computed this session, not from docs.

### Tertiary (LOW confidence)
- None. No web sources needed — the phase is fully grounded in the existing codebase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new deps; all seams read directly.
- Architecture: HIGH — every pattern maps to a specific in-repo precedent with line numbers.
- Retune values (WEAR-03/04): HIGH — arithmetic verified + test contract defined.
- Footpath/prop/dust tuning: MEDIUM — behavior verified, exact aesthetic constants are discretion (Assumptions A1–A5), pinned by perceptual UAT.
- Pitfalls: HIGH — the stale test, `aRoad` trap, and alpha-banding are all confirmed against source/comments.

**Research date:** 2026-07-18
**Valid until:** 2026-08-17 (stable — internal codebase, no fast-moving external deps)
