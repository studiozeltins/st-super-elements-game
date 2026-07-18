---
phase: 10-ambient-audio-music
plan: 03
subsystem: audio
tags: [webaudio, ambience, wind-bed, one-shot-scheduler, sample-cache, combat-state, sidechain, synth-fallback]
status: complete

# Dependency graph
requires:
  - phase: 10-ambient-audio-music (10-01)
    provides: combatState.isInCombat + ambienceMath (bedGainTarget, nextOneShotDelay, jitterFactor, gruntProximityGain, isBirdTime/isNightCreatureTime) — the pure math this plan turns into WebAudio
  - phase: 10-ambient-audio-music (10-02)
    provides: createAudioBuses.ambient() HEAD node (bed + one-shots connect here) + the series-split duck node 10-06 will drive
  - phase: 08-wind
    provides: wind.getGustEnvelope() — the live bed-swell sidechain source read each frame
  - phase: 09-atmosphere-day-night
    provides: dayNightMath.phase01 + serverClock.nowMicros() — the ONE day/night clock the creature gates read
provides:
  - createSampleCache(getContext) — THE decode-once .ogg loader: eager fetch + lazy decode-per-context, get() returns null until decoded, never throws mid-frame (D-15)
  - createAmbience(getContext, getAmbientBus, sampleCache, getCampDistance) — procedural gust-reactive wind bed + ONE scheduleRandomOneShots driving day birds / night crickets+owl / distant goliath grunt, with a per-layer synth fallback
  - createGame: lastCombatAt stamp in the 3 MY-combat damage branches + per-frame ambience.update fed the ONE isInCombat signal (D-08)
  - public/audio/{ambient,music,creatures}/ + ASSETS-LICENSES.md CC0 provenance scaffold (D-07/D-16)
