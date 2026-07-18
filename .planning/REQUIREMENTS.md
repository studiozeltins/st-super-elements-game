# Requirements: super-elements — Milestone v0.3.0-alpha "Living World"

**Defined:** 2026-07-13
**Core Value:** A retained PVPvE loop — this milestone makes the world BETWEEN fights feel
alive (sound, light, motion, wildlife) so the sandbox is worth living in. All client-only —
zero server publish.

## v1 Requirements (this milestone)

### Wind Core (WIND)

- [x] **WIND-01**: Player sees grass, camp flags/banners, tree canopies, and campfire smoke
  all sway from ONE shared wind module (direction, strength, time, gust envelope) — grass
  rendering unchanged after the `uTime` extraction

- [x] **WIND-02**: Player sees gusts visibly TRAVEL across the field (spatial phase offset
  by `dot(worldPos, windDir)/gustWavelength`), not the whole world bowing in unison

- [x] **WIND-03**: Each consumer keeps its own character on the shared phase — flags flap
  faster, smoke drifts laterally (instanced quads rising with sine drift), canopies sway
  low-amplitude/low-frequency

### Atmosphere (ATMO)

- [x] **ATMO-01**: Player sees distant terrain dissolve into the sky color — linear
  `scene.fog` (mutated in place, never reassigned) with `near` beyond combat readability
  radius, `far` hiding the world edge

- [x] **ATMO-02**: Player sees a sky/horizon gradient whose bottom color equals the fog
  color — fog + sky + day/night are ONE color pipeline from a single source

- [x] **ATMO-03**: Combat readability is untouched — telegraphs, enemies, and gem drops
  inside the gameplay radius keep ~full contrast at all times of day

### Day/Night Lite (DAYNITE)

- [x] **DAYNITE-01**: World color drifts through dawn → day → dusk → night (~20min cycle,
  asymmetric: day-weighted, short dusk/dawn) via smoothstep-blended keys of hemisphere/sun
  color+intensity, fog color, and sky — sun/shadow DIRECTION never moves

- [x] **DAYNITE-02**: All players see the same time of day — phase derived from a
  server-anchored timestamp (SDK event timestamp; `Date.now()` fallback), advanced in the
  game loop (never derived per React render), bigint modulo before Number()

- [x] **DAYNITE-03**: Night keeps a blue ambient floor — never below combat-readable
  contrast (~40–50% day exposure); night = palette, not darkness

- [x] **DAYNITE-04**: Plaza lanterns fade in at dusk and out at dawn (warm points vs cool
  night; no runtime light add/remove — intensity fade on build-time lights)

### Dynamic Sun & Shadows (SHADOW) — Phase 9.1 (inserted; overrides DAYNITE-01/D-02 frozen-sun)

- [x] **SHADOW-01**: Sun direction drifts with the SAME day/night phase/server clock as the
  color cycle — dawn shadows fall one way, dusk the other, never desynced from the palette

- [x] **SHADOW-02**: The sun arc is CAPPED (never grazes the horizon) so telegraphs, enemies,
  and gem drops inside the gameplay radius keep ~full contrast at every time of day — ATMO-03
  preserved under a moving sun

- [x] **SHADOW-03**: The shadow-map basis recomputes per-frame from the moving sun WITH
  texel-snapping — no shadow shimmer/crawl under the pixel filter, no FPS regression during a
  golem-class fight (`scripts/fps_playtest.py`)

- [x] **SHADOW-04**: A reduce-motion / `?nomovingsun` path pins the sun to a fixed high-noon
  key — exactly Phase 9's frozen-sun fallback

### Ambient Audio Bed (AMBI)

- [x] **AMBI-01**: Audio routes through a master/ambient/sfx bus with a compressor —
  existing SFX migrated off direct `context.destination`; single shared AudioContext

- [x] **AMBI-02**: Player hears a continuous procedural wind bed (filtered noise, slowly
  modulated) whose gain swells with the wind module's gust envelope

- [x] **AMBI-03**: Player hears randomized one-shots — bird chirps every 5–15s with pitch
  ±10–20% + pan + volume jitter (never a fixed-interval metronome); synth-first,
  playtest-gated with CC0 recording swap as fallback

- [x] **AMBI-04**: Player hears grass rustle when sprinting through grass cells
- [x] **AMBI-05**: Player hears distant goliath grunts, gain scaled by nearest-camp
  proximity, long random intervals

- [x] **AMBI-06**: Combat ducks the ambience — birds stop entirely, bed ducks −6..−12dB
  over ~1s, restores over ~2–3s after combat ends (never hard-cut)

- [x] **AMBI-07**: Ambience varies by time of day — birds by day, crickets/owl at night
  (paired with DAYNITE phase)

### Music (MUSIC)

- [x] **MUSIC-01**: Player hears a region exploration music loop (CC0/properly-licensed
  track, seamless loop) on the music bus at ambient-friendly volume

- [x] **MUSIC-02**: Combat music crossfades in when combat starts and back out when combat
  ends (same combat-state signal as AMBI-06) — horizontal crossfade, no hard cuts

- [x] **MUSIC-03**: Player can mute/adjust music independently of SFX (music vs sfx bus
  gain), persisted locally

### Wildlife (WILD)

- [ ] **WILD-01**: Player sees butterflies wandering over grass patches by day — instanced
  quads, summed-sine/noise wander, sparse population (encounter = event, not wallpaper),
  spawn/despawn near player

- [ ] **WILD-02**: Birds flush — sprinting through grass makes 2–4 birds burst up on a
  scripted rising arc with a wing one-shot, then despawn (hooked at the CPU groundInfluence
  stamp site, never reading the GPU texture)

