---
phase: 02-server-authoritative-damage-crit-on-enemies
plan: 02
subsystem: api
tags: [spacetimedb, reducer, crit, anti-cheat, ctx-random, combat, determinism]

# Dependency graph
requires:
  - phase: 02-server-authoritative-damage-crit-on-enemies (plan 01)
    provides: "damage.ts (CHARACTER_COMBAT, computeBaseDamage, transcendDamageMultiplier), crit.ts (rollCrit), skillGate.ts (skillGrantActive, nextSkillReadyAt) — the zero-import pure foundations"
provides:
  - "Server-authoritative base damage + crit roll for enemy/goliath hits (attackEnemies/attackRay compute the number; client sends only intent)"
  - "enemy_hit event table carrying attacker + position + post-clamp amount + authoritative isCrit"
  - "player.skillReadyAtMicros + skillWindowEndsAtMicros state and a cooldown-gated castSkill (authoritative skill rate-limiter)"
  - "resolvePlayerHit glue helper composing base -> crit -> resist -> clamp"
affects: [02-03 (crit number visual + local prediction consumes enemy_hit), phase-3-pvp, phase-7-raid-boss]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ctx-injected determinism: crit roll uses () => ctx.random() thunk into pure rollCrit; skill window uses ctx.timestamp — no Math.random/Date.now in spacetimedb/src"
    - "Intent-not-value reducer signatures: client sends isSkill + comboCount, server owns the damage number (closes the spoof surface)"
    - "Additive .default(0n) migrate columns appended at end of table for wipe-free deploy to populated maincloud"

key-files:
  created: [src/module_bindings/enemy_hit_table.ts]
  modified:
    - spacetimedb/src/index.ts
    - src/game/createGame.ts
    - src/App.tsx
    - src/module_bindings

key-decisions:
  - "SKILL_HIT_WINDOW_MICROS = 5_000_000n (5s) — RESEARCH Open Q1 recommended range, spans longest skill animation+travel"
  - "enemy_hit inserted only on a SURVIVING hit (plan action text); kills keep the existing HP-delta/loot path unchanged this slice"
  - "MAX_HIT_DAMAGE stays 400 — no regression; now also bounds legit crits (raising it is a deferred tuning follow-up, RESEARCH Pitfall 1/A5)"
  - "resolvePlayerHit rolls crit per target (each enemy in a radius gets its own roll) — correct and acceptable per plan"

patterns-established:
  - "resolvePlayerHit(ctx, hitter, isSkill, combo, dmgType, profile?) is the single server damage-resolution seam; both melee (attackEnemies) and ranged (attackRay) route through it"
  - "castSkill is the authoritative cooldown gate: reject if now < skillReadyAtMicros, else arm cooldown+window from server CHARACTER_COMBAT BEFORE emitting skill_cast"

requirements-completed: [CRIT-02, CRIT-05, CRIT-06]

