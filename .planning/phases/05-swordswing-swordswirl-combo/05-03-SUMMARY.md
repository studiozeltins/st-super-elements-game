---
phase: 05-swordswing-swordswirl-combo
plan: 03
subsystem: combat
tags: [spacetimedb, glue, schema, migrate, deploy, cone-hitbox, attack-chain]

# Dependency graph
requires:
  - phase: 05-swordswing-swordswirl-combo
    provides: "Plan 05-01 pure layer: resolveCone, swordSwing/swordSwirl ATTACKS entries with chainsInto, 5-arg selectAttack, walkAttackTransitions applier + TransitionPlan"
provides:
  - "Live worldTick glue delegating the transition walk to walkAttackTransitions — chain swap + break, leap-only teleport gate, per-role cooldown writes are server behavior (ATK-03)"
  - "Shape-branched resolveStrike: cones resolve via resolveCone from the cast apex with locked aim; knockback centers on the apex for cones (ATK-02)"
  - "unit_attack.basicCooldownUntilMicros additive t.u64().default(0n) column, appended LAST, migrated onto the populated local DB without a wipe (D5-08)"
  - "Regenerated src/module_bindings exposing basicCooldownUntilMicros"
affects: [05-04, 05-05, 06-shielddash-lane]

# Tech tracking
tech-stack:
  added: []
  patterns: ["glue-applies-TransitionPlan: the reducer glue executes returned side-effect flags (teleport/emit/resolve) and persists plan.row — zero inline FSM logic", "strikeSnapshot sourcing: event emission AND damage resolution read the pre-chain-swap row, never the final row"]

key-files:
  created: []
  modified:
    - spacetimedb/src/unitAttacks.ts
    - spacetimedb/src/index.ts
    - src/module_bindings/types.ts
    - src/module_bindings/unit_attack_table.ts

key-decisions:
  - "Teleport target reads strikeSnapshot.landingX/Z (not plan.row) — after a chain swap the final row carries the swirl's geometry; the leap belongs to the OLD attack"
  - "resolveStrike hoists the cone/circle knockback center out of the victim loop — the center is per-attack, not per-victim"

patterns-established:
  - "Additive-column deploy recipe reconfirmed: append LAST with .default(0n), plain publish (no --delete-data), verify via describe + SELECT * rows-survive + logs"

requirements-completed: [ATK-02, ATK-03]

# Metrics
duration: 8min
completed: 2026-07-10
status: complete
---

# Phase 05 Plan 03: Server Glue + Additive Column + Local Migrate Summary

**worldTick glue rewired onto the tested walkAttackTransitions applier (chain swap, break contract, leap-only teleport, D5-08 per-role cooldowns), resolveStrike shape-branched onto resolveCone with apex-centered knockback, and the basicCooldownUntilMicros column migrated additively onto the populated local DB with bindings regenerated**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-10T16:02:04Z
- **Completed:** 2026-07-10T16:10:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- The inline transition walk (30 lines of duplicated FSM logic) is gone: the glue now calls `walkAttackTransitions` and applies the returned `TransitionPlan` — teleport gated on the applier's leap flag (latent Pitfall 1 fixed: `move: 'none'` attacks stay planted), `attack_strike` emitted UNCONDITIONALLY from the strikeSnapshot before any victim branching, damage resolved once from the snapshot (old attack's geometry survives a chain swap), and `plan.row` persisted
- `resolveStrike` branches by `spec.shape`: cone hits via `resolveCone(victim, cast apex, landing − cast aim, radius-as-range, coneMinDot ?? 0.5)` per D5-05; knockback center = apex for cones (a future knockback cone pushes away from the goliath, never toward the aim point), landing for circles
- `selectAttack` call site passes the real `row.basicCooldownUntilMicros` — the 05-01 `0n` bridge literal is deleted; the D5-08 basic gate is live
- `idleAttackRow` seeds `basicCooldownUntilMicros: 0n` so lazy upserts on the any-typed row literal cannot fail at runtime (Pitfall 5)
- `basicCooldownUntilMicros: t.u64().default(0n)` appended LAST to `unit_attack` (stunnedUntilMicros precedent); published to LOCAL as a plain additive migrate — migration plan showed one Created column, the pre-existing row survived with backfilled 0, post-migrate logs show "Database updated" with zero errors; NO maincloud interaction (self-host pivot)
- Bindings regenerated: `types.ts` + `unit_attack_table.ts` expose the new column

