---
created: 2026-07-07T00:00:00.000Z
title: BŪSTS orbit v2 — random paths + varied star shapes
area: game
files:
  - src/game/entities/createBoostOrbit.ts
---

## Problem

The in-world BŪSTS orbit (shipped in commit 79a6e7f) is v1: purple shard-stars
follow a single flat circular path around the player, speed scaling with
(1 − health fraction). During the session the user asked to *start* with the
circle but explicitly wants it to evolve: the path should change randomly over
time, and the orbiting stars should take varied shapes — so the effect reads as
alive and distinctive, not a static ring.

## Solution

TBD. Directions discussed:
- Replace the fixed circle with a path that mutates over time (e.g. Lissajous /
  noise-warped orbit, occasional path swaps) while staying readable.
- Give stars varied shapes (not all the same 4-point ◈) — a small shape pool,
  maybe per-level or random per star.
- Keep the health-reactive speed (lower HP → faster) and the depth-occlusion
  (depthTest already on) from v1.
- Keep it cheap (sprite-based, no per-frame allocations).
Deterministic randomness note: this is client-only VFX, so `Math.random` is fine
here (unlike server reducers).
