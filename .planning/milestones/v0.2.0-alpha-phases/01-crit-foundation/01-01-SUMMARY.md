---
phase: 01-crit-foundation
plan: 01
subsystem: testing
tags: [spacetimedb, vitest, determinism, crit, damage, pure-helper, tdd]

# Dependency graph
requires: []
provides:
  - "spacetimedb/src/crit.ts — rollCrit(critRate, critDmg, rng) zero-import crit-roll primitive (injected rng seam)"
  - "spacetimedb/src/damage.ts — WEAPONS mirror + regular/skill/transcend multipliers + computeBaseDamage (server base-damage math)"
  - "Cross-boundary vitest coverage pinning both helpers under src/game/data/__tests__/"
affects: [crit-foundation-02, crit-foundation-03, phase-2-reducer-wiring, attackEnemies, attackRay]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Zero-import server sibling: pure logic dependency-free so client vitest can import it across the package boundary and reducers stay deterministic (D-08)"
    - "Injected-rng seam: randomness passed as a () => number thunk (ctx.random slots in during Phase 2), never a global random source"
    - "Verbatim client mirror pinned by test (parity locked again by plan 03)"

key-files:
  created:
    - spacetimedb/src/crit.ts
    - spacetimedb/src/damage.ts
    - src/game/data/__tests__/crit.test.ts
    - src/game/data/__tests__/damage.test.ts
  modified: []

key-decisions:
  - "critDmg is the FULL multiplier convention (rollCrit returns critDmg verbatim, not 1 + critDmg), matching the client x1.9 value it will replace"
  - "Crit decision is strict rng() < critRate (boundary rng() === critRate does NOT crit)"
  - "CONSTELLATION_DAMAGE_STEP (0.08) and TRANSCEND_DAMAGE_STEP (0.05) inlined as local consts in damage.ts to hold the zero-import rule; comment tags each mirror source for plan 03 parity"

patterns-established:
  - "TDD RED→GREEN per task: failing cross-boundary test committed first (test), then the zero-import helper (feat)"
  - "Header comments state WHY dependency-free without using the literal forbidden tokens so the zero-import grep gate stays clean"

requirements-completed: [CRIT-01, CRIT-03]

coverage:
  - id: D1
    description: "rollCrit returns { isCrit, multiplier } with strict rng() < critRate and critDmg echoed as the full multiplier"
    requirement: "CRIT-01"
    verification:
      - kind: unit
        ref: "src/game/data/__tests__/crit.test.ts#rollCrit"
        status: pass
    human_judgment: false
  - id: D2
    description: "damage.ts mirrors client WEAPONS + regular/skill/transcend multipliers verbatim and computeBaseDamage reproduces base * ramp * power-track math"
    requirement: "CRIT-03"
    verification:
      - kind: unit
        ref: "src/game/data/__tests__/damage.test.ts#computeBaseDamage"
        status: pass
      - kind: unit
        ref: "src/game/data/__tests__/damage.test.ts#WEAPONS mirror"
        status: pass
    human_judgment: false
  - id: D3
    description: "crit.ts and damage.ts contain zero import lines, no ctx, no Math.random, no Date.now (determinism D-08)"
    requirement: "CRIT-03"
    verification:
      - kind: other
        ref: "grep -nE \"import |Math\\.random|Date\\.now|ctx\" spacetimedb/src/crit.ts spacetimedb/src/damage.ts (no matches)"
        status: pass
    human_judgment: false

# Metrics
duration: 4min
completed: 2026-07-08
status: complete
---

# Phase 1 Plan 01: Crit/Damage Pure Helpers Summary

**Zero-import, vitest-pinned server primitives: `rollCrit` (injected-rng crit roll) and `computeBaseDamage` (verbatim client WEAPONS + combo/transcend multiplier mirror) — the untethered foundation Phase 2 wires into `attackEnemies`/`attackRay`.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-07-08T15:08:21Z
- **Completed:** 2026-07-08T15:12:24Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 4 created

