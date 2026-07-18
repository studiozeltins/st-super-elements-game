# Phase 10 — Deferred / Out-of-Scope Items

Discovered during execution; NOT fixed here (scope boundary — unrelated to this phase's changes).

## Pre-existing test failure: grassPlacement.test.ts

- **Discovered during:** 10-01 execution (full-suite regression check after Task 2).
- **File:** `src/game/world/__tests__/grassPlacement.test.ts`
- **Failing case:** `generateGrassBlades > clusters blades into lush meadow patches only` (line ~35).
- **Status:** Fails consistently in isolation AND on the full suite, independent of the
  10-01 audio work. The 10-01 modules (`combatState.ts`, `ambienceMath.ts`) are zero-import
  pure helpers that nothing imports yet, so they cannot affect grass placement. This is a
  pre-existing failure (a `Math.random`-seeded grass-geometry assertion, likely surfaced by
  the recent grass/windmill world commits — see `42c178b feat(world): pixel-art grass texture`).
- **Action required:** Investigate separately (world/grass subsystem owner), outside Phase 10.
  Do NOT block ambient-audio work on it.
- **Re-confirmed in 10-02:** still failing, and confirmed pre-existing by re-running the test at
  commit `1bad15d` (the tip before this plan) where it also fails. The 10-02 bus refactor touches
  only `src/game/audio/**` + the audio wiring in `createGame.ts`; grassPlacement is not in the diff.
- **Re-confirmed in 10-04:** still failing; re-verified pre-existing by `git stash`-ing the 10-04
  rustle change and re-running the test on the clean tree (still red). 10-04 touches only
  `createMovementAudio.ts` + the footstep call in `createGame.ts`; grassPlacement is not in the diff.
