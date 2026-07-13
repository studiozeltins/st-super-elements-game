---
phase: 03-pvp-crit
plan: 01
subsystem: combat
tags: [spacetimedb, pvp, crit, server-authoritative, event-table, damage-numbers]

# Dependency graph
requires:
  - phase: 02-server-authoritative-damage-crit-on-enemies
    provides: resolvePlayerHit composition (base -> crit via ctx.random -> clamp), enemy_hit event conventions (pre-branch full-amount insert, one-subscription rule), D2-03 skill window + D2-04 combo clamp
provides:
  - Intent-shaped attackPlayer reducer ({ targetIdentity, isSkill, comboCount }) — client-authored PVP damage arg deleted (CRIT-07 code-complete)
  - pvp_hit event table extended additively with attacker (Identity.zero() default) + isCrit (false default), carrying the FULL computed amount pre-branch
  - New 'pvpCrit' DamageKind (purple, 1.7x, '!' suffix) + spawnPlayerNumber game handle (identity-anchored number at a remote player's live position)
  - 3-way PVP number rendering — victim purple/pvpCrit, attacker non-crit suppression + crit upgrade, spectator crit/normal — from a single pvp_hit subscription
affects: [03-02 (deploy + two-client playtest), 07-crit-poise-interrupt]

# Tech tracking
tech-stack:
  added: []
  patterns: [intent-not-value reducer signature extended to PVP, additive .default() columns on an event table, identity-anchored event numbers (spawnPlayerNumber)]

key-files:
  created: []
  modified:
    - spacetimedb/src/index.ts
    - src/module_bindings/attack_player_reducer.ts
    - src/module_bindings/pvp_hit_table.ts
    - src/module_bindings/types.ts
    - src/game/createGame.ts
    - src/game/combat/damageKind.ts
    - src/game/systems/createDamageNumbers.ts
    - src/App.tsx

key-decisions:
  - "pvp_hit columns appended at END with .default() (attacker: Identity.zero(), isCrit: false) per additive-migrate rule — publish in Plan 03-02 is the migrate-acceptance test"
  - "resolvePlayerHit called with 'melee' and NO resistance profile (D3-03) — PVP resist tuning stays deferred"
  - "Attacker suppression lives in the App.tsx pvpHit onInsert callback (rangedAttack self-skip idiom), not in createDamageNumbers"
  - "Victim crit uses new purple 'pvpCrit' (same hue as 'pvp', 1.7x); attacker/spectator crits reuse the existing magenta 'crit' style"

patterns-established:
  - "PVP netting kind-set: any kind meaning 'PVP damage shown to the victim' must be in the spawnSelfNumber netting check ('pvp' AND 'pvpCrit')"
  - "spawnPlayerNumber: identity-anchored event number at remotePlayers.get(hex) live position; silently drops if the victim despawned"

requirements-completed: [CRIT-07]

coverage:
  - id: D1
    description: "attackPlayer is intent-only ({ targetIdentity, isSkill, comboCount }); server composes the hit via resolvePlayerHit; pvp_hit extended additively carrying full pre-branch amount; kill path byte-for-byte untouched"
    requirement: CRIT-07
    verification:
      - kind: other
        ref: "cd spacetimedb && spacetime build"
        status: pass
      - kind: unit
        ref: "pnpm test (475 tests incl. crit/damage/skillGate/serverSync INV-5 suites)"
        status: pass
      - kind: other
        ref: "grep gates: attackPlayer args exact, single pvpHit.insert pre-branch with amount, determinism gate clean, kill-path diff empty"
        status: pass
    human_judgment: false
  - id: D2
    description: "Client sends intent end-to-end: regenerated bindings, Network.sendAttackPlayer(target, isSkill, comboCount), applyPvpDamage threads isSkill (bow = false), App.tsx binding reworked; attacker's instant local display number kept (D3-05)"
    requirement: CRIT-07
    verification:
      - kind: other
        ref: "pnpm build && pnpm test (full suite green; PVP_MAX_HIT_RANGE gate textually unchanged)"
        status: pass
    human_judgment: false
  - id: D3
    description: "3-way PVP number rendering feels right live: victim purple/pvpCrit, attacker suppression + crit upgrade at the victim's live position, spectator numbers, no double-draw"
    requirement: CRIT-07
    verification:
      - kind: unit
        ref: "grep gates: tables.pvpHit subscribed exactly once; pvpCrit in union/style/label/netting; branch structure asserted"
        status: pass
    human_judgment: true
    rationale: "Visual/feel verification requires the two-client migrated-DB playtest scheduled as Plan 03-02's UAT — rendering behavior cannot be asserted by the unit suite"

# Metrics
duration: 6min
completed: 2026-07-09
status: complete
---

# Phase 3 Plan 01: PVP crit Summary

**Server-authoritative PVP damage + crit: attackPlayer takes intent only, resolvePlayerHit composes the hit, extended pvp_hit event drives truthful victim/attacker/spectator numbers**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-09T06:30:15Z
- **Completed:** 2026-07-09T06:36:15Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Closed the last client-authored damage value in the game (T-03-01): `attackPlayer` now accepts `{ targetIdentity, isSkill, comboCount }` and composes the hit server-side via `resolvePlayerHit` (base → × crit via `ctx.random` → clamp), with the D2-04 combo clamp applied and no resistance profile (D3-03).
- `pvp_hit` extended additively (`attacker` + `isCrit` appended at END with `.default()`), inserted PRE-branch with the FULL computed amount (D3-02) — killing blows float full hit strength; HP application still uses `dealt = min(amount, currentHealth)` and the kill path (gem spill → shard theft → respawn, incl. the [A1] shard-conservation block) is byte-for-byte untouched (SC3).
- 3-way client rendering from a single `pvp_hit` subscription: victim floats purple `pvp`/`pvpCrit` (1.7x, '!'), the attacker suppresses its own non-crit echo and upgrades to magenta `'crit'` at the victim's live position via the new `spawnPlayerNumber` handle, spectators render `crit`/`normal` (D3-05, D2-02).
- `spawnSelfNumber` netting extended to cover both `'pvp'` and `'pvpCrit'` so `syncMyServerRow` never re-floats a received PVP crit as a phantom red taken number.

## Task Commits

Each task was committed atomically:

1. **Task 1: Server — extend pvp_hit + rework attackPlayer to intent + resolvePlayerHit** - `67bbfaa` (feat)
2. **Task 2: Client intent plumbing — regenerated bindings, sendAttackPlayer end-to-end** - `db31ddf` (feat)
3. **Task 3: Client rendering — pvpCrit kind, spawnPlayerNumber, single-subscription 3-way branch, netting guard** - `4d48373` (feat)

## Files Created/Modified

- `spacetimedb/src/index.ts` - pvp_hit table +2 columns; attackPlayer intent args + resolvePlayerHit swap (guards + kill path untouched)
- `src/module_bindings/{attack_player_reducer,pvp_hit_table,types}.ts` - regenerated via `pnpm run spacetime:generate` (never hand-edited)
- `src/game/createGame.ts` - intent-shaped Network.sendAttackPlayer, applyPvpDamage isSkill threading, spawnPlayerNumber handle, pvp/pvpCrit netting
- `src/game/combat/damageKind.ts` - 'pvpCrit' union member + style (`#c07dff`, 1.7)
- `src/game/systems/createDamageNumbers.ts` - '!' suffix extended to pvpCrit
- `src/App.tsx` - pvp_hit removed from manual subscribe list; 3-way onInsert branch; intent reducer binding

## Decisions Made

None beyond plan-locked decisions (D3-01..D3-06 followed as specified). Discretion points resolved per PATTERNS excerpts: suppression in App.tsx callback; victim crit gets the distinct purple `pvpCrit` variant.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Cleanup-Todo Candidates (flagged, out of scope)

- `skillCast` / `rangedAttack` / `healEvent` are still double-subscribed (manual list + useTable) — pre-existing violation of the one-subscription rule, explicitly out of scope per plan Task 3 step 5; candidate for a cleanup slice.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CRIT-07 code-complete; deploy (local publish → migrate-acceptance of the event-table `.default()` columns) and the two-client migrated-DB playtest happen in Plan 03-02.
- `spacetime build`, `pnpm build`, and the full suite (475 tests incl. serverSync INV-5 parity) all green; determinism grep-gate clean.

## Self-Check: PASSED

- All 6 key modified files exist on disk.
- All 3 task commits (`67bbfaa`, `db31ddf`, `4d48373`) exist in git log.
- All task acceptance criteria re-verified PASS (grep gates logged during execution).
- Plan-level verification: module build green, pnpm build + 475 tests green, kill-path diff empty, determinism gate clean, `tables.pvpHit` subscribed exactly once.

---
*Phase: 03-pvp-crit*
*Completed: 2026-07-09*
