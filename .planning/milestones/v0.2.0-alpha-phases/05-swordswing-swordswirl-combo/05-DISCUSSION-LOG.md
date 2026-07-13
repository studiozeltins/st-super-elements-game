# Phase 5: swordSwing → swordSwirl combo - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-10
**Phase:** 05-swordswing-swordswirl-combo
**Mode:** `--all --auto` — all gray areas auto-selected; every question resolved with the
recommended default (no user prompts).
**Areas discussed:** Chain mechanics, Cone geometry & client shape data, Kit numbers & cooldown pacing, Telegraph & animation readability

---

## Chain mechanics (ATK-03)

| Option | Description | Selected |
|--------|-------------|----------|
| `chainsInto` data field | AttackSpec field; glue swaps STRIKE→RECOVERY into the chained attack's `enterWindup`; only the chain's final attack recovers + cools down | ✓ |
| New CHAIN FSM state | Explicit fourth active state | — rejected: schema + client churn for what data expresses |
| Selection-fn forcing | Selection prefers swirl right after a swing ends | — rejected: racy, not atomic with the swing |

**Auto-choice notes:** chain UNCONDITIONAL (hit or whiff — telegraph never lies); rejected
chain-on-hit (trains players that dodging the swing removes the swirl warning). Swirl NOT in
`UNIT_ATTACKS` (reachable only via chain). Swirl center = goliath's planted position, so the
existing circle telegraph + `resolveCircleHit` serve it unchanged.

---

## Cone geometry & client shape data (ATK-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Aim via existing cast→landing fields | Aim point stored in `landingX/Z`, apex = `castX/Z`; zero new columns | ✓ |
| New aim/angle row columns | Additive f32 columns for direction + angle | — rejected: static registry data doesn't belong per-row |
| Client mirror + serverSync parity | `src/game/data/attacks.ts` shape/angle mirror, INV-5 guarded | ✓ |
| Direct client import of server `attacks.ts` | Bundle the pure server file into the client | — rejected: server file can later gain server-only imports, breaking the client build at a distance |

**Auto-choice notes:** 120° full angle (`minDot = 0.5`, reuses `isWithinForwardArc` verbatim —
ATK-06 geometry-reuse); range per size seed 3.0/3.5/4.0; locked at windup entry, resolved vs
LIVE positions with the D4-02 grace.

---

## Kit numbers & cooldown pacing

| Option | Description | Selected |
|--------|-------------|----------|
| Per-role cooldown column | Additive `basicCooldownUntilMicros` `.default(0)`; `selectAttack` gates basics too | ✓ |
| One shared cooldown for all attacks | Every attack writes the single field | — rejected: slam's 5.5s would starve swing → 5.5s facetank dead air (ATK-05 anti-pattern) |
| No basic cooldown | Chain fires whenever in band | — rejected: relentless perma-chain, no D4-08 rhythm knob |

**Auto-choice notes:** slam 3.5s→5.5s (D4-07's explicit Phase-5 retune); swing band 0..3.5,
slam stays 0..8; chain cooldown seed 2.5s. Damage seeds swing 1.5× / swirl 2.5× contact —
worst-case chain 680 raw < 950 min HP pool (roadmap one-shot guard modeled). Timing: swing
windup 4 ticks, swirl 5 ticks, swirl recovery 8 ticks. Reactions per D4-10 recorded intents:
swing stun-only (4 ticks), swirl knockback (~4.5u). All seeds; user tunes in playtest.

---

## Telegraph & animation readability

| Option | Description | Selected |
|--------|-------------|----------|
| Sector telegraph (RingGeometry theta slice) | Same D4-14 outline+fill+flash language, cone-shaped | ✓ |
| Custom cone shader | Shader-driven sector fill | — rejected: geometry reuse is cheaper and proven through the pixel filter |
| Pre-show both telegraphs during swing | Swirl circle visible during the swing windup | — rejected: double-warning noise; sequencing teaches the chain (swirl gets its own 0.75s windup telegraph) |

**Auto-choice notes:** two distinct procedural clips on `animateAttack` (slash lunge / 360°
spin); per-attack strike juice keyed by `attack_strike.attackId`, both smaller than the slam's.

---

## Claude's Discretion

Chain-glue shape + coalesced-tick test; `resolveCone` edge semantics; sector mesh/fill
construction through the pixel filter; juice composition per attack; client-mirror module
shape + parity field coverage; rooted-through-both-windups confirmation; swirl's inert band
values.

## Deferred Ideas

shieldDash-after-whiff selection preference (Phase 6); shieldDash reaction assignment
(Phase 6); reposition/strafe AI (only if kit still feels static); 3-hit+ chains /
per-archetype lists (XCMB-03, v2). Reviewed todos: 5 matched, 0 folded (deferred-milestone
specs + spurious keyword matches — same guardrail as Phases 3/4).
