---
status: passed
phase: 08-wind-core
source: [08-VERIFICATION.md]
round: 3
started: 2026-07-14T12:00:00Z
updated: 2026-07-14T12:30:00Z
---

> Round 3 — re-verify after round-2 gap closure (plans 08-10 windless droop + 08-11 projectile→flag impulse). All code-level claims verified against source and full suite green (47 files / 731 tests). Round-1/round-2 history preserved in git and 08-VERIFICATION.md. Scope note (user, round 2): voxel-THICKNESS geometry REJECTED — flat plane reads fine under the pixel filter. Only the two behaviors below plus an FPS sanity check remain, all visual/human reads.

## Current Test

[testing complete]

## Tests

### 1. Windless/lull flag droop (Gap 1, 08-10)
expected: Flag droops between gusts (clear limp-ish hang, not near-horizontal banner); a passing gust lifts it toward taut/streaming then it sags back; ?nowind = full limp hang down the pole. Direction/strength response (round-2 test 1) NOT regressed.
result: pass

### 2. Projectile kick + settle (Gap 2, 08-11)
expected: A projectile flying PAST a camp flag snaps the cloth in the projectile's travel direction, then it decays back to the wind pose over ~0.3-0.6s. Flags far from the projectile are unaffected. Visible under ?nowind too (impulse is additive on top of the wind pose).
result: pass

### 3. FPS sanity near a camp during projectile-heavy combat (D-13)
expected: Unchanged frame feel while shooting near camp flags — no per-frame CPU cost from idle flags (distance-gated disturbFlags + decay loop skips idle flags). Run scripts/fps_playtest.py if suspicious.
result: pass

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