## Accomplishments
- `spacetimedb/src/crit.ts` — `rollCrit(critRate, critDmg, rng)` returns `{ isCrit, multiplier }`; `isCrit = rng() < critRate` (strict), `multiplier = critDmg` on crit else 1. Randomness is injected (D-08), so the calling reducer stays deterministic.
- `spacetimedb/src/damage.ts` — verbatim mirror of the client `WEAPONS` record (sword 60 … book 65), `WeaponId`/`WeaponDefinition`, `regularAttackMultiplier` (cap 1.75), `skillAttackMultiplier` (uncapped), `transcendDamageMultiplier` with inlined 0.08/0.05 steps, and `computeBaseDamage = base * ramp * transcendMult`.
- Cross-boundary vitest files import the real server helpers AND the client originals, pinning parity (WEAPONS deep-equal, server-fn === client-fn across sampled combos).
- Full suite green: 403 tests / 28 files (up from 386), zero regressions. index.ts untouched (no-monolith held); no `*.test.ts` added under `spacetimedb/`.

## Task Commits

Each task was committed atomically (TDD test → feat):

1. **Task 1: crit.ts + crit.test.ts** — `78e970e` (test), `b73d57a` (feat)
2. **Task 2: damage.ts + damage.test.ts** — `3ff3881` (test), `1a9f1b9` (feat)

_TDD RED/GREEN gate satisfied: a `test(...)` commit precedes each `feat(...)`._

## Files Created/Modified
- `spacetimedb/src/crit.ts` (8 LOC) — zero-import `rollCrit` crit-roll primitive
- `spacetimedb/src/damage.ts` (82 LOC) — zero-import WEAPONS mirror + multipliers + `computeBaseDamage`
- `src/game/data/__tests__/crit.test.ts` — 4 cases (crit/no-crit/boundary/full-multiplier)
- `src/game/data/__tests__/damage.test.ts` — 13 cases (WEAPONS parity, multiplier parity, computeBaseDamage basic/skill/ramp/power scaling)

## Decisions Made
- **critDmg as FULL multiplier:** `rollCrit` returns `critDmg` verbatim (e.g. 1.9), not `1 + critDmg` — matches the client x1.9 value Phase 2 replaces. Pinned by an explicit test case.
- **Strict `<` boundary:** `rng() === critRate` does NOT crit; test asserts the boundary directly.
- **Inlined power-track steps:** `CONSTELLATION_DAMAGE_STEP` (0.08) and `TRANSCEND_DAMAGE_STEP` (0.05) are local consts in damage.ts (importing them would break the zero-import rule); each is comment-tagged to its client source so plan 03 can pin parity.

## Deviations from Plan

None — plan executed exactly as written. (The only refinement: header comments were phrased to avoid the literal forbidden tokens `import`/`Math.random`/`Date.now`/`ctx` so the zero-import acceptance grep returns cleanly on the code AND the comments, rather than matching prose. No behavior change.)

## Issues Encountered
None. Both helpers went RED→GREEN on first implementation; no auto-fixes required.

## Self-Check: PASSED
- `spacetimedb/src/crit.ts` — FOUND
- `spacetimedb/src/damage.ts` — FOUND
- `src/game/data/__tests__/crit.test.ts` — FOUND
- `src/game/data/__tests__/damage.test.ts` — FOUND
- Commits 78e970e, b73d57a, 3ff3881, 1a9f1b9 — FOUND
- Zero-import grep on both server files — no matches
- `pnpm test` — 403 passed / 28 files

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- `rollCrit` and `computeBaseDamage` are built and tested but wired to nothing; Phase 2 imports them into `attackEnemies`/`attackRay`, slotting `ctx.random` into the `rng` seam.
- Sibling plans 01-02 (crit stat data) and 01-03 (import-and-compare parity) can proceed; damage.ts exports are ready for 03's parity pin.
- No blockers.

---
*Phase: 01-crit-foundation*
*Completed: 2026-07-08*
