---
status: complete
phase: 08-wind-core
source: [08-VERIFICATION.md]
started: 2026-07-14T08:15:00Z
updated: 2026-07-14T06:04:37.888Z
---

## Current Test

[testing complete]

## Tests

### 1. Grass at rest between gusts vs pre-phase build (D-01 hard gate)
expected: Identical feel — no visible change to base sway
result: pass
note: "user: possible lower grass density, but maybe also in original — sway itself unchanged; density not touched by this phase"

### 2. Watch a wide grass field for ~60s (WIND-02 / D-03)
expected: Gust arrives as a broad front sweeping across over ~3-5s; near blades lean before far blades
result: pass

### 3. Gust strength + cadence over ~3 minutes (D-04 / D-02)
expected: Peak lean ~2-3x base, telegraph readable; gusts every 30-60s, never on a beat
result: pass
note: "user: hard to tell looking at only grass, but sways sometimes faster sometimes not"

### 4. Visit a camp during a gust; alt-tab 30s and return (WIND-03 / WIND-01)
expected: Flag faster than grass, canopy slower/subtler with rigid trunk and tops moving most, smoke drifts as it rises; all respond to the same passing gust; no desync after alt-tab
result: issue
reported: "there are these beige grass blades, they look out of place, I think, they should be maybe darker green with gradient, but regarding flag, fail it does not sway with wind gusts, like fireplace smoke!"
severity: major

### 5. Watch drift/travel direction over several minutes (D-05)
expected: Direction changes slowly — not a fixed fan
result: issue
reported: "fail it does not sway with wind gusts direction, like fireplace smoke, reacts to wind gusts"
severity: major
note: "clarifies test 4: smoke DOES react to gusts (good reference); flag does NOT follow gust strength/direction"

### 6. Reload with ?nowind, then ?nosmoke (D-12)
expected: ?nowind kills gust lean/flap/canopy sway/smoke lateral drift (grass base sway remains — D-12 deviation from SC4's literal wording, confirm intent); ?nosmoke removes smoke entirely
result: issue
reported: "?nowind kills smoke sway direction, but for flag kills wiggle, yes, when wind is on flag is wiggling, but not following wind/gust direction. when no wind, flag should like cloth hang down."
severity: minor
note: "bisect mechanics themselves PASS (?nowind kills smoke drift + flag wiggle); issue is flag pose: windless flag should hang limp like cloth, not stay rigid horizontal"

### 7. FPS sanity vs pre-phase (D-13)
expected: Unchanged frame feel, no gust-arrival hitches; scripts/fps_playtest.py if suspicious
result: pass

### 8. View a camp flag from behind (assumption A2)
expected: Cloth not black on the back face
result: skipped
reason: "Fixed top-down camera — cannot rotate to see back face; only observable when wind direction flips the flag. User also requests more flag detail (maybe voxel cloth)."

### 9. StrictMode/reconnect coherence spot-check (npm run dev, double-mount)
expected: Flags flap and canopies sway in the dev server too — the environment where the old CR-01/CR-02 freeze always reproduced
result: pass
note: "freeze fix works — flag animates in dev server. User re-confirmed the direction bug: 'flag is not flapping its wiggling in the same direction, it does not obey wind gust direction!' — covered by gaps for tests 4/5"

## Summary

total: 9
passed: 5
issues: 3
pending: 0
skipped: 1
blocked: 0

## Gaps

- truth: "Camp flag responds to wind gusts (flaps faster on shared gust phase — WIND-03/WIND-01)"
  status: failed
  reason: "User reported: regarding flag, fail it does not sway with wind gusts, like fireplace smoke! (ambiguous whether smoke also fails to respond to gusts — diagnose both flag gust response and smoke gust kink)"
  severity: major
  test: 4
  artifacts: []  # Filled by diagnosis
  missing: []    # Filled by diagnosis
- truth: "Grass blade coloring reads coherent (no out-of-place beige blades)"
  status: failed
  reason: "User reported: beige grass blades look out of place, should maybe be darker green with gradient (likely pre-existing art, not introduced by phase 8 — cosmetic)"
  severity: cosmetic
  test: 4
  artifacts: []  # Filled by diagnosis
  missing: []    # Filled by diagnosis
- truth: "Flag flap follows gust strength and wind direction from the shared clock (D-05/WIND-03) — smoke is the working reference"
  status: failed
  reason: "User reported (tests 5+9): flag wiggles on a fixed axis regardless of wind/gust direction — 'not flapping, wiggling in the same direction, does not obey wind gust direction'. Smoke reacts to gusts correctly (working reference)."
  severity: major
  test: 5
  artifacts: []  # Filled by diagnosis
  missing: []    # Filled by diagnosis
- truth: "Windless flag hangs down limp like cloth (?nowind or gust lull); wind lifts and ripples it"
  status: failed
  reason: "User reported (test 6): when no wind, flag should like cloth hang down — currently stays rigid horizontal with wiggle removed"
  severity: minor
  test: 6
  artifacts: []  # Filled by diagnosis
  missing: []    # Filled by diagnosis
- truth: "Flag cloth has more visual detail (voxel-style cloth to match game aesthetic)"
  status: failed
  reason: "User request (test 8): I want more details for flag, make it maybe voxels also the cloth — enhancement, current cloth reads too plain"
  severity: cosmetic
  test: 8
  artifacts: []  # Filled by diagnosis
  missing: []    # Filled by diagnosis
