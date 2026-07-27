---
phase: 10-ambient-audio-music
reviewed: 2026-07-18T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - src/game/audio/createAudioBuses.ts
  - src/game/audio/createAudioSystem.ts
  - src/game/audio/createCombatAudio.ts
  - src/game/audio/createWeaponAudio.ts
  - src/game/audio/createMovementAudio.ts
  - src/game/audio/createPickupAudio.ts
  - src/game/audio/createSampleCache.ts
  - src/game/audio/createAmbience.ts
  - src/game/audio/createMusic.ts
  - src/game/audio/combatState.ts
  - src/game/audio/ambienceMath.ts
  - src/game/createGame.ts
  - src/ui/SettingsScreen.tsx
  - src/App.tsx
  - src/styles/hud/switcher.css
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-07-18
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Phase 10 is a client-only WebAudio layer: a single routing owner (`createAudioBuses`), a
gesture-unlocked shared `AudioContext` (`createAudioSystem`), five procedural SFX modules, a
decode-once sample cache, a gust-reactive ambience layer, a combat-crossfaded music layer, and
two pure helpers (`combatState`, `ambienceMath`), all wired through `createGame`.

I adversarially traced every risk area the orchestrator flagged and could **not** reproduce a
correctness defect in any of them — this code is unusually disciplined. Specifically verified
SOUND:

- **Series head→duck split** (`createAudioBuses`): duck writes ONLY `musicDuck`/`ambientDuck`;
  volume/mute write ONLY the head nodes (`musicHead`/`sfxBus`); the bed swell writes a third
  independent node (`bedInnerGain`). No AudioParam has two writers. `ensure()` re-applies all
  logical state on a context rebuild.
- **Late-binding boot** (`let buses; createAudioSystem(() => buses.sfx())`): the `getSfxBus`
  closure is only invoked inside gesture-gated play functions (async, after `buses` is assigned
  on the next synchronous line), so there is no TDZ hazard. `buses.sfx`/`.ambient`/`.music`
  passed unbound are safe (arrow fns, no `this`).
- **Decode-once cache race** (`createSampleCache`): the context-swap path discards in-flight
  decodes via the `decodeContext !== context` guard and self-heals on the next `get()`; bytes
  are retained and re-decoded from a `slice(0)` copy (decodeAudioData detaches its input).
- **Equal-power crossfade** (`createMusic`): `cos(x·½π)` / `cos((1-x)·½π)` = cos/sin, powers
  sum to 1; sources build once phase-locked, only gains move, re-ramp fires on state FLIP only.
  Absent `.ogg` → no source, no NaN, `currentTarget` still tracked so a later build lands at the
  right gain.
- **ONE combat signal fan-out** (`createGame.frame`): `isInCombat()` computed once, passed to
  ambience + duck + music. `combatState.ts` hysteresis is a single subtraction, allocation-free.
- **Per-frame zero-alloc**: `ambience.update` and `music.setCombat` allocate nothing on the
  steady path; node creation is confined to timer-driven `fire()` / lazy builds.
- **NaN-into-AudioParam**: `clampGain` (non-finite/≤0 → 0) gates every SFX peak; `panned()`
  treats NaN pan as centered (`!pan`); `gustEnvelope()` is provably bounded `[0,1]` (verified in
  `windMath.ts` + its tests), so the un-clamped bed-swell write is safe in practice.
- **localStorage clamp** (`App.readVolume`): rejects non-finite / out-of-`[0,1]` values; the bus
  setter clamps again (defense in depth).

The remaining findings are teardown/robustness and product-completeness gaps, not logic bugs.

## Warnings

### WR-01: `buses.dispose()` is never called — audio graph teardown depends on a sibling closing the context

**File:** `src/game/createGame.ts:1597-1630` (dispose), `buses` created at `src/game/createGame.ts:442`; `dispose()` defined at `src/game/audio/createAudioBuses.ts:175-187`

**Issue:** Every other audio module is torn down explicitly in `dispose()` — `combatAudio`,
`weaponAudio`, `movementAudio`, `pickupAudio`, `ambience`, `music`, `sampleCache`, `audioSystem`
(lines 1606-1613) — but the routing owner `buses` is not. Today this is masked because
`audioSystem.dispose()` calls `context.close()`, which frees the entire node graph (master,
compressor, sfx/music/ambient head+duck gains) regardless. But that is a fragile, undocumented
coupling: `createAudioBuses` exposes a `dispose()` specifically to disconnect and null its nodes,
and the one owner of those nodes never invokes it. If `audioSystem.dispose()` is ever changed to
null `context` before closing it, to defer the close, or if a future refactor stops closing the
context on teardown (e.g. to reuse it across game instances), the whole bus graph leaks with no
call site to fix. Inconsistent with the deliberate, ordered teardown of every sibling.

**Fix:** Dispose the buses alongside the other audio modules, before closing the context:

```typescript
      pickupAudio.dispose();
      ambience.dispose();
      music.dispose();
      sampleCache.dispose();
      buses.dispose();        // add: disconnect + null the routing graph
      audioSystem.dispose();  // closes the context last
```

### WR-02: Ambience (wind bed + creature one-shots) has no user volume or mute control — "mute everything" is impossible

**File:** `src/game/audio/createAudioBuses.ts:121` (ambient head pinned to `DEFAULT_AMBIENT_GAIN`, only a `duck()` writer), `src/ui/SettingsScreen.tsx:162-180` (only Music + SFX rows), `src/game/createGame.ts:154-160` (Game exposes only music/sfx setters)

**Issue:** The bus graph has three sub-buses (sfx, music, ambient) but the settings UI and the
`Game` interface expose volume/mute for only two (music, sfx). The ambient bus's head gain is set
once to `DEFAULT_AMBIENT_GAIN = 1` and thereafter only combat-ducked — there is no setter and no
UI. Consequently a player who sets Music volume to 0 and toggles SFX off still hears the
continuous procedural wind bed plus periodic bird/cricket/owl/goliath-grunt one-shots, with no
way to silence them. For a browser game likely played alongside music/streams/quiet spaces, "I
muted the game but it keeps making wind and bird noises" is a realistic complaint. This may be a
deliberate 3-bus design decision, but the *complete absence* of any ambience control (not even
folding it under the SFX mute) is a genuine gap worth an explicit decision.

**Fix:** Either route ambience under an existing user control, or add one. Minimal option — have
the SFX mute also gate the ambient bus so "SFX off" reaches a true silence for procedural
world audio:

```typescript
// createAudioBuses: add an ambient setter (mirrors setSfxMuted), or in setSfxMuted also
// ramp ambientHead. Then thread it through Game.setSfxMuted / the SettingsScreen SFX toggle.
setAmbientMuted(muted: boolean) {
  ambientMuted = muted;
  applyHead(ambientHead, ambientMuted, DEFAULT_AMBIENT_GAIN);
}
```

Otherwise, record the "ambience is intentionally uncontrollable" decision so it isn't mistaken
for an oversight later.

## Info

### IN-01: Stale dimension in the slider-thumb centering comment

**File:** `src/styles/hud/switcher.css:115`

**Issue:** The comment reads `margin-top: -5px; /* centre the 16px thumb box on the 8px track box */`
but the thumb is `width/height: 14px` (lines 112-113), not 16px. The arithmetic that motivates
`-5px` no longer matches the stated numbers, so a future tweak will be reasoning from wrong values.

**Fix:** Update the comment to the real 14px thumb / 8px track box, or re-derive the offset.

### IN-02: `ready()` helper duplicated across every audio module

**File:** `createAudioSystem.ts` (inline), `createCombatAudio.ts:66`, `createWeaponAudio.ts:107`, `createMovementAudio.ts:80`, `createPickupAudio.ts:133`, `createSampleCache.ts:51`, `createAmbience.ts:99`, `createMusic.ts:81`

**Issue:** The identical `const context = getContext(); return context && context.state === 'running' ? context : null;`
is re-implemented in eight places. Not a bug, but a shared `runningContext(getContext)` helper in
`audioCore.ts` would remove the repetition and give one place to evolve the "is the context
usable" predicate.

**Fix:** Extract to `audioCore.ts` and import.

### IN-03: `createSampleCache.get` relies on `this.preload` — fragile under destructuring

**File:** `src/game/audio/createSampleCache.ts:135`

**Issue:** `get()` calls `this.preload(url)` on the first-ask path. All current call sites invoke
it as `sampleCache.get(...)` (bound), so it works, but a future `const { get } = sampleCache`
would break the `this` binding and silently stop warming un-preloaded urls. The module already
has the `fetchBytes`/`decodeIfReady` free functions in scope.

**Fix:** Call the free helpers directly instead of routing through `this`:

```typescript
    get(url) {
      if (disposed) return null;
      let entry = entries.get(url);
      if (!entry) {
        entry = entryFor(url);
        fetchBytes(url, entry);
        return null;
      }
      ...
```

### IN-04: Belt-and-suspenders node cleanup is inconsistent between modules

**File:** `src/game/audio/createAmbience.ts:124-127,151-156,217-220` vs `createCombatAudio.ts` / `createWeaponAudio.ts` / `createPickupAudio.ts` (fire-and-forget)

**Issue:** `createAmbience` attaches `onended` handlers that `disconnect()` every node after a
one-shot finishes, while the SFX modules rely on the standard WebAudio auto-release of nodes with
no remaining references (also correct). Both are fine, but the divergent conventions make it look
like one module knows something the others don't. Worth aligning on one documented policy so a
reader doesn't assume the fire-and-forget modules have a leak.

**Fix:** Pick one convention (auto-release is sufficient for short one-shots) and note it in
`audioCore.ts`; drop the redundant `onended` disconnects or apply them uniformly.

---

_Reviewed: 2026-07-18_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
