---
phase: 12-wildlife
plan: 03
subsystem: rendering
tags: [wildlife, instanced-mesh, pooling, zero-alloc, webaudio, sfx-bus, procedural, WILD-02]

# Dependency graph
requires:
  - phase: 12-wildlife
    plan: 01
    provides: wildlifeMath.birdArc (rising-arc + fade twin) and BIRD tunables
  - phase: 10-ambient-audio-music
    provides: sfx bus + gesture-unlocked AudioContext (createAudioSystem.getContext, buses.sfx), audioCore createNoiseSource/panned/clampGain
provides:
  - createBirdFlush.ts — externally-spawned bird-flush InstancedMesh pool (spawn(x,z) bursts 2-4, update ages the arc)
  - createWildlifeSfx.ts — procedural wing-flap one-shot on the sfx bus (playWingFlap)
  - BIRD_POOL_SIZE, BirdFlush interface, WildlifeSfx interface
affects: [12-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Externally-spawned pooled InstancedMesh (createDustPuffs spine): spawn() claims slots, update() only ages/recycles — flat frame cost, hard cap, no unbounded growth"
    - "Render factory stays thin — all flight math delegated to the unit-tested wildlifeMath twin; closure-level scratch = zero per-frame allocation"
    - "Procedural sfx one-shot sibling (createAmbience.birdChirp recipe): gesture-guarded ready(), routes through the sfx bus, .onended node cleanup, synth-first with a drop-in .ogg fallback later"

key-files:
  created:
    - src/game/systems/createBirdFlush.ts
    - src/game/systems/__tests__/createBirdFlush.test.ts
    - src/game/audio/createWildlifeSfx.ts
  modified: []

key-decisions:
  - "BIRD_POOL_SIZE = 12 (~3 flushes of 2-4 in flight); fade-out rendered as instance shrink (scale * arcScratch.visible) — no alpha, consistent with the pixel-filter opacity discipline"
  - "Wing beat = 3 staggered bandpass-noise transients (~550Hz, Q 0.7, ~40ms, 55ms apart), per-beat frequency jittered ±15% — broadband air, never tonal; no single-bird metronome"
  - "createWildlifeSfx typed getSfxBus as () => AudioNode | null (not the plan's non-null AudioNode) to match the sibling buses.sfx contract and guard the pre-build window"
  - "Debounce deliberately NOT in spawn() — spawn() is unconditional; wildlifeMath.flushReady gates at the 12-05 grass-stamp call site (no GPU readback)"

requirements-completed: [WILD-02]

coverage:
  - id: T1
    description: "Bird-flush pool — billboarded lit InstancedMesh at scene root, spawn bursts 2-4, birds despawn at t01>=1 and recycle, hard cap enforced"
    requirement: WILD-02
    verification:
      - kind: unit
        ref: "src/game/systems/__tests__/createBirdFlush.test.ts (6 tests: mesh flags, 2-4 burst, life recycle, hard cap, slot reuse, dispose)"
        status: pass
    human_judgment: false
  - id: T2
    description: "Wing one-shot — gesture-guarded procedural wing-flap routed through the sfx bus with .onended cleanup"
    requirement: WILD-02
    verification:
      - kind: manual
        ref: "Deferred to 12-05 UAT — WebAudio node factories are untested by design (jsdom has no AudioContext); mirrors createAmbience/createAudioSystem which are likewise grep+typecheck+suite-green verified"
        status: deferred
    human_judgment: true

# Metrics
duration: 3min
completed: 2026-07-18
status: complete
---

# Phase 12 Plan 03: Bird Flush + Wing SFX Summary

**A startle-flush bird pool and its wing sound, both ready to wire: `createBirdFlush.ts` is an externally-spawned single-draw-call InstancedMesh where `spawn(x,z)` bursts 2-4 billboarded birds up the tested `wildlifeMath.birdArc` (rising height, lateral scatter, fade) then recycles each slot at end of life; `createWildlifeSfx.ts` is a gesture-safe procedural wing-flap one-shot — three staggered bandpass-noise wingbeats — on the Phase-10 sfx bus.**

## Performance
- **Duration:** ~3 min
- **Tasks:** 2 completed (Task 1 TDD, Task 2 auto)
- **Files:** 3 created (1 pool factory + its test, 1 audio one-shot)

## Accomplishments
- **Task 1 (WILD-02 render):** `createBirdFlush.ts` copies the `createDustPuffs` externally-spawned spine verbatim — first-free-slot claim scan with a full-pool early return, `matrixDirty`-gated age/recycle loop, `dispose()` ending in `mesh.dispose()`. `spawn(x,z)` picks `2 + floor(random*3)` birds, each on a random outward heading with `groundY` sampled once; `update(dt, camera)` ages `t01 = age/BIRD.life`, delegates rise/spread/fade to `birdArc(t01, arcScratch)`, composes against the once-per-frame billboard quaternion, and collapses to the zero matrix at `t01>=1`. One `InstancedMesh` (PlaneGeometry + Lambert, double-sided silhouette), hard cap `BIRD_POOL_SIZE=12`, closure-level scratch (zero per-frame alloc), no scene light, no GPU readback.
- **Task 2 (WILD-02 audio):** `createWildlifeSfx.ts` is a sibling of `createCombatAudio`/`createWeaponAudio` — `createWildlifeSfx(getContext, getSfxBus)` with the `(gain, pan)` convention. `playWingFlap` guards on the `createAmbience.ready()` running-context pattern (never throws pre-unlock), then schedules 3 staggered ~40ms bandpass-noise wingbeats through `panned(ctx, pan, getSfxBus())`, each self-cleaning on `.onended`. Synth-first; a recording-fallback comment documents the zero-code-change `.ogg` drop-in path.
- Test-first for Task 1: 6-assertion headless-THREE twin written RED (module missing), then implementation to GREEN. Full suite 873/873 green (was 859 at 12-01; additive, no regression).

## Task Commits
1. **Task 1 (RED): failing bird-flush pool test** — `fca016e` (test)
2. **Task 1 (GREEN): createBirdFlush pool** — `af74188` (feat)
3. **Task 2: createWildlifeSfx wing one-shot** — `04091c1` (feat)

_TDD cycle for Task 1: test (RED) → feat (GREEN). No refactor commit — clean on first GREEN._

## Files Created/Modified
- `src/game/systems/createBirdFlush.ts` — externally-spawned bird-flush InstancedMesh pool; spawn/update/dispose + `BIRD_POOL_SIZE` + `BirdFlush` interface; arc delegated to `wildlifeMath.birdArc`.
- `src/game/systems/__tests__/createBirdFlush.test.ts` — headless-THREE pool test: mesh flags, 2-4 burst, life recycle, hard cap, slot reuse, dispose (mirrors createDustPuffs/createButterflies).
- `src/game/audio/createWildlifeSfx.ts` — procedural wing-flap one-shot on the sfx bus; `playWingFlap` + `dispose` + `WildlifeSfx` interface; mirrors `createAmbience.birdChirp` + `createAudioSystem` shape.

## Decisions Made
- **`BIRD_POOL_SIZE = 12`** (~3 flushes of 2-4 in flight) and **fade rendered as instance shrink** (`scale = BIRD_SIZE * arcScratch.visible`) rather than material alpha — keeps the opaque, pixel-filter-safe discipline the dust/butterfly pools already follow.
- **Wing beat is broadband air, not tonal**: 3 bandpass-noise transients (~550Hz center, Q 0.7, ~40ms each, 55ms apart) with per-beat frequency jitter ±15% so a flock lifts off instead of one metronomic bird.
- **`getSfxBus` typed `() => AudioNode | null`** (plan spec said non-null `AudioNode`): matches the actual `buses.sfx` sibling contract and guards the pre-build window, consistent with `createAudioSystem`/`createAmbience`.
- **Debounce stays at the call site**: `spawn()` is unconditional; `wildlifeMath.flushReady` gates the grass-stamp trigger in 12-05 — a CPU `surface==='grass'` gate, never a GPU texture read.

## Deviations from Plan
**1. [Rule 3 - Blocking type] `getSfxBus` return type widened to `() => AudioNode | null`**
- **Found during:** Task 2
- **Issue:** The plan's artifact spec listed `getSfxBus: () => AudioNode` (non-null), but the real wiring source `buses.sfx` is `() => GainNode | null` (the bus is null before the audio graph builds).
- **Fix:** Typed the parameter `() => AudioNode | null` and added a `const bus = getSfxBus(); if (!bus) return;` guard — matches every audio sibling and cannot throw pre-build.
- **Files modified:** src/game/audio/createWildlifeSfx.ts
- **Commit:** 04091c1

Otherwise plan executed as written (createDustPuffs spine copied verbatim; birdArc delegated; birdChirp synth recipe mirrored).

## Issues Encountered
None.

## User Setup Required
None — pure client-side render + WebAudio; no external service. The wing sound is synth-first and audible with no assets; an optional CC0 `.ogg` can drop in later.

## Known Stubs
None. Both modules are fully functional; they are intentionally not yet wired into `createGame` — that is 12-05's explicit scope (flush trigger at the grass-stamp site + the three `?no*` bisect flags + per-frame `.update()` calls).

## Self-Check: PASSED
- FOUND: src/game/systems/createBirdFlush.ts
- FOUND: src/game/systems/__tests__/createBirdFlush.test.ts
- FOUND: src/game/audio/createWildlifeSfx.ts
- FOUND commit: fca016e (test RED)
- FOUND commit: af74188 (feat GREEN, bird pool)
- FOUND commit: 04091c1 (feat, wing sfx)
- Exactly one InstancedMesh in createBirdFlush.ts (grep -c === 1)
- No readPixels/PointLight/DirectionalLight in createBirdFlush.ts (grep -c === 0)
- playWingFlap + getSfxBus present in createWildlifeSfx.ts
- Full suite: 873/873 green; tsc --noEmit clean

## TDD Gate Compliance
- RED gate: `fca016e` `test(12-03)` — bird-flush test failed with module missing (confirmed RED-OK, "no tests / 1 failed").
- GREEN gate: `af74188` `feat(12-03)` — 6/6 bird-flush assertions pass, full suite green.
- REFACTOR gate: not required (clean on first GREEN).
- Task 2 is `type="auto"` (not tdd) — WebAudio node factories have no unit twin (jsdom lacks AudioContext), verified by grep + typecheck + suite-green, matching every shipped audio sibling.
