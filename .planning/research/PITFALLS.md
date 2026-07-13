# Pitfalls Research

**Domain:** Client-only ambiance layer (procedural audio, fog/day-night, wildlife, wear, camera feel) added to an existing performance-sensitive Three.js pixel-filter browser game
**Researched:** 2026-07-13
**Confidence:** HIGH for integration pitfalls (grounded in direct reads of `createPixelRenderer.ts`, `createGrassField.ts`, `createScorchMap.ts`, `createLightPool.ts`, `createAudioSystem.ts`, `groundInfluenceMath.ts`); MEDIUM for ecosystem claims (web-verified via MDN / WebKit bugs / three.js forum & issues / Xbox Accessibility Guidelines)

This milestone is unusual: every feature is bolted onto systems that already carry hard-won perf rules (frozen matrices, pooled materials, 2-pass pixel renderer, half-rate shadow map, no per-frame allocs, React table bypass). Most pitfalls below are not "the feature is hard" — they are "the naive version of the feature silently violates one of those rules."

## Critical Pitfalls

### Pitfall 1: Ambient bed summed straight into `destination` — no bus, no ducking, clipping

**What goes wrong:**
Every existing SFX connects directly to `context.destination` (via `panned()`), fire-and-forget, with combat peaks already at 0.8–0.9 gain (`playSlam` thump 0.8, dash clang 0.9). A continuous wind/ambience layer added the same way (a) has no single knob to duck under combat, (b) pushes the summed signal past 1.0 whenever a slam lands over wind + chirps + rustle → audible hard clipping/distortion, worst on the loud fights the game is proudest of.

**Why it happens:**
The current architecture never needed a mixer — one-shots are short and rarely overlap at peak. A persistent bed changes the summing math permanently, and the clipping only shows up in dense combat, not in the quiet dev test.

**How to avoid:**
First task of the audio phase, before any wind synth: introduce a tiny bus layer in `audioCore` — `masterGain (~0.8 headroom) → DynamicsCompressorNode → destination`, with an `ambientBus` GainNode and an `sfxBus` GainNode feeding it. Route existing SFX through `sfxBus` in the same change (repo rule: no legacy path left behind). Ducking = `ambientBus.gain.setTargetAtTime(low, now, 0.05)` on combat SFX, released with a slower time constant. MDN explicitly recommends compressor-on-master for games mixing many simultaneous sources. Keep the ambient bed's resting gain LOW (~0.1–0.2) — it plays 100% of the time; fatigue is the failure mode.

**Warning signs:**
Crackle/distortion during goliath fights with sound on; ambience audible *over* strike SFX; needing per-callsite gain fudging to make combat readable.

