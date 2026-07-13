---
phase: 01-crit-foundation
plan: 02
subsystem: character-data
tags: [crit, character-stats, server-parity]
requires: []
provides: [critRate, critDmg, CHARACTER_STATS-crit, characters-crit-tests]
affects: [src/game/data/characters.ts, spacetimedb/src/index.ts]
tech-stack:
  added: []
  patterns: [role-seeded-stat-bands, single-line-flat-CHARACTER_STATS-literal, client-server-stat-mirror]
key-files:
  created: []
  modified:
    - src/game/data/characters.ts
    - spacetimedb/src/index.ts
    - src/game/data/__tests__/characters.test.ts
decisions:
  - "critDmg stored as a full multiplier (e.g. 1.9), matching the value it will replace in Phase 2"
  - "17 distinct critRate values, role-seeded first pass (D-01/D-02); user tunes in playtest"
  - "server CHARACTER_STATS entries kept single-line flat so the serverSync regex extractor keeps parsing"
metrics:
  duration_min: 3
  completed: 2026-07-08
  tasks: 3
  files: 3
  tests_added: 18
  tests_total: 421
status: complete
---

# Phase 1 Plan 2: Crit Stats on All Characters Summary

Added distinct, role-coherent `critRate`/`critDmg` to every one of the 17 characters on the client
`CharacterDefinition` (authoring source of truth) and mirrored the exact same values into the server
`CHARACTER_STATS` registry (INV-5), then locked distinctness + role-band coverage with 18 new tests.
No runtime behavior changed — the client crit roll is untouched (its removal is Phase 2).

## What Shipped

- **CRIT-01 (client):** `critRate: number` + `critDmg: number` on `CharacterDefinition` interface,
  populated on all 17 entries with the exact plan Crit Value Table numbers. All 17 `critRate` values
  are distinct; ranges are role-coherent (dps high, tank low, healer/support mid).
- **CRIT-03 (data half):** `critRate`/`critDmg` added to the server `CharacterStat` interface and
  mirrored into all 17 `CHARACTER_STATS` entries as single-line flat literals (no nested braces), so
  the serverSync extractor (`(\w+):\s*\{([^}]*)\}`) keeps parsing every entry. The 92 existing
  serverSync parity tests remain green.
- **Test lock:** new `describe('per-character crit stats')` block — asserts each `critRate` in (0,1),
  `critDmg >= 1`, all 17 `critRate` distinct, and per-role crit bands.

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add critRate/critDmg to CharacterDefinition + 17 client entries | fc4d532 | src/game/data/characters.ts |
| 2 | Mirror crit into server CHARACTER_STATS (17, single-line flat) | f7f6985 | spacetimedb/src/index.ts |
| 3 | Extend characters.test.ts with distinctness + role ranges | 4f23afd | src/game/data/__tests__/characters.test.ts |

## Verification

- `pnpm test` full suite: **421 passed** (was 403 — +18 new crit assertions).
- serverSync parity tests (stars/maxHealth/role/heal): still green — single-line extractor unaffected.
- Server crit values equal client values for all 17 ids (same canonical table used in both files).
- No nested braces introduced in any CHARACTER_STATS entry.
- createGame.ts / reducers / weapons.ts unchanged — no runtime behavior change (ROADMAP SC4).

## Deviations from Plan

None - plan executed exactly as written. The three per-task `pnpm test -- <filter>` verify commands run
the full suite (vitest ignores the positional filter here), which is a superset of the intended check —
all targeted specs (characters, serverSync) passed within it.

## Self-Check: PASSED

- src/game/data/characters.ts — FOUND (crit fields on interface + 17 entries)
- spacetimedb/src/index.ts — FOUND (crit on CharacterStat + 17 entries)
- src/game/data/__tests__/characters.test.ts — FOUND (new crit describe block)
- Commit fc4d532 — FOUND
- Commit f7f6985 — FOUND
- Commit 4f23afd — FOUND
