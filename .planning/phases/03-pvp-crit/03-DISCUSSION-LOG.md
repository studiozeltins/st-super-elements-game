# Phase 3: PVP crit - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-09
**Phase:** 3-pvp-crit
**Mode:** --auto — all gray areas auto-selected; recommended option chosen per question (no AskUserQuestion)
**Areas discussed:** PVP event payload, Broadcast amount semantics, PVP resistances, Intent-arg shape, Damage-number feel, Residual trust

---

## PVP event payload

| Option | Description | Selected |
|--------|-------------|----------|
| Extend `pvp_hit` additively (`attacker`, `isCrit`) | Identity-anchored (right for moving victims), table already exists, additive schema | ✓ |
| Reuse `enemy_hit` | World-position-anchored — wrong anchor for player victims | |
| New third event table | Needless duplication of `pvp_hit` | |

**Choice:** Extend `pvp_hit` (recommended default) → D3-01

---

## Broadcast amount semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Full computed amount | Killing blow floats full hit strength — matches Phase-2 `enemy_hit` convention (commit `e368fda`) | ✓ |
| HP-capped `dealt` (status quo) | Sliver-of-HP numbers on killing blows; inconsistent with Phase 2 | |

**Choice:** Full computed amount (recommended default) → D3-02

---

## PVP resistances

| Option | Description | Selected |
|--------|-------------|----------|
| No target resistance (status quo) | PVP never applied `PLAYER_RESISTANCES`; adding them is a balance rework beyond CRIT-07 | ✓ |
| Apply `PLAYER_RESISTANCES` (melee/ranged channels) | Silently changes PVP balance; profiles tuned vs PVE | |

**Choice:** No PVP resistance this phase (recommended default) → D3-03; tuning deferred

---

## Intent-arg shape

| Option | Description | Selected |
|--------|-------------|----------|
| `{ targetIdentity, isSkill, comboCount }` | Mirrors `attackEnemies`; D2-03 skill window + D2-04 combo clamp carry via `resolvePlayerHit` | ✓ |
| Richer intent (dmgType, weapon, position) | Server already knows/derives these; over-passing widens trust surface | |

**Choice:** Minimal mirror of `attackEnemies` (recommended default) → D3-04

---

## Damage-number feel

| Option | Description | Selected |
|--------|-------------|----------|
| Carry D2-01/D2-02 verbatim | Attacker local instant number + event-driven others + own-crit upgrade + double-draw suppression | ✓ |
| Event-driven only | ~1 RTT lag on own hits — the sluggish feel Phase 2 explicitly rejected | |

**Choice:** Carry Phase-2 pattern (recommended default) → D3-05

---

## Residual trust (rate limit / combo authority)

| Option | Description | Selected |
|--------|-------------|----------|
| Defer both | Pre-existing rate-shaped holes orthogonal to CRIT-07; keeps capstone small per roadmap | ✓ |
| Add server per-target hit cooldown | New enforcement mechanic; scope growth | |
| Full server-authoritative combo | A real subsystem; 02-CONTEXT deferral revisited and upheld | |

**Choice:** Defer both (recommended default) → D3-06

---

## Claude's Discretion

- `pvp_hit` new-column details + `.default()` migrate requirement verification
- Ranged-PVP path intent reporting + `PVP_MAX_HIT_RANGE` vs server `MAX_HIT_RANGE` envelope check
- Own-hit suppression location (network callback vs `createDamageNumbers`)
- Victim crit number styling variant
- Whether PVP `isCrit` needs server-side recording beyond the event (Phase-7 poise targets goliaths)

## Deferred Ideas

- PVP resistance tuning (D3-03)
- Server-side PVP hit-rate cooldown (D3-06)
- Full server-authoritative combo (D3-06, revisited from 02-CONTEXT)

## Todo Cross-Reference (auto)

5 matches scored ≥0.3; 5 reviewed, **0 folded** — scope guardrail overrode the mechanical
≥0.4 fold rule (each match is a new capability outside the PVP-crit domain). See CONTEXT.md
"Reviewed Todos" for per-todo rationale.
