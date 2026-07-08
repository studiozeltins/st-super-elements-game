---
phase: 02-server-authoritative-damage-crit-on-enemies
verified: 2026-07-08T20:20:00Z
status: passed
score: 15/15 must-haves verified
behavior_unverified: 0
overrides_applied: 2
overrides:
  - must_have: "The attacker's OWN hit floats an instant, display-only 'normal' number at 0 latency via local prediction; it is NOT re-drawn when the enemy_hit event echoes back"
    reason: "Predict-then-promote was abandoned at the blocking human checkpoint: predicted numbers anchored to the PLAYER, not the enemy. Replaced by event-only rendering (every enemy_hit renders one number at the enemy's exact position). The underlying intent — exactly ONE number per own hit, never double-drawn — holds and was human-verified live (commit a47b8e7, then 9ab5a3f fixed the double-subscription)."
    accepted_by: "user (Task 3 blocking checkpoint playtest)"
    accepted_at: "2026-07-08"
  - must_have: "On an own crit, the enemy_hit event PROMOTES the already-drawn predicted number IN PLACE to the big 'crit' number"
    reason: "Same checkpoint decision: promote()/handle machinery removed with the prediction path. Own crits now render directly from the server event as a single 'crit' number at the enemy — one codepath instead of three, LAN round-trip imperceptible. CRIT-04 intent (single server-driven crit number) verified by human playtest."
    accepted_by: "user (Task 3 blocking checkpoint playtest)"
    accepted_at: "2026-07-08"
outstanding_notes:
  - "Fatal-hit number (D5): code path verified — all 4 enemy_hit inserts precede the fatal branch (index.ts:1929, 1955, 2080, 2112) — but the final human re-check of the killing-blow number is still pending user confirmation. Minor, non-blocking per orchestrator directive."
  - "MAINCLOUD additive publish deliberately deferred (directed deviation, 02-03-SUMMARY). Before prod: spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb --server maincloud --yes (NEVER --delete-data)."
---

# Phase 2: Server-Authoritative Damage + Crit on Enemies — Verification Report

**Phase Goal:** The server computes base damage and rolls crit for hits on enemies/goliaths — the client sends intent (not a damage number), the old client crit roll is deleted, and the truthful crit number reaches every client via a new crit event table.
**Verified:** 2026-07-08
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Roadmap Success Criteria

| # | Success Criterion | Status | Evidence |
|---|-------------------|--------|----------|
| 1 | `attackEnemies`/`attackRay` drop `damage`, accept intent; server computes base via `damage.ts` + rolls crit via `ctx.random` (CRIT-06) | ✓ VERIFIED | `spacetimedb/src/index.ts:1899-1907` (attackEnemies args: centerX/centerZ/radius/**isSkill**/comboCount — no damage), `:2003-2013` (attackRay same), `:1862-1893` resolvePlayerHit composes `computeBaseDamage(CHARACTER_COMBAT[...])` × `rollCrit(..., () => ctx.random())` (:1889). Regenerated bindings confirm: `src/module_bindings/attack_enemies_reducer.ts:17` and `attack_ray_reducer.ts:20` have `isSkill`, zero `damage` occurrences. |
| 2 | Per-character crit divergence visible in play; old global client roll deleted | ✓ VERIFIED | Automated: `src/game/data/__tests__/crit.test.ts:45-64` seeded mulberry32 divergence regression (vesper 0.36 > 2× glacia 0.10), passing. Deletion: `grep rollDamage\|CRIT_CHANCE\|CRIT_MULTIPLIER` over ALL of `src/` → zero matches. Live divergence human-approved at Task 3 checkpoint (02-03-SUMMARY D3: pass). |
| 3 | Crit floats `kind:'crit'` number from the real server roll via a new crit event table all clients subscribe to; `isCrit` recorded on the hit | ✓ VERIFIED | `spacetimedb/src/index.ts:569-578` `enemy_hit` event table (attacker, positionX, positionZ, amount, isCrit), registered in schema (:711). `src/App.tsx:227-235` sole `useTable(tables.enemyHit)` onInsert → `spawnWorldNumber(..., hit.isCrit ? 'crit' : 'normal')`. Persistent per-hit poise field explicitly deferred to Phase 7 per plan (event isCrit satisfies CRIT-05 this phase). Playtest approved (D1: pass). |
| 4 | Modified client can't decide crit nor inflate base damage; `MAX_HIT_DAMAGE` kept; grep-gate: no `Math.random` in `spacetimedb/src` | ✓ VERIFIED | No client damage/crit input exists (intent-only signatures). Clamp at `index.ts:1891` (`Math.min(Math.round(resisted), MAX_HIT_DAMAGE)`). Determinism grep over `spacetimedb/src`: zero `Math.random`/`Date.now` matches. `isSkill` spoof gated: `skillGrantActive` (:1880) grants the skill multiplier only inside the castSkill-armed window; combo clamped `Math.min(comboCount, MAX_COMBO_FOR_GEMS)` (:1917, :2032). |

