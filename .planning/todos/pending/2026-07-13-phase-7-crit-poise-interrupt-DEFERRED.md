# Phase 7: Crit poise interrupt — DEFERRED

**Deferred:** 2026-07-13, at v0.2.0-alpha (Combat Depth) milestone close, by user ruling.
**Original milestone:** v0.2.0-alpha Combat Depth (was Phase 7, last phase).
**Requirements carried:** POISE-01, POISE-02, POISE-03 (unmet at close — recorded as known gaps).

## Goal

A crit landing during a goliath's windup can CANCEL the attack and stagger the goliath — the
signature, un-spoofable differentiator that makes crit investment buy tempo, not just damage.

## Dependencies (all already shipped)

- Phase 4 (v0.2.0-alpha): windup state machine to cancel + `poise` column lifecycle
  (column exists, reset-on-windup-entry established; accrual was to ship here).
- Phase 2 (v0.2.0-alpha): server-owned `isCrit` signal.

## Success Criteria (from original roadmap)

1. Landing crits on a goliath DURING its windup accrues poise; enough crit-in-windup cancels the
   attack (no strike fires) and the goliath enters a brief, VISIBLE stagger before it can attack
   again.
2. Non-crit hits never accrue poise, crits outside a windup are a poise no-op, and `poise` resets
   to 0 on every windup entry — so a player cannot perma-stun by chipping between windups.
3. The interrupt consumes the server-owned `isCrit` from Phase 2 (not a client-sent bool), so a
   modified client cannot spoof a perma-stun on every nearby goliath.

## Implementation Notes (from original roadmap)

Small once the poise column exists — a pure `applyPoiseHit` in `unitAttackFsm.ts` called from
`attackEnemies`/`attackRay`, with explicit boundary tests (same-tick strike/interrupt race,
post-interrupt re-attack, crit-outside-windup no-op). Honors the Phase-2 server-side trust
decision; do NOT elevate an untrusted bool to a state trigger.
