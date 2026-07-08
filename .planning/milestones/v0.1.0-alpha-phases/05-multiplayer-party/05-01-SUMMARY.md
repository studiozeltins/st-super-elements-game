---
phase: 05-multiplayer-party
plan: 01
subsystem: multiplayer-party
tags: [spacetimedb, party, pure-helpers, tdd, constants]
requires:
  - deathPenalty.ts precedent (Phase 3 pure-helper pattern)
  - serverSync.test.ts parity harness (INV-5)
provides:
  - RAID_PARTY_SIZE constant (server + client mirror, parity-asserted)
  - partyRules.nextLeader (oldest-joined promotion, D-05)
  - partyRules.canAccept (one-party-per-player + cap, D-06)
affects:
  - Plan 02 party reducer (will consume nextLeader + canAccept + RAID_PARTY_SIZE)
tech-stack:
  added: []
  patterns:
    - Pure dependency-free decision helper unit-tested cross-package under vitest
    - Client/server constant mirror with regex parity assertion (INV-5)
key-files:
  created:
    - spacetimedb/src/partyRules.ts
    - src/game/data/__tests__/partyRules.test.ts
  modified:
    - spacetimedb/src/index.ts
    - src/game/data/constants.ts
    - src/game/data/__tests__/serverSync.test.ts
decisions:
  - "RAID_PARTY_SIZE declared as a distinct one-line const (not reusing PARTY_SIZE=4) to avoid silently coupling the raid-squad cap to the personal character-team cap."
  - "party members modelled as primitives (identityHex: string, joinedAtMicros: bigint) so partyRules stays pure; Plan 02's reducer maps STDB Identity/Timestamp rows into these before calling."
  - "nextLeader tie-break is lexicographic identityHex so promotion is reproducible under identical ctx.timestamp values."
  - "canAccept checks already_partied BEFORE cap (T-05-04 mitigation) — stable reason regardless of roster fullness."
metrics:
  duration: 3 min
  completed: 2026-07-07
status: complete
---

# Phase 05 Plan 01: Party Rules Foundation Summary

Nyquist Wave-0 foundation for the multiplayer party: a distinct `RAID_PARTY_SIZE = 4` constant (client/server mirror with a parity guard) plus the pure, dependency-free `partyRules.ts` helpers (`nextLeader`, `canAccept`) holding the security-critical promotion (D-05) and accept-eligibility (D-06) logic, unit-tested under vitest before any reducer wiring exists — mirroring the Phase 3 `deathPenalty.ts` precedent.

## What Was Built

### Task 1 — RAID_PARTY_SIZE constant (parity-asserted)
- Added `const RAID_PARTY_SIZE = 4;` to the server tunables block in `spacetimedb/src/index.ts` (one-line form so `extractServerConstant` regex reads it), immediately after `RAID_SHARD_PAYOUT`. `PARTY_SIZE` left untouched.
- Mirrored `export const RAID_PARTY_SIZE = 4; // server …` in `src/game/data/constants.ts`.
- Appended `['RAID_PARTY_SIZE', RAID_PARTY_SIZE]` to the `serverSync.test.ts` parity `it.each` list and imported the symbol (INV-5).
- Commit: `3eed716`

### Task 2 — partyRules.ts helpers (TDD)
- RED: wrote `src/game/data/__tests__/partyRules.test.ts` (10 tests) covering every `<behavior>` branch; confirmed failure (module missing). Commit `3784e03`.
- GREEN: implemented `spacetimedb/src/partyRules.ts` — pure, zero imports. `nextLeader(members)` via a single reduce keeping the smaller `(joinedAtMicros, then identityHex)` pair, `null` on empty. `canAccept(rosterSize, joinerAlreadyPartied, cap)` with already-partied checked before cap, returning stable reason strings. Commit `a984346`.

## Verification

- `pnpm vitest run partyRules serverSync` → 2 files, 102 tests passed.
- `grep -c import spacetimedb/src/partyRules.ts` → 0 (dependency-free module).
- `grep -c "PARTY_SIZE = 4" spacetimedb/src/index.ts` → 2 (PARTY_SIZE and RAID_PARTY_SIZE both distinct one-line consts).
- `nextLeader` tie-break determinism covered by a dedicated test; `canAccept` already-partied-before-cap covered by tests for both reasons.

## TDD Gate Compliance

- RED gate: `test(05-01): add failing tests …` — commit `3784e03` (verified failing before implementation).
- GREEN gate: `feat(05-01): implement pure partyRules …` — commit `a984346`.

## Deviations from Plan

None - plan executed exactly as written. (A pre-commit formatter reflowed unrelated multi-line literals in `spacetimedb/src/index.ts` during the Task 1 commit; the `RAID_PARTY_SIZE` line remains in the required one-line form and `PARTY_SIZE` is unchanged.)

## Self-Check: PASSED
- FOUND: spacetimedb/src/partyRules.ts
- FOUND: src/game/data/__tests__/partyRules.test.ts
- FOUND commit 3eed716, 3784e03, a984346
