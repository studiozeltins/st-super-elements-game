---
gsd_state_version: 1.0
milestone: v0.2.0-alpha
milestone_name: Combat Depth
current_phase: 05
current_phase_name: swordSwing → swordSwirl combo
status: executing
stopped_at: "Phase 05 planned (5 plans, checker passed iteration 2). Gate override: decision-coverage parser could-not-parse (D5-NN vs D-NN, same as Phase 4) — proceeded on plan-checker Dimension 7 PASS (D5-01..D5-16 all traced)."
last_updated: "2026-07-10T16:00:06.462Z"
last_activity: 2026-07-10
last_activity_desc: Phase 05 execution started
progress:
  total_phases: 7
  completed_phases: 4
  total_plans: 20
  completed_plans: 17
  percent: 57
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-08)

**Core value:** A retained PVPvE loop — chase endless Transcendence power (scarce shards past
C6), contest it via PVP theft + co-op raids, with no progress-wipe churn (C0–C6 is a protected
floor). This milestone deepens *combat feel*: enemy attacks become dodgeable and crit becomes a
real per-character stat, so power investment (crit) buys tempo, not just damage.
**Current focus:** Phase 05 — swordSwing → swordSwirl combo

## Current Position

Phase: 05 (swordSwing → swordSwirl combo) — EXECUTING
Plan: 3 of 5
Status: Ready to execute
Last activity: 2026-07-10 — Phase 05 execution started

## Roadmap Summary

| Phase | Goal | Requirements |
|-------|------|--------------|
| 1. Crit stats + server damage foundation | Distinct per-character crit stats mirrored server-side + tested base-damage/crit pure helpers (no wiring) | CRIT-01, CRIT-03 |
| 2. Server-authoritative damage + crit on enemies | Server computes base damage + rolls crit (`ctx.random`); client sends intent; old client roll deleted; crit event table | CRIT-02, CRIT-04, CRIT-05, CRIT-06 |
| 3. PVP crit | Same server damage/crit path extended to `attackPlayer` | CRIT-07 |
| 4. Attack state machine + leapSlam + delete drain | Unit-agnostic attack state machine (windup→strike→recovery) proven on ONE circle attack; contact drain deleted | FSM-01..06, ATK-01/05/06, ANIM-01..04, HIT-01 |
| 5. swordSwing → swordSwirl combo | Cone shape + immediate chaining | ATK-02, ATK-03 |
| 6. shieldDash lane | Travelling-hitbox lane gap-closer | ATK-04 |
| 7. Crit poise interrupt | Crit-in-windup → cancel + visible stagger (un-spoofable) | POISE-01..03 |

Dependency order is FORCED: crit stats/resolution (1–3) before the interrupt (7); one shape (4)
proven before the rest multiply (5, 6). Do not re-order.

## Performance Metrics

**Velocity:**

- Total plans completed (this milestone): 1
- Average duration: ~4 min
- Total execution time: ~4 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 1/3 | ~4 min | ~4 min |
| 2 | TBD | - | - |
| 03 | 2 | - | - |
| 4 | TBD | - | - |
| 5 | TBD | - | - |
| 6 | TBD | - | - |
| 7 | TBD | - | - |

*Updated after each plan completion.*
| Phase 01 P02 | 3 | 3 tasks | 3 files |
| Phase 01 P03 | 6m | 2 tasks | 1 files |
| Phase 03 P01 | 6 min | 3 tasks | 8 files |
| Phase 03 P02 | ~9min | 2 tasks | 0 files |
| Phase 04 P01 | 7min | 3 tasks | 7 files |
| Phase 04 P02 | 10min | 2 tasks | 3 files |
| Phase 04 P03 | 12min | 2 tasks | 10 files |
| Phase 04 P04 | ~8min | 2 tasks | 3 files |
| Phase 04 P05 | 45min | 2 tasks | 3 files |
| Phase 04 P06 | ~8min | 3 tasks | 3 files |
| Phase 05 P01 | 14min | 3 tasks | 8 files |
| Phase 05 P02 | 9min | 2 tasks | 3 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Locked for this milestone:

- [Crit trust boundary]: Crit roll is SERVER-SIDE via `ctx.random` (option b) — the only choice
  that makes the Phase-7 poise interrupt un-spoofable. Phase 1 mirrors crit stats into the server
  `CHARACTER_STATS`; Phase 2 resolves the roll + records `isCrit`.

- [Damage authority — Option B, from Phase-1 discuss]: Base damage is computed SERVER-SIDE
  (CRIT-06) — the server mirrors `WEAPONS` + combo/skill/transcend math (Phase 1) and the reducers
  drop the client `damage` arg for intent (Phase 2), closing the PVP damage-spoof hole. Chosen over
  client-sends-damage. `MAX_HIT_DAMAGE` clamp kept as defense-in-depth.

- ["No new tables" waived]: A crit event table IS added (Phase 2) so the server-owned `isCrit`
  reaches all clients truthfully (mirrors `skill_cast`/`ranged_attack`). The roadmap's original
  Phase-1 "no new tables" note is explicitly superseded by user decision.

