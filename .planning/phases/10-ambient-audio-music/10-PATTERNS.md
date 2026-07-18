# Phase 10: Ambient Audio & Music - Pattern Map

**Mapped:** 2026-07-18
**Files analyzed:** 16 (6 new, 5 SFX edits, 1 grass-rustle edit, 3 wiring edits, 1 UI edit + tests)
**Analogs found:** 15 with a concrete analog / 16 (only the decode-once sample loader has no in-repo analog)

All work is client-only (zero server publish). Every new `create*` audio module MUST stay ≤300 LOC
functional (CLAUDE.md); pure math lives in `ambienceMath.ts` / `combatState.ts` with vitest twins.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/game/audio/createAudioBuses.ts` (NEW) | audio-graph / service | event-driven (lazy build + duck) | `createCombatAudio.ts` `bus()` + `duckHits()` (L66-104) | role-match (exact idiom) |
| `src/game/audio/createSampleCache.ts` (NEW) | loader / cache | file-I/O (fetch → decodeAudioData, cache by url) | none (native WebAudio); cite `ready()` gate idiom | **no analog** (new) |
| `src/game/audio/ambienceMath.ts` (NEW) | pure-helper | transform (bed-gain map, next-delay, proximity) | `windMath.ts` + `pickupLadder.test.ts` (`nextGemStep`) | role-match |
| `src/game/audio/createAmbience.ts` (NEW) | audio synth + scheduler | streaming (procedural bed) + event-driven (one-shots) | `createAudioSystem.ts` noise/biquad recipes + `audioCore` | role-match |
| `src/game/audio/createMusic.ts` (NEW) | audio playback | streaming (looping buffer sources + crossfade) | none exact; cite `bus()` rebuild + `setTargetAtTime` idiom | partial (new primitive) |
| `src/game/audio/combatState.ts` (NEW) | pure-helper | transform (hysteresis) | `dayNightMath.phase01` / `pickupLadder.nextGemStep` | exact |
| `src/game/audio/createCombatAudio.ts` (EDIT) | audio synth | request-response | self (reroute `hitBus`→sfx, D-03) | exact |
| `src/game/audio/createWeaponAudio.ts` (EDIT) | audio synth | request-response | self (accept `getSfxBus`) | exact |
| `src/game/audio/createMovementAudio.ts` (EDIT) | audio synth | request-response + streaming (rustle) | self + `createAudioSystem` noise burst | exact |
| `src/game/audio/createPickupAudio.ts` (EDIT) | audio synth | request-response | self (route `playNote` through sfx) | exact |
| `src/game/audio/createAudioSystem.ts` (EDIT) | audio context owner | request-response | self (attack plays → sfx bus) | exact |
| `src/game/createGame.ts` (EDIT) | orchestrator | event-driven (stamp) + per-frame update | self (L419-427 construct, L1363-1367 frame, L1725-1760 stamp) | exact |
| `src/App.tsx` (EDIT) | React settings host | CRUD (localStorage) | self (L77-92 state, L880-892 persist) | exact |
| `src/ui/SettingsScreen.tsx` (EDIT) | React component | request-response (props) | self (`showFps`/`onToggleFps` prop pair, `Toggle`) | exact |
| `src/index.css` (EDIT) | config / styles | — | `.settings__select` / `.toggle` tokens (per 10-UI-SPEC) | role-match |
| `src/game/audio/__tests__/ambienceMath.test.ts` + `combatState.test.ts` (NEW) | test | — | `windMath.test.ts` (L1-70), `pickupLadder.test.ts` | exact |

---

## Pattern Assignments

### `src/game/audio/createAudioBuses.ts` (NEW — routing owner, D-01)

**Analog:** `src/game/audio/createCombatAudio.ts` — the `bus()` lazy-rebuild + `duckHits()` ramp.

**Lazy build-once-per-context idiom** (`createCombatAudio.ts:66-73`) — mirror this exactly, but build
the full `master → DynamicsCompressor → destination` chain plus 3 sub-bus gains instead of one gain:
```typescript
function bus(context: AudioContext): GainNode {
  if (!hitBus || busContext !== context) {   // (re)build once per context
    hitBus = context.createGain();
    hitBus.connect(context.destination);
    busContext = context;
  }
  return hitBus;
}
```
RESEARCH Pattern 1 gives the target shape: `ensure()` checks `ctx !== c`, then
`master.connect(comp).connect(c.destination)` and `ambient/music/sfx.connect(master)`. Return
accessor fns `sfx()`, `music()`, `ambient()`, `setMusicGain(v)`, `setSfxGain(v)`, `duck(inCombat)`.

**Duck ramp** — the existing `duckHits()` (`createCombatAudio.ts:97-104`) is the ms-scale template;
Phase 10's `duck()` is the same shape on the ambient/music buses over SECONDS, using
`setTargetAtTime` (not `linearRamp`, per Pitfall 4):
```typescript
function duckHits(context: AudioContext, depth: number, seconds: number) {
  const gain = bus(context).gain;
  const now = context.currentTime;
  gain.cancelScheduledValues(now);
  gain.setValueAtTime(Math.min(gain.value, 1), now);
  gain.linearRampToValueAtTime(depth, now + 0.015);
  gain.exponentialRampToValueAtTime(1, now + seconds);
}
```
RESEARCH Pattern 5 target: `bus.gain.setTargetAtTime(targetLinear, now, seconds / 3)` — down τ≈0.33s,
restore τ≈0.8s; -6dB≈0.5, -12dB≈0.25.

**Volume clamp (security V5):** reuse `audioCore.clampGain` semantics — reject non-finite / ≤0 before
any `gain.value` write (persisted localStorage volume could be garbage).

---

### `src/game/audio/createSampleCache.ts` (NEW — decode-once loader, D-15) — NO IN-REPO ANALOG

Native WebAudio `fetch → decodeAudioData → cache AudioBuffer by url`. No existing module decodes
files (the whole SFX system is synth-only). Planner should use RESEARCH Pitfall 1 + Standard Stack.

**Cite the context-readiness idiom** every audio module shares (e.g. `createCombatAudio.ts:61-64`) —
the cache must defer `decodeAudioData` until a live running context exists and rebuild per context
(like `bus()`), because the gesture unlock is async:
```typescript
function ready(): AudioContext | null {
  const context = getContext();
  return context && context.state === 'running' ? context : null;
}
```
Fetch the `ArrayBuffer` eagerly (network is context-free); cache decoded `AudioBuffer` keyed by url
AND context. Reused by BOTH `createAmbience` (one-shots) and `createMusic` (loops).

---

### `src/game/audio/ambienceMath.ts` (NEW — PURE, D-10/AMBI-02/05/07)

**Analog:** `src/game/systems/windMath.ts` (zero-import pure module) + `pickupLadder.ts` `nextGemStep`.

**Zero-import pure discipline** — `windMath.ts:1-9` header states the contract; follow it (no `three`,
no WebAudio). Export named constants + pure fns:
- `nextOneShotDelay(minS, maxS, rand)` → `minS + (maxS-minS)*rand` (RESEARCH Pattern 3; never
  metronomic — the anti-pattern the `GUST` cadence test guards against, `windMath.ts:36-48`).
- bed-gain map: `BED_BASE_GAIN + BED_SWELL_GAIN * gust` (RESEARCH Pattern 2).
- proximity map for goliath grunt gain from nearest-camp distance (AMBI-05).

**Pure-helper precedent to mirror** (`pickupLadder.ts` in `createPickupAudio.ts:27-63`): `nextGemStep`,
`gemChimeCount`, `gemBurstSeconds` are exported pure fns with vitest twins — same pattern here.

**Day/night gate** consumes `phase01` from `dayNightMath.ts:169-172` (birds `active()`=day,
crickets/owl=night) — do NOT add a second time source (D-11).

---

### `src/game/audio/createAmbience.ts` (NEW — wind bed + scheduler, D-05/D-10)

**Analog:** `src/game/audio/createAudioSystem.ts` (noise→biquad→gain recipes) + `audioCore.ts` primitives.

**Procedural noise bed** — reuse `createNoiseSource` + a biquad, the exact idiom in `playSlam`
(`createAudioSystem.ts:101-112`):
```typescript
const noise = createNoiseSource(context, noiseSeconds);
const filter = context.createBiquadFilter();
filter.type = 'lowpass';
filter.frequency.value = 400;
const noiseGain = context.createGain();
noiseGain.gain.setValueAtTime(0.5 * level, now);
noise.connect(filter).connect(noiseGain).connect(out);
```
For the CONTINUOUS bed the source loops (`loop=true`) instead of a one-shot; the bed's INNER gain
takes the gust swell via `setTargetAtTime` (Pattern 2). **Keep the swell node separate from the
`ambient` bus duck node** (Pitfall 5 — two writers on one param stomp each other).

**`audioCore` primitives to reuse** (`audioCore.ts`): `createNoiseSource` (L15), `jitter` (L31, ±spread
for per-shot pitch), `panned` (L39, per-shot stereo), `clampGain` (L9).

**One-shot scheduler (`scheduleRandomOneShots`)** — self-reschedules off a timer (NOT the frame loop)
so a gated-off layer costs nothing. Fire path composes: `createSampleCache` buffer →
`AudioBufferSourceNode` with `playbackRate.value = jitter(0.15)` → `panned()` → per-shot gain →
ambient bus. `active()` predicates gate on `phase01` (day/night) and camp proximity.

**`getGustEnvelope()` contract** (`createWind.ts:33-37,64-66`) is ALREADY surfaced — the bed reads it
each frame in `update()`:
```typescript
getGustEnvelope() { return gustEnvelope(timeUniform.value); }
```
`gustEnvelope` (`windMath.ts:138-141`) is 3 sines + a pow, zero-alloc. It rests near 0 between gusts,
so `BED_BASE_GAIN` must be audible on its own. Hold the wind object; read `.value` each frame (never
cache — `createWind.ts:11-16` warns the uniform is mutated in place).

---

### `src/game/audio/createMusic.ts` (NEW — two loops + equal-power crossfade, D-12)

**Analog (partial):** `bus()` rebuild idiom (`createCombatAudio.ts:66-73`) for lazy start on first
unlock; RESEARCH Pattern 4 for the loop + crossfade (no in-repo loop precedent — synth-only today).

Two persistent `AudioBufferSourceNode`s (`loop=true`, `loopStart`/`loopEnd`), each → its own GainNode →
`music` bus. Combat state drives an equal-power crossfade (`cos`/`sin`), moved via `setTargetAtTime`
(down ~1s / up ~2-3s), never per-frame `.value=` (Pitfall 4). Buffers come from `createSampleCache`.
Music has NO synth fallback — MUST source CC0 region + combat loops (blocking for MUSIC-01/02).

---

### `src/game/audio/combatState.ts` (NEW — PURE hysteresis, D-08/D-09)

**Analog:** `dayNightMath.phase01` (`dayNightMath.ts:169-172`) — a tiny exported pure fn with a vitest
twin; and `pickupLadder.nextGemStep` (`createPickupAudio.ts:28-31`).

RESEARCH gives the exact target:
```typescript
export const COMBAT_EXIT_COOLDOWN_SECONDS = 5;   // playtest-tunable
export function isInCombat(nowS: number, lastCombatAtS: number): boolean {
  return nowS - lastCombatAtS < COMBAT_EXIT_COOLDOWN_SECONDS;
}
```
Enter-immediately / exit-after-cooldown. One subtraction per frame, zero alloc, no table scan.

---

### The 5 SFX modules (EDIT — bus migration, D-02) — shared change

**Analog:** each module is its own analog; the change is mechanical and identical across all five.

**Constructor signature** goes `createXAudio(getContext)` → `createXAudio(getContext, getSfxBus)`.
Every `panned(context, pan, context.destination)` and `.connect(context.destination)` becomes routed
through `getSfxBus() ?? context.destination`. DELETE every `context.destination` reference (no legacy
path — CLAUDE.md). Concrete sites:

- **`createAudioSystem.ts`** — the 5 attack plays each open with
  `const out = panned(context, pan, context.destination);` (L85, L121, L151, L220, L282). Note this
  module OWNS the context/unlock (L61-77) — it also gains the `sfx` bus as the migration root. Keep
  `getContext()` in its returned interface (siblings use it).
- **`createCombatAudio.ts`** (D-03) — `bus()` (L69) connects `hitBus` to `context.destination`; reroute
  to the shared `sfx` bus. Also the direct-to-destination plays: `playEnemyCrit` (L152), `playPlayerHurt`
  (L217/229/244), `playStun` (L269/280/290/322), `playHeal` (L360). `hitBus` stays the private duck-bus,
  now feeding `sfx`.
- **`createWeaponAudio.ts`** — `playSweep` (L141), `playBowShot`/`playArcaneBolt`/`playProjectileImpact`/
  `playSlimeLeap`/`playSlimeSquash`/`playWindupRiser` each build `out = panned(..., context.destination)`
  (L160, L207, L243, L298, L347, L386).
- **`createMovementAudio.ts`** — `playStep` (L182) `panned(context, pan, context.destination)`.
- **`createPickupAudio.ts`** — `playNote` (L151), `playShardGain` sparkle (L250), `playDeath` (L286/301)
  connect to `context.destination`.

---

### `src/game/audio/createMovementAudio.ts` (EDIT — also add grass rustle, AMBI-04)

**Analog:** self + the lowpassed-noise-burst idiom already in this file (`playPlayerStep`, L80-102) and
`createAudioSystem.playSlam` noise burst (L101-112). Grass rustle is a movement-tied filtered-noise
burst gated on sprinting-through-grass — same `createNoiseSource` + lowpass + short gain envelope,
routed through the injected `sfx` bus. Reuse the existing `underSpamBudget` guard (L68-77).

---

### `src/game/createGame.ts` (EDIT — construction, stamp, per-frame wiring)

**Construction site** (L418-427) — add `buses`, `ambience`, `music` next to the existing audio wiring:
```typescript
const audioSystem = createAudioSystem();
const combatAudio = createCombatAudio(audioSystem.getContext);
const weaponAudio = createWeaponAudio(audioSystem.getContext);
const movementAudio = createMovementAudio(audioSystem.getContext);
const pickupAudio = createPickupAudio(audioSystem.getContext);
```
New: `const buses = createAudioBuses(audioSystem.getContext);` then pass `buses.sfx` into all five
constructors (D-02). `const sampleCache = createSampleCache(audioSystem.getContext);` then
`createAmbience(...)` / `createMusic(...)` on the ambient/music buses.

**Combat-state stamp** — set `lastCombatAt = elapsedSeconds` in the 3 damage callbacks (RESEARCH-named):
- `spawnSelfNumber` (L1725) — on a hurt kind (`kind !== 'heal'`, i.e. `taken*`/`pvp*`).
- `spawnWorldNumber` (L1734) — on the `isMine === true` branch (my hit landed).
- `spawnPlayerNumber` (L1750) — on the `isMine === true` branch (my PVP hit).
Declare `let lastCombatAt = -Infinity;` in `createGame` scope (like `elapsedSeconds`).

**Per-frame update** — in `frame()` right after `daynight.update()` (L1367), fan the ONE signal out:
```typescript
wind.update(deltaSeconds);   // L1363 — the only wind clock advance
daynight.update();           // L1367
// NEW:
const inCombat = isInCombat(elapsedSeconds, lastCombatAt);
buses.duck(inCombat);
ambience.update(deltaSeconds, wind.getGustEnvelope(), phase01(serverClock.nowMicros()), inCombat);
music.setCombat(inCombat);
```
`serverClock` is in scope (L346); `phase01` imported from `dayNightMath`. `elapsedSeconds` advances at
L1360. `deltaSeconds` clamped at L1358.

**Imperative setters** — add `setMusicVolume`/`setSfxVolume`/`setMusicMuted`/`setSfxMuted` to the `Game`
interface (L141-209) and returned object, mirroring `setPixelFilter` (L1565-1567):
```typescript
setPixelFilter(enabled) {
  pixelRenderer.setPixelated(enabled);
},
```
→ `setMusicVolume(v) { buses.setMusicGain(clampGain(v)); }` etc.

**Camp proximity for AMBI-05** — `getCampSites()` (`world/camps.ts:29`) returns static `{x,z,archetypeId}[]`;
compute min distance from `playerPosition` (cheap fixed array) for grunt gain, no live table scan.

---

### `src/App.tsx` + `src/ui/SettingsScreen.tsx` (EDIT — MUSIC-03 UI, D-13)

**Analog:** the existing `showFps` / `pixelFilter` settings round-trip.

**State init** (`App.tsx:77-88`) — mirror for the 4 new keys (defaults music 0.7, sfx 1.0):
```typescript
const [showFps, setShowFps] = useState(() => localStorage.getItem('settings.showFps') === '1');
const [pixelFilter, setPixelFilter] = useState(
  () => localStorage.getItem('settings.pixelFilter') !== '0'
);
```
→ `useState(() => Number(localStorage.getItem('settings.musicVolume') ?? '0.7'))`, and boolean mute
flags following the `'1'`/`'0'` idiom.

**Persist + imperative apply** (`App.tsx:889-892`) — the exact template:
```typescript
useEffect(() => {
  localStorage.setItem('settings.pixelFilter', pixelFilter ? '1' : '0');
  gameRef.current?.setPixelFilter(pixelFilter);
}, [pixelFilter]);
```
→ persist `settings.musicVolume` + `gameRef.current?.setMusicVolume(musicVolume)`. Never derive audio
state in render (CLAUDE.md) — App state → imperative `Game` setter only.

**SettingsScreen props** (`SettingsScreen.tsx:14-30`) — extend `SettingsScreenProps` with
`musicVolume`/`sfxVolume`/`musicMuted`/`sfxMuted` + `onMusicVolumeChange`/`onSfxVolumeChange`/
`onToggleMusicMuted`/`onToggleSfxMuted`, mirroring the `showFps` / `onToggleFps(next)` pairs. Reuse
`Toggle` (L94-96) verbatim for mutes:
```tsx
<Toggle label="Rādīt FPS" checked={showFps} onChange={onToggleFps} />
```
Insert a `SKAŅA` section (`<p className="settings__section">`, L93 idiom) AFTER `ATTĒLOŠANA`, BEFORE
`KONTS`. Volume sliders are native `<input type="range">` in a `.settings__field` row. See
`10-UI-SPEC.md` for the full token contract (`--accent`=`#7ec843` in this portal, `.settings__value`
new class, slider CSS in `src/index.css` / `src/styles/hud/switcher.css`, Latvian copy).

