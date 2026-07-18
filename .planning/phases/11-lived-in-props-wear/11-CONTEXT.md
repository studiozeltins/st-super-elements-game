# Phase 11: Lived-in Props & Wear - Context

**Gathered:** 2026-07-18
**Status:** Ready for planning

<domain>
## Phase Boundary

The world looks **inhabited** and reacts to traffic. Four visible outcomes:

1. **Worn footpaths** run along REAL routes (camp↔camp, plaza↔bridge) as a **static bake** — thinned grass + a ground-tint strip. They never fade (not a decaying channel).
2. **Plaza reads lived-in** — crates/barrels/fences/lanterns arranged to answer "who put this here", as **frozen-matrix** static meshes.
3. **Scorch marks regrow** over minutes; the player leaves a **~2s grass-bend trail**.
4. **Sprint steps on dirt/path puff pooled dust sprites** (never on grass).

Requirements: WEAR-01..05. This is a **tune-existing-systems + static-bake + one new pooled-sprite system** phase. Zero new dependencies, zero server publishes (client-only milestone). No new gameplay.

**Out of scope (belongs elsewhere):** wildlife (Phase 12), camera feel (Phase 13), weather/rain (deferred), any server work, time-of-day gameplay hooks (deferred).
</domain>

<decisions>
## Implementation Decisions

### Footpaths (WEAR-01)
- **D-01:** Footpaths reuse the **existing `roads.ts` spline system** as a new **lighter "worn path" tier** — NOT a separate subsystem. A worn path = a narrower, lighter-tint road that only *partially* thins grass (trampled, not bare packed-dirt). Rationale: `roads.ts` already does spline→`roadFactor`→grass-thinning + `terrainColorAt` ground-tint; footpaths ARE worn routes. A second system would duplicate all three.
- **D-02:** Route set is the **real traffic graph**: camp↔camp (from `getCampSites()`), plaza↔bridge, plaza↔camp. Anchors are data-driven from existing `camps.ts` / plaza / bridge positions — never hand-placed magic coordinates.
- **D-03:** Grass thinning along paths reuses the existing `grassPlacement.ts` rejection seam (`roadFactor(x,z) > 0.5` / `isInTown`). Worn-path tier gets a **softer** thinning threshold than full roads so blades still poke through (worn, not cleared). Tint via `terrainColorAt` — blend a lighter dirt over grass (distinct hue from `ROAD_DIRT 0x9a7a4e`, e.g. a desaturated trampled-grass tone), driven by a footpath factor.

### Bend trail (WEAR-04) — resolves the STATE open decision
- **D-04:** Retune the **single shared bend-decay clock to ~2s** readable fade. `groundInfluenceMath.DECAY_PER_FRAME_AT_60` (currently `0.985` ≈ 4–5s) drops to the value giving ~2s. **NO second influence texture** — the flatten channel (B) is already the bend-trail channel; one shared clock serves player + enemies + landing thump. Rejected: keeping 4–5s (misses the "~2s" spec); a second texture (GPU cost + complexity for zero benefit — all bend sources want the same feel).
- **D-05:** Bend behavior is **verified via `groundInfluenceMath` unit tests** (pure twin, THREE-free) — assert the new decay reaches <~10% by ~2s at 60fps, mirroring the windMath/dayNightMath pure-twin test discipline.

### Scorch + wear regrow (WEAR-03)
- **D-06:** Raise the **shared regrow time constant** `WEAR_REGROW_TIME_CONSTANT_SECONDS` from `25` → **~75s** (heals over ~2–3 min = "over minutes" per SC). This clock drives BOTH the scorch map (A/R) and the wear-A channel; keep them shared (simplest, both are "battle/traffic wear healing"). `SCORCH_PER_STRIKE = 0.21` (5 hits saturate) stays. Verify regrow curve in the pure math test.
- **D-07:** Footpaths are the STATIC bake (D-01); the dynamic wear-A channel stays for emergent trampling where players linger, now healing at the slower ~75s.

### Plaza props (WEAR-02)
- **D-08:** Add **3 new frozen-matrix voxel assets** — `createCrate`, `createBarrel`, `createFence` — mirroring the existing voxel-box asset factories (`createCampfire`/`createTeepee` shape, `assetHelpers` `lambert`/`randomBetween`). Lanterns already exist (`createLantern`, Phase 9) — reuse, don't rebuild.
- **D-09:** Placement is **deterministic** (seeded off `WORLD_DECOR_SEED`), at build time BEFORE the world freeze, via `placeAsset` (singles) / `addInstancedMatrices` (frozen batch). Arrangement answers "who put this here": crates/barrels **stacked at the market edge** near the fountain; fence runs **line path entries / plaza boundary gaps**. Counts are Claude's discretion (~6–10 crates/barrels, 2–3 short fence runs) — tune for read, not quantity.
- **D-10:** All props are static (no per-frame cost). No new lights beyond the existing plaza lanterns (light-pool discipline: never grow the combat pool; world lights are named PointLights with `layers.enableAll()` — but props here need none).

