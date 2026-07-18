---
phase: 10-ambient-audio-music
fixed_at: 2026-07-18T00:00:00Z
review_path: .planning/phases/10-ambient-audio-music/10-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 10: Code Review Fix Report

**Fixed at:** 2026-07-18
**Source review:** .planning/phases/10-ambient-audio-music/10-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2 (both WARNING)
- Fixed: 2
- Skipped: 0

**Verification:** `tsc -b` clean (EXIT=0); `vitest run src/game/audio` — 30/30 passed across
combatState, pickupLadder, ambienceMath. The pre-existing unrelated `grassPlacement.test.ts`
failure was out of scope and not run. The 4 INFO findings (IN-01..IN-04) were out of scope and
left untouched.

## Fixed Issues

### WR-01: `buses.dispose()` is never called in audio graph teardown

**Files modified:** `src/game/createGame.ts`
**Commit:** 1534bde
**Applied fix:** Added `buses.dispose();` to the ordered `dispose()` teardown, placed after
`sampleCache.dispose()` and immediately before `audioSystem.dispose()` (which closes the context
last). The routing owner is now torn down explicitly rather than relying on `AudioContext.close()`
to free the graph. `createAudioBuses` already exposed a `dispose()` that disconnects and nulls the
master/compressor/sfx/music/ambient head+duck nodes, so no new disposer was needed.

### WR-02: Ambience had no user volume or mute control

**Files modified:** `src/game/audio/createAudioBuses.ts`, `src/game/createGame.ts`, `src/App.tsx`, `src/ui/SettingsScreen.tsx`
**Commit:** 5435b4b
**Applied fix:** Added an ambience volume slider + mute to the SKAŅA settings section, mirroring the
existing music/SFX pattern end-to-end (DRY — reuses the shared `VolumeField` and the existing
switcher.css slider styling, so no CSS change was required):

- `createAudioBuses.ts`: new `setAmbientGain` / `setAmbientMuted` interface methods + implementations,
  new `ambientVolume` / `ambientMuted` logical state (default gain `DEFAULT_AMBIENT_GAIN = 1`,
  unmuted). Setters write ONLY the ambient HEAD node via the shared `applyHead` (clamped through
  `clampGain`); the `ambientDuck` combat-duck node is never touched, preserving the series head→duck
  split (D-13). `ensure()` now re-applies `ambientMuted ? 0 : ambientVolume` on a context rebuild
  instead of pinning the head to the constant.
- `createGame.ts`: `Game.setAmbientVolume` / `Game.setAmbientMuted` added to the interface and
  implemented as thin delegates to `buses.setAmbientGain` / `buses.setAmbientMuted`.
- `App.tsx`: `ambientVolume` / `ambientMuted` state (with `readVolume` V5 clamp fallback and the
  `settings.ambientMuted === '1'` read), seeding on game init, persist + live-apply effects, and the
  new props passed to `SettingsScreen`.
- `SettingsScreen.tsx`: new props threaded through, plus a `VolumeField` row ("Vides skaļums") and an
  affirmative mute `Toggle` ("Vide") appended under the SFX rows in the SKAŅA section, keeping the
  native range input / var(--accent) / affirmative-Toggle design contract.

## Skipped Issues

None.

---

_Fixed: 2026-07-18_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
