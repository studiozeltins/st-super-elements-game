# Phase 4: Attack state machine + leapSlam + delete goliath drain - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-09
**Phase:** 4-attack-state-machine-leapslam-end-to-end-delete-goliath-drain
**Mode:** interactive (user requested industry best practices + pros/cons per option — decision-format rule)
**Areas discussed:** Dodge timing & fairness, Damage & pacing, Hit reaction & movement, Telegraph & strike visuals

---

## Dodge timing & fairness

| Option | Description | Selected |
|--------|-------------|----------|
| 1.2s / 8 ticks windup | Hades/Genshin budget, RTT-safe | ✓ |
| 0.9s / 6 ticks | Souls pressure; RTT eats budget | |
| 1.5s / 10 ticks | MMO swirly; sluggish | |

| Option | Description | Selected |
|--------|-------------|----------|
| Favor-the-dodger grace (~1 tick) | Defender bias (Overwatch/Destiny standard) | ✓ |
| Exact-deadline resolve | Simplest; "I dodged that!" over RTT | |

| Option | Description | Selected |
|--------|-------------|----------|
| Everyone in circle | Shared co-op danger, telegraph never lies | ✓ |
| Aggro target only | Telegraph lies to bystanders | |

---

## Damage & pacing

| Option | Description | Selected |
|--------|-------------|----------|
| ~3× (270/390/510) | Recommended, Hades-tier | |
| ~4.5× (405/585/765) | Souls-tier, ~40–65% squishy HP | ✓ (user chose over recommendation) |
| ~2× | Gentle; threat collapses | |

Radius: user initially picked flat 5.5u; I flagged the center-escape fairness tension
(5.5u vs 1.2s windup at moveSpeed 6–7.5) → follow-up question → **per-size 4.0/4.75/5.5** selected.

Recovery: **1.2s / 8 ticks** ✓ (recommended).

Cooldown: user free-text — wants sword swings between skills, shield rush after recovery, "not
skills skills skills", skill-if-free-for-max-DPS. Resolved via follow-up: **3.5s now → ~5.5s at
Phase 5** ✓; rhythm intent recorded as binding selection-fn design (D4-08); shieldDash-after-whiff
reframed as Phase-6 selection preference (not recovery-cancel).

---

## Hit reaction & movement

Reaction type: user free-text — per-attack knockback/stun combos assigned by animation logic +
power → **registry data fields**; leapSlam = knockback + 0.3s micro-stun.
Knockback distance: user free-text — per-skill; edge-of-map deaths are fun → **~3u for slam, no
safety rails**.
Windup body: **Rooted at cast point** ✓ (recommended).
Between attacks: user free-text — re-stated swing-between-skills desire → resolved by the
swing-scope question below; **existing chase AI unchanged** this phase.

---

## Telegraph & strike visuals

| Option | Description | Selected |
|--------|-------------|----------|
| Growing inner disc + rim flash | FFXIV/WoW, fill % = countdown | ✓ |
| Radial clock sweep | Aliases through pixel filter | |
| Pulsing ring | Vibe, not countdown | |

Strike VFX: **Full juice** ✓ (flash + burst + small shake + SFX).
Animation: **Crouch → leap arc → slam** ✓.

---

## Scope confirmation

| Option | Description | Selected |
|--------|-------------|----------|
| Keep swordSwing in Phase 5 | Isolate spine risk; fast follow | ✓ |
| Pull swordSwing into Phase 4 | Rhythm now; doubles risky surface | |

## Claude's Discretion

Table column shapes, ATTACKS data layout, grace-tick implementation, telegraph mesh/shader,
shake magnitude, aggro semantics, engage-band values.

## Deferred Ideas

shieldDash-after-whiff preference (Phase 6); swing/swirl/dash reaction assignments (their
phases); slam cooldown retune (Phase 5); strafe AI (only if Phase-5 kit still static).

## Todo Cross-Reference

6 matches reviewed, 0 folded (user: "Fold none") — all outside FSM domain.
