---
status: testing
phase: 08-wind-core
source: [08-VERIFICATION.md]
started: 2026-07-14T08:15:00Z
updated: 2026-07-14T08:15:00Z
---

## Current Test

number: 1
name: Grass at rest between gusts vs pre-phase build (D-01 hard gate)
expected: |
  Identical feel — no visible change to base sway
awaiting: user response

## Tests

### 1. Grass at rest between gusts vs pre-phase build (D-01 hard gate)
expected: Identical feel — no visible change to base sway
result: [pending]

### 2. Watch a wide grass field for ~60s (WIND-02 / D-03)
expected: Gust arrives as a broad front sweeping across over ~3-5s; near blades lean before far blades
result: [pending]

### 3. Gust strength + cadence over ~3 minutes (D-04 / D-02)
expected: Peak lean ~2-3x base, telegraph readable; gusts every 30-60s, never on a beat
result: [pending]

### 4. Visit a camp during a gust; alt-tab 30s and return (WIND-03 / WIND-01)
expected: Flag faster than grass, canopy slower/subtler with rigid trunk and tops moving most, smoke drifts as it rises; all respond to the same passing gust; no desync after alt-tab
result: [pending]

### 5. Watch drift/travel direction over several minutes (D-05)
expected: Direction changes slowly — not a fixed fan
result: [pending]

### 6. Reload with ?nowind, then ?nosmoke (D-12)
expected: ?nowind kills gust lean/flap/canopy sway/smoke lateral drift (grass base sway remains — D-12 deviation from SC4's literal wording, confirm intent); ?nosmoke removes smoke entirely
result: [pending]

### 7. FPS sanity vs pre-phase (D-13)
expected: Unchanged frame feel, no gust-arrival hitches; scripts/fps_playtest.py if suspicious
result: [pending]

### 8. View a camp flag from behind (assumption A2)
expected: Cloth not black on the back face
result: [pending]

### 9. StrictMode/reconnect coherence spot-check (npm run dev, double-mount)
expected: Flags flap and canopies sway in the dev server too — the environment where the old CR-01/CR-02 freeze always reproduced
result: [pending]

## Summary

total: 9
passed: 0
issues: 0
pending: 9
skipped: 0
blocked: 0

## Gaps
