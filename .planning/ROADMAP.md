# Roadmap: super-elements

## Milestones

- 🚧 **v0.4.0-alpha WebGPU Sky & Water** — Phases 1–6 (in progress): migrate the render pipeline to WebGPU/TSL, port the pixel filter + 17 shaders, then drop the custom sea/day-night for Water Pro + Sky Pro and make the sea reactive + lit
- ✅ **v0.3.0-alpha Living World** — Phases 8–13 (shipped 2026-07-28; 9.1 dynamic-sun + 10 audio verification deferred)
- ✅ **v0.2.0-alpha Combat Depth** — Phases 1–6 (shipped 2026-07-13; Phase 7 crit poise interrupt deferred)
- ✅ **v0.1.0-alpha Transcendence** — Phases A, 0–5 (shipped 2026-07-08)
- 🔒 **Reserved for a later milestone** — Raid boss + role enforcement/balance (carries INV-4) · Crit poise interrupt (POISE-01..03)

---

## 🚧 v0.4.0-alpha WebGPU Sky & Water (in progress)

**Milestone Goal:** Re-platform the renderer (WebGL→WebGPU/TSL) so the world's sea and sky become
commercial-grade and reactive — without losing the sacred pixel-art identity. The hard part is the
engine migration, not the water: the ~320×240 nearest-upscale pixel filter + depth-outline pass
MUST survive the port, and 17 custom GLSL surfaces must become TSL node materials, before the
custom sea / day-night are retired for **Water Pro v3.2.1** + **Sky Pro v2.0.0** and the sea is
made projectile-reactive and lit. Client-only (no SpacetimeDB publish).

**Phase order is DEPENDENCY-FORCED** (spike → renderer → shaders → water → sky → reactive); all
four research streams converged on it independently. Each phase is screenshot-gated; ports land
one subsystem per commit; old sea/sky are deleted in the same commit that replaces them (no dead
code). Numbering reset to Phase 1 for this milestone (`--reset-phase-numbers`).

### Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked INSERTED)

- [ ] **Phase 1: Feasibility Spike** - Isolated `waterpro-spike.html` proves the pixel filter survives on WebGPU + measures perf; recorded go/no-go sign-off with a sanctioned STOP escape hatch
- [ ] **Phase 2: Renderer + Pixel-Filter Port** - WebGL→WebGPU async bootstrap; pixel filter + depth-outline ported to TSL pixel-correct; custom shaders temporarily flat-shaded
- [ ] **Phase 3: Shader Ports to TSL** - 17 GLSL surfaces → node materials, one subsystem per commit, screenshot-gated (RT feeders → terrain → grass → town → props → wind-props → wildlife)
- [ ] **Phase 4: Water Pro** - Retire `createSeaWater` → `WaterSystem` at `SEA_LEVEL` + player wake; anti-features off; FPS-holding quality tier
- [ ] **Phase 5: Sky Pro** - Retire sky dome + day/night path → `SkySystem` server-clock-driven, coupled into water once, re-sourced sun, starfield night
- [ ] **Phase 6: Reactive & Lit Water + Ship** - Pooled projectile wake + impact spray, lit sea, localized glow overlays, combat FPS gate, secure-context deploy decision resolved

### Phase Details

