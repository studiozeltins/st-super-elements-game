# Phase 8: Wind Core - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-14
**Phase:** 8-Wind Core
**Areas discussed:** Gust feel & baseline, Wind direction, Canopy & flag look, Smoke column look, Gust strength at peak, Bisect flag granularity, Smoke draw distance

---

## Area selection

All 4 initially-presented areas selected. User added a free-text constraint at selection
time: **"please be fps aware and performance needs to be consistent"** — captured as D-13
(consistent frame cost, no spikes) and applied across all subsequent choices.

---

## Gust feel & baseline

| Option | Description | Selected |
|--------|-------------|----------|
| Gentle + clear gusts (Recommended) | Mostly calm sway, distinct gusts every ~10-20s | |
| Constantly breezy | Always visible motion, gusts blend in | |
| Near-still + rare strong gusts | Mostly quiet, dramatic waves every ~30-60s | ✓ |

**User's choice:** Near-still + rare strong gusts

Follow-up 1 — near-still conflicts with grass's current constant sway:

| Option | Description | Selected |
|--------|-------------|----------|
| Keep current grass, gusts on top (Recommended) | Grass keeps today's sway; near-still applies to flags/smoke/canopy | ✓ |
| Yes, calm everything down | Reduce base grass sway too — visible change | |

Follow-up 2 — gust wave shape:

| Option | Description | Selected |
|--------|-------------|----------|
| Broad slow front (Recommended) | ~30-50 unit wave crossing over ~3-5s, Tsushima-style | ✓ |
| Narrow fast ripple | ~10-15 unit wave, ~1-2s crossing, punchier | |

---

## Wind direction

| Option | Description | Selected |
|--------|-------------|----------|
| Slow wander (Recommended) | Drifts a few °/min; deterministic from wind clock | ✓ |
| Fixed forever | One constant direction | |
| Fixed per session | Random at load, then constant | |

**User's choice:** Slow wander

---

## Canopy & flag look

| Option | Description | Selected |
|--------|-------------|----------|
| Shader vertex sway (Recommended) | Height-weighted GPU displacement, zero CPU | ✓ |
| Whole-canopy rigid tilt | CPU windmill-blades pattern, per-tree matrix cost | |

| Option | Description | Selected |
|--------|-------------|----------|
| Cloth ripple (Recommended) | Phase gradient along flag length, subdivided geometry | ✓ |
| Rigid rock | Whole flag swings stiff | |

---

## Smoke column look

| Option | Description | Selected |
|--------|-------------|----------|
| Chunky voxel puffs (Recommended) | Stepped size+opacity, pixel-filter safe | ✓ |
| Soft fading billboards | Smooth alpha gradient, banding risk | |

| Option | Description | Selected |
|--------|-------------|----------|
| Thin wisp (Recommended) | ~8-12 puffs per fire, modest height | ✓ |
| Hearty column | ~20-30 puffs, landmark plume | |

---

## Second-round areas (user chose "Explore more gray areas")

### Gust strength at peak

| Option | Description | Selected |
|--------|-------------|----------|
| Pronounced lean (Recommended) | ~2-3× base sway; no cartoon flattening | ✓ |
| Dramatic near-flat bow | Maximum spectacle; glitch-read + combat-distraction risk | |

### Bisect flag granularity

| Option | Description | Selected |
|--------|-------------|----------|
| ?nowind + ?nosmoke (Recommended) | Separate switches — sway cost vs smoke render cost bisect | ✓ |
| Single ?nowind only | One flag for everything | |

### Smoke draw distance

| Option | Description | Selected |
|--------|-------------|----------|
| Radius-culled (Recommended) | ~40-60 unit radius, pool reused across fires | ✓ |
| All campfires always | Every fire smokes everywhere | |

---

## Claude's Discretion

- Exact tuning constants (gust amplitude/interval/wavelength, wander rate) — playtest-tuned
  in `windMath.ts`
- Grass sway direction: follow wander vs keep fixed axis (avoid grass regression)
- Flag subdivision count, smoke pool size, exact cull radius
- Gust envelope API contract for Phase 10 audio

## Deferred Ideas

None — discussion stayed within phase scope. Six keyword-matched pending todos reviewed
and judged false positives (see CONTEXT.md Reviewed Todos).
