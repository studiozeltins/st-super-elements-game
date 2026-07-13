---
phase: 05-swordswing-swordswirl-combo
plan: 01
subsystem: combat
tags: [spacetimedb, combat, fsm, pure-helpers, tdd, cone-hitbox, attack-chain]

# Dependency graph
requires:
  - phase: 04-attack-state-machine-leapslam
    provides: "ATTACKS registry + selectAttack, unitAttackFsm pure deadline math (enterWindup/dueAttackTransitions), attackHitbox circle resolver, isWithinForwardArc in goliathAI"
provides:
  - "resolveCone(px, pz, apexX, apexZ, aimX, aimZ, range, minDot) pure cone hit resolver (ATK-02) reusing isWithinForwardArc"
  - "ATTACKS.swordSwing (cone basic, chains into swordSwirl) + ATTACKS.swordSwirl (circle finisher) with locked D5-06/09/10/11/12/13 numbers"
  - "AttackSpec.chainsInto?/coneMinDot? optional fields — chaining is DATA (D5-01)"
  - "5-arg selectAttack: basics gate on their own basicCooldownUntilMicros (D5-08)"
  - "walkAttackTransitions pure transition applier + TransitionPlan/AttackRow types — the Wave-0 chain-glue seam"
  - "Live serverSync invariants: D5-10 damage arrays, no-one-shot chain-vs-min-HP, chain integrity/no-cycle, swirl-not-selectable"
affects: [05-02, 05-03, 05-04, 05-05, 06-shielddash-lane]

# Tech tracking
tech-stack:
  added: []
  patterns: ["chain-as-data: RECOVERY re-enters WINDUP via spec.chainsInto and STOPS the walk (stale steps never run)", "per-role cooldown split: basic role writes basicCooldownUntilMicros, skill writes cooldownUntilMicros", "TransitionPlan result object: pure walk returns row + side-effect flags for glue to apply"]

key-files:
  created: []
  modified:
    - spacetimedb/src/attackHitbox.ts
    - spacetimedb/src/attacks.ts
    - spacetimedb/src/unitAttackFsm.ts
    - spacetimedb/src/unitAttacks.ts
    - src/game/data/__tests__/attackHitbox.test.ts
    - src/game/data/__tests__/attacks.test.ts
    - src/game/data/__tests__/unitAttackFsm.test.ts
    - src/game/data/__tests__/serverSync.test.ts

key-decisions:
  - "Exact 60° arc-edge tests use an origin apex: adding sqrt(3) offsets to a non-zero apex loses float bits in the roundtrip and pushes the dot below 0.5 — origin keeps hypot(1, sqrt3) === 2 and dot === 0.5 exactly"
  - "unitAttacks.ts glue call passes a literal 0n basicCooldownUntilMicros until plan 05-03 adds the schema column — keeps spacetimedb tsc green without any behavior change (Rule 3 compile fix)"
  - "walkAttackTransitions is generic over Row extends AttackRow so the glue's any-typed rows (with id/unitKind/unitId) flow through spreads without casts"

patterns-established:
  - "Chain break contract (Pitfall 2): a chain swap inside a coalesced walk STOPS the walk — the old attack's stale RECOVERY/IDLE deadlines never write state or cooldowns"
  - "strikeSnapshot: the pre-chain-swap row is returned so the glue emits attack_strike / resolves damage with the OLD attack's id/landing/radius"

requirements-completed: [ATK-02, ATK-03]

