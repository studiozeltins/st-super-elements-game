---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 04
current_phase_name: formalize-character-roles
status: executing
stopped_at: Completed 04-01-PLAN.md
last_updated: "2026-07-07T10:15:25.312Z"
last_activity: 2026-07-07
last_activity_desc: Phase 04 execution started
progress:
  total_phases: 8
  completed_phases: 4
  total_plans: 17
  completed_plans: 16
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-06)

**Core value:** A retained PVPvE loop — chase endless Transcendence power (scarce shards past
C6), contest it via PVP theft + co-op raids, with no progress-wipe churn (C0–C6 is a protected
floor).
**Current focus:** Phase 04 — formalize-character-roles

## Current Position

Phase: 04 (formalize-character-roles) — EXECUTING
Plan: 2 of 2
Status: Ready to execute
Last activity: 2026-07-07 — Phase 04 execution started

Progress: [█░░░░░░░░░] 11% (1 of 9 phases complete)

## Performance Metrics

**Velocity:**

- Total plans completed: 14 (Phase A shipped outside GSD tracking, commit `8236de4`)
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| A | shipped | — | — |
| 01 | 4 | - | - |
| 02 | 5 | - | - |
| 03 | 5 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: Stable

*Updated after each plan completion*
| Phase 01 P01 | 2 min | 2 tasks | 2 files |
| Phase 01 P02 | 4min | 2 tasks | 2 files |
| Phase 01 P03 | 5 min | 2 tasks | 3 files |
| Phase 01 P04 | 8 min | 2 tasks | 4 files |
| Phase 02 P01 | 3 min | 2 tasks | 4 files |
| Phase 02 P02 | 3min | 2 tasks | 1 files |
| Phase 02 P03 | 2min | 2 tasks | 5 files |
| Phase 02 P04 | 3min | 2 tasks | 3 files |
| Phase 03 P01 | 5 min | 2 tasks | 2 files |
| Phase 03 P02 | 6 min | 2 tasks | 1 files |
| Phase 03 P03 | ~3m | 1 tasks | 5 files |
| Phase 03 P04 | 20m | 3 tasks | 5 files |
| Phase 03 P05 | 9 min | 2 tasks | 1 files |
| Phase 04 P01 | 3 min | 3 tasks | 3 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Naming]: Two-tier `gems` / `transcendShards` economy with a verbatim identifier contract (LOCKED).
- [Phase A]: Wipe (not migrate) accepted for the primogems→gems rename; all later phases are additive schema.
- [Death]: PVE-death shard = ground collectible; PVP-death shard = stolen by killer.
- [Tunables]: `MAX_TRANSCEND_LEVEL=10`, `TRANSCEND_DAMAGE_STEP=0.05`, `RAID_SHARD_PAYOUT=6`, etc. finalized in Phase 0.
- [Phase 01]: resolveDupeGrant extracted as a pure dependency-free helper so the C6-overflow mint semantics are unit-testable via cross-import before any reducer wiring.
- [Phase ?]: transcendShards wired: C6-overflow dupe mints 1 shard via resolveDupeGrant, gems unchanged; DUPLICATE_REFUND removed
- [Phase ?]: [Phase 01]: transcendShards deployed to LOCAL via additive migrate; .default(0) required to backfill existing rows without a wipe; bindings regenerated so player.transcendShards is typed
- [Phase ?]: [Phase 02]: resolveTranscendInstall + transcendDamageMultiplier extracted as pure dependency-free helpers, test-first, before any reducer/game-loop wiring
- [Phase 02]: transcendCharacter reducer is the sole server-side enforcement point for the shard currency (C6/cap/cost/ownership); owned_character.transcendLevel added as additive .default(0) column; healParty scales by healer transcendLevel
- [Phase ?]: [Phase 02]: transcend module published additively to LOCAL (transcend_level column, no wipe; player=1/owned_character=8 intact); bindings regenerated so transcendLevel + transcendCharacter client-typed. maincloud deferred (paused DB, no recovery-wipe).
- [Phase 02]: transcend level scales client damage: createGame consumes pure transcendDamageMultiplier(activeConstellation, activeTranscend) behind setActiveTranscend; App.tsx builds owner-filtered transcendById, feeds the loop, threads transcendById + onTranscend to CharacterScreen (plan 05 UI)
- [Phase 03]: applyDeathShardPenalty extracted as a pure dependency-free helper (branch order = u32 underflow safety; shardsLost 0 on erosion = A1 economy invariant), test-first before any reducer wiring
- [Phase ?]: [Phase 03]: shard-drop economy wired — shard_drop table + spillShards (single count-1 piece) + collectShard (reuses gemIsCollectible grace); applyDeathShardPenalty additively wired into all 3 death paths keeping gem spill; PVP killer credit folded with gem credit (gate stolen>0 || shardsLost>0) so a 0-gem shard carrier still transfers its shard (A1). D3: no un-clamped activatedConstellation consumer, no extra activation write.
- [Phase ?]: 03-03: Published shard_drop additively to local (no --delete-data); migration ADD-only, player data intact.
- [Phase ?]: 03-03: Regenerated bindings expose tables.shardDrop + reducers.collectShard — gates Plan 04 client work.
- [Phase ?]: Shard-movement toast disambiguated client-side with no new broadcast table: DOWN+recent pvpHit = stolen, DOWN otherwise = PVE drop, UP with no recent local collect = kill-steal, plain pickup = pulse only.
- [Phase ?]: Shard counter flash threaded to CharacterScreen + GachaScreen chips via shardFlashClass prop; loss shown by --drain shrink (motion) not --danger (hue).
- [Phase ?]: [Phase 03]: shards-at-risk verified end-to-end via two-client playtest — all 5 scenarios pass (PVP steal +1 exact, PVE purple drop + 1.2s grace + no camp vacuum, erosion order transcend-- then one C-level with C0-C6 floor held, 0-shard PVP kill mints nothing, 0-gem shard carrier still transfers); vitest 339 green + build green. Phase 3 done.
- [Phase ?]: [Phase 03][follow-up]: emergent — shard_drop reuses the gem magnet/collect loop, so drops are re-grabbable and enemies can also pick them up (killing that enemy re-drops the shard). Tester approved; flag for a future phase vs the 'camps must not vacuum a drop' invariant. No fix now.
- [Phase 04]: [Phase 04][04-01]: role added as const design data on CHARACTER_STATS (client characters.ts + server mirror), NOT a table — no migration/column/seed/binding-regen. Required field = compile-time exhaustive seeding. ROLE_META (label/token/aria) single source for Plan 02 UI. serverSync gains valid-role + per-id parity (INV-5). Additive local publish; maincloud deferred to Phase 7.

### Pending Todos

None yet.

### Blockers/Concerns

- [01-04 GATE] Blocking human-verify playtest pending: confirm ◈ chip on all Gacha tabs + Character topbar, and that a C6-dupe mints exactly 1 shard with gems unchanged (see 01-04-SUMMARY.md "Human Verification Pending").
- All work must land on `feat/transcendence` (off `master`, not `main`).
- pnpm only; server module path is `./spacetimedb` (the `spacetime:publish` npm scripts point at the wrong `server` path — ignore them).
- Every data change must keep client/server mirrors in sync (`serverSync.test.ts`) — INV-5.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Feature | Elemental resistance system | Deferred to future milestone | 2026-07-06 |
| Feature | XP/levelling for players + enemies | Deferred to future milestone | 2026-07-06 |
| Feature | Email password reset | Deferred (needs external service) | 2026-07-06 |

## Session Continuity

Last session: 2026-07-07T10:15:25.026Z
Stopped at: Completed 04-01-PLAN.md
Resume file: None
