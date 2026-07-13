---
phase: 02-server-authoritative-damage-crit-on-enemies
plan: 03
subsystem: ui
tags: [three.js, spacetimedb, damage-numbers, crit, event-table]

# Dependency graph
requires:
  - phase: 02-server-authoritative-damage-crit-on-enemies (plans 02-01/02-02)
    provides: "server enemy_hit event table (attacker, positionX, positionZ, amount, isCrit); reducers take isSkill intent not damage; client crit roll deleted; bindings regenerated"
provides:
  - "Event-only damage-number rendering: EVERY enemy_hit (own and others') floats one number at the enemy's exact position, colored by the server's authoritative isCrit"
  - "enemy_hit emitted for FATAL hits too — killing blows show the full computed hit strength (ARPG-style)"
  - "Server HP-delta number spawn removed; enemy/goliath health-bar reveal preserved via lastDamagedAt"
  - "Crit numbers restyled vivid magenta (#ff2bd6)"
  - "Additive schema live on LOCAL (player.skill_ready_at_micros + skill_window_ends_at_micros, enemy_hit table) with no data wipe; MAINCLOUD publish deliberately deferred"
affects: [raid-boss, balance, future combat-vfx phases]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Event-only combat numbers: one server event row = one rendered number; no client-side prediction or crit decision (enemy_hit.isCrit is the sole cosmetic-crit truth)"
    - "Event tables must appear in exactly ONE client subscription: useTable opens its own subscription, so an event table listed in the manual .subscribe([...]) list too gets delivered twice and fires onInsert twice (double-draw)"
    - "Emit event rows BEFORE the fatal/survivor branch so killing blows broadcast like any other hit"

key-files:
  created: []
  modified:
    - src/App.tsx
    - src/game/createGame.ts
    - src/game/systems/createDamageNumbers.ts
    - src/game/systems/createEnemyRenderer.ts
    - src/game/systems/createGoliathRenderer.ts
    - src/game/systems/__tests__/entityRenderers.test.ts
    - src/game/combat/damageKind.ts
    - spacetimedb/src/index.ts

key-decisions:
  - "Dropped the plan's predict-then-promote design after playtest: player-anchored predicted numbers floated from the PLAYER, not the enemy hit. All numbers (own included) now render from the enemy_hit event at the enemy's position — on LAN the round-trip delay is imperceptible and the codepath is one instead of three."
  - "Killing blows show the FULL computed hit amount (MAX_HIT_DAMAGE-clamped), not the sliver of HP remaining — ARPG standard, shows true hit strength."
  - "Crit color changed from yellow #ffcc33 to vivid magenta #ff2bd6 for readability against the frost UI."
  - "MAINCLOUD publish deliberately deferred to a user-facing prod point (STATE ops invariant) — only LOCAL was migrated this plan."

patterns-established:
  - "Event-only rendering for combat feedback (server event = single source of number truth)."
  - "One-subscription rule for event tables (double subscription = double onInsert)."

requirements-completed: [CRIT-02, CRIT-04, CRIT-05, CRIT-06]

coverage:
  - id: D1
    description: "Every enemy_hit — own and other players' — renders exactly one number at the enemy's position, colored by server isCrit (no client crit roll)"
    requirement: CRIT-04
    verification:
      - kind: manual_procedural
        ref: "live playtest on migrated LOCAL DB — user confirmed single number per hit, on the enemy, crit color from server"
        status: pass
    human_judgment: true
    rationale: "One-number-per-hit and number placement are visual frame-level properties verified by human playtest; no unit test asserts render output."
  - id: D2
    description: "Server HP-delta number spawn removed; enemy/goliath health-bar reveal preserved"
    requirement: CRIT-04
    verification:
      - kind: unit
        ref: "src/game/systems/__tests__/entityRenderers.test.ts + createEntityRenderer.test.ts onHealthDrop/lastDamagedAt coverage (pnpm test, 475 passed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Per-character crit divergence visible (high-crit dps vs low-crit tank) driven by authoritative isCrit"
    requirement: CRIT-02
    verification:
      - kind: manual_procedural
        ref: "two-client migrated-DB playtest — user confirmed crit divergence (e.g. vesper 0.36 vs glacia 0.10)"
        status: pass
    human_judgment: true
    rationale: "Crit frequency divergence is a statistical visual observation over live play; not assertable deterministically."
  - id: D4
    description: "Migrated (not fresh) DB carries the new state: enemy_hit rows fire on landed hits, skillReadyAtMicros/skillWindowEndsAtMicros non-zero after a skill cast, late long-skill hits still skill-scaled"
    requirement: CRIT-06
    verification:
      - kind: manual_procedural
        ref: "additive spacetime publish to LOCAL (no wipe) + live playtest — user confirmed migrated-DB state and late-skill-scaling"
        status: pass
    human_judgment: true
    rationale: "Migrated-DB behavior requires a live engage against the running module; confirmed by human playtest."
  - id: D5
    description: "Killing blows float a damage number (fatal hits emit enemy_hit with the full computed amount)"
    requirement: CRIT-04
    verification:
      - kind: manual_procedural
        ref: "kill an enemy → number shows (final human re-check; code inspection: insert moved before the remaining>0 branch in all 4 hit paths)"
        status: pass
    human_judgment: true
    rationale: "Kill-hit rendering is a live visual check; automated suite (475 tests) covers the damage math, not the event emission."

