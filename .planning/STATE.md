---
gsd_state_version: 1.0
milestone: v0.2.0-alpha
milestone_name: Combat Depth
status: roadmapped
last_updated: "2026-07-08T00:00:00.000Z"
last_activity: 2026-07-08
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-08)

**Core value:** A retained PVPvE loop — chase endless Transcendence power (scarce shards past
C6), contest it via PVP theft + co-op raids, with no progress-wipe churn (C0–C6 is a protected
floor). This milestone deepens *combat feel*: enemy attacks become dodgeable and crit becomes a
real per-character stat, so power investment (crit) buys tempo, not just damage.
**Current focus:** v0.2.0-alpha Combat Depth roadmapped (5 phases). Next: plan Phase 1 (Crit
foundation) with `/gsd-plan-phase 1`.

## Current Position

Phase: 1 — Crit foundation (not started)
Plan: —
Status: Roadmap complete, awaiting phase planning
Last activity: 2026-07-08 — v0.2.0-alpha Combat Depth roadmap created (5 phases, 25/25 reqs mapped)

## Roadmap Summary

| Phase | Goal | Requirements |
|-------|------|--------------|
| 1. Crit foundation | Per-character server-rolled crit + `isCrit` signal | CRIT-01..05 |
| 2. FSM + leapSlam + delete drain | Unit-agnostic attack FSM proven on ONE circle attack; contact drain deleted | FSM-01..06, ATK-01/05/06, ANIM-01..04, HIT-01 |
| 3. swordSwing → swordSwirl combo | Cone shape + immediate chaining | ATK-02, ATK-03 |
| 4. shieldDash lane | Travelling-hitbox lane gap-closer | ATK-04 |
| 5. Crit poise interrupt | Crit-in-windup → cancel + visible stagger (un-spoofable) | POISE-01..03 |

Dependency order is FORCED: crit (1) before the interrupt (5); one shape (2) proven before the
rest multiply (3, 4). Do not re-order.

## Performance Metrics

**Velocity:**

- Total plans completed (this milestone): 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | TBD | - | - |
| 2 | TBD | - | - |
| 3 | TBD | - | - |
| 4 | TBD | - | - |
| 5 | TBD | - | - |

*Updated after each plan completion.*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Locked for this milestone:

- [Crit trust boundary]: Crit roll is SERVER-SIDE via `ctx.random` (option b) — the only choice
  that makes the Phase-5 poise interrupt un-spoofable. Phase 1 mirrors crit stats into the server
  `CHARACTER_STATS`. Add a server-side `damage` sanity clamp as defense-in-depth.
- [Scope]: Enemies only (goliaths). The `unit_attack` FSM is built unit-agnostic (`unitKind`/
  `unitId`) so camp enemies + heroes reuse it later with ZERO schema change; heroes stay on the
  current client swing this milestone.
- [Contact drain]: The goliath→player per-tick contact drain is DELETED (Phase 2) in the same
  slice that guarantees the selection fn returns an attack in every distance band. Camp and
  goliath→enemy drains are untouched. Keeping both drain + strikes is an explicit anti-feature.
- [Zero new deps]: Hand-roll on existing seams (worldTick, combatMath, goliathAI, createEffectSystem,
  createEntityRenderer, resistances, hitscan). Refuse xstate, tween libs, physics engines, ECS libs,
  THREE.AnimationMixer. `THREE.MathUtils` (bundled) is the only interpolation helper.
- [Pass ordering]: `runUnitAttacks` MUST sit between worldTick's position-build pass and the single
  `playerDamage` apply, landing strike damage in that shared map (reuses resistance/death/shard/respawn).

### Pending Todos

None yet.

### Blockers/Concerns

- **Migrated-DB verification (per phase):** the new `unit_attack`/`attack_strike` tables start EMPTY
  on a live migrated DB (`init` only runs on a fresh DB). The FSM must lazily create attack state by
  iterating the *unit* tables, never the empty attack table. Each phase's done-criteria needs a
  "rows exist after a real engage on a MIGRATED (not freshly-seeded) DB" check.
- **INV-5 mirror parity:** `serverSync.test.ts` is stat-only today; Phase 2 extends it to assert
  `ATTACKS` duration/shape parity, kept green through every later shape. A failing parity assertion
  is release-blocking (silent client/server drift breaks dodge fairness).
- **Latency fairness:** the active-window + dodge-grace model is chosen at Phase 2 and MUST be
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

Last session: 2026-07-08
Stopped at: v0.2.0-alpha Combat Depth roadmap created (ROADMAP.md, STATE.md, REQUIREMENTS.md traceability)
Resume file: None

## Operator Next Steps

- Plan Phase 1 (Crit foundation) with `/gsd-plan-phase 1`.
