---
phase: 10-ambient-audio-music
plan: 06
subsystem: audio
tags: [webaudio, music, crossfade, equal-power, ducking, combat-aware, loop, capstone]
status: complete

# Dependency graph
requires:
  - phase: 10-ambient-audio-music (10-02)
    provides: createAudioBuses.music() HEAD node (loops connect here) + buses.duck(inCombat) on the music/ambient DUCK nodes
  - phase: 10-ambient-audio-music (10-03)
    provides: createSampleCache (the SAME decode-once loader music reuses) + the ONE isInCombat signal derived in createGame.frame() (D-08) — consumed here, never re-derived
provides:
  - createMusic(getContext, getMusicBus, sampleCache) — two persistent looping AudioBufferSourceNodes (region + combat) on the music bus with an equal-power (cos/sin) crossfade driven by setCombat; lazy build/start once both .ogg loops decode; NO synth fallback (silent no-op until assets dropped)
  - createGame: per-frame buses.duck(inCombat) + music.setCombat(inCombat) beside ambience.update — all three fed the SAME inCombat (D-08); music.dispose() in teardown
affects: [asset-drop checkpoint (region-loop.ogg + combat-loop.ogg — no synth fallback), final FPS + by-ear playtest gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Two persistent loop sources started once, never stopped — only the two gains move (no start/stop churn, no re-sync drift)
    - Equal-power cos/sin crossfade (constant perceived loudness) moved via setTargetAtTime, re-ramped only on a combat-state FLIP (zero-alloc steady state)
    - Lazy build-once-per-context (mirrors bus() rebuild) + no-op-until-decoded (music has NO synth fallback, unlike creatures)
    - ONE inCombat signal fanned to THREE consumers (ambience / bed+music duck / music crossfade) — DRY, D-08

key-files:
  created:
    - src/game/audio/createMusic.ts
  modified:
    - src/game/createGame.ts

key-decisions:
  - "Ambient-friendly music level lives on the music bus HEAD (default 0.7, 10-02) — the crossfade gains stay pure equal-power [0,1] (cos/sin) so their powers sum to 1; overall loudness is the bus, keeping the crossfade mathematically constant-loudness"
  - "Crossfade τ mirrors the duck exactly: enter τ=0.33s (~1s settle, combat swells IN fast), exit τ=0.8s (~2.4s settle, region returns gently) — the music crosses in lockstep with buses.duck (10-02) since both read the same inCombat"
  - "Tracks build INDEPENDENTLY the moment each buffer decodes (both preloaded together → typically same frame → phase-locked start); a mid-combat build sets gain.value to the steady equal-power level for the current target, so it lands correct"
  - "setCombat runs every frame but only re-ramps on an actual flip (target !== currentTarget) — steady state is a cheap ensure()/build check, no per-frame AudioParam churn (Client Performance Rules)"
  - "loop=true with explicit loopStart=0 / loopEnd=buffer.duration — the whole buffer loops for a true-loop asset; explicit points keep a clean seam if the file has lead-in (Pitfall 3, an asset-authoring concern)"

metrics:
  duration: ~15 min
  tasks: 4 (2 auto + 2 checkpoint auto-handled)
  files: 2 (1 created, 1 modified)
  completed: 2026-07-18
---

# Phase 10 Plan 06: Combat-Aware Music + Bed/Music Duck Summary

The combat-aware capstone (MUSIC-01/02, AMBI-06 bed-duck half, D-08/D-12): `createMusic` — two
seamless looping recordings (region exploration + combat) on the music bus with an equal-power
crossfade — plus the `createGame` frame wiring that fans the ONE combat signal into the ambience,
the bed+music duck, and the music crossfade. This is the last plan of the phase; it owns the two
blocking checkpoints (source the two CC0 music loops, and the final FPS + by-ear playtest), both
handled per the autonomous run's checkpoint policy (crossfade+duck code is 100% functional the
instant the two `.ogg` files appear; the by-ear/FPS gate is recorded as a PENDING human step).

## What Was Built

