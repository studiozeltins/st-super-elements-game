# Phase 1: Crit foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-08
**Phase:** 1-crit-foundation
**Areas discussed:** Crit stat design, Crit number feedback, Damage authority, PVP crit scope

---

## Crit stat design

| Option | Description | Selected |
|--------|-------------|----------|
| Role-seeded + tuned | Baseline by role (dps high, tank low, healer/support mid), then per-char tuning | ✓ |
| Fully bespoke | Hand-author every char from scratch, no role anchor | |
| You decide values | Claude picks role-seeded numbers, user adjusts in playtest | (folded in) |

**User's choice:** Role-seeded + tuned
**Notes:** Distinct per character (CRIT-01), coherent with existing Role system. Executor may pick
concrete first-pass numbers; user tunes in playtest.

---

## Crit number feedback

| Option | Description | Selected |
|--------|-------------|----------|
| Small hit event table | New crit/hit event table; clients float from server truth (~1 RTT) | ✓ |
| Defer crit visual | Honor "no new tables"; generic number this phase | |
| Client-seed predict | Client sends seed, server rolls from it — REJECTED (cheatable) | |

**User's choice:** New event table — "no new tables OK, no problem!"
**Notes:** User explicitly waived the roadmap "no new tables" note. Everyone subscribes to the crit
event (attacker, other players, PVP victims) so any client can pop the big red crit number over the
right target. Mirror `skill_cast`/`ranged_attack` event pattern.

---

## Damage authority

| Option | Description | Selected |
|--------|-------------|----------|
| A: client base + server crit/clamp | Client sends base damage, server rolls crit & clamps | |
| B: full server base damage | Server computes base from mirrored weapon/combo/transcend math; client sends intent | ✓ |

**User's choice:** B — full server base damage
**Notes:** User asked for a concrete, practical comparison first (how real MP games do it,
benefits/drawbacks). Presented: competitive shooters + ARPGs use full server authority; PvE/trusted
clients use client+clamp. Given this game's PVP shard-theft cheat incentive, user chose to close the
damage-spoof hole now despite the Phase 1 scope growth (mirror WEAPONS + multipliers server-side,
extend serverSync parity). Both options gave the un-spoofable crit flag; user wanted damage
authority too.

---

## PVP crit scope

| Option | Description | Selected |
|--------|-------------|----------|
| Include PVP crit | Same server crit roll applies to attackPlayer | ✓ |
| Enemies only, defer PVP | Strictly attackEnemies/attackRay per reqs | |

**User's choice:** Include PVP crit
**Notes:** Consistency + truthful PVP crit numbers; cheap once the roll/base-damage helper exists.

---

## Claude's Discretion

- Concrete per-character `critRate`/`critDmg` first-pass numbers (role-seeded).
- New crit event-table name/columns + subscription wiring (follow existing event pattern).
- Exact intent-arg shape for reworked reducers, pending the server-knows-vs-passed verification
  (combo is client-side today; transcend level may already be server-tracked).

## Deferred Ideas

- Weapon/constellation crit contributions (XCMB-02) — pairs with the server weapon-stat mirror
  built here; later phase.
- Camp-enemy / hero crit + FSM interactions — after the FSM exists (Phases 2/5).

## Surfaced during discussion ("anything I missed")

- Skill damage and basic attacks are indistinguishable server-side (both via `attackEnemies`), so a
  single per-character `critRate` auto-covers skills — captured as D-07.
- Tension: CRIT-04 (truthful server crit float) vs roadmap "no new tables" — resolved by user
  waiving the note (D-03).
