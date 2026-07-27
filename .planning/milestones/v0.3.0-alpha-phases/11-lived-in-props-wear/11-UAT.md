---
status: complete
phase: 11-lived-in-props-wear
source: [11-VERIFICATION.md]
started: 2026-07-18
updated: 2026-07-18
---

## Current Test

[testing complete]

## Tests

### 1. Worn footpaths (WEAR-01)
expected: Walk camp↔plaza↔bridge on the LAN build. Footpaths read worn — lighter/greener tint than packed-dirt roads, grass thinned but blades poke through, never fades.
result: pass

### 2. Plaza reads lived-in + passable (WEAR-02, WR-01)
expected: Crates/barrels along the market-tile edge facing the fountain, fences at plaza-boundary/path-entry gaps. Arrangement reads deliberate ("who put this here"), not random. Player paths cleanly around props — NOT boxed into a pocket.
result: pass
note: "Furniture (stalls/cafe tables/stools/benches/planters) made solid + spaced; nesting/in-house fixed via obstacle-aware placement; stalls raised so character no longer pokes through the awning."

### 3. Scorch heal + ~2s bend trail feel (WEAR-03/04)
expected: Fight to scorch ground, leave, return after ~1–3 min — scorch still visible on quick return, healed after longer. While running, own grass-bend trail fades in ~2s.
result: pass

### 4. Sprint dust puffs, dirt/path only (WEAR-05)
expected: Run over grass (no dust) vs dirt/path/town (subtle ground-hug puffs, not a spray). Append ?nodust to URL → all puffs gone.
result: pass

### 5. FPS gate — all ambiance enabled (milestone SC)
expected: Golem-class fight with wind + day/night + audio + wear all on. No FPS regression vs baseline (toggle ?nodust to isolate dust cost).
result: pass
note: "A door-detail draw-call regression (24-30fps in city) was found and fixed mid-UAT by merging door geometry to ~7 draw calls/door; user confirmed FPS restored. fps_playtest.py available for a deeper pass if desired."

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]
