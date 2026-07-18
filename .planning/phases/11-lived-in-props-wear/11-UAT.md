---
status: testing
phase: 11-lived-in-props-wear
source: [11-VERIFICATION.md]
started: 2026-07-18
updated: 2026-07-18
---

## Current Test

number: 1
name: Footpaths read worn/trampled on real routes
expected: |
  Walk the camp↔plaza↔bridge routes on the LAN build (pnpm build, laragon page — not the dev server).
  Footpaths read worn/trampled — lighter, greener tint than packed-dirt roads, grass thinned but
  blades still poke through, and they never fade.
awaiting: user response

## Tests

### 1. Worn footpaths (WEAR-01)
expected: Walk camp↔plaza↔bridge on the LAN build. Footpaths read worn — lighter/greener tint than packed-dirt roads, grass thinned but blades poke through, never fades.
result: [pending]

### 2. Plaza reads lived-in + passable (WEAR-02, WR-01)
expected: Crates/barrels along the market-tile edge facing the fountain, fences at plaza-boundary/path-entry gaps. Arrangement reads deliberate ("who put this here"), not random. Player paths cleanly around props — NOT boxed into a pocket (confirm the ~14 now-solid market props + new stacks leave passable gaps).
result: [pending]

### 3. Scorch heal + ~2s bend trail feel (WEAR-03/04)
expected: Fight to scorch ground, leave, return after ~1–3 min — scorch still visible on quick return, healed after longer. While running, own grass-bend trail fades in ~2s.
result: [pending]

### 4. Sprint dust puffs, dirt/path only (WEAR-05)
expected: Run over grass (no dust) vs dirt/path/town (subtle ground-hug puffs, not a spray). Append ?nodust to URL → all puffs gone.
result: [pending]

### 5. FPS gate — all ambiance enabled (milestone SC)
expected: Run scripts/fps_playtest.py in a golem-class fight with wind + day/night + audio + wear all on. No FPS regression vs baseline (toggle ?nodust to isolate dust cost).
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
