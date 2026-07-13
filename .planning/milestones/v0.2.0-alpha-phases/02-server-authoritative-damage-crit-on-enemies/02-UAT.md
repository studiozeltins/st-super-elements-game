---
status: complete
phase: 02-server-authoritative-damage-crit-on-enemies
source: 02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md
started: 2026-07-08T19:30:00Z
updated: 2026-07-08T19:50:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill running spacetimedb-standalone + restart. Open game fresh. Connects, world sim alive (enemies + goliaths moving), no console errors, existing account logs in.
result: pass

### 2. One number per hit, anchored on the enemy
expected: Every landed hit (melee, skill, ranged; yours AND other players') floats EXACTLY ONE damage number at the enemy that was hit — never at your character, never a side-by-side pair.
result: pass
coverage_id: 02-03 D1, 02-02 D3

### 3. Magenta crits + per-character crit divergence
expected: Crits pop in bright magenta (#ff2bd6). Playing vesper (0.36 critRate) vs glacia (0.10) on the same goliath — vesper visibly crits far more often. Crit truth comes from server (no client roll).
result: pass
coverage_id: 02-03 D3

### 4. Skill cooldown gate (spoof resistance)
expected: Spamming skill (Q) while on cooldown does nothing (no cast effect, no skill-scaled damage). A real off-cooldown cast lands skill-scaled (bigger) damage inside the 5s hit window.
result: pass
coverage_id: 02-02 D4

### 5. Migrated-DB state + late long-skill hits
expected: After a skill cast, `spacetime sql 2d-impact-game-fr9ti --server local "SELECT skill_ready_at_micros, skill_window_ends_at_micros FROM player"` shows non-zero for your row. A long skill's (e.g. marina water-ring) LATE ticks near end of lifetime still deal skill-scaled damage, not downgraded to basic.
result: pass
coverage_id: 02-03 D4

### 6. Killing blow floats a damage number
expected: The hit that KILLS an enemy floats a damage number (magenta if it crit) at the dying enemy, same as any other hit.
result: pass
coverage_id: 02-03 D5

### 7. Server owns damage arg (auto)
expected: attackEnemies/attackRay take isSkill+comboCount, no client damage arg; server computes base via CHARACTER_COMBAT (CRIT-06).
result: pass
source: automated
coverage_id: 02-02 D1

### 8. Server crit roll via ctx.random (auto)
expected: rollCrit(critRate, critDmg, () => ctx.random()); client rollDamage/CRIT_CHANCE/CRIT_MULTIPLIER deleted.
result: pass
source: automated
coverage_id: 02-02 D2

### 9. HP-delta number spawn removed, health-bar reveal preserved (auto)
expected: Renderers no longer spawn numbers from HP deltas; lastDamagedAt health-bar reveal intact.
result: pass
source: automated
coverage_id: 02-03 D2

## Summary

total: 9
passed: 9
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