### Observable Truths (merged plan must-haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | CHARACTER_COMBAT covers every CHARACTER_STATS id with client-parity values (INV-5) | ✓ VERIFIED | `spacetimedb/src/damage.ts:117-125` interface + map; `serverSync.test.ts` import-and-compare parity — suite green (475/475) |
| 2 | skillGrantActive inclusive `<=` bound; nextSkillReadyAt = now + cooldown×1e6 | ✓ VERIFIED | `spacetimedb/src/skillGate.ts:12-24` (zero-import, grep-gate clean); `skillGate.test.ts` 6 tests green |
| 3 | Seeded crit-frequency divergence regression (SC2 automated) | ✓ VERIFIED | `crit.test.ts:45-64`, deterministic mulberry32, asserts vesperCount > glaciaCount×2 |
| 4 | Reducers accept intent, `damage` arg gone end-to-end (reducer, bindings, Network interface, createGame sends, App.tsx bindings) | ✓ VERIFIED | Server sigs above; `createGame.ts:84-106` Network interface takes `isSkill: boolean` no damage; `:382` sendAttackEnemies(x, z, radius, isSkill, combo); `:517-526` sendAttackRay(..., false, combo); `App.tsx:634-637` bindings pass isSkill, no damage |
| 5 | Server computes base via computeBaseDamage + constellation + transcend, rolls crit via ctx.random | ✓ VERIFIED | `index.ts:1870-1889` (findOwnedRow, activatedConstellationFor, transcendLevel, rollCrit thunk `() => ctx.random()`) |
| 6 | castSkill rejects on-cooldown (no skill_cast emitted), arms cooldown from server CHARACTER_COMBAT (never client skillId) + 5s window | ✓ VERIFIED | `index.ts:1691` early return precedes `skillCast.insert` (:1701); cooldown from `CHARACTER_COMBAT[activeCharacterId]` (:1692-1693); `SKILL_HIT_WINDOW_MICROS = 5_000_000n` (:218) |
| 7 | comboCount clamped to MAX_COMBO_FOR_GEMS before multipliers; final amount clamped to MAX_HIT_DAMAGE | ✓ VERIFIED | `index.ts:1917`, `:2032` (clamp before resolvePlayerHit); `:1891` post-crit/resist clamp |
| 8 | Each landed enemy/goliath hit inserts one enemy_hit row (attacker, position, post-clamp amount, authoritative isCrit) — including fatal hits, all 4 paths | ✓ VERIFIED | Inserts at `index.ts:1929` (melee×enemy), `:1955` (melee×goliath), `:2080` (ray×goliath), `:2112` (ray×enemy) — each BEFORE the `remaining > 0` branch, so killing blows emit too; attackRay goliath path keeps `GOLIATH_RESISTANCES` 'ranged' (:2078) |
| 9 | Client crit roll deleted (rollDamage/CRIT_CHANCE/CRIT_MULTIPLIER) | ✓ VERIFIED | Zero matches in all of `src/` |
| 10 | Own hit: exactly one number, never double-drawn | PASSED (override) | Predict-promote replaced by event-only rendering at checkpoint (see overrides). One-subscription rule enforced: `tables.enemyHit` absent from manual `.subscribe([...])` list (`App.tsx:112-136`) and present only in `useTable` (:227). Human confirmed single number per hit (fix 9ab5a3f) |
| 11 | Own crit shows single server-driven 'crit' number | PASSED (override) | Event-only: `App.tsx:228-234` renders `hit.isCrit ? 'crit' : 'normal'` for every hit incl. own; crit style `#ff2bd6` magenta (`damageKind.ts:21`); human-approved |
| 12 | Other players' hits float event-driven numbers on every subscribed client | ✓ VERIFIED | Same onInsert renders ALL enemy_hit rows regardless of attacker (no self-skip — intentional, event-only design); playtest approved |
| 13 | HP-delta number spawn removed; health-bar reveal preserved | ✓ VERIFIED | `createEnemyRenderer.ts:83` and `createGoliathRenderer.ts:68` construct `createEntityRenderer({ scene, adapter })` with NO onHealthDrop; `createEntityRenderer.ts:175-176` sets `lastDamagedAt` independently of the callback |
| 14 | Migrated-DB state: enemy_hit fires + skillReadyAt/skillWindow non-zero on the live migrated LOCAL DB | ✓ VERIFIED (human) | Additive columns `.default(0n)` appended at table end (`index.ts:340-341`); all insert sites backfilled (:809-810, :2201, :2838-2839); human playtest on migrated DB approved (02-03-SUMMARY D4: pass, incl. late-long-skill still skill-scaled) |
| 15 | Two-client playtest: visible crit divergence, no visual regression | ✓ VERIFIED (human) | Blocking checkpoint resume-signal approved; 3 checkpoint bugs found+fixed (a47b8e7, 9ab5a3f, e368fda) before approval — checkpoint demonstrably exercised, not rubber-stamped |

