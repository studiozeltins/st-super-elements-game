---
gsd_state_version: 1.0
milestone: v0.3.0-alpha
milestone_name: Living World
current_phase: 12
current_phase_name: wildlife
status: executing
stopped_at: Completed 12-02-PLAN.md
last_updated: "2026-07-18T20:03:06.616Z"
last_activity: 2026-07-18
last_activity_desc: Phase 12 execution started
progress:
  total_phases: 7
  completed_phases: 5
  total_plans: 38
  completed_plans: 36
  percent: 71
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-13)

**Core value:** A retained PVPvE loop — chase endless Transcendence power (scarce shards past
C6), contest it via PVP theft + co-op raids, with no progress-wipe churn (C0–C6 is a protected
floor). This milestone makes the world BETWEEN fights worth living in.
**Current focus:** Phase 12 — wildlife

## Current Position

Phase: 12 (wildlife) — EXECUTING
Plan: 4 of 5
Status: Ready to execute
Last activity: 2026-07-18 — Phase 12 execution started

Progress: [░░░░░░░░░░] 0%

## Roadmap Summary

| Phase | Goal | Requirements |
|-------|------|--------------|
| 8. Wind Core | One shared wind module drives grass/flags/canopies/smoke with traveling gusts | WIND-01..03 |
| 9. Atmosphere & Day/Night | Fog + sky + ~20min day/night drift as ONE server-anchored color pipeline; lanterns at dusk | ATMO-01..03, DAYNITE-01..04 |
| 10. Ambient Audio & Music | Bus/compressor refactor, procedural wind bed + one-shots, region/combat music crossfade, ducking | AMBI-01..07, MUSIC-01..03 |
| 11. Lived-in Props & Wear | Static footpath bake, plaza props, regrowth/bend-trail tuning, dust puffs | WEAR-01..05 |
| 12. Wildlife | Instanced butterflies, startle-flush birds, dusk fireflies (no light pool) | WILD-01..03 |
| 13. Camera Feel | Run lean, idle breathing, burst FOV kick — all behind a persisted reduce-motion toggle | CAM-01..04 |

Order is dependency-forced: wind first (5 consumers), atmosphere second (one color pipeline,
gates fireflies/lanterns), audio third (gust envelope; music shares bus + combat signal),
wildlife needs 8+9+10, camera LAST (accessibility). Do not re-order.

## Performance Metrics

**Velocity (this milestone):**

- Total plans completed: 24
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 08 | 11 | - | - |
| 9 | 5 | - | - |
| 11 | 8 | - | - |

*Updated after each plan completion.*
| Phase 08 P01 | 7 min | 2 tasks | 2 files |
| Phase 08 P02 | 6 min | 2 tasks | 5 files |
| Phase 08 P03 | 10min | 3 tasks | 5 files |
| Phase 08 P04 | ~6 min | 2 tasks | 2 files |
| Phase 08 P05 | ~8 min | 2 tasks | 0 files |
| Phase 08 P06 | 8 min | 3 tasks | 5 files |
| Phase 08 P07 | 3min | 1 tasks | 2 files |
| Phase 08 P08 | 4 min | 2 tasks | 2 files |
| Phase 08 P09 | 5 min | 2 tasks | 1 files |
| Phase 09 P01 | 12 min | 2 tasks | 2 files |
| Phase 09 P02 | 12min | 2 tasks | 1 files |
| Phase 09 P03 | 4min | 2 tasks | 3 files |
| Phase 09 P04 | 6min | 2 tasks | 2 files |
| Phase 9 P05 | 27min | 3 tasks | 2 files |
| Phase 09.1 P01 | 9min | 2 tasks | 2 files |
| Phase 09.1 P02 | 4min | 3 tasks | 4 files |
| Phase 10 P01 | 12min | 2 tasks | 4 files |
| Phase 10 P02 | 15min | 3 tasks | 7 files |
| Phase 10 P03 | 12min | 4 tasks | 7 files |
| Phase 10 P05 | ~20 min | 2 tasks | 3 files |
| Phase 10 P04 | 12 min | 1 tasks | 2 files |
| Phase 10 P06 | 15 min | 4 tasks | 2 files |
| Phase 11 P01 | 6m | 1 tasks | 2 files |
| Phase 11 P02 | 6min | 2 tasks | 2 files |
| Phase 11 P03 | 12 min | 2 tasks | 6 files |
| Phase 11 P04 | 4min | 1 tasks | 2 files |
| Phase 11 P05 | 5min | 2 tasks | 4 files |
| Phase 11 P06 | 4min | 1 tasks | 2 files |
| Phase 11 P07 | ~8 min | 1 tasks | 1 files |
| Phase 11 P08 | 3min | 2 tasks | 2 files |
| Phase 12 P01 | 6min | 2 tasks | 2 files |
| Phase 12 P02 | 4min | 1 tasks | 2 files |
| Phase 12 P03 | 3min | 2 tasks | 3 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Locked for this milestone (from research):