### Phase 1: Feasibility Spike
**Goal**: Prove the game's pixel-art identity is reproducible on WebGPU/TSL — and measure on-device perf and both no-API asks — in an isolated spike BEFORE any irreversible game-code change, ending in a recorded user go/no-go sign-off.
**Depends on**: Nothing (first phase)
**Requirements**: STCK-01, STCK-02, STCK-03, SPIKE-01, SPIKE-02, SPIKE-03, SPIKE-04
**Success Criteria** (what must be TRUE):
  1. An isolated `waterpro-spike.html` renders `WebGPURenderer` + `WaterSystem` + Sky Pro over a `getTerrainHeight`-sampled beach at the game's tilted top-down camera, with zero game code touched.
  2. The pixel-filter look (low-res nearest upscale + depth-discontinuity outline) is reproduced in TSL and screenshot-diffed against the `master` WebGL look in BOTH candidate resolution shapes, and a **recorded go/no-go sign-off** is captured — if the pixel look can't be reproduced, work **STOPS and keeps the WebGL renderer** (sanctioned escape hatch).
  3. WebGPU compute is confirmed running on the target machine AND the WebGL2 auto-fallback path FPS is measured at the candidate quality tier (headed Chrome / user capture — headless can't run WebGPU compute).
  4. Both no-native-API asks are de-risked with a proven technique (lit water = sparkle/SSS/waterColor/bloom + additive overlay; projectile = pooled wake for skim + spray for impact), and a realistic 17-shader port-surface estimate is produced.
  5. The vendored Water Pro + Sky Pro bundles import cleanly from `src/vendor/`, Sky Pro's `data/` cloud-noise resolves in a built `dist/` (not just dev), and a git policy for `src/vendor/**` is decided so the `.31` git-pull→build deploy succeeds.
**Plans**: TBD

### Phase 2: Renderer + Pixel-Filter Port
**Goal**: Migrate the whole game render path from `WebGLRenderer` to `WebGPURenderer` with the pixel filter + outline pixel-correct, proving the migration independent of the shader port by temporarily flat-shading all custom materials.
**Depends on**: Phase 1
**Requirements**: RNDR-01, RNDR-02, RNDR-03, RNDR-04, RNDR-05
**Success Criteria** (what must be TRUE):
  1. The game renders through `WebGPURenderer` (async `init()` / `compileAsync`) with no `WebGLRenderer` remaining in the game path.
  2. The pixel filter (low-res render target + nearest upscale) and the depth-discontinuity outline (sun-facing rim intact, reading scene-pass depth) are TSL post nodes; the game reads pixel-correct at the game camera, screenshot-diffed against `master`.
  3. The frame loop is async-aware and correctly ordered (`sky.update` → `await water.update` → `postProcessing.render`; water node before sky node) with no first-frame race or white screen; a loader gates the first frame on `compileAsync`.
  4. With all custom shaders temporarily flat-shaded, the game still renders (silhouettes + color correct) at the phase gate.
**Plans**: TBD

### Phase 3: Shader Ports to TSL
**Goal**: Port all 17 custom GLSL surfaces to TSL node materials, one subsystem per commit, each build+screenshot-gated, restoring the world's full visual detail with no default/flat/magenta meshes anywhere.
**Depends on**: Phase 2
**Requirements**: SHDR-01, SHDR-02, SHDR-03, SHDR-04, SHDR-05, SHDR-06, SHDR-07
**Success Criteria** (what must be TRUE):
  1. The RT feeders (`createGroundInfluence`, `createScorchMap`) run as WebGPU render-to-texture / compute passes and feed terrain + grass correctly.
  2. Terrain, grass, town and prop surfaces render with their full ported detail (pixel grass clods, roads + cart-ruts, scorch craters, beach swash/footprints, wind-bent grass, building walls/roofs, cobble, rock crags, beach clutter, fountain pond) — no default-material meshes anywhere in the world.
  3. Wind props (camp flag drape/swing + projectile impulse, canopy gust sway) and wildlife (butterfly wing-flap) animate correctly via the ported `windMath` / vertex node helpers.
  4. Each subsystem landed as its own screenshot-gated commit; walking the whole world shows every subsystem pixel-correct against `master`, with the project's matrix/shadow perf throttles preserved.
**Plans**: TBD

### Phase 4: Water Pro
**Goal**: Retire the custom sea for Water Pro at `SEA_LEVEL` with a player wake, tuned to read through the pixel filter at a quality tier that holds framerate, deleting the old sea in the same commit.
**Depends on**: Phase 3
**Requirements**: WATR-01, WATR-02, WATR-03, WATR-04, WATR-05
**Success Criteria** (what must be TRUE):
  1. `createSeaWater` is deleted (no dead code) and `WaterSystem` renders the sea plane at `SEA_LEVEL`, with the waterline sitting correctly against the sampled archipelago terrain (beaches not flooded, sea not floating over sand).
  2. The player leaves a wake trail behind them as they move over water (`water.wake.addGenerator`).
  3. Depth water-color, shoreline foam, swell, whitecaps, and sun/moon sparkle read correctly for the stylized top-down look through the pixel filter — a like-for-like upgrade of the old sea's visible set.
  4. Anti-features (underwater stack, SSR, screen-space refraction) stay disabled and a chosen `QUALITY_LEVELS` tier (start `medium`) holds target FPS; `setQualityLevel` rebuilds the post chain with no black screen, and island masking is applied only where an enclosed cove actually needs it.
**Plans**: TBD

### Phase 5: Sky Pro
**Goal**: Retire the sky dome + day/night sky/fog/sun path for Sky Pro — driven by the server clock, coupled into the water exactly once, with the sun re-sourced for shadows/rim and a lit starfield night.
**Depends on**: Phase 4
**Requirements**: SKY-01, SKY-02, SKY-03, SKY-04, SKY-05
**Success Criteria** (what must be TRUE):
  1. The sky dome + old day/night sky/fog/sun path is deleted (no dead code) and `SkySystem` renders the procedural sky + atmosphere.
  2. The LAN server-anchored clock drives `sky.timeOfDay.time.value` (`autoAdvanceSecondsPerDay = 0`, `Date.now()` fallback) so all players share the same time of day — Sky Pro never self-advances.
  3. `water.setSky(sky.createSkyProvider({ envMap: true }))` couples sky→water (reflection env, sun glint, fog color) built exactly once, and the shadow-casting sun + outline rim (`setEdgeSunDir` / `sunDirUniform`) are re-sourced from Sky Pro's sun so shadows and rim-light track the sky.
  4. Night renders a starfield (starmap asset shipped), not pitch black — verified loading from the built `dist/`, not just dev.
**Plans**: TBD

### Phase 6: Reactive & Lit Water + Ship
**Goal**: Make the sea react to combat (pooled projectile wake + impact spray) and read as lit, hold target FPS in a golem-class fight, then resolve the WebGPU secure-context deploy decision at the ship gate with real numbers.
**Depends on**: Phase 5
**Requirements**: REAC-01, REAC-02, REAC-03, REAC-04, REAC-05, DPLY-01
**Success Criteria** (what must be TRUE):
  1. Projectiles skimming low over the sea disturb the water via a fixed reused pool of wake generators (`updateGenerator`, ≤16/frame, never unbounded add/remove per projectile), and projectile surface impacts emit a `water.spray` plume on WebGPU that is gracefully absent (no crash) on the WebGL2 fallback.
  2. The sea reads as **lit** — sparkle / SSS / lifted `waterColor` / bloom tuned so the surface is not a flat sheet — and a localized emissive glow (e.g. a glowing impact) lights the surface via additive transparent overlays riding the water (not a water-material emissive term).
  3. Reactive-water frame cost holds target FPS in a golem-class combat scene with projectiles + all ambiance enabled (profiled, headed).
  4. The WebGPU secure-context deploy decision (force-https everywhere vs. accept the WebGL2-tier fallback for plain-http LAN players) is resolved at the ship gate with real FPS numbers, and a graceful `WebGPURenderer`→WebGL2 feature-detect fallback is verified (scene renders on both backends; spray degrades silently).
**Plans**: TBD

### Progress

**Execution Order:** Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 (dependency-forced; do not re-order).

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Feasibility Spike | 0/TBD | Not started | - |
| 2. Renderer + Pixel-Filter Port | 0/TBD | Not started | - |
| 3. Shader Ports to TSL | 0/TBD | Not started | - |
| 4. Water Pro | 0/TBD | Not started | - |
| 5. Sky Pro | 0/TBD | Not started | - |
| 6. Reactive & Lit Water + Ship | 0/TBD | Not started | - |

---

## ✅ v0.3.0-alpha Living World (shipped 2026-07-28)

<details>
<summary>Phases 8–13 — SHIPPED 2026-07-28 (9.1 dynamic-sun + 10 audio verification deferred)</summary>

**Delivered:** The world between fights now feels alive — one shared gusting wind phase across
grass/flags/canopies/smoke; distance fog + sky-dome gradient + ~20min server-anchored day/night
color drift as ONE pipeline; dynamic capped-arc sun/shadows; a layered procedural audio bed +
region/combat music; lived-in footpaths/props/wear; sparse reactive wildlife; and reduce-motion
camera micro-feel. All client-only.

- [x] Phase 8: Wind Core (11/11 plans) — 2026-07-14
- [x] Phase 9: Atmosphere & Day/Night (5/5 plans) — 2026-07-14
- [~] Phase 9.1: Dynamic Sun & Shadows *(inserted)* (2/3 plans) — FPS/human gate deferred; superseded by v0.4.0 Sky Pro
- [~] Phase 10: Ambient Audio & Music (6/6 plans built) — human verification gate deferred → backlog
- [x] Phase 11: Lived-in Props & Wear (8/8 plans) — 2026-07-18
- [x] Phase 12: Wildlife (5/5 plans) — 2026-07-20
- [x] Phase 13: Camera Feel (4/4 plans) — 2026-07-21

Full detail archived: [`milestones/v0.3.0-alpha-ROADMAP.md`](./milestones/v0.3.0-alpha-ROADMAP.md)

</details>

## ✅ v0.2.0-alpha Combat Depth (shipped 2026-07-13)

<details>
<summary>Phases 1–6 — SHIPPED 2026-07-13 (Phase 7 deferred)</summary>

**Delivered:** Undodgeable goliath contact drain replaced with discrete, telegraphed, DODGEABLE
attacks (windup → strike → recovery) on ONE unit-agnostic server-authoritative attack FSM, plus
per-character server-rolled crit and full server-authoritative base damage (PVE + PVP spoof holes
closed).

- [x] Phase 1: Crit stats + server damage foundation (3/3 plans) — 2026-07-08
- [x] Phase 2: Server-authoritative damage + crit on enemies (3/3 plans) — 2026-07-09
- [x] Phase 3: PVP crit (2/2 plans) — 2026-07-09
- [x] Phase 4: Attack state machine + leapSlam end-to-end + delete goliath drain (7/7 plans) — 2026-07-13
- [x] Phase 5: swordSwing → swordSwirl combo (5/5 plans) — 2026-07-11
- [x] Phase 6: shieldDash lane (5/5 plans) — 2026-07-13
- [→] Phase 7: Crit poise interrupt — DEFERRED at close (spec: `todos/pending/2026-07-13-phase-7-crit-poise-interrupt-DEFERRED.md`)

Full detail archived: [`milestones/v0.2.0-alpha-ROADMAP.md`](./milestones/v0.2.0-alpha-ROADMAP.md)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Crit stats + server damage foundation | 3/3 | Complete | 2026-07-08 |
| 2. Server-authoritative damage + crit on enemies | 3/3 | Complete | 2026-07-09 |
| 3. PVP crit | 2/2 | Complete | 2026-07-09 |
| 4. Attack state machine + leapSlam + delete drain | 7/7 | Complete | 2026-07-13 |
| 5. swordSwing → swordSwirl combo | 5/5 | Complete | 2026-07-11 |
| 6. shieldDash lane | 5/5 | Complete | 2026-07-13 |
| 7. Crit poise interrupt | — | Deferred | - |

</details>

## ✅ v0.1.0-alpha Transcendence (shipped 2026-07-08)

<details>
<summary>Phases A, 0–5 — SHIPPED 2026-07-08</summary>

- [x] Phase A: Gem naming unification — primogems→gems (commit `8236de4`)
- [x] Phase 0: Lock transcendence constants (1/1 plans) — 2026-07-06
- [x] Phase 1: Constellation shard currency (4/4 plans) — 2026-07-06
- [x] Phase 2: Transcendence install (5/5 plans) — 2026-07-06
- [x] Phase 3: Shards at risk (5/5 plans) — 2026-07-07
- [x] Phase 4: Formalize character roles (2/2 plans) — 2026-07-07
- [x] Phase 5: Multiplayer party (6/6 plans) — 2026-07-07

Full detail archived: [`milestones/v0.1.0-alpha-ROADMAP.md`](./milestones/v0.1.0-alpha-ROADMAP.md)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| A. Gem naming unification | 1/1 | Complete | 2026-07 (`8236de4`) |
| 0. Lock transcendence constants | 1/1 | Complete | 2026-07-06 |
| 1. Constellation shard currency | 4/4 | Complete | 2026-07-06 |
| 2. Transcendence install | 5/5 | Complete | 2026-07-06 |
| 3. Shards at risk | 5/5 | Complete | 2026-07-07 |
| 4. Formalize character roles | 2/2 | Complete | 2026-07-07 |
| 5. Multiplayer party | 6/6 | Complete | 2026-07-07 |

</details>

## 🔒 Reserved for a later milestone

- [→] **Raid boss** — party-gated shard faucet (the recoverable faucet, INV-4).
  Spec: `.planning/todos/pending/2026-07-08-phase-6-raid-boss-DEFERRED.md`

- [→] **Role enforcement + balance** — raid role mechanics + balance pass + full-loop
  validation. Spec: `.planning/todos/pending/2026-07-08-phase-7-role-enforcement-balance-DEFERRED.md`

- [→] **Crit poise interrupt** — crit-in-windup poise accrual → attack cancel + visible stagger
  (POISE-01..03). All dependencies shipped in v0.2.0-alpha (poise column, server `isCrit`); small
  pure-helper slice. Spec: `.planning/todos/pending/2026-07-13-phase-7-crit-poise-interrupt-DEFERRED.md`

> Raid items deferred out of the v0.1.0-alpha ship at Phase 5; poise interrupt deferred at the
> v0.2.0-alpha close. Re-add with `/gsd-phase` when a combat milestone opens.
</content>
</invoke>
