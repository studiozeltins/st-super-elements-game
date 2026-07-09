---
phase: 04-attack-state-machine-leapslam-end-to-end-delete-goliath-drai
plan: 03
subsystem: server-combat
tags: [attack-fsm, worldtick-wiring, contact-drain-deletion, additive-migrate, bindings]
requires:
  - 04-01 pure modules (attacks/unitAttackFsm/attackHitbox)
  - 04-02 schema (unit_attack, attack_strike, player.stunnedUntilMicros) + runUnitAttacks glue
provides:
  - runUnitAttacks wired into worldTick between the position-build passes and every damage consumer (FSM-01)
  - goliath-to-player contact drain (pass 4b) + GOLIATH_PLAYER_CONTACT_RANGE DELETED (ATK-05)
  - spacetimedb/src/worldRules.ts — pure shared world predicates (clampToWorld, isInsideSafeZone, aggroExpired)
  - local DB migrated additively; unit_attack/attack_strike live and queryable (FSM-06)
  - src/module_bindings regenerated with unit_attack + attack_strike types
affects:
  - 04-04+ client (telegraph/animation/VFX build against the new bindings)
  - 04-07 (maincloud publish repeats this deploy chain)
tech-stack:
  added: []
  patterns:
    - entry-file export discipline — SpacetimeDB module entry may export ONLY spacetime exports; shared helpers live in pure sibling modules
    - parity test scans multiple server source files (index.ts + worldRules.ts)
key-files:
  created:
    - spacetimedb/src/worldRules.ts
    - src/module_bindings/unit_attack_table.ts
    - src/module_bindings/attack_strike_table.ts
  modified:
    - spacetimedb/src/index.ts
    - spacetimedb/src/unitAttacks.ts
    - spacetimedb/tsconfig.json
    - src/game/data/__tests__/serverSync.test.ts
    - src/module_bindings/index.ts
    - src/module_bindings/player_table.ts
    - src/module_bindings/types.ts
decisions:
  - "SpacetimeDB rejects plain function exports from the module entry file ('exporting something that is not a spacetime export') — the 04-02 pattern of exporting index.ts helpers for sibling imports is INVALID at publish time; shared helpers must live in pure sibling modules (worldRules.ts created)"
  - "serverSync parity extractor now scans index.ts + worldRules.ts concatenated — constants carved out of index.ts stay parity-asserted (INV-5)"
metrics:
  duration: ~12min
  completed: 2026-07-09
status: complete
---

# Phase 04 Plan 03: Wire the FSM, Delete the Drain, Deploy Local Summary

runUnitAttacks now runs every worldTick in the mandated slot (after position-build, before every damage consumer) with the goliath-to-player contact drain deleted in the same commit — verified live on the migrated local DB, where a real goliath row reached STRIKE state with a locked leapSlam landing minutes after publish.

## What Was Built

### Task 1 — Wiring + drain deletion (FSM-01, ATK-05)
- **Hoist:** `const playerDamage = new Map<string, number>()` moved from pass 4 up to just after pass 2, above the new call — strike damage and enemy bites accumulate into ONE map consumed by the single apply loop (resist 'contact' → death → spill → respawn), unchanged.
- **Call:** `runUnitAttacks(ctx, now, tick, goliaths, goliathPosition, goliathHeading, playerByHex, playerDamage)` inserted after pass 2 and before pass 3 — position maps fully built before the FSM overrides them (root/leap, D4-12), and every damage consumer runs after.
- **Deletion (ATK-05):** pass 4b ("provoked goliath hammers the player") removed whole, plus the orphaned `GOLIATH_PLAYER_CONTACT_RANGE` constant. Pass 3 (camp raid) and pass 4 (enemy bites) byte-for-byte untouched — git diff hunks touch only the five intended seams.
- tsconfig include dropped `src/unitAttacks.ts` (index.ts now imports it — the 04-02 stopgap check-root is dead config).

