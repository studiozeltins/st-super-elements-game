---
created: 2026-07-08T19:05:59.104Z
title: Miss/evasion system decision (accuracy vs evasion vs none)
area: general
files:
  - spacetimedb/src/index.ts (attackEnemies/attackRay/resolvePlayerHit — where a hit roll would slot)
  - spacetimedb/src/resistances.ts (existing deterministic mitigation layer)
  - spacetimedb/src/crit.ts (crit roll — would gate on landed hit)
---

## Problem

User wants "arrow broke / goliath resisted" flavor: chance for attacks (esp. projectiles) to MISS, possibly varying by attack type + weapon, with crits also able to miss. No miss system exists today — hits are spatial (hitbox/ray connect = always land); only mitigation is resistances.ts % + MAX_HIT_DAMAGE clamp.

Industry survey (recorded 2026-07-08):
- Action games (Genshin, Souls, Monster Hunter): NO miss RNG — aim is the hit roll; mitigation via defense/resist only. Industry standard for this genre.
- PoE/Diablo ARPG: accuracy vs evasion, `hitChance = acc/(acc+(eva/4)^0.9)`; crit rolled only on landed hit, then "crit confirmation" second hit-roll (crits dodgeable).
- WoW: hit-rating tables — later DELETED because mandatory stat felt bad.
- XCOM: shown % to-hit; famous frustration on high-% misses.

## Solution

Three options, needs user decision (present w/ pros/cons per decision-format rule):
1. **No miss RNG** (recommended now) — flavor via existing resistances + optional small damage variance (±10%). Zero new systems; consistent with "dodgeable attacks" milestone theme.
2. **Full accuracy/evasion (PoE-style)** — per-weapon base accuracy, per-unit evasion stat, server rolls ctx.random, `enemy_hit` grows `isMiss` (or becomes `hit_result`), MISS popup UI, crit gated on landed hit. Deep itemization but double-RNG swinginess + poor genre fit for aimed combat.
3. **Hybrid** (recommended if misses wanted) — miss RNG only for ranged projectiles vs goliaths/bosses ("deflected the arrow"); melee never misses; evasion stat only on high-tier units. Small scope, believable flavor.

Recorded recommendation: option 1 now, option 3 later if goliaths need defense identity; option 2 poor genre fit.
