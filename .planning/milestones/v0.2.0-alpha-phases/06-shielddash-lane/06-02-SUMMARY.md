---
phase: 06-shielddash-lane
plan: 02
subsystem: client-render
tags: [three, webaudio, animation, juice, procedural-sfx]

# Dependency graph
requires:
  - phase: 04-attack-state-machine-leapslam-end-to-end-delete-goliath-drai
    provides: travelFraction seam, applyCrouch/resetAttackPose rig helpers, attack_strike juice pipeline, procedural WebAudio SFX precedent
  - phase: 05-swordswing-swordswirl-combo
    provides: shared resetAttackPose neutral-restore contract (05-02), per-attack juice tiers + handler-local seed constants, no-shockwave-for-non-circles precedent
provides:
  - animateDash procedural clip (shield brace -> grounded lunge riding travelFraction -> heavy skid) dispatched by attackId 'shieldDash'
  - playDash procedural WebAudio shield clang (high-Q bandpass hit + detuned oscillator ring pair)
  - shieldDash strike-juice tier in handleAttackStrike (burst + 4-point lane dust wake + rim flash + light shake + clang, no shockwave)
affects: [06-03, 06-04, 06-05, phase-7-poise-interrupt]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Grounded charge clip = leap clip minus the parabola: zero vertical writes, lean rides travelFraction through strike AND early recovery"
    - "Event juice reads off-event geometry (cast point) via getAttackRows() with a mandatory degrade-to-burst-only fallback"

key-files:
  created: []
  modified:
    - src/game/systems/createGoliathRenderer.ts
    - src/game/audio/createAudioSystem.ts
    - src/game/createGame.ts

key-decisions:
  - "goliathAttackClips.ts carve NOT triggered: renderer is 217 functional LOC after animateDash (ceiling 300) — plan's conditional carve stays conditional"
  - "Dash clip seeds (D6-12 discretion): brace crouch 0.45, brace lean 0.2, lunge lean 0.55, shield raise 1.2 rad on leftArm.rotation.x, skid squash 0.4 — all within resetAttackPose/applyCrouch restored channels"
  - "Clang recipe (D6-13 discretion): Q8 bandpass 1800->900Hz at 0.9 gain + 620/626Hz detuned triangle pair at 0.5 combined, 0.2s total — noise peak sits above the slam's broadband 0.5 per the 05-05 bandpass audibility lesson"
  - "Wake seeds: 4 interpolated points x 5 particles between cast and landing; landing burst 14 particles, shake 0.2 (lighter than slam 0.45, heavier than swing 0.15)"

patterns-established:
  - "fillAxis-style per-shape divergence stays OUT of this plan: the dash tier is a pure additional early-return if block — zero shared-path edits"

requirements-completed: [ATK-04]

coverage:
  - id: D1
    description: "animateDash clip — rooted shield-braced windup, grounded lunge riding travelFraction, heavy skid/settle; dispatched by attackId 'shieldDash'; zero vertical position writes"
    requirement: ATK-04
    verification:
      - kind: other
        ref: "grep -c animateDash src/game/systems/createGoliathRenderer.ts == 2 (definition + dispatch); grep confirms no model.group.position.y write inside animateDash"
        status: pass
      - kind: unit
        ref: "pnpm vitest run src/game/data/__tests__/serverSync.test.ts (165 tests)"
        status: pass
    human_judgment: true
    rationale: "Clip FEEL through the pixel filter (brace read, lunge weight, skid) cannot be asserted headlessly — visual sign-off owned by the 06-05 playtest checkpoint per the plan's done criteria"
  - id: D2
    description: "playDash procedural WebAudio shield clang registered in the AudioSystem interface and return object, guard-clause opener matching playSwing (silent no-op before gesture unlock)"
    requirement: ATK-04
    verification:
      - kind: other
        ref: "grep -c playDash src/game/audio/createAudioSystem.ts == 4 (>= 3: interface + definition + return registration)"
        status: pass
      - kind: other
        ref: "pnpm exec tsc --noEmit (exit 0)"
        status: pass
    human_judgment: true
    rationale: "Audibility/metallic character under gameplay mixing is a listening judgment — tuning owned by the 06-05 playtest (same as the 05-05 gain retune round)"
  - id: D3
    description: "shieldDash strike-juice tier: landing burst + dust wake along the lane via getAttackRows() castX/Z with burst-only fallback + flashStrike + Math.max light shake + playDash; NO circular shockwave"
    requirement: ATK-04
    verification:
      - kind: other
        ref: "grep -c shieldDash src/game/createGame.ts >= 1; source assertion: spawnShockwave appears only in the swirl tier and slam default, not the dash tier"
        status: pass
      - kind: other
        ref: "pnpm exec tsc --noEmit (exit 0)"
        status: pass
    human_judgment: true
    rationale: "Wake spacing/feel and shake weight are seed-tunable feel judgments owned by the 06-05 playtest; the fallback path (missing row) only manifests under live cache ordering (RESEARCH A1)"