coverage:
  - id: D1
    description: "attackEnemies/attackRay drop the client damage arg, take isSkill+comboCount; server computes base via computeBaseDamage from CHARACTER_COMBAT (CRIT-06)"
    requirement: "CRIT-06"
    verification:
      - kind: unit
        ref: "src/game/data/__tests__/serverSync.test.ts (139 tests — CHARACTER_COMBAT/CHARACTER_STATS client<->server parity)"
        status: pass
      - kind: integration
        ref: "pnpm build (tsc rejects App.tsx if regenerated attackEnemies/attackRay binding still expected `damage`)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Crit decided server-side via rollCrit(critRate, critDmg, () => ctx.random()); client rollDamage/CRIT_CHANCE/CRIT_MULTIPLIER deleted (CRIT-02)"
    requirement: "CRIT-02"
    verification:
      - kind: unit
        ref: "src/game/data/__tests__/crit.test.ts (5 tests — rollCrit decision + multiplier)"
        status: pass
      - kind: other
        ref: "grep gate: ! grep -REn 'rollDamage|CRIT_CHANCE|CRIT_MULTIPLIER' src/game/createGame.ts && ! grep -rEn 'Math.random|Date.now' spacetimedb/src"
        status: pass
    human_judgment: false
  - id: D3
    description: "enemy_hit event emitted per surviving enemy/goliath hit with authoritative {amount, isCrit} (CRIT-05)"
    requirement: "CRIT-05"
    verification:
      - kind: integration
        ref: "spacetime generate wrote enemy_hit_table.ts + registered in schema; module build finished successfully"
        status: pass
    human_judgment: true
    rationale: "The end-to-end float of the authoritative number lands in Plan 03; the runtime insert-per-hit path is best confirmed by a two-client playtest there. This slice only proves the table+emit compile and register."
  - id: D4
    description: "castSkill rejects on-cooldown casts and arms skillReadyAt + hit window; isSkill hit gets the uncapped skill multiplier only inside SKILL_HIT_WINDOW_MICROS (D2-03/SC4), combo clamped to MAX_COMBO_FOR_GEMS (D2-04)"
    verification:
      - kind: unit
        ref: "src/game/data/__tests__/skillGate.test.ts (6 tests — skillGrantActive window + nextSkillReadyAt)"
        status: pass
    human_judgment: true
    rationale: "The gate composition (early-return before skill_cast, window feeding resolvePlayerHit) is wired in the reducer but the runtime cooldown-rejection behavior needs a live cast to observe end-to-end; unit tests only cover the pure gate math."

# Metrics
duration: ~20min
completed: 2026-07-08
status: complete
---

# Phase 02 Plan 02: Server-Authoritative Damage + Crit Summary

**The atomic anti-cheat slice — attackEnemies/attackRay now take intent (isSkill+comboCount) not a damage number, the server computes base via computeBaseDamage and rolls crit via ctx.random, a cooldown-gated castSkill owns the skill multiplier window, and the client crit roll is deleted — all landing together so the build never half-migrates.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-08
- **Tasks:** 2
- **Files modified:** 4 (+ regenerated bindings)

## Accomplishments
- Closed the damage-spoof (CRIT-06) and crit-spoof (CRIT-02) holes: `attackEnemies`/`attackRay` no longer accept a client-authored `damage` number or an implicit client crit decision — the server owns both via `resolvePlayerHit` (composes `computeBaseDamage` × `rollCrit(ctx.random)` × `resistedDamage` × `MAX_HIT_DAMAGE`).
- `castSkill` became the authoritative skill rate-limiter: rejects a cast while `now < skillReadyAtMicros` (no `skill_cast` emitted), else arms the cooldown (from server `CHARACTER_COMBAT`, never the client `skillId`) and a 5s hit window; an `isSkill` hit earns the uncapped skill multiplier only inside that window.
- Added `enemy_hit` event table (attacker + position + post-clamp amount + authoritative isCrit) emitted per surviving hit; added `player.skillReadyAtMicros` + `skillWindowEndsAtMicros` as `.default(0n)` additive columns.
- Deleted the client crit roll (`rollDamage`/`CRIT_CHANCE`/`CRIT_MULTIPLIER`); client now sends intent and treats its local number as a display-only `'normal'` hit until Plan 03 floats the authoritative number.

## Reducer signature change (before → after)

- `attackEnemies(centerX, centerZ, radius, damage: u32, comboCount)` → `attackEnemies(centerX, centerZ, radius, isSkill: bool, comboCount)`
- `attackRay(originX, originZ, dirX, dirZ, range, hitRadius, damage: u32, comboCount)` → `attackRay(originX, originZ, dirX, dirZ, range, hitRadius, isSkill: bool, comboCount)`

## Task Commits

