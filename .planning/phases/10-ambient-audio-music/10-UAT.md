---
status: testing
phase: 10-ambient-audio-music
source: [10-VERIFICATION.md]
started: 2026-07-18
updated: 2026-07-18
---

## Current Test

number: 1
name: Stage + license the two CC0 music loops
expected: |
  Drop `region-loop.ogg` + `combat-loop.ogg` into `public/audio/music/`, add their
  CC0 / YouTube-Audio-Library provenance rows to `public/audio/ASSETS-LICENSES.md`, reload,
  and confirm the region loop plays seamlessly during exploration (MUSIC-01). No code change
  needed — the loader picks them up on next load.
awaiting: user response

## Tests

### 1. Stage + license the two CC0 music loops (MUSIC-01)
expected: region-loop.ogg + combat-loop.ogg present under public/audio/music/, licensed in ASSETS-LICENSES.md; region loop plays seamlessly (no click at loop seam) at ambient volume.
result: [pending]

### 2. Ambience bed + one-shots audible and reactive (AMBI-02/03/04/05 — SC2)
expected: continuous wind bed whose gain swells with visible gusts; randomized (non-metronome) bird chirps; grass rustle when sprinting through grass; distant goliath grunts scaled by camp proximity. Audible NOW via synth fallback; swap in creature .ogg (bird-chirp-1..3, cricket-1..2, owl-hoot, optional goliath-grunt) under public/audio/creatures/ for the recorded versions.
result: [pending]

### 3. Time-of-day ambience swap (AMBI-07 — SC3)
expected: birds by day; crickets + owl at night. Observe across a day/night cycle.
result: [pending]

### 4. Combat duck + music crossfade, no hard cut (AMBI-06 / MUSIC-02 — SC4)
expected: entering combat ducks the ambience (birds stop, bed drops ~6–12 dB over ~1s) and crossfades combat music in; leaving combat restores over ~2–3s and crossfades back — equal-power, never a hard cut. Requires the two music .ogg files (item 1).
result: [pending]

### 5. Independent music/SFX volume + mute, persisted (MUSIC-03 — SC5)
expected: SKAŅA settings sliders + mute toggles change levels live; reload preserves them (settings.musicVolume/sfxVolume/musicMuted/sfxMuted); muting Music leaves SFX audible and vice-versa (bus independence).
result: [pending]

### 6. No clipping in a dense fight (AMBI-01)
expected: a golem-class fight with many concurrent SFX shows no audible clipping (master compressor holds the mix).
result: [pending]

### 7. FPS gate with all ambiance enabled
expected: `python scripts/fps_playtest.py` during a golem-class fight — no FPS regression from the audio systems.
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps

<!-- Non-blocking code-review follow-ups (advisory, not phase-goal gaps):
- WR-01: buses.dispose() is never called in createGame teardown (leak masked only by AudioContext.close()). Fix: call buses.dispose() alongside audioSystem.dispose().
- WR-02: no ambience volume/mute control — a player who zeroes Music + mutes SFX still hears the wind bed + creatures. Decide whether to add an ambience slider/mute (D-13 covered only music/sfx).
Run /gsd-code-review 10 --fix to apply, or fold into a follow-up. -->
