---
status: partial
phase: 10-ambient-audio-music
source: [10-VERIFICATION.md]
started: 2026-07-18
updated: 2026-07-18
mode: auto
---

## Current Test

[testing complete — auto pass]

## Tests

### 1. Stage + license the two CC0 music loops (MUSIC-01)
expected: region-loop.ogg + combat-loop.ogg present under public/audio/music/, licensed in ASSETS-LICENSES.md; region loop plays seamlessly (no click at loop seam) at ambient volume.
result: blocked
blocked_by: assets
reason: "public/audio/music/ holds only .gitkeep — region-loop.ogg + combat-loop.ogg absent. Music has NO synth fallback by design (D-04/D-07), so this is a manual CC0 asset-drop + by-ear playtest. Code path is wired & correct (createMusic.ts)."

### 2. Ambience bed + one-shots audible and reactive (AMBI-02/03/04/05 — SC2)
expected: continuous wind bed whose gain swells with visible gusts; randomized (non-metronome) bird chirps; grass rustle when sprinting through grass; distant goliath grunts scaled by camp proximity. Audible NOW via synth fallback; swap in creature .ogg (bird-chirp-1..3, cricket-1..2, owl-hoot, optional goliath-grunt) under public/audio/creatures/ for the recorded versions.
result: blocked
blocked_by: human-ear
reason: "Perceptual. Code verified + synth fallback audible now (bedGainTarget per-frame, non-metronomic scheduler unit-tested 17/17). Gust-sync feel + non-metronomic 'by ear' cannot be observed by tests — needs a live listen."

### 3. Time-of-day ambience swap (AMBI-07 — SC3)
expected: birds by day; crickets + owl at night. Observe across a day/night cycle.
result: blocked
blocked_by: human-ear
reason: "Day/night partition (isBirdTime/isNightCreatureTime) unit-tested mutually-exclusive+exhaustive and wired into layer active() gates. Perceptual swap across a live cycle needs a human ear."

### 4. Combat duck + music crossfade, no hard cut (AMBI-06 / MUSIC-02 — SC4)
expected: entering combat ducks the ambience (birds stop, bed drops ~6–12 dB over ~1s) and crossfades combat music in; leaving combat restores over ~2–3s and crossfades back — equal-power, never a hard cut. Requires the two music .ogg files (item 1).
result: blocked
blocked_by: human-ear, assets
reason: "ONE inCombat signal fans to ambience.update / buses.duck / music.setCombat (createGame.ts:1430). Duck target 0.3 (~−10dB), τ enter 0.33 / exit 0.8; birds gate on !inCombat; equal-power cos/sin crossfade. Duck + birds-stop audible now; music-crossfade half silent until item 1's .ogg files staged. Perceptual timing → ear."

### 5. Independent music/SFX volume + mute, persisted (MUSIC-03 — SC5)
expected: SKAŅA settings sliders + mute toggles change levels live; reload preserves them (settings.musicVolume/sfxVolume/musicMuted/sfxMuted); muting Music leaves SFX audible and vice-versa (bus independence).
result: blocked
blocked_by: human-ear
reason: "Structurally verified: SKAŅA 2 sliders + 2 toggles, 4 clamped settings keys + persist effects + live Game setters, separate music/sfx head-node gains guarantee independence (VERIFICATION SC5 = VERIFIED). The audible reload-and-listen round trip still needs a human confirm."

### 6. No clipping in a dense fight (AMBI-01)
expected: a golem-class fight with many concurrent SFX shows no audible clipping (master compressor holds the mix).
result: blocked
blocked_by: human-ear
reason: "Bus graph master → DynamicsCompressor → destination code-verified; SFX migrated off context.destination (grep clean). A dense 3-goliath fight WAS driven (see test 7) but 'never clips' is an audible property — needs an ear on the loaded fight."

### 7. FPS gate with all ambiance enabled
expected: `python scripts/fps_playtest.py` during a golem-class fight — no FPS regression from the audio systems.
result: pass
source: automated
evidence: "Ran scripts/fps_playtest.py against built dist (preview :4173) + local STDB, full audio stack live. Idle baseline avg 58.0 / 1%-low 29.9. Combat vs 3 goliaths (60s, 3438 frames): avg 57.2 / 1%-low 29.9 (identical to idle 1%-low). No FPS regression from the audio systems. (Worst frame 433.9ms is the one-off goliath-spawn hitch, not steady-state — pre-existing spawn cost.)"

## Summary

total: 7
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 6

## Gaps

[none — 0 code issues]

<!-- 6 items blocked, NOT failed: 5 perceptual (need by-ear playtest), 1 asset-drop (music .ogg, no synth fallback by design). These are the intended end-of-phase human checkpoints, not code gaps. Matches 10-VERIFICATION.md status=human_needed (SC1/SC5 code-verified, SC2/3/4 present-behavior-unverified). No diagnosis / fix plan needed. -->

<!-- Non-blocking code-review follow-ups (advisory, not phase-goal gaps):
- WR-01: buses.dispose() is never called in createGame teardown (leak masked only by AudioContext.close()). Fix: call buses.dispose() alongside audioSystem.dispose().
- WR-02: no ambience volume/mute control — a player who zeroes Music + mutes SFX still hears the wind bed + creatures. Decide whether to add an ambience slider/mute (D-13 covered only music/sfx).
Run /gsd-code-review 10 --fix to apply, or fold into a follow-up. -->
