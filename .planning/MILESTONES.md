# Milestones

## v0.3.0-alpha Living World (Shipped: 2026-07-28)

**Phases completed:** 7 phases (8, 9, 9.1, 10, 11, 12, 13), 42 plans
**Closeout:** override closeout — Phases 9.1 (dynamic sun/shadows) and 10 (ambient audio) reached
plan-complete but their human UAT/verification gates were never signed off; acknowledged and
deferred at close. Phase 9.1's day/night intent is superseded by the v0.4.0 Sky Pro migration.
Known verification overrides: 13 acknowledged deferred items (see STATE.md Deferred Items).
**Git:** 364 commits, 408 files changed, +42.7k/−2.3k LOC (2026-07-14 → 2026-07-28).

**Key accomplishments:**

- **One shared wind phase** — `createWind` (gust envelope + traveling front + direction wander)
  drives grass, camp flags/banners, tree canopies, and campfire smoke from a single clock; gusts
  travel across the field as a spatial wave; each consumer keeps its own character; `?nowind`
  bisect flag. Flag pose math (downwind swing / windless drape / projectile impulse) test-first.

- **One color pipeline** — distance fog + sky-dome gradient + ~20min day-weighted day/night drift
  from a single palette, server-anchored (SDK timestamp, `Date.now()` fallback) so all LAN players
  share the time of day; night is a blue combat-readable palette; plaza lanterns fade at dusk on
  build-time lights (no runtime light add/remove).

- **Dynamic sun & shadows** (9.1) — sun direction drifts with the day/night clock on a CAPPED arc,
  per-frame texel-snapped shadow basis (no crawl under the pixel filter), `?nomovingsun` freeze.

- **Layered audio** (10) — master→compressor bus graph, gust-reactive procedural wind bed,
  day/night creature one-shots, grass rustle, combat ducking + region/combat music crossfade,
  persisted music/SFX volume.

- **Lived-in wear + wildlife + camera** — static footpath bake, plaza props, tuned scorch regrowth
  + ~2s bend trail, pooled sprint dust; sparse day butterflies, sprint-flush birds (CPU
  groundInfluence hook, never GPU readback), dusk/night emissive fireflies (combat light pool
  untouched); character run-lean + idle breathing + rare burst FOV kick, all behind a persisted
  reduce-motion toggle.

### Known Gaps (deferred, override closeout)

- **Phase 9.1 human gate** (09.1-03: FPS + crawl/midday A-B + LAN-sync verification) — superseded
  by the v0.4.0 Sky Pro day/night; not signed off.
- **Phase 10 human gate** (10-VERIFICATION `human_needed`, 10-UAT partial) — audio built,
  verification carried to backlog.
- **Debug sessions** flag-droop-and-projectile-reaction, flag-wind-direction-gust — both
  diagnosed, cosmetic, backlog.
- **Todos** raid boss / role-enforcement / crit poise interrupt (reserved milestone) + boost-orbit-v2,
  ciena-star-restyle, expand-transcend-scaling, miss/evasion decision (backlog).

---

## v0.2.0-alpha Combat Depth (Shipped: 2026-07-13)

**Phases completed:** 6 phases (1–6), 25 plans, 44 tasks
**Closeout:** override closeout — Phase 7 (crit poise interrupt) deferred to a later milestone by
user ruling at close; no milestone audit run (user-accepted). Known verification overrides: 7
acknowledged open todos (see STATE.md Deferred Items).
**Git:** 172 commits, 196 files changed, +28k/−1.5k LOC (2026-07-08 → 2026-07-13).

**Key accomplishments:**

- **Server-authoritative damage + crit** — `attackEnemies`/`attackRay`/`attackPlayer` take
  intent (isSkill + comboCount), never a damage number; the server computes base damage from
  mirrored `WEAPONS`/combo/transcend math and rolls crit via `ctx.random` from per-character
  `critRate`/`critDmg`. Client crit roll deleted — PVE and PVP damage/crit spoof holes closed.

- **Unit-agnostic attack FSM** — windup → strike → recovery on the 150ms worldTick, stored in
  additive `unit_attack`/`attack_strike` tables keyed by `unitKind`/`unitId`. Deterministic
  (tick-multiple windups, coalesced-tick transitions cascade, strike deadlines resolved never
  dropped); camp enemies + heroes can reuse it with zero schema change.

- **Full goliath attack roster, 3 hitbox shapes** — `leapSlam` (locked-landing circle),
  `swordSwing` → `swordSwirl` (live cone chaining into 360° circle), `shieldDash` (travelling
  lane with real `move:'charge'` body commit). Goliath→player contact drain DELETED — every
  point of goliath damage is now a dodgeable telegraphed strike.