---

### Tests (NEW — Wave 0, vitest twins)

**Analog:** `src/game/systems/__tests__/windMath.test.ts` (L1-70) and `pickupLadder.test.ts`.

`windMath.test.ts` shows the discipline: import the pure module, `describe`/`it`, pin BEHAVIOR (bounds,
cadence, non-uniformity) not magic numbers except where a value is a contract (L21-35). Cadence test
(L55-69) — reuse the "gusts are events, near-still ≥60%" structure for `nextOneShotDelay` never-metronomic.
- `__tests__/ambienceMath.test.ts` → AMBI-02 (bed-gain map), AMBI-03 (delay jitter in range,
  non-metronomic), AMBI-05 (proximity map), AMBI-07 (day/night `active()` over `phase01`).
- `__tests__/combatState.test.ts` → `isInCombat` enter-immediately / exit-after-cooldown (AMBI-06,
  MUSIC-02). Run: `npx vitest run src/game/audio`.

Audio PLAYBACK stays manual (gesture-gated WebAudio) — the codebase's stated discipline.

---

## Shared Patterns

### Context-readiness gate (never throw mid-frame)
**Source:** `createCombatAudio.ts:61-64` (identical in weapon/movement/pickup).
**Apply to:** every new audio module's play/update path.
```typescript
function ready(): AudioContext | null {
  const context = getContext();
  return context && context.state === 'running' ? context : null;
}
```

