---
status: diagnosed
phase: 08-wind-core
source: [08-VERIFICATION.md]
round: 2
started: 2026-07-14T11:00:00Z
updated: 2026-07-14T11:45:00Z
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

> **Scope correction (user, mid-diagnosis):** Voxel-THICKNESS geometry is REJECTED — the flat plane reads fine under the pixel filter; do not add depth/voxel geometry. Two real gaps remain: (1) windless droop, (2) projectile reaction (promoted from backlog into this closure).

## Gaps

- truth: "Windless/calm flag droops/hangs limp, never stays rigid horizontal (D-12)"
  status: failed
  reason: "User reported (round 2 test 3): 'false, its ridged all the time' — flag never droops during play. User clarified: no voxel needed, just needs the cloth to droop when there is no wind."
  severity: major
  test: 3
  root_cause: "Drape is gated on uWindStrength, which is a BINARY constant (createWind.ts:47 enabled?1:0, never mutated per-frame). In normal play strength is pinned at 1, so drape maxes at 0.30 (25 deg pitch) between gusts — a flat banner. Real limp hang (drape 1, 83 deg) needs strength 0, which only happens under the ?nowind debug flag, never in play. The flag has no calm/lull droop state during gameplay."
  artifacts:
    - path: src/game/world/assets/createCampFlag.ts
      issue: "drape driven by binary uWindStrength; no continuous calm signal"
    - path: src/game/systems/windMath.ts
      issue: "flagDrape driver is strength, not a continuous low-wind activity signal"
    - path: src/game/systems/createWind.ts
      issue: "strengthUniform is binary 1/0, never eases through the droop regime"
  missing:
    - "Drive drape off a continuous low-wind activity signal (live gust envelope / smoothed local magnitude) that ebbs to ~0 between gusts, still x uWindStrength so ?nowind = full limp"
    - "Cloth sags toward limp during lulls, lifts/streams when a gust passes"
  debug_session: .planning/debug/flag-droop-and-projectile-reaction.md
- truth: "Flag cloth reacts to projectiles flying past — a directional impulse along the projectile's travel, decaying back to the wind pose"
  status: failed
  reason: "User request (round 2 test 4, reaffirmed as in-scope): 'I want flag to react to projectile direction and be affected by passing projectiles'. Promoted from backlog todo into this gap closure at user request."
  severity: major
  test: 4
  root_cause: "No coupling between the projectile system and flag cloth — never built. Projectiles (createEffectSystem.spawnProjectile:242) have .position + normalized velocity and already push world influence via stampGround (grass parting, :305). The same pattern can push a directional impulse to nearby flags; the responder, the per-frame hook, and the shader displacement term are all missing."
  artifacts:
    - path: src/game/world/assets/createCampFlag.ts
      issue: "no projectile-impulse displacement term"
    - path: src/game/systems/createEffectSystem.ts
      issue: "projectile update loop has no disturbFlags hook (stampGround precedent exists)"
    - path: src/game/createGame.ts
      issue: "no wiring of a flag-disturbance callback into the projectile system"
  missing:
    - "disturbFlags(x,z,dirX,dirZ) callback wired into projectile update, gated by distance to camp flags (only flags near an active projectile pay cost)"
    - "Per-flag CPU impulse state -> shader uniform; decaying (~0.3-0.6s) direction-aligned displacement summed on top of the wind pose"
    - "Preserve pooled campFlag material + frozen-matrix rule"
  debug_session: .planning/debug/flag-droop-and-projectile-reaction.md