**Task 1 — `createMusic.ts` (new, 118 functional LOC ≤300).** `createMusic(getContext, getMusicBus,
sampleCache)` returns `{ setCombat(inCombat), dispose() }`. It holds two `Track`s (region + combat),
each with its own `AudioBufferSourceNode` (`loop = true`, `loopStart = 0`, `loopEnd = buffer.duration`)
→ its own `GainNode` → the music bus HEAD. Both loops are preloaded at construction (context-free
fetch, Pitfall 1) and **lazily built + started** once their buffer decodes via the SAME
`createSampleCache` from 10-03 — rebuilt per context (mirrors the `bus()` idiom), started once and
never stopped so there is no start/stop churn and no re-sync drift; only the two gains ever move.
`setCombat(inCombat)` drives an **equal-power crossfade**: region rides `cos(x·½π)` (1→0) and combat
rides `cos((1-x)·½π)` (0→1) where `x` is the target (0 = region, 1 = combat), moved via
`setTargetAtTime` — enter τ=0.33s (combat swells in ~1s), exit τ=0.8s (region returns ~2.4s),
aligned with the duck. It re-ramps ONLY on an actual combat-state flip; a steady-state call is a cheap
ensure/build check (zero AudioParam churn). Music has **NO synth fallback** (unlike the creatures,
D-04): if a buffer is not decoded (file absent or still loading), the track is never built and
`setCombat` is a silent no-op — no throw, no NaN into an AudioParam. Both loops go fully live the
instant the two `.ogg` files decode, with zero code change.

**Task 2 — `createGame` wiring (AMBI-06 bed-duck, MUSIC-02, D-08).** Imported `createMusic` and
constructed `const music = createMusic(audioSystem.getContext, buses.music, sampleCache);` right next
to the ambience construction, reusing the 10-03 `sampleCache`. In `frame()`, at the block where 10-03
already computes the ONE `const inCombat = isInCombat(elapsedSeconds, lastCombatAt);` and calls
`ambience.update(...)`, added the other two consumers of the SAME signal (D-08): `buses.duck(inCombat)`
(ducks the ambient + music DUCK nodes −6..−12dB down ~1s / restore ~2-3s — the AMBI-06 bed-duck half)
and `music.setCombat(inCombat)` (the equal-power region↔combat crossfade — MUSIC-02). The `inCombat`
is consumed, never re-derived. `music.dispose()` was added to the game's teardown path. Per 10-02's
series split, `buses.duck()` writes ONLY the dedicated `musicDuck`/`ambientDuck` nodes — it touches
neither the music HEAD (user volume/mute) nor the bed's inner swell node, so volume×duck (music) and
bed-swell×duck (ambient) compose cleanly and never stomp one AudioParam (Pitfall 5).

**Task 3 — CC0 music loops (blocking checkpoint, AUTO-APPROVED per policy).** This is an autonomous
`--auto` run and I cannot fetch external audio. Per the run's checkpoint policy the gate is treated as
AUTO-APPROVED: the two `PENDING` rows for `region-loop.ogg` + `combat-loop.ogg` already exist in
`public/audio/ASSETS-LICENSES.md` (staged by 10-03), `createMusic` loads them via the decode-once cache
and no-ops cleanly while absent, and the full crossfade + bus duck is wired so it is 100% functional the
instant the two files are dropped. The two required files are named below and in the license doc.

**Task 4 — final FPS + by-ear playtest (blocking checkpoint, deferred to human).** Not auto-approvable.
The automated parts I CAN run are green (`tsc -b` clean; `npx vitest run` = 790 passed). The FPS harness
`scripts/fps_playtest.py` needs a **headed GPU browser**, a running local SpacetimeDB, a `vite preview`
server, and a live golem fight — it is not headless/non-interactive — and the duck/crossfade/day-night
checks are inherently by-ear (headphones). Recorded as a PENDING human-verify item with exact steps below.

## Music the user MUST supply (no synth fallback — required for MUSIC-01/02)

Drop CC0 / YouTube-Audio-Library **seamless loops** at these exact paths, authored as TRUE loops
(zero-crossing boundaries; trim lead-in/tail; prefer Vorbis over MP3 — RESEARCH Pitfall 3), then fill the
matching rows of `public/audio/ASSETS-LICENSES.md` (source URL + license). No code change is needed —
`createMusic` builds and crossfades them the instant they decode:

- `public/audio/music/region-loop.ogg` — calm region-exploration loop (MUSIC-01, plays while not in combat)
- `public/audio/music/combat-loop.ogg` — tension combat loop (MUSIC-02, crossfades in during combat)

(`createMusic` fetches these two exact URLs: `/audio/music/region-loop.ogg` and `/audio/music/combat-loop.ogg`.)

## PENDING human-verify (Task 4 — the final phase gate)

Not runnable in this autonomous session (headed browser + live DB + by-ear). To close the gate:

1. `pnpm build` → `pnpm preview --port 4173` (and ensure local SpacetimeDB is running + published).
2. **FPS gate:** `python scripts/fps_playtest.py` in a golem-class fight with ALL ambiance enabled;
   confirm no FPS regression vs. the pre-phase baseline (milestone-wide summed-cost perf rule).
3. **Duck + crossfade:** enter combat → within ~1s the bed ducks −6..−12dB, birds STOP, and combat
   music crossfades IN (no hard cut); leave combat → after the ~5s cooldown the bed restores over
   ~2-3s and region music crosses back. (Requires the two `.ogg` loops from above to be staged first.)
4. **Gust sync:** watch the flags/grass gust and confirm the wind bed swells with the visible gusts.
5. **Day/night:** across a cycle (or time override) confirm birds by day, crickets/owl at night.
6. **Clip check:** trigger a dense fight and confirm no audible clipping (master compressor holds).
7. **Settings:** set music/SFX sliders + mutes, reload → persisted; muting music leaves SFX audible.
8. A/B any relevant `?no*` bisect behavior and confirm no console errors.

## Verification

- **tsc -b:** 0 errors across the project (the real typecheck — root `tsconfig.json` is a solution file,
  per 10-02/10-03's note).
- **Task 1:** `createMusic.ts` compiles; 118 functional LOC (≤300); two `loop = true` sources with
  explicit `loopStart`/`loopEnd`; crossfade uses equal-power `cos`/`sin` moved via `setTargetAtTime`
  (no per-frame `.value=`); missing buffer no-ops (no synth fallback). Verify greps (`loop`,
  `setTargetAtTime`) pass.
- **Task 2:** grep `MUSIC_WIRED` passes (`buses.duck(inCombat)`, `music.setCombat(inCombat)`,
  `createMusic(`); full `npx vitest run` green — **790 passed**, only the pre-existing unrelated
  `grassPlacement` test fails (see below).
- **Task 3/4:** checkpoints handled per policy (assets no-op-until-dropped; playtest recorded PENDING).

## Deviations from Plan

**None functional — plan executed as written.** Process notes:

1. **[checkpoint_policy] Both blocking checkpoints auto-handled, not paused.** Per the autonomous run's
   directive, Task 3 (music assets) was AUTO-APPROVED — the code is fully functional and silent-until-dropped,
   the exact filenames/paths are recorded above — and Task 4 (FPS + by-ear playtest) was deferred to the
   user as a PENDING human-verify item (I ran the automatable tsc + vitest gates; the headed-browser FPS
   harness and headphones A/B cannot run here).

2. **Pre-existing out-of-scope test failure (NOT introduced here).** `grassPlacement.test.ts >
   "clusters blades into lush meadow patches only"` fails on the full suite — a `Math.random`-seeded
   grass-geometry assertion with zero relationship to audio (this plan touches only `createMusic.ts` +
   `createGame.ts` audio wiring). Confirmed pre-existing in the 10-02 and 10-03 summaries and already
   logged in `deferred-items.md`. Per the scope boundary rule it was NOT fixed. All 790 other tests pass.

## Known Stubs

The two music loops (`region-loop.ogg`, `combat-loop.ogg`) are intentionally absent (PENDING) — this is
the whole point of the auto-approved asset checkpoint, not a stub that blocks the plan's goal. `createMusic`
is fully wired: the moment both files decode, the region loop plays at ambient volume and combat music
crossfades in/out on the combat signal, with zero code change. The exact drop-in paths are documented above
and in `ASSETS-LICENSES.md`. No unwired UI, no placeholder data flowing to a render surface.

## Notes for Downstream

- **Phase gate:** the PENDING human-verify list above is the remaining Phase 10 sign-off. Stage the two
  `.ogg` loops, then run the FPS harness + the by-ear duck/crossfade/day-night/persist checks before
  `/gsd-verify-work`.
- **Audio playback stays manual-verify** (gesture-gated WebAudio) — the crossfade, the −6..−12dB bed duck,
  birds-stop-in-combat, and the seamless region loop can only be confirmed by ear in a live golem fight.

## Self-Check: PASSED

- `src/game/audio/createMusic.ts` — FOUND on disk.
- Commits `70c9965` (Task 1), `ce43c67` (Task 2) — both FOUND in `git log`.
- `region-loop.ogg` + `combat-loop.ogg` PENDING rows present in `public/audio/ASSETS-LICENSES.md`.
- `tsc -b` clean; Task 1 + Task 2 verify greps pass; suite green except the documented pre-existing
  `grassPlacement` failure.
