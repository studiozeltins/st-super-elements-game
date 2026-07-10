---
phase: 05-swordswing-swordswirl-combo
plan: 02
subsystem: rendering
tags: [client, threejs, animation, webaudio, juice, frost]

# Dependency graph
requires:
  - phase: 04-attack-state-machine-leapslam
    provides: "AttackAnimationView (with attackId) + optional animateAttack hook, leapSlam clip + neutral-restore contract, handleAttackStrike full-juice handler, playSlam procedural SFX"
provides:
  - "animateAttack attackId dispatcher: swordSwing → animateSwing, swordSwirl → animateSwirl, default → animateLeapSlam (moved verbatim)"
  - "animateSwing clip (D5-16): arm wind-back + light crouch → fast forward slash + torso lean → eased settle"
  - "animateSwirl clip (D5-16): torso counter-coil + arm flare → full 360° torso yaw ending at 2π ≡ 0 → exhausted squash settle"
  - "resetAttackPose neutral-restore extension: torso lean/yaw + arm x/z zeroed in BOTH animateMovement and animateDeath (Pitfall 10)"
  - "AudioSystem.playSwing (0.2s bandpass whoosh, lightest) + playSwirl (0.4s swell + soft 90→55Hz thump, medium)"
  - "handleAttackStrike three juice tiers keyed by strike.attackId: swing = 10 particles + 0.15 shake + NO shockwave, swirl = 18 particles + radius shockwave + 0.3 shake, default = existing full slam package"
affects: [05-04, 05-05]

# Tech tracking
tech-stack:
  added: []
  patterns: ["attackId clip dispatch: animateAttack branches on view.attackId with unknown ids falling back to the slam clip (back-compat with pre-update rows)", "resetAttackPose shared restore: one helper zeroes every clip-only transform, called from both animateMovement and animateDeath", "SFX tiering: each attack's procedural recipe scales gain/length under the slam's (swing 0.25 < swirl 0.4 < slam 0.8 peak gain)"]

key-files:
  created: []
  modified:
    - src/game/systems/createGoliathRenderer.ts
    - src/game/audio/createAudioSystem.ts
    - src/game/createGame.ts

key-decisions:
  - "Swirl strike yaw lerps from -SWIRL_COIL to exactly 2π so the spin ends visually neutral (2π ≡ 0) — recovery holds yaw at 0 and never spins backwards"
  - "Swirl spins model.body (the named torso mesh) plus arm-flare rotation.z — never the outer group, which the entity renderer owns via lookAt"
  - "Juice magnitudes live as named constants next to SHAKE_START_MAGNITUDE in createGame.ts, not in the plan-05-04 client mirror (RESEARCH Open Question 2: feel numbers, not parity material)"
  - "createNoiseSource extracted as a shared module-level helper — playSlam refactored in place to use it (behavior-identical; CLAUDE.md refactor-over-duplicate rule)"

patterns-established:
  - "Neutral-restore extension protocol: any new clip transform beyond applyCrouch/group Y gets a reset line in resetAttackPose, keeping the 04-05 contract provable from one function"
  - "move:'none' clips ride view.phaseProgress only — travelFraction stays leap-exclusive (2 occurrences, unchanged)"

requirements-completed: []

coverage:
  - id: D1
    description: "Distinct wind-back→slash clip for swordSwing and coil→360° spin clip for swordSwirl, dispatched on view.attackId (SC3, D5-16, ANIM-03)"
    requirement: "ATK-02"
    verification:
      - kind: source-assertion
        ref: "src/game/systems/createGoliathRenderer.ts#animateSwing/animateSwirl/animateAttack dispatcher"
        status: pass
      - kind: human
        ref: "Visual confirmation deferred to the plan 05-05 migrated-DB playtest checkpoint"
        status: deferred
    human_judgment: true
  - id: D2
    description: "Neutral restore covers every new transform — torso yaw/lean + arm rotation x/z reset in both animateMovement and animateDeath (Pitfall 10)"
    requirement: "ATK-02"
    verification:
      - kind: source-assertion
        ref: "src/game/systems/createGoliathRenderer.ts#resetAttackPose (called from both restore sites)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Three strike-juice tiers keyed by attackId + two SFX variants smaller than the slam's (ANIM-04); swing has NO shockwave, swirl shockwaves at strike.radius, slam byte-equivalent default"
    requirement: "ATK-03"
    verification:
      - kind: source-assertion
        ref: "src/game/createGame.ts#handleAttackStrike + src/game/audio/createAudioSystem.ts#playSwing/playSwirl"
        status: pass
      - kind: human
        ref: "Audible/feel confirmation deferred to the plan 05-05 playtest checkpoint"
        status: deferred
    human_judgment: true

# Metrics
duration: 9min
completed: 2026-07-10
status: complete
---

# Phase 5 Plan 02: Swing/Swirl Clips, Juice Tiers & SFX Summary

attackId-dispatched procedural goliath clips (swing wind-back→slash, swirl coil→360° torso spin) plus three-tier strike juice and two procedural WebAudio SFX variants, with the neutral-restore contract extended so no clip transform survives past an attack.