# Metrics
duration: 6min
completed: 2026-07-11
status: complete
---

# Phase 6 Plan 02: shieldDash Client Feel Layer Summary

**animateDash grounded shield-charge clip riding travelFraction + playDash high-Q bandpass clang with detuned 620/626Hz ring + shieldDash juice tier (burst, 4-point lane dust wake, rim flash, light shake — no shockwave)**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-11T17:43:54Z
- **Completed:** 2026-07-11T17:49:25Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `animateDash` (D6-12): windup = rooted shield-braced crouch (progress² ease) + torso lean into the aim + raised shield arm; strike/early recovery = crouch release + deep lunge lean scaled by the ACTUAL mesh travel toward the locked landing; late recovery = heavy skid/settle past the shared `LANDED_TRAVEL_FRACTION` gate. Never writes the group's vertical position — the one deliberate leap-vs-dash difference. Dispatched by `attackId === 'shieldDash'`.
- `playDash` (ANIM-04/D6-13 discretion): Q8 bandpass noise hit falling 1800→900Hz layered with a detuned triangle pair (620/626Hz — the beat reads metallic), 0.2s, exponential envelopes, gains as named seeds sitting above the slam's broadband levels (05-05 bandpass lesson). Registered in interface + return object; opener copies the playSwing guard verbatim.
- shieldDash juice tier in `handleAttackStrike`: inherits the distance gate / juiceFalloff / lastStrike capture by position; landing burst + dust wake at 4 interpolated points along cast→landing (cast read from `attackViewClock.getAttackRows()` with a burst-only fallback when the row misses — RESEARCH A1), `flashStrike`, `Math.max`-joined light shake (0.2), `playDash(juiceFalloff)`. Deliberately NO circular shockwave (a circular wave misreads the lane — swing-cone precedent comment copied).

## Task Commits

Each task was committed atomically:

1. **Task 1: animateDash grounded-lunge clip + dispatch** - `656a427` (feat)
2. **Task 2: playDash shield-clang SFX + shieldDash strike-juice tier** - `0f026c2` (feat)

## Files Created/Modified

- `src/game/systems/createGoliathRenderer.ts` - +5 D6-12 seed constants, `animateDash` clip, dispatch line; 217 functional LOC (carve NOT triggered)
- `src/game/audio/createAudioSystem.ts` - `playDash` + 4 named clang seed constants; interface + return-object registration
- `src/game/createGame.ts` - 4 handler-local dash tier seeds + the shieldDash early-return tier in `handleAttackStrike`

## Decisions Made

- **Carve not triggered:** renderer lands at 217 functional LOC (< 300) after the clip, so `goliathAttackClips.ts` was correctly NOT created per the plan's conditional rule.
- **Shield arm channel:** the brace uses `leftArm.rotation.x` (negative = forward raise, mirroring the swing's sign convention) — a channel `resetAttackPose` already clears, so zero restore-contract extension was needed.
- **Ring gain split:** the detuned pair splits `DASH_CLANG_RING_GAIN` across both oscillators so the seed reads as the audible total.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- An uncommitted USER working-tree edit to `src/game/entities/createCharacterModel.ts` (aura ring depth-test change) appeared during execution — not part of this plan; left untouched and excluded from all commits.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The full Phase-6 client feel layer for the dash body-commit is in place; the juiceColor for the tier resolves via the generic `ATTACK_RENDER` lookup whose `shieldDash` entry landed in 06-01 (same wave) — already merged on this branch, so no fallback window remains.
- Ready for 06-03 (server lane-end computation + lane resolveStrike arm) and 06-04 (lane rectangle telegraph); visual/audio sign-off of everything in this plan is owned by the 06-05 pixel-filter playtest checkpoint.

## Self-Check: PASSED

- `src/game/systems/createGoliathRenderer.ts` animateDash definition + dispatch: FOUND (grep == 2)
- `src/game/audio/createAudioSystem.ts` playDash x4: FOUND (>= 3 required)
- `src/game/createGame.ts` shieldDash tier: FOUND
- Commit `656a427`: FOUND in git log
- Commit `0f026c2`: FOUND in git log
- `pnpm vitest run src/game/data/__tests__/serverSync.test.ts`: 165/165 PASS
- `pnpm exec tsc --noEmit`: exit 0
- `createEntityRenderer.ts` untouched across both commits: CONFIRMED (empty diff)
- No file deletions in either commit: CONFIRMED

---
*Phase: 06-shielddash-lane*
*Completed: 2026-07-11*