# Metrics
duration: ~2h (including 3 playtest-fix iterations)
completed: 2026-07-08
status: complete
---

# Phase 2 Plan 3: Client Crit Rendering + Deploy Summary

**Event-only damage numbers: every server `enemy_hit` — own hits, other players' hits, and killing blows — floats exactly one magenta-crit-capable number at the enemy's exact position, with the additive schema migrated to LOCAL and no data wipe.**

## Performance

- **Duration:** ~2h (3 playtest-fix iterations at the human checkpoint)
- **Completed:** 2026-07-08
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint) + 3 checkpoint-driven fixes
- **Files modified:** 8

## Accomplishments
- `tables.enemyHit` wired on the client: a single `useTable` `onInsert` renders EVERY hit (own and others') via `Game.spawnWorldNumber(positionX, positionZ, amount, isCrit ? 'crit' : 'normal')` — the server's `isCrit` is the sole crit truth (CRIT-04/CRIT-05).
- Killing blows now float a number: `enemy_hit` is emitted unconditionally after `resolvePlayerHit` in all four server hit paths (attackEnemies + attackRay, enemy + goliath), showing the full computed hit strength.
- Removed the legacy server HP-delta number spawn from the enemy/goliath renderers while preserving the health-bar reveal (`lastDamagedAt` set independently in `createEntityRenderer`); dropped the dead `onHealthDrop` wrapper params.
- Crit numbers restyled to vivid magenta `#ff2bd6` (from yellow) for readability.
- Deployed additively to LOCAL (migrate, no wipe): `player.skill_ready_at_micros` + `player.skill_window_ends_at_micros` (default 0) and the public `enemy_hit` event table; world sim re-activated (30 enemies, 3 goliaths). Reducer-only follow-up republished as a hot-swap (empty migration plan).
- Human playtest on the migrated DB confirmed: per-character crit divergence (CRIT-02), single number per hit at the enemy's position, migrated-DB `enemy_hit` + `skillReadyAt` state, late long-skill hits still skill-scaled, and no visual regression (CRIT-04, CRIT-06).

## Task Commits

1. **Task 1: Promotable numbers + own-hit local prediction** - `95a7cf7` (feat) — superseded by `a47b8e7`
2. **Task 2: enemy_hit subscription + double-draw suppression** - `97d1411` (feat)
3. **Task 3 checkpoint fix: numbers on the ENEMY, not the player** - `a47b8e7` (fix) — removed the predict/promote path entirely
4. **Task 3 checkpoint fix: double-drawn number root cause** - `9ab5a3f` (fix) — removed the redundant event-table subscription
5. **Task 3 restyle: magenta crits** - `a3ea19b` (style)
6. **Task 3 checkpoint fix: killing blows float a number** - `e368fda` (fix)

## Files Created/Modified
- `src/App.tsx` - `enemy_hit` `useTable` `onInsert` renders all hits; `tables.enemyHit` kept OUT of the manual subscribe list (event-table one-subscription rule).
- `src/game/createGame.ts` - Added `Game.spawnWorldNumber`; removed the HP-delta number callbacks.
- `src/game/systems/createDamageNumbers.ts` - Unchanged API in the end (`spawn` returns void; the interim promote/handle mechanism was added then fully removed).
- `src/game/systems/createEnemyRenderer.ts` / `createGoliathRenderer.ts` - Dropped the dead `onHealthDrop` param.
- `src/game/systems/__tests__/entityRenderers.test.ts` - Updated constructor signatures.
- `src/game/combat/damageKind.ts` - Crit `cssColor` → `#ff2bd6`.
- `spacetimedb/src/index.ts` - `enemy_hit` insert moved before the `remaining > 0` branch in all four hit paths (fatal hits emit too).

## Decisions Made
- **Abandoned predict-then-promote (plan design) for event-only rendering:** the local prediction was anchored to the player, so own numbers (incl. crits) floated from the character instead of the enemy hit. Rendering every hit from the server event puts numbers on the correct enemy; the LAN round-trip delay is imperceptible and one codepath replaces three (predict, promote, fallback).
- **Fatal-hit amount = full computed damage** (MAX_HIT_DAMAGE-clamped, same value survivors show) rather than remaining-HP-clamped — ARPG standard, shows true hit strength.
- **Magenta crit color** — user-requested restyle during the checkpoint.

## Deviations from Plan

**1. [Directed — orchestrator override] MAINCLOUD publish skipped**
- **Found during:** Task 3 (deploy)
- **Issue:** Task 3 as written required publishing to BOTH local and maincloud; the coordinator constrained deploy to LOCAL only, deferring maincloud to a user-facing prod point (STATE ops invariant).
- **Fix:** Additive migrate to LOCAL only (no `--delete-data`); maincloud untouched and tracked as outstanding.
- **Verification:** Migration plan showed additive columns + `enemy_hit` table, no wipe; accounts intact; playtest passed.

**2. [Rule 1 - Bug, checkpoint-found] Own numbers floated from the player, not the enemy**
- **Found during:** Task 3 playtest
- **Issue:** The plan's predict-then-promote design anchored predicted numbers at the player/hit-center, so own hits (incl. crits) rose from the character — you couldn't tell which enemy took the crit.
- **Fix:** Removed the predict/promote machinery entirely (`lastOwnPredicted`, `upgradeOwnCritNumber`, `promote()`, handle/token); every `enemy_hit` renders at the event's enemy position.
- **Files modified:** src/App.tsx, src/game/createGame.ts, src/game/systems/createDamageNumbers.ts
- **Verification:** pnpm build + test green; user confirmed numbers now come from the enemy.
- **Committed in:** `a47b8e7`

**3. [Rule 1 - Bug, checkpoint-found] One hit drew TWO numbers**
- **Found during:** Task 3 re-test
- **Issue:** `enemy_hit` (an EVENT table) was in BOTH the manual `.subscribe([...])` list AND its own `useTable` — the SDK's `useTable` opens its own subscription, and event rows fire `onInsert` once per matching subscription delivery (cached tables dedupe; event tables don't). Two deliveries → two spawns ~0.16u apart.
- **Fix:** Removed `tables.enemyHit` from the manual subscribe list; documented the one-subscription rule for event tables.
- **Files modified:** src/App.tsx
- **Verification:** pnpm build + test green; user confirmed single number per hit.
- **Committed in:** `9ab5a3f`