- [PVP crit in scope — CRIT-07]: The same server crit/damage path extends to `attackPlayer`
  (Phase 3), promoted from decision D-06 to a first-class requirement.

- [Crit split into Phases 1–3]: Option B grew the crit work past one phase, so it is split —
  1: stats + mirror + pure helpers (no wiring); 2: server-authoritative resolution on enemies;
  3: PVP. No-monolith holds: server logic carves into `crit.ts`/`damage.ts` siblings, `index.ts`
  gains only table defs + reducer-arg changes.

- [Scope]: Enemies only (goliaths). The `unit_attack` attack state machine is built unit-agnostic
  (`unitKind`/`unitId`) so camp enemies + heroes reuse it later with ZERO schema change; heroes
  stay on the current client swing this milestone.

- [Contact drain]: The goliath→player per-tick contact drain is DELETED (Phase 4) in the same
  slice that guarantees the selection fn returns an attack in every distance band. Camp and
  goliath→enemy drains are untouched. Keeping both drain + strikes is an explicit anti-feature.

- [Zero new deps]: Hand-roll on existing seams (worldTick, combatMath, goliathAI, createEffectSystem,
  createEntityRenderer, resistances, hitscan). Refuse xstate, tween libs, physics engines, ECS libs,
  THREE.AnimationMixer. `THREE.MathUtils` (bundled) is the only interpolation helper.

- [Pass ordering]: `runUnitAttacks` MUST sit between worldTick's position-build pass and the single
  `playerDamage` apply, landing strike damage in that shared map (reuses resistance/death/shard/respawn).

- [Phase ?]: critDmg stored as full multiplier (e.g. 1.9), matching value it replaces in Phase 2
- [Phase ?]: 17 distinct role-seeded critRate values (D-01/D-02); user tunes in playtest
- [Phase ?]: Server CHARACTER_STATS kept single-line flat so serverSync regex extractor keeps parsing
- [Phase 03]: pvp_hit extended additively (attacker/isCrit with .default()); attackPlayer intent-only via resolvePlayerHit, no PVP resistance profile (D3-03); victim crit = new purple pvpCrit kind, attacker suppression in App.tsx pvpHit callback
- [Phase 03]: D3-01 resolved: additive .default() columns on an event table pass SpacetimeDB automatic migration on a populated DB — The 03-02 additive publish of extended pvp_hit was accepted as UPDATE of the populated local DB (no wipe, no fallback ladder) — future event-table migrations can append .default() columns directly
- [Phase 04]: 04-01: dueAttackTransitions cascades fully to IDLE — a coalesced tick jumped past every deadline emits [STRIKE, RECOVERY, IDLE] in one ordered call (FSM-05 resolve-never-drop)
- [Phase 04]: 04-01: grace deadline is derived per call (graceDeadline(row.strikeAtMicros, spec.graceTicks, tick)), never stored — D4-02 zero-storage grace; recoveryEndsAtMicros written only at windup entry
- [Phase ?]: 04-02: dead-row hygiene scans unit_attack via a local alias; FSM driver iterates the live-goliath list (FSM-06)
- [Phase ?]: 04-02: grace resolution re-finds victim rows live via player.identity.find instead of the tick-start snapshot (D4-02)
- [Phase ?]: 04-02: src/unitAttacks.ts added to spacetimedb tsconfig include until Plan 03 wires the import
- [Phase 04]: 04-03: STDB rejects plain function exports from the module entry file at publish time (tsc passes, module-hooks validator throws) — shared helpers must live in pure sibling modules; worldRules.ts created for clampToWorld/isInsideSafeZone/aggroExpired
- [Phase 04]: 04-03: serverSync parity extractor scans index.ts + worldRules.ts concatenated so constants carved out of index.ts stay parity-asserted (INV-5)
- [Phase 04]: 04-04: telegraph timing anchor re-arms on startedAtMicros change (fresh cast re-locks landing, restarts fill); syncGoliaths re-gates telegraphs with the fresh alive map so a mid-windup goliath death drops its disc immediately
- [Phase 04]: 04-05: animateAttack is OPTIONAL on EntityAnimation — camp enemies compile unchanged (ANIM-03); implementers restore neutral in animateMovement/animateDeath
- [Phase 04]: 04-05: goliath leap arc rides travelFraction (actual mesh travel toward the locked landing), not phaseProgress — parabola grounds exactly on arrival
- [Phase 04]: 04-05: recovery phase start is anchored by the state change's ARRIVAL (grace deadline is zero-storage on the row, D4-02)
- [Phase ?]: 04-06: slam SFX is procedural WebAudio (sine thump + lowpass noise), zero assets/deps; gesture-unlocked lazy AudioContext with self-removing listeners
- [Phase ?]: 04-06: stun input freeze gates movement AND jump/attack/skill (must-have says input frozen); y stays local so knockback-off-edge dies via VOID_KILL_DEPTH (D4-11)
- [Phase ?]: 04-06: stun lerp target is the freshest self row via stunServerPosition; syncPositionToServer untouched — server-side updatePosition rejection remains the control (T-04-12)
- [Phase ?]: 05-01: chain break contract locked pure — walkAttackTransitions STOPS the walk at a chain swap so the old attack's stale IDLE never writes cooldowns (Pitfall 2)
- [Phase ?]: 05-01: per-role cooldown split is data-driven — IDLE writes basicCooldownUntilMicros for role 'basic', cooldownUntilMicros for 'skill' (D5-08/D5-13)
- [Phase ?]: 05-01: unitAttacks glue passes literal 0n basic cooldown until 05-03 adds the column — do NOT publish the module between 05-01 and 05-03 (swing would resolve as circle, no chain)
- [Phase 05]: 05-02: swirl strike yaw lerps -coil -> exactly 2pi so the spin ends visually neutral (2pi = 0) and recovery never counter-spins; spin drives model.body (named torso), never the group (lookAt owns it)
- [Phase 05]: 05-02: neutral-restore extension is one shared resetAttackPose (torso lean/yaw + arm x/z) called from BOTH animateMovement and animateDeath — Pitfall 10 provable from one function
- [Phase 05]: 05-02: juice magnitudes are handler-local named constants in createGame.ts, NOT parity material for the 05-04 client mirror (RESEARCH OQ2)

