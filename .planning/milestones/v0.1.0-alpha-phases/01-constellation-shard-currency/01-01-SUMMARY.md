---
phase: 01-constellation-shard-currency
plan: 01
subsystem: gacha / transcendence economy
tags: [pure-helper, tdd, spacetimedb, shard-currency]
requires: [REQ-shard-currency-mint]
provides:
  - resolveDupeGrant
  - DupeGrantOutcome
affects:
  - spacetimedb/src/gachaOverflow.ts
  - src/game/data/__tests__/gachaOverflow.test.ts
tech-stack:
  added: []
  patterns:
    - "Dependency-free pure helper cross-imported by client vitest (combatMath.ts / serverWorldSim.test.ts pattern)"
key-files:
  created:
    - spacetimedb/src/gachaOverflow.ts
    - src/game/data/__tests__/gachaOverflow.test.ts
  modified: []
decisions:
  - "MAX_CONSTELLATION is not exported from the client mirror; test uses a local const MAX = 6 mirroring spacetimedb/src/index.ts, per plan guidance."
metrics:
  duration: ~2 min
  completed: 2026-07-06
  tasks: 2
  files: 2
status: complete
---

# Phase 01 Plan 01: Constellation shard currency (pure overflow helper) Summary

Extracted the C6-overflow dupe-grant decision into a pure, dependency-free `resolveDupeGrant` helper and proved both branches with a cross-import Vitest suite — landing the mint-semantics test alongside the implementation (Nyquist wave-0 deliverable) so wave-2 reducer wiring targets a proven contract.

## What Was Built

- `spacetimedb/src/gachaOverflow.ts` — pure module (no `import`/`ctx`/`db`, no random/time) exporting `DupeGrantOutcome { constellation, shardMinted }` and `resolveDupeGrant(currentConstellation, maxConstellation, shardPerOverflow)`. Sub-cap dupes increment constellation and mint 0; at/past cap the constellation pins to max and `shardPerOverflow` is minted.
- `src/game/data/__tests__/gachaOverflow.test.ts` — Vitest suite cross-importing the real helper across the package boundary and consuming `SHARD_PER_OVERFLOW_DUPE` from the client mirror. `it.each` covers sub-C6 constellations (0,1,2,5); a dedicated `it` covers the C6-overflow case. 5 tests green.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Create pure resolveDupeGrant helper | d91fba5 | spacetimedb/src/gachaOverflow.ts |
| 2 | Unit-test both overflow branches via cross-import | 4a4c39f | src/game/data/__tests__/gachaOverflow.test.ts |

## Verification

- `pnpm exec tsc --noEmit -p spacetimedb` → exit 0, no TS errors.
- Grep acceptance `grep -v '^//' spacetimedb/src/gachaOverflow.ts | grep -cE '\b(import|ctx|db)\b'` → 0 (module is side-effect-free).
- `pnpm vitest run src/game/data/__tests__/gachaOverflow.test.ts` → 5 passed (4 sub-C6 + 1 overflow).

## Threat Mitigations Applied

- T-1-01 (Tampering/Elevation): mint amount derives only from the `shardPerOverflow` server constant and owned-constellation state — the helper takes no client-supplied value.
- T-1-02 (Determinism): helper is pure arithmetic, no `ctx.random`/time/I-O, keeping the calling reducer deterministic (CLAUDE.md rule 2).

## Deviations from Plan

None - plan executed exactly as written. `MAX_CONSTELLATION` is not exported from the client mirror, so the test uses `const MAX = 6` with a comment mirroring the server constant — this was the plan's prescribed fallback, not a deviation.

## Known Stubs

None. Scope is intentionally the testable pure decision; the `transcendShards` column, regenerated bindings, React prop, and shard chip belong to later plans (per plan success criteria).

## TDD Gate Compliance

The plan splits helper (feat) and test (test) into ordered tasks; both landed. A `test(...)` commit (4a4c39f) and `feat(...)` commit (d91fba5) exist. Note: the `feat` (implementation) preceded the `test` commit because the plan authored the tasks in that order (helper first, then cross-import test); tests were run and green before each commit.

## Self-Check: PASSED

- FOUND: spacetimedb/src/gachaOverflow.ts
- FOUND: src/game/data/__tests__/gachaOverflow.test.ts
- FOUND commit: d91fba5
- FOUND commit: 4a4c39f
