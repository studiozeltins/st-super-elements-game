---
status: complete
phase: 08-wind-core
source: [08-VERIFICATION.md]
round: 2
started: 2026-07-14T11:00:00Z
updated: 2026-07-14T11:30:00Z
---

> Round 2 — re-verify after UAT gap closure (plans 08-08/08-09). Round 1 results (5 pass / 3 issues / 1 skip) and root-cause diagnoses are preserved in git history (commits 397257f, 090596e) and summarized in 08-VERIFICATION.md. The beige-blade cosmetic gap was dispositioned out of phase (pre-existing flower art — todo `flower-blade-color-art-pass.md`).

## Current Test

[testing complete]

## Tests

### 1. Flag answers gust direction + strength like the smoke does (reopened UAT 4/5/9)
expected: Flag streams the same direction smoke kinks; harder gusts swing harder; direction follows the slow wander over minutes
result: pass
note: "Direction/strength response confirmed. User added forward-looking feedback (routes to tests 3 + 4): flag reads paper-thin, wants voxel thickness for a natural look; and at ?nowind it still stands upright — wants it to drape/hang."

### 2. Four-consumer coherence at a camp during one gust; alt-tab 30s (SC1/SC3)
expected: Flag/grass/canopy/smoke all answer the same passing gust with distinct character; no desync
result: pass

### 3. ?nowind limp drape (reopened UAT 6, D-12)
expected: Cloth hangs limp down the pole with faint micro-sway, never rigid horizontal; smoke drift + flag wind motion killed; grass base sway remains
result: issue
reported: "false, its ridged all the time, and looks like thin paper, but I want woxel style sway drupe, animation"
severity: major
note: "Two defects bundled: (1) ?nowind drape does not visually land — flag stays rigid horizontal, never hangs limp down the pole; (2) geometry reads paper-thin, user wants voxel-thickness cloth with voxel-style sway/drape animation (overlaps test 4)."

### 4. Voxel cloth read (UAT 8)
expected: Chunky stepped facets, not a smooth sheet
result: issue
reported: "fail, also I want flag, to react to projectile directiin and be affected by pasing by projectales"
severity: major
note: "Voxel read fails — cloth still reads smooth/thin, not chunky faceted. CLOTH_BANDS=6 + flatShading on a 12x4 single plane is insufficient; needs real voxel-thickness geometry (see test-3 paper-thin gap). Projectile-reaction is a NEW feature beyond wind-core scope — captured to backlog, not a phase-8 gap."

### 5. FPS sanity after shader rework (D-13)
expected: Unchanged frame feel; scripts/fps_playtest.py if suspicious
result: pass

### 6. Flag back face (A2 — deferred from round 1, now more exposed by the yaw)
expected: Cloth not black from behind
result: pass

## Summary

total: 6
passed: 4
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Windless flag hangs limp/drapes down the pole (?nowind or gust lull), never rigid horizontal (D-12)"
  status: failed
  reason: "User reported (round 2 test 3): 'false, its ridged all the time' — flag stays rigid horizontal at ?nowind, drape term does not visually land"
  severity: major
  test: 3
  artifacts: [src/game/world/assets/createCampFlag.ts, src/game/systems/windMath.ts]
  missing: []  # Filled by diagnosis
- truth: "Flag cloth reads as solid voxel-thickness geometry with voxel-style sway/drape, not a paper-thin sheet"
  status: failed
  reason: "User reported (round 2 tests 1/3, restated across session): flag is 'paper thin' / 'looks like thin paper'; wants 'woxel style sway drupe animation' — solid chunky cloth, not a flat single-sided plane"
  severity: major
  test: 3
  artifacts: [src/game/world/assets/createCampFlag.ts]
  missing: []  # Filled by diagnosis