- [ ] **WILD-03**: Player sees fireflies at dusk/night — emissive instanced quads with
  randomized glow pulse phase; NO pooled runtime lights (lightPool stays combat-owned)

### Lived-in Wear (WEAR)

- [ ] **WEAR-01**: Worn footpaths run along REAL routes (camp↔camp, plaza↔bridge) —
  static bake: grass placement thinned along path splines + ground tint strip (never the
  decaying influence channels)

- [ ] **WEAR-02**: Plaza has lived-in props — crates, fences, lanterns arranged to answer
  "who put this here" (market edge, path gaps), frozen-matrix static meshes

- [ ] **WEAR-03**: Scorch marks regrow — existing scorch decay tuned so battle wear heals
  over minutes

- [ ] **WEAR-04**: Player leaves a lingering grass-bend trail (~2s fade) — existing
  groundInfluence bend decay tuned/verified for the target feel

- [ ] **WEAR-05**: Sprint steps on dirt/path puff small pooled dust sprites

### Camera Feel (CAM) — do last

- [ ] **CAM-01**: Character (not camera) leans slightly into run direction with a spring
  (~2–4°, playtest-tuned)

- [ ] **CAM-02**: Idle characters have a subtle breathing sway (on the character model,
  never continuous camera motion — pixel-crawl + nausea)

- [ ] **CAM-03**: Burst damage triggers a brief FOV kick (+2–5°, ~60ms in / ~300ms
  spring-back) — rare high-tier events only, never every hit

- [ ] **CAM-04**: A "reduce camera motion" toggle zeroes lean/roll/FOV-kick (XAG 117),
  persisted locally

## v2 Requirements (future)

### Weather

- **WTHR-01**: Rain with wet-surface look + puddles (deferred — real but expensive)

### Music expansion

- **MUSX-01**: Per-region exploration/combat tracks once a second region exists
- **MUSX-02**: Vertical layering (stems) instead of simple crossfade

### Time-of-day gameplay

- **TODG-01**: Night-gated spawns/content (needs server work + balance — violates
  client-only scope now)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Weather (rain, puddles) | User ruling at scoping — real but expensive, deferred |
| Sun/shadow direction movement | Fights the texel-snapped shadow basis; color drift only |
| YouTube-ripped audio | ToS violation + copyright; CC0 sources only for any assets |
| Fixed-interval/fixed-pitch chirps | Canonical ambience failure — becomes a metronome |
| Dense/exponential fog | Eats combat-radius contrast; fog is a horizon device here |
| Per-system independent wind | Desynced sway reads worse than static props |
| Full wind fluid sim / vorticles | Weeks of work, invisible at this camera + art style |
| Wildlife with real AI (pathfinding/flocking/persistence) | CPU + complexity nobody inspects; violates no-alloc rules |
| Pitch-black night | Combat unreadability = gameplay regression |
| Continuous camera bob/sway | Documented motion-sickness trigger + full-screen pixel crawl on the nearest-filtered pixel target |
| Fireflies/lanterns as pooled runtime lights | Light-count change recompiles all lit materials; pool is 4 lights, combat-owned |
| Gameplay keyed to time of day | Server work in a client-only milestone |
| Raid boss / poise interrupt / other combat systems | Separate milestone candidates (see PROJECT.md) |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| WIND-01 | Phase 8 | Complete |
| WIND-02 | Phase 8 | Complete |
| WIND-03 | Phase 8 | Complete |
| ATMO-01 | Phase 9 | Complete |
| ATMO-02 | Phase 9 | Complete |
| ATMO-03 | Phase 9 | Complete |
| DAYNITE-01 | Phase 9 | Complete |
| DAYNITE-02 | Phase 9 | Complete |
| DAYNITE-03 | Phase 9 | Complete |
| DAYNITE-04 | Phase 9 | Complete |
| SHADOW-01 | Phase 9.1 | Complete |
| SHADOW-02 | Phase 9.1 | Complete |
| SHADOW-03 | Phase 9.1 | Complete |
| SHADOW-04 | Phase 9.1 | Complete |
| AMBI-01 | Phase 10 | Complete |
| AMBI-02 | Phase 10 | Complete |
| AMBI-03 | Phase 10 | Complete |
| AMBI-04 | Phase 10 | Complete |
| AMBI-05 | Phase 10 | Complete |
| AMBI-06 | Phase 10 | Complete |
| AMBI-07 | Phase 10 | Complete |
| MUSIC-01 | Phase 10 | Complete |
| MUSIC-02 | Phase 10 | Complete |
| MUSIC-03 | Phase 10 | Complete |
| WEAR-01 | Phase 11 | Pending |
| WEAR-02 | Phase 11 | Pending |
| WEAR-03 | Phase 11 | Pending |
| WEAR-04 | Phase 11 | Pending |
| WEAR-05 | Phase 11 | Pending |
| WILD-01 | Phase 12 | Pending |
| WILD-02 | Phase 12 | Pending |
| WILD-03 | Phase 12 | Pending |
| CAM-01 | Phase 13 | Pending |
| CAM-02 | Phase 13 | Pending |
| CAM-03 | Phase 13 | Pending |
| CAM-04 | Phase 13 | Pending |

**Coverage:**

- v1 requirements: 32 total
- Mapped to phases: 32
- Unmapped: 0 ✓

---
*Requirements defined: 2026-07-13*
*Last updated: 2026-07-14 — traceability mapped to roadmap Phases 8–13 (v0.3.0-alpha)*
