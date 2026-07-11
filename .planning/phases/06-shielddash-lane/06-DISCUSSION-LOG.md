# Phase 6: shieldDash lane - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-11
**Phase:** 6-shielddash-lane
**Mode:** --all --auto — all gray areas auto-selected; every question resolved to the
recommended option without AskUserQuestion (single-pass cap honored).
**Areas discussed:** Charge motion model, Lane geometry & aim lock, Resolver & knockback
semantics, Kit numbers & selection rhythm, Telegraph & charge animation, World-edge cases

---

## Charge motion model

| Option | Description | Selected |
|--------|-------------|----------|
| Relocate-at-strike (leap pattern) | Position set to lane end at STRIKE via the proven `teleportToLanding` seam; damage resolves ONCE at strike+grace vs live positions along the segment; client renders travel via travelFraction | ✓ |
| Per-tick server travel + per-tick collision | Goliath moves each tick during a multi-tick active window, resolving collisions per tick | |
| Multi-tick STRIKE window, resolve at end | Stretch activeTicks, still resolve once at the end | |

**Auto-selected:** Relocate-at-strike (recommended default) — per-tick damage is the drain
anti-pattern this milestone deletes; multi-tick windows add timing semantics for no
player-facing gain at 150ms ticks. `[auto] D6-01`

## Lane geometry & aim lock

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed per-size length with overshoot; aim locked at windup entry | Glue computes laneEnd = cast + aim × laneLength before enterWindup; landingX/Z = lane end; zero schema change | ✓ |
| Stop-at-target | Lane ends at the sampled target position | |
| New geometry columns | Store direction/length on the row | |

**Auto-selected:** Fixed length + overshoot (recommended) — stop-at-target reads as homing
and makes near-end sidesteps undodgeable; the segment is fully encoded by cast→landing.
Lane length capped at 8u by `SNAP_DISTANCE = 8` (client mesh snap threshold). Seeds:
length 6.5/7.25/8.0, half-width 1.6/1.8/2.0 (radiusBySize reused). `[auto] D6-02/D6-03`

## Resolver & knockback semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Segment-projection distance test, ALL victims; perpendicular knockback from closest point on centerline | bridges.ts clamp-to-[0,1] math pattern; inclusive edges; bulldoze-aside shove | ✓ |
| pickRayHit reuse | Nearest-only ray pick | |
| Push-along-charge knockback | Carry victims in the charge direction | |

**Auto-selected:** Segment test + perpendicular bulldoze (recommended) — ATK-04/SC3 demand
ALL victims (pickRayHit is nearest-only); carrying victims along the charge re-tags and
reads sticky. `[auto] D6-04/D6-05`

## Kit numbers & selection rhythm

| Option | Description | Selected |
|--------|-------------|----------|
| Role 'skill' sharing cooldownUntilMicros; band 3.5..8.0; listed after leapSlam | After-whiff dash preference emerges from plain band selection; no new column, no weighting code | ✓ |
| Per-attack cooldown columns | New schema per attack | |
| Explicit after-whiff weighting in selectAttack | Special-case selection logic | |

**Auto-selected:** Shared skill cooldown + emergent preference (recommended) — schema churn
with no design need; the deferred 04/05 "dash-after-whiffed-slam" idea falls out free.
Seeds: windup 6 ticks (0.9s), recovery 8, cooldown 6.0s, damage 2.5×, knockback 3.5,
stun 3 ticks. All seed-then-tune. `[auto] D6-06..D6-10`

## Telegraph & charge animation

| Option | Description | Selected |
|--------|-------------|----------|
| Rectangle telegraph (D4-14 fill language) + grounded lunge riding travelFraction | Fill sweeps cast→end over windup; clip = brace crouch → lunge → skid; ATTACK_RENDER gains shape 'lane' + laneHalfWidth | ✓ |
| Arrow/chevron telegraph | Directional glyph instead of the filled lane | |
| Server-interpolated charge positions | Let position echoes carry the travel | |

**Auto-selected:** Rectangle + travelFraction lunge (recommended) — keeps the established
fill-is-countdown language and the proven leap render seam; position echoes at 150ms would
stutter. `[auto] D6-11..D6-13`

## World-edge cases

| Option | Description | Selected |
|--------|-------------|----------|
| Clamp the goliath's lane end (clampToWorld); victims keep D4-11 no-rails | Goliath never relocates out of bounds; knockback edge deaths stay a feature | ✓ |
| Clamp victims too | Safety rails on knockback | |

**Auto-selected:** Clamp goliath only (recommended) — D4-11 is a locked prior decision.
`[auto] D6-14`

---

## Claude's Discretion

- `resolveLane` signature + whether the projection helper is local to `attackHitbox.ts` or
  imported from `bridges.ts`.
- `teleportToLanding` generalization (`move !== 'none'`) vs a sibling `chargeToLanding` flag.
- Lane rectangle mesh construction + fill-sweep technique; pixel-filter legibility check.
- Strike-juice composition (shield clang, dust wake) + juiceColor pick.
- serverSync parity field coverage for the lane entry + ATTACK_RENDER half-width assertion.
- Whether `attack_strike.radius` carries the half-width / whether the wake effect needs the
  cast point from the unit_attack row.
- Inert/unused-field authoring on `shieldDash` for parity sanity.

## Deferred Ideas

- Reposition/strafe AI between attacks — revisit only if the full 3-attack kit still feels
  static in the Phase-6 playtest.
- Camp-enemy FSM conversion (XCMB-01), 3-hit+ chains (XCMB-03) — v2.
- Miss/evasion system — pending user pros/cons decision (todo).
- Reviewed todos (0 folded of 6 matches ≥0.2): BŪSTS orbit v2, raid boss DEFERRED, role
  enforcement DEFERRED, CIEŅA restyle, transcend scaling, miss/evasion — all outside the
  FSM domain or reserved for later milestones (same scope-guardrail ruling as Phases 3/4/5).
