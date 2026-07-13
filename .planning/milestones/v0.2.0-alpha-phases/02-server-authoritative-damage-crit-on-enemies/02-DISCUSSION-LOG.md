# Phase 2: Server-authoritative damage + crit on enemies - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-08
**Phase:** 02-server-authoritative-damage-crit-on-enemies
**Areas discussed:** Own-number feel/latency, Event scope, Skill-multiplier trust, Combo trust

User requested detailed plain-language pros/cons per option and asked for industry-standard smooth
(non-jittery) gameplay — options were explained at length before each choice.

---

## Own damage-number feel/latency (D2-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Predict locally | Instant display-only local number; server event confirms/upgrades crit. Client-side prediction, industry standard, HP+crit still server-authoritative. | ✓ |
| Predict, crits re-pop | Same instant local number, crit visibly re-pops ~1 RTT later (faint two-stage flash). | |
| Server-driven only | Show nothing until server event, then pop. Simplest but own hits feel delayed 100-250ms on maincloud (jittery). | |

**User's choice:** Predict locally (recommended)
**Notes:** Explicit bar was "smooth, not jittery." Client-side prediction is the standard action-game
approach (Genshin/Diablo/PoE); server reconciles truth. Local number is cosmetic only — no spoof risk.

---

## Event table scope (D2-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Crit-only | Event only on a crit; non-crit numbers from local prediction. Leanest traffic, least clutter. | |
| Every-hit broadcast | Event per landed hit (amount+isCrit+target+attacker); all clients render. Full shared visibility (Genshin co-op) but more traffic + clutter. | ✓ |
| Every-hit recorded, own+crit drawn | Records every hit but only draws own+crits. Clean screen, pays every-hit bandwidth. | |

**User's choice:** Every-hit broadcast
**Notes:** Chose full shared visibility over leanness. Implication captured in CONTEXT: attacker's own
number stays local-predicted, so the client must suppress double-drawing its own hits from the event
(event drives OTHER players' numbers + confirms own crit).

---

## Skill-multiplier trust (D2-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Server-enforce cooldown | Per-player skillReadyAt set by authoritative cast; isSkill only grants skill multiplier when off cooldown, else basic. Satisfies SC4. Moderate extra work. | ✓ |
| Accept bounded (trust flag) | Just add + trust isSkill. Minimal work but leaves skill-tier damage every hit; FAILS SC4. | |
| Tie to cast window | isSkill hits get skill multiplier only inside a short post-cast window. Simpler but timing-coupling fragile. | |

**User's choice:** Server-enforce cooldown (recommended)
**Notes:** skillAttackMultiplier is uncapped and server enforces no skill cooldown today, so a trusted
flag = real damage-inflation cheat that violates Phase 2's own Success Criterion 4. Closing it keeps the
phase honest and supports Phase 3/7's trust chain.

---

## Combo trust (D2-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Clamp to existing cap | Clamp comboCount to MAX_COMBO_FOR_GEMS (100) in damage path, matching gem clamp. Bounds uncapped skill inflation, one Math.min. | ✓ |
| Full server-authoritative combo | Server tracks combo from resolved hits + window decay; client sends none. Fully truthful but a big new subsystem — its own phase. | |
| Accept fully, no clamp | Trust unbounded client combo. Leaves uncapped skill inflation, contradicts SC4. | |

**User's choice:** Clamp to existing cap (recommended)
**Notes:** Code read showed regularAttackMultiplier is already capped (basics safe) but
skillAttackMultiplier is uncapped — an unclamped combo inflates a legit on-cooldown skill hit without
bound. Clamp reuses the established cap constant. Full server combo deferred (matters more for PVP).

---

## Claude's Discretion

- Exact new event-table name + columns (follow skill_cast/ranged_attack).
- Exact intent-arg shape for reworked attackEnemies/attackRay (confirm server-known vs must-pass:
  activeCharacterId IS server-tracked; transcend/constellation to verify; minimum new intent = isSkill
  + existing comboCount, drop damage).
- Out-of-cooldown isSkill hit: downgrade-to-basic vs reject (pick cleaner feel).
- Whether skillReadyAt is gated off sendCastSkill or the damage hit.
- Where isCrit is recorded on the hit for Phase 7 (server-side field, not necessarily broadcast payload).

## Deferred Ideas

- Full server-authoritative combo (own subsystem; revisit when PVP combo matters, Phase 3+).
- Weapon/constellation crit contributions (XCMB-02, REQUIREMENTS v2).