### Pending Todos

6 pending (see `.planning/todos/pending/`). Latest: Miss/evasion system decision (accuracy vs evasion vs none) — needs user pros/cons decision before any milestone slot.

### Blockers/Concerns

- **Migrated-DB verification (per phase):** the new `unit_attack`/`attack_strike` tables start EMPTY
  on a live migrated DB (`init` only runs on a fresh DB). The FSM must lazily create attack state by
  iterating the *unit* tables, never the empty attack table. Each phase's done-criteria needs a
  "rows exist after a real engage on a MIGRATED (not freshly-seeded) DB" check.

- **INV-5 mirror parity:** `serverSync.test.ts` is stat-only today; Phase 1 extends it to assert
  crit + weapon-damage/multiplier parity, and Phase 4 further extends it to `ATTACKS` duration/shape
  parity, kept green through every later shape. A failing parity assertion is release-blocking
  (silent client/server drift breaks dodge fairness).

- **Latency fairness:** the active-window + dodge-grace model is chosen at Phase 4 and MUST be
  validated over real maincloud RTT (LAN hides the unfairness) via a two-client playtest.

- **Determinism:** no `Math.random`/`Date.now` in `spacetimedb/src` (grep-gate); windups authored as
  exact tick multiples (≥0.35s / ≥2 ticks); a passed strike deadline is resolved, never dropped.

- **Ops invariants:** pnpm only; server module path is `./spacetimedb` (ignore the wrong-path
  `spacetime:publish` npm scripts). Additive migrate-publish only; never `--delete-data` on a DB with
  real accounts. Maincloud deploy deferred to a user-facing prod point.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Feature | Elemental resistance system | Deferred to future milestone | 2026-07-06 |
| Feature | XP/levelling for players + enemies | Deferred to future milestone | 2026-07-06 |
| Feature | Email password reset | Deferred (needs external service) | 2026-07-06 |
| Phase | Raid boss (party-gated shard faucet, INV-4) | Reserved for a later milestone; spec at `.planning/todos/pending/2026-07-08-phase-6-raid-boss-DEFERRED.md` | 2026-07-08 |
| Phase | Role enforcement + balance + full validation | Reserved for a later milestone; spec at `.planning/todos/pending/2026-07-08-phase-7-role-enforcement-balance-DEFERRED.md` | 2026-07-08 |
| Combat | Convert camp enemies to the same FSM (XCMB-01) | v2 — after goliath feel dialed in | 2026-07-08 |
| Combat | Weapon/constellation crit contributions (XCMB-02) | v2 | 2026-07-08 |
| Combat | Hero attack FSM + i-frame/parry (XCMB-04) | v2 | 2026-07-08 |
| Combat | Tiered poise/hyperarmor/break (XCMB-05) | v2 | 2026-07-08 |

## Session Continuity

Last session: 2026-07-10T15:59:32.259Z
Stopped at: Phase 05 planned (5 plans, checker passed iteration 2). Gate override: decision-coverage parser could-not-parse (D5-NN vs D-NN, same as Phase 4) — proceeded on plan-checker Dimension 7 PASS (D5-01..D5-16 all traced).
Resume file: .planning/phases/05-swordswing-swordswirl-combo/05-01-PLAN.md

**Gate override (2026-07-09):** Phase 4 decision-coverage gate returned `could-not-parse` — CONTEXT.md uses `D4-NN` decision IDs, parser expects `D-NN`. Proceeded on plan-checker Dimension 7 PASS (all D4-01…D4-17 manually traced to plan tasks). verify-phase should re-confirm decision coverage semantically, not via the parser.

## Operator Next Steps

- Execute Phase 4 with `/gsd-execute-phase 4`.