- **Zero new dependencies**: three@0.185.1 built-ins + Web Audio + existing seams (`audioCore`,
  `timeUniform`, `groundInfluence`, `lightPool`, `scorchMap`). Rejected: Tone.js/howler,
  noise packages, GSAP, three Audio wrappers, runtime Fog↔FogExp2 swaps, moving the sun.

- **Client-only milestone**: zero server publishes. Day/night clock anchors from SDK event
  timestamps (`world_timer` is PRIVATE — cannot subscribe); `Date.now()` fallback.

- **One color pipeline**: fog color, sky, hemisphere, sun tint all blend from a single
  day/night palette, mutated in place (fog reassignment = full shader recompile).

- **Audio bus + compressor BEFORE the first looped bed** — Phase 10's first task; existing
  SFX rerouted in the same change.

- **Wildlife = emissive instanced quads**, never pooled lights, never GPU readbacks; lanterns
  get dedicated fixed lights at build, fireflies stay emissive.

- **Camera motion transient-only** + reduce-motion toggle (XAG 117) as acceptance criterion.
- [Phase 08]: GUST periods tuned to 9/10/22s (RESEARCH 37/23/53s failed the cadence spec with gaps up to 369s) — Plan discretion grant: the cadence test is the spec; grid-searched incommensurate triples over a simulated hour
- [Phase 08]: WANDER retuned to a1=0.25/T=600s + a2=0.12/T=1300s — RESEARCH example exceeded the 0.0035 rad/s wander rate bound 3x; retune keeps ~11 deg/min max with 0.35 rad range per 10-min window
- [Phase 08]: Grass sway axis vec2 stays FIXED (no uWindDir in base sway — zero regression, D-01) but its values interpolate from SWAY.ampX/ampZ via toFixed(4) so all nine grass literals single-source from windMath
- [Phase 08]: GrassField.update() deleted whole (interface + object + world call site) — shared wind clock made it empty; wind.update(deltaSeconds) at top of frame() is the client's only wind clock advance
- [Phase 08]: Per-flag banner color via geometry vertex-color attribute so ONE pooled cloth material serves all flags
- [Phase 08]: Asset unit tests inject createWind(true) via initCanopyWind at module load — fail-fast throw kept, contract mirrored
- [Phase 08]: Smoke puff recycle via age >= PUFF_LIFE (= MAX_RISE/RISE_SPEED) — identical to the height check at constant rise, one pool field fewer
- [Phase 08]: camps namespace import keeps the construction-time getCampSites() call the file's single occurrence — data-driven anchors, no scene traversal
- [Phase 08]: Plan 08-05 blocking human-verify checkpoint auto-approved per --auto policy — 10-item playtest deferred to /gsd-verify-work (D2 coverage entry in 08-05-SUMMARY)
- [Phase 08]: Pooled wind materials cached per WIND INSTANCE (identity guard + dispose-on-change), never per module — fixes StrictMode/reconnect freeze, keeps D-13 pooling; flag pole joins the cache because disposeObject reaches it at teardown
- [Phase 08]: Canopy sway ramp reads a baked aTreeHeight vertex attribute (height above the tree base) — pooled materials cannot take per-mesh uniforms, and world-Y ramps saturate on hills
- [Phase 08]: InstancedMesh teardown requires mesh.dispose() in addition to geometry/material dispose to free instance attribute GPU buffers
- [Phase 08]: flagSwing/flagDrape closed forms: min(1, s*(0.75+0.5*g)) swing and 1-min(1, s*(0.7+0.25*g)) drape — strength-0 identities exact (swing 0, drape 1 per D-12); GLSL generators pin the full rendered expression so shader/CPU cannot drift
- [Phase 08]: Flag downwind yaw recovered in-shader from modelMatrix[0].xz vs uWindDir (atan of dot/cross) — zero new uniforms on the pooled campFlag material; drape y-drop banded, x foreshorten continuous; CLOTH_BANDS=6 art constant lives in the asset, not windMath
- [Phase ?]: 09-02: Sky-dome fixed-origin with xyww far-plane vertex pin (not camera-tracking) — clipping-proof as the camera roams, keeps Plan 05 wiring to one daynight.update() line
- [Phase ?]: 09-02: ATMO-02 single-source enforced by construction — sky-dome bottomColor uniform IS scene.fog.color, topColor uniform IS the setSkyTop scratch (same THREE.Color instances, zero-alloc drift)
- [Phase 09]: 09-03: 6 plaza lanterns as named build-time PointLights collected into ambience.lanternLights (no runtime add/remove, plaza-only per D-07)
- [Phase 9]: 09-05: daynight.update() is called with no arg — the shipped DayNightCycle reads clock.nowMicros() internally; wiring passes serverClock into the factory so one coherent server clock drives the phase (no private accumulator).
- [Phase 9]: 09-05: LAN day/night sync re-anchors off the enemy/goliath worldTick reducer EventContext timestamp (tag==='Reducer'), tapped in useGameTableBridge; Date.now() fallback covers the non-Reducer case. Zero server publish, cosmetic-only.
- [Phase 9]: 09-05: 'shadows follow the sun' request DEFERRED — reverses D-02 (frozen sun basis) and contradicts DAYNITE-01; routed separately, not implemented in this phase.
- [Phase 09.1]: 09.1-01: sun-arc math is pure-twin-first — sunDir(phase) raised-cosine dome + sine azimuth in zero-THREE dayNightMath.ts, ELEV_PEAK pinned to SUN_OFFSET 54.204deg (NOT CONTEXT prose 75deg, RESEARCH A1); buildSunBasis reproduces frozen basis renderer-free (SHADOW-04)
- [Phase ?]: Phase 09.1-02: sun direction is a single day/night-owned channel (setSunDirection); setShadowFocus rebuilds the shadow basis per-frame from it with zero alloc
- [Phase ?]: Phase 09.1-02: ?nomovingsun/reduce-motion/?nodaynight pin the sun byte-exact to the literal SUN_OFFSET while colors keep drifting; 30Hz shadow throttle left unchanged
- [Phase ?]: [Phase 10]: 10-02: ONE createAudioBuses routing owner (master->DynamicsCompressor->destination + sfx/music/ambient sub-buses); music/ambient are HEAD->DUCK in series so user-volume/bed-swell x combat-duck never stomp one AudioParam (RESEARCH Pitfall 5)
- [Phase ?]: [Phase 10]: 10-02: all 5 SFX modules migrated off context.destination onto the injected sfx bus (D-02/D-03); createAudioSystem owns the context and late-binds the sfx closure to break the createAudioSystem<->createAudioBuses circularity
- [Phase ?]: 10-03: creature layers ship with per-layer synth fallback (birds/crickets/owl/grunt); real CC0 .ogg recordings drop in later with zero code change (D-04/D-06)
- [Phase 10]: 10-05: audio settings UI (SKAŅA) — native range sliders + affirmative mute Toggles, App state to persist to imperative Game bus setters, readVolume V5 clamp (music 0.7/sfx 1.0 defaults)
- [Phase ?]: Grass rustle (AMBI-04): procedural bandpass noise wash (2.6kHz, peak 0.05 under the 0.12 step tap) layered on the player footstep via updateUnit surface?:'grass', routed through getSfxBus, sharing underSpamBudget
- [Phase ?]: onGrass derived cheaply from isGrounded() (walkable island = grass) — no GPU texture read, no per-frame alloc; road-exclusion deferred per client-perf rules
- [Phase ?]: Music loudness on the music bus HEAD (0.7); crossfade gains stay pure equal-power cos/sin so perceived loudness is constant through the region<->combat transition
- [Phase ?]: Music crossfade re-ramps only on a combat-state flip; steady-state setCombat is a cheap ensure/build check — zero per-frame AudioParam churn
- [Phase ?]: Bend trail decay 0.985->0.980 for ~2s springy fade (WEAR-04/D-04/D-05)
- [Phase ?]: Wear/scorch regrow time constant 25s->75s: reads at 1min, heals <10% by ~2.88min (WEAR-03/D-06)
- [Phase ?]: [Phase 11] 11-03: createCrate/createBarrel pre-existed in createTownProps.ts as walk-through decor; moved to dedicated files + upgraded to merged-box voxel + collision + lightless spec (CLAUDE.md no-legacy). buildTown market crates/barrels now carry a collision footprint.
- [Phase ?]: createDustPuffs caches per-puff groundY at spawn so update() stays zero-alloc (no per-frame getGroundHeight)
- [Phase ?]: Dust is externally player-spawned: spawn(x,z,dirX,dirZ) claims a slot; update(dt) only ages the live pool (unlike self-emitting smoke)
- [Phase 11]: Footpath tint 0x7d8a54 (green-dominant) baked into terrainColorAt vertex color, lighter/greener than ROAD_DIRT and off the aRoad cart-rut path (11-05)
- [Phase 11]: Footpath grass thinning is probabilistic (continue with prob footpathFactor, capped 0.6) — trampled not cleared (11-05)
- [Phase 11]: surfaceAt road threshold >0.5 pinned to grassPlacement.ts:74 (single road/grass boundary)
- [Phase ?]: 11-07: omit placeAsset collisionRadius for props — Plan 03 factories self-declare asset.obstacles (passing it would double the footprint)
- [Phase ?]: 11-07: fence runs kept at +x factory orientation on x-aligned boundaries — placeAsset does not rotate asset obstacles, so rotating would misalign per-post collision
- [Phase 11]: 11-08: FootstepSurface re-exported from surfaceAt.Surface (one tag set for dust+audio, no-legacy)
- [Phase 11]: 11-08: surfaceAt classified ONCE/frame at the grounded player step, shared via playerSurface closure var to the footstep audio (no second call); dust gate = moving && grounded && surface!=='grass' (no sprint state)
- [Phase 11]: 11-08: ?nodust skips dust-pool construction entirely (zero objects, clean FPS bisect); createGame stays wire-only
- [Phase ?]: wildlifeMath twin: isDayTime is the strict inverse of the lit firefly gate (fireflyLevel<0.01), reusing the one shipped day/night channel
- [Phase 12]: 12-02 butterflies: self-managing pooled InstancedMesh; night force-empties the pool (hard despawn), gentle bounded top-up over grass, all motion delegated to wildlifeMath
- [Phase ?]: [Phase 12] 12-03 bird flush: externally-spawned pooled InstancedMesh (createDustPuffs spine); spawn(x,z) bursts 2-4 birds, update() ages wildlifeMath.birdArc + recycles at t01>=1; fade = instance shrink not alpha; BIRD_POOL_SIZE=12
- [Phase ?]: [Phase 12] 12-03 wing sfx: createWildlifeSfx procedural one-shot (3 staggered bandpass-noise wingbeats) on sfx bus, gesture-guarded + .onended cleanup; debounce stays at the 12-05 grass-stamp call site (no GPU readback)

