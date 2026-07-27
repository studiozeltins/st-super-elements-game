# Phase 13: Camera Feel - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-20
**Phase:** 13-camera-feel
**Areas discussed:** Pixel-mode handling (locked); FOV-kick trigger, Reduce-motion scope, Lean form (defaulted)

---

## Gray areas presented (multiSelect)

Four phase-specific gray areas offered. Magnitudes/timings pre-locked by CAM-01..04 so
not re-asked. User selected **Pixel-mode handling** only.

| Area | Outcome |
|------|---------|
| FOV-kick trigger | Not selected → documented default (own crit hits + cooldown) |
| Reduce-motion scope | Not selected → documented default (kills 3 new + existing shake; follow OS) |
| Lean form | Not selected → documented default (forward pitch, local only) |
| Pixel-mode handling | **Selected + locked** (see below) |

---

## Pixel-mode handling

User asked what the crawl tradeoff means practically before deciding. Explained: pixel mode
renders low-res + nearest-neighbor upscale; sub-pixel motion flips sampled texels → edges
shimmer. Worst offender = idle breathing on a standing character. Snapping only fixes camera
translation, not model rotations (lean/breathing).

| Option | Description | Selected |
|--------|-------------|----------|
| Reduce magnitude | Keep effects in pixel mode at reduced amplitude; matches CAM-04 "tuned in pixel-filter mode"; some residual crawl | ✓ |
| Fully disable in pixel mode | Camera-feel off when pixel filter on; guaranteed zero crawl; pixel players lose feel | |
| Hybrid: kill breathing, keep rest reduced | Breathing off, lean+FOV reduced | |

**User's choice:** Reduce magnitude
**Notes:** Snapping rejected implicitly (can't clean-snap rotating model). Planner to tune
breathing most conservatively and playtest a standing character in pixel mode.

---

## Skipped areas — documented defaults (user chose "Ready for context")

- **FOV-kick trigger:** fires on player's own crit hits (`kind === 'crit'`/`'pvpCrit'`),
  with a cooldown/rate gate to preserve rarity. Not every hit, not on damage taken.
- **Reduce-motion scope:** toggle zeroes all 3 new effects + existing combat camera shake;
  default follows OS `prefers-reduced-motion` on first load, then persists explicit choice.
- **Lean form:** forward pitch into run direction, local player only; optional lateral bank
  at planner discretion; keep tilt small (broken-horizon caveat vs 2–4° req).

## Claude's Discretion

- Spring constants, magnitudes, pixel-mode reduction factors (all playtest-tuned).
- Optional lateral bank on turns.
- Whether toggle also pins the moving sun.
- Whether breathing extends to remote players (default local only).

## Deferred Ideas

- Lateral bank beyond forward pitch (planner discretion within CAM-01).
- Breathing on remote players.
- Toggle pinning the moving sun (optional polish, not required by CAM-04).
