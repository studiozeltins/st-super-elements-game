---
created: 2026-07-07T00:00:00.000Z
title: Decide whether BŪSTS scales more than damage/heal
area: game
files:
  - src/game/data/constants.ts
  - src/game/combat/transcendScaling.ts
  - spacetimedb/src/index.ts
---

## Problem

During the plan-05 playtest the user asked "why does only 1 stat improve across
all B10?" — BŪSTS currently grants only +5% damage per level (+8% heal per level
for healers). The stat preview honestly shows just that one row for non-healers,
which reads thin. Open design question: should BŪSTS also raise other stats
(HP, attack speed, move speed, crit, etc.) per level so the preview feels richer
and the reward more substantial?

## Solution

TBD — this is a gameplay/balance decision, NOT just a UI change. If yes:
- Add the new scaling to the SERVER as the source of truth (spacetimedb/src/index.ts
  + constants), since transcend power must stay server-authoritative and
  deterministic (see 02-LEARNINGS: server-authoritative scarce-currency pattern).
- Mirror the constants client-side and extend the pure `transcendScaling` helpers
  so the CharacterScreen BŪSTS preview shows real, non-fabricated deltas
  (the preview must never invent numbers).
- Add/extend unit tests (serverSync + transcendScaling) for the new terms.
- Decide the curve (flat per-level vs milestone bonuses at B5/B10).
Blocked on a product decision first — do NOT invent stats silently.