### Task 2 — Deploy chain (FSM-06)
- `spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb --server local --yes` → **additive migrate accepted on the populated DB**: created `player.stunned_until_micros` (default 0), created `unit_attack` + `attack_strike`. "Updated database" — no wipe, no `--delete-data`.
- `pnpm run spacetime:generate` → bindings gained `unit_attack_table.ts`, `attack_strike_table.ts`, updated player/types/index.
- `pnpm build` exit 0; `pnpm test` 510/510 green.
- DB probes: `SELECT * FROM unit_attack` returned **live FSM rows** — goliath 900002 mid-cycle in state 2 with a locked leapSlam landing (radius 5.5, the size-2 value); `attack_strike` queryable (empty — event table). Lazy upsert on a migrated DB confirmed working, exceeding the "table exists, empty until engage" bar.
- `spacetime logs -n 50` after 10+s of tick activity: INFO migrate lines only, zero errors/panics.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] SpacetimeDB rejected the module's plain entry-file exports**
- **Found during:** Task 2 (first publish attempt)
- **Issue:** Pre-publish check failed 500: "exporting something that is not a spacetime export" — the `export function clampToWorld/isInsideSafeZone/aggroExpired` added to index.ts in 04-02 (for the unitAttacks import) compile fine but are rejected by the STDB module-hooks validator. The circular index ↔ unitAttacks import also warned at build.
- **Fix:** created pure `spacetimedb/src/worldRules.ts` holding the three helpers plus their two constants (`MOVEMENT_LIMIT`, `SAFE_ZONE_RADIUS` — used nowhere else); index.ts and unitAttacks.ts both import it. No plain exports remain on the entry file; circular dependency gone.
- **Files modified:** spacetimedb/src/worldRules.ts (new), spacetimedb/src/index.ts, spacetimedb/src/unitAttacks.ts
- **Commit:** 9b40166

**2. [Rule 1 - Bug] serverSync parity test broken by the constant carve-out**
- **Found during:** Task 2 verification (`pnpm test` after publish)
- **Issue:** `SAFE_ZONE_RADIUS matches` failed — the regex extractor reads only `spacetimedb/src/index.ts`, and the constant moved to worldRules.ts.
- **Fix:** `SERVER_SOURCE` now concatenates index.ts + worldRules.ts, keeping the INV-5 parity assertion live instead of deleting it.
- **Files modified:** src/game/data/__tests__/serverSync.test.ts
- **Commit:** 9b40166

**3. [Rule 3 - Blocking, planned-adjacent] tsconfig check-root cleanup**
- The 04-02 stopgap include entry `"src/unitAttacks.ts"` removed now that index.ts imports the module (flagged as "removable once Plan 03 wires the import" in the 04-02 summary; no-legacy-code rule).
- **Commit:** 102c10d

## Verification Results

- `grep -c "runUnitAttacks(" spacetimedb/src/index.ts` → 1 (call at the mandated slot, textually before the pass-3 comment); import on its own line
- `grep -c "GOLIATH_PLAYER_CONTACT_RANGE" spacetimedb/src/index.ts` → 0
- `const playerDamage` (line ~3190) appears before the call (~3199)
- `pnpm exec tsc --noEmit -p spacetimedb` → exit 0; `pnpm build` → exit 0; `pnpm test` → **510/510 green**
- `grep -rn "Math.random\|Date.now" spacetimedb/src` → empty
- Publish output: "Database Migration Plan … Created column … Created user table attack_strike … unit_attack … Updated database" (additive, populated DB, no wipe)
- `spacetime sql … unit_attack/attack_strike --server local` → both exit 0; unit_attack already holds live FSM rows
- `grep -ril "unit_attack" src/module_bindings` → matches (index.ts + unit_attack_table.ts)
- Server logs post-migrate: no error/panic entries

## Commits

| Task | Type | Hash | Description |
|------|------|------|-------------|
| 1 | feat | 102c10d | wire runUnitAttacks into worldTick, delete goliath-to-player contact drain |
| 2 (fix) | fix | 9b40166 | carve worldRules.ts out of index.ts — STDB rejects plain entry-file exports |
| 2 | chore | d53796e | regenerate module bindings after additive local publish |

## Known Stubs

None — no placeholder branches or empty-wired data; the FSM is live end-to-end on the server side (client rendering is Waves 4-6 by design).

## Threat Flags

None beyond the plan's threat model. T-04-07 (destructive publish) mitigated as planned: additive migrate only, no delete-data flag, publish accepted first try post-fix. No new client-callable surface.

## Notes for Later Plans

- **Maincloud publish (Plan 07) will hit the same disconnect:** the migrate warns "All clients will be disconnected due to breaking schema changes" — schedule the prod publish accordingly.
- **Pattern lock for all future server work:** never `export` a plain helper from `spacetimedb/src/index.ts` — the publish-time validator rejects it even though tsc passes. Shared helpers go in pure sibling modules (worldRules.ts is the new home for world-bound/safe-zone/aggro predicates).

## Self-Check: PASSED

- spacetimedb/src/worldRules.ts, src/module_bindings/unit_attack_table.ts, src/module_bindings/attack_strike_table.ts exist on disk
- Commits 102c10d, 9b40166, d53796e verified in git log
- 510/510 tests + build re-confirmed green after final edits
