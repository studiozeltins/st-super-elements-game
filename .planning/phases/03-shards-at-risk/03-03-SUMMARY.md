---
phase: 03-shards-at-risk
plan: 03
subsystem: transcendence-economy
tags: [deploy, additive-migration, spacetimedb-publish, bindings, shard-drop]
requires:
  - shard_drop
  - collectShard
provides:
  - shard_drop-live-local
  - tables.shardDrop-bindings
  - reducers.collectShard-bindings
affects:
  - src/module_bindings/
tech-stack:
  added: []
  patterns:
    - "Additive migrate-publish (no -c/--delete-data) — new table CREATE only, existing data survives"
    - "Regenerate typed client bindings after every schema change (pnpm run spacetime:generate)"
key-files:
  created:
    - src/module_bindings/shard_drop_table.ts
    - src/module_bindings/collect_shard_reducer.ts
  modified:
    - src/module_bindings/index.ts
    - src/module_bindings/types.ts
    - src/module_bindings/types/reducers.ts
decisions:
  - "Published to --server local only; maincloud is paused (prod push is a separate manual step)."
  - "Migration plan was verified ADD-only (shard_drop CREATE, no drops) before accepting the publish."
  - "Player count spot-checked 2 before and 2 after — additive publish preserved all durable data."
metrics:
  duration: ~3m
  completed: 2026-07-07
  tasks: 1
  files: 5
status: complete
---

# Phase 3 Plan 03: Additive Publish + Bindings Regeneration Summary

Brought the Plan 02 server schema live on the local SpacetimeDB via an ADDITIVE migrate-publish (no `-c`/`--delete-data`) and regenerated the typed client bindings. The migration plan showed only the `shard_drop` table being CREATED — no destructive drops — and the existing player/account data survived (player count 2 before and after). This is the BLOCKING gate for Plan 04: `tables.shardDrop` and `reducers.collectShard` now exist in `src/module_bindings/`.

## What Was Built

- **Additive migration live on local** — `spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb --server local --yes` (no destructive flag). Migration Plan output: `Created user table: shard_drop (public)` with columns `id U64`, `position_x/z F32`, `amount U32`, `dropped_by identity`, `dropped_at_micros U64`, plus the `shard_drop_id` unique/btree/autoInc constraints. No column or table drops.
- **Regenerated bindings** — `pnpm run spacetime:generate` wrote `src/module_bindings/shard_drop_table.ts` and `src/module_bindings/collect_shard_reducer.ts`, and updated `index.ts` (registering the `shardDrop` table + `collect_shard` reducer schema), `types.ts`, and `types/reducers.ts`.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Additive migrate-publish to local + regenerate bindings | 2df1322 | src/module_bindings/ (5 files) |

## Verification

- `spacetime sql ... "SELECT * FROM shard_drop LIMIT 1"` — succeeds (table exists, empty result as expected).
- `spacetime sql ... "SELECT COUNT(*) AS c FROM player"` — returns 2 both before and after the publish (durable data intact).
- Migration Plan output inspected: `shard_drop` CREATE only, zero destructive drops.
- `src/module_bindings/index.ts` — confirmed `shardDrop: __table({ name: 'shard_drop', ... })` and `__reducerSchema("collect_shard", CollectShardReducer)` exports present.

## Deviations from Plan

None — plan executed exactly as written. No `-c`/`--delete-data`, no `spacetime login`, local-only (maincloud not touched). No 403 ownership error encountered.

## Self-Check: PASSED

- FOUND: src/module_bindings/shard_drop_table.ts
- FOUND: src/module_bindings/collect_shard_reducer.ts
- FOUND: commit 2df1322
