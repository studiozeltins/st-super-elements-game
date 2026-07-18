---
phase: 10-ambient-audio-music
verified: 2026-07-18T00:00:00Z
status: human_needed
score: 2/5 must-haves verified
behavior_unverified: 3
overrides_applied: 0
behavior_unverified_items:
  - truth: "Player hears a continuous wind bed that swells with the visible gusts, plus randomized bird chirps, sprint grass rustle, and camp-proximity goliath grunts — never a fixed-interval metronome (SC2)"
    test: "Build, open the LAN page, click to unlock audio, listen while watching flags/grass gusts; move over grass; approach a goliath camp"
    expected: "Continuous soft wind bed audible on its own, swelling in time with visible gusts; bird chirps at irregular intervals with varied pitch/pan; soft rustle while moving over grass; distant grunt near camps that grows with proximity — none metronomic"
    why_human: "Audible perceptual output + gust-sync timing cannot be observed by grep/tests; the non-metronomic math is unit-proven but the by-ear feel is not. Creatures are audible now via the synth fallback (no assets required for SC2)."
  - truth: "Ambience follows the time of day — birds by day, crickets/owl at night (SC3)"
    test: "Unlock audio in daytime, then advance the day/night cycle (or use a time override) into night"
    expected: "Bird chirps during the day band; crickets + occasional owl at night; a clean swap with no overlap and no silent gap"
    why_human: "The day/night partition logic is unit-tested (mutually exclusive, exhaustive) and wired, but the perceptual swap across a live cycle needs a human ear."
  - truth: "Combat ducks the ambience (birds stop, bed drops −6..−12dB over ~1s) and crossfades combat music in and back out on the same combat signal — never a hard cut (SC4)"
    test: "Enter a fight; observe the bed/birds within ~1s; leave the fight and wait out the ~5s cooldown"
    expected: "On combat enter: bed ducks ~−10dB over ~1s and birds STOP; combat music crossfades IN (no hard cut). On exit: bed restores over ~2-3s, region music crosses back. Duck + birds-stop are audible now; the music crossfade half is silent until region.ogg/combat.ogg are dropped."
    why_human: "Duck depth/timing and equal-power crossfade are perceptual state transitions no test exercises; the music half additionally needs the two CC0 loops staged (no synth fallback)."
human_verification:
  - test: "Stage + license the two CC0 music loops (MUSIC-01/MUSIC-02, no synth fallback)"
    expected: "Drop public/audio/music/region-loop.ogg (calm) + combat-loop.ogg (tension) as true click-free loops; fill the two music rows of public/audio/ASSETS-LICENSES.md (CC0 / YT Audio Library only). Region loops seamlessly at ambient-friendly volume; combat crossfades in on combat, region back out after — no hard cut."
    why_human: "MUSIC-01/02 are wired-but-silent by design (locked directive D-04/D-07): the code path is complete and correct, but there is intentionally no synth fallback for music, so these requirements cannot be perceptually confirmed until the .ogg files are sourced and a by-ear playtest is run."
  - test: "Bus/compressor clip check under a dense fight (SC1 audible confirmation)"
    expected: "Trigger a dense golem-class fight with all ambiance enabled; no audible clipping/distortion on the master (the DynamicsCompressor holds headroom)."
    why_human: "The compressor node + routing are code-verified, but 'never clips' is an audible property that needs a loaded fight to confirm."
  - test: "Wind bed / creatures by-ear (SC2 perceptual)"
    expected: "Bed swells with visible gusts; bird/rustle/grunt one-shots audible and non-metronomic (synth fallback is live now — no assets needed)."
    why_human: "Perceptual audio output; see behavior_unverified_items SC2."
  - test: "Day/night creature swap by-ear (SC3 perceptual)"
    expected: "Birds by day, crickets/owl at night across a cycle."
    why_human: "Perceptual; see behavior_unverified_items SC3."
  - test: "Combat duck + crossfade by-ear (SC4 perceptual)"
    expected: "Bed ducks −6..−12dB / birds stop on combat enter; restore ~2-3s on exit; music crossfade (once assets staged) no hard cut."
    why_human: "Perceptual state transition; see behavior_unverified_items SC4."
  - test: "Settings persistence + independence (SC5 confirmation)"
    expected: "Set Music/SFX sliders + mutes in SKAŅA, reload → values persist; muting Music leaves SFX audible and vice versa."
    why_human: "Persistence + independent buses are code-complete and structurally guaranteed; a quick reload-and-listen confirms the round trip."
  - test: "FPS gate under load (milestone perf rule)"
    expected: "Run python scripts/fps_playtest.py in a golem-class fight with all ambiance enabled; no FPS regression vs the pre-phase baseline; no console errors."
    why_human: "FPS-under-load with the full audio stack can only be measured in a live fight via the harness."
---

# Phase 10: Ambient Audio & Music — Verification Report

**Phase Goal:** The world sounds alive — a layered procedural ambience bed and region music, both combat-aware
**Verified:** 2026-07-18
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

