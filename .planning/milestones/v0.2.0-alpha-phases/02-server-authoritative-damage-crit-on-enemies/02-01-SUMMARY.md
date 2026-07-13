---
phase: 02-server-authoritative-damage-crit-on-enemies
plan: 01
subsystem: server-combat-data
tags: [combat-data, parity, determinism, tdd, crit]
requires: []
provides:
  - CHARACTER_COMBAT
  - CharacterCombat
  - skillGrantActive
  - nextSkillReadyAt
affects:
  - spacetimedb/src/damage.ts
  - spacetimedb/src/skillGate.ts
tech-stack:
  added: []
  patterns:
    - zero-import injected-seam server helper (crit.ts idiom)
    - import-and-compare cross-boundary parity test (RESEARCH Pitfall 3)
    - single-line flat Record entries survive regex scrape
key-files:
  created:
    - spacetimedb/src/skillGate.ts
    - src/game/data/__tests__/skillGate.test.ts
  modified:
    - spacetimedb/src/damage.ts
    - src/game/data/__tests__/serverSync.test.ts
    - src/game/data/__tests__/crit.test.ts
decisions:
  - "CHARACTER_COMBAT keyed by string id (matches CHARACTER_STATS convention), single-line flat entries per RESEARCH Pitfall 3."
  - "skillGrantActive uses inclusive <= window bound (boundary-equal still grants); nextSkillReadyAt rounds seconds*1e6 to nearest micro."
  - "SC2 divergence regression uses a local mulberry32 PRNG (never Math.random) with two identically-seeded instances so only critRate differs."
metrics:
  duration: ~10m
  completed: 2026-07-08
  tasks: 3
  files-created: 2
  files-modified: 3
status: complete
---

# Phase 2 Plan 01: Combat-data mirror + skill-gate foundations Summary

Landed the two zero-import, test-first foundations the Phase-2 reducer rework will wire in — a per-character combat-data mirror (`CHARACTER_COMBAT`) and a pure skill-window math helper (`skillGate.ts`) — plus an automated SC2 crit-frequency divergence regression. No reducer, client, or schema touched; full suite (475 tests) stays green.

## What was built

- **Task 1 — `CHARACTER_COMBAT` mirror (`damage.ts`) + INV-5 parity.** Added `CharacterCombat` interface and `CHARACTER_COMBAT: Record<string, CharacterCombat>` covering all 17 ids (aeris…stindzis), each entry single-line flat, values sourced verbatim from client `CHARACTERS[id].weapon` / `.skill.damage` / `.skill.cooldownSeconds`. `damage.ts` stays zero-import (143 LOC, under the 300 cap). `serverSync.test.ts` now imports `CHARACTER_COMBAT` across the package boundary and asserts key-set equality + per-id weapon/skillDamage/skillCooldown parity (import-and-compare, CRIT-06 drift guard for T-02-08).
- **Task 2 — `skillGate.ts` pure helper.** New zero-import module exporting `skillGrantActive(isSkill, nowMicros, windowEndsAtMicros)` (`isSkill && nowMicros <= windowEndsAtMicros`, inclusive bound) and `nextSkillReadyAt(nowMicros, cooldownSeconds)` (`nowMicros + BigInt(Math.round(cooldownSeconds * 1_000_000))`). `skillGate.test.ts` clones the `crit.test.ts` cross-boundary idiom and pins the inclusive boundary (200n grants, 201n does not) plus fractional-cooldown rounding (0.45 → 450_000n).
- **Task 3 — SC2 crit-frequency divergence regression (`crit.test.ts`).** Appended a local `mulberry32` seeded PRNG and a divergence case driving `CHARACTERS['vesper'].critRate` (0.36) vs `CHARACTERS['glacia'].critRate` (0.10) through the real `rollCrit` over 2000 shared rolls (two identically-seeded rngs → only the threshold differs). Asserts vesper crits > 2× glacia — the automated proxy for SC2 "visibly different crit frequency" (CRIT-02).

## Files changed

- `spacetimedb/src/damage.ts` (modified) — appended `CharacterCombat` + `CHARACTER_COMBAT`.
- `spacetimedb/src/skillGate.ts` (created) — two pure exports, determinism grep-gate clean.
- `src/game/data/__tests__/serverSync.test.ts` (modified) — CHARACTER_COMBAT import + parity describe block.
- `src/game/data/__tests__/skillGate.test.ts` (created) — cross-boundary boundary/rounding cases.
- `src/game/data/__tests__/crit.test.ts` (modified) — seeded PRNG + SC2 divergence regression.

## Reconciliation note

Per the runtime reconcile note: `spacetimedb/src/damage.ts` already existed as a complete Phase-1 product (WEAPONS mirror + combo/transcend math + `computeBaseDamage`). Verified it against the plan — the `WEAPONS` block and `WeaponId` export were reused verbatim (`CHARACTER_COMBAT` uses the already-exported `WeaponId`, no duplication). New work was confined to what was genuinely missing: the `CHARACTER_COMBAT` map, `skillGate.ts`, and the three test additions. `skillGate.ts` did not exist and was created fresh.

## Test result

- `pnpm test` — 29 files, 475 tests, all green.
- `serverSync.test.ts` — 139 tests green (incl. new CHARACTER_COMBAT parity).
- `skillGate.test.ts` — 6 tests green.
- `crit.test.ts` — 5 tests green (incl. SC2 divergence).
- Determinism grep-gate over `spacetimedb/src`: no `Math.random` / `Date.now`; `skillGate.ts` free of all four forbidden tokens (`import`, `Math.random`, `Date.now`, `ctx`) in source and comments.

## Deviations from Plan

None — plan executed exactly as written. All three tasks followed the TDD RED→GREEN flow (Task 1 and Task 2 confirmed failing before the implementation landed; Task 3 is a test-only regression appended to an already-passing helper).

## TDD Gate Compliance

Task 1 and Task 2 each produced a confirmed RED (serverSync import resolved but entries undefined; skillGate module absent → no tests collected) before the GREEN implementation commit. Commits are labelled `feat`/`test` per the change type. Task 3 adds a regression test against the existing `rollCrit` (no new source behavior), committed as `test`.

## Self-Check: PASSED

- Files exist: `spacetimedb/src/skillGate.ts`, `src/game/data/__tests__/skillGate.test.ts` (created); `spacetimedb/src/damage.ts` (CHARACTER_COMBAT present).
- Commits exist: ce96e3a (Task 1), eee0c22 (Task 2), 40d08f0 (Task 3).