## Task Commits

1. **Task 1: Glue refactor — applier delegation, move gate, shape branch, cooldown split** - `a99e1c9`
2. **Task 2: Additive column + local migrate-publish + bindings regeneration** - `b79cfd1`

## Files Created/Modified
- `spacetimedb/src/unitAttacks.ts` - transition walk delegated to walkAttackTransitions; shape-branched resolveStrike; 5th selectAttack arg; idleAttackRow column (176 functional LOC — no unitStrike.ts extraction needed)
- `spacetimedb/src/index.ts` - one appended column + comment on `unit_attack` (5-line diff, nothing else touched)
- `src/module_bindings/types.ts` / `src/module_bindings/unit_attack_table.ts` - regenerated with basicCooldownUntilMicros

## Verification Evidence
- Quick suite green: 57/57 across attacks / attackHitbox / unitAttackFsm (serverSync deliberately excluded — owned by parallel plan 05-04, re-asserted at the 05-05 exclusive gate)
- `npx tsc --noEmit` in spacetimedb/ clean
- Determinism grep-gate clean: no `Math.random` / `Date.now` anywhere in spacetimedb/src
- Exactly one strike-path `goliathPosition.set` teleport, gated on `plan.teleportToLanding` (the second `.set` is the pre-existing WINDUP root-crouch, unchanged)
- `spacetime describe 2d-impact-game-fr9ti --json --server local` contains `basic_cooldown_until_micros`; `SELECT * FROM unit_attack` returned the surviving row with the column backfilled to 0; logs after the 16:05:44 migrate show no migration/insert errors (earlier ERROR lines are pre-migrate gameplay noise: login rejections + safe-zone guards from 10:35–12:50)

## Decisions Made
- Teleport target = `strikeSnapshot.landingX/Z`, not `plan.row` — after a chain swap the final row already carries the swirl's self-centered geometry; the leap landing belongs to the old attack
- Knockback center hoisted out of the victim loop (per-attack constant, cheaper and clearer)
- `ATTACK_STATE_STRIKE` / `ATTACK_STATE_RECOVERY` imports removed from the glue — no longer referenced after the applier delegation (no-dead-code rule)

## Deviations from Plan
None - plan executed exactly as written.

## Known Stubs
None — the swing's `knockback: 0` and swirl's inert min/maxBand are authored data with D5-xx citations, not stubs.

## Threat Flags
None — zero new reducers, zero new client-writable input; all changes are worldTick-internal + one additive column (matches the plan's threat model: T-05-01/02/06 all mitigated as specified).

## Issues Encountered
- `spacetime describe ... table unit_attack --json` does not inline column names (they live behind `product_type_ref` in the typespace) — verified via the full-database describe instead, which contains `basic_cooldown_until_micros`. The plan's per-table grep was adjusted accordingly; all other checks ran verbatim.

## User Setup Required
None - the local standalone server was already running; no maincloud, no new services.

## Next Phase Readiness
- The goliath kit is LIVE server-side: swing selectable in the 0..3.5 band, unconditional chain into swirl, 2.5s basic cooldown written at swirl's IDLE, planted swing strike
- Plan 05-04 (client telegraph SECTOR + rebuild-on-attackId) can render against the migrated schema; bindings already expose the new column
- Plan 05-05 owns the full build + serverSync re-assertion (pnpm build deliberately NOT run here)

## Self-Check: PASSED

- All 4 modified files present on disk
- Commits a99e1c9, b79cfd1 in git log
- 57/57 quick-suite tests green; spacetimedb tsc clean; determinism grep clean; migrated DB verified live
