# Phase 10: Ambient Audio & Music - Research

**Researched:** 2026-07-18
**Domain:** WebAudio graph design, procedural ambience, sample playback/looping, combat-state derivation (browser Three.js game client)
**Confidence:** HIGH (grounded almost entirely in the live codebase; WebAudio API facts cited from MDN; tuning constants are playtest-discretion)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** ONE `createAudioBuses(context)` module → `master → DynamicsCompressor → destination`, with `ambient`/`music`/`sfx` sub-bus GainNodes feeding master. Single routing source of truth.
- **D-02:** Migrate ALL 5 SFX modules (`createCombatAudio`, `createWeaponAudio`, `createMovementAudio`, `createPickupAudio`, and `createAudioSystem`'s attack plays) OFF `context.destination` onto the injected `sfx` bus. Change signatures `(getContext)` → also receive the target bus node / `buses` handle. Leave NO `.connect(context.destination)` behind. DRY/SRP: the bus module owns routing, play-functions own only synthesis. **Binding.**
- **D-03:** `createCombatAudio`'s internal `hitBus` stays its private duck-bus but connects into the shared `sfx` bus instead of `context.destination`.
- **D-04:** **Recording-first for creatures (user directive, overrides AMBI-03 synth-first wording).** Birds (day) + crickets/owl (night) use real CC0 / royalty-free recordings. Synth is the fallback, recordings the default.
- **D-05:** Wind bed stays **procedural** (filtered noise, slowly modulated) — gain must swell with the live gust envelope; a static loop cannot sidechain. Not overridden.
- **D-06:** Grass rustle (AMBI-04) stays **procedural** (movement-tied filtered-noise burst). Goliath grunt (AMBI-05) may reuse pitch-jittered synth OR a CC0 grunt — planner's discretion, recording preferred if a clean CC0 exists.
- **D-07:** All sourced audio MUST be CC0 or YouTube Audio Library royalty-free (or freesound CC0). Never ripped copyrighted tracks. Track every asset's source + license (D-16).
- **D-08:** Build ONE client-side combat-state derivation, consumed by BOTH the ambience duck (AMBI-06) and the music crossfade (MUSIC-02) — same signal, DRY.
- **D-09:** Hysteresis: **enter combat immediately**, **exit after a cooldown** (~few seconds). Exact trigger is a research item — pick the cheapest already-available client signal.
- **D-10:** ONE reusable `scheduleRandomOneShots` helper: sample set, interval range, per-shot pitch ±10-20% / pan / volume jitter, `active()` predicate. Never a fixed-interval metronome. Timing separate from playback (SRP).
- **D-11:** Time-of-day gating (AMBI-07) via existing `phase01(clock.nowMicros())` — birds `active()`=day, crickets/owl `active()`=night. Reuse the day/night clock; no second time source.
- **D-12:** Region exploration loop + combat loop, both CC0 seamless loops on the `music` bus. **Horizontal equal-power crossfade** driven by the D-08 combat state — no hard cuts. Fades align with the duck: down ~1s, up ~2-3s.
- **D-13:** Music/SFX independent volume + mute. Persist as `settings.musicVolume`, `settings.sfxVolume` (+ mute flags) following the existing `localStorage 'settings.*'` pattern in `App.tsx`. Sliders in the existing settings panel.
- **D-14:** Sample files as `.ogg` under `public/audio/{ambient,music,creatures}/`.
- **D-15:** ONE loader/cache module: `fetch` → `decodeAudioData` once per file, cache the decoded `AudioBuffer`, reused by scheduler + music. No per-play decode.
- **D-16:** `public/audio/ASSETS-LICENSES.md` tracks every asset's filename, source URL, and license.

### Claude's Discretion
- Exact compressor curve, sub-bus default gains, and per-creature interval/jitter constants (playtest-tuned, following the seed-then-playtest idiom).
- Whether goliath grunt is synth or recording (D-06).
- Precise combat-state trigger source (D-09) — pick the cheapest already-available client signal.

### Deferred Ideas (OUT OF SCOPE)
- Wing one-shot on bird flush → Phase 12 (Wildlife) fires it on the SFX bus this phase builds.
- Weather audio → milestone-deferred.
- New combat mechanics.
- (Todo cross-reference matched 6 combat/visual items — NONE audio-related; folding any = scope creep.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AMBI-01 | Audio routes through master/ambient/sfx bus + compressor; existing SFX migrated off direct `context.destination` | Pattern 1 (`createAudioBuses` lazy graph mirroring `bus()`); D-02 migration signature change; compressor = `DynamicsCompressorNode` |
| AMBI-02 | Continuous procedural wind bed whose gain swells with the gust envelope | Pattern 2 — `wind.getGustEnvelope()` ALREADY EXISTS as the sidechain contract; `setTargetAtTime` bed-gain map; `createNoiseSource`+biquad bed |
| AMBI-03 | Randomized bird chirps 5-15s, pitch ±10-20% + pan + volume jitter, never metronomic | Pattern 3 — `scheduleRandomOneShots` + pure `nextOneShotDelay`; `jitter()`/`panned()` reuse; recordings via `createSampleCache` (D-04) |
| AMBI-04 | Grass rustle when sprinting through grass | Procedural burst in `createMovementAudio` (D-06); `createNoiseSource`+lowpass idiom already there |
| AMBI-05 | Distant goliath grunts, gain scaled by nearest-camp proximity, long random intervals | `scheduleRandomOneShots` with `active()`/gain from `camps.ts` `getCampSites()` distance; synth-or-CC0 (D-06) |
| AMBI-06 | Combat ducks ambience — birds stop, bed −6..−12dB over ~1s, restore ~2-3s, never hard-cut | Pattern 5 `duck()` (mirrors `duckHits()`); birds `active()` returns false while inCombat; combat state from D-08 signal |
| AMBI-07 | Ambience varies by time of day — birds day, crickets/owl night | `phase01(clock.nowMicros())` `active()` gates (D-11); no new time source |
| MUSIC-01 | Region exploration loop, CC0 seamless, on music bus at ambient volume | Pattern 4 `AudioBufferSourceNode` `loop=true`+`loopStart/loopEnd`; `createSampleCache` decode-once; MUST source asset (no synth fallback) |
| MUSIC-02 | Combat music crossfades in/out on the same combat-state signal | Pattern 4 equal-power `cos`/`sin` crossfade; same `isInCombat` signal as AMBI-06 (D-08) |
| MUSIC-03 | Mute/adjust music independently of SFX, persisted locally | `App.tsx` `settings.*` pattern (D-13); new `Game` setters → `buses.setMusicGain`/`setSfxGain`; `SettingsScreen` sliders |
</phase_requirements>

## Summary

This phase is a pure client-side WebAudio build with zero new dependencies — the project already
hand-rolls all SFX on a shared, gesture-unlocked `AudioContext` and the entire Phase-10 surface is
"add three new WebAudio sub-systems (bus/compressor, ambience bed + creature scheduler, region/combat
music) and one derived combat-state signal, then reroute the five existing SFX modules through the
new bus." Every integration point the CONTEXT flagged as an open question is already present in the
code, and one of them (the CPU-readable gust envelope for AMBI-02) is **already fully surfaced** —
`wind.getGustEnvelope()` exists and is documented in `createWind.ts` as "the Phase 10 audio sidechain
contract." That removes the single biggest risk the CONTEXT anticipated.

The combat-state signal (AMBI-06 + MUSIC-02) — flagged as "a real gap: none exists today" — has a
clean, zero-cost answer: the game already funnels every damage event through three callbacks
(`spawnWorldNumber(isMine)`, `spawnSelfNumber(hurtKinds)`, `spawnPlayerNumber(isMine)`) that fire
exactly when the local player deals or takes damage. Stamping `lastCombatAt` in those handlers and
running a pure enter-immediately/exit-after-cooldown hysteresis avoids any per-frame iteration over
the server enemy/goliath tables — strictly cheaper than a nearest-enemy-in-aggro scan, and it satisfies
the client-performance rules by construction.

**Primary recommendation:** Build four new modules under `src/game/audio/` — `createAudioBuses.ts`
(routing + compressor + duck), `createSampleCache.ts` (decode-once `AudioBuffer` loader), the pure
`ambienceMath.ts` + its `createAmbience.ts` wrapper (procedural wind bed + `scheduleRandomOneShots`),
and `createMusic.ts` (two seamless loops + equal-power crossfade) — plus a pure `combatState.ts`
hysteresis helper. Reroute the five existing SFX modules onto the injected `sfx` bus by changing their
constructor from `createXAudio(getContext)` to `createXAudio(getContext, getSfxBus)`. Wire one
`update(dt, gust, phase01, combatState)` call into the `createGame.frame()` loop right after
`daynight.update()` (line 1367). Stage all recordings as `.ogg` under `public/audio/{ambient,music,creatures}/`
with an `ASSETS-LICENSES.md` provenance file; the planner should create "drop CC0 file here" checkpoint
tasks rather than expect the researcher/planner to fetch audio.

## Architectural Responsibility Map

This phase is entirely browser/client-tier (zero server publish — no reducers, tables, or bindings).
The relevant "tiers" are internal client sub-systems.

| Capability | Primary Owner | Secondary | Rationale |
|------------|--------------|-----------|-----------|
| Bus routing + compressor (AMBI-01) | `createAudioBuses` (new) | the 5 SFX modules (consumers) | Single source of truth for graph topology (D-01/D-02) |
| Procedural wind bed (AMBI-02) | `createAmbience` (new) | `wind.getGustEnvelope()` (source) | Bed gain sidechains the live gust envelope; a static loop can't (D-05) |
| Creature one-shots (AMBI-03/05/07) | `scheduleRandomOneShots` + `createSampleCache` | `phase01` (day/night gate), `camps.ts` (grunt proximity) | Timing (scheduler) split from sound (samples) per SRP (D-10) |
| Grass rustle (AMBI-04) | `createMovementAudio` (extend) | `audioCore` primitives | Procedural, movement-tied; already the footstep idiom (D-06) |
| Combat-state derivation (AMBI-06/MUSIC-02) | `combatState.ts` (pure) + `createGame` frame loop | existing damage callbacks | ONE signal feeds BOTH duck and music crossfade (D-08) |
| Region + combat music (MUSIC-01/02) | `createMusic` (new) | `createSampleCache`, combat-state | Equal-power horizontal crossfade on the music bus (D-12) |
| Volume/mute persistence + UI (MUSIC-03) | `App.tsx` settings + `SettingsScreen.tsx` | bus gain setters | Reuses the verbatim `localStorage 'settings.*'` pattern (D-13) |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Web Audio API (`AudioContext`) | native (browser) | All synthesis, routing, sample playback, ducking, crossfade | Already the project's entire audio foundation; zero deps [VERIFIED: codebase `createAudioSystem.ts`] |
| `DynamicsCompressorNode` | native | Master-bus glue compressor (AMBI-01) | Standard WebAudio node; prevents layered ambience+SFX+music from clipping [CITED: MDN DynamicsCompressorNode] |
| `AudioBufferSourceNode` (`loop`, `loopStart`/`loopEnd`) | native | Seamless music loops + decoded creature one-shots | The only correct primitive for gapless looping in WebAudio [CITED: MDN AudioBufferSourceNode.loop] |
| `AudioContext.decodeAudioData` | native | Decode `.ogg` → `AudioBuffer` once, cache (D-15) | Async decode-once-reuse is the canonical sample pattern [CITED: MDN decodeAudioData] |
| Vitest | 3.2.4 | Pure-helper twins for scheduler math + combat hysteresis | Already the project test runner [VERIFIED: package.json] |

**No new npm packages.** This phase adds zero dependencies — consistent with the existing
"zero-asset, zero-dependency" audio subsystem. (Assets are `.ogg` files, not packages.)

### Alternatives Considered

| Instead of | Could Use | Tradeoff / Why Rejected |
|------------|-----------|-------------------------|
| Hand-rolled bus graph | Howler.js / Tone.js | Adds a dependency + a second AudioContext; the project already owns its graph and CLAUDE.md forbids needless indirection. REJECT. |
| `.ogg` samples | `.mp3` / `.webm` | `.ogg` is CC0-friendly, small, and universally decodable in evergreen browsers; matches D-14. Keep `.ogg`. (Note pitfall: Safari's `.ogg` support — see Pitfalls.) |
| Combat state from enemy-table scan | nearest-enemy-in-aggro-radius each frame | Per-frame iteration over server `enemy`/`goliath` rows; violates zero-alloc/no-per-frame-waste. Event-driven `lastCombatAt` is strictly cheaper (D-09). REJECT. |
| `AudioBufferSourceNode` loop | two ping-ponged one-shots for music | Reinvents gapless looping and drifts; native `loop=true` is sample-accurate. REJECT. |

**Installation:** None. (Create `public/audio/{ambient,music,creatures}/` directories and drop CC0 assets.)

## Package Legitimacy Audit

> This phase installs **no external packages**. Audio is native Web Audio API; assets are `.ogg` files
> under `public/`. No registry verification applicable.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram (WebAudio graph after this phase)

```
                                  createAudioSystem (owns the ONE AudioContext, gesture-unlock)
                                                     │ getContext()
        ┌────────────────────────────────────────────┼─────────────────────────────────────┐
        │                                             │                                      │
  createAudioBuses(getContext)  ◄── lazily builds graph on first bus access (mirrors combatAudio bus())
        │
        │   ambient GainNode ─┐
        │   music   GainNode ─┼──► master GainNode ──► DynamicsCompressor ──► ctx.destination
        │   sfx     GainNode ─┘
        │
   ┌────┴───────────────┬─────────────────────┬──────────────────────┐
   │ sfx bus            │ ambient bus          │ music bus            │
   │                    │                      │                      │
  5 SFX modules      createAmbience         createMusic
  (combat/weapon/    ├─ wind bed (noise→     ├─ region loop (AudioBufferSource loop=true)
   movement/pickup/  │   filter→gain, gain   ├─ combat loop (loop=true)
   attack plays)     │   = f(getGustEnvelope))└─ equal-power crossfade gains (cos/sin)
                     └─ scheduleRandomOneShots
                        ├─ birds  active()=day (phase01)
                        ├─ crickets/owl active()=night
                        └─ goliath grunt active()=near camp   (all decoded via createSampleCache)

   Per-frame (createGame.frame, after daynight.update):
     combatState.update(elapsedSeconds)  →  enter-now / exit-after-cooldown
        │
        ├──► createAudioBuses.duck(combat)   (ambient + music bus gains: -6..-12dB / restore)
        ├──► createAmbience.update(dt, wind.getGustEnvelope(), phase01, inCombat)
        └──► createMusic.setCombat(inCombat)  (equal-power crossfade region↔combat)
```

The diagram traces the primary path: `AudioContext` → sub-bus gains → master → compressor → speakers,
with the combat-state signal fanning out to duck + crossfade, and the gust envelope feeding the bed gain.

### Recommended Module Structure (all under `src/game/audio/`)

```
audio/
├── audioCore.ts            # EXISTING — reuse clampGain/createNoiseSource/jitter/panned
├── createAudioSystem.ts    # EXISTING — owns AudioContext + gesture unlock; migrate attack plays to sfx bus
├── createAudioBuses.ts     # NEW — master→compressor→destination + ambient/music/sfx GainNodes + duck() (D-01)
├── createSampleCache.ts    # NEW — fetch→decodeAudioData once, cache AudioBuffer by url (D-15)
├── ambienceMath.ts         # NEW — PURE: bed gain map + scheduler next-time/jitter (vitest twin)
├── createAmbience.ts       # NEW — wind bed + scheduleRandomOneShots (birds/crickets/owl/grunt) (D-05/D-10/D-11)
├── createMusic.ts          # NEW — two loop sources + equal-power crossfade (D-12)
├── combatState.ts          # NEW — PURE: nextCombatState hysteresis (vitest twin) (D-08/D-09)
├── createCombatAudio.ts    # EDIT — hitBus connects into sfx bus, not destination (D-03)
├── createWeaponAudio.ts    # EDIT — accept getSfxBus, route out through it (D-02)
├── createMovementAudio.ts  # EDIT — accept getSfxBus; add grass rustle (AMBI-04)
└── createPickupAudio.ts    # EDIT — accept getSfxBus, route notes through it (D-02)
```

Each new `create*` module stays under 300 LOC (CLAUDE.md). The heavy `ambienceMath` constants and
`scheduleRandomOneShots` timing live in the pure file; the wrapper only touches WebAudio.

### Pattern 1: Lazy-built bus graph mirroring the existing `bus()` idiom

**What:** `createAudioBuses(getContext)` returns accessor functions (`sfx()`, `music()`, `ambient()`,
`master()`, `duck(...)`, `setMusicGain(v)`, `setSfxGain(v)`). It builds the graph the first time any
accessor runs with a live context and caches it — exactly the pattern `createCombatAudio.bus()` already
uses (rebuild if `busContext !== context`). This avoids ordering problems: the context unlocks
asynchronously on the first gesture, so buses cannot be built eagerly at construction.

**When to use:** Always — it's the single routing owner (D-01). Modules never call `.connect(context.destination)`.

**Example (grounded in the existing `bus()` in `createCombatAudio.ts:66-73`):**
```typescript
// Source: pattern extracted from createCombatAudio.ts bus() + duckHits()
export function createAudioBuses(getContext: () => AudioContext | null) {
  let ctx: AudioContext | null = null;
  let master: GainNode, comp: DynamicsCompressorNode, ambient: GainNode, music: GainNode, sfx: GainNode;
  function ensure(): AudioContext | null {
    const c = getContext();
    if (!c) return null;
    if (ctx !== c) {                        // (re)build once per context, like bus()
      master = c.createGain();
      comp = c.createDynamicsCompressor();
      master.connect(comp).connect(c.destination);
      ambient = c.createGain(); music = c.createGain(); sfx = c.createGain();
      ambient.connect(master); music.connect(master); sfx.connect(master);
      ctx = c;
    }
    return c;
  }
  return {
    sfx: () => (ensure() ? sfx : null),
    music: () => (ensure() ? music : null),
    ambient: () => (ensure() ? ambient : null),
    // ...setMusicGain/setSfxGain/setMute + duck() (below)
  };
}
```

**Migration signature change (D-02):** each SFX module goes from
`createWeaponAudio(getContext)` → `createWeaponAudio(getContext, getSfxBus)`, and every
`panned(context, pan, context.destination)` / `.connect(context.destination)` becomes
`panned(context, pan, getSfxBus() ?? context.destination)`. The `?? context.destination` fallback keeps
audio working if the bus isn't ready yet (defensive; in practice the gesture unlock precedes any play).
Delete every `context.destination` reference in the five modules (no legacy path left — CLAUDE.md).

### Pattern 2: `wind.getGustEnvelope()` → bed gain (AMBI-02 — ALREADY SURFACED)

**What:** The CONTEXT's "CRITICAL RESEARCH QUESTION" (is there a CPU-readable gust scalar or must one
be surfaced?) is **already answered in the code.** `createWind.ts:33-37,64-66` exposes:
```typescript
/** Global (un-retarded) gust envelope, 0..1 — the Phase 10 audio sidechain contract. */
getGustEnvelope(): number;   // returns gustEnvelope(timeUniform.value) from windMath.ts:138
```
`gustEnvelope(t)` is `pow(max(0, sin·sin·sin), sharpness)` — three sines + a pow, per-frame cost is
trivial and zero-alloc. **No surfacing work is needed; the contract exists.**

**When to use:** In the ambience `update()`, each frame:
```typescript
// bed gain = base + swell * gust, smoothed to the AudioParam so it doesn't zipper
const target = BED_BASE_GAIN + BED_SWELL_GAIN * wind.getGustEnvelope();  // gust ∈ [0,1]
bedGain.gain.setTargetAtTime(target, ctx.currentTime, BED_SMOOTH_TAU);   // ~0.15s smoothing
```
`setTargetAtTime` avoids per-frame `linearRampToValueAtTime` scheduling churn and gives an exponential
approach that reads as a natural swell. **Zero allocation, one AudioParam write per frame.**

**Note for the planner:** `getGustEnvelope()` rests near 0 between gusts (gusts are EVENTS, peaks every
~30-60s per `windMath.ts` GUST comment), so `BED_BASE_GAIN` must be audible on its own — the swell is a
bonus on top of a continuous bed, not the whole bed. Also: when `?nowind` is active,
`strengthUniform.value === 0` but `getGustEnvelope()` still returns the raw envelope (it doesn't read
strength). If the bed should go calm under `?nowind`, multiply by `wind.strengthUniform.value`. Confirm
desired `?nowind` audio behavior at playtest (minor).

### Pattern 3: `scheduleRandomOneShots` — one reusable scheduler (D-10, SRP)

**What:** A single helper that fires a randomized one-shot from a sample set on a random interval, with
per-shot pitch/pan/volume jitter and an `active()` predicate gate. Timing lives in a pure function
(`nextOneShotDelay`); playback is a thin WebAudio call. It is NEVER a fixed-interval metronome
(REQUIREMENTS "Out of Scope": fixed-interval/fixed-pitch chirps are a canonical failure).

**When to use:** Instantiated once per creature layer — birds (`active()=phase01 is day`), crickets+owl
(`active()=night`), goliath grunt (`active()=nearest camp within range`). Reuses `jitter()` and
`panned()` from `audioCore.ts`.

**Example (scheduler drives itself off the WebAudio clock, not per-frame node creation):**
```typescript
// Source: composition of audioCore.jitter + AudioBufferSourceNode playbackRate
// PURE (ambienceMath.ts): next delay in a [min,max] window, never metronomic
export function nextOneShotDelay(minS: number, maxS: number, rand: number): number {
  return minS + (maxS - minS) * rand;   // rand ∈ [0,1); caller supplies Math.random()
}
// Wrapper: schedule the NEXT shot when the current one is scheduled (self-rescheduling),
// checking active() at fire time so a gated-off layer costs nothing but a timer.
```
The scheduler should key off `setTimeout`/an internal timer rather than the render frame, so a silent
(gated-off) layer does zero work per frame. When it fires, it decodes-once via `createSampleCache`,
creates a short-lived `AudioBufferSourceNode` with `playbackRate.value = jitter(0.15)` (±15% pitch,
inside AMBI-03's ±10-20%), a `panned()` node, and a per-shot gain, then reschedules.

### Pattern 4: Seamless music loop + equal-power crossfade (MUSIC-01/02, D-12)

**What:** Two persistent `AudioBufferSourceNode`s (region + combat), each `loop=true` with `loopStart`/
`loopEnd` set to the sample's true loop points, each feeding its own GainNode into the `music` bus. The
combat-state toggles an equal-power crossfade between the two gains.

**Equal-power crossfade** (constant perceived loudness — a linear crossfade dips at the midpoint):
```typescript
// Source: equal-power (constant-power) crossfade, standard WebAudio technique
// x ∈ [0,1] = fade progress toward combat
regionGain.gain.value = Math.cos(x * 0.5 * Math.PI);   // 1 → 0
combatGain.gain.value = Math.cos((1 - x) * 0.5 * Math.PI); // 0 → 1
```
In practice, drive `x` with `setTargetAtTime` on each gain toward its target (down ~1s / up ~2-3s per
D-12) rather than stepping `x` per frame. Both loops run continuously from unlock (or lazily start on
first unlock); only their gains move — no start/stop churn, no re-sync drift.

**Seamless loop caveat:** `loop=true` is sample-accurate ONLY if the `.ogg`'s loop boundary is clean.
Encoder padding (especially MP3-style) inserts gaps; `.ogg`/Vorbis is better but the asset must be
authored/trimmed as a true loop. Set `loopStart`/`loopEnd` explicitly if the file has lead-in/tail.
This is an ASSET-QUALITY task, not a code task — flag it in the "drop CC0 file here" checkpoint.

### Pattern 5: Combat ducking (AMBI-06, D-08)

**What:** On combat enter, ramp the `ambient` and `music` bus gains down −6..−12dB over ~1s; on combat
exit (after the hysteresis cooldown), restore over ~2-3s. Birds STOP entirely (their scheduler
`active()` returns false while `inCombat`), not just duck. Mirrors the existing `duckHits()` in
`createCombatAudio.ts:97-104` but on the ambient/music buses and over seconds instead of milliseconds.

```typescript
// dB → linear: -6dB ≈ 0.5, -12dB ≈ 0.25
function duck(bus: GainNode, ctx: AudioContext, targetLinear: number, seconds: number) {
  const now = ctx.currentTime;
  bus.gain.cancelScheduledValues(now);
  bus.gain.setValueAtTime(bus.gain.value, now);
  bus.gain.setTargetAtTime(targetLinear, now, seconds / 3);  // ~3τ ≈ `seconds` to settle
}
```
Use `setTargetAtTime` (smooth, never zippers) over `linearRampToValueAtTime`. Down uses a short τ
(~0.33s → ~1s settle), restore uses a longer τ (~0.8s → ~2.4s settle).

### Anti-Patterns to Avoid

- **Fixed-interval / fixed-pitch chirps** — explicitly out of scope; a metronome. Always jitter interval AND pitch (D-10, AMBI-03).
- **Per-play `decodeAudioData`** — decode once, cache the `AudioBuffer` (D-15). Re-decoding per one-shot is a GC + latency disaster.
- **Per-frame enemy-table iteration for combat state** — use the event-driven `lastCombatAt` stamp (D-09), not a scan.
- **`linearRampToValueAtTime` scheduled every frame** — schedules a new event per frame; `setTargetAtTime` set once per target change is cheaper and smoother.
- **Leaving any `.connect(context.destination)` in the five modules** — D-02 is binding; the bus owns routing, delete all direct-destination connects (no legacy path).
- **Eagerly building the bus graph at construction** — context unlocks async; build lazily on first access (Pattern 1).
- **Reading `wind.strengthUniform.value` cached** — hold the object, read `.value` each frame (createWind.ts warns the uniform is mutated in place).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Gapless music looping | Manual scheduled ping-pong of two one-shots | `AudioBufferSourceNode.loop = true` + `loopStart`/`loopEnd` | Native loop is sample-accurate; manual scheduling drifts and clicks [CITED: MDN] |
| CPU gust scalar for the bed | New readback from `createWind`/GPU uniforms | `wind.getGustEnvelope()` (already exists) | The sidechain contract is already implemented and documented [VERIFIED: createWind.ts] |
| Combat-state derivation | New aggro-scan over server tables | Stamp `lastCombatAt` in the 3 existing damage callbacks | Zero per-frame cost; the events already flow through `createGame` (D-09) |
| Day/night gate for birds vs crickets | A second time source | `phase01(clock.nowMicros())` from `dayNightMath` | One clock only (D-11); already the atmosphere time source |
| Sample decode/cache | Ad-hoc fetch+decode per module | ONE `createSampleCache` (D-15) | Decode-once reused by scheduler AND music; DRY |
| Bus routing in each module | Per-module `.connect(destination)` | ONE `createAudioBuses` (D-01) | Single routing owner; SRP/DRY directive is binding |
| Constant-loudness crossfade | Linear gain crossfade | Equal-power `cos`/`sin` curves | Linear dips ~−3dB at the midpoint (audible hole) |
| Zipper-free gain moves | Per-frame `.gain.value =` writes | `setTargetAtTime` on the AudioParam | Direct value writes zipper; scheduled ramps are smooth |

**Key insight:** Nearly every "hard" part of this phase is already solved or contracted in the codebase
(gust envelope, day/night phase, damage events, the `bus()`/`duckHits()` templates, the `audioCore`
primitives, the `settings.*` persistence). The net-new work is small, well-bounded WebAudio plumbing +
sourcing/authoring CC0 assets.

## Combat-State Signal (AMBI-06 + MUSIC-02) — resolved

**Confirmed:** No `inCombat`/`combatState` exists in the codebase (grep for the concept finds only the
per-sound throttles). [VERIFIED: codebase grep]

**Cheapest available client signal (D-09):** the game already fires these on real damage:

| Callback (createGame.ts) | Fires when | Combat trigger |
|--------------------------|-----------|----------------|
| `spawnWorldNumber(x,z,amt,kind,isMine)` :1734 | any player's hit lands on an enemy | `isMine === true` → I dealt damage |
| `spawnSelfNumber(amt,kind)` :1725 | local player takes damage / heals | `kind` is a hurt kind (`taken*`/`pvp*`) → I took damage |
| `spawnPlayerNumber(hex,amt,kind,isMine)` :1750 | PVP hit on a remote player | `isMine === true` → I dealt PVP damage |

**Recommendation:** In each of those handlers, on the combat-relevant branch, set
`lastCombatAt = elapsedSeconds`. Then a pure hysteresis helper drives the state:

```typescript
// combatState.ts — PURE (vitest twin), mirrors windMath/dayNightMath discipline
export const COMBAT_EXIT_COOLDOWN_SECONDS = 5;   // playtest-tunable (Claude's discretion)
/** enter immediately on a fresh trigger; exit only after cooldown of no combat (D-09). */
export function isInCombat(nowS: number, lastCombatAtS: number): boolean {
  return nowS - lastCombatAtS < COMBAT_EXIT_COOLDOWN_SECONDS;
}
```

This is enter-immediately (the instant `lastCombatAt` is stamped, `nowS - lastCombatAt ≈ 0 < cooldown`)
and exit-after-cooldown (brief lulls under 5s never flip it). One subtraction per frame, no allocation,
no table scan. Read it in the frame loop and pass to `duck()`, `createAmbience.update(...,inCombat)`,
and `createMusic.setCombat(inCombat)` — **one signal, both consumers (D-08).**

**AMBI-05 goliath-grunt proximity** (separate from combat state): the grunt's `active()`/gain uses
nearest-camp distance. `src/game/world/camps.ts` `getCampSites()` returns deterministic `{x,z,archetypeId}`
camp positions [VERIFIED: camps.ts]. Compute `min` distance from `playerPosition` to the camp set (small
fixed array, cheap) and scale grunt gain by proximity (goliath camps only, or all camps — planner's
call). Alternatively gate on live goliath row proximity, but camps are static and cheaper.

## Runtime State Inventory

> Not a rename/refactor/migration phase — this is additive feature work. Section included for
> completeness; all categories verified empty.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no DB/table changes (client-only phase, zero server publish) | none |
| Live service config | None — no external services touched | none |
| OS-registered state | None | none |
| Secrets/env vars | None | none |
| Build artifacts | New `public/audio/**` static assets ship in `dist/` via `vite build` | Ensure `.ogg` assets are committed and served (laragon serves `dist/`) |

## Common Pitfalls

### Pitfall 1: Async decode vs. gesture unlock race
**What goes wrong:** `decodeAudioData` needs a live `AudioContext`, but the context only exists after the
first user gesture. Kicking off fetch/decode at construction returns before the context is ready, or
decodes against a context that later gets replaced.
**Why it happens:** The gesture-unlock in `createAudioSystem` creates the context lazily and asynchronously.
**How to avoid:** `createSampleCache` should fetch the `ArrayBuffer` eagerly (network is context-free) but
defer `decodeAudioData` until a live context is available, and cache the decoded `AudioBuffer` per context
(rebuild if the context changes, like `bus()`). Music loops start on first unlock, not at construction.
**Warning signs:** "Cannot decode audio data" on load; silent music that never starts.

### Pitfall 2: `.ogg` decode support on Safari / iOS
**What goes wrong:** Vorbis `.ogg` historically wasn't decodable by `decodeAudioData` on older Safari.
**Why it happens:** Codec coverage gaps.
**How to avoid:** Confirm target-browser coverage; evergreen Chromium/Firefox are fine. If Safari/iOS is a
target, either ship a `.m4a`/`.aac` fallback per asset or accept ambience-silent Safari. **Open question —
confirm the project's browser matrix** (the game is LAN + desktop-first per CLAUDE.md, so likely Chromium).
**Warning signs:** Ambience/music silent only on Safari.

### Pitfall 3: Loop boundary click
**What goes wrong:** `loop=true` clicks at the seam if the sample isn't a true loop (encoder padding or a
non-zero-crossing boundary).
**Why it happens:** Lossy encoders add lead-in silence; raw cuts land mid-waveform.
**How to avoid:** Author/trim loops to zero crossings, prefer `.ogg`/Vorbis (less padding than MP3), and set
`loopStart`/`loopEnd` explicitly past any lead-in. This is an asset task — bake it into the "drop CC0 file"
checkpoint, not code.
**Warning signs:** A periodic tick every loop length.

### Pitfall 4: Zipper noise from per-frame gain writes
**What goes wrong:** Setting `gain.value` directly each frame (bed swell, crossfade, duck) produces stair-step
artifacts.
**How to avoid:** Use `setTargetAtTime` (or `linearRampToValueAtTime` set once per target change), never a
raw per-frame `.value =`.
**Warning signs:** Grainy/buzzy swells or crossfades.

### Pitfall 5: Duck fights the bed swell
**What goes wrong:** Both the AMBI-02 gust swell AND the AMBI-06 duck write `ambient` bus gain → they stomp
each other.
**Why it happens:** Two writers on one AudioParam.
**How to avoid:** Put the gust swell on the **bed's own inner GainNode** (inside `createAmbience`) and the
duck on the **`ambient` bus GainNode** (the bus feeding master). Two different nodes in series multiply
cleanly — swell modulates the bed, duck scales the whole ambient bus. Keep these on separate nodes.
**Warning signs:** Bed volume jitters oddly during combat, or the duck doesn't fully take.

### Pitfall 6: Combat-state thrash from a single stray hit
**What goes wrong:** Without hysteresis, one distant spectated hit flips combat on/off, thrashing the duck +
crossfade.
**How to avoid:** The enter-immediately/exit-after-cooldown helper (5s cooldown) absorbs lulls. Consider
gating the *enter* trigger to MY combat only (`isMine`/self-hurt), not spectated others' fights, so a far
skirmish doesn't duck my exploration music. **Decide: does combat music trigger on my fights only, or any
nearby fight?** (Recommend: my fights only — matches "combat ducks the ambience" reading. Playtest.)
**Warning signs:** Music crossfading during peaceful exploration because someone else is fighting far away.

## Code Examples

### Wiring the per-frame update into the frame loop (createGame.frame)
```typescript
// Source: createGame.ts:1363-1367 (insert right after daynight.update())
wind.update(deltaSeconds);
daynight.update();
// NEW — one combat signal, fanned out to duck + ambience + music (D-08)
const inCombat = isInCombat(elapsedSeconds, lastCombatAt);
buses.duck(inCombat);                                   // ambient + music bus gains
ambience.update(deltaSeconds, wind.getGustEnvelope(), phase01(serverClock.nowMicros()), inCombat);
music.setCombat(inCombat);
```
(`phase01` is already imported by `createDayNightCycle`; expose the same `serverClock` value already
present in `createGame` at line 346. `lastCombatAt` is a `let` in `createGame` scope set by the three
damage callbacks.)

### Settings persistence + UI (MUSIC-03) — reuse the exact existing pattern
```typescript
// Source: App.tsx:77-78 (state) + :880-892 (persist effect) — mirror verbatim
const [musicVolume, setMusicVolume] = useState(
  () => Number(localStorage.getItem('settings.musicVolume') ?? '0.7')
);
const [sfxVolume, setSfxVolume] = useState(
  () => Number(localStorage.getItem('settings.sfxVolume') ?? '1')
);
useEffect(() => {
  localStorage.setItem('settings.musicVolume', String(musicVolume));
  gameRef.current?.setMusicVolume(musicVolume);   // new Game setter → buses.setMusicGain
}, [musicVolume]);
// ...same for sfxVolume, plus boolean mute flags following settings.showFps ('1'/'0')
```
Add `setMusicVolume`/`setSfxVolume`/`setMusicMuted`/`setSfxMuted` to the `Game` interface
(createGame.ts:141-209) and to `SettingsScreen.tsx` props (new sliders + mute toggles, following the
existing `Toggle`/`onToggle*` prop idiom). Sliders live in the existing settings panel (D-13).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-sound `.connect(context.destination)` | Sub-bus graph → master → compressor | This phase (AMBI-01) | Central volume/duck control; headroom |
| Synth-only ambience | Recording-first creatures, procedural wind/rustle | This phase (D-04/D-05/D-06) | Real bird/cricket/owl recordings; user directive |
| `ScriptProcessorNode` (deprecated) | `AudioBufferSourceNode` + AudioParam automation | Long-standing | N/A — project already uses the modern nodes |

**Deprecated/outdated (do not use):**
- `ScriptProcessorNode` — deprecated; not needed here (no custom DSP; noise via buffer + biquad).
- Linear crossfades for music — replaced by equal-power for constant loudness.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `-6dB ≈ 0.5`, `-12dB ≈ 0.25` linear gain targets for the duck | Pattern 5 | Low — duck depth is playtest-tuned (Claude's discretion) anyway |
| A2 | 5s combat-exit cooldown feels right | Combat-State | Low — explicitly playtest-tunable (D-09 discretion) |
| A3 | `.ogg`/Vorbis decodes on the target browsers | Pitfall 2 | Medium — Safari/iOS gap; confirm browser matrix before locking `.ogg`-only |
| A4 | Combat music should trigger on MY fights only, not spectated others' | Pitfall 6 | Medium — a design call; affects perceived correctness. Confirm at discuss/playtest |
| A5 | `setTargetAtTime` τ = seconds/3 gives ~`seconds` settle time | Patterns 2/5 | Low — standard exponential-approach approximation; tune by ear |
| A6 | Bed swell node and duck node kept separate (series multiply) | Pitfall 5 | Low — architectural best practice, verifiable by inspection |
| A7 | Goliath grunt proximity uses static `camps.ts` sites (not live goliath rows) | AMBI-05 | Low — either works; camps are cheaper (D-06 leaves it to planner) |

**All WebAudio API facts (loop, decodeAudioData, DynamicsCompressor, setTargetAtTime) are stable,
long-standing browser APIs [CITED: MDN] and already in use in this codebase — not assumptions.**

## Open Questions (RESOLVED)

1. **Browser matrix for `.ogg` (A3)**
   - What we know: game is LAN/desktop-first (CLAUDE.md); Chromium/Firefox decode `.ogg` fine.
   - What's unclear: whether Safari/iOS is a supported target.
   - **RESOLVED:** default `.ogg`-only (D-14); Safari not a current target. If it becomes one, add per-asset `.m4a` fallback later. Not a blocker — plans use `.ogg`.

2. **Combat music trigger scope (A4)**
   - What we know: the three damage callbacks distinguish `isMine`.
   - What's unclear: should a nearby *other players'* fight duck my ambience / start combat music?
   - **RESOLVED:** MY combat only for the duck + music crossfade (one boolean in the stamp condition; adopted in 10-03 Task 3). Revisit at playtest if desired — cheap to change.

3. **`?nowind` audio behavior**
   - What we know: `getGustEnvelope()` ignores `strengthUniform`.
   - What's unclear: should the bed go calm under `?nowind`?
   - **RESOLVED:** leave the bed swell driven by the gust envelope as-is under `?nowind` (minor; no calm-coupling this phase). Multiply swell by `wind.strengthUniform.value` later only if calm-under-nowind is wanted.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Web Audio API | all audio | ✓ (browser native) | — | none needed |
| Vitest | pure-helper twins | ✓ | 3.2.4 | — |
| CC0 `.ogg` assets (birds/crickets/owl/region+combat music, opt. grunt) | AMBI-03/05/07, MUSIC-01/02 | ✗ not yet sourced | — | Synth fallback for creatures (D-04 makes synth the fallback); music has NO synth fallback — must source at least region + combat loops |

**Missing with fallback:** creature recordings → procedural synth fallback exists (D-04/D-06) but the user
directive is recordings-first; stage as checkpoint tasks.
**Missing, blocking a requirement:** MUSIC-01/02 have no synth fallback in scope — the two music loops MUST
be sourced (CC0/YouTube Audio Library) for those requirements to pass. Planner must stage a
`checkpoint:human-verify` "drop region.ogg + combat.ogg here" task and the `ASSETS-LICENSES.md` entry (D-16)
before MUSIC-01/02 can be verified.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 |
| Config file | `vitest.config.ts` (present) |
| Quick run command | `npx vitest run src/game/audio` |
| Full suite command | `npm test` (`vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AMBI-01 | SFX route through sfx bus, not destination | manual/inspection (WebAudio graph) | (code review + playtest) | ❌ manual |
| AMBI-02 | bed gain map from gust envelope | unit (pure) | `npx vitest run src/game/audio/__tests__/ambienceMath.test.ts` | ❌ Wave 0 |
| AMBI-03 | one-shot interval never metronomic, jitter in range | unit (pure `nextOneShotDelay`) | same file | ❌ Wave 0 |
| AMBI-05 | grunt gain scales with nearest-camp distance | unit (pure proximity map) | same file | ❌ Wave 0 |
| AMBI-06 | duck enters/exits on combat state | unit (pure `isInCombat`) + playtest | `npx vitest run src/game/audio/__tests__/combatState.test.ts` | ❌ Wave 0 |
| AMBI-07 | birds day / crickets+owl night gate via phase01 | unit (active() predicate over phase01) | ambienceMath test | ❌ Wave 0 |
| MUSIC-02 | crossfade driven by same combat state | unit (`isInCombat`) + playtest | combatState test | ❌ Wave 0 |
| MUSIC-03 | volumes persist to localStorage | manual (settings round-trip) | playtest | ❌ manual |
| AMBI-04 / MUSIC-01 | rustle audible / region loop plays | manual (audible playtest) | playtest | ❌ manual |

Audio *playback* is gesture-gated WebAudio and stays manual by design (the codebase's stated discipline:
"the play functions are gesture-gated WebAudio and stay untested here"). The **pure math** (scheduler
timing/jitter, combat hysteresis, bed-gain map, proximity map, day/night `active()` gates) gets vitest
twins — mirroring `pickupLadder.test.ts`, `windMath.test.ts`, `dayNightMath.test.ts`.

### Sampling Rate
- **Per task commit:** `npx vitest run src/game/audio` (fast; pure helpers only)
- **Per wave merge:** `npm test` (full suite green)
- **Phase gate:** full suite green + a two-client / headphones human playtest (audio can only be verified by ear) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/game/audio/__tests__/ambienceMath.test.ts` — covers AMBI-02/03/05/07 pure math
- [ ] `src/game/audio/__tests__/combatState.test.ts` — covers AMBI-06/MUSIC-02 hysteresis
- [ ] `public/audio/{ambient,music,creatures}/` directories + `ASSETS-LICENSES.md` scaffold (D-16)
- [ ] No framework install needed (Vitest present)

## Security Domain

> `security_enforcement` not explicitly disabled — section included. This is a client-only cosmetic-audio
> phase: no auth, no network, no persistence beyond `localStorage`, no user input parsing.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — (no auth surface) |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | minimal | `localStorage` volume values are read with `Number(...)`; clamp to `[0,1]` before applying to gain (a NaN/garbage value must not reach an AudioParam) |
| V6 Cryptography | no | — |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Corrupt/garbage `localStorage` volume → `NaN` into `gain.value` | Tampering (local) | `clampGain`-style clamp `[0,1]`, fall back to default on non-finite (reuse `audioCore.clampGain` idea) |
| Malicious/oversized `.ogg` asset | (project-controlled assets only) | Assets are first-party CC0 files committed to the repo; no user-supplied audio. No runtime fetch of third-party URLs at play time |
| CC0/licensing violation (ToS) | — (legal, not security) | D-07/D-16 provenance tracking in `ASSETS-LICENSES.md`; CC0 / YouTube Audio Library only — never ripped copyrighted tracks |

**The one concrete code control:** clamp persisted volume values to `[0,1]` and reject non-finite before
writing any AudioParam (Pitfall-adjacent; cheap; prevents a silent-audio footgun from a stale/edited key).

## Project Constraints (from CLAUDE.md)

- **≤300 LOC functional per file** — each new `create*` module must stay under; split pure math into `ambienceMath.ts`/`combatState.ts`.
- **No legacy / dead code** — D-02 migration must DELETE every `.connect(context.destination)` in the five modules; no fallback path left behind (the `?? context.destination` defensive fallback is acceptable as a live guard, not dead code — but confirm it's genuinely reachable; if the bus is always ready post-unlock, drop it).
- **Client performance rules** — per-frame ambience update must be zero-alloc: no `new` in `update()`, no per-render identity work, `getGustEnvelope()` is 3 sins + a pow (fine), combat state is one subtraction. Scheduler self-reschedules off timers, not the frame loop, so silent layers cost nothing.
- **Never derive game state per React render** — combat state advances in `createGame.frame()`, never in App render; volume setters flow App → `gameRef.current.setMusicVolume()` (imperative), matching `setPixelFilter`.
- **Seed-then-playtest idiom** — all tuning constants (compressor curve, sub-bus gains, intervals, jitter, duck depth, cooldown) are seeds; expect playtest revision (heavy commented history precedent in `createAudioSystem.ts`).
- **Pure-helper + vitest twin discipline** — scheduler timing/jitter and combat hysteresis are pure-function candidates (mirror `windMath`/`dayNightMath`/`pickupLadder`).

## Sources

### Primary (HIGH confidence — codebase, verified this session)
- `src/game/audio/audioCore.ts` — `clampGain`, `createNoiseSource`, `jitter`, `panned` primitives
- `src/game/audio/createAudioSystem.ts` — gesture-unlock + shared `AudioContext`; attack plays on `context.destination` (migration site)
- `src/game/audio/createCombatAudio.ts` — `bus()` lazy-build + `duckHits()` templates (lines 66-104)
- `src/game/audio/createMovementAudio.ts`, `createWeaponAudio.ts`, `createPickupAudio.ts` — the `context.destination` migration targets; `createPickupAudio` pure-helper + `pickupLadder.test.ts` twin precedent
- `src/game/systems/createWind.ts` + `windMath.ts` — **`getGustEnvelope()` sidechain contract already exists** (createWind.ts:33-37,64-66; windMath.ts:138)
- `src/game/systems/createDayNightCycle.ts` + `dayNightMath.ts` — `phase01`, `clock.nowMicros()` time source (D-11)
- `src/game/createGame.ts` — audio construction (419-427), frame loop hook site (1356-1430), damage callbacks (1725-1760), `Game` interface (141-209), `camps`/`serverClock`
- `src/game/world/camps.ts` — `getCampSites()` for AMBI-05 proximity
- `src/App.tsx` — `settings.*` `localStorage` load/save pattern (77-90, 880-892)
- `src/ui/SettingsScreen.tsx` — props/Toggle idiom for the volume sliders
- `.planning/phases/10-ambient-audio-music/10-CONTEXT.md` — locked decisions D-01..D-16

### Secondary (MEDIUM confidence — standard WebAudio, from official docs knowledge)
- MDN Web Audio API: `AudioBufferSourceNode.loop`/`loopStart`/`loopEnd`, `BaseAudioContext.decodeAudioData`, `DynamicsCompressorNode`, `AudioParam.setTargetAtTime` [CITED: developer.mozilla.org]
- Equal-power crossfade (`cos`/`sin`) — standard WebAudio game-audio technique [CITED: common WebAudio practice]

### Tertiary (LOW confidence)
- None. (Web search providers disabled in config; no unverified web claims introduced.)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — native WebAudio + Vitest, both already in the codebase; zero new packages.
- Architecture: HIGH — every integration point verified in the live code; the flagged "critical" gust question is already solved.
- Combat-state signal: HIGH — three existing damage callbacks provide the cheapest possible trigger; verified by grep.
- Pitfalls: MEDIUM-HIGH — WebAudio pitfalls are well-established; the `.ogg`/Safari and trigger-scope items are genuine open questions.
- Tuning constants: LOW by design — seeds for playtest (per project idiom and Claude's-discretion in CONTEXT).

**Research date:** 2026-07-18
**Valid until:** 2026-08-17 (stable — native browser APIs + local codebase; only the CC0 asset sourcing is external and unversioned)