**Score:** 15/15 (13 code-verified, 2 human-checkpoint items with code corroboration, 2 counted via documented user-accepted overrides)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `spacetimedb/src/damage.ts` | CHARACTER_COMBAT + computeBaseDamage | ✓ VERIFIED | Interface :117, map :125; zero-import; parity-tested |
| `spacetimedb/src/skillGate.ts` | skillGrantActive + nextSkillReadyAt | ✓ VERIFIED | 25 LOC, zero-import, grep-gate clean |
| `spacetimedb/src/crit.ts` | rollCrit injected-rng | ✓ VERIFIED | Strict `rng() < critRate`, critDmg verbatim multiplier |
| `spacetimedb/src/index.ts` | enemy_hit table, skill columns, gated castSkill, resolvePlayerHit, intent reducers | ✓ VERIFIED | All wired (lines cited above); enemyHit registered in schema :711 |
| `src/module_bindings/enemy_hit_table.ts` | Generated binding | ✓ VERIFIED | Exists; attack reducer bindings carry isSkill, no damage |
| `src/game/createGame.ts` | Intent sends, spawnWorldNumber, no client crit roll | ✓ VERIFIED | :382, :517-526, :1065; no rollDamage remnants |
| `src/App.tsx` | enemy_hit useTable onInsert, single subscription | ✓ VERIFIED | :227-235; NOT in manual subscribe list :112-136 |
| `src/game/combat/damageKind.ts` | Magenta crit | ✓ VERIFIED | `crit: { cssColor: '#ff2bd6', fontScale: 1.85 }` (:21) |
| Tests: serverSync/skillGate/crit | Parity + gate + divergence | ✓ VERIFIED | All present, all green in 475/475 run |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| castSkill | resolvePlayerHit skill multiplier | skillReadyAtMicros/skillWindowEndsAtMicros player state → skillGrantActive (:1880) | ✓ WIRED |
| resolvePlayerHit | enemy_hit row | {amount, isCrit} inserted at all 4 hit sites, pre-fatal-branch | ✓ WIRED |
| Reducer signature | Client send | Regenerated bindings + Network interface + createGame + App.tsx all intent-only (tsc-proven: `pnpm build` green per SUMMARY; bindings inspected directly) | ✓ WIRED |
| enemy_hit event | Rendered number | useTable onInsert → gameRef.spawnWorldNumber → damageNumbers.spawn at enemy position, kind from server isCrit | ✓ WIRED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite | `pnpm test` | 29 files, **475/475 passed** (matches claimed count) | ✓ PASS |
| Determinism gate | grep `Math.random\|Date.now` over spacetimedb/src | 0 matches | ✓ PASS |
| Client-roll deletion gate | grep `rollDamage\|CRIT_CHANCE\|CRIT_MULTIPLIER` over src/ | 0 matches | ✓ PASS |
| Debt markers | grep `TBD\|FIXME\|XXX` over modified files | 0 matches | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|-------------|--------------|--------|----------|
| CRIT-02 | 02-01, 02-02, 02-03 | ✓ SATISFIED | Server rolls crit via `rollCrit(critRate, critDmg, () => ctx.random())` from CHARACTER_STATS (:1888-1889); client decides nothing; divergence locked by seeded regression + approved playtest |
| CRIT-04 | 02-03 | ✓ SATISFIED | `kind:'crit'` number driven solely by server `enemy_hit.isCrit` (App.tsx:233), magenta #ff2bd6; no visual regression per approved checkpoint |
| CRIT-05 | 02-02, 02-03 | ✓ SATISFIED | isCrit resolved server-side in attackEnemies/attackRay and recorded on every enemy_hit row (4 sites); persistent poise field deliberately Phase-7 scope |
| CRIT-06 | 02-01, 02-02, 02-03 | ✓ SATISFIED | `damage` arg removed end-to-end; base computed from CHARACTER_COMBAT (parity-locked) + combo/skill/transcend math; skill multiplier cooldown-gated; combo + MAX_HIT_DAMAGE clamps |

