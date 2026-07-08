---
phase: 00-lock-transcendence-constants
plan: 01
subsystem: transcendence
status: complete
tags: [constants, transcendence, server-sync]
requires: []
provides:
  - MAX_TRANSCEND_LEVEL
  - TRANSCEND_DAMAGE_STEP
  - TRANSCEND_HEAL_STEP
  - SHARD_PER_OVERFLOW_DUPE
  - SHARD_DEATH_LOSS
  - RAID_SHARD_PAYOUT
  - TRANSCEND_SHARD_COST
affects:
  - spacetimedb/src/index.ts
  - src/game/data/constants.ts
tech-stack:
  added: []
  patterns:
    - "server const NAME = value; ↔ client export const NAME = value; // server mirror guarded by serverSync.test.ts"
key-files:
  created:
    - src/game/data/__tests__/transcendence.test.ts
  modified:
    - spacetimedb/src/index.ts
    - src/game/data/constants.ts
    - src/game/data/__tests__/serverSync.test.ts
    - .planning/transcendence/PROGRESS.md
decisions:
  - "Constants live inline in constants.ts (matching SAFE_ZONE_RADIUS mirror pattern), not a separate transcendence.ts — no new import surface for the sync test."
  - "TRANSCEND_SHARD_COST implemented as an arrow fn on both sides so it never matches the numeric extractServerConstant regex."
metrics:
  duration: ~6m
  completed: 2026-07-06
  tasks: 4
  files: 5
---

# Phase 0 Plan 01: Lock transcendence constants Summary

Locked all six transcendence tunables plus the `TRANSCEND_SHARD_COST(n) => n` cost helper as declaration-only constants mirrored identically on server (`spacetimedb/src/index.ts`) and client (`src/game/data/constants.ts`), with `serverSync.test.ts` guarding drift and a new `transcendence.test.ts` asserting ranges and the cost helper — no schema, no reducer references, no publish.

## What was built

- **Server (Task 1):** Added a contiguous, commented block of six plain single-line `const NAME = value;` declarations (`MAX_TRANSCEND_LEVEL=10`, `TRANSCEND_DAMAGE_STEP=0.05`, `TRANSCEND_HEAL_STEP=0.08`, `SHARD_PER_OVERFLOW_DUPE=1`, `SHARD_DEATH_LOSS=1`, `RAID_SHARD_PAYOUT=6`) plus the pure arrow-fn helper `TRANSCEND_SHARD_COST = (n: number): number => n;`, placed after `MAX_KILL_REWARD_TIER` and before the Wish banners block. No reducer/lifecycle/table references them.
- **Client (Task 2):** Mirrored the same six values with the existing `export const NAME = value; // server` pattern, plus the exported `TRANSCEND_SHARD_COST` helper, grouped under a header comment referencing the server file.
- **Tests (Task 3):** Extended `serverSync.test.ts` (import + six new `it.each` rows) so each server literal is asserted equal to its client mirror via `extractServerConstant`. Added `src/game/data/__tests__/transcendence.test.ts` covering (1) all six constants are finite numbers > 0 and (2) `TRANSCEND_SHARD_COST(n) === n` for n ∈ {0,1,2,5,10}.
- **Tracker (Task 4):** Marked Phase 0 `✅ DONE` in the PROGRESS.md status table (commit `10f3fa6`) and ticked `[x] **0**` in the checklist.

## Validation results

- Targeted: `vitest run serverSync.test.ts transcendence.test.ts` → 63 passed.
- Full suite: `pnpm test` → 313 passed (21 files), no regressions.
- Build: `pnpm build` → green (`✓ built in 5.31s`).
- No `spacetime publish`, no schema/reducer diff, no bindings regeneration (per phase scope).

## Deviations from Plan

None — plan executed exactly as written. (The plan's inline `node -e` verify snippets could not run through the Bash heredoc/`-e` path because Git-Bash on Windows collapses the `\\d` regex escapes; verification was performed with equivalent scripts written via the Write tool, which preserve the backslashes. The TypeScript source regex in `serverSync.test.ts` is unaffected and passes.)

## Commits

- `5456ade` feat(00-01): add transcendence constants + cost helper to server module
- `10f3fa6` feat(transcend): lock constants for transcendence system (client mirror + tests)
- `e9c0335` docs(transcend): mark Phase 0 constants done in tracker

## Notes

The working tree retains pre-existing unrelated uncommitted changes (`src/index.css`, `AuthScreen.tsx`, `CharacterScreen.tsx`, `GachaScreen.tsx`, `Hud.tsx`, `CharacterIdentity.tsx`, and `.planning/STATE.md`) — these were left untouched per the plan constraints; only the five plan-owned files were staged/committed.

## Self-Check: PASSED
- FOUND file: spacetimedb/src/index.ts (constants + helper)
- FOUND file: src/game/data/constants.ts (mirror)
- FOUND file: src/game/data/__tests__/serverSync.test.ts (extended)
- FOUND file: src/game/data/__tests__/transcendence.test.ts (created)
- FOUND file: .planning/transcendence/PROGRESS.md (updated)
- FOUND commit: 5456ade
- FOUND commit: 10f3fa6
- FOUND commit: e9c0335
