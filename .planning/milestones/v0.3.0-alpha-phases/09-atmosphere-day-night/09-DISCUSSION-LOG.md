# Phase 9: Atmosphere & Day/Night - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-14
**Phase:** 9-Atmosphere & Day/Night
**Areas discussed:** Cycle length & weighting, Night palette floor, Sky gradient, Fog tuning, Lanterns, Clock source
**Mode:** `--auto` — Claude auto-selected the recommended option for every question (no interactive prompts). Options below record the alternatives considered.

---

## Cycle length & weighting

| Option | Description | Selected |
|--------|-------------|----------|
| ~20min asymmetric, day-weighted | Long day, short dawn/dusk, moderate night; smoothstep keyframes | ✓ |
| ~20min symmetric | Equal-length phases | |
| Shorter/faster cycle | More frequent transitions, more "eventful" | |

**User's choice:** ~20min asymmetric day-weighted (recommended — matches DAYNITE-01 verbatim).
**Notes:** Sun/shadow direction frozen; drift is color+intensity only.

---

## Night palette floor

| Option | Description | Selected |
|--------|-------------|----------|
| Blue moonlight, ~45% exposure floor | Cool ambient, never true dark, combat-readable | ✓ |
| Darker night | More dramatic, risks readability | |
| Barely-dim night | Very safe but weak time-of-day read | |

**User's choice:** Blue moonlight ~40–50% floor (recommended — DAYNITE-03 "palette, not darkness").
**Notes:** Tuned so a golem telegraph stays crisp at midnight.

---

## Sky gradient

| Option | Description | Selected |
|--------|-------------|----------|
| Vertical gradient, bottom = fog color (one source) | Sky-bottom + fog fed by one scratch Color; cannot diverge | ✓ |
| Keep flat background = fog color | Simplest, no horizon depth | |
| Independent sky + fog colors | Two sources, risk of drift | |

**User's choice:** Vertical gradient, single-sourced bottom = fog (recommended — ATMO-02 core contract).
**Notes:** Render technique (dome mesh / gradient texture / shader) left to Claude, provided single-source holds.

---

## Fog tuning

| Option | Description | Selected |
|--------|-------------|----------|
| near beyond gameplay radius, far hides edge | Start near≈80, far ~250–320; telegraphs/enemies/gems untouched | ✓ |
| Aggressive near fog | More atmosphere, risks combat readability | |
| Far-only fog | Edge hidden but little depth | |

**User's choice:** near beyond gameplay radius (recommended — ATMO-01/ATMO-03).
**Notes:** Exact near/far playtest-tuned; fog mutated in place, never reassigned.

---

## Lanterns

| Option | Description | Selected |
|--------|-------------|----------|
| 4–6 warm plaza PointLights at world-build, intensity-faded | Campfire pattern; no runtime add/remove | ✓ |
| Reuse combat light pool | Rejected — pool is combat-owned, growing it = recompile | |
| Emissive-only lantern meshes (no lights) | Cheapest but no warm cast | |

**User's choice:** 4–6 warm plaza PointLights at build (recommended — DAYNITE-04).
**Notes:** `lanternLevel` scalar fades intensity dusk-in/dawn-out.

---

## Clock source

| Option | Description | Selected |
|--------|-------------|----------|
| SDK EventContext reducer timestamp + Date.now() fallback | worldTick timestamp bridged via useGameTableBridge; no server publish | ✓ |
| world_timer table subscription | Rejected — table is PRIVATE, clients can't subscribe (milestone framing was wrong) | |
| Pure Date.now(), no server anchor | Fallback only; drifts between clients | |

**User's choice:** SDK EventContext + Date.now() fallback (recommended — DAYNITE-02).
**Notes:** FIRST research task = verify EventContext carries a usable server timestamp (MEDIUM confidence per ARCHITECTURE.md). Phase computed bigint-modulo before Number(), advanced in game loop, never per React render.

---

## Claude's Discretion

- Keyframe count (4–6), palette hexes, sub-band fractions, fog near/far constants.
- Sky render technique (dome mesh vs gradient texture vs shader) — single-source contract only hard constraint.
- Lantern count (4–6) and exact plaza positions.
- `AmbienceHandles` object shape returned by `createMondstadtWorld`.
- `fireflyLevel`/`lanternLevel` scalar API (design now; consume lanterns only, fireflies deferred to Phase 12).
- `?nodaynight` bisect flag freeze-key choice.

## Deferred Ideas

- Fireflies → Phase 12 (this phase exposes `fireflyLevel` gate scalar, does not consume).
- Ambient-audio time-of-day variants (birds/crickets) → Phase 10 (hook only).
- Weather → deferred milestone-wide.
- 8 todo matches from `todo.match-phase 9` — all false positives (generic keywords), none folded. See CONTEXT.md Reviewed Todos.
