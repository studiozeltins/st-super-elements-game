---
phase: 04-attack-state-machine-leapslam-end-to-end-delete-goliath-drai
plan: 01
subsystem: server-combat
tags: [attack-fsm, pure-helpers, tdd, spacetimedb, vitest]
requires: []
provides:
  - ATTACKS registry + UNIT_ATTACKS lists + selectAttack (spacetimedb/src/attacks.ts)
  - unitAttackFsm deadline math + enterWindup + dueAttackTransitions (spacetimedb/src/unitAttackFsm.ts)
  - resolveCircleHit + knockbackDisplacement (spacetimedb/src/attackHitbox.ts)
affects:
  - 04-02 reducer glue (consumes all three pure modules)
  - serverSync.test.ts INV-5 parity gate
tech-stack:
  added: []
  patterns:
    - zero-import pure helper + injected determinism (crit.ts discipline)
    - per-size readonly stat arrays indexed by sizeIndex (enemyStats pattern)
    - cross-boundary import-and-compare parity tests (serverSync pattern)
key-files:
  created:
    - spacetimedb/src/attacks.ts
    - spacetimedb/src/unitAttackFsm.ts
    - spacetimedb/src/attackHitbox.ts
    - src/game/data/__tests__/attacks.test.ts
    - src/game/data/__tests__/unitAttackFsm.test.ts
    - src/game/data/__tests__/attackHitbox.test.ts
  modified:
    - src/game/data/__tests__/serverSync.test.ts
key-decisions:
  - "dueAttackTransitions cascades all the way to IDLE: a WINDUP row whose now jumped past recoveryEndsAt emits [STRIKE, RECOVERY, IDLE] in one call — the full-cascade reading of FSM-05, pinned by test"
  - "selectAttack cooldown boundary is >= (nowMicros === cooldownUntilMicros is OFF cooldown), matching deadlinePassed semantics"
  - "Grace deadline is derived, never stored: graceDeadline(row.strikeAtMicros, spec.graceTicks, tick) per call (D4-02 zero-storage grace)"
duration: 7min
completed: 2026-07-09
status: complete
---

# Phase 04 Plan 01: Pure Attack-FSM Foundation Summary

Data-driven ATTACKS registry (one leapSlam entry carrying every locked D4 number), injected-clock FSM deadline math with resolve-never-drop cascade, and circle-hit/knockback geometry — all zero-import pure modules, built test-first, 30 new tests, full 510-test suite green.

## What Was Built

### Task 1 — ATTACKS registry + UNIT_ATTACKS + selectAttack (FSM-03, FSM-04)
- `spacetimedb/src/attacks.ts` (zero imports): `UNIT_KIND_GOLIATH`, four `ATTACK_STATE_*` consts (0..3), `AttackSpec` interface with all 15 mandated fields incl. `poiseThreshold` (FSM-04 field exists now, consumed Phase 7), `ATTACKS.leapSlam` with the locked values (windup 8, active 1, grace 1, recovery 8, cooldown 3_500_000n, radii [4.0, 4.75, 5.5], multiplier 4.5, band 0..8, knockback 3, stun 2, move 'leap', poise 600), `UNIT_ATTACKS = { 0: { default: ['leapSlam'] } }`.
- `selectAttack` implements the D4-08 rhythm verbatim: skill in band + off cooldown wins, else basic in band, else `null` = chase. The ATK-05 dead-zone sweep (d = 0..8 step 0.25) proves an attack exists at every distance.
- `serverSync.test.ts` gained the "ATTACKS registry invariants (INV-5)" describe block: tick-multiple durations with the ≥2-tick windup floor, `contactDamage × 4.5 → [405, 585, 765]`, `radiusBySize.length === GOLIATH_SIZE_STATS.length`. No existing assertion touched — all 142 pre-existing serverSync tests still pass.

