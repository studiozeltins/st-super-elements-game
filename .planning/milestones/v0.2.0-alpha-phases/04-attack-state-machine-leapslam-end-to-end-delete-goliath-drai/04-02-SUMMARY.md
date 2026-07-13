---
phase: 04-attack-state-machine-leapslam-end-to-end-delete-goliath-drai
plan: 02
subsystem: server-combat
tags: [attack-fsm, spacetimedb, schema, additive-migrate, knockback, stun]
requires:
  - 04-01 pure modules (attacks.ts selectAttack/ATTACKS, unitAttackFsm.ts enterWindup/dueAttackTransitions/deadlines, attackHitbox.ts resolveCircleHit/knockbackDisplacement)
provides:
  - unit_attack table (public, by_unit btree on unitKind+unitId) — lazily-upserted per-unit FSM state
  - attack_strike event table (public, event) — one unconditional insert per strike
  - player.stunnedUntilMicros column (.default(0n), appended last) + updatePosition stun guard
  - runUnitAttacks(ctx, now, tick, goliaths, goliathPosition, goliathHeading, playerByHex, playerDamage) in spacetimedb/src/unitAttacks.ts
affects:
  - 04-03 (wires the runUnitAttacks call into worldTick + deletes pass 4b contact drain)
  - 04-04+ client (telegraph renders unit_attack WINDUP rows; attack_strike drives VFX/SFX)
tech-stack:
  added: []
  patterns:
    - lazy row upsert via multi-column btree index (characterActivation idiom)
    - event-table one-shot broadcast, emission before victim branching (enemyHit idiom)
    - appended .default() column + insert-type tax at every insert site (additive migrate)
    - position-map override inside worldTick (root/leap without touching chase AI)
key-files:
  created:
    - spacetimedb/src/unitAttacks.ts
  modified:
    - spacetimedb/src/index.ts
    - spacetimedb/tsconfig.json
key-decisions:
  - "Dead-row hygiene scans the attack table through a local `attackTable` alias — driver loop provably iterates the goliaths argument, satisfying both the FSM-06 source assertion and the orphan-reset requirement (Pitfall 6)"
  - "Grace resolution re-finds every victim row via ctx.db.player.identity.find (LIVE positions, D4-02) instead of the tick-start playerByHex snapshot"
  - "tsconfig gains src/unitAttacks.ts as an explicit check root so tsc actually validates the not-yet-imported module (removable once Plan 03 wires the import)"
duration: 10min
completed: 2026-07-09
status: complete
---

# Phase 04 Plan 02: Server FSM Spine — Schema + runUnitAttacks Glue Summary

Additive unit_attack/attack_strike tables plus enforced player stun (server rejects positions while stunned), and the ~150-LOC runUnitAttacks glue composing Plan-01 pure helpers into the full windup → strike → recovery lifecycle — compiled and tested green with zero runtime effect until Plan 03 wires the single call.

## What Was Built

### Task 1 — index.ts additive schema (FSM-01, FSM-06, HIT-01)
- **`unit_attack` table** (public): 16 columns (id pk autoInc, unitKind/unitId, state, attackId, four u64 deadlines, landingX/Z, radius, castX/Z, strikeResolved, poise) with `by_unit` btree on `['unitKind', 'unitId']` — copies the characterActivation multi-column-index idiom. Header comment pins the row-optional design: lazily upserted, starts EMPTY on a migrated DB, never the iteration driver.
- **`attack_strike` event table** (public, event): unitKind, unitId, attackId, landingX/Z, radius — enemyHit shape, ONE insert per strike (not per victim).
- **`player.stunnedUntilMicros`**: `t.u64().default(0n)` appended LAST after skillWindowEndsAtMicros; insert-type tax paid at all three `player.insert` sites (seedPlayer, restorePlayers, debugSpawnBots).
- **updatePosition stun guard**: early return while `now < currentPlayer.stunnedUntilMicros`, placed immediately after the puppet guard — stun is enforced server-side, a modified client cannot wiggle out (threat T-04-03 mitigated).
- Both tables registered in the `schema({...})` export; no existing column or table reordered.

