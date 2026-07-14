# Roadmap: super-elements

## Milestones

- 🚧 **v0.3.0-alpha Living World** — Phases 8–13 (in progress)
- ✅ **v0.2.0-alpha Combat Depth** — Phases 1–6 (shipped 2026-07-13; Phase 7 crit poise interrupt deferred)
- ✅ **v0.1.0-alpha Transcendence** — Phases A, 0–5 (shipped 2026-07-08)
- 🔒 **Reserved for a later milestone** — Raid boss + role enforcement/balance (carries INV-4) · Crit poise interrupt (POISE-01..03)

---

## 🚧 v0.3.0-alpha Living World (Phases 8–13)

**Milestone goal:** Make the world between fights feel alive — one coherent wind phase across
everything that sways, distance fog + sky depth, day/night color drift, a layered procedural
ambient audio bed + region music, lived-in wear, sparse reactive wildlife, and camera micro-feel.
All client-only (zero server publish; the day/night phase anchors from an SDK event timestamp
with `Date.now()` fallback). Weather explicitly deferred.

**Build order is dependency-forced** (research-verified): wind first (five later systems consume
its phase), atmosphere + day/night second (fog/sky/palette are ONE color pipeline and gate
fireflies/lanterns), audio third (needs the gust envelope; music shares the bus + combat signal),
wear fourth, wildlife fifth (needs wind + dusk gate + motion signal + audio bus), camera last
(only feature that can make players ill; motion toggle is an acceptance criterion). Final
milestone verification: `scripts/fps_playtest.py` during a golem-class fight with ALL ambiance
enabled — per-phase costs sum.

## Phases

**Phase Numbering:** Integer phases (8, 9, …) are planned milestone work; decimal phases
(8.1, 8.2) are urgent insertions. Numbering continues from v0.2.0-alpha (ended at Phase 7).

- [ ] **Phase 8: Wind Core** - One shared wind module (phase, gusts, direction) drives grass, flags, canopies, and smoke, with visibly traveling gust waves
- [ ] **Phase 9: Atmosphere & Day/Night** - Distance fog + sky gradient + ~20min day/night color drift as ONE server-anchored color pipeline, lanterns at dusk
- [ ] **Phase 10: Ambient Audio & Music** - Bus/compressor refactor, procedural wind bed + randomized one-shots, region + combat music crossfade, combat ducking
- [ ] **Phase 11: Lived-in Props & Wear** - Worn footpaths on real routes, plaza props, scorch regrowth + bend-trail tuning, sprint dust puffs
- [ ] **Phase 12: Wildlife** - Instanced butterflies by day, startle-flush birds off the sprint signal, emissive fireflies at dusk/night
- [ ] **Phase 13: Camera Feel** - Run lean, idle breathing on the model, burst-damage FOV kick — all zeroed by a persisted reduce-motion toggle

## Phase Details

### Phase 8: Wind Core

**Goal**: Everything that sways in the world moves on one coherent, gusting wind
**Depends on**: Nothing (first phase of milestone)
**Requirements**: WIND-01, WIND-02, WIND-03
**Success Criteria** (what must be TRUE):

  1. Grass, camp flags/banners, tree canopies, and campfire smoke columns all sway from ONE shared wind phase — no system drifts out of sync
  2. Gusts visibly TRAVEL across the field as a moving wave (spatial phase offset), not the whole world bowing in unison
  3. Each consumer keeps its own character on the shared phase — flags flap faster, smoke drifts laterally as it rises, canopies sway low-amplitude/low-frequency
  4. Grass rendering looks unchanged after the `uTime` extraction, and a `?nowind` flag kills all sway for bisecting

**Plans**: 11 plans (5 original + 2 gap closure + 2 UAT gap closure + 2 UAT round-2 gap closure)

Plans:
**Wave 1**

- [x] 08-01-PLAN.md — windMath pure helper, test-first (gust envelope, traveling front, wander) [Wave 1]

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 08-02-PLAN.md — createWind module + grass extraction onto shared clock + ?nowind [Wave 2]

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 08-03-PLAN.md — canopy shader sway (pooled materials) + new camp flag assets [Wave 3]
- [x] 08-04-PLAN.md — campfire smoke columns (instanced voxel puffs) + ?nosmoke [Wave 3]

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 08-05-PLAN.md — full gate + human playtest checkpoint (grass unchanged, gust travel, character) [Wave 4]

**Gap Closure** *(from 08-VERIFICATION.md — run with `/gsd-execute-phase 8 --gaps-only`)*

- [x] 08-06-PLAN.md — wind-scoped flag/canopy material caches (CR-01/CR-02), tree-base height ramp (WR-02), flag test coverage (WR-03) [Wave 1]
- [x] 08-07-PLAN.md — smoke teardown wiring in createGame.dispose() + complete buffer release (WR-01) [Wave 1]

**UAT Gap Closure** *(from 08-UAT.md flag issues — run with `/gsd-execute-phase 8 --gaps-only`)*

- [x] 08-08-PLAN.md — windMath flag pose math: downwind swing + windless drape mirrors/GLSL generators, test-first (UAT tests 4/5/6/9) [Wave 1]
- [x] 08-09-PLAN.md — createCampFlag shader rework: in-shader downwind yaw, limp drape at ?nowind, voxel-stepped cloth (UAT tests 4/5/6/8/9) [Wave 2]

**UAT Gap Closure — Round 2** *(from 08-UAT.md round-2 flag issues — run with `/gsd-execute-phase 8 --gaps-only`)*