### Pending Todos

7 pending (see `.planning/todos/pending/`). Latest: Phase 7 crit poise interrupt deferred at
v0.2.0-alpha close. Miss/evasion decision still needs a user pros/cons ruling.

### Blockers/Concerns

- **Phase 9 first task**: verify the installed SpacetimeDB TS SDK exposes the reducer event's
  server timestamp on row-callback `EventContext` (30-min spike; `Date.now()` fallback is safe).

- **Perf rules are the milestone's real risk**: frozen matrices, pooled materials, no per-frame
  allocs, game-loop-owned clocks (never React — the 144→20fps regression class). Every phase
  ships a `?no*` bisect flag.

- **Summed frame cost**: features built per-phase, cost paid together — milestone verification
  runs `scripts/fps_playtest.py` in a golem-class fight with ALL ambiance enabled (Phase 12 SC4).

- **Phase 11 open decision**: ~2s bend-trail vs shared 4–5s bend decay clock — decide in
  planning (accept shared clock vs second influence texture), not mid-implementation.

- **Ops invariants**: pnpm only; server module path `./spacetimedb`; no publishes expected this
  milestone at all (client-only).

- Phase 8 human playtest NOT yet run — 08-05 Task 2 checkpoint was auto-approved in --auto mode; a human must walk the 10-item checklist via /gsd-verify-work before phase sign-off

