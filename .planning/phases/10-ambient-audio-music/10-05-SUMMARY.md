---
phase: 10-ambient-audio-music
plan: 05
subsystem: ui
tags: [settings, webaudio, volume, mute, localstorage, radix, ui-spec, latvian]
status: complete

# Dependency graph
requires:
  - phase: 10-ambient-audio-music (10-02)
    provides: Game.setMusicVolume/setSfxVolume/setMusicMuted/setSfxMuted — the imperative MUSIC-03 bus backend this UI drives
  - existing: SettingsScreen showFps/onToggleFps prop-pair + Toggle idiom (mirrored for the 8 new props)
  - existing: App.tsx settings.* useState + persist-useEffect round-trip (pixelFilter template)
provides:
  - SKAŅA settings section (2 native range sliders + 2 affirmative mute Toggles) — the only user-facing UI in Phase 10
  - SettingsScreenProps + musicVolume/sfxVolume/musicMuted/sfxMuted + onMusicVolumeChange/onSfxVolumeChange/onToggleMusicMuted/onToggleSfxMuted
  - App state → persist → imperative Game bus setters wiring (localStorage settings.musicVolume/sfxVolume/musicMuted/sfxMuted)
  - readVolume() V5 clamp — non-finite / out-of-[0,1] persisted gain falls back to default (music 0.7, sfx 1.0)
  - .settings__slider / .settings__value CSS (token-only accent fill, focus ring, muted dim)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Styled native <input type=range> via ::-webkit-slider-* / ::-moz-range-* pseudo-elements, --fill inline percent for the webkit filled-track gradient (Firefox uses native ::-moz-range-progress)
    - Affirmative mute Toggle (checked = audible), parent persists the inverse as the mute flag — no backwards-reading negative toggle
    - localStorage → React state → imperative Game setter (never derive audio state in render, CLAUDE.md), mirroring pixelFilter
    - readVolume() defense-in-depth clamp on read (bus setter clamps again on write, V5)

key-files:
  created: []
  modified:
    - src/ui/SettingsScreen.tsx
    - src/styles/hud/switcher.css
    - src/App.tsx

key-decisions:
  - "Extracted a VolumeField sub-component in SettingsScreen so the Music/SFX slider rows share one implementation (DRY) instead of two near-identical inline blocks"
  - "Row layout is label · slider (flex:1) · %-readout (right-aligned) — satisfies UI-SPEC 'right-aligned in the row' while keeping the native slider the prominent control"
  - "--fill drives ONLY the webkit filled-track gradient; Firefox gets the same fill natively via ::-moz-range-progress, so no JS/DOM measurement is needed"
  - "readVolume() lives at App module scope (pure, zero-alloc) and is reused by both the useState initializers AND the new-game init seed, so init and reload read identically"
  - "Muted state is a CSS class (.settings__slider--muted, opacity 0.55) not inline style — token-clean; the slider stays keyboard-operable and dragging it does NOT auto-unmute (D-13)"

metrics:
  duration: ~20 min
  tasks: 2
  files: 3
  completed: 2026-07-18
---

# Phase 10 Plan 05: Audio Settings UI (SKAŅA section) Summary

The last requirement of the phase (MUSIC-03, D-13): a `SKAŅA` (Audio) section in the existing settings
panel with independent Music/SFX volume sliders and mute toggles, persisted to `localStorage` and applied
live through the imperative `Game` bus setters added in 10-02. Built to the `10-UI-SPEC.md` contract —
native `<input type="range">`, `var(--accent)` token-only styling, the reused `Toggle` idiom, Latvian copy.

## What Was Built

**Task 1 — `SettingsScreen.tsx` + `switcher.css`.** `SettingsScreenProps` gained the 4 value props
(`musicVolume`, `sfxVolume`, `musicMuted`, `sfxMuted`) + 4 handlers
(`onMusicVolumeChange`/`onSfxVolumeChange`/`onToggleMusicMuted`/`onToggleSfxMuted`), mirroring the existing
`showFps`/`onToggleFps` pairs. A new `VolumeField` sub-component renders one slider row (label span ·
native range slider · `.settings__value` % readout); its percent↔gain mapping is `Math.round(volume*100)`
on read and `value/100` on `onChange`, with an `aria-label` matching the visible label. The `SKAŅA`
section sits between `ATTĒLOŠANA` and `KONTS`, ordered Music slider → Music mute → SFX slider → SFX mute.
The two mutes reuse `Toggle` verbatim in the affirmative sense (`checked={!muted}`, `onChange={next =>
onToggle*Muted(!next)}`) so "on" always reads as audible. In `switcher.css`, new `.settings__slider` and
`.settings__value` blocks style the native range with tokens only: accent-filled track (webkit gradient
keyed on the inline `--fill` percent; Firefox `::-moz-range-progress`), `--line` remainder over the
`--panel` groove, accent thumb with a `--line` ring, hover `border-color: var(--accent)`, focus ring
`0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent)`, transitions ≤0.14s on
transform/border-color/box-shadow, `border-radius: 8px`. A muted slider dims via `.settings__slider--muted`
(opacity 0.55) but stays keyboard-operable — mute is independent of volume (D-13).