### Task 2 — unitAttacks.ts glue (FSM-02, FSM-05, FSM-06, ATK-01, D4-02..D4-12)
- `runUnitAttacks` iterates the **goliaths argument** as the driver, lazily upserting each unit's row via `by_unit.filter([UNIT_KIND_GOLIATH, goliathId])`.
- **Dead-row hygiene** (Pitfall 6): one scan of the attack table (via a local alias, spread-before-mutate) resets any row whose goliath is dead or window-retired to IDLE — no posthumous strikes, no hung telegraphs, and a respawned slot id can never inherit stale WINDUP deadlines.
- **IDLE**: live aggro target (aggroExpired check), online, outside safe zone → `selectAttack` at the current map-position distance; null = chase untouched (D4-13). Non-null → `enterWindup` applied as a row update — landing LOCKED at the single cast-time sample (ATK-01), cast root = current map position, poise reset to 0.
- **WINDUP**: goliathPosition entry overridden back to (castX, castZ), heading aimed at the landing via `headingFromStep` (D4-12 rooted crouch).
- **STRIKE**: position set to the landing (the leap), `attack_strike` inserted UNCONDITIONALLY at the transition before any victim logic (Phase-2 guarded-emission lesson).
- **Grace resolution** (once, `strikeResolved` gated): every online player re-fetched LIVE via `ctx.db.player.identity.find`, safe-zone skipped, `resolveCircleHit` vs the locked circle → (a) RAW `contactDamage × 4.5` into the SHARED playerDamage map (contact-channel resist/death/spill/respawn ride the existing apply loop — never the 400-capped player-hit path), (b) 3u `knockbackDisplacement` clamped only to world bounds (D4-11 edge deaths are a feature), (c) `stunDeadline(now, 2, tick)` written to the victim row.
- **RECOVERY → IDLE**: `cooldownUntilMicros = now + 3_500_000n` (D4-06/D4-07, ~6s full cycle).
- Transitions walked from `dueAttackTransitions` in order — a coalesced tick applies STRIKE + RECOVERY (+ IDLE) in one pass (FSM-05). Zero decision arithmetic in the glue; now/tick arrive as arguments (no clock samples); no module-scope mutable state.
- index.ts exports gained: `isInsideSafeZone`, `clampToWorld`, `aggroExpired` (export keyword only, one-line rationale comments).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] tsconfig check-root for the unwired module**
- **Found during:** Task 2
- **Issue:** `spacetimedb/tsconfig.json` includes only `src/index.ts` + transitive imports; since index.ts does not import unitAttacks.ts until Plan 03, `tsc --noEmit -p spacetimedb` would silently skip the new file — the acceptance criterion would be vacuous.
- **Fix:** added `"src/unitAttacks.ts"` to the include array (removable when Plan 03 wires the import).
- **Files modified:** spacetimedb/tsconfig.json
- **Commit:** 06f19ff

**2. [Rule 1 - Bug] Comment tripped the damage-path grep gate**
- **Found during:** Task 2 verification
- **Issue:** a doc comment naming `resolvePlayerHit` made `grep -cE "resolvePlayerHit|MAX_HIT_DAMAGE"` return 1 (criterion: 0).
- **Fix:** rephrased to "the player-hit path, whose 400 cap would clamp the slam" — same warning, no token.
- **Files modified:** spacetimedb/src/unitAttacks.ts
- **Commit:** 06f19ff

## Verification Results

- `tsc --noEmit -p spacetimedb` → exit 0 (unitAttacks.ts included as a check root)
- `pnpm test` → 32 files, **510 tests, all green** (no behavior change — module unwired until Plan 03)
- `grep -c "name: 'unit_attack'"` → 1 (with by_unit); `grep -c "name: 'attack_strike'"` → 1 (with event: true)
- `grep -c "stunnedUntilMicros" index.ts` → 5 (column + 3 inserts + guard); column has `.default(0n)` after skillWindowEndsAtMicros
- `grep -c "export function runUnitAttacks"` → 1; `by_unit.filter` → 1; `unitAttack.iter()` → 0; `resolvePlayerHit|MAX_HIT_DAMAGE` → 0; `attackStrike.insert` → 1
- `grep -rn "Math.random\|Date.now" spacetimedb/src` → empty; no module-scope mutable Map/state in unitAttacks.ts
- Functional LOC unitAttacks.ts: 156 (≤ 300, no-monolith rule)

## Commits

| Task | Type | Hash | Description |
|------|------|------|-------------|
| 1 | feat | 23e35c2 | additive attack-FSM schema — unit_attack + attack_strike tables, enforced stun |
| 2 | feat | 06f19ff | runUnitAttacks glue — lazy upsert, windup/strike/recovery, grace resolution, knockback + stun |

## Known Stubs

None — `attackId: ''` in the lazy-upsert seed is a live sentinel ("never attacked"), guarded by the spec lookup before any FSM step; no placeholder branches, no dead code.

## Threat Flags

None beyond the plan's own threat model: zero new client-callable reducers, both new tables written only by worldTick-side code, and the updatePosition boundary was NARROWED (stun rejection), not widened.

## Notes for Plan 03 (wiring)

- Call site: `runUnitAttacks(ctx, now, tick, goliaths, goliathPosition, goliathHeading, playerByHex, playerDamage)` must run AFTER pass 1 (position maps built) and BEFORE the goliath apply loop + player-damage apply loop — root/leap overrides and slam damage then persist for free.
- `playerDamage` is declared at pass 4 — hoist its declaration above the call site when wiring.
- Deleting pass 4b: grep `GOLIATH_PLAYER_CONTACT_RANGE` afterward and remove the const if unreferenced.
- Optional cleanup: drop `"src/unitAttacks.ts"` from spacetimedb/tsconfig.json include once index.ts imports the module.
- Circular import (index ↔ unitAttacks) is safe: all index.ts helpers used by the glue are hoisted function declarations invoked only at tick time.

## Self-Check: PASSED

- spacetimedb/src/unitAttacks.ts exists on disk
- Commits 23e35c2 and 06f19ff verified in git log
- tsc exit 0, 510/510 tests green re-confirmed after final edits
