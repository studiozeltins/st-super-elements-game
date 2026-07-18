---
phase: 10-ambient-audio-music
plan: 01
subsystem: audio
tags: [webaudio, pure-helpers, vitest, tdd, combat-state, ambience, hysteresis]

# Dependency graph
requires:
  - phase: 09-atmosphere-day-night
    provides: dayNightMath.phase01 (0..1 cycle position the day/night gates read)
  - phase: 08-wind
    provides: windMath.gustEnvelope / wind.getGustEnvelope() (the bed-gain sidechain source)
provides:
  - combatState.ts — pure enter-immediately / exit-after-cooldown combat hysteresis (isInCombat, COMBAT_EXIT_COOLDOWN_SECONDS)
  - ambienceMath.ts — pure bed-gain map, one-shot scheduler timing/jitter, goliath-grunt proximity falloff, day/night creature gates
  - Two vitest twins proving all Phase-10 ambience/combat math (19 tests)
affects: [10-02, 10-03, 10-04, 10-05, 10-06, createAmbience, createMusic, createAudioBuses, createGame frame loop]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Zero-import pure-helper + vitest twin (mirrors windMath / dayNightMath / pickupLadder)
    - Rand-injected pure timing (nextOneShotDelay/jitterFactor take rand so Math.random stays in the wrapper)
    - Complement-pair day/night gates (isNightCreatureTime = !isBirdTime) — provably exhaustive + mutually exclusive

key-files:
  created:
    - src/game/audio/combatState.ts
    - src/game/audio/ambienceMath.ts
    - src/game/audio/__tests__/combatState.test.ts
    - src/game/audio/__tests__/ambienceMath.test.ts
  modified: []

key-decisions:
  - "COMBAT_EXIT_COOLDOWN_SECONDS = 5 as the D-09 hysteresis seed (playtest-tunable)"
  - "Day/night partition tied to dayNightMath keyframes: DAY_START_PHASE=0.12, NIGHT_START_PHASE=0.82"
  - "Night gate defined as the exact complement of the bird gate so the cycle is partitioned with no gap/overlap"
  - "BED_BASE_GAIN=0.25 (audible continuous bed) + BED_SWELL_GAIN=0.35 (gust bonus on top), D-05"
  - "Grunt proximity: full inside GRUNT_NEAR_RADIUS=12, silent beyond GRUNT_FAR_RADIUS=60, linear between"

patterns-established:
  - "Pattern 1: Zero-import pure audio math modules with sibling vitest twins under src/game/audio/__tests__/"
  - "Pattern 2: Scheduler timing kept pure by injecting rand; the WebAudio wrapper supplies Math.random()"

requirements-completed: [AMBI-02, AMBI-03, AMBI-05, AMBI-06, AMBI-07, MUSIC-02]

coverage:
  - id: D1
    description: "Combat-state hysteresis: enter-immediately on a fresh stamp, exit only after the cooldown; -Infinity initial state is out of combat"
    requirement: "AMBI-06"
    verification:
      - kind: unit
        ref: "src/game/audio/__tests__/combatState.test.ts#isInCombat enter-immediately / exit-after-cooldown / hysteresis absorbs brief lulls"
        status: pass
    human_judgment: false
  - id: D2
    description: "Same combat signal drives the music crossfade (one boolean, both consumers)"
    requirement: "MUSIC-02"
    verification:
      - kind: unit
        ref: "src/game/audio/__tests__/combatState.test.ts#COMBAT_EXIT_COOLDOWN_SECONDS contract"
        status: pass
    human_judgment: false
  - id: D3
    description: "Continuous audible wind-bed gain that swells monotonically with the gust envelope (base + swell·gust, >0 at gust 0)"
    requirement: "AMBI-02"
    verification:
      - kind: unit
        ref: "src/game/audio/__tests__/ambienceMath.test.ts#bedGainTarget continuous audible bed swelling with gust"
        status: pass
    human_judgment: false
  - id: D4
    description: "One-shot scheduler timing strictly within [min,max], never metronomic, with per-shot jitter in [1-spread,1+spread]"
    requirement: "AMBI-03"
    verification:
      - kind: unit
        ref: "src/game/audio/__tests__/ambienceMath.test.ts#nextOneShotDelay window + non-metronomic cadence / jitterFactor"
        status: pass
    human_judgment: false
  - id: D5
    description: "Goliath grunt gain scaled by nearest-camp distance: 1 inside near radius, 0 beyond far radius, interpolated between"
    requirement: "AMBI-05"
    verification:
      - kind: unit
        ref: "src/game/audio/__tests__/ambienceMath.test.ts#gruntProximityGain nearest-camp falloff"
        status: pass
    human_judgment: false
  - id: D6
    description: "Day/night creature gates partition phase01 into a bird (day) window and cricket/owl (night) window with no overlap"
    requirement: "AMBI-07"
    verification:
      - kind: unit
        ref: "src/game/audio/__tests__/ambienceMath.test.ts#day/night creature gates partition the cycle"
        status: pass
    human_judgment: false