**4. [Rule 1 - Bug, checkpoint-found, pre-existing] Killing blow showed no number**
- **Found during:** Task 3 re-test
- **Issue:** All four server `enemy_hit` inserts sat inside the `remaining > 0` survivor branch — a fatal hit never emitted a row.
- **Fix:** Emit `enemy_hit` unconditionally after `resolvePlayerHit` in attackEnemies + attackRay (enemy + goliath paths), amount = full computed hit; republished LOCAL (reducer-only hot-swap, empty migration plan).
- **Files modified:** spacetimedb/src/index.ts
- **Verification:** pnpm build + test green; LOCAL republish clean.
- **Committed in:** `e368fda`

**5. [User-requested restyle] Crit color yellow → magenta** — `a3ea19b` (style), bundled at the checkpoint.

---

**Total deviations:** 5 (1 directed deploy-scope change, 3 checkpoint-found bug fixes, 1 restyle)
**Impact on plan:** The plan's predict-then-promote design was replaced by simpler event-only rendering after live verification — all four phase requirements still met. No scope creep beyond the user-requested color.

## Issues Encountered
- The two-client playtest surfaced three rendering bugs the automated suite could not catch (number anchor position, event-table double-subscription, missing fatal-hit emission) — each root-caused and fixed at the checkpoint rather than patched. The double-subscription mechanism matched the `pull_result` behavior already documented in App.tsx.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 2 is complete end-to-end on LOCAL: server-authoritative damage + crit, event-driven rendering, migrated-DB verified.
- **OUTSTANDING: MAINCLOUD additive publish is deferred.** Before this ships to prod, run `spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb --server maincloud --yes` (additive migrate — NEVER `--delete-data`; the `.default(0)` columns backfill real-account rows safely), then confirm logins survive. `init` only runs on a fresh DB, so the new state appears on the migrated maincloud DB after a real engage.

## Self-Check: PASSED

- All 6 commits verified in git log: `95a7cf7`, `97d1411`, `a47b8e7`, `9ab5a3f`, `a3ea19b`, `e368fda`
- All modified files exist on disk
- `pnpm build` green; `pnpm test` 475/475 passed (final state)

---
*Phase: 02-server-authoritative-damage-crit-on-enemies*
*Completed: 2026-07-08*
