---
phase: 10-ambient-audio-music
plan: 02
subsystem: audio
tags: [webaudio, audio-bus, compressor, ducking, sidechain, routing, dry-srp, migration]
status: complete

# Dependency graph
requires:
  - phase: 10-ambient-audio-music (10-01)
    provides: combatState.ts / ambienceMath.ts pure helpers (consumed by later plans, not this one)
  - existing: audioCore.clampGain (V5 volume guard reused for setMusicGain/setSfxGain)
  - existing: createCombatAudio bus()/duckHits() idiom (the analog for the lazy graph + duck ramp)
provides:
  - createAudioBuses(getContext) — THE routing owner: master → DynamicsCompressor → destination with sfx/music/ambient sub-buses; series-split music/ambient (HEAD → DUCK) so volume/swell × duck never stomp one AudioParam
  - duck(inCombat) on the music+ambient DUCK nodes (setTargetAtTime, enter-fast/restore-slow)
  - clamped setMusicGain/setSfxGain + independent setMusicMuted/setSfxMuted on the HEAD nodes (D-13)
  - Game.setMusicVolume/setSfxVolume/setMusicMuted/setSfxMuted — the MUSIC-03 imperative backend
  - buses.sfx() — the shared SFX bus that ALL 5 SFX modules now route through (no direct destination)