# Metrics
duration: 12min
completed: 2026-07-18
status: complete
---

# Phase 10 Plan 01: Ambience Pure Helpers Summary

**Two zero-import pure modules — `combatState.ts` (enter-immediately/exit-after-cooldown combat hysteresis) and `ambienceMath.ts` (bed-gain map, non-metronomic one-shot timing/jitter, goliath proximity falloff, day/night creature gates) — with 19 vitest twin assertions proving the Phase-10 audio math without an AudioContext.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-07-18
- **Tasks:** 2 (both TDD)
- **Files modified:** 4 created

## Accomplishments
- `combatState.ts`: `isInCombat(nowS, lastCombatAtS)` is a single subtraction/compare against `COMBAT_EXIT_COOLDOWN_SECONDS=5` — the ONE signal (D-08) that later feeds both the ambience duck (AMBI-06) and the music crossfade (MUSIC-02). Proven enter-immediately and exit-after-cooldown, with `-Infinity` initial state out of combat.
- `ambienceMath.ts`: `nextOneShotDelay` (never a fixed interval), `jitterFactor` (pure twin of audioCore.jitter), `bedGainTarget` (continuous audible bed + gust swell, D-05), `gruntProximityGain` (nearest-camp falloff, AMBI-05), and `isBirdTime`/`isNightCreatureTime` (a provably exhaustive + mutually exclusive day/night partition, AMBI-07/D-11).
- Both modules import nothing (no three, no WebAudio, no React) — verified by grep; full RED→GREEN TDD gate honored for both tasks.

## Task Commits

Each task followed the RED (test) → GREEN (feat) TDD gate:

1. **Task 1: combatState pure hysteresis + twin** — `d10f957` (test), `1b57b54` (feat)
2. **Task 2: ambienceMath scheduler/bed/proximity/day-night + twin** — `2a63d27` (test), `3c4f36c` (feat)

## Files Created/Modified
- `src/game/audio/combatState.ts` - Pure combat hysteresis (`isInCombat`, `COMBAT_EXIT_COOLDOWN_SECONDS`)
- `src/game/audio/ambienceMath.ts` - Pure bed gain, one-shot timing/jitter, grunt proximity, day/night gates
- `src/game/audio/__tests__/combatState.test.ts` - 6 behavior assertions
- `src/game/audio/__tests__/ambienceMath.test.ts` - 13 behavior assertions

## Decisions Made
- **Cooldown seed = 5s** for the combat exit hysteresis (D-09, playtest-tunable) — long enough to absorb sub-cooldown lulls between hits, short enough to reopen the world promptly.
- **Day/night thresholds aligned to the dayNightMath keyframes** (`0.12` dawn / `0.82` night) rather than inventing a second time convention, honoring D-11 (one clock).
- **Night gate = complement of the bird gate** so the two are guaranteed mutually exclusive AND exhaustive (test sweeps [0,1) asserting exactly one is true) — no silent gap, no double-play.
- **Bed base is audible on its own** (0.25) with the swell (0.35) as a bonus on top, per the research note that the gust envelope rests near 0 between ~30-60s gust events.

## Deviations from Plan

None - plan executed exactly as written. Constants chosen within the plan's stated seed ranges (Claude's discretion per CONTEXT).

## Issues Encountered

- **Pre-existing unrelated test failure:** the full-suite run surfaced one failing test, `src/game/world/__tests__/grassPlacement.test.ts > clusters blades into lush meadow patches only`. It fails identically in isolation and is a `Math.random`-seeded grass-geometry assertion with zero relationship to the two zero-import audio modules added here (which nothing imports yet). Per the scope boundary rule it was NOT fixed; logged to `deferred-items.md` for the world/grass subsystem owner. All 790 other tests (including the 19 new audio twins) pass.

## Next Phase Readiness
- Wave-0 foundation is ready: 10-02+ can build `createAudioBuses`, `createSampleCache`, `createAmbience`, `createMusic`, and the `createGame` frame-loop wiring against these tested constants/functions.
- No blockers introduced. The grass test failure is orthogonal and does not gate audio work.

## Self-Check: PASSED

---
*Phase: 10-ambient-audio-music*
*Completed: 2026-07-18*