coverage:
  - id: D1
    description: "resolveCone pure resolver — inclusive range + arc edges, side/back escape, apex point-blank, zero-aim 360° degrade"
    requirement: "ATK-02"
    verification:
      - kind: unit
        ref: "src/game/data/__tests__/attackHitbox.test.ts#resolveCone (ATK-02 cone resolver, D5-05/D5-06)"
        status: pass
    human_judgment: false
  - id: D2
    description: "swordSwing + swordSwirl ATTACKS entries with locked D5 numbers, chain data, [leapSlam, swordSwing] default list, leapSlam 5.5s retune"
    requirement: "ATK-03"
    verification:
      - kind: unit
        ref: "src/game/data/__tests__/attacks.test.ts#ATTACKS registry (FSM-04 data-driven attacks)"
        status: pass
      - kind: unit
        ref: "src/game/data/__tests__/serverSync.test.ts#ATTACKS registry invariants (INV-5)"
        status: pass
    human_judgment: false
  - id: D3
    description: "5-arg selectAttack — basics gate on their own cooldown, inclusive boundaries, chase sentinel at d=5"
    requirement: "ATK-03"
    verification:
      - kind: unit
        ref: "src/game/data/__tests__/attacks.test.ts#selectAttack (FSM-03 selection, D4-08 rhythm + D5-08 basic gate)"
        status: pass
    human_judgment: false
  - id: D4
    description: "walkAttackTransitions coalesced-tick chain contract — [STRIKE,RECOVERY,IDLE] on swordSwing ends WINDUP(swordSwirl), swing resolved, zero cooldown written"
    requirement: "ATK-03"
    verification:
      - kind: unit
        ref: "src/game/data/__tests__/unitAttackFsm.test.ts#walkAttackTransitions (D5-01/D5-04 chain glue seam, Pitfalls 1+2)"
        status: pass
    human_judgment: false
  - id: D5
    description: "No-one-shot live invariant — worst-case chain (680 raw) derived from ATTACKS x GOLIATH_SIZE_STATS asserted below min CHARACTERS maxHealth (900)"
    requirement: "ATK-03"
    verification:
      - kind: unit
        ref: "src/game/data/__tests__/serverSync.test.ts#no-one-shot invariant: worst-case chain damage stays below the smallest character HP pool"
        status: pass
    human_judgment: false

# Metrics
duration: 14min
completed: 2026-07-10
status: complete
---

# Phase 05 Plan 01: Pure Server Layer (Cone + Chain + Per-Role Selection) Summary

**resolveCone hitbox resolver reusing isWithinForwardArc, swordSwing→swordSwirl chain as ATTACKS data, 5-arg selectAttack with the D5-08 basic-cooldown gate, and the walkAttackTransitions pure applier that locks the coalesced-tick chain/break contract in plain vitest**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-07-10T15:34:03Z
- **Completed:** 2026-07-10T15:48:20Z
- **Tasks:** 3 (all TDD RED→GREEN)
- **Files modified:** 8

## Accomplishments
- `resolveCone` (ATK-02): range check + verbatim `isWithinForwardArc` reuse, inclusive edges on both range and arc, degenerate zero-aim → 360° and on-apex → point-blank semantics, all 8 edge cases float-exact
- `ATTACKS.swordSwing`/`swordSwirl` (ATK-03): every number carries its D5-xx decision citation as a playtest-seed comment; chain is pure data via `chainsInto`; swirl unreachable except via chain (D5-03); leapSlam retuned to 5.5s (D5-09)
- `walkAttackTransitions`: the phase's highest-value test — a coalesced `[STRIKE, RECOVERY, IDLE]` tick on swordSwing ends in `WINDUP(swordSwirl)` with the swing strike resolved and BOTH cooldown fields untouched — is now a green unit test before any reducer code moves
- Live serverSync invariants: D5-10 damage arrays ([135,195,255] / [225,325,425]), computed no-one-shot comparison (680 < 900, both sides derived), chain integrity/no-cycle, swirl-not-in-default-list
- Full suite green: 542/542 tests across 32 files; spacetimedb/src stays clock/RNG-free

## Task Commits

Each task was committed atomically (TDD: test → feat):

1. **Task 1: resolveCone pure resolver** - `19aaa8c` (test, RED) → `fbe1b43` (feat, GREEN)
2. **Task 2: ATTACKS entries + chain data + 5-arg selectAttack** - `4d33e7a` (test, RED) → `249cfe2` (feat, GREEN)
3. **Task 3: walkAttackTransitions pure applier** - `716fa1d` (test, RED) → `ea4350f` (feat, GREEN)

