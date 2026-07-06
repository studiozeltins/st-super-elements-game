---
phase: 02-transcendence-install
plan: 02
subsystem: server-module
tags: [transcendence, reducer, currency, owned-character, heal-scaling, server-authority]

# Dependency graph
requires:
  - phase: 02-transcendence-install
    provides: resolveTranscendInstall pure install-decision helper (plan 01)
  - phase: 01-constellation-shard-currency
    provides: player.transcendShards currency, MAX_TRANSCEND_LEVEL / TRANSCEND_SHARD_COST / TRANSCEND_HEAL_STEP tunables
provides:
  - owned_character.transcendLevel additive column (t.u32().default(0))
  - transcendCharacter reducer (server-authoritative currency spend + power grant)
  - healParty heal scaling by healer.transcendLevel
affects:
  - "02-03 (publish + binding regen exposes transcendLevel + transcendCharacter to clients)"
  - "02-04 (createGame consumes transcendLevel via transcendDamageMultiplier)"
  - "02-05 (CharacterScreen install gate calls transcendCharacter)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reducer as sole currency-enforcement boundary: args are only { characterId }; cost/level/cap/owner all derived server-side, decision delegated to pure resolveTranscendInstall"
    - "Additive live-table column appended AFTER existing columns with .default(0) to backfill without a wipe; insert sites backfill the new field explicitly where the spread cannot"

key-files:
  created: []
  modified:
    - spacetimedb/src/index.ts

key-decisions:
  - "transcendLevel appended after constellation on owned_character with .default(0) — STDB rejects a mid-table or non-defaulted column on a populated live table."
  - "restoreOwnedCharacters backfills transcendLevel:0 inline rather than adding it to RestoreOwnedCharacterRow — keeps the existing backup wire format valid (old backups predate the column; 0 is the correct restore value)."

patterns-established:
  - "New scarce-currency reducers accept only an entity id; every rule (gate, cap, cost, ownership) is enforced server-side via a pure decision helper, rejects mutate nothing, deduct only on ok."

requirements-completed: [REQ-transcend-install]

coverage:
  - id: R1
    description: "transcendCharacter deducts TRANSCEND_SHARD_COST(nextLevel) and increments transcendLevel by 1 on success; rejects below-C6/at-cap/short-shards/non-owned with SenderError mutating nothing"
    requirement: "REQ-transcend-install"
    verification:
      - kind: unit
        ref: "src/game/data/__tests__/transcendInstall.test.ts#resolveTranscendInstall (decision authority, plan 01)"
        status: pass
      - kind: manual
        ref: "reducer wiring verified by tsc; runtime spend exercised after publish (plan 03)"
        status: deferred
    human_judgment: true
  - id: R2
    description: "healParty heal multiplier adds healer.transcendLevel * TRANSCEND_HEAL_STEP"
    requirement: "REQ-transcend-install"
    verification:
      - kind: manual
        ref: "server-only heal math; typechecks, exercised in playtest after publish (plan 03)"
        status: deferred
    human_judgment: true

# Metrics
duration: 3min
completed: 2026-07-06
status: complete
---

# Phase 02 Plan 02: Transcendence install reducer + column Summary

**The server-authoritative core of Transcendence: an additive `owned_character.transcendLevel` column, the `transcendCharacter` reducer that spends `transcendShards` for real power under strict C6/cap/cost/ownership gates, and a healer heal-scaling term — all in `spacetimedb/src/index.ts`, delegating the decision to plan 01's pure `resolveTranscendInstall`.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-07-06T16:48:11Z
- **Completed:** 2026-07-06T16:50:57Z
- **Tasks:** 2
- **Files modified:** 1 (spacetimedb/src/index.ts)

## Accomplishments
- `owned_character.transcendLevel: t.u32().default(0)` appended after `constellation` — additive migrate backfills existing rows to 0, no wipe (INV: protected C0–C6 floor, no progress churn).
- `transcendCharacter({ characterId })` — the sole enforcement point for the scarce currency. Ownership via `requirePlayer(ctx)` + `findOwnedRow` (canonical `ctx.sender`, never a client-supplied identity); the C6 gate, level cap, and shard cost all derive server-side and are decided by the pure `resolveTranscendInstall`. Every reject path throws `SenderError` before any `.update(`; the shard deduct and level raise happen only in the `result.ok` branch (u32-underflow safe — T-02-03).
- `healParty` heal multiplier now includes `healer.transcendLevel * TRANSCEND_HEAL_STEP`, sourced from the already-resolved active healer row — server-computed only, client heal path untouched.
- Server module typechecks clean; `serverSync.test.ts` stays green (57 tests) — constant blocks + CHARACTER_STATS untouched (Pitfall 5).

## Task Commits

1. **Task 1: transcendLevel column + transcendCharacter reducer** — `945a70b` (feat)
2. **Task 2: healParty transcend heal scaling** — `98118a6` (feat)

## Files Created/Modified
- `spacetimedb/src/index.ts` — added `import { resolveTranscendInstall } from './transcendInstall'`; appended `transcendLevel` column to `owned_character`; added the `transcendCharacter` reducer after `setConstellation`; extended the `healParty` `healMultiplier`; backfilled `transcendLevel:0` in the `restoreOwnedCharacters` insert.

## Decisions Made
- `transcendLevel` appended at the end of the `owned_character` column list with `.default(0)` (mid-table / non-defaulted additions are rejected on a populated live table).
- Reducer accepts only `characterId`; cost/next-level/cap/owner are all server-derived — no client-supplied level, cost, delta, or owner is trusted (CLAUDE.md rule 5, threats T-02-01/T-02-02).
- Reject-reason mapping: `below_c6 → 'Requires C6'`, `at_cap → 'At transcend cap'`, `insufficient_shards → 'Not enough shards'`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Backfill transcendLevel in restoreOwnedCharacters insert**
- **Found during:** Task 1 (typecheck)
- **Issue:** Adding the `transcendLevel` column made the spread insert `ctx.db.ownedCharacter.insert({ id: 0n, ...row })` in `restoreOwnedCharacters` fail typecheck — the `RestoreOwnedCharacterRow` wire type lacks the new field, so the spread could not satisfy the insert type (TS2345). (The two explicit-literal inserts — starter grant and `grantCharacter` — were unaffected because `.default(0)` makes the field optional for object literals.)
- **Fix:** Changed the insert to `{ id: 0n, transcendLevel: 0, ...row }`, backfilling to 0. Chosen over adding `transcendLevel` to `RestoreOwnedCharacterRow` so the existing backup/restore JSON wire format stays valid — pre-Phase-02 backups predate the column, and 0 is the correct restore value for them (consistent with the additive-migration philosophy).
- **Files modified:** spacetimedb/src/index.ts
- **Commit:** 945a70b

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None. Publish + binding regeneration are the BLOCKING responsibility of plan 03; this plan edited source only.

## Next Phase Readiness
- Module is publish-ready: `transcendLevel` column, `transcendCharacter` reducer, and heal scaling all exist and typecheck.
- Plan 03 must publish `spacetimedb` (additive migrate, NO `--delete-data`) to local + maincloud and run `npm run spacetime:generate` so `owned_character.transcendLevel` and the `transcendCharacter` reducer become typed on the client.
- Plans 04/05 then consume the newly-exposed column + reducer for combat scaling and the CharacterScreen install gate.

## Self-Check: PASSED
- FOUND: spacetimedb/src/index.ts
- FOUND commits: 945a70b, 98118a6
