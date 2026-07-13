---
phase: 01-crit-foundation
plan: 03
subsystem: testing
tags: [parity, serverSync, crit, damage, INV-5, CRIT-03]
requires: ["01-01", "01-02"]
provides: ["crit-parity-gate", "weapon-multiplier-parity-gate"]
affects: [src/game/data/__tests__/serverSync.test.ts]
tech_stack:
  added: []
  patterns: ["import-and-compare parity (RESEARCH Pitfall 4)", "regex-scrape parity (existing readField path)"]
key_files:
  created: []
  modified:
    - src/game/data/__tests__/serverSync.test.ts
decisions:
  - "Crit parity uses the existing readField/extractServerStats regex path (captures decimals); weapon/multiplier parity uses import-and-compare across the package boundary because inlined server constants have no index.ts regex path."
metrics:
  duration: ~6m
  completed: 2026-07-08
  tasks: 2
  files: 1
  tests_added: 29
status: complete
---

# Phase 01 Plan 03: Crit + Damage Parity Assertions Summary

Extended `serverSync.test.ts` to make client↔server drift a build failure for everything Phase 1 added — per-character crit stats (INV-5) and the mirrored base-damage math (D-05) — completing the test half of CRIT-03.

## What Shipped

**Task 1 — Crit-value parity (regex path).** Extended the `ServerStat` interface with `critRate`/`critDmg`, populated them in `extractServerStats` via the existing `readField` regex (already captures decimals like `0.34`), and added an `it.each` over all 17 characters asserting `serverStats[id].critRate/critDmg === CHARACTERS[id].critRate/critDmg`. A drifted decimal fails on `===`; a malformed multi-line entry reads `NaN` and also fails.

**Task 2 — Weapon + multiplier + CONSTELLATION_DAMAGE_STEP parity (import-and-compare path).** Imported the server `spacetimedb/src/damage.ts` exports across the package boundary alongside the client `WEAPONS`/`comboSystem`/`transcendScaling` originals, and added `describe('server damage.ts mirror stays in sync')`:
- `SERVER_WEAPONS` deep-equals `CLIENT_WEAPONS` (all 5 weapons incl. `displayName`).
- Regular + skill attack multipliers equal client===server across sampled combos (0,1,5,10,50,100).
- Transcend multiplier equal across sampled (constellation,transcend) pairs ([0,0],[1,0],[0,1],[6,4]).
- Explicit `serverTranscend(1,0) === clientTranscend(1,0) === 1.08` pins the inlined server `CONSTELLATION_DAMAGE_STEP` (0.08) — its only parity guard, since (unlike `TRANSCEND_DAMAGE_STEP`) it has no `index.ts` constant regex path.

## Verification

- `pnpm test` full suite green: **450 tests passed / 28 files** (was 438 before this plan).
- serverSync.test.ts grew from 92 → 121 tests (+17 crit-parity it.each cases in Task 1, +12 weapon/multiplier/constellation cases in Task 2 = 29 new assertions).
- The only console noise is the pre-existing jsdom `HTMLCanvasElement.getContext` warning from an unrelated model test — that test still passes; not introduced by this plan.

## Deviations from Plan

None — plan executed exactly as written. No auto-fixes, no authentication gates, no architectural decisions.

## Commits

- `84a5493` test(01-03): add per-character crit parity to serverSync (INV-5)
- `667557b` test(01-03): pin weapon/multiplier/constellation-step parity via import (D-05)

## Self-Check: PASSED

- FOUND: src/game/data/__tests__/serverSync.test.ts (modified, 450-test suite green)
- FOUND: commit 84a5493
- FOUND: commit 667557b
