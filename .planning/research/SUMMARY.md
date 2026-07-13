# Project Research Summary

**Project:** v0.3.0-alpha "Living World" — client-only world ambiance for the super-elements game
**Domain:** Three.js browser-game ambiance polish (audio bed, fog/sky, coherent wind, wildlife, day/night lite, lived-in wear, camera feel) on an existing pixel-filter 3D + SpacetimeDB multiplayer client
**Researched:** 2026-07-13
**Confidence:** HIGH

## Executive Summary

This milestone is pure client-side polish grafted onto a codebase that already carries hard-won performance rules (frozen world matrices, pooled materials/lights, 2-pass pixel renderer, no per-frame allocs, React table bypass). Research is unanimous on the headline conclusion: **zero new dependencies**. Every feature maps to APIs already installed — three@0.185.1 built-ins (Fog, HemisphereLight, InstancedMesh, `onBeforeCompile`, plus `SimplexNoise`/`ImprovedNoise` shipping inside `three/addons/math/`), the browser Web Audio API via the existing `audioCore` synthesis pattern, and existing project seams (`timeUniform`, `groundInfluence`, `lightPool`, `scorchMap`, camp sites). Several "new features" turn out to already exist and only need tuning: scorch regrowth and the grass-bend trail are decay-constant tunes in `groundInfluenceMath.ts`, and `scene.fog` is already in the scene.

The expert approach, distilled from Ghost of Tsushima's GDC wind talks and BotW/Genshin ambience patterns, hinges on two integration principles. First, **one shared wind phase** (extracted from the grass field's private `uTime`) that every swaying system AND the audio gust envelope consumes — plus a traveling gust-wave phase offset (`dot(worldPos, windDir)/wavelength`) that turns "synced sway" into visible wind. Second, **fog and day/night are one color pipeline, not two features**: fog color, sky background, hemisphere, and sun tint all blend from a single server-anchored day/night palette, mutated in place (never reassigned — fog type/presence is a compile-time shader define, and swapping it recompiles every material).

The key risks are all "the naive version silently violates an existing perf rule": ambient audio needs a bus + compressor BEFORE the first looped bed (clipping, no ducking otherwise), wildlife must be emissive instanced quads with manual bounding spheres (never pooled lights, never texture readbacks), permanent footpaths must be static bakes (the wear channel decays in ~1 minute by design), the day/night clock must live in the game loop (never React — the 144→20fps regression class), and camera motion must be transient-only with an accessibility toggle (XAG 117). One factual correction from architecture research: `world_timer` is a **private** table and cannot be subscribed — the day/night clock anchors from SDK event timestamps (or `Date.now()` fallback), with zero server publishes either way.

## Key Findings

### Recommended Stack

Nothing to install. three@0.185.1 is the latest npm release (verified against the registry 2026-07-13); all needed Web Audio nodes are Baseline in evergreen browsers. Noise for wildlife wander comes from `three/addons/math/SimplexNoise.js` — verified present on disk. The one architectural audio decision: hang a persistent `ambientBus` off the existing gesture-unlocked AudioContext singleton (never a second context) and use `StereoPannerNode` + distance gain, not `PannerNode`/HRTF (top-down camera has no 3D listener orientation).

**Core technologies:**
- three ^0.185.1 (installed): fog color mutation (free per frame via `refreshFogUniforms`), `Color.lerpColors` day/night palette, `InstancedMesh` + `DynamicDrawUsage` wildlife, addon noise — no upgrade decision exists
- Web Audio API (browser): looped brown-noise wind bed + `BiquadFilterNode` gusts + oscillator chirps, all zero-asset synthesis following the proven `pullSounds.ts` recipe
- Existing seams: `audioCore` helpers (`jitter`/`panned`/`clampGain`), grass `timeUniform`, `groundInfluence` CPU stamp sites, `lightPool` conventions, `detectQualityProfile()`, `?no*` bisect flags

**Explicitly rejected:** simplex-noise/noisejs packages (redundant), Tone.js/howler (asset-playback frameworks for a zero-asset game), three's Audio/PositionalAudio wrappers, GSAP/tween for two scalars, runtime Fog↔FogExp2 swaps, moving the sun (breaks the texel-snapped shadow basis).

### Expected Features

