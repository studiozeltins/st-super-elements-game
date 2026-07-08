---
phase: 02-transcendence-install
plan: 01
subsystem: testing
tags: [transcendence, pure-helpers, vitest, tdd, combat-math, server-authority]

# Dependency graph
requires:
  - phase: 01-constellation-shard-currency
    provides: transcendShards currency, resolveDupeGrant cross-boundary test pattern, transcend tunable constants (MAX_TRANSCEND_LEVEL, TRANSCEND_DAMAGE_STEP, TRANSCEND_SHARD_COST)
provides:
  - resolveTranscendInstall pure server install-decision helper (spacetimedb/src/transcendInstall.ts)
  - transcendDamageMultiplier pure client combat-math helper (src/game/combat/transcendScaling.ts)
  - green cross-boundary unit spec for the install decision
  - green boundary spec for the damage math
affects: [02-02 (transcendCharacter reducer consumes resolveTranscendInstall), 02-04 (createGame + App.tsx consume transcendDamageMultiplier), 02-05 (CharacterScreen install gate)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure decision helper extracted from a reducer branch, cross-imported into client vitest across the package boundary (../../../../spacetimedb/src/...)"
    - "Union-typed result ({ ok:true, ... } | { ok:false, reason }) with load-bearing gate ordering"

key-files:
  created:
    - spacetimedb/src/transcendInstall.ts
    - src/game/combat/transcendScaling.ts
    - src/game/data/__tests__/transcendInstall.test.ts
    - src/game/combat/__tests__/transcendScaling.test.ts
  modified: []

key-decisions:
  - "resolveTranscendInstall gates strictly below_c6 → at_cap → insufficient_shards; the shard check is LAST so shardCost is computed only after the C6/cap gates pass (u32-underflow mitigation T-02-03)."
  - "transcendDamageMultiplier subsumes the local constellationDamageMultiplier in createGame.ts; plan 04 swaps the call sites."

patterns-established:
  - "Pure cross-boundary helper: extract the reducer decision, keep it ctx/import/random/time-free, unit-test via the client vitest runner."

requirements-completed: [REQ-transcend-install]

coverage:
  - id: D1
    description: "resolveTranscendInstall pure server install-decision helper — returns ok with nextLevel+shardCost when C6/under-cap/enough-shards, else rejects below_c6 / at_cap / insufficient_shards in that priority order"
    requirement: "REQ-transcend-install"
    verification:
      - kind: unit
        ref: "src/game/data/__tests__/transcendInstall.test.ts#resolveTranscendInstall"
        status: pass
    human_judgment: false
  - id: D2
    description: "transcendDamageMultiplier pure client damage math — 1 + constellation*0.08 + transcend*0.05 with correct boundary values"
    requirement: "REQ-transcend-install"
    verification:
      - kind: unit
        ref: "src/game/combat/__tests__/transcendScaling.test.ts#transcendDamageMultiplier"
        status: pass
    human_judgment: false

# Metrics
duration: 3min
completed: 2026-07-06
status: complete
---

# Phase 02 Plan 01: Transcendence pure helpers Summary

**Two dependency-free helpers the phase pivots on — `resolveTranscendInstall` (server install decision, union-typed, gate-ordered) and `transcendDamageMultiplier` (client damage math) — each shipped test-first with green cross-boundary/boundary specs.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-07-06T16:41:53Z
- **Completed:** 2026-07-06T16:44:18Z
- **Tasks:** 2
- **Files modified:** 4 (2 source + 2 tests)

## Accomplishments
- `resolveTranscendInstall` — pure, import-free server install decision with load-bearing gate order (below_c6 → at_cap → insufficient_shards); shard check last so the downstream reducer can never u32-underflow (T-02-03).
- `transcendDamageMultiplier` — pure combat math importing only sibling data constants; (0,0)=1, (6,0)=1.48, (6,1)=1.53, (6,10)=1.98.
- 15 unit tests green across both specs (10 install + 5 damage), including cap boundary, exact-shard boundary, below_c6 priority, and cost curve n∈{1,2,5,10}.

## Task Commits

Each task followed the TDD RED → GREEN cycle with atomic commits:

1. **Task 1 (RED): failing resolveTranscendInstall spec** - `71aeb2a` (test)
2. **Task 1 (GREEN): resolveTranscendInstall helper** - `76c66e0` (feat)
3. **Task 2 (RED): failing transcendDamageMultiplier spec** - `3762987` (test)
4. **Task 2 (GREEN): transcendDamageMultiplier helper** - `6d9ef97` (feat)

## Files Created/Modified
- `spacetimedb/src/transcendInstall.ts` - Pure `resolveTranscendInstall` install-decision helper + `TranscendInstall` union type. Zero imports, no ctx/random/time.
- `src/game/combat/transcendScaling.ts` - Pure `transcendDamageMultiplier`; imports only `../data/constellations` and `../data/constants`.
- `src/game/data/__tests__/transcendInstall.test.ts` - Cross-boundary unit spec importing the server helper into client vitest (10 tests).
- `src/game/combat/__tests__/transcendScaling.test.ts` - Boundary-value spec for the damage math (5 tests).

## Decisions Made
- Gate ordering in `resolveTranscendInstall` is enforced and unit-asserted (C5 with abundant shards returns `below_c6`, not `insufficient_shards`) — the shard check computes `shardCost` last, gating the deduct against u32 underflow (T-02-03).
- `transcendDamageMultiplier` is authored to subsume the local `constellationDamageMultiplier` in createGame.ts; the call-site swap is deferred to plan 04 per the plan.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## TDD Gate Compliance
Both tasks completed a RED (test commit that fails) → GREEN (feat commit that passes) cycle:
- Task 1: RED `71aeb2a` (module unresolved) → GREEN `76c66e0` (10 tests pass)
- Task 2: RED `3762987` (module unresolved) → GREEN `6d9ef97` (5 tests pass)
No REFACTOR commits were needed — the helpers are minimal by design.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Both pure helpers exist with the locked signatures; downstream plans can consume them directly.
- Plan 02 wires `resolveTranscendInstall` into the new `transcendCharacter` reducer + `owned_character.transcendLevel` column.
- Plan 04 swaps createGame's local multiplier for `transcendDamageMultiplier` and threads `setActiveTranscend`.
- No schema change, publish, or client wiring was touched — as intended.

## Self-Check: PASSED
- FOUND: spacetimedb/src/transcendInstall.ts
- FOUND: src/game/combat/transcendScaling.ts
- FOUND: src/game/data/__tests__/transcendInstall.test.ts
- FOUND: src/game/combat/__tests__/transcendScaling.test.ts
- FOUND commits: 71aeb2a, 76c66e0, 3762987, 6d9ef97

---
*Phase: 02-transcendence-install*
*Completed: 2026-07-06*
