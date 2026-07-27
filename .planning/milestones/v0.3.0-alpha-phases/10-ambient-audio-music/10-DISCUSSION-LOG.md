# Phase 10: Ambient Audio & Music - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-18
**Phase:** 10-ambient-audio-music
**Mode:** `--all --auto` — all gray areas auto-selected, recommended option chosen per question.
**Areas discussed:** Bus graph, Sample-vs-synth split, Combat-state signal, One-shot scheduler, Music + persistence, Asset pipeline & licensing

---

## Bus graph (AMBI-01)

| Option | Description | Selected |
|--------|-------------|----------|
| One `createAudioBuses()` module, inject bus into each module | master→compressor→dest + ambient/music/sfx sub-buses; migrate all 5 SFX modules off `context.destination` | ✓ |
| Add a compressor only, keep per-module destination wiring | Minimal change, no sub-buses | |
| Per-system ad-hoc gain nodes | No shared routing module | |

**Auto choice:** One shared bus module. **Notes:** DRY/SRP directive from user is binding; no `.connect(context.destination)` may remain.

---

## Sample-vs-synth split (AMBI-02/03/04/05)

| Option | Description | Selected |
|--------|-------------|----------|
| Recordings for creatures + music; procedural wind bed + grass rustle | CC0/YT-Audio-Library bird/cricket/owl + music; synth bed (gust-reactive) + rustle | ✓ |
| All procedural (synth birds) | Honors original AMBI-03 "synth-first" | |
| All recordings incl. wind bed | Loop can't sidechain gusts | |

**Auto choice:** Recording-first creatures, procedural bed. **Notes:** User "use bird sounds" overrides AMBI-03 synth-first → recordings default, synth fallback. AMBI-02 stays procedural (gust sidechain requirement).

---

## Combat-state signal (AMBI-06 + MUSIC-02)

| Option | Description | Selected |
|--------|-------------|----------|
| One derived client combat-state, enter-now/exit-after-cooldown, feeds duck + crossfade | Single DRY signal | ✓ |
| Two separate signals for duck vs music | Duplicated logic | |
| Server-authoritative combat flag | New server publish (milestone bans it) | |

**Auto choice:** One derived signal w/ hysteresis. **Notes:** No `inCombat` exists today — this is net-new. Exact trigger source left to research (cheapest client-side signal).

---

## One-shot scheduler (AMBI-03/05/07)

| Option | Description | Selected |
|--------|-------------|----------|
| One reusable `scheduleRandomOneShots(set, interval, jitter, active)` | SRP; phase01-gated day/night | ✓ |
| Per-creature bespoke schedulers | Repetition | |
| Fixed-interval timers | Metronome — explicitly banned by AMBI-03 | |

**Auto choice:** Shared parameterized scheduler. **Notes:** Reuses `phase01()` for time-of-day `active()` predicates.

---

## Music + persistence (MUSIC-01/02/03)

| Option | Description | Selected |
|--------|-------------|----------|
| 2 CC0 loops, equal-power crossfade on combat-state; volume+mute sliders persisted | Matches duck timings; existing settings pattern | ✓ |
| Single track, duck instead of crossfade | No horizontal music transition | |
| No persistence | Fails MUSIC-03 | |

**Auto choice:** Two loops + crossfade + persisted sliders. **Notes:** `settings.musicVolume`/`settings.sfxVolume` via existing `App.tsx` localStorage pattern.

---

## Asset pipeline & licensing

| Option | Description | Selected |
|--------|-------------|----------|
| `.ogg` under `public/audio/*`, decode-once loader cache, `ASSETS-LICENSES.md` | DRY loader; provenance tracked | ✓ |
| Decode per play | Wasteful | |
| No license tracking | Violates CC0/proper-licensing requirement | |

**Auto choice:** Cached loader + license file. **Notes:** "Free from YouTube" = YouTube Audio Library / CC0 only, never ripped copyrighted audio.

---

## Claude's Discretion

- Compressor curve, sub-bus default gains, per-creature interval/jitter constants (playtest-tuned).
- Goliath grunt: synth vs recording.
- Precise combat-state trigger source.

## Deferred Ideas

- Wing one-shot on bird flush → Phase 12 (Wildlife).
- Weather audio → milestone-deferred.
- 6 keyword-matched combat/visual todos reviewed, none audio-related → not folded (scope guardrail).