**Must have (table stakes — the milestone's own premise):**
- Wind/ambience audio bed with randomized one-shot pool (interval 5–15s, pitch ±10–20%, pan jitter) — fixed-interval chirps become a metronome, the canonical ambience failure
- Combat ducking: birds stop + bed −6..−12dB, ~1s in / ~3s out, never hard-cut
- Fog color = sky color from ONE shared day/night-blended source; linear fog with `near` beyond combat readability radius (fog is a horizon device on a top-down camera, not atmosphere)
- Shared wind phase across grass/flags/canopy/smoke — desynced sway reads worse than no sway
- Day/night lite: 4 keys (dawn/day/dusk/night), asymmetric timing (~60% day, short dusk/dawn), blue night floor ≥ ~55% intensity, server-anchored phase, lanterns fade in at dusk
- Footstep dust puffs; "reduce camera motion" toggle (accessibility baseline once ANY camera motion ships)

**Should have (differentiators):**
- Traveling gust wave — Tsushima's core insight at 1% of the cost; the single highest value-per-LOC item
- Audio bed sidechained to the gust envelope — wind you hear swell as grass bows
- Startle-flush birds off the player-sprint signal — a world that reacts beats passive decoration
- Dusk fireflies (emissive quads, ≤1 real light) + scorch regrowth tune + grass-bend trail + worn footpaths on real traffic routes + distant goliath grunts by camp proximity
- FOV kick on burst damage only (+2–5°, ~60ms in / ~300ms out)

**Defer (post-milestone):**
- Weather (rain/puddles) — explicitly out of scope; time-of-day gameplay hooks (needs server work); NPC ambient life

### Architecture Approach

Every feature is a sibling factory module (`createWind`, `createDayNightCycle`, `createAmbientAudio`, `createWildlife`, `createCameraFeel`, `createSmokeColumns`, `createServerClock`) wired into `createGame.ts`'s single `frame()` with 1–3 lines each — createGame is already 1,963 LOC and must not grow logic. Pure-helper twins (`windMath.ts`, `dayNightMath.ts`) carry the testable math per project discipline; the wind formula especially needs a single source of truth because it lives in both GLSL (grass vertex stage) and JS (flags/smoke/audio). React sees nothing — ambiance is 100% game-layer. All research seams are verified against live code with file:line citations (see ARCHITECTURE.md).

**Major components:**
1. `createWind.ts` + `windMath.ts` — ONE `{value}` uniform object + gust envelope + `sampleWind(x,z)` CPU mirror; grass refactored to consume it (no legacy accumulator left)
2. `createServerClock.ts` + `createDayNightCycle.ts` — SDK-event-timestamp anchor (`Date.now()` fallback) → phase → keyframed palette mutating fog/background/hemi/sun/lantern handles in place; `createMondstadtWorld` widens its return to expose `ambience` handles
3. `createAmbientAudio.ts` — sixth audio sibling: bus + compressor first, then looped bed, game-clock-scheduled one-shots, gust-sidechained gain, camp-proximity grunts
4. `createWildlife.ts` — instanced butterflies/fireflies/flush-birds; consumes CPU motion signal at the wear-stamp call site (`createGame.ts:899`), NEVER GPU readbacks
5. World assets (flags/lanterns/props/footpaths) — build-time, frozen-matrix compliant; lanterns = fixed-count lights added at startup, intensity-faded (light count never changes at runtime)
6. `createCameraFeel.ts` — absorbs existing shake state; lean/FOV kick transient-only; idle breathing lives on the CHARACTER model, not the camera

### Critical Pitfalls

1. **Ambient bed without a bus** → clipping in dense fights, no ducking knob. Prevention: `masterGain → DynamicsCompressorNode → destination` with `ambientBus`/`sfxBus` as the audio phase's FIRST task; reroute existing SFX in the same change.
2. **Fog/background reassignment or toggling** → full-scene shader recompile hitch (compile-time defines). Prevention: mutate `.color/.near/.far` in place; fog identity never changes; preallocated scratch Colors.
3. **Day/night phase through React or naive clock math** → the documented fps-regression class + per-player sunsets. Prevention: game-loop-owned clock module, bigint modulo once at anchor time, snap phase before first render on join.
4. **Wildlife naive instancing** → flocks vanish (origin bounding sphere), static-buffer respec per frame, light-count recompiles. Prevention: manual bounding sphere or `frustumCulled=false`, `DynamicDrawUsage`, scratch objects, emissive sprites not lights, `castShadow=false`.
5. **Permanent wear written into decaying channels** → footpaths evaporate in ~1 minute; ambient stampers starve combat scorch (`MAX_STAMPS_PER_FRAME=16`). Prevention: static bake for footpaths; channel-budget note opens the wear phase.
6. **Persistent WebAudio graph leaks + tab/iOS lifecycle** → stacked beds after restart, permanent silence after iOS interruption. Prevention: idempotent `start()`, full `dispose()`, one looping buffer, `visibilitychange` + `'interrupted'` state handling, game-clock (never `setTimeout`) scheduling.

## Implications for Roadmap

Based on research, suggested phase structure (dependency-verified build order from ARCHITECTURE.md):

### Phase 1: Wind Core
**Rationale:** The keystone — flags/canopy/smoke sway, gust-synced audio, butterfly drift, and the traveling gust wave ALL consume the wind module. Extract before any second consumer exists (Pitfall 10: N private clocks).
**Delivers:** `windMath.ts` (tested) + `createWind.ts`; grass refactored to the shared uniform; camp flags + campfire smoke columns + canopy sway decision; traveling gust wave; `?nowind` flag.
**Addresses:** Shared wind phase (table stakes), traveling gust wave (top differentiator).
**Avoids:** Pitfall 10 (clock fragmentation); frozen-matrix violations (windmill-blades pattern or shader sway).

### Phase 2: Atmosphere — Fog, Sky, Day/Night Lite
**Rationale:** Fog color and day/night are one color pipeline; shipping fog with a constant color would force an immediate refactor. Fireflies and lanterns depend on this phase's gates.
**Delivers:** `createServerClock.ts` + bridge timestamp tap, `dayNightMath.ts` + `createDayNightCycle.ts`, ambience handles from `createMondstadtWorld`, fog near/far tune, lantern assets with lights-at-build, debug time-scale knob, `?nodaynight` flag.
**Uses:** `Color.lerpColors` scratch pattern; SDK EventContext timestamps (verify FIRST — see Research Flags).
**Avoids:** Pitfalls 4 (recompile), 5 (unlit materials at night — grep-audit `MeshBasicMaterial`; night floor ≥ ~55%; sun direction frozen), 6 (React/bigint/skew).

### Phase 3: Ambient Audio Bed
**Rationale:** Depends on wind (gust sidechain); independent of day/night. Kills the silence — the #1 "dead world" tell.
**Delivers:** Bus + compressor refactor (FIRST task), looped wind bed, randomized chirp/rustle/grunt one-shot pool, combat ducking, camp-proximity goliath grunts, visibility/iOS lifecycle handling, `?noambientaudio` flag.
**Implements:** `createAmbientAudio.ts` as the sixth audio sibling on the shared unlocked context.
**Avoids:** Pitfalls 1 (clipping/no bus), 2 (leaks/stacking — verify with double-restart listen test), 3 (tab blur / `'interrupted'`).

### Phase 4: Props + Wear
**Rationale:** Static build-time work plus decay-constant tuning; no cross-dependencies, and two "features" (scorch regrowth, bend trail) already exist as tunable systems.
**Delivers:** `createFootpaths.ts` (STATIC bake, not influence stamps), `createPlazaProps.ts`, camp flags placement polish, regrowth/bend-trail constant tuning in `groundInfluenceMath.ts`, dust puffs off the CPU motion signal.
**Avoids:** Pitfall 8 (wear-channel misuse, stamp-queue starvation — open the phase with a channel-budget note).

### Phase 5: Wildlife
**Rationale:** Latest world system because it consumes Phase 1 (wind drift) and Phase 2 (firefly dusk gate) plus the motion signal.
**Delivers:** `createWildlife.ts` — instanced butterflies (~64–128), startle-flush birds off the sprint signal + wing one-shot, dusk fireflies (emissive, ≤1 pooled light), combat-radius suppression, counts keyed to `detectQualityProfile()`, `?nowildlife` flag.
**Avoids:** Pitfall 7 (culling/upload/lights — name `createGrassField.ts` and `createLightPool.ts` as pattern sources in the plan).

### Phase 6: Camera Feel (last)
**Rationale:** Genuinely independent; PROJECT.md says do last; it is the only feature that can make players physically ill.
**Delivers:** `createCameraFeel.ts` (absorbs existing shake), run lean, FOV kick on burst-damage tiers only, idle breathing on the character model (`createCharacterModel.animate`), "reduce camera motion" toggle as an acceptance criterion.
**Avoids:** Pitfall 9 (pixel crawl on the nearest-filtered target — transient effects only; tune in pixelated mode).

### Phase Ordering Rationale

- **Wind first** because five later systems consume its phase; extracting after a second consumer exists guarantees drift bugs.
- **Atmosphere second** because fog+day/night are one color pipeline and gate fireflies/lanterns; audio does NOT depend on it, but wildlife does.
- **Audio third** (needs wind's gust envelope) and **wear fourth** are order-swappable; both precede wildlife only by convention, wildlife strictly needs phases 1–2.
- **Camera last** per PROJECT.md and accessibility risk.
- **Final milestone verification** must run `scripts/fps_playtest.py` with ALL ambiance enabled during a golem-class fight — features are built per-phase but the frame cost is summed. Every phase adds its `?no*` bisect flag.

### Research Flags

Phases likely needing deeper research during planning:
- **None require a full `--research-phase` pass.** The four research files already verified codebase seams to file:line and API claims against installed sources.
- **Phase 2 (Atmosphere) has one MEDIUM-confidence claim to verify as its FIRST plan task:** whether the installed SpacetimeDB TS SDK's row-callback `EventContext` exposes the reducer event's server timestamp (`world_timer` is private — the milestone framing's stated clock source is wrong). The `Date.now()` fallback inside `createServerClock.ts` keeps the design safe either way; this is a 30-minute spike, not a research phase.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Wind):** extraction of an existing working system; formula already in the repo.
- **Phase 3 (Audio):** direct extension of the proven `pullSounds`/`audioCore` synthesis pattern; MDN-verified node APIs.
- **Phases 4–6:** tuning existing systems + well-documented three.js instancing/camera patterns, all with named in-repo pattern sources.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Every claim verified against the installed three@0.185.1 build on disk or the npm registry directly; zero-dependency conclusion is load-bearing and triple-checked |
| Features | MEDIUM | Cross-verified web sources (GDC talks, XAG 117, game-audio references); camera-feel numeric magnitudes (lean degrees, FOV kick ms) are informed estimates — tune by playtest |
| Architecture | HIGH | Every integration seam cites a verified file:line in the live codebase; one milestone-framing error caught and corrected (`world_timer` privacy) |
| Pitfalls | HIGH | Integration pitfalls grounded in direct code reads + this repo's own regression history; ecosystem claims (iOS `'interrupted'`, fog recompile) MEDIUM web-verified |

**Overall confidence:** HIGH

### Gaps to Address

- **SDK EventContext timestamp availability** (Phase 2, first task): verify against the installed SpacetimeDB TS SDK; fall back to `Date.now()` (LAN NTP skew ≪ 1s, invisible on a 20-min cycle) if absent.
- **Camera-feel magnitudes** (Phase 6): lean 2–4°, FOV kick +2–5° / ~60ms-in ~300ms-out are LOW-confidence estimates; the phase plan should budget a playtest-tune loop and gate everything behind the motion toggle.
- **lightPool budget split** (Phases 2/5): lanterns vs fireflies both want night lights near the plaza; decide up front — lanterns get dedicated fixed lights at build, fireflies are emissive with at most one borrowed pooled light.
- **Bend-trail decay conflict** (Phase 4): the ~2s trail wants a different clock than the shared 4–5s bend decay; options are "accept shared clock" or "second influence texture" — decide consciously in planning, not mid-implementation.
- **Real-time cycle soak** (Phase 2 close): banding/perf issues invisible at time-scaled speed; one full 20-min pixelated-mode cycle before phase close.

## Sources

### Primary (HIGH confidence)
- Installed `node_modules/three` @0.185.1 — fog uniform refresh, `FOG_EXP2` define, addon noise presence, InstancedMesh dynamic path
- npm registry (registry.npmjs.org/three) — version currency, fetched 2026-07-13
- Direct codebase reads (file:line cited throughout ARCHITECTURE.md and PITFALLS.md): `createGame.ts`, `createMondstadtWorld.ts`, `createGrassField.ts`, `createGroundInfluence.ts`, `createScorchMap.ts`, `groundInfluenceMath.ts`, `createLightPool.ts`, `createAudioSystem.ts`, `audioCore.ts`, `pullSounds.ts`, `createPixelRenderer.ts`, `useGameTableBridge.ts`, `camps.ts`, `spacetimedb/src/index.ts`

### Secondary (MEDIUM confidence)
- GDC Vault — Ghost of Tsushima wind + procedural grass talks (shared-simulation principle)
- MDN — Web Audio (DynamicsCompressorNode, StereoPannerNode, BaseAudioContext.state), WebKit bug 237878 / web-audio-api#2585 (iOS `'interrupted'`)
- Xbox Accessibility Guideline 117 — camera motion (authoritative for the toggle requirement)
- three.js docs/forums — fog-vs-ShaderMaterial, InstancedMesh frustum culling with world-space matrices
- Game-audio references (Game Audio Learning, Bugnet, A Sound Effect) — ambience layering + randomization patterns

### Tertiary (LOW confidence)
- Camera lean/FOV-kick numeric magnitudes — informed estimates from accessibility/game-feel articles; validate by playtest in Phase 6

---
*Research completed: 2026-07-13*
*Ready for roadmap: yes*