## Task Commits

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Two procedural clips + attackId dispatcher + neutral-restore extension | 7ad9e21 | src/game/systems/createGoliathRenderer.ts |
| 2 | Per-attack strike juice + two WebAudio SFX variants | 516bf63 | src/game/createGame.ts, src/game/audio/createAudioSystem.ts |

## What Was Built

**createGoliathRenderer.ts** — `animateAttack` is now a dispatcher on `view.attackId`: the existing leapSlam body moved verbatim into `animateLeapSlam` (single `applyCrouch(view.phaseProgress²)` windup block, `travelFraction` count unchanged at 2). `animateSwing` drives the right (sword) arm: windup winds `rotation.x` back with a light crouch (progress² ease-in), strike lerps the arm wind-back→follow-through with a torso `rotation.x` lean, recovery eases both to neutral. `animateSwirl` coils `model.body.rotation.y` against the spin with flared arms (`rotation.z`, opposite signs) in windup, releases through a full 360° torso yaw ending exactly at 2π (visually neutral, so recovery never counter-spins), and settles with an exhausted squash over the chain's long punish window. The spin rotates the named torso mesh, never the outer group (the entity renderer owns group rotation via lookAt). New `resetAttackPose()` zeroes torso lean/yaw + arm x/z and is called from BOTH `animateMovement` and `animateDeath` — a death mid-spin or an ended chain leaves a neutral rig. Camp enemies untouched (hook stays optional). File is 182 functional LOC (≤300).

**createAudioSystem.ts** — `playSwing`: a 0.2s bandpass-filtered noise sweep rising 500→2200Hz at 0.25 peak gain (lightest). `playSwirl`: a 0.4s bandpass swell (300→1200→500Hz, 0.4 peak) plus a 90→55Hz sine thump at 0.35 gain — softer and higher than the slam's 70→40Hz 0.8-gain hit. Both follow the playSlam recipe exactly: running-context guard, `exponentialRampToValueAtTime` envelopes, fire-and-forget short-lived nodes. Shared `createNoiseSource(ctx, seconds)` helper extracted; `playSlam` refactored to use it with identical behavior.

**createGame.ts** — `handleAttackStrike` branches on `strike.attackId`: `swordSwing` → 10-particle Frost burst + `flashStrike` + 0.15 shake + `playSwing` and NO shockwave (a circular shockwave misreads a cone — RESEARCH Pattern 6); `swordSwirl` → 18-particle burst + `spawnShockwave(landing, strike.radius, …)` (the swirl IS a circle) + 0.3 shake + `playSwirl`; default (leapSlam + unknown ids) → the existing full package verbatim (burst 26 + shockwave + flash + `SHAKE_START_MAGNITUDE` + `playSlam`). `lastStrike` bookkeeping and the once-per-event guarantee comment hold for all branches. Magnitudes are named handler-local constants. App.tsx untouched (verified via git diff).

## Verification

- All plan grep gates pass: `swordSwing`/`swordSwirl` present in the renderer dispatcher; `travelFraction` occurrence count unchanged (2); exactly one slam windup crouch block; `playSwing`/`playSwirl` 3 refs each (interface + implementation + return); swing branch contains no `spawnShockwave`, swirl branch calls it once
- `pnpm vitest run src/game/data/__tests__/serverSync.test.ts` — 149/149 green
- Full `tsc --noEmit` passed clean (extra check beyond plan; the exclusive Wave-3 build gate in 05-05 still stands)
- Visual/audible feel confirmation deferred to the plan 05-05 migrated-DB playtest checkpoint (SC3)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing cleanup/DRY] Extracted shared `createNoiseSource` helper**
- **Found during:** Task 2
- **Issue:** Adding two more noise-based SFX would have duplicated playSlam's inline buffer-fill loop three times, violating the CLAUDE.md refactor-over-duplicate rule
- **Fix:** Module-level `createNoiseSource(ctx, seconds)`; playSlam refactored in place, behavior-identical
- **Files modified:** src/game/audio/createAudioSystem.ts
- **Commit:** 516bf63

**2. [Rule 1 - Stale comment] Audio file header updated**
- **Found during:** Task 2
- **Issue:** Header described the module as "slam SFX" only — stale once three tiers exist
- **Fix:** Header now names the three-tier contract (swing lightest, swirl medium, slam full)
- **Files modified:** src/game/audio/createAudioSystem.ts
- **Commit:** 516bf63

## Known Stubs

None functional. Note (intentional, by plan design): the new clips/juice/SFX branches are unreachable until plan 05-03 publishes the server module that emits `swordSwing`/`swordSwirl` attackIds — the client compiles and runs against the EXISTING server, where every strike takes the default (leapSlam) path.

## Threat Flags

None — render-only changes on the read path; no new network surface, auth path, or schema change. T-05-04 mitigated (clips ride server-derived `view.phaseProgress`; juice fires once per server `attack_strike` event). T-05-05 mitigated (pure transform math on cached node refs; SFX nodes short-lived fire-and-forget; zero identity compares added).

## Self-Check: PASSED

- src/game/systems/createGoliathRenderer.ts — FOUND
- src/game/audio/createAudioSystem.ts — FOUND
- src/game/createGame.ts — FOUND
- Commit 7ad9e21 — FOUND
- Commit 516bf63 — FOUND
