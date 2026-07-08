---
phase: 01-constellation-shard-currency
plan: 03
subsystem: gacha / transcendence economy (deploy + bindings)
tags: [spacetimedb, deploy, additive-migrate, client-bindings, local]
requires: [REQ-shard-currency-mint]
provides:
  - local-schema.transcend_shards
  - module_bindings.player.transcendShards
affects:
  - spacetimedb/src/index.ts
  - src/module_bindings/player_table.ts
  - src/module_bindings/types.ts
tech-stack:
  added: []
  patterns:
    - "Additive column migrate on a populated table requires .default(0) so SpacetimeDB can backfill existing rows without a wipe"
key-files:
  created: []
  modified:
    - spacetimedb/src/index.ts
    - src/module_bindings/player_table.ts
    - src/module_bindings/types.ts
decisions:
  - "Added .default(0) to the transcendShards table column so the additive migrate could backfill existing player rows (SpacetimeDB refuses a non-defaulted column on a populated table). This is a Rule 3 blocking-issue fix, not an architectural change."
  - "Published to LOCAL only (per REQUIREMENTS + planner note); maincloud deliberately untouched this phase."
metrics:
  duration: ~5 min
  completed: 2026-07-06
  tasks: 2
  files: 3
status: complete
---

# Phase 01 Plan 03: Deploy transcendShards to local + regenerate bindings Summary

Deployed the wave-2 `transcendShards` column to the LOCAL SpacetimeDB via an additive migrate (no data wipe) and regenerated the client bindings, so `player.transcendShards` is now real on the server and typed on the client. This gates the wave-4 client render (01-04): the regenerated `player_table.ts` is what lets client code compile against `player.transcendShards`. Existing local player rows survived the migrate and backfilled to `0` (assumption A1 confirmed).

## What Was Built

- Additive migrate of the `player` table on local: `spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb --server local --yes` printed a Migration Plan `Created column transcend_shards: U32 (default 0)` and finished with `Database updated` — no `--delete-data`, accounts/players preserved.
- Regenerated `src/module_bindings/*` against the live local schema via `pnpm run spacetime:generate`; `player_table.ts` gained `transcendShards: __t.u32().name("transcend_shards")` and `types.ts` picked up the corresponding field.
- A one-line deviation fix on the server table definition (`.default(0)`) that made the additive migrate possible without a wipe.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Additive-migrate publish to local (+ .default(0) fix) | 9c8c363 | spacetimedb/src/index.ts |
| 2 | Regenerate client bindings | 82a467e | src/module_bindings/player_table.ts, src/module_bindings/types.ts |

## Verification

- `spacetime sql 2d-impact-game-fr9ti --server local "SELECT identity, transcend_shards FROM player LIMIT 5"` → existing row reads `transcend_shards = 0` (A1 confirmed).
- `spacetime logs` after publish → `Database updated`, no migrate/validation error (the only ERROR lines are pre-existing 11:47 login attempts, unrelated to this deploy).
- `grep -c "transcend_shards" src/module_bindings/player_table.ts` → 1 (`transcendShards: __t.u32().name("transcend_shards")`).
- `pnpm build` → green (only the pre-existing >500 kB chunk-size advisory, out of scope).

## Threat Mitigations Applied

- T-1-04 (DoS / data loss): publish was an additive migrate with NO `--delete-data`; the explicit command targeted `./spacetimedb` (not the broken `server` path); the A1 check confirmed existing rows survived with `transcend_shards = 0`. Maincloud untouched.
- T-1-05 (ownership): publish used the current CLI identity and succeeded (no 403); no `server clear` was invoked.
- T-1-SC (package installs): zero external packages installed this phase.

## Deviations from Plan

**1. [Rule 3 - Blocking issue] Added `.default(0)` to the `transcendShards` table column**
- **Found during:** Task 1 — the first `spacetime publish` aborted with `Adding a column transcend_shards to table player requires a default value annotation ... Aborting because publishing would require manual migration or deletion of data`.
- **Issue:** The wave-2 column was defined as `t.u32()` with no default. SpacetimeDB refuses to add a non-defaulted column to an already-populated table, which blocked the additive (no-wipe) migrate the plan mandates.
- **Fix:** Changed the table column from `transcendShards: t.u32()` to `transcendShards: t.u32().default(0)` (SDK `Defaultable.default()` API, `spacetimedb@2.6.1`). This lets the migrate backfill existing rows to 0 — exactly assumption A1 — with no data loss. Only the table column was touched; the `RestorePlayerRow` reducer-arg type (a `t.object` field, not a table column) was left unchanged.
- **Files modified:** spacetimedb/src/index.ts
- **Commit:** 9c8c363

This was a required-for-correctness fix (the plan cannot be completed without it) and stays within Task 1's declared file scope; no `--delete-data` was ever used, so the no-wipe invariant held.

## Known Stubs

None. The React shard prop and the shard UI chip belong to plan 01-04 per this plan's success criteria — deliberately out of scope, not stubs.

## Self-Check: PASSED

- FOUND: spacetimedb/src/index.ts (transcendShards column now carries .default(0))
- FOUND: src/module_bindings/player_table.ts (transcend_shards present)
- FOUND commit: 9c8c363
- FOUND commit: 82a467e