**Phase to address:** Ambient audio phase (as its opening plan step — it's a prerequisite, not a polish item).

---

### Pitfall 2: Long-lived WebAudio graph leaks and cumulative gain stacking

**What goes wrong:**
The existing modules are one-shot: nodes `stop()` and get garbage-collected. An ambient bed is the first *persistent* graph, and three classic leaks appear:
1. **Double-started beds.** The gesture-unlock path (`pointerdown`/`keydown` → `unlock()`) can run more than once before listeners are removed, and game restarts / HMR / character-switch re-inits can call "start ambience" again — each call stacks another wind loop at full gain. Two stacked beds = +6dB and a phasing "chorus" that sounds like a bug nobody can reproduce.
2. **Orphaned LFOs.** Oscillators connected to `AudioParam`s (gust LFO → wind filter frequency) keep running forever if a rebuild path forgets `stop()` — they hold the whole subgraph alive (no GC while a source is live).
3. **Per-call buffer allocation.** `createNoiseSource()` allocates and fills a fresh `AudioBuffer` every call. Fine for a 0.15s swing; a looping wind that re-triggers gust buffers every few seconds via this helper allocates multi-second Float32 buffers repeatedly. The bed must build ONE looping noise buffer at init and reuse it (`loop = true`), with gusts as gain/filter automation on top, not new sources.

Also: bird chirps scheduled with `setTimeout` drift against the audio clock and get throttled to ~1/min in background tabs, so chirps burst-fire on tab refocus.

**Why it happens:**
The one-shot mental model ("create nodes, start, forget") is exactly wrong for a bed. And idempotency of the start path is never tested because dev flow is one clean page load.

**How to avoid:**
- The ambient module owns a singleton state: `start()` is idempotent (guard flag), `dispose()` stops and disconnects every persistent node including LFOs.
- One looping noise buffer, created once; gusts = automation curves on a gain/filter, loosely keyed to the shared wind phase.
- Schedule chirps/grunts from the *game loop* (accumulate `deltaSeconds`, fire when due, randomize next interval) — the loop already pauses with the tab, which is the correct behavior; never `setTimeout`.
- All ramp targets strictly > 0 (`exponentialRampToValueAtTime(0)` throws — already documented in `clampGain`).

**Warning signs:**
Ambience gets louder after dying/rejoining or after HMR; growing audio node activity in `chrome://media-internals`; chirp machine-gun burst when returning to the tab.

**Phase to address:** Ambient audio phase; verify in its playtest with an explicit "restart game twice, listen" step.

---

### Pitfall 3: Tab blur / iOS interruption: wind keeps howling over a hidden tab, or never comes back

**What goes wrong:**
Two opposite failures:
- **Desktop:** `requestAnimationFrame` stops on a hidden tab but the AudioContext keeps rendering — the wind bed plays forever over the hidden tab (users *will* report "the game keeps making noise"). Meanwhile the game-loop-driven parts (chirp scheduler, gust sync) freeze, so on refocus the bed is desynced from grass sway and a huge `deltaSeconds` spike hits every ambience `update()`.
- **iOS/Safari:** the context enters a non-standard `"interrupted"` state on backgrounding, screen lock, or an incoming call (WebKit bug 237878, web-audio-api#2585) and does NOT self-resume; and if it was `suspended` when the interruption hit, it won't even transition until `resume()` is called. Result: ambience (and all SFX) permanently silent after the first phone call, with `state` lying as `suspended`.

**Why it happens:**
The current unlock logic handles cold-start autoplay policy only (`pointerdown` → `resume()`, then listeners removed) — after unlock, nothing ever watches `context.state` again.

**How to avoid:**
- `visibilitychange` handler: on hidden, ramp `ambientBus` gain to ~0 (short `setTargetAtTime`); on visible, restore and `resume()` if `state !== 'running'` (checking the string `'interrupted'` too — it's not in the TS union, compare via `as string`).
- Keep (or re-add) a lightweight pointerdown "recovery" listener that calls `resume()` when state is not running — cheap insurance for mobile.
- Clamp the post-refocus `deltaSeconds` in ambience/wind updates (the game loop likely already clamps; verify the new consumers use the clamped value).

**Warning signs:**
Audio continues after switching tabs; game permanently silent on a phone after locking the screen; grass sway and wind gusts visibly out of phase after alt-tab.

**Phase to address:** Ambient audio phase (the visibility handling); mobile playtest in the same phase's verification.

---

### Pitfall 4: Day/night fog drift done by *reassigning* fog / toggling fog → full-scene shader recompile hitches

**What goes wrong:**
`scene.fog = new THREE.Fog(0x8ecae6, 80, 300)` already exists (`createMondstadtWorld.ts:203`) and every built-in material compiled WITH `USE_FOG`. The `USE_FOG` / `FOG_EXP2` defines are baked at compile time, so:
- Setting `scene.fog = null` (e.g. an "indoors" or debug toggle) or switching `Fog` → `FogExp2` mid-game flips the define and recompiles **every world material** — a multi-hundred-ms hitch on a scene this size.
- Assigning a *new* `THREE.Fog` object per frame for the color drift allocates per frame and has historically triggered spurious `needsUpdate` churn in three (GH issue #13849 class of bug).
- Meanwhile the actually-correct operation — mutating `scene.fog.color`, `.near`, `.far` in place — is uniform-only and free.

Same trap one level up: `scene.background` is a `Color` that the overlay pass saves/restores by reference (`createPixelRenderer.ts` pass 3). Day/night must mutate that Color in place, never assign a new one, or the horizon and fog tint desync and you allocate per frame.

One compatibility note that is a non-issue here and shouldn't be "fixed": the grass/terrain materials are `onBeforeCompile`-patched **built-ins** (Lambert), so they already include the fog chunks and respond to fog automatically. Only raw `ShaderMaterial`/`RawShaderMaterial` ignores fog — the repo's RawShaderMaterials are offscreen ping-pong passes (scorch/influence) that never need it. If any in-world custom shader (telegraph drapes) ever reads as "glowing through the fog" at distance, that's this — fix by including `fog_pars_*`/`fog_fragment` chunks + `fog: true`, not by hacking fog math by hand.

**Why it happens:**
"Change the fog" reads as "make a new fog." The recompile cost is invisible until it lands as a hitch mid-combat exactly when day flips to dusk.

**How to avoid:**
Day/night lite = one function mutating in place: `fog.color`, `scene.background`, hemisphere light color/intensity, sun light color/intensity. No object identity changes, no fog type changes, fog stays non-null forever. Precompute the palette as keyframe Colors and `lerpColors` into the live objects with preallocated scratch. Note the cheap win: light color/intensity changes do NOT require a shadow-map rebuild (depth-only), so the existing `shadowMap.autoUpdate = false` parity scheme is untouched.

**Warning signs:**
Frame spike at dusk/dawn boundaries; `renderer.info.programs` count growing over a play session; horizon color visibly mismatching fog color.

**Phase to address:** Atmosphere / day-night phase.

---

### Pitfall 5: Day/night drift vs unlit + baked materials — the world darkens except the things that don't

**What goes wrong:**
Dimming the hemisphere/sun only affects *lit* materials. This scene has `MeshBasicMaterial` in-world (safe-zone ring at full-bright 0x9fe86a, likely other markers/FX) and heavily *baked* brightness: grass root→tip vertex shades (0.72–1.18), per-instance blade colors, voxel prop palettes. At reduced night intensity, Lambert surfaces dim but every Basic material glows at day brightness — the safe ring becomes the brightest object in the region, and unlit world FX float over a dark world. Second-order: fog color must dim WITH the lights, or distant terrain at night fades into a bright daylight-blue wall.

Also — a locked decision, restated because it's the single most tempting "improvement": **do not move the sun.** The texel-snapped shadow basis + player-following shadow camera assumes a fixed sun direction; animating it makes shadow texels swim/acne every frame and forces per-frame shadow rebuilds (currently deliberately half-rate).

**Why it happens:**
Unlit materials are invisible in the mental model of "just dim the lights"; nobody audits them until the first night screenshot.

**How to avoid:**
- Keep the night floor high (this is "day/night *lite*" — think 100%→~55% intensity, warm→cool hue, not actual darkness). A top-down PVP game must stay readable at night; night-blindness is a gameplay bug, not ambiance.
- Grep-audit `MeshBasicMaterial` usages in-world before implementing; either exempt them intentionally (emissive things: lanterns, rings can be argued) or multiply them by the day/night factor via a shared uniform.
- Verify against the *pixelated* render path — the low-res nearest-filter target quantizes subtle color drift into visible banding steps; test the 20-min cycle time-scaled (add a debug time-scale knob from day one).

**Warning signs:**
Night screenshot where UI-green ring outshines the plaza; players complaining they can't see telegraphs at night; banding in the sky gradient through the pixel filter.

**Phase to address:** Atmosphere / day-night phase; the "no sun movement" rule should be restated in that phase's plan as a constraint.

---

### Pitfall 6: Day/night phase computed in React or with naive bigint/wall-clock math

**What goes wrong:**
Three distinct traps in "phase from server timestamp":
1. **React pressure.** App re-renders on every server transaction (~16/s). Deriving the cycle phase from a `useTable` row in the component body recomputes continuously and pipes a per-frame value through React → exactly the 144→20fps class of regression this repo already survived. The game loop, not React, must own the phase.
2. **BigInt precision/alloc.** `Timestamp.microsSinceUnixEpoch` is a bigint (~1.78e15 today — still integer-exact in a double, but only by accident of the current century). The safe pattern is modulo in bigint space FIRST: `Number(micros % CYCLE_MICROS) / Number(CYCLE_MICROS)`, computed ONCE at anchor time — not bigint→Number per frame (bigint ops allocate).
3. **Clock skew / drift.** Using `Date.now()` for phase gives every LAN player their own sunset (client clocks differ by seconds–minutes). Correct model: capture one anchor pair (server timestamp ↔ `performance.now()`) when a subscribed row carrying a server timestamp arrives, then `phase(t) = anchor + (performance.now() − anchorLocal)`, re-anchoring quietly whenever a fresh server timestamp comes through (reconnects included). Mid-cycle joiners then get the correct phase for free — but snap the lighting to it *before* first render, or ease over ~2s; never lerp from the daylight default (a 30-second sunrise on every page load looks broken).

**Why it happens:**
The timestamp lives in table rows delivered through React-adjacent plumbing, so the path of least resistance runs it through App.tsx. And the client currently consumes no world-clock timestamp at all (grep: only `joinedAt`/`createdAt` sorts), so this is new plumbing with no precedent to copy.

**How to avoid:**
A tiny `dayNightClock` module owned by `createGame`: takes a server-timestamp anchor via a setter (called from a table callback, NOT a render), exposes `getPhase01()` for the game loop. Pure math (`micros % CYCLE`) extracted to a zero-import helper with vitest coverage (repo testing discipline) — including the "joins at phase 0.97" wraparound case.

**Warning signs:**
FPS dips correlating with world-tick rate after the feature lands; two side-by-side LAN clients showing different sky colors; sunrise animation on every refresh.

**Phase to address:** Atmosphere / day-night phase (the clock helper is its first, testable plan step).

---

### Pitfall 7: Wildlife instancing — culled-out flocks, per-frame upload waste, and accidental shadow/material churn

**What goes wrong:**
Four independent failure modes when adding moving InstancedMesh wildlife:
1. **Vanishing flocks.** InstancedMesh frustum-culls with ONE geometry boundingSphere; with world-space instance matrices the auto bounds are a tiny sphere at the origin, so butterflies vanish when the camera looks away from (0,0,0). The repo already solved this for grass (manual island-sized `boundingSphere`); wildlife must either set a manual sphere covering the wander volume or `frustumCulled = false` (correct for a few hundred quads — the culling test costs more than drawing them).
2. **Per-frame attribute churn.** Wildlife re-writes `instanceMatrix` every frame. Without `instanceMatrix.setUsage(THREE.DynamicDrawUsage)` the driver treats each upload as a static-buffer respecification. And composing matrices with `new Matrix4/Vector3/Quaternion` per instance per frame violates the no-per-frame-allocs rule at ~200×60 allocations/s — reuse module-level scratch objects (grass setup code is the template).
3. **Shadow pass tax.** The shadow map redraws the whole scene every other frame. Animated wildlife with `castShadow = true` adds draw calls to that pass for shadows nobody can see on a butterfly. `castShadow = false, receiveShadow = false`, like grass.
4. **Fireflies as real lights.** `createLightPool` documents the hard rule: three.js recompiles every lit material when the scene's light COUNT changes, so lights are pre-added and never removed — and the pool is size 4, shared with projectile glows. A firefly swarm must be emissive/Basic sprites with a glow texture, NOT PointLights; if dusk lanterns want real light, add dedicated always-in-scene lights (intensity 0 by day) at startup, fixed count forever, `layers.enableAll()` (the pool documents why).

**Why it happens:**
Each rule exists in the codebase but in a different file; a fresh wildlife module is written from scratch and re-derives none of them.

**How to avoid:**
Name `createGrassField.ts` and `createLightPool.ts` as pattern sources in the wildlife phase plan. Prefer GPU-side motion where possible (wing flap / bob via the shared wind uTime in a patched material, CPU only for wander positions at reduced cadence).

**Warning signs:**
Butterflies blink out at screen edges or when panning; GPU frame time up with wildlife on-screen count constant; every lit material re-initializing on dusk transition (dev-console shader-compile stalls).

**Phase to address:** Wildlife phase.

---

### Pitfall 8: Wear features written into the decaying influence/scorch channels — permanent things that evaporate, and stamp-queue starvation

**What goes wrong:**
The ground-influence texture's four channels are ALL claimed (RG = bend direction, B = flatten, A = wear) and both maps decay on fixed clocks (bend ≈ 4–5s readable, wear `exp(-t/25)` ≈ gone in a minute, scorch on the same regrow clock). The milestone's wear features collide with this in three ways:
1. **"Worn footpaths near camps" are permanent** — writing them into the A-wear channel means re-stamping forever against a decay designed for footprints, and any decay retune for the ~2s grass-bend trail changes footpath persistence too. Static wear belongs in a *static* layer: baked vertex colors / a small static texture the terrain+grass shaders sample — not the ping-pong maps.
2. **The 2s grass-bend trail** wants a different decay than the current 4–5s bend clock; tuning the shared `DECAY_PER_FRAME_AT_60` changes every existing consumer (footstep feel, strike flattening). If the trail needs its own timing it needs its own channel budget — which doesn't exist — so the honest options are "accept the shared clock" or "second influence texture," decided consciously in planning, not discovered mid-implementation.
3. **`MAX_STAMPS_PER_FRAME = 16` silently drops overflow.** Ambient stampers (dust puffs, regrowth nudges, bird-flush flattening) sharing the queue with combat stamps can starve strike scorch exactly during busy fights. Ambient writers must be rate-limited and yield to combat (or the cap raised with measurement).

Plus the documented contract every new consumer must honor: hold the **uniform object**, never cache `.value` — the ping-pong swaps the texture under you every frame.

**Why it happens:**
The influence map looks like a free general-purpose "write stuff on the ground" API; its channel budget and decay semantics are invisible at the call site.

**How to avoid:**
Open the wear phase with a half-page channel-budget note: what's static (bake), what's dynamic (which channel, which clock), what stamps at what rate. Read `createScorchMap.ts` + `groundInfluenceMath.ts` before writing any new stamp caller.

**Warning signs:**
Footpaths fading when no one walks them; scorch craters not appearing during heavy fights (queue starvation); grass flicker after a swap (cached `.value` somewhere).

**Phase to address:** Props/wear phase.

---

### Pitfall 9: Camera sway + FOV kick vs the nearest-filtered pixel target — full-screen pixel crawl (and motion sickness)

**What goes wrong:**
The world renders into a low-res nearest-filtered target; any continuous sub-texel camera motion makes every edge in the frame flicker as geometry crosses texel boundaries — the classic "pixel crawl/shimmer" of 3D pixel art. A persistent idle sway or a speed-coupled FOV lerp turns the *whole screen* into low-grade noise; under perspective projection there is no perfect camera-snap fix (depth-dependent drift — the known result from 3D-pixel-art rendering practice; the 2026 texel-splatting paper exists precisely because snapping can't fully solve perspective). Separately, camera bob/sway/FOV modulation is the top motion-sickness trigger class — Xbox Accessibility Guideline 117 says avoid it or make it disableable, and shipped AAA practice is intensity sliders.

Small extra trap: the same camera drives the native-resolution overlay pass (health bars, damage numbers), so FOV kicks also pump the size of every overlay billboard — usually fine for a 100ms kick, ugly for a sustained FOV-by-speed effect.

**Why it happens:**
Camera feel is tuned in native (non-pixelated) mode where sway looks buttery; the pixel path quantizes it into shimmer. And ambiance milestones invite "always-on" subtle motion, which is exactly the kind that sickens.

**How to avoid:**
- Prefer **transient** camera effects (short FOV kick with fast ease-out on burst damage, brief run-lean on direction *change*) over continuous idle sway; put idle "breathing" on the character mesh (already per-entity animation), not the camera.
- `camera.updateProjectionMatrix()` after every FOV write (cheap; the projection is not part of the frozen-matrix scheme — `resize()` is the template).
- Tune with `setPixelated(true)`; screenshot-diff a static scene with sway on/off to see crawl objectively.
- Ship a single "camera motion" setting (off/reduced/full), default modest. This is also why camera feel is correctly scheduled LAST — it is the only feature here that can make players physically ill.

**Warning signs:**
Static scene "sparkles" while idle; testers reporting eye strain/queasiness; overlay text breathing in size.

**Phase to address:** Camera-feel phase (last), with the toggle as an acceptance criterion.

---

### Pitfall 10: "One coherent wind" built as N private clocks

**What goes wrong:**
Grass wind today is a local accumulator (`timeUniform.value += deltaSeconds` inside `createGrassField`). The milestone promises flags, banners, tree canopies, and smoke sharing the phase. The naive port gives each system its own `+= delta` accumulator — they start in sync and drift apart the moment any system clamps, pauses, or updates at a different cadence (tab refocus with clamped delta, React-gated init order). "Coherent wind" silently becomes four incoherent winds, and the audio gusts (Pitfall 2) sync to yet a fifth.

**Why it happens:**
Copy-paste from the grass implementation, which was written when it was the only consumer.

**How to avoid:**
Extract a `windClock` module owning ONE `{ value }` uniform object + one `advance(delta)` called once per frame from the game loop; every shader (grass, flags, smoke) receives the same object reference (uniforms share by reference — free), and the audio gust envelope reads the same phase. Refactor `createGrassField` to consume it in the same change (no legacy accumulator left behind — repo rule).

**Warning signs:**
Flags peaking while adjacent grass is at rest; smoke gusting against the field; desync appearing only after alt-tab.

**Phase to address:** Whichever phase ships the second wind consumer — extract the clock *before* adding consumer #2.

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Ambient SFX connect straight to `destination` (skip bus refactor) | Ships wind a day earlier | No ducking, clipping in combat, retrofit later touches every play function | Never — bus is ~30 LOC and must come first |
| Footpaths stamped into the decaying wear channel | Reuses existing stamp API | Permanent features evaporate; decay retunes ripple across features | Never for permanent wear; fine for transient dust |
| `frustumCulled = false` on wildlife | Skips bounds bookkeeping | Wildlife always drawn even off-screen | Acceptable at ≲500 instances per species; revisit above |
| Day/night tested only with the time-scale debug knob | Fast iteration | Slow-drift banding/perf issues invisible at 100× speed | Acceptable during dev; one real-time soak before phase close |
| Hard-coded ambient volume (no settings UI) | Avoids UI work | Players who hate wind mute the whole game | Acceptable for alpha IF the camera-motion toggle ships (that one is health, not preference) |
| Chirp/gust variety via bare `Math.random()` (no variation pools) | Simple | Repetition fatigue on a 100%-uptime bed | Acceptable at first; `jitter()` discipline from `audioCore` is the floor |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| WebAudio autoplay policy | Starting the bed at module init — silent until gesture, or throws | Start bed inside the existing gesture-unlock path (`createAudioSystem` pattern); bed `start()` idempotent |
| Safari/iOS audio | Only handling `suspended` | Also handle non-standard `'interrupted'`; `resume()` on visibilitychange + pointerdown recovery |
| SpacetimeDB timestamp → day/night | Reading the timestamp per render via `useTable` in App.tsx | One anchor captured in a table callback into a game-loop-owned clock module; React never sees the phase |
| `scene.fog` / `scene.background` | Assigning new objects (or `null`) to animate them | Mutate `.color`/`.near`/`.far` in place; fog identity and presence never change after startup |
| Influence/scorch maps | Caching `textureUniform.value`; stamping without rate limit | Hold the uniform OBJECT (documented ping-pong contract); ambient stampers yield to combat within `MAX_STAMPS_PER_FRAME` |
| lightPool | Acquiring pooled lights for lanterns/fireflies (pool=4, shared with projectiles) | Dedicated fixed-count lights added at startup intensity-0, or emissive sprites; NEVER add/remove lights at runtime (light-count change recompiles all lit materials) |
| Pixel renderer layers | Putting ambiance FX quads on `OVERLAY_LAYER` (bypasses fog AND pixelation) | World-space ambiance stays on layer 0; overlay is only for crisp UI billboards |
| `onBeforeCompile` materials | New patched variant colliding with the grass program cache | Distinct `customProgramCacheKey` per patched variant (grass sets `'grassField'` — follow it) |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Wildlife matrices composed with fresh `Matrix4`/`Vector3` per instance per frame | GC sawtooth, minor-GC hitches | Module-level scratch objects; `DynamicDrawUsage` on instanceMatrix | ~100+ instances at 60fps |
| Day/night lerp allocating Colors per frame | Same GC sawtooth, subtler | Preallocated keyframe + scratch Colors, `lerpColors` in place | Immediately (runs every frame forever) |
| Ambient state flowing through React (phase, wildlife counts, audio levels) | FPS degrades as server tick rate × re-render cost | Game-loop-owned modules + refs; React only for the settings toggle | ~16 transactions/s baseline — day one |
| New always-on `update()`s doing trig over all instances every frame | Flat frame-cost increase even with ambiance "invisible" | Wildlife steering at 10–15Hz with per-frame interpolation; GPU-side sway via shared uTime where possible | Adds up across 5+ ambiance systems |
| Firefly/lantern real lights | Every lit material's fragment cost scales with light count | Cap total scene lights; sprites for glow | Each added PointLight taxes every lit fragment |
| Bed audio nodes accumulating across restarts | Audio-thread CPU creep, eventual distortion | Idempotent start + full dispose; live-node debug count during dev | After 2–3 soft restarts |

## Security Mistakes

Client-only milestone — no new server surface. Two hygiene notes:

| Mistake | Risk | Prevention |
|---------|------|------------|
| Debug knobs (day/night time-scale, wildlife spawn) reachable in prod builds | Cosmetic desync/confusion in LAN play | Gate behind the existing local-only debug convention (`debug_*` reducers precedent) |
| Client-derived night phase later gating anything gameplay-relevant | Phase is client-computed → spoofable | Keep day/night 100% cosmetic; any future gameplay-relevant time must come from a server reducer |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Night too dark for a competitive top-down game | Can't read telegraphs/enemies at night → deaths blamed on the feature | "Lite" floor: intensity never below ~55%, hue shift carries the mood; overlay elements already exempt |
| Always-on camera sway | Motion sickness (XAG 117 class) | Transient-only effects + camera-motion toggle, default subtle |
| Ambient bed audible over combat | Combat readability regression — combat SFX are tuned cues | Ducking (Pitfall 1) + low resting gain |
| Chirp/gust repetition | Fatigue; players mute audio entirely | Randomized 5–15s intervals, `jitter()` on every frequency, ≥3 chirp variants |
| Lighting pop on join / reconnect | "The game glitched" first impression | Snap phase before first render, or ≤2s ease |
| Wildlife in combat space | Butterflies over a goliath fight read as visual noise | Suppress/flee wildlife near active combat (they already flush on sprint — extend to combat radius) |

## "Looks Done But Isn't" Checklist

- [ ] **Ambient audio:** works after — page refresh mid-fight, tab blur→refocus, iOS screen lock→unlock, two soft game restarts (no stacking).
- [ ] **Ducking:** slam over full ambience shows no clipping (watch the compressor's `reduction` param).
- [ ] **Fog + day/night:** verified in *pixelated* mode (banding), and one real-time full 20-min cycle soak, not just time-scaled.
- [ ] **Day/night sync:** two LAN clients side-by-side show the same sky within a second; a client joining at night spawns into night.
- [ ] **Wildlife:** pan camera to world edge and back — nothing blinks out; `renderer.info.render.calls` delta with wildlife on/off is the expected small constant.
- [ ] **Wear:** footpaths still there after 5 idle minutes (not in the decaying channel); scorch still stamps during a 6-goliath fight (queue not starved).
- [ ] **Camera feel:** toggle exists and actually zeroes all camera motion; idle static scene shows no pixel sparkle with sway on.
- [ ] **Frame budget:** existing `scripts/fps_playtest.py` harness run with ALL ambiance enabled simultaneously during a golem-class fight — features are built per-phase but the cost is summed.
- [ ] **React:** no new `useTable`-derived per-frame values; App re-render count unchanged (repo's existing flood check applies).

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Clipping/no-ducking discovered late | MEDIUM | Retrofit bus (~30 LOC) + reroute every play function — the exact refactor skipped; do it before more SFX land |
| Fog-toggle recompile hitch shipped | LOW | Replace toggle with a "fog.near ≈ camera.far" mutation (effectively off); fog object never null |
| Footpaths in wear channel | MEDIUM | Re-implement as static bake; delete the stamp-refresh loop (dead-code rule) |
| Sway shipped, players report sickness | LOW–MEDIUM | Default the toggle to reduced/off in a client-only hotfix build (`pnpm build`, no publish — this milestone's one deployment mercy) |
| Wildlife perf regression | LOW | Instance-count knob via `deviceProfile` (existing pattern); halve counts on low tier |
| Bed leak in production | LOW | Client-only fix + rebuild; add live-node debug assert to prevent recurrence |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 — No audio bus / clipping | Ambient audio (first task) | Compressor `reduction` active under slam+wind; no crackle in dense fight |
| 2 — Bed leaks / stacking | Ambient audio | Double-restart listen test; live-node count stable |
| 3 — Blur/interrupted handling | Ambient audio | Tab-blur silences bed; iOS lock→unlock recovers audio |
| 4 — Fog reassign/recompile | Atmosphere/day-night | `renderer.info.programs.length` constant across a full cycle |
| 5 — Unlit materials at night | Atmosphere/day-night | Night screenshot audit; telegraph readability playtest at night |
| 6 — Phase clock (React/bigint/skew) | Atmosphere/day-night | Vitest on pure phase helper incl. wraparound; two-client sky match |
| 7 — Wildlife culling/upload/lights | Wildlife | Edge-pan blink test; draw-call delta; zero runtime light add/removes |
| 8 — Wear channel misuse / starvation | Props/wear | 5-min footpath persistence; scorch under stamp load |
| 9 — Camera crawl + sickness | Camera feel (last) | Toggle acceptance criterion; pixelated-mode idle-sparkle check |
| 10 — Wind clock fragmentation | Wind/atmosphere (before consumer #2) | Flags+grass+smoke visibly in phase after alt-tab |
| Summed frame budget | Final milestone verification | `fps_playtest.py` with all ambiance on during heavy combat |

## Sources

**Codebase (HIGH confidence — direct reads, 2026-07-13):**
- `src/game/engine/createPixelRenderer.ts` — two-pass pixel pipeline, half-rate shadows, frozen-matrix scheme, overlay-pass background save/restore
- `src/game/world/createGrassField.ts` — onBeforeCompile Lambert patch, uTime accumulator, manual island boundingSphere, castShadow=false rationale
- `src/game/systems/createScorchMap.ts` + `groundInfluenceMath.ts` — ping-pong uniform contract, channel budget (RG/B/A all claimed), decay clocks, `MAX_STAMPS_PER_FRAME=16`
- `src/game/systems/createLightPool.ts` — light-count recompile rule, pool size 4
- `src/game/audio/createAudioSystem.ts`, `audioCore.ts` — gesture unlock, direct-to-destination routing, per-call noise buffers, exp-ramp-to-zero guard
- `src/game/world/createMondstadtWorld.ts` — existing `scene.fog` + matching background color; MeshBasicMaterial safe-zone ring
- `CLAUDE.md` + project memory (identity-hex perf cliff, three.js CPU-overhead traps, combat FPS playtest) — the regression history these pitfalls guard

**Web (MEDIUM confidence — cross-checked via research seam, websearch provider):**
- three.js fog vs ShaderMaterial + recompile behavior: [three.js forum — shader materials + fog](https://discourse.threejs.org/t/anyone-have-any-luck-getting-shader-materials-to-respond-to-fog/17218), [three GH #13849 fog needsUpdate churn](https://github.com/mrdoob/three.js/issues/13849)
- AudioContext `interrupted` state: [MDN BaseAudioContext.state](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state), [WebKit bug 237878](https://bugs.webkit.org/show_bug.cgi?id=237878), [web-audio-api #2585](https://github.com/WebAudio/web-audio-api/issues/2585)
- Master bus + compressor for game mixes: [MDN DynamicsCompressorNode](https://developer.mozilla.org/en-US/docs/Web/API/DynamicsCompressorNode)
- InstancedMesh culling with moving/world-space instances: [three.js forum — frustum culling with InstancedMesh](https://discourse.threejs.org/t/how-to-do-frustum-culling-with-instancedmesh/22633), [disappearing InstancedMesh](https://discourse.threejs.org/t/solved-instancedmesh-dissapeared-because-of-frustum/53651)
- Pixel crawl / camera snapping in 3D pixel art: [David Holland — 3D Pixel Art Rendering](https://www.davidhol.land/articles/3d-pixel-art-rendering/), [Texel Splatting (arXiv 2603.14587)](https://arxiv.org/abs/2603.14587)
- Camera motion accessibility: [Xbox Accessibility Guideline 117](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/117), [Game Accessibility Guidelines — camera movement](https://gameaccessibilityguidelines.com/avoid-or-provide-option-to-disable-any-difference-between-controller-movement-and-camera-movement/)

---
*Pitfalls research for: v0.3.0-alpha Living World — client-only ambiance on an existing Three.js pixel-filter multiplayer game*
*Researched: 2026-07-13*
