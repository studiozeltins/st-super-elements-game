---
status: testing
phase: 12-wildlife
source: [12-VERIFICATION.md]
started: 2026-07-18
updated: 2026-07-18
---

## Current Test

number: 1
name: Butterflies — sparse, day-only, spawn/despawn near player
expected: |
  Roam grass by day: butterflies drift naturally, read as SPARSE (an encounter, not
  wallpaper), spawn/despawn near the player, NONE at night. ?nobugs removes them.
awaiting: user response

## Tests

### 1. Butterflies (WILD-01)
expected: Rare, natural summed-sine drift over grass by day; empty at dusk/night; ?nobugs removes them entirely.
result: [pending]

### 2. Bird flush + wing sfx (WILD-02)
expected: Sprint through grass → 2-4 birds burst up a rising arc + ONE wing one-shot; they despawn; continuous running does NOT retrigger flush spam (~6s debounce); ?nobirds off.
result: [pending]

### 3. Fireflies (WILD-03)
expected: At dusk/night → glowing, phase-randomized emissive quads; none by day; combat lighting/telegraphs unaffected (no new lights); ?nofireflies off.
result: [pending]

### 4. SC4 milestone FPS gate
expected: `scripts/fps_playtest.py` golem-class fight with ALL ambiance on (wind+daynight+audio+wear+wildlife) — frame rate holds; each ?no* flag removes exactly its system for bisecting. (WR-01 per-frame palette alloc already fixed in code.)
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
