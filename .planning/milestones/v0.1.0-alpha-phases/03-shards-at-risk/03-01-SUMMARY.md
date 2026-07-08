---
phase: 03-shards-at-risk
plan: 01
subsystem: transcendence-economy
tags: [death-penalty, pure-helper, tdd, economy-safety]
requires: []
provides:
  - applyDeathShardPenalty
  - DeathShardPenalty
affects:
  - spacetimedb/src/deathPenalty.ts
tech-stack:
  added: []
  patterns:
    - "Pure dependency-free helper cross-tested under client vitest (transcendInstall.ts idiom)"
key-files:
  created:
    - spacetimedb/src/deathPenalty.ts
    - src/game/data/__tests__/deathPenalty.test.ts
  modified: []
decisions:
  - "Flat result object (not a discriminated union) — every branch yields next* values the reducer applies."
  - "Decrement only inside the branch that proved the value > 0; Math.max(0, …) on the shards branch = u32 underflow safety."
  - "shardsLost is 0 on every erosion branch, so an empty victim credits a PVP killer nothing (A1 invariant)."
metrics:
  duration: ~5m
  completed: 2026-07-07
  tasks: 2
  files: 2
status: complete
---

# Phase 3 Plan 01: Death Penalty Pure Helper Summary

Extracted the death-penalty decision as a pure, dependency-free `applyDeathShardPenalty` helper in `spacetimedb/src/deathPenalty.ts` and locked its four-branch behavior (has-shards / only-transcend / only-constellation / nothing) plus branch-order and empty-victim-credit invariants with a cross-import vitest spec. This is Nyquist Wave 0: the test scaffold and the guarded helper exist before any reducer wiring (Plan 02).

## What Was Built

- **`spacetimedb/src/deathPenalty.ts`** — `applyDeathShardPenalty(transcendShards, transcendLevel, constellation, loss)` returning a flat `DeathShardPenalty` object. Zero import statements. Three priority gates (shards → transcend → constellation) then an all-zero no-op fallthrough. A value is only ever decremented inside the branch that proved it `> 0`; the shards branch uses `Math.max(0, …)`.
- **`src/game/data/__tests__/deathPenalty.test.ts`** — 6 tests importing the real helper across the package boundary (`../../../../spacetimedb/src/deathPenalty`) and the `SHARD_DEATH_LOSS` mirror from `../constants`. Covers all four branches (full-object `.toEqual`), the order guarantee (shards present → no erosion), and the empty-victim PVP-credit invariant (`shardsLost === 0`).

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Create pure applyDeathShardPenalty helper | c2fd634 | spacetimedb/src/deathPenalty.ts |
| 2 | Cross-import unit test for all penalty branches | df12d6b | src/game/data/__tests__/deathPenalty.test.ts |

## Verification

- `npx tsc --noEmit -p spacetimedb/tsconfig.json` — green (helper compiles with zero imports).
- `npx vitest run src/game/data/__tests__/deathPenalty.test.ts` — 6/6 passed.

## Deviations from Plan

None — plan executed exactly as written. (Used `npx tsc` / `npx vitest` directly; the `pnpm exec` form emitted install noise that obscured the real exit status, so the direct binaries were used to confirm green results.)

## TDD Gate Compliance

Plan `type: tdd`. The plan orders the helper (Task 1, `feat`) before its spec (Task 2, `test`), so the git sequence is `feat(03-01)` → `test(03-01)` rather than the canonical RED→GREEN ordering. Both gate commits are present and the spec is green against the committed helper; no functionality is unguarded.

## Self-Check: PASSED

- FOUND: spacetimedb/src/deathPenalty.ts
- FOUND: src/game/data/__tests__/deathPenalty.test.ts
- FOUND: commit c2fd634
- FOUND: commit df12d6b