1. **Task 1: Server rework — enemy_hit table, skill state + gated castSkill, resolvePlayerHit, attackEnemies/attackRay intent; regenerate bindings** — `06c4013` (feat)
2. **Task 2: Client intent send — drop damage, add isSkill, delete client crit roll; keep build green** — `940e434` (feat)

## Files Created/Modified
- `spacetimedb/src/index.ts` — enemy_hit table + schema reg; player skill-window columns; gated castSkill; resolvePlayerHit glue; attackEnemies/attackRay reworked to intent; restore/seed/bot inserts backfill 0n
- `src/game/createGame.ts` — Network interface isSkill signatures; dealDamage threads isSkill; deleted rollDamage/CRIT_CHANCE/CRIT_MULTIPLIER; performAttack display-only 'normal'
- `src/App.tsx` — attackEnemies/attackRay bindings drop `damage`, add `isSkill`
- `src/module_bindings/` — regenerated (new enemy_hit_table.ts, updated attack reducers + player table)

## Decisions Made
- See `key-decisions` in frontmatter: 5s skill window, enemy_hit on surviving hits only, MAX_HIT_DAMAGE kept at 400 (bounds legit crits — deferred tuning), per-target crit roll.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] restorePlayers insert missing the two new skill-window columns**
- **Found during:** Task 1 (bindings regen / module type-check)
- **Issue:** `.default(0n)` does NOT make a column optional in the SpacetimeDB TS insert type — the module build failed on `restorePlayers`' `ctx.db.player.insert({ ...row, ... })` missing `skillReadyAtMicros`/`skillWindowEndsAtMicros` (RestorePlayerRow, a backup shape, has no such fields).
- **Fix:** Backfill `skillReadyAtMicros: 0n, skillWindowEndsAtMicros: 0n` in the restorePlayers insert (a restored player simply starts off-cooldown). The plan already had me add them to seedPlayer + debugSpawnBots; this third insert site surfaced only at compile time.
- **Files modified:** spacetimedb/src/index.ts
- **Verification:** `pnpm run spacetime:generate` then succeeds; module build finished successfully.
- **Committed in:** `06c4013` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for the module to compile against the new additive columns. No scope creep — same 0n backfill pattern the plan specified for the other insert sites.

## Issues Encountered
- The `spacetime build` CLI on this machine rejects `--project-path`; built by `cd spacetimedb && spacetime build` instead (the `spacetime:generate` npm script already compiles the module during codegen). No functional impact.

## User Setup Required
None — additive migrate (both new columns `.default(0n)`); no maincloud publish performed (per runtime constraints, local-only if needed). No external service configuration.

## Verification Results
- `pnpm run spacetime:generate` — bindings regenerated (enemy_hit_table.ts written; attackEnemies/attackRay take isSkill+comboCount, no `damage`).
- Determinism grep over `spacetimedb/src` — CLEAN (only `ctx.random`/`ctx.timestamp`; no Math.random/Date.now).
- `src/game/data/__tests__/serverSync.test.ts` — 139/139 pass (client↔server combat-data parity).
- Client crit-roll deletion grep — CLEAN (no rollDamage/CRIT_CHANCE/CRIT_MULTIPLIER in createGame.ts).
- `pnpm build` — green (tsc is the load-bearing proof the binding dropped `damage`).
- `pnpm test` — 475/475 pass (29 files).
- `spacetime build` (server module) — Build finished successfully.

## Next Phase Readiness
- Plan 03 can now consume the `enemy_hit` event for the authoritative crit number visual + local prediction (enemy numbers currently still come from the existing server HP-delta path — always 'normal', no regression).
- No blockers. Determinism gate and full build/test suite green.

## Self-Check: PASSED
- FOUND: src/module_bindings/enemy_hit_table.ts
- FOUND: 02-02-SUMMARY.md
- FOUND commit: 06c4013 (Task 1)
- FOUND commit: 940e434 (Task 2)

---
*Phase: 02-server-authoritative-damage-crit-on-enemies*
*Completed: 2026-07-08*
