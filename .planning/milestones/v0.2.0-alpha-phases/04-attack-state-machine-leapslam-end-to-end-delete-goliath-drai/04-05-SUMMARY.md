---
phase: 04-attack-state-machine-leapslam-end-to-end-delete-goliath-drai
plan: 05
subsystem: client-render
tags: [attack-animation, procedural-rig, crouch-leap-slam, unit-attack, entity-renderer]
requires:
  - 04-04 syncUnitAttacks storing latestUnitAttackRows in createGame.ts
provides:
  - AttackAnimationView interface + optional EntityAnimation.animateAttack hook (ANIM-03, unit-agnostic)
  - EntityRenderer.setAttackViews wholesale view-map replacement, windup landing-facing in update()
  - goliath crouch/leap/slam procedural animation on the existing rig (D4-16)
  - createGame attack-view derivation (arrival-anchored server clock, per-frame refresh)
affects:
  - 04-06 (slam impact effects can key off the same views/phases)
  - 04-07 (visual legibility sign-off human checkpoint)
tech-stack:
  added: []
  patterns:
    - optional interface method for zero-change kind reuse (enemy renderer compiles untouched)
    - arrival-anchored server-clock derivation (baseServerMicros + performance.now delta), same model as the telegraph
    - procedural pose layering — animateMovement restores neutral, animateAttack re-poses after, so offsets never accumulate
key-files:
  created: []
  modified:
    - src/game/systems/createEntityRenderer.ts
    - src/game/systems/createGoliathRenderer.ts
    - src/game/createGame.ts
decisions:
  - "animateAttack is OPTIONAL on EntityAnimation — camp enemies omit it and compile unchanged; implementers must restore neutral in animateMovement/animateDeath so a vanished view never leaves a squashed mesh"
  - "The leap arc rides travelFraction (actual mesh distance from cast toward the locked landing) rather than phaseProgress — the parabola peaks mid-flight and grounds exactly on arrival, staying in sync with the existing position lerp regardless of frame rate or lerp speed"
  - "Recovery's true start (the grace deadline) is zero-storage on the row (D4-02), so the recovery state change's ARRIVAL anchors that phase; strike progress ramps against recoveryEndsAtMicros (the row's only later deadline) but never drives the arc"
  - "A row first seen mid-strike/recovery (late joiner) anchors to strikeAtMicros — conservative: a slightly longer clamped settle, never a stuck pose"
metrics:
  duration: ~45min (across two executor sessions — first terminated by provider session limit mid-Task 2)
  completed: 2026-07-09
status: complete
---

# Phase 04 Plan 05: Goliath Attack Animation + Renderer Contract Summary

The slam now has a body: the shared EntityAnimation contract gained an optional per-phase animateAttack hook (heroes/enemies reuse later with zero schema change), and the goliath procedurally crouches through windup facing its locked landing, leaps a parabolic arc riding its actual lunge travel, and settles a heavy impact squash through recovery — every timing input derived from unit_attack row micros with the telegraph's arrival-anchored clock model.

## What Was Built

### Task 1 — createEntityRenderer.ts contract extension (ANIM-03, D4-12)
- `AttackAnimationView` exported: `attackId`, `phase: 'windup' | 'strike' | 'recovery'`, `phaseProgress` (0..1, row-micros-derived), `castX/castZ`, `landingX/landingZ`.
- `EntityAnimation.animateAttack?(view)` — OPTIONAL, so the enemy renderer's animation objects compile with zero changes (proves the ANIM-03 reuse claim).
- `setAttackViews(views)` on the renderer interface: replaces the closure map wholesale, keyed by the same id string syncRows uses.
- `update()`: when a view exists, `animateAttack?.(view)` runs AFTER `animateMovement`; during **windup** the group skips the movement lookAt and faces `(landingX, landingZ)` — the rooted crouch reads aimed (D4-12). Strike/recovery keep normal travel facing.

