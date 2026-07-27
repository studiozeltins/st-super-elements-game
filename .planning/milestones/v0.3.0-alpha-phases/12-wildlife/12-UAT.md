---
status: complete
phase: 12-wildlife
source: [12-VERIFICATION.md]
started: 2026-07-18
updated: 2026-07-20
---

## Current Test

[testing complete]

## Tests

### 1. Butterflies (WILD-01)
expected: Sparse, natural summed-sine drift over grass by day; empty at dusk/night; each is a blue-morpho with painted flapping wings (small, not a square); ?nobugs removes them entirely.
result: pass

### 2. Fireflies (WILD-03)
expected: At dusk/night → glowing, phase-randomized emissive quads; none by day; combat lighting/telegraphs unaffected (no new lights); ?nofireflies off.
result: pass

### 3. SC4 milestone FPS gate
expected: `scripts/fps_playtest.py` golem-class fight with remaining ambiance on (wind+daynight+audio+wear+butterflies+fireflies) — frame rate holds; each ?no* flag removes exactly its system for bisecting.
result: pass

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

## Notes

- WILD-02 (ground birds / startle-flush + wing SFX) was CUT during Phase 12
  verification (2026-07-20, user decision): the bird entity never read right
  (static crow had no wing rig; three.js animated birds are flying-pose only,
  wrong for ground pecking). The whole bird system + crow/Parrot/Stork assets +
  wildlifeMath bird helpers + flush wiring were removed (commit 705117c). Phase
  12 wildlife now ships butterflies + fireflies only. Ambient birdSONG audio
  (createAmbience.birdChirp) is retained — atmosphere, not a visible entity.