Phase 10 is a client-only WebAudio phase. The entire code contract — the single routing
owner + master compressor, the SFX migration off `context.destination`, the series head→duck
bus split, the ONE combat signal, the pure-helper twins, the decode-once cache, the ambience
bed + creature one-shots, the grass rustle, the music crossfade skeleton, and the settings
persistence — is present, wired, typechecks clean, and its testable math is green (30/30 audio
tests, 790/791 full suite; the single failure is the pre-existing unrelated
`grassPlacement.test.ts`, confirmed pre-existing at commit `1bad15d`).

What remains is inherently perceptual and, for music, asset-dependent: whether the player
actually *hears* the bed swell, the day/night swap, the duck, and the crossfade can only be
confirmed by a by-ear playtest, and MUSIC-01/02 additionally need the two CC0 `.ogg` loops
dropped (an intentional locked directive — no synth fallback for music). These route to human
verification, not code gaps.

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| SC1 | All audio routes through master/ambient/music/sfx buses with a compressor; SFX migrated off `context.destination`; dense fights never clip | ✓ VERIFIED | `createAudioBuses.ts`: `master → DynamicsCompressor → destination`, sfx/music/ambient sub-buses, series head→duck split (lines 95-127). Grep confirms zero direct-destination routing in the 5 SFX modules; only `createAudioBuses` touches `context.destination`. hitBus feeds sfx bus (D-03, `createCombatAudio.ts:75`). Clip-check (audible) routed to human. |
| SC2 | Player hears a continuous wind bed swelling with gusts + randomized birds/rustle/grunts, never metronomic | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Bed swells via `bedInnerGain.setTargetAtTime(bedGainTarget(gust))` per frame (`createAmbience.ts:323`); one-shots use `nextOneShotDelay` (non-metronomic, unit-tested); rustle wired through sfx bus; grunt gain scaled by `gruntProximityGain`. Synth fallback makes all creatures audible now. Perceptual gust-sync/feel → human. |
| SC3 | Ambience follows time of day — birds by day, crickets/owl at night | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `isBirdTime`/`isNightCreatureTime` are unit-tested mutually-exclusive+exhaustive; wired into layer `active()` gates (`createAmbience.ts:251,262`). Audible day/night swap across a cycle → human. |
| SC4 | Combat ducks ambience (birds stop, bed −6..−12dB over ~1s) and crossfades combat music in/out on the same signal — no hard cut | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | ONE `inCombat` computed once (`createGame.ts:1430`) fans to `ambience.update`/`buses.duck`/`music.setCombat`. Duck target 0.3 (~−10dB), enter τ 0.33 / exit τ 0.8; birds gate on `!lastInCombat`; music equal-power cos/sin crossfade. Duck+birds-stop audible now; music crossfade silent pending assets; perceptual timing → human. |
| SC5 | Player can mute/adjust music independently of SFX, persisted locally | ✓ VERIFIED | SKAŅA section in `SettingsScreen.tsx` (2 sliders + 2 toggles); `App.tsx` 4 clamped `settings.*` keys + persist effects + live Game setters (lines 99-104, 825-828, 924-937); separate music/sfx head-node gains guarantee independence; `clampGain` defends against non-finite. |

