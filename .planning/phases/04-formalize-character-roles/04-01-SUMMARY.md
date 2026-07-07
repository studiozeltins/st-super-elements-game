---
phase: 04-formalize-character-roles
plan: 01
subsystem: database
tags: [spacetimedb, character-catalog, const-mirror, vitest, roles]

# Dependency graph
requires:
  - phase: 02-transcendence-core
    provides: CHARACTER_STATS const-mirror pattern + serverSync.test.ts INV-5 plumbing
provides:
  - "Role union type ('tank' | 'dps' | 'healer' | 'support') exported from characters.ts"
  - "Required role field on CharacterDefinition + all 17 client roster entries"
  - "ROLE_META map (label/token/aria) exported from characters.ts — single source for Plan 02 UI"
  - "role mirrored on server CharacterStat interface + all 17 CHARACTER_STATS entries + statsFor fallback"
  - "serverSync role parity coverage (valid-role + per-id client<->server equality)"
  - "Running local module carries role for Phase 6 raid enforcement"
affects: [04-02 role badge UI, phase-05 party-roster, phase-06 raid-enforcement, phase-07 deploy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Static-const mirror: per-character intrinsic role lives twice (client characters.ts + server CHARACTER_STATS), kept in lockstep by source-text-reading serverSync test"
    - "Single-line server literals: role appended inline before ...NO_HEAL so the [^}]* regex extractor keeps parsing"
    - "ROLE_META as single source of role display metadata (no per-character hard-coding)"

key-files:
  created: []
  modified:
    - "src/game/data/characters.ts"
    - "spacetimedb/src/index.ts"
    - "src/game/data/__tests__/serverSync.test.ts"

key-decisions:
  - "role is const design data on CHARACTER_STATS, NOT a SpacetimeDB table — no migration, no column, no seed reducer, no binding regen"
  - "role is a required field on CharacterDefinition so a missing role is a compile error (exhaustive seeding enforced)"
  - "ROLE_META carries aria (Title-case) alongside label (uppercase) + token so both Plan 02 UI surfaces import one source"
  - "statsFor fallback carries role: 'dps' so unknown ids still type-check for Phase 6 statsFor(id).role reads"
  - "Additive local publish only; maincloud deferred to Phase 7 per Phase 02 paused-DB precedent"

patterns-established:
  - "Static-const mirror extended to a 4th synced field (role) alongside stars/maxHealth/healthRegen/heal"

requirements-completed: [REQ-combat-roles]

coverage:
  - id: D1
    description: "Every one of the 17 roster characters resolves to exactly one valid role (tank/dps/healer/support), mapping healer x4, tank x4, support x2, dps x7"
    requirement: "REQ-combat-roles"
    verification:
      - kind: unit
        ref: "src/game/data/__tests__/serverSync.test.ts#%s has a valid role"
        status: pass
      - kind: unit
        ref: "pnpm build (tsc — required role field forces every entry to declare one)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Client characters.ts role === server CHARACTER_STATS role for every character id (INV-5 parity)"
    requirement: "REQ-combat-roles"
    verification:
      - kind: unit
        ref: "src/game/data/__tests__/serverSync.test.ts#%s role matches server CHARACTER_STATS"
        status: pass
    human_judgment: false
  - id: D3
    description: "ROLE_META exported from characters.ts as single source of role label/token/aria for Plan 02 UI surfaces"
    requirement: "REQ-combat-roles"
    verification:
      - kind: unit
        ref: "pnpm build (tsc — ROLE_META + Role type-check)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Running local SpacetimeDB module carries role (additive publish, no data wipe) for Phase 6 statsFor(id).role reads"
    requirement: "REQ-combat-roles"
    verification:
      - kind: manual_procedural
        ref: "spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb --server local --yes (empty migration plan; player=2/owned_character=19 rows intact)"
        status: pass
    human_judgment: false

# Metrics
duration: 3min
completed: 2026-07-07
status: complete
---

# Phase 4 Plan 01: Add intrinsic combat role to character catalogs Summary

**Intrinsic `role` (tank/dps/healer/support) added to all 17 characters in both the client catalog and server `CHARACTER_STATS` const mirror, guarded by two new serverSync parity tests (INV-5), with a shared `ROLE_META` map and an additive local module publish.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-07-07T10:10:18Z
- **Completed:** 2026-07-07T10:14:04Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Added `Role` union + required `role` field to `CharacterDefinition` and all 17 client roster entries using the locked mapping (healer×4, tank×4, support×2, dps×7; Silva=dps, self-regen only).
- Mirrored `role` inline (single-line) on the server `CharacterStat` interface + all 17 `CHARACTER_STATS` entries + the `statsFor` fallback — no table, no migration, no binding regen.
- Exported `ROLE_META` (label/token/aria) from `characters.ts` as the single source of role display metadata for Plan 02's badge surfaces.
- Extended `serverSync.test.ts` with `ServerStat.role`, `VALID_ROLES`, and two `it.each` blocks (valid-role + per-id client↔server equality) — 34 new passing assertions.
- Additively republished the local module (empty migration plan, no `--delete-data`); existing player/owned_character rows verified intact.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add role to both catalog mirrors (client + server) with shared ROLE_META** - `7776f78` (feat)
2. **Task 2: Extend serverSync.test.ts with role parity coverage (INV-5)** - `7d8a410` (test)
3. **Task 3: Additive local publish so the running module carries role** - deploy step, no source change beyond Task 1's `spacetimedb/src/index.ts` (published `2d-impact-game-fr9ti` to local)

**Plan metadata:** (docs commit follows this summary)

## Files Created/Modified
- `src/game/data/characters.ts` - `Role` type, `ROLE_META` export, required `role` on interface + 17 entries, sync comment updated
- `spacetimedb/src/index.ts` - `role` on `CharacterStat` interface + 17 `CHARACTER_STATS` entries (single-line) + `statsFor` fallback
- `src/game/data/__tests__/serverSync.test.ts` - `ServerStat.role`, `role` in `extractServerStats`, `VALID_ROLES`, two role `it.each` blocks

## Decisions Made
- Treated role as const design data on `CHARACTER_STATS`, not a DB table — the research explicitly corrected the `additional_context` "additive schema/new column/seed reducer" framing; there is no `character_stats` table.
- Made `role` a required field so exhaustive seeding is a compile-time guarantee.
- `ROLE_META` carries an `aria` (Title-case) field alongside `label` (uppercase) + `token` so Plan 02 needs no runtime string munging.
- Local publish only; maincloud deferred to Phase 7 per the Phase 02 paused-DB precedent.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. (A first `SELECT COUNT(*)` verification query needed a column alias — `COUNT(*) AS n` — a SpacetimeDB SQL requirement, not a code issue; rows confirmed intact.)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `role` + `ROLE_META` are live and type-checked, ready for Plan 04-02 (role badge UI on CharacterScreen/CharacterSheet).
- Server module carries `role` for Phase 6 raid enforcement via `statsFor(id).role`.
- maincloud publish deferred to Phase 7 deploy pass.

## Self-Check: PASSED

- All 3 modified files present on disk.
- Task commits `7776f78` (feat) and `7d8a410` (test) present in git history.
- `pnpm test` green (373 tests, serverSync 91 incl. 34 new role assertions); `pnpm build` green.
- Additive local publish succeeded (empty migration plan; player=2/owned_character=19 rows intact).

---
*Phase: 04-formalize-character-roles*
*Completed: 2026-07-07*