### Dust puffs + surface classifier (WEAR-05)
- **D-11:** New **dedicated pooled puff system** `createDustPuffs` (small InstancedMesh pool ~24), mirroring the `createSmokeColumns` pool pattern but **ground-hugging** (low kick, quick settle, no tall rise). Rejected: `createDebrisSystem` (cube-shatter look is wrong) and `createEffectSystem` (combat FX, not ambient) — reuse their *pattern*, not the systems.
- **D-12:** Add a **shared `surfaceAt(x,z)` classifier** (grass | dirt/path | town) derived cheaply from `roadFactor` + the new footpath factor + `isInTown` — **no GPU texture read**, no per-frame alloc (client-perf rules). Dust spawns **only** on dirt/path/town surfaces, never grass. Single source of truth.
- **D-13:** The same `surfaceAt()` feeds the already-wired footstep-audio seam `createMovementAudio.updateUnit(..., surface?)` — currently hard-coded `'grass'` at `createGame.ts:1305`. Threading real surface there is a **low-cost bonus** (the seam exists) and keeps one classifier; in scope only because it's the same function — no new audio work beyond passing the value.
- **D-14:** Perf-bisect flag **`?nodust`** for the new pool (mirrors `?nowind`/`?nosmoke` convention). Bend/scorch retunes are covered by the existing `?nobend`; footpaths are a static bake (no per-frame cost → no flag needed).

### Claude's Discretion
- Exact retuned decay/regrow numeric values (D-04/D-06) — hit the *feel* (~2s bend, ~2–3min scorch heal), pin the behavior in tests, not the magic constant.
- Prop counts, exact plaza arrangement, footpath tint hue, dust pool size / puff sprite look.
- Whether `createBarrel` ships or crate+fence suffice for the "lived-in" read.

### Reviewed Todos (not folded)
The 4 todos matching phase 11 at score ≥0.4 are **keyword false-positives** — none touch props/wear:
- `2026-07-07-boost-orbit-v2-paths-shapes.md` (0.6) — BŪSTS orbit star shapes; "paths" = orbit paths, not footpaths.
- `2026-07-08-phase-6-raid-boss-DEFERRED.md` (0.4) — deferred raid boss; matched on "phase".
- `2026-07-08-phase-7-role-enforcement-balance-DEFERRED.md` / `2026-07-13-phase-7-crit-poise-interrupt-DEFERRED.md` (0.4) — deferred combat; matched on "phase".
- `flower-blade-color-art-pass.md` (0.4) — grass flower color art; matched on "phase,world".