**Score:** 2/5 truths verified (3 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/game/audio/combatState.ts` | Pure hysteresis | ✓ VERIFIED | Zero-import, `isInCombat` single subtraction; twin green (6 tests) |
| `src/game/audio/ambienceMath.ts` | Pure bed/scheduler/proximity/day-night math | ✓ VERIFIED | Zero-import; twin green (13 tests) |
| `src/game/audio/createAudioBuses.ts` | ONE routing owner + compressor + series split | ✓ VERIFIED | 188 LOC; head/duck split; clamped setters; duck writes only duck nodes |
| `src/game/audio/createSampleCache.ts` | Decode-once loader | ✓ VERIFIED | Eager fetch, lazy decode, context-swap rebuild, never throws |
| `src/game/audio/createAmbience.ts` | Gust bed + gated one-shots | ✓ VERIFIED | Bed inner-gain distinct from bus; setTimeout scheduler; synth fallback |
| `src/game/audio/createMusic.ts` | Two loops + equal-power crossfade | ⚠️ WIRED (silent) | Code complete; no source built until `.ogg` decode — intentional (no synth fallback) |
| `src/game/audio/createMovementAudio.ts` | Grass rustle layer | ✓ VERIFIED | `playGrassRustle` via getSfxBus under spam budget; `surface:'grass'` param |
| `src/ui/SettingsScreen.tsx` | SKAŅA section | ✓ VERIFIED | 2 sliders + 2 toggles, Latvian copy, token-only CSS |
| `public/audio/ASSETS-LICENSES.md` + dirs | CC0 provenance scaffold | ✓ VERIFIED | CC0-only header + PENDING rows; `.ogg` files intentionally absent |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| createGame | createAudioBuses | late-binding `let buses; createAudioSystem(()=>buses.sfx()); buses=createAudioBuses(...)` | ✓ WIRED | `createGame.ts:440-442` — no TDZ (closure deferred to gesture-gated play) |
| 5 SFX modules | sfx bus | `getSfxBus()` | ✓ WIRED | No direct-destination routing remains (grep clean) |
| frame loop | ambience/duck/music | ONE `inCombat` | ✓ WIRED | `createGame.ts:1430-1433`, right after `daynight.update()` |
| 3 damage callbacks | `lastCombatAt` | MY-combat branches only | ✓ WIRED | `createGame.ts:1817` (kind!=='heal'), `1828` (isMine), `1848` (isMine) |
| createGame player step | movementAudio | `surface:'grass'` when grounded | ✓ WIRED | `createGame.ts:1294-1303` |
| App settings | Game setters | persist effects → `setMusicVolume/...` | ✓ WIRED | `App.tsx:924-937` |
| createMusic/ambience | sampleCache | shared decode-once cache | ✓ WIRED | Both preload their urls; region/combat pending files |

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
| ----------- | ----------- | ------ | -------- |
| AMBI-01 | 10-02 | ✓ SATISFIED | Bus graph + compressor + SFX migration (code) |
| AMBI-02 | 10-01/03 | ✓ SATISFIED (audible→human) | Gust-swelled bed, unit-tested map, wired |
| AMBI-03 | 10-01/03 | ✓ SATISFIED (audible→human) | Jittered non-metronomic one-shots + synth |
| AMBI-04 | 10-04 | ✓ SATISFIED (audible→human) | Grass rustle via sfx bus, spam-budgeted |
| AMBI-05 | 10-01/03 | ✓ SATISFIED (audible→human) | Proximity-scaled grunt + synth fallback |
| AMBI-06 | 10-01/03/06 | ✓ SATISFIED (audible→human) | Birds-stop + bed/music duck on one signal |
| AMBI-07 | 10-01/03 | ✓ SATISFIED (audible→human) | Day/night gate unit-tested + wired |
| MUSIC-01 | 10-06 | ⚠️ NEEDS HUMAN (pending assets) | Region loop wired-but-silent; needs region-loop.ogg + playtest |
| MUSIC-02 | 10-01/06 | ⚠️ NEEDS HUMAN (pending assets) | Equal-power crossfade wired-but-silent; needs combat-loop.ogg + playtest |
| MUSIC-03 | 10-02/05 | ✓ SATISFIED | Independent music/sfx volume+mute, persisted |

All 10 declared requirement IDs are accounted for in REQUIREMENTS.md (all mapped to Phase 10,
none orphaned, none contradicted). MUSIC-01/02 are the only two pending human confirmation +
assets by intentional design.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Audio pure-helper twins | `npx vitest run src/game/audio` | 30 passed | ✓ PASS |
| Full suite regression | `npx vitest run` | 790 passed, 1 pre-existing unrelated fail | ✓ PASS |
| Typecheck | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| No direct-destination routing | grep 5 SFX modules | none | ✓ PASS |
| Live audio output (bed/duck/crossfade/creatures) | — | requires browser + AudioContext + ear | ? SKIP → human |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| public/audio/ASSETS-LICENSES.md | rows | PENDING placeholders | ℹ️ Info | Intended asset-drop scaffold, not code debt |
| createGame.ts (dispose) | 1608-1613 | `buses.dispose()` never called (WR-01) | ⚠️ Warning | Latent teardown leak masked by `context.close()`; not a goal blocker |
| createAudioBuses.ts / SettingsScreen | — | No ambience volume/mute control (WR-02) | ⚠️ Warning | "Mute everything" leaves wind/creatures audible; product decision, not a phase requirement (MUSIC-03 is music-vs-sfx only) |

No `TBD`/`FIXME`/`XXX` debt markers in phase source. Both warnings are from 10-REVIEW.md
(0 blockers, 2 warnings) and neither fails a must-have or blocks the phase goal.

### Human Verification Required

The phase is code-complete; the following require a live by-ear playtest (and, for music, the
CC0 assets). See frontmatter `human_verification` for the full list:

1. **Stage + license the two CC0 music loops** — region-loop.ogg + combat-loop.ogg (MUSIC-01/02, no synth fallback).
2. **Clip check** under a dense golem fight (SC1 audible).
3. **Wind bed + creatures by-ear** — swell with gusts, non-metronomic (SC2; synth audible now).
4. **Day/night creature swap** across a cycle (SC3).
5. **Combat duck + crossfade** timing and no-hard-cut (SC4).
6. **Settings persist + independence** — reload + mute-one-bus (SC5).
7. **FPS gate** — `python scripts/fps_playtest.py` in a golem fight, no regression.

### Gaps Summary

No code gaps. Every code-verifiable must-have across the six plans is present, wired,
typechecks, and passes its tests. The three success criteria that assert "the player hears X"
are present-behavior-unverified — the implementation is complete and (except for music) audible
now via the synth fallback, but the perceptual outcome can only be confirmed by ear. MUSIC-01/02
are intentionally wired-but-silent pending the CC0 `.ogg` drop (locked directive D-04/D-07), so
they are flagged for human verification + assets rather than as failures. Status is
`human_needed`: the end-of-phase playtest checkpoints (10-03 Task 4, 10-06 Tasks 3-4) are the
sink for these items.

---

_Verified: 2026-07-18_
_Verifier: Claude (gsd-verifier)_