- [ ] 08-10-PLAN.md — windMath drape-driver rebalance (test-first): continuous gust-envelope droop so the calm flag hangs between gusts and lifts under a gust (Gap 1, UAT test 3) [Wave 1]
- [ ] 08-11-PLAN.md — projectile→flag coupling: distance-gated disturbFlags + per-flag decaying impulse displacement, mirroring stampGround (Gap 2, UAT test 4) [Wave 2]

### Phase 9: Atmosphere & Day/Night

**Goal**: The world has horizon depth and a shared time-of-day palette that never hurts combat readability
**Depends on**: Nothing (independent of Phase 8; ordered second because fog/sky/day-night are one color pipeline that gates fireflies and lanterns)
**Requirements**: ATMO-01, ATMO-02, ATMO-03, DAYNITE-01, DAYNITE-02, DAYNITE-03, DAYNITE-04
**Success Criteria** (what must be TRUE):

  1. Distant terrain dissolves into the sky color and the world edge is hidden, while telegraphs, enemies, and gem drops inside the gameplay radius keep ~full contrast at all times of day
  2. The sky/horizon gradient's bottom color always equals the fog color — fog, sky, and day/night blend from a single source
  3. World color drifts dawn → day → dusk → night over a ~20min day-weighted cycle while the sun/shadow direction never moves
  4. All LAN players see the same time of day, and night keeps a blue combat-readable ambient floor — night is a palette, never darkness
  5. Plaza lanterns fade in at dusk and out at dawn (intensity fade on build-time lights, no runtime light add/remove)

**Plans**: TBD

### Phase 10: Ambient Audio & Music

**Goal**: The world sounds alive — a layered procedural ambience bed and region music, both combat-aware
**Depends on**: Phase 8 (gust envelope sidechains the wind bed), Phase 9 (time-of-day ambience variation)
**Requirements**: AMBI-01, AMBI-02, AMBI-03, AMBI-04, AMBI-05, AMBI-06, AMBI-07, MUSIC-01, MUSIC-02, MUSIC-03
**Success Criteria** (what must be TRUE):

  1. All game audio routes through master/ambient/music/sfx buses with a compressor — existing SFX migrated off `context.destination`, dense fights never clip
  2. Player hears a continuous wind bed that swells with the visible gusts, plus randomized bird chirps, sprint grass rustle, and camp-proximity goliath grunts — never a fixed-interval metronome
  3. Ambience follows the time of day — birds by day, crickets/owl at night
  4. Combat ducks the ambience (birds stop, bed drops −6..−12dB over ~1s) and crossfades combat music in and back out on the same combat signal — never a hard cut
  5. Player can mute/adjust music independently of SFX, persisted locally

**Plans**: TBD
**UI hint**: yes

### Phase 11: Lived-in Props & Wear

**Goal**: The world looks inhabited and reacts to traffic — paths, props, and healing battle wear
**Depends on**: Nothing (static bakes + tuning of existing systems; conventionally after Phase 10)
**Requirements**: WEAR-01, WEAR-02, WEAR-03, WEAR-04, WEAR-05
**Success Criteria** (what must be TRUE):

  1. Worn footpaths run along REAL routes (camp↔camp, plaza↔bridge) as a static bake — they never fade away
  2. The plaza reads lived-in — crates, fences, and lanterns arranged to answer "who put this here"
  3. Scorch marks regrow over minutes, and the player leaves a lingering ~2s grass-bend trail
  4. Sprint steps on dirt/path puff small pooled dust sprites

**Plans**: TBD

### Phase 12: Wildlife

**Goal**: Sparse, reactive wildlife makes encounters feel like events, at zero frame cost blowout
**Depends on**: Phase 8 (wind drift), Phase 9 (firefly dusk gate), Phase 10 (wing one-shot on the sfx bus)
**Requirements**: WILD-01, WILD-02, WILD-03
**Success Criteria** (what must be TRUE):

  1. Butterflies wander over grass patches by day — sparse enough that spotting one feels like an event, spawning/despawning near the player
  2. Sprinting through grass flushes 2–4 birds bursting up on a rising arc with a wing one-shot, then despawning
  3. Fireflies pulse at dusk/night as emissive instanced quads — the combat light pool is never touched
  4. Frame rate holds through a golem-class fight with ALL ambiance systems enabled (`scripts/fps_playtest.py` run as the milestone-wide perf gate)

**Plans**: TBD

### Phase 13: Camera Feel

**Goal**: Motion micro-polish that rewards movement and combat — and can be fully disabled
**Depends on**: Nothing structurally — ordered LAST by design (accessibility risk; PROJECT.md ruling)
**Requirements**: CAM-01, CAM-02, CAM-03, CAM-04
**Success Criteria** (what must be TRUE):

  1. The character (not the camera) leans slightly into run direction with a spring, and idle characters have a subtle breathing sway on the model — never continuous camera motion
  2. Burst damage triggers a brief FOV kick on rare high-tier events only, never every hit
  3. A "reduce camera motion" toggle zeroes lean/roll/FOV kick and persists locally
  4. Pixelated mode shows no pixel-crawl from any camera-feel effect (tuned in pixel-filter mode)

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:** 8 → 9 → 10 → 11 → 12 → 13 (8 and 9 are order-swappable in principle; 10 needs 8+9, 12 needs 8+9+10, 13 is last by ruling)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 8. Wind Core | 9/11 | UAT gap closure | - |
| 9. Atmosphere & Day/Night | 0/TBD | Not started | - |
| 10. Ambient Audio & Music | 0/TBD | Not started | - |
| 11. Lived-in Props & Wear | 0/TBD | Not started | - |
| 12. Wildlife | 0/TBD | Not started | - |
| 13. Camera Feel | 0/TBD | Not started | - |

---

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