Not folded — folding deferred combat/UI specs into a wear-and-props phase would violate the scope guardrail.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/ROADMAP.md` §"Phase 11: Lived-in Props & Wear" (lines ~190–205) — goal, 4 success criteria.
- `.planning/REQUIREMENTS.md` — WEAR-01..05 verbatim text.
- `.planning/phases/09-atmosphere-day-night/09-PATTERNS.md` — precedent patterns to mirror: pure-twin + vitest triad, named-light-at-build + `layers.enableAll()`, frozen-matrix static meshes, mutate-in-place / zero-per-frame-alloc, `?no*` bisect-flag convention.

### Bend trail / wear / scorch (WEAR-03, WEAR-04)
- `src/game/systems/groundInfluenceMath.ts` — pure math; `DECAY_PER_FRAME_AT_60 = 0.985` (bend, retune to ~2s), `WEAR_REGROW_TIME_CONSTANT_SECONDS = 25` (retune to ~75s), `worldToInfluenceUv`, `encodeBendDirection`, `decayForDelta`, `wearDecayForDelta`.
- `src/game/systems/createGroundInfluence.ts` — RGBA ping-pong map; channels R,G=bend dir, B=flatten (bend trail), A=wear. `stamp()`/`update()`. `MAX_STAMPS_PER_FRAME = 64`.
- `src/game/systems/createScorchMap.ts` — scorch ping-pong; `SCORCH_PER_STRIKE = 0.21`, shares `wearDecayForDelta`. `MAX_STAMPS_PER_FRAME = 16`.
- `src/game/world/terrain.ts` — `patchTerrainWithScorch` (5 brown bands, `SCORCH_BAND_GLSL`); grass reads influence in `createGrassField`.

### Footpaths (WEAR-01)
- `src/game/world/roads.ts` — `roadFactor`, `roadAcross`, `getRoads`, `ROAD_HALF_WIDTH` — the spline system to extend with a worn-path tier.
- `src/game/world/terrain.ts` — `terrainColorAt` (`ROAD_DIRT 0x9a7a4e` blend), per-vertex `aRoad`/`aRoadCross`, `GRASS_CELLS_PER_UNIT 2.2`, `ROAD_CELLS_PER_UNIT 2.4` — the ground-tint path.
- `src/game/world/grassPlacement.ts` — `generateGrassBlades`, `roadFactor>0.5`/`isInTown` rejection seam for thinning; `GRASS_SEED 0x67b35a`, `PLAZA_RADIUS`.
- `src/game/world/camps.ts` — `getCampSites()`, `CampSite{x,z,archetypeId}` — camp anchors for route endpoints.

### Plaza props (WEAR-02)
- `src/game/world/createMondstadtWorld.ts` — `placeAsset`, `addInstancedMatrices` (frozen batch), `scatterAssets`/`AssetScatterRule`, world freeze at ~L660, `WORLD_DECOR_SEED 0xa11ce`.
- `src/game/world/assets/` (barrel) — `createCampfire.ts`/`createTeepee.ts` + `assetHelpers` (`lambert`, `randomBetween`) as the voxel-asset template; `createLantern.ts` already shipped.
- `src/game/world/createPlazaStructures.ts` (`createFountain`, `createWindmill`), `src/game/world/town/townPlan.ts` (`isInTown`) — plaza layout anchors.

### Dust puffs + surface (WEAR-05)
- `src/game/systems/createSmokeColumns.ts` — pooled InstancedMesh puff template (`SMOKE_POOL_SIZE 48`, cull/spawn/rise tuning) — mirror for `createDustPuffs` (ground-hugging).
- `src/game/systems/createDebrisSystem.ts` — directional-cone `spawn()` reference (pattern only).
- `src/game/audio/createMovementAudio.ts` — `updateUnit(..., surface?)` seam; `FootstepSurface` type (extend from `'grass'`-only).
- `src/game/createGame.ts` — L1305 player-step `'grass'` hard-code (surface classifier call site), L1516/1517 influence/scorch `.update()`, `?no*` flag block ~L297.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Ground influence system** — bend trail already fully built; WEAR-04 is a one-constant retune + test, no new code.
- **Scorch map** — regrow already built on `wearDecayForDelta`; WEAR-03 is a shared-constant retune + test.
- **roads.ts spline + terrain tint + grass rejection** — the entire footpath pipeline exists; WEAR-01 adds a worn-path tier through these three seams.
- **Voxel asset factories + `assetHelpers`** — `createCrate`/`createBarrel`/`createFence` are box-geometry siblings of `createCampfire`; `createLantern` reused as-is.
- **`createSmokeColumns` pool** — copy the fixed-pool InstancedMesh + cull/spawn cadence for `createDustPuffs`.

### Established Patterns
- **Pure-twin + vitest** (`windMath`/`dayNightMath` + `groundInfluenceMath`) — retunes are pinned by behavior tests, not magic numbers.
- **Frozen-matrix static meshes** — all props added BEFORE the world freeze (`matrixWorldAutoUpdate=false`); runtime scene adds are forbidden.
- **Named PointLight + `layers.enableAll()`** — if any prop needs light (it shouldn't); never grow the combat light pool.
- **Zero-per-frame-alloc / mutate-in-place** — dust pool + `surfaceAt()` must not allocate per frame; no GPU readbacks (client-perf cliff class).
- **`?no*` bisect flag per phase** — `?nodust` for the new system.

### Integration Points
- `groundInfluenceMath.ts` constants ← retune (D-04, D-06).
- `roads.ts` + `terrain.ts` + `grassPlacement.ts` ← worn-path tier (D-01..03).
- `createMondstadtWorld.ts` build path ← new props before freeze (D-08..10).
- `createGame.ts` ← construct `createDustPuffs`, one `.update()` frame line, `?nodust` flag, `surfaceAt()` at L1305 step + dust spawn.
- `createMovementAudio.updateUnit(surface?)` ← real surface from `surfaceAt()` (D-13 bonus).
</code_context>

<specifics>
## Specific Ideas

- Footpaths must read as **worn/trampled**, distinct from the existing packed-dirt roads — blades still poke through, tint lighter/greener-dirt than `ROAD_DIRT`.
- Bend trail target is the roadmap's literal **"~2s fade"** — a following player should see their own recent path, gone within a couple seconds.
- Scorch heals **"over minutes"** — long enough that a fresh battlefield still shows damage when you return shortly, healed if you leave for a while.
- Plaza props answer **"who put this here"** — deliberate human placement (market edge, path gaps), not random scatter.
- Dust is **subtle** — small ground-hug puffs on sprint over dirt only, never a particle spray.
</specifics>

<deferred>
## Deferred Ideas

- **Weather (rain, puddles) — WTHR-01** — deferred at milestone scoping (real but expensive).
- **Time-of-day gameplay hooks — TODG-01** — needs server work, violates client-only scope.
- **Grass-vs-dirt footstep-audio full treatment** — D-13 threads the surface value through the existing seam as a bonus; any *new* per-surface audio design belongs to an audio phase, not here.
- Wildlife (Phase 12), camera feel (Phase 13) — later phases, dependency-ordered.

### Reviewed Todos (not folded)
See the "Reviewed Todos (not folded)" subsection under `<decisions>` — 4 keyword-false-positive matches, all out of scope.
</deferred>

---

*Phase: 11-lived-in-props-wear*
*Context gathered: 2026-07-18*