**Task 2 — `App.tsx` state + persistence + live-apply.** Four `settings.*` `useState` hooks were added:
`musicVolume`/`sfxVolume` initialized through a new module-scope `readVolume(key, fallback)` that rejects a
non-finite or out-of-[0,1] persisted value and falls back to the default (music 0.7, sfx 1.0) — the V5
clamp, defense-in-depth with the bus setter's own clamp; `musicMuted`/`sfxMuted` use the `'1'`/`'0'` idiom
(absent = unmuted). Four persist `useEffect`s mirror the `pixelFilter` effect — each writes its
`localStorage` key AND calls the matching imperative setter (`gameRef.current?.setMusicVolume` etc.). The
new-game init block seeds all four persisted values alongside the existing `setPixelFilter` seed (reading
`localStorage` directly, like pixelFilter, to avoid re-triggering game construction), and the eight new
props are passed into `<SettingsScreen>`. Audio state is never derived in render — App state → imperative
`Game` setter only (CLAUDE.md).

## Verification

- **tsc:** `npx tsc -b` reports **0 errors** across the whole project. (Per 10-02's note, the plan's
  `npx tsc --noEmit -p tsconfig.json` checks nothing because the root `tsconfig.json` is a solution file
  with `files: []`; `tsc -b` is the real typecheck and is used here.)
- **Task 1 grep:** `SKAŅA` + `musicVolume` present in `SettingsScreen.tsx`; `settings__slider`/
  `settings__value` present in `switcher.css`.
- **Task 2 grep:** `settings.musicVolume`, `setMusicVolume`, `setSfxMuted` all present in `App.tsx`.
- **Suite:** `npx vitest run` — **790 passed**, 1 failed (`grassPlacement.test.ts`, pre-existing and
  out-of-scope; see Deviations). No audio/UI test regressed; `combatState.test.ts` (6) green.
- **Manual (deferred to phase playtest):** set sliders + reload → values persist; mute music → SFX stays
  audible; dragging a muted slider updates the stored gain without auto-unmuting. Gesture-gated WebAudio
  playback stays manual-verify per the codebase's stated discipline.

## Deviations from Plan

**None functional — plan executed as written.** One extraction choice and one pre-existing failure:

1. **[Design choice, not a deviation] `VolumeField` sub-component.** The plan describes two slider rows;
   rather than duplicate the ~15-line row twice, the shared markup lives in one internal `VolumeField`
   component (DRY, CLAUDE.md "no monolith / single-purpose"). Behavior is identical to the inline form.

2. **Pre-existing out-of-scope test failure (NOT introduced here).** `grassPlacement.test.ts >
   "clusters blades into lush meadow patches only"` fails on the full suite. Confirmed pre-existing in
   10-02-SUMMARY (fails at commit `1bad15d`, the pre-phase tip) and already logged in `deferred-items.md`.
   This plan's diff is UI/settings only (`SettingsScreen.tsx`, `switcher.css`, `App.tsx`) — it does not
   touch grass. Not fixed (scope boundary).

## Known Stubs

None. Both slider rows are wired end-to-end: slider `onChange` → App state → persist `useEffect` →
imperative `Game` bus setter. The bus HEAD nodes they drive exist as of 10-02; music/ambience sources
connect into them in 10-03/10-06 independently of this UI.

## Threat Flags

None. The one robustness item (T-10-05-V5, corrupt localStorage volume) is mitigated on read here via
`readVolume()` and again on write by the 10-02 bus setter's `clampGain`. No new network, auth, file, or
schema surface — native range input + existing Radix Toggle, zero package installs.

## Self-Check: PASSED

- `src/ui/SettingsScreen.tsx`, `src/styles/hud/switcher.css`, `src/App.tsx` — all modified on disk (grep
  confirms the new symbols).
- Commit `47b87bb` (Task 1), `d2f4dca` (Task 2) — both FOUND in `git log`.
- `tsc -b` clean; Task 1 + Task 2 greps pass; suite green except the documented pre-existing
  grassPlacement failure.
