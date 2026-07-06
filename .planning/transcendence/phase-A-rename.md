# Phase A — Gem naming unification (rename primogems → gems)

> Part of Transcendence. Contracts + tracker: [PROGRESS.md](./PROGRESS.md) · Full plan:
> [../../docs/TRANSCENDENCE_PLAN.md](../../docs/TRANSCENDENCE_PLAN.md)

**Status:** ✅ DONE (commit `8236de4`, shipped to local + maincloud) · **Depends on:** none

## Goal
Unify the currency noun before any transcendence work. Rename every `primogem` → `gem`.
Pure mechanical refactor, no behavior change.

## What was done
- Server `spacetimedb/src/index.ts`: `player.primogems` → `gems`; `STARTING_PRIMOGEMS`
  → `STARTING_GEMS`; `KILL_REWARD_PRIMOGEMS` → `KILL_REWARD_GEMS`; all reducer bodies +
  comments; `RestorePlayerRow.primogems` → `gems`.
- Scripts: `scripts/snapshot.mjs` key `primogems` → `gems`.
- Client: `App.tsx`, `Hud.tsx`, `GachaScreen.tsx` prop `primogems` → `gems`;
  `gemRewards.ts` constant; `createGame.ts` comment; `serverSync.test.ts`.
- Generated bindings regenerated (`player.gems`).

## Verification (all passed)
- `pnpm test` → 301/301 green (incl. serverSync).
- `pnpm build` → tsc + vite clean.
- Published local + maincloud with full wipe (`-c -y`); `SELECT gems FROM player` confirms
  the column.
- Repo grep for `primogem` (case-insensitive) → only `docs/` mentions remain (they
  describe the rename); zero in code.

## Definition of done
- [x] zero `primogem` in code
- [x] tests + build green
- [x] both envs published + wiped
- [x] committed on `feat/transcendence`