## Files Created/Modified
- `spacetimedb/src/attackHitbox.ts` - +resolveCone; header cone promise made real code
- `spacetimedb/src/attacks.ts` - AttackSpec +chainsInto?/coneMinDot?; swordSwing/swordSwirl entries; leapSlam 5.5s; UNIT_ATTACKS [leapSlam, swordSwing]; 5-arg selectAttack
- `spacetimedb/src/unitAttackFsm.ts` - +AttackRow/TransitionPlan types + walkAttackTransitions (152 functional LOC total, pure siblings only)
- `spacetimedb/src/unitAttacks.ts` - call-site 0n basic-cooldown literal (compile fix; 05-03 rewires onto the real column)
- `src/game/data/__tests__/attackHitbox.test.ts` - +8 resolveCone cases (float-exact arc edges)
- `src/game/data/__tests__/attacks.test.ts` - literal migration (5.5s, default list, 5-arg) + entry shape + D5-08 gate boundaries
- `src/game/data/__tests__/unitAttackFsm.test.ts` - +9 walkAttackTransitions cases incl. the coalesced-tick chain contract
- `src/game/data/__tests__/serverSync.test.ts` - +5 parity/invariant tests (D5-10, no-one-shot, chain integrity, D5-03)

## Decisions Made
- Exact 60° arc-edge assertions use an origin apex: `apex + 2·cos(π/3)` then re-subtracting the apex loses float bits and lands the dot at 0.49999999999999967 < 0.5; `(1, √3)` from origin keeps `hypot === 2` and `dot === 0.5` exactly
- `walkAttackTransitions` is generic over `Row extends AttackRow` so glue rows carrying id/unitKind/unitId survive the spreads untyped-cast-free
- strikeSnapshot is taken at both the STRIKE step and the pre-chain-swap RECOVERY point, so a `[STRIKE]`-only walk and a chained walk both hand the glue the OLD attack's event fields

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 4-arg selectAttack call in unitAttacks.ts broke the spacetimedb typecheck**
- **Found during:** Task 2 (5-arg selectAttack signature change)
- **Issue:** `spacetimedb/src/unitAttacks.ts:133` still passed 4 args → `tsc --noEmit` error TS2554; the plan scopes glue changes to 05-03 but leaving the module non-compiling breaks publishes/builds between plans
- **Fix:** Pass a literal `0n` for `basicCooldownUntilMicros` with a comment pointing at plan 05-03 (which adds the schema column and rewires the glue onto walkAttackTransitions). Zero behavior change — the gate is inert until the column exists
- **Files modified:** spacetimedb/src/unitAttacks.ts
- **Verification:** `npx tsc --noEmit` in spacetimedb/ exits clean
- **Committed in:** 249cfe2 (Task 2 commit)

**2. [Rule 1 - Bug] Float-precision failure in the exact arc-edge test construction**
- **Found during:** Task 1 (resolveCone GREEN run)
- **Issue:** The RED test built the 60°-edge target as `apex + distance·cos/sin(π/3)`; the add/subtract roundtrip through a non-zero apex produced dot ≈ 0.49999999999999967, failing the inclusive-edge assertion against a correct implementation
- **Fix:** Moved the two exact-edge cases to an origin apex with the algebraically exact `(1, √3)` offset (verified `Math.hypot(1, Math.sqrt(3)) === 2` and `dot === 0.5` in Node)
- **Files modified:** src/game/data/__tests__/attackHitbox.test.ts
- **Verification:** All 16 attackHitbox tests green
- **Committed in:** fbe1b43 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 test-construction bug)
**Impact on plan:** Both fixes necessary for compile health and test correctness. No scope creep — glue/schema work remains fully deferred to 05-03.

## Issues Encountered
None beyond the documented deviations.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 05-02 (client renderer/SFX) and 05-03 (glue + schema column) can start: the chain/break/cooldown contract is fully locked by unit tests
- 05-03 glue must: add `basicCooldownUntilMicros: t.u64().default(0n)` to `unit_attack`, add it to `idleAttackRow`, replace the inline transition walk with `walkAttackTransitions`, and swap the `0n` call-site literal for `row.basicCooldownUntilMicros`
- Note for 05-03: until the glue lands, a published module WOULD let goliaths open swordSwing resolved as a circle with no chain — do not publish between 05-01 and 05-03

## Self-Check: PASSED

- All 8 modified files present on disk
- Commits 19aaa8c, fbe1b43, 4d33e7a, 249cfe2, 716fa1d, ea4350f all in git log
- 542/542 tests green; spacetimedb tsc clean; clock/RNG grep clean

---
*Phase: 05-swordswing-swordswirl-combo*
*Completed: 2026-07-10*