### Task 2 — Goliath implementation + createGame plumbing (D4-16, T-04-11)
- **createGoliathRenderer.ts** — procedural only, `THREE.MathUtils.lerp/clamp` the sole helpers, zero AnimationMixer:
  - `applyCrouch(amount)`: torso Y-scale toward 0.6 with its bottom kept planted; head + arms ride the compression down so the silhouette reads as one crouching body.
  - windup: crouch deepens with `phaseProgress²` (ease-in toward the strike).
  - strike: springs out of the crouch over the first third of travel; `group.position.y += sin(travel · π) · 1.5` — the arc rides `travelFraction` (actual distance covered from cast toward landing), syncing perfectly with the existing ≤8u position lerp lunge (under SNAP_DISTANCE, so it lerps rather than snaps).
  - recovery: any airborne arc remainder fades with an ease-out settle; once travel ≥ 0.97 a 0.35-depth impact squash eases back to neutral over the phase.
  - `animateMovement`/`animateDeath` both call `applyCrouch(0)` first — a vanished view (idle row, mid-attack death) can never leave a squashed mesh.
- **createGame.ts** — attack-view derivation:
  - `UnitAttackTiming` per row: arrival anchors `baseServerMicros` + `basePerfMs` (fresh cast via `startedAtMicros` change re-anchors; first-sight windup pins to startedAt, late joiner pins to strikeAt); state changes stamp `phaseStartMicros` (strike = row's own strikeAt deadline; recovery = arrival-approximated, D4-02 zero-storage).
  - `refreshAttackViews()` each frame BEFORE `goliathRenderer.update`: phase straight from row state (idle rows produce NO view), `phaseProgress = clamp(elapsed/duration)` from the row's own micros against the anchored server clock, cast/landing straight from the row, dead goliaths filtered by `isUnitAlive`. Pushed via `setAttackViews`.
  - `syncUnitAttacks` now anchors timings (`syncAttackTimings(rows)`) alongside the telegraph sync.

## Deviations from Plan

None - plan executed exactly as written.

**Execution note (not a deviation):** the first executor session was terminated by a provider session limit mid-Task 2, leaving the goliath animation + createGame helper functions written but their two call sites (`syncAttackTimings` in `syncUnitAttacks`, `refreshAttackViews` in the frame loop) unwired. The resumed session verified the partial work against the plan spec, added the call sites, and ran full verification before committing — no work was redone or duplicated.

## Verification Results

- `pnpm build` exit 0; `pnpm test` **510/510 green**
- `grep -c "animateAttack?" createEntityRenderer.ts` → 2 (interface + optional-chained call); `grep -c "setAttackViews"` → ≥1; `grep -c "AttackAnimationView"` → ≥3 — all met (Task 1 commit)
- `grep -c "animateAttack" createGoliathRenderer.ts` → 2; `grep -c "setAttackViews" createGame.ts` → 1; `grep -c "AnimationMixer" createGoliathRenderer.ts` → 0
- phaseProgress derivation reads `startedAtMicros`/`strikeAtMicros`/`recoveryEndsAtMicros` from the row — no hard-coded windup constant in createGame.ts or the renderer (T-04-11 mitigated)
- Enemy renderer / enemy animation files: zero hunks in the diff (optional hook proves zero-change reuse)
- `git diff package.json pnpm-lock.yaml` empty — zero new dependencies (T-04-SC lock held)

## Commits

| Task | Type | Hash | Description |
|------|------|------|-------------|
| 1 | feat | bb55d3e | optional animateAttack hook + attack views on the entity renderer contract |
| 2 | feat | 96360fd | goliath crouch/leap/slam animation + attack-view plumbing in createGame |

## Known Stubs

None — the animation path is fully wired end-to-end (row micros → timings → views → renderer poses). Visual sign-off of the crouch/leap/slam read is Plan 07's human checkpoint as planned.

## Threat Flags

None beyond the plan's threat model. T-04-11 mitigated as specified: arrival-anchored row-micros derivation, no client-local timers, no hard-coded durations. No new client-callable surface, zero new dependencies.

## Self-Check: PASSED

- src/game/systems/createEntityRenderer.ts, createGoliathRenderer.ts, createGame.ts changes on disk
- Commits bb55d3e, 96360fd verified in git log
- Build + 510/510 tests confirmed green after final edits
