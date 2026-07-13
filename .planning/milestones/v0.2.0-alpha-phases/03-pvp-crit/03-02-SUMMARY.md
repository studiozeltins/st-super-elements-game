---
phase: 03-pvp-crit
plan: 02
subsystem: infra
tags: [spacetimedb, deploy, migrate, event-table, pvp, crit, playtest]

# Dependency graph
requires:
  - phase: 03-pvp-crit (plan 01)
    provides: intent-shaped attackPlayer + extended pvp_hit event table + 3-way client rendering (code-complete CRIT-07 slice)
provides:
  - Deployed local module `2d-impact-game-fr9ti` with 4-column pvp_hit (target, amount, attacker, isCrit) and 3-param attack_player (targetIdentity, isSkill, comboCount)
  - "D3-01 open question ANSWERED: additive .default() columns on an event: true table pass SpacetimeDB automatic migration on a populated DB — no fallback ladder step needed"
  - Human-approved two-client migrated-DB playtest (SC2 + SC3 verified live — checks 1–7)
affects: [07-crit-poise-interrupt, maincloud prod deploy (deferred)]

# Tech tracking
tech-stack:
  added: []
  patterns: ["event-table additive migrate: appended .default() columns are accepted as automatic migration ('Changed schema of event table pvp_hit') with an all-clients-disconnect warning"]

key-files:
  created: []
  modified: []

key-decisions:
  - "D3-01 migrate-acceptance: additive publish of extended pvp_hit accepted as UPDATE of the existing local DB — no wipe, no fallback (neither .default() stripping nor drop/re-add needed)"
  - "Maincloud untouched per STATE ops invariant — prod deploy deferred to a user-facing prod point (same additive publish when it happens, never a wipe)"

patterns-established:
  - "Event-table schema evolution: append columns at END with .default() and STDB auto-migrates; expect the 'Changed schema of event table' all-clients-disconnect warning"

requirements-completed: [CRIT-07]

coverage:
  - id: D1
    description: "Additive local publish accepted as UPDATE of the migrated DB (no wipe); pvp_hit = 4 columns, attack_player = 3 intent params (no damage); durable data survived (11 players); bindings regenerated + fresh dist/ built"
    requirement: CRIT-07
    verification:
      - kind: other
        ref: "spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb --server local --yes (exit 0, UPDATE)"
        status: pass
      - kind: other
        ref: "spacetime describe: pvp_hit {target, amount, attacker, is_crit}; attack_player {targetIdentity, isSkill, comboCount}"
        status: pass
      - kind: other
        ref: "spacetime sql 'SELECT COUNT(*) FROM player' = 11; pnpm run spacetime:generate + pnpm build (4.63s) green"
        status: pass
    human_judgment: false
  - id: D2
    description: "Two-client migrated-DB PVP playtest (SC2 + SC3): truthful victim crit number on every client, attacker suppression + crit upgrade, distinct per-character crit (vesper vs glacia), no phantom taken number, killing blow full amount + shard theft + respawn intact"
    requirement: CRIT-07
    verification: []
    human_judgment: true
    rationale: "Phase UAT — visual/feel correctness on real infrastructure cannot be asserted by automation; verified by human 2026-07-09, resume-signal 'approved' (checks 1–7 held)"

# Metrics
duration: ~9min (incl. human playtest)
completed: 2026-07-09
status: complete
---

# Phase 3 Plan 02: Deploy + Two-Client Playtest Summary

**Additive pvp_hit migrate accepted on the live local DB (D3-01 answered: event-table .default() columns auto-migrate) and the human two-client playtest approved SC2 + SC3 — CRIT-07 verified live**

## Performance

- **Duration:** ~9 min wall clock (incl. human two-client playtest)
- **Started:** 2026-07-09T06:41:09Z (Task 1 deploy commit)
- **Completed:** 2026-07-09T06:49:53Z
- **Tasks:** 2 (1 auto deploy + 1 human-verify checkpoint)
- **Files modified:** 0 source files (deploy/derived artifacts only)