No orphaned requirements: REQUIREMENTS.md maps exactly CRIT-02/04/05/06 to Phase 2, all claimed by plans.

### Anti-Patterns Found

None. No TBD/FIXME/XXX, no stub returns, no placeholder paths in phase-modified files. The interim predict/promote machinery was fully removed (no dead `lastOwnPredicted`/`promote()` remnants — `createDamageNumbers.ts` API back to void spawn, per CLAUDE.md no-legacy rule).

### Human Verification Required

None blocking. All plan-03 checkpoint items were executed and approved during the phase (blocking `checkpoint:human-verify` with resume-signal "approved", documented in 02-03-SUMMARY coverage D1/D3/D4/D5 — the checkpoint surfaced and fixed 3 real bugs, so it was demonstrably exercised).

**Minor outstanding (non-blocking):**
1. **Fatal-hit number re-check** — Kill an enemy/goliath; expect the killing blow to float the full computed number. Code path verified (all 4 inserts precede the fatal branch, fix e368fda republished to LOCAL); only the final visual re-confirmation is pending.
2. **isSkill spoof (SC4 check 4)** — best-effort per plan (needs a modified client); untested live, covered by skillGate.test.ts automated gate math + server-side window wiring (accepted fallback per plan text).

### Gaps Summary

No gaps. The phase goal is achieved end-to-end on LOCAL: the server owns base damage and the crit roll, the client sends only intent, the legacy client crit roll is deleted with zero remnants, and the truthful `{amount, isCrit}` reaches every client through the single-subscription `enemy_hit` event.

Two documented, user-accepted deviations from plan 03's mechanism (predict-then-promote → event-only rendering) are carried as overrides — the requirement-level truths they served (one number per hit, server crit truth) are verified. Operational outstanding: maincloud additive publish deferred (directed); fatal-hit visual re-check pending.

---

_Verified: 2026-07-08_
_Verifier: Claude (gsd-verifier)_
