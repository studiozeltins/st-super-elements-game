# Phase 10: Ambient Audio & Music - Context

**Gathered:** 2026-07-18
**Status:** Ready for planning
**Mode:** `--all --auto` (all gray areas auto-selected; recommended option chosen per question, single pass)

<domain>
## Phase Boundary

Make the world SOUND alive: a bus/compressor refactor of the existing SFX, a layered
combat-aware **ambience bed** (procedural gust-reactive wind + randomized creature one-shots
that vary by time of day), **region + combat music** that crossfades on the combat signal,
combat **ducking**, and independent **music/SFX volume** persisted locally.

Delivers requirements **AMBI-01..07** and **MUSIC-01..03**. Client-only (zero server publish).

**Not in this phase:** the wing one-shot on bird flush (Phase 12 fires it on the SFX bus this
phase builds), weather audio (milestone-deferred), new combat mechanics.
</domain>

<decisions>
## Implementation Decisions

### Audio bus graph (AMBI-01) — the DRY refactor the user flagged
- **D-01:** Introduce ONE `createAudioBuses(context)` module producing the graph
  `master → DynamicsCompressor → destination`, with `ambient`, `music`, `sfx` sub-bus GainNodes
  feeding master. Single source of truth for routing.
- **D-02:** Migrate all 5 existing SFX modules (`createCombatAudio`, `createWeaponAudio`,
  `createMovementAudio`, `createPickupAudio`, and `createAudioSystem`'s attack plays) OFF
  `context.destination` onto the injected `sfx` bus. Change their constructor signatures from
  `(getContext)` to also receive the target bus node (or a `buses` handle) — do NOT leave any
  `.connect(context.destination)` behind. **DRY/SRP directive from the user is binding:** the
  bus module owns routing; the play-functions own only their synthesis.
- **D-03:** `createCombatAudio`'s existing internal `hitBus` stays as its private duck-bus but
  connects into the shared `sfx` bus instead of `context.destination`.

### Sample-vs-synth split (AMBI-02/03/04/05) — honors the user's "use bird sounds / free ambient"
- **D-04:** **User directive locks recording-first for creatures.** Birds (day) and crickets/owl
  (night) use real CC0 / royalty-free **recordings**, NOT synthesis. This intentionally overrides
  AMBI-03's "synth-first, CC0-swap-as-fallback" wording — the user explicitly wants actual bird
  sounds. Synth is now the fallback, recordings the default.
- **D-05:** The **wind bed stays procedural** (filtered noise, slowly modulated) — AMBI-02 is
  locked as procedural because its gain must swell with the wind module's live gust envelope; a
  static loop cannot sidechain. This is not overridden.
- **D-06:** Grass rustle (AMBI-04) stays **procedural** (movement-tied filtered-noise burst,
  cheap, already in the movement-audio idiom). Goliath grunt (AMBI-05) may reuse a
  pitch-jittered synth OR a CC0 grunt — planner's discretion, recording preferred if a clean
  CC0 one exists.
- **D-07:** All sourced audio MUST be **CC0 or YouTube Audio Library royalty-free** (or
  freesound CC0). "Free from YouTube" means the **YouTube Audio Library / properly-licensed**,
  never arbitrary ripped copyrighted tracks. Every asset's source + license tracked (see D-16).

### Combat-state signal (AMBI-06 + MUSIC-02) — a real gap: none exists today
- **D-08:** No `inCombat`/`combatState` exists in the codebase. Build ONE client-side
  combat-state derivation, consumed by BOTH the ambience duck (AMBI-06) and the music crossfade
  (MUSIC-02) — same signal, DRY.
- **D-09:** Hysteresis: **enter combat immediately** on a combat trigger, **exit after a
  cooldown** (~few seconds of no combat) so brief lulls don't thrash the duck/crossfade.
  Exact trigger (player dealt/took damage events vs. nearest-enemy-within-aggro-radius, or both)
  is a research item — pick whichever is already cheaply available client-side.

### Randomized one-shot scheduler (AMBI-03/05/07) — SRP
- **D-10:** ONE reusable `scheduleRandomOneShots` helper: parameters = sample set, interval
  range (e.g. 5–15s birds, long intervals grunts), per-shot pitch ±10–20% / pan / volume jitter,
  and an `active()` predicate. Never a fixed-interval metronome. Scheduler is separate from
  sample playback (SRP: timing vs. sound).
- **D-11:** Time-of-day gating (AMBI-07) via the existing `phase01(clock.nowMicros())` from
  `createDayNightCycle` — birds' `active()` = daytime, crickets/owl's `active()` = night. Reuse
  the day/night clock; do not add a second time source.

### Music + persistence + UI (MUSIC-01/02/03)
- **D-12:** Region exploration loop + combat loop, both CC0 seamless loops on the `music` bus.
  **Horizontal crossfade** (equal-power) driven by the D-08 combat-state — no hard cuts. Fade
  timings align with the duck: down ~1s, back up ~2–3s.
- **D-13:** Music/SFX independent volume + mute. Persist as `settings.musicVolume`,
  `settings.sfxVolume` (and mute flags) following the existing `localStorage 'settings.*'`
  pattern in `App.tsx`. Sliders live in the existing settings panel (ROADMAP UI hint = yes).

### Asset pipeline & licensing (DRY loader)
- **D-14:** Sample files as `.ogg` under `public/audio/{ambient,music,creatures}/`.
- **D-15:** ONE loader/cache module: `fetch` → `decodeAudioData` once per file, cache the
  decoded `AudioBuffer`, reused by scheduler + music. No per-play decode.
- **D-16:** `public/audio/ASSETS-LICENSES.md` (or `.planning/`-adjacent) tracks every asset's
  filename, source URL, and license — required for the CC0/YT-Audio-Library provenance in D-07.

### Claude's Discretion
- Exact compressor curve, sub-bus default gains, and per-creature interval/jitter constants
  (playtest-tuned, following the existing seed-then-playtest idiom in `createAudioSystem`).
- Whether goliath grunt is synth or recording (D-06).
- Precise combat-state trigger source (D-09) — pick the cheapest already-available client signal.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements & scope
- `.planning/ROADMAP.md` §"Phase 10: Ambient Audio & Music" — goal + 5 success criteria
- `.planning/REQUIREMENTS.md` — AMBI-01..07, MUSIC-01..03 (lines ~66–98)

### Existing audio system (refactor target — read ALL before touching)
- `src/game/audio/audioCore.ts` — shared primitives: `clampGain`, `createNoiseSource`,
  `jitter`, `panned`. Reuse for the procedural wind bed + grass rustle.
- `src/game/audio/createAudioSystem.ts` — the gesture-unlock + shared `AudioContext`; attack
  plays currently `panned(ctx, pan, context.destination)` — the migration site for D-02.
- `src/game/audio/createCombatAudio.ts` — has an internal duckable `hitBus` pattern (reference
  for the ambience duck); reroute to `sfx` bus (D-03).
- `src/game/audio/createMovementAudio.ts` — footstep/sprint audio; grass-rustle home (AMBI-04).
- `src/game/audio/createWeaponAudio.ts`, `src/game/audio/createPickupAudio.ts` — also on
  `context.destination`, must migrate.
- `src/game/createGame.ts` §~419–427 — where the audio modules are constructed/wired; where the
  bus module + ambience/music systems get instantiated and the frame update is called.

### Wind gust envelope (AMBI-02 sidechain source)
- `src/game/systems/createWind.ts` (`WindUniforms`) + `src/game/systems/windMath.ts`
  (`gustGlsl`, gust envelope) — gust currently lives GPU-side; research whether a CPU-readable
  gust/strength scalar exists or must be surfaced for the bed gain.

### Day/night phase (AMBI-07 time-of-day gate)
- `src/game/systems/createDayNightCycle.ts` + `src/game/systems/dayNightMath.ts` (`phase01`) —
  the CPU time-of-day source birds/crickets/owl gate on.

### Settings persistence + UI (MUSIC-03)
- `src/App.tsx` §~77–90, ~800, ~881–890 — the `localStorage 'settings.*'` load/save pattern and
  the settings panel to extend with music/SFX sliders.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `audioCore.ts` primitives (`createNoiseSource`, `jitter`, `panned`, `clampGain`) — directly
  power the procedural wind bed, grass rustle, and one-shot pan/pitch jitter.
- `createCombatAudio`'s `hitBus` + `duckHits()` — an existing duck-bus template to mirror for
  the ambience −6..−12dB duck (AMBI-06).
- `phase01()` — ready CPU day/night phase for AMBI-07 gating (no new time source).
- `App.tsx` `settings.*` localStorage pattern + settings panel — reuse verbatim for MUSIC-03.

### Established Patterns
- Every audio module is `createXAudio(getContext)` returning a small interface, plays gated on
  `context.state === 'running'`, never throws mid-frame. New ambience/music modules follow this.
- Seed constants then playtest-tune (heavy commented history in `createAudioSystem.ts`).
- Pure-math + vitest twin discipline (windMath, dayNightMath) — the scheduler timing/jitter and
  the combat-state hysteresis are pure-helper candidates for test-first extraction.

### Integration Points
- **Bus insertion:** all 5 modules' `.connect(context.destination)` → injected `sfx` bus.
- **Gust → bed gain:** needs a CPU gust value out of `createWind` (verify/surface).
- **Combat-state:** brand-new derived signal wired in the `createGame.ts` frame loop; feeds duck
  + music crossfade.
- **Frame update:** the ambience/music systems need a per-frame `update(dt, gust, phase01,
  combatState)` call added alongside the existing audio wiring in `createGame.ts`.
</code_context>

<specifics>
## Specific Ideas

- User: **"use ambient sounds from YT free"** — source ambience/music from free, properly-licensed
  audio (YouTube Audio Library / CC0), not synthesized-only. Captured as D-04/D-07/D-14/D-16.
- User: **"when next se[ction] add birds, use bird sounds etc"** — birds (and other creatures)
  use actual recorded sounds, not synth. Captured as D-04.
- User: **"dry srp"** — the bus refactor, the shared loader, and the one-shot scheduler must be
  DRY + single-responsibility. Binding across D-01/D-02/D-10/D-15.
</specifics>

<deferred>
## Deferred Ideas

- Wing one-shot on bird flush → **Phase 12 (Wildlife)** fires it on the SFX bus this phase builds.
- Weather audio → milestone-deferred (per ROADMAP milestone goal).

### Reviewed Todos (not folded)
Todo cross-reference matched 6 items on generic `game`/`combat` keywords, but NONE relate to
audio — folding any would be scope creep (scope guardrail overrides the `--auto` 0.4 auto-fold):
- "BŪSTS orbit v2 — random paths + varied star shapes" — combat/visual, not audio.
- "Decide whether BŪSTS scales more than damage/heal" — combat balance, not audio.
- "Phase 6 raid boss (DEFERRED)" — reserved later milestone.
- "Phase 7 role-enforcement/balance (DEFERRED)" — reserved later milestone.
- "Phase 7 crit poise interrupt (DEFERRED)" — reserved later milestone.
- "flower-blade color art pass" — visual art pass, not audio.

</deferred>

---

*Phase: 10-ambient-audio-music*
*Context gathered: 2026-07-18*