## Accomplishments

- **D3-01 open question ANSWERED by the publish itself:** `spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb --server local --yes` was accepted as an UPDATE of the existing populated local DB with no wipe. Additive `.default()` columns on an `event: true` table pass SpacetimeDB automatic migration ("Changed schema of event table pvp_hit", with the expected all-clients-disconnect warning). NO fallback ladder step was needed (neither stripping `.default()` nor the drop/re-add escape hatch).
- **Structural verify passed:** `spacetime describe` shows `pvp_hit` = exactly 4 columns (target, amount, attacker, is_crit) and `attack_player` = exactly 3 intent params (targetIdentity, isSkill, comboCount — no damage param).
- **Migrated data survived:** `SELECT COUNT(*) FROM player` = 11 — the DB is the migrated playtest fixture, not a fresh one; accounts/progress intact (T-03-07 mitigated).
- **Deploy chain green:** `pnpm run spacetime:generate` (no binding churn vs 03-01) → `pnpm build` (4.63s) → laragon serves the fresh dist/ (T-03-08 mitigated: clients and module on the same contract).
- **Human playtest APPROVED (2026-07-09, checks 1–7):** truthful victim number per hit with exactly one number per event (SC2); attacker suppression + crit upgrade at the victim's live position; distinct per-character crit visibly different between vesper (0.36) and glacia (0.10) (SC3); no phantom taken number; killing blow floats the FULL amount, shard theft resolved correctly, and the victim respawned with account intact (SC3, D3-02).
- **Maincloud untouched** per STATE ops invariant — prod deploy deferred to a user-facing prod point.

## Task Commits

1. **Task 1: Deploy — additive local publish, structural verify, generate, build** - `b7b8dad` (chore; empty deploy-record commit — no binding churn, no source changes)
2. **Task 2: Two-client migrated-DB playtest (checkpoint:human-verify)** - no commit (verification only; user typed "approved")

## Files Created/Modified

None — this plan produced deployed/derived artifacts only (published local module, regenerated-but-unchanged bindings, fresh `dist/`). `dist/` is a build output, not committed.

## Decisions Made

- **D3-01 resolved empirically:** additive event-table columns with `.default()` are accepted by SpacetimeDB automatic migration on a populated DB. Future event-table migrations can append `.default()` columns directly — no fallback needed.

## Deviations from Plan

None - plan executed exactly as written. The publish-rejection fallback ladder (Task 1 step 3) was never entered.

## Issues Encountered

None.

## Known Pre-existing Noise (flagged todos, NOT Phase-3 regressions)

Per plan prohibition, observed but deliberately NOT fixed in this slice:

- **Doubled remote skill/projectile VFX** — `skillCast` / `rangedAttack` / `healEvent` are still double-subscribed (manual subscribe list + useTable); also recorded in 03-01-SUMMARY. Candidate for a cleanup slice.
- **Occasional attacker-only local number on server-rejected edge hits** — the attacker's instant local display number (D3-05) can appear with no HP change when the server rejects a hit at the range/safe-zone edge (RESEARCH Pitfall 7 race). Cosmetic; candidate for the same cleanup slice.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **CRIT-07 verified live** — Phase 3 (PVP crit) is complete: server-computed, un-spoofable PVP damage + crit with truthful numbers on every subscribed client; ready for `/gsd-verify-work`.
- The server crit path (Phases 1–3) is now the proven foundation for Phase 7's crit poise interrupt.
- Maincloud deploy remains deferred; when it happens: same additive publish (never a wipe), then regenerate + build.

## Self-Check: PASSED

- Task 1 commit `b7b8dad` exists in git log.
- No created files claimed (deploy-only plan) — nothing to verify on disk beyond `dist/` (present, gitignored build output).
- Structural acceptance criteria re-verified during Task 1 (describe output logged); human approval recorded for Task 2.

---
*Phase: 03-pvp-crit*
*Completed: 2026-07-09*