- **Frost telegraph renderer** — terrain-draped circle/sector/lane ground telegraphs filling
  over the server-derived windup (`(now − startedAt)/duration`, never a client timer), legible
  through the pixel filter in icy-cyan #86e2ff.

- **Hit weight + attack feel** — per-attack procedural animation clips (crouch/leap/slam,
  swing, spin, shield charge), once-only strike VFX/SFX on `attack_strike`, server-authoritative
  knockback + per-attack stun (input freeze, stun-gated character switch, STUNNED! popup).

- **Parity discipline held** — `serverSync.test.ts` extended to crit values, `ATTACKS`
  durations/shapes, and `ATTACK_RENDER` hints; suite grew 384 → 582 tests, green at close;
  every schema change was an additive migrate-publish onto the populated local DB (zero wipes).

### Known Gaps (deferred, override closeout)

- **POISE-01/02/03** (Phase 7 — crit poise interrupt): crit-in-windup poise accrual → attack
  cancel + visible stagger. Not built. The `poise` column + reset-on-windup-entry lifecycle and
  the server-owned `isCrit` it consumes ARE shipped, so the deferred phase is a small pure-helper
  slice. Spec: `.planning/todos/pending/2026-07-13-phase-7-crit-poise-interrupt-DEFERRED.md`.
- **SC5 two-client RTT dodge-fairness check** (Phase 4) — obsolete in its maincloud form after
  the self-host pivot; carried to the prod-deploy gate.

---

## v0.1.0-alpha Transcendence (Shipped: 2026-07-08)

**Phases completed:** A + 0–5 (6 GSD phases, 23 plans, 28 tasks)
**Closeout:** override closeout — Phases 6 & 7 deferred out of scope (see Known Gaps).
**Git:** ~102 `feat(` commits, Phase A → alpha; 350 files, +49k LOC over the pre-Transcendence base.

**Key accomplishments:**

- **Two-tier economy** — renamed `primogems`→`gems` and added a scarce `transcendShards`
  currency minted 1-per-C6-overflow dupe (replacing the old 800-gem refund).

- **Transcendence install** — `owned_character.transcendLevel` + the `transcendCharacter`
  reducer (sole server-side gate for C6/cap/cost/ownership); transcend levels scale client
  damage and healer output. Rebranded in-game to **BŪSTS** (transcend) / **CIEŅA**
  (constellations) with a B1→B10 install tab, stat preview, two-step confirm, and star VFX.

- **Shards at risk** — `shard_drop` table + `applyDeathShardPenalty`: PVE death spills the
  shard as a grabbable ground collectible (1.2s grace), PVP death steals it to the killer,
  and at 0 shards the active character erodes (transcend-- then one C-level) with the C0–C6
  floor held. Verified end-to-end via two-client playtest.

- **Character roles** — intrinsic tank/dps/healer/support on all 17 characters (client +
  server `CHARACTER_STATS` mirror, INV-5 parity tests) with a Latvian role badge.

- **Multiplayer party** — `party`/`party_member`/`party_invite` tables + 5 invite-only
  reducers (invite/request/accept/decline/leave) with authz, cap 4 (`RAID_PARTY_SIZE`),
  oldest-joined leader succession, disband-when-empty, disconnect-persistent membership;
  live roster UI. Full suite 384 tests + build green.

- **Design discipline** — pure dependency-free helpers extracted test-first before every
  reducer wiring; all schema changes additive migrate-publishes (zero data loss on local).

### Known Gaps (deferred, override closeout)

- **REQ-raid-boss** (Phase 6) — party-summoned raid boss + `RAID_SHARD_PAYOUT` split. Not
  built. INV-4 (a ganked non-payer recovers via the raid faucet) is therefore **not yet
  satisfied** — the recovery half of the loop ships in the next milestone.

- **REQ-raid-roles-balance** (Phase 7) — raid role soft-gates, balance pass, full end-to-end
  loop validation, maincloud deploy. Not built.

- Specs preserved under `.planning/todos/pending/*-DEFERRED.md`.

### Deferred backlog items (acknowledged at close 2026-07-08)

| Category | Item | Status |
|----------|------|--------|
| phase | phase-6-raid-boss | deferred to next milestone |
| phase | phase-7-role-enforcement-balance | deferred to next milestone |
| game | boost-orbit-v2-paths-shapes | pending backlog |
| ui | ciena-star-restyle | pending backlog |
| game | expand-transcend-scaling | pending backlog |

---
