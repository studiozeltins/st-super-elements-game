---
phase: 04-attack-state-machine-leapslam-end-to-end-delete-goliath-drai
plan: 07
subsystem: verification
tags: [playtest, migrated-db, fsm-06, dodge-fairness, telegraph-legibility, tuning]
requires:
  - 04-01..04-06 (the complete Phase-4 spine this plan verifies)
provides:
  - human-verified full leapSlam loop on the MIGRATED local DB (SC1-SC4)
  - FSM-06 evidence — unit_attack rows lazy-upserted by real engages on a migrated (non-seeded) DB
  - playtest-driven tuning shipped (stun 1.05s, shake 0.45/7, slam shockwave, knockback 6u)
  - STUNNED! SfxPopup (reusable manga callout) + damage-number anti-overlap
affects:
  - Phase 05 (swordSwing/swordSwirl reuse the verified FSM spine + juice pipeline)
tech-stack:
  added:
    - "@fontsource/bangers (self-hosted comic SFX font)"
  patterns:
    - strike juice drawn from the EVENT's own coords/radius, never the telegraph's lifecycle
    - first-sync baseline for persisted watermark fields (ghost-popup class of bug)
    - spawn-time slot probing (center -> alternating sides -> upper row) for overlay legibility
key-files:
  created:
    - src/ui/SfxPopup.tsx
    - src/ui/sfxPopup.css
  modified:
    - spacetimedb/src/attacks.ts
    - src/game/createGame.ts
    - src/game/systems/createEffectSystem.ts
    - src/game/systems/createDamageNumbers.ts
    - src/App.tsx
decisions:
  - "SC5 (maincloud backup + publish + RTT test) is OBSOLETE — maincloud was dropped 2026-07-09 (DB paused, self-host decision). Verification reduces to the migrated LOCAL DB + LAN. A future self-host prod deploy re-runs the two-client RTT check then."
  - "Rim flash on strike was unreliable (row often jumps windup->recovery inside one coalesced tick; the telegraph tears down before the flash event lands) — replaced as the primary strike read by a two-ring shockwave drawn from attack_strike's own landing coords/radius"
  - "Playtest tuning is DATA changes only: stunTicks 2->7 (~1.05s), knockback 3->6u, shake 0.2/12->0.45/7 — the FSM code was not touched"
metrics:
  duration: ~1 day (interleaved with the 144->20fps regression hunt, see below)
  completed: 2026-07-10
status: complete
---

# Phase 04 Plan 07: Migrated-DB Verification + Playtest Summary

## Evidence

**SC1-SC4 (local human playtest, migrated DB) — PASS (user sign-off 2026-07-10):**

- Full loop reads correctly: telegraph ring expands through windup, goliath
  crouches → leaps → slams; user-tuned mid-playtest (telegraph switched to
  outline-only progress ring 5154dd8, knockback doubled 270aa23) and confirmed
  "TESTING PASS".
- Strike juice fires ONCE per slam (thud SFX confirmed single; shake + shockwave
  verified after tuning — original 0.2/12 shake and the rim flash were invisible,
  both replaced/boosted this plan).
- Knockback + stun land: victim thrown 6u, input frozen ~1.05s, STUNNED! popup
  lingers the full window.
- Dodge works: leaving the circle during windup takes no damage (grace-window
  resolution against the live row position).

**FSM-06 (migrated-DB lazy upsert) — PASS (SQL probe 2026-07-10):**

```
SELECT unit_kind, unit_id, state, attack_id FROM unit_attack
 unit_kind | unit_id | state | attack_id
 0         | 900001  | 0     | "leapSlam"
 0         | 900002  | 0     | "leapSlam"
 0         | 900003  | 0     | "leapSlam"
```

Three rows exist on the MIGRATED local DB (never seeded with attack rows), all
created lazily by real engages and returned to IDLE — full windup→strike→
recovery→idle cycles completed on live data.

**SC5 (maincloud RTT) — OBSOLETE:** maincloud dropped 2026-07-09. Two-client
LAN/RTT dodge-fairness check deferred to the first self-host prod deploy.

**Telegraph legibility through the pixel filter — PASS** (human sign-off; the
outline-only rework was specifically to keep terrain readable under the ring).

## Also shipped during this plan's window

- **144→20fps regression diagnosed + fixed** (not caused by Phase 4): 62k/s
  Identity BSATN serializations from per-render scans of the unbounded
  weapon_item table. Fixed: useMemo derivations, server-filtered owner
  subscriptions, weapon_item stacked (3,711→25 rows), shadow map once/frame.
  Rules codified in CLAUDE.md "Client Performance Rules".
- STUNNED! manga popup (reusable SfxPopup — future FROZEN!/PVP callouts are a
  call with different text/palette), proximity-scaled, side-cycled, ghost-popup
  and font-FOUT bugs fixed.
- Damage numbers no longer overlap (spawn-time clear-slot probing).

## Deviations from plan

- Maincloud tasks dropped (decision above) — plan was authored before the
  self-host pivot.
- Two-client RTT test not run this plan (solo playtest); carried to the
  self-host prod deploy gate.