### Roadmap Evolution

- Phase 09.1 inserted after Phase 9: Dynamic sun/shadows — user request post-Phase-9; deliberately overrides D-02/DAYNITE-01 frozen-sun (URGENT)

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Feature | Elemental resistance system | Deferred to future milestone | 2026-07-06 |
| Feature | XP/levelling for players + enemies | Deferred to future milestone | 2026-07-06 |
| Feature | Email password reset | Deferred (needs external service) | 2026-07-06 |
| Phase | Raid boss (party-gated shard faucet, INV-4) | Reserved; spec at `.planning/todos/pending/2026-07-08-phase-6-raid-boss-DEFERRED.md` | 2026-07-08 |
| Phase | Role enforcement + balance + full validation | Reserved; spec at `.planning/todos/pending/2026-07-08-phase-7-role-enforcement-balance-DEFERRED.md` | 2026-07-08 |
| Combat | Camp-enemy FSM conversion + hero FSM + tiered poise + weapon crit (XCMB-01..05) | v2 combat expansion | 2026-07-08 |
| Phase | Crit poise interrupt (POISE-01..03, was Phase 7) | Deferred at v0.2.0-alpha close; spec at `.planning/todos/pending/2026-07-13-phase-7-crit-poise-interrupt-DEFERRED.md` | 2026-07-13 |
| Feature | Weather (rain, puddles) — WTHR-01 | Deferred at v0.3.0-alpha scoping (real but expensive) | 2026-07-13 |
| Feature | Time-of-day gameplay hooks (TODG-01) | Needs server work — violates client-only scope | 2026-07-13 |

## Session Continuity

Last session: 2026-07-18T20:02:37.597Z
Stopped at: Completed 12-02-PLAN.md
traceability updated. Next: `/gsd-plan-phase 8` (Wind Core).
Resume file: None