affects: [10-06 (consumes the SAME inCombat for bed-duck + music crossfade; connects music loops into buses.music), asset-drop checkpoint (real .ogg recordings)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Decode-once sample cache: eager context-free fetch + deferred decodeAudioData-per-context (slice(0) copy so a context swap can re-decode the retained bytes)
    - ONE reusable timer-driven one-shot scheduler (setTimeout self-reschedule, NOT the frame loop) so gated-off layers cost nothing but a sleeping timer
    - Recording-preferred with transparent per-layer procedural synth fallback (buffer present → play it, else synth) — dropping .ogg later needs zero code change (D-04/D-06)
    - Bed swell on the bed's OWN inner gain, separate from the ambient bus duck node (series multiply, Pitfall 5)
    - Zero-alloc per-frame update(): one setTargetAtTime write; all node creation lives in fire()/buildBed()

key-files:
  created:
    - src/game/audio/createSampleCache.ts
    - src/game/audio/createAmbience.ts
    - public/audio/ASSETS-LICENSES.md
    - public/audio/ambient/.gitkeep
    - public/audio/music/.gitkeep
    - public/audio/creatures/.gitkeep
  modified:
    - src/game/createGame.ts

key-decisions:
  - "Synth fallback extended to ALL creature layers (birds/crickets/owl + grunt), not just the grunt — the world is audibly alive out of the box before any recording is dropped (checkpoint_policy directive; D-04 keeps synth as the fallback, D-06 explicitly allows the grunt synth)"
  - "createSampleCache decodes a slice(0) COPY of the retained bytes because decodeAudioData detaches its input — keeps the original bytes for a re-decode after an async context swap"
  - "getCampDistance passed as a live closure (minCampDistance()) computing the min over the static getCampSites() array against the current playerPosition — cheaper and always-current vs a per-frame captured scalar"
  - "Combat stamp is MY-combat only (self-hurt excludes heals; world/PVP hits only when isMine) so a spectated far fight never ducks my exploration (RESEARCH A4, playtest-tunable)"
  - "Bed = looping filtered noise (3s buffer, 480Hz lowpass) with the swell smoothed at τ=0.15s; creature one-shots pitch/gain jittered ±15%, pan ±0.6 (±0.4 grunt)"

metrics:
  duration: ~12 min
  tasks: 4 (3 auto + 1 checkpoint auto-approved)
  files: 7 (6 created, 1 modified)
  completed: 2026-07-18
---

# Phase 10 Plan 03: Ambience Bed + Creature One-Shots + Combat Signal Summary

The core "world sounds alive" layer: a continuous procedural gust-reactive wind bed plus a DRY,
time-of-day-gated, combat-aware creature one-shot scheduler on the ambient bus, all driven by the ONE
combat-state signal that 10-06 will reuse — with samples decoded once and CC0 provenance tracked. Ships
audibly functional today via per-layer synth fallbacks; real recordings drop in later with zero code change.

## What Was Built

**Task 1 — `createSampleCache.ts` (decode-once loader, D-15) + asset scaffold (D-14/D-16).** The single
`.ogg` loader both `createAmbience` (one-shots) and `createMusic` (10-06 loops) will share. It splits the
two halves of the async gesture-unlock race (RESEARCH Pitfall 1): the encoded `ArrayBuffer` is fetched
EAGERLY (network is context-free) and retained; `decodeAudioData` is deferred until a live *running*
context exists, and the decoded `AudioBuffer` is cached keyed by url AND context (all buffers invalidated
and re-decoded if the context object changes, mirroring the `bus()` rebuild idiom). It decodes a `slice(0)`
copy so the retained bytes survive `decodeAudioData`'s detach for a possible re-decode. `get(url)` never
throws and never blocks — it returns the decoded buffer or `null` (not fetched / still decoding / fetch or
decode failed), so a missing sample is a silent no-op mid-frame (threat T-10-03-A). Also created
`public/audio/{ambient,music,creatures}/` (with `.gitkeep`) and `ASSETS-LICENSES.md` — a CC0 /
YouTube-Audio-Library-only provenance table pre-seeded with every expected filename as a PENDING/TODO row.

**Task 2 — `createAmbience.ts` (gust-reactive bed + one-shot scheduler, AMBI-02/03/05/07).** ≤300 LOC
functional; all timing/gain math imported from the tested `ambienceMath.ts`. The **wind bed** (D-05,
procedural) is a looping filtered-noise source → lowpass biquad → an INNER swell `GainNode` → the ambient
bus, built once per context; each frame `update()` writes ONE `setTargetAtTime(bedGainTarget(gust), …)` on
that inner node (τ≈0.15s, zipper-free). The swell lives on the bed's own node, deliberately separate from
the ambient BUS duck node 10-06 owns (Pitfall 5). ONE `scheduleRandomOneShots`-style helper drives three
layers off self-rescheduling `setTimeout` timers (NOT the frame loop): **day birds** (`active =
isBirdTime(phase01) && !inCombat` — birds stop in combat, AMBI-06), **night crickets+owl** (`active =
isNightCreatureTime(phase01)`), and the **distant goliath grunt** (`active/gain = gruntProximityGain(campDist)`,
long intervals). Each fire picks a recording via `sampleCache.get`; when absent it plays a cheap procedural
synth voice (bird chirp / cricket chirr / owl hoot / low grunt growl) so the ambience is audibly alive
before any `.ogg` is dropped, and recordings transparently override the synth once present. Per-shot
`playbackRate`/pan/gain are jittered (±15% pitch, never metronomic); `update()` allocates nothing.

**Task 3 — `createGame` integration (D-08/D-09, AMBI-06).** Imported `isInCombat`, `phase01`,
`getCampSites`, `createSampleCache`, `createAmbience`. Declared `let lastCombatAt = -Infinity` and stamped
`lastCombatAt = elapsedSeconds` in the MY-combat branch of all three damage callbacks — `spawnSelfNumber`
(non-heal = I took damage), `spawnWorldNumber` (`isMine` = my hit landed), `spawnPlayerNumber` (`isMine` =
my PVP hit). Constructed the cache + ambience on `buses.ambient`, with `getCampDistance` as a live closure
computing the min over the static `getCampSites()` array to `playerPosition` (no table scan, AMBI-05). In
`frame()` right after `daynight.update()`, derive `inCombat` once and drive
`ambience.update(deltaSeconds, wind.getGustEnvelope(), phase01(serverClock.nowMicros()), inCombat)`. Wired
`ambience.dispose()`/`sampleCache.dispose()` into teardown. Deliberately did NOT add the bed-duck or music
crossfade here — 10-06 consumes the SAME `inCombat` (D-08, one signal, both consumers).

**Task 4 — CC0 recording checkpoint (auto-approved, deferred to synth/no-op fallback).** This is an
autonomous `--auto` run and I cannot fetch external audio. Per the run's checkpoint policy the gate is
treated as AUTO-APPROVED: the directory scaffold + `ASSETS-LICENSES.md` PENDING rows are in place, the
loader/scheduler gracefully no-op on missing files, and the synth fallback makes the bed + creature layer
audibly functional now. The real recordings are deferred to a later manual drop (see below).

## Recordings the user must supply later

Drop CC0 / YouTube-Audio-Library `.ogg` files at these exact paths, then fill the matching rows of
`public/audio/ASSETS-LICENSES.md` (source URL + license). No code change is needed — each file transparently
replaces its synth fallback once present:

- `public/audio/creatures/bird-chirp-1.ogg`, `bird-chirp-2.ogg`, `bird-chirp-3.ogg` — day birds
- `public/audio/creatures/cricket-1.ogg`, `cricket-2.ogg` — night crickets
- `public/audio/creatures/owl-hoot.ogg` — night owl
- `public/audio/creatures/goliath-grunt.ogg` — distant goliath grunt (optional; synth covers it, D-06)
- (10-06 will additionally need `public/audio/music/region-loop.ogg` + `combat-loop.ogg` — no synth fallback there)

The wind bed needs NO sample — it is procedural (D-05); `public/audio/ambient/` stays empty for Phase 10.

## Verification

- **tsc -b:** 0 errors across the project (the real typecheck; root `tsconfig.json` is a solution file, per 10-02's note).
- **Task 1:** dirs + `ASSETS-LICENSES.md` exist; `createSampleCache.ts` compiles; no `decodeAudioData` at construction (deferred to a running context); `get()` returns null before decode.
- **Task 2:** `npx vitest run src/game/audio` green (30 tests); `createAmbience.ts` 271 functional LOC (≤300); bed inner gain distinct from the bus node; scheduler uses `setTimeout` + `nextOneShotDelay` (grep-confirmed, no `requestAnimationFrame`); `update()` has no `new`/allocation and reads `getGustEnvelope()` fresh.
- **Task 3:** grep `FRAME_WIRED` passes (`lastCombatAt = elapsedSeconds` ×3, `ambience.update(`, `isInCombat(elapsedSeconds`); full `vitest run` green — **790 passed**, only the pre-existing unrelated `grassPlacement` test fails (see below).
- **Manual (phase playtest, human):** by ear — bird chirps by day (synth until recordings drop), replaced by crickets/owl at night; birds stop during a fight; the bed swells with visible gusts; grunt rumble near a goliath camp. Deferred to the phase-gate playtest.

## Deviations from Plan

**1. [checkpoint_policy directive] Synth fallback extended to all creature layers, not just the grunt.**
The plan's Task 2 left birds/crickets/owl to *no-op* when a recording is absent and only the grunt synth to
executor discretion (D-06). The autonomous run's checkpoint policy explicitly directed wiring the D-04/D-06
synth fallback "for creatures so the bed + creature layer is audibly functional WITHOUT the recordings." I
therefore gave every creature layer a cheap procedural synth voice. This honors D-04 (recordings remain the
default and override the synth the moment a file is dropped) and makes the phase demonstrably alive today
rather than silent-until-assets. No gate behavior changed: gated-off layers still schedule no audio.

**2. Pre-existing out-of-scope test failure (NOT introduced here).** `grassPlacement.test.ts > "clusters
blades into lush meadow patches only"` fails on the full suite. Confirmed pre-existing in both 10-01 and
10-02 summaries — a `Math.random`-seeded grass-geometry assertion with zero relationship to audio (nothing
in this plan touches `world/`). Per the scope boundary rule it was NOT fixed; already logged in
`deferred-items.md`. All 790 other tests pass, including the 30 audio tests.

## Known Stubs

The creature recordings are intentionally absent (PENDING) — this is the whole point of the auto-approved
asset checkpoint, not a stub that blocks the plan's goal: the synth fallback delivers audible day/night
creatures now, and the exact drop-in filenames are documented above and in `ASSETS-LICENSES.md`. The
`public/audio/music/` rows are 10-06's responsibility (region/combat loops, no fallback), documented for
that plan. No unwired UI, no placeholder data flowing to a render surface.

## Notes for Downstream Plans

- **10-06 (music + duck):** read the SAME `inCombat` already derived in `frame()` — do NOT re-derive it.
  Add `buses.duck(inCombat)` and `music.setCombat(inCombat)` right beside the existing `ambience.update(...)`
  line. Connect the two loop `GainNode`s into `buses.music()` (the HEAD node); the duck already rides
  `musicDuck` downstream. Music needs the two `.ogg` loops sourced — no synth fallback in scope.
- **Expected startup network 404s (harmless):** `createAmbience` preloads the seven creature urls at
  construction; until the `.ogg` files are dropped, the browser logs a 404 network entry per file (once,
  cached-failed). These are caught (`entry.failed`), never thrown, and never reach an AudioParam — the synth
  fallback runs instead. They disappear as recordings are added.
- **Audio playback stays manual-verify** (gesture-gated WebAudio) — a headphones playtest confirms the bed
  swell, the day/night creature switch, and birds-stop-in-combat before `/gsd-verify-work`.

## Self-Check: PASSED

(Verified below after write.)
