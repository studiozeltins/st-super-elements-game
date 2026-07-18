# Phase 11: Lived-in Props & Wear - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-18
**Phase:** 11-lived-in-props-wear
**Mode:** `--all --auto` (all gray areas auto-selected; recommended option chosen per area)
**Areas discussed:** Footpath render, Bend-trail feel, Scorch regrow, Plaza props, Dust puffs + surface

---

## Footpath render (WEAR-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse roads.ts "worn path" tier | Add a lighter, narrower road category; reuse roadFactor + terrainColorAt tint + grass rejection | ✓ |
| Separate path subsystem | New spline system independent of roads | |

**Choice:** roads.ts worn-path tier (recommended).
**Notes:** roads.ts already does spline→factor→grass-thinning + ground tint; footpaths ARE worn routes. Second system duplicates three seams. Softer thinning so blades poke through (trampled, not bare).

---

## Bend-trail feel (WEAR-04) — resolves STATE open decision

| Option | Description | Selected |
|--------|-------------|----------|
| Retune shared clock ~2s, no 2nd texture | Drop DECAY_PER_FRAME_AT_60 to ~2s feel; one clock for all bend sources | ✓ |
| Keep shared 4–5s clock | Leave decay as-is | |
| Second influence texture | Dedicated 2s trail channel separate from other bend | |

**Choice:** retune shared clock to ~2s, no second texture (recommended).
**Notes:** B (flatten) channel already IS the bend trail. 4–5s misses the "~2s" spec. Second texture = GPU cost + complexity for zero benefit; all bend sources want the same feel. Pinned by groundInfluenceMath pure-twin test.

---

## Scorch regrow (WEAR-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Raise shared constant 25s→~75s | Scorch + wear heal over ~2–3 min; keep them sharing the clock | ✓ |
| Keep 25s (~1min) | Leave regrow as-is | |
| Split scorch vs wear clocks | Independent regrow rates | |

**Choice:** raise shared WEAR_REGROW_TIME_CONSTANT_SECONDS 25→~75 (recommended).
**Notes:** "over minutes" per SC. Both scorch + wear-A are "battle/traffic wear healing" — keep shared, simplest. SCORCH_PER_STRIKE unchanged.

---

## Plaza props (WEAR-02)

| Option | Description | Selected |
|--------|-------------|----------|
| 3 voxel assets (crate/barrel/fence), frozen-matrix, deterministic anchors | Mirror createCampfire voxel factories; reuse existing lanterns; placed at market edge / path gaps | ✓ |
| Minimal (crates only) | Fewer new assets | |
| Rich prop set (carts, stalls, signs) | More variety, more new assets | |

**Choice:** crate/barrel/fence + existing lanterns (recommended).
**Notes:** Deterministic off WORLD_DECOR_SEED, placed before world freeze via placeAsset/addInstancedMatrices. Answers "who put this here": stacked at market edge, fence at path/plaza gaps. Counts = Claude discretion.

---

## Dust puffs + surface (WEAR-05)

| Option | Description | Selected |
|--------|-------------|----------|
| New dedicated pool + shared surfaceAt() classifier + ?nodust | Ground-hug puff pool (mirror smoke), cheap grass/dirt/town classifier reused by dust + footstep audio | ✓ |
| Reuse createDebrisSystem | Cube-shatter spawn | |
| Reuse createEffectSystem | Combat FX particle spawn | |

**Choice:** new dedicated pool + surfaceAt() (recommended).
**Notes:** Debris = wrong (cube shatter); effect system = combat FX. Reuse smoke's pool *pattern*, ground-hugging. surfaceAt() is GPU-read-free (roadFactor + footpath factor + isInTown), single source, also upgrades the already-wired footstep-audio surface seam (bonus). ?nodust bisect flag.

---

## Claude's Discretion

- Exact retuned decay/regrow numeric values — hit the feel (~2s bend, ~2–3min scorch), pin behavior in tests.
- Prop counts, plaza arrangement, footpath tint hue, dust pool size / sprite look.
- Whether createBarrel ships or crate+fence suffice.

## Deferred Ideas

- Weather (rain/puddles) WTHR-01 — deferred at milestone scoping.
- Time-of-day gameplay hooks TODG-01 — needs server work, client-only violation.
- New per-surface footstep-audio *design* — bonus wiring only here; belongs to an audio phase.
- Reviewed-not-folded todos (4 keyword false-positives): boost-orbit-v2, raid-boss-DEFERRED, role/poise-DEFERRED, flower-blade-color — all out of scope for props/wear.
