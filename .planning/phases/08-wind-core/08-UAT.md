---
status: testing
phase: 08-wind-core
source: [08-VERIFICATION.md]
round: 2
started: 2026-07-14T11:00:00Z
updated: 2026-07-14T11:00:00Z
---

> Round 2 — re-verify after UAT gap closure (plans 08-08/08-09). Round 1 results (5 pass / 3 issues / 1 skip) and root-cause diagnoses are preserved in git history (commits 397257f, 090596e) and summarized in 08-VERIFICATION.md. The beige-blade cosmetic gap was dispositioned out of phase (pre-existing flower art — todo `flower-blade-color-art-pass.md`).

## Current Test

number: 1
name: Flag answers gust direction + strength like the smoke does (reopened UAT 4/5/9)
expected: |
  Flag streams the same direction smoke kinks; harder gusts swing harder; direction follows the slow wander over minutes
awaiting: user response

## Tests

### 1. Flag answers gust direction + strength like the smoke does (reopened UAT 4/5/9)
expected: Flag streams the same direction smoke kinks; harder gusts swing harder; direction follows the slow wander over minutes
result: [pending]

### 2. Four-consumer coherence at a camp during one gust; alt-tab 30s (SC1/SC3)
expected: Flag/grass/canopy/smoke all answer the same passing gust with distinct character; no desync
result: [pending]

### 3. ?nowind limp drape (reopened UAT 6, D-12)
expected: Cloth hangs limp down the pole with faint micro-sway, never rigid horizontal; smoke drift + flag wind motion killed; grass base sway remains
result: [pending]

### 4. Voxel cloth read (UAT 8)
expected: Chunky stepped facets, not a smooth sheet
result: [pending]

### 5. FPS sanity after shader rework (D-13)
expected: Unchanged frame feel; scripts/fps_playtest.py if suspicious
result: [pending]

### 6. Flag back face (A2 — deferred from round 1, now more exposed by the yaw)
expected: Cloth not black from behind
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