### Task 2 — unitAttackFsm.ts deadline math (FSM-05, ATK-01, D4-02, D4-12)
- One pure sibling import (`./attacks`); all time is injected bigint micros — the module never reads a clock or touches `ctx`.
- `strikeDeadline` / `graceDeadline` / `recoveryDeadline` / `stunDeadline` + `deadlinePassed` (the ONLY comparison primitive, `>=` semantics).
- `enterWindup` returns the full `WindupEntry` row payload: landing LOCKED at cast-time target sample (ATK-01), cast root passthrough (D4-12), `recoveryEndsAtMicros` written once at windup entry (pinned — later transitions read it), sizeIndex-indexed radius with last-element clamp, `poise: 0` reset, `strikeResolved: false`.
- `dueAttackTransitions` returns the ORDERED cascade of due target states; the jumped-two-intervals test proves a passed strike deadline resolves exactly once, never drops (FSM-05).

### Task 3 — attackHitbox.ts geometry (ATK-06, HIT-01)
- `resolveCircleHit` IS `distanceBetween(...) <= radius` — inclusive edge, reuses combatMath, zero new geometry.
- `knockbackDisplacement` normalizes (victim − center), scales by distance; zero-length delta falls back to the caller-supplied heading (headingFromStep branch shape). No world clamping — caller owns bounds policy (D4-11).
- No cone/lane stubs created (CLAUDE.md no-dead-code; Phases 5/6 deliver those shapes).

## Deviations from Plan

None - plan executed exactly as written. (Test files include a few boundary cases beyond the behavior-block minimum — cooldown `===` boundary, full triple cascade to IDLE, out-of-range sizeIndex clamp, IDLE-never-emits — all within the tasks' stated scope.)

## Verification Results

- `pnpm test`: 32 files, **510 tests, all green** (was 480 before this plan; +30 new)
- `grep -c "^import" spacetimedb/src/attacks.ts` → 0
- `grep -cE "^import .* from './attacks'" spacetimedb/src/unitAttackFsm.ts` → 1 (only the pure sibling)
- `grep -c "ctx\." spacetimedb/src/unitAttackFsm.ts` → 0
- `grep -c "distanceBetween" spacetimedb/src/attackHitbox.ts` → 2 (import + use)
- `grep -rn "Math.random\|Date.now" spacetimedb/src` → empty (determinism gate)
- LOC budgets held: attacks.ts 94 lines, unitAttackFsm.ts 120, attackHitbox.ts 47 (all ≤ 300 functional LOC)

## Commits

| Task | Type | Hash | Description |
|------|------|------|-------------|
| 1 RED | test | 513c7ff | failing tests for ATTACKS registry, selectAttack, serverSync INV-5 |
| 1 GREEN | feat | dc5bedb | ATTACKS registry + UNIT_ATTACKS + selectAttack |
| 2 RED | test | 4df90d5 | failing tests for unitAttackFsm deadline math + cascade |
| 2 GREEN | feat | bfe1cb2 | unitAttackFsm pure deadline math + windup entry + cascade |
| 3 RED | test | d736f0f | failing tests for circle hit + knockback displacement |
| 3 GREEN | feat | a63a5cb | circle hit resolver + knockback displacement |

## Known Stubs

None — no placeholder values, no dead branches; `poiseThreshold` is a live data field (read by Phase 7 per FSM-04's registry contract, present and asserted now).

## Notes for Plan 02 (reducer glue)

- Grace deadline is NOT a stored row field — derive per call: `graceDeadline(row.strikeAtMicros, spec.graceTicks, tick)`.
- `enterWindup` is the only transition writing `recoveryEndsAtMicros`; strike/grace/recovery transitions read it.
- Damage resolves exactly ONCE, at the grace deadline, vs live positions (D4-02 zero-storage grace — RESEARCH assumption A6: D4-02 outranks a literal same-microsecond FSM-02 reading).
- `dueAttackTransitions` can emit up to `[STRIKE, RECOVERY, IDLE]` from one WINDUP row — walk the list in order applying side effects.

## Self-Check: PASSED

All 6 created files exist on disk; all 6 task commits (513c7ff, dc5bedb, 4df90d5, bfe1cb2, d736f0f, a63a5cb) verified in git log.