affects: [10-03 (ambient head node anchor + duck), 10-05 (App wires the Game volume/mute setters), 10-06 (music head node anchor + crossfade)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Lazy build-once-per-context bus graph (mirrors createCombatAudio.bus() busContext guard)
    - Series-split bus (HEAD × DUCK in series) to give two writers independent AudioParams (RESEARCH Pitfall 5)
    - Late-binding closure to break the createAudioSystem ↔ createAudioBuses construction circularity
    - clampGain reused as the persisted-volume → AudioParam guard (V5, reject non-finite / clamp [0,1])

key-files:
  created:
    - src/game/audio/createAudioBuses.ts
  modified:
    - src/game/audio/createAudioSystem.ts
    - src/game/audio/createCombatAudio.ts
    - src/game/audio/createWeaponAudio.ts
    - src/game/audio/createMovementAudio.ts
    - src/game/audio/createPickupAudio.ts
    - src/game/createGame.ts

key-decisions:
  - "Compressor glue seeds: threshold -18dB, knee 24, ratio 4:1, attack 3ms, release 250ms — a gentle bus compressor that only leans in when layered ambience+SFX+music push the master hot"
  - "Sub-bus default HEAD gains: music 0.7 (below full so the loop stays under SFX), sfx 1.0, ambient 1.0 (ambient rides its own inner bed gain from 10-03); App overwrites music/sfx on load"
  - "Duck target 0.3 (~-10dB), enter τ=0.33s (~1s settle), exit τ=0.8s (~2.4s settle) via setTargetAtTime — combat grabs the mix fast, hands it back gently (RESEARCH Pattern 5)"
  - "Volume/mute modelled as state vars (musicVolume/sfxVolume + musicMuted/sfxMuted); effective HEAD gain = muted ? 0 : volume — mute is independent of volume (D-13), cleaner than 'remember last non-muted'"
  - "createAudioBuses is NOT the clamp caller — clampGain lives inside setMusicGain/setSfxGain so the Game setters delegate raw values (single clamp site, V5)"
  - "createAudioSystem's getSfxBus is optional (default () => null) so it can construct before buses exist; the 4 consumer modules take it as required (createGame always supplies it)"
  - "bus() → ensureHitBus(context, sfxBus): the private hit-tick bus is (re)built per context and wired INTO the sfx bus (D-03), never the destination; duckHits now takes the hitBus node explicitly"

metrics:
  duration: ~15 min
  tasks: 3
  files: 7
  completed: 2026-07-18
---

# Phase 10 Plan 02: Audio Bus/Compressor Refactor Summary

The DRY bus/compressor refactor the user flagged (AMBI-01, D-01/D-02/D-03): ONE `createAudioBuses`
routing owner (`master → DynamicsCompressor → destination` with `sfx`/`music`/`ambient` sub-buses),
all 5 existing SFX modules migrated OFF the raw `context.destination` onto the injected `sfx` bus with
every direct-to-destination route deleted, and the MUSIC-03 imperative volume/mute setter backend on
the `Game`.

## What Was Built

**Task 1 — `createAudioBuses.ts` (new, 188 lines).** The single routing owner. Lazily builds
`master GainNode → DynamicsCompressor → context.destination` plus three sub-buses on first accessor
call, rebuilding only when the AudioContext changes (mirrors `createCombatAudio.bus()`; the gesture
unlock is async so it never builds eagerly). The `music` and `ambient` buses are EACH two gains in
series — a HEAD node feeding a dedicated DUCK node — because two independent writers touch each bus
(user volume / bed swell on the HEAD, combat duck on the DUCK) and must not stomp one AudioParam
(RESEARCH Pitfall 5). `duck(inCombat)` ramps ONLY the `musicDuck`/`ambientDuck` gains via
`setTargetAtTime` (enter fast, restore slow); `setMusicGain`/`setSfxGain` write ONLY the HEAD gains
through a `clampGain` guard; `setMusicMuted`/`setSfxMuted` flip the HEAD gain to 0 without losing the
stored volume. Logical state (volumes, mute flags, duck level) is re-applied on any context rebuild.

**Task 2 — all 5 SFX modules migrated onto the `sfx` bus.** The 4 consumer modules
(`createCombatAudio`, `createWeaponAudio`, `createMovementAudio`, `createPickupAudio`) now take
`(getContext, getSfxBus)`; `createAudioSystem` — which OWNS the context — takes `(getSfxBus?)` only and
still provides `getContext`. Every play routes its output through `getSfxBus()` (guarded, bail if
null) instead of `context.destination`; ALL direct-to-destination references were deleted (no legacy
path, CLAUDE.md). In `createCombatAudio` the private `hitBus` (helper renamed `ensureHitBus`) now feeds
the `sfx` bus and stays the duckable hit-tick layer (D-03); `duckHits` takes the hit-bus node
explicitly. Stale "straight to the destination" comments purged.

**Task 3 — `createGame` wiring + MUSIC-03 setters.** An explicit late-binding resolves the
`createAudioSystem ↔ createAudioBuses` circularity: `let buses; const audioSystem =
createAudioSystem(() => buses.sfx()); buses = createAudioBuses(audioSystem.getContext);` — the closure
defers the `sfx()` read until a gesture-unlocked play, long after `buses` is assigned. `buses.sfx` is
passed into the other 4 SFX constructors. The `Game` interface and returned object gained
`setMusicVolume`/`setSfxVolume`/`setMusicMuted`/`setSfxMuted`, each delegating to the bus module
(the clamp lives there) — the imperative MUSIC-03 backend that the settings UI (10-05) will drive.

## Verification

- **Task 1:** `createAudioBuses.ts` typechecks clean; 188 lines (≤300 functional). Graph is
  `master→compressor→destination`; music/ambient run HEAD→DUCK→master in series; `duck()` uses
  `setTargetAtTime` on the duck nodes only; volume setters clamp via `clampGain`.
- **Task 2:** verify grep `NO_DIRECT_DESTINATION_LEFT` passes — no SFX module touches
  `context.destination`; `getSfxBus` used in each of the 5 modules. Audio modules are tsc-clean.
- **Task 3:** `tsc -b` reports **0 errors** across the whole project; wiring grep `GAME_WIRED` passes;
  full `vitest run` is green (790 passed) except one pre-existing unrelated failure (below).

> Note: the plan's per-task verify used `npx tsc --noEmit -p tsconfig.json`, but the repo root
> `tsconfig.json` is a solution file (`files: []`) so that command checks nothing. The real typecheck
> is `tsc -b` (the `build` script) — used here to genuinely confirm 0 errors.

## Deviations from Plan

**None functional — plan executed as written.** Two process notes:

1. **[Rule 3 — Blocking issue] `bus()` return type + `duckHits` signature.** Rerouting `hitBus` to the
   `sfx` bus (which can be null) meant the old `bus(context): GainNode` and
   `duckHits(context, ...)` could no longer read a guaranteed hit-bus. Resolved by renaming to
   `ensureHitBus(context, sfxBus: GainNode): GainNode` (callers already guard `sfxBus` non-null) and
   passing the hit-bus node into `duckHits(hitBusNode, context, ...)`. Behavior-preserving; no fallback
   to the destination left behind (satisfies D-02/D-03 + CLAUDE.md).

2. **Pre-existing out-of-scope test failure (NOT introduced here).** `grassPlacement.test.ts >
   "clusters blades into lush meadow patches only"` fails on the full suite. Confirmed pre-existing by
   re-running it at commit `1bad15d` (the tip before this plan), where it also fails; grassPlacement is
   not in this plan's diff (audio-only). Logged in `deferred-items.md`; not fixed (scope boundary).

## Known Stubs

None. This plan is a behavior-preserving routing refactor plus one new module — no placeholder data,
no unwired UI. The `ambient()`/`music()` HEAD nodes intentionally have no source attached yet; 10-03
(ambience bed) and 10-06 (music loops) connect INTO them, and the Game volume/mute setters are wired
to the UI by 10-05. These are documented anchor seams, not stubs.

## Notes for Downstream Plans

- **10-03 (ambience):** connect the wind bed + one-shots INTO `buses.ambient()` (the HEAD node). Put
  the gust swell on the bed's OWN inner gain, NOT the ambient HEAD — the duck already owns the ambient
  DUCK node; keeping swell and duck on separate nodes is the whole point of the series split.
- **10-06 (music):** connect the two loop GainNodes INTO `buses.music()` (the HEAD node); the combat
  duck already rides `musicDuck` downstream.
- **10-05 (settings UI):** call `game.setMusicVolume/setSfxVolume/setMusicMuted/setSfxMuted`
  imperatively (App state → Game setter, never React-derived). Defaults to seed against: music 0.7,
  sfx 1.0.
- **Audio playback stays manual-verify** (gesture-gated WebAudio) — a headphones playtest in a fight
  should confirm SFX are unchanged and nothing clips under dense combat.

## Self-Check: PASSED

- `src/game/audio/createAudioBuses.ts` — FOUND on disk.
- Commit `0a53a62` (Task 1), `f18afcd` (Task 2), `d15201d` (Task 3) — all FOUND in `git log`.
- `tsc -b` clean; Task 2 grep + Task 3 wiring grep pass; suite green except the documented pre-existing
  grassPlacement failure.