### Lazy build-once-per-context (async gesture unlock)
**Source:** `createCombatAudio.ts:66-73` (`bus()`).
**Apply to:** `createAudioBuses` (graph), `createSampleCache` (decoded buffers), `createMusic` (loop sources).
Rebuild when `busContext !== context`; never build eagerly at construction (Pitfall 1 / Anti-Pattern).

### Zero-import pure helper + vitest twin
**Source:** `windMath.ts` (whole file), `dayNightMath.ts:169-172`, `pickupLadder` in `createPickupAudio.ts:27-63`.
**Apply to:** `ambienceMath.ts`, `combatState.ts`. No `three`, no WebAudio; exported constants + fns; a
sibling `__tests__/*.test.ts` twin.

### `audioCore` primitives (DRY synthesis)
**Source:** `audioCore.ts` — `clampGain` (L9), `createNoiseSource` (L15), `jitter` (L31), `panned` (L39).
**Apply to:** `createAmbience` (bed noise, per-shot pitch/pan jitter) and the grass rustle.

### `setTargetAtTime` for every automated gain (no zipper)
**Source:** RESEARCH Patterns 2/5 (the existing code uses `linearRamp`/`exponentialRamp` at ms scale;
Phase 10's second-scale swells/crossfades/ducks must use `setTargetAtTime`, Pitfall 4).
**Apply to:** bed swell, duck, music crossfade.

### Volume clamp (security V5)
**Source:** `audioCore.clampGain` (L9-12) — reject non-finite / ≤0.
**Apply to:** every persisted-volume → AudioParam write (`setMusicGain`/`setSfxGain`), so a corrupt
`localStorage` value cannot push `NaN` into a gain node.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/game/audio/createSampleCache.ts` | loader/cache | file-I/O | No module in the repo decodes audio files — the entire SFX system is synth-only (zero-asset). Use native `fetch`/`decodeAudioData` + the `bus()` rebuild-per-context idiom (RESEARCH Pitfall 1). |
| `createMusic.ts` loop+crossfade primitive | audio playback | streaming | No `AudioBufferSourceNode.loop` usage exists (all sources are one-shots). Native `loop=true` + equal-power crossfade per RESEARCH Pattern 4; only the lazy-start `bus()` idiom is borrowed. |

---

## Metadata

**Analog search scope:** `src/game/audio/`, `src/game/systems/` (+ `__tests__`), `src/game/world/camps.ts`,
`src/game/createGame.ts`, `src/App.tsx`, `src/ui/SettingsScreen.tsx`.
**Files scanned:** 16 read in full or targeted.
**Pattern extraction date:** 2026-07-18
