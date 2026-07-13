---
gsd_state_version: 1.0
milestone: v0.3.0-alpha
milestone_name: Living World
current_phase: 08
current_phase_name: wind-core
status: executing
stopped_at: Phase 8 context gathered
last_updated: "2026-07-13T23:29:07.374Z"
last_activity: 2026-07-13
last_activity_desc: Phase 08 execution started
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 5
  completed_plans: 2
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-13)

**Core value:** A retained PVPvE loop — chase endless Transcendence power (scarce shards past
C6), contest it via PVP theft + co-op raids, with no progress-wipe churn (C0–C6 is a protected
floor). This milestone makes the world BETWEEN fights worth living in.
**Current focus:** Phase 08 — wind-core

## Current Position

Phase: 08 (wind-core) — EXECUTING
Plan: 3 of 5
Status: Ready to execute
Last activity: 2026-07-13 — Phase 08 execution started

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

- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

*Updated after each plan completion.*
| Phase 08 P01 | 7 min | 2 tasks | 2 files |
| Phase 08 P02 | 6 min | 2 tasks | 5 files |

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

Last session: 2026-07-13T23:28:30.541Z
Stopped at: Phase 8 context gathered
traceability updated. Next: `/gsd-plan-phase 8` (Wind Core).
Resume file: .planning/phases/08-wind-core/08-CONTEXT.md
