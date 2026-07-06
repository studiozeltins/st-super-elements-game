# Phase 0 — Design lock + constants (no behavior change)

> Part of Transcendence. Contracts + tracker: [PROGRESS.md](./PROGRESS.md) · Full plan:
> [../../docs/TRANSCENDENCE_PLAN.md](../../docs/TRANSCENDENCE_PLAN.md)

**Status:** ⬜ TODO · **Depends on:** Phase A

Read the **Shared contracts** in PROGRESS.md before starting.

## Goal
Write the transcendence tunables into both server and client as constants ONLY. No logic
wires them yet. This locks the numbers so every later phase references one source.

## Constants to add (from the locked tunables table)
`MAX_TRANSCEND_LEVEL = 10`, `TRANSCEND_DAMAGE_STEP = 0.05`, `TRANSCEND_HEAL_STEP = 0.08`,
`SHARD_PER_OVERFLOW_DUPE = 1`, `SHARD_DEATH_LOSS = 1`, `RAID_SHARD_PAYOUT = 6`.
`TRANSCEND_SHARD_COST(n)` = `n` — implement as a small pure helper, not a constant.

## Server
- Add the constants to `spacetimedb/src/index.ts` near the existing constellation
  constants (~line 61-73). Do NOT reference them in any reducer yet.
- If the sync test reads server constants by name (it greps the source), expose them as
  plain `const NAME = value` so the test can extract them.

## Client
- Mirror the same constants in `src/game/data/constants.ts` (or a new
  `src/game/data/transcendence.ts` if cleaner) and re-export where the sync test imports.

## Tests
- Extend `src/game/data/__tests__/serverSync.test.ts`: assert each new constant matches
  the server value (same extract-from-source pattern already used for `KILL_REWARD_GEMS`).
- Trivial unit: constants present, in valid ranges (`MAX_TRANSCEND_LEVEL > 0`, steps > 0).

## Validation
- `pnpm test` green; `pnpm build` green. No publish (no schema/logic change).

## Commit
`feat(transcend): lock constants for transcendence system`

## Definition of done
- [ ] all tunables present server + client, in sync
- [ ] serverSync test extended + green
- [ ] build green
- [ ] committed; PROGRESS.md updated
