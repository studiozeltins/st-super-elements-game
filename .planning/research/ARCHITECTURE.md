# Architecture Research — Living World ambiance integration (v0.3.0-alpha)

**Domain:** Client-only Three.js ambiance systems (audio bed, fog/sky, wind, wildlife, day/night, wear, camera feel) grafted onto an existing pixel-filter 3D game
**Researched:** 2026-07-13
**Confidence:** HIGH for integration seams (every point cites a line verified against the live code); MEDIUM for the server-timestamp source (one claim in the milestone framing is WRONG — see "Day/night clock" below)

> This is an INTEGRATION study for an EXISTING client architecture. Zero server publishes.
> It answers: where each new system plugs into the render loop, which existing modules are
> modified vs which are new siblings, what data flows change, and what build order the
> dependencies force. `src/game/createGame.ts` is a 1,963-LOC monolith — every new system
> is a sibling module wired in with ≤ a handful of lines, per the ≤300-LOC / no-monolith rule.

---

## Standard Architecture

### System Overview — where the new systems sit

```
┌────────────────────────────────────────────────────────────────────────────┐
│ REACT LAYER (re-renders every ~150ms server tx — game loop must not depend) │
│  App.tsx: subscriptions (139-173) · useGameTableBridge → game.sync*()       │
│  NEW: nothing. Ambiance is 100% inside the game layer.                      │
├────────────────────────────────────────────────────────────────────────────┤
│ GAME LOOP  createGame.ts frame() (1304-1362) — ONE rAF, owns all updates    │
│                                                                             │
│   updateLocalPlayer (883) ──┬─ groundInfluence.stamp (899, footpath wear)   │
│                             └─ NEW: wildlife.notifyPlayerMotion (birds,     │
│                                      dust puffs share this signal)          │
│   world.update (1340) ──────── windmill blades + grassField.update +        │
│                                campfire flicker  → NEW: wind.update,        │
│                                ambience (fog/sky/lights), smoke, flags      │
│   updateCamera (1237-1248) ─── NEW: lean/FOV-kick folds in here             │
│   groundInfluence.update /                                                  │
│   scorchMap.update (1357-60) ─ regrowth ALREADY decays here (tune only)     │
│   pixelRenderer.render (1361)                                               │
│                                                                             │
│ NEW SIBLING SYSTEMS (each own module, wired in createGame with 1-3 lines)   │
│   createWind.ts          one phase → grass shader + CPU consumers           │
│   createDayNightCycle.ts server-anchored phase → colors/intensities         │
│   createAmbientAudio.ts  looped WebAudio bed (audioCore primitives)         │
│   createWildlife.ts      butterflies / birds / fireflies (instanced)        │
│   createCameraFeel.ts    lean + FOV kick + shake (absorbs shakeMagnitude)   │
│ NEW WORLD ASSETS (build-time, frozen matrices)                              │
│   createCampFlag.ts · createLantern.ts · createPlazaProps.ts · footpaths   │
├────────────────────────────────────────────────────────────────────────────┤
│ GPU MAPS (ping-pong RTs, existing)                                          │
│   groundInfluence (RGBA: bend dir / flatten / WEAR) · scorchMap (R)         │
│   WRITE-ONLY from CPU — never read back (no GPU stalls). Bird-flush must    │
│   hook the stamp CALL SITES, not the texture.                               │
└────────────────────────────────────────────────────────────────────────────┘
```

### Verified Integration Seams (the actual code)

| Seam | File:line | What's there today | How ambiance hooks in |
|---|---|---|---|
| **Render loop tick** | `src/game/createGame.ts:1304` `frame()` | Single rAF; `deltaSeconds` clamped to 0.05; `elapsedSeconds` accumulator | Each new system gets one `x.update(deltaSeconds)` call inside `frame()` (or inside `world.update`) |
| **Grass wind uniform** | `src/game/world/createGrassField.ts:147` `timeUniform = { value: 0 }`, incremented in `update()` (:184-186); shader sway at :120-122 (`sin(uTime*1.7 + x*0.35 + z*0.25) + 0.4*sin(uTime*3.3 + z*0.7)`) | Free-running local clock, grass-only | Extract into `createWind.ts`; pass `wind.timeUniform` into `createGrassField` options; wind module also exposes the SAME formula as a pure JS `sampleWind(x,z)` for CPU consumers |
| **groundInfluence writes** (bend-trail + bird-flush signal) | Player wear stamp `createGame.ts:899-907` (radius 0.8, wear 0.03/frame while moving+grounded); landing thump :930; walker trails `stampWalkerTrail` :1130-1148; strike wear :1798 | Map is GPU write-only via `stamp()` queue (`createGroundInfluence.ts:266-269`, max 64/frame) | Bend-trail behind player ALREADY EXISTS (B-channel decays ~4-5s, `groundInfluenceMath.ts:14` `DECAY_PER_FRAME_AT_60=0.985`) — the "~2s lingering trail" is a stamp-strength/decay TUNE, not a new system. Bird flush + dust puffs must consume the CPU-side motion signal at :899 (position + move vector + isGrounded), NOT the texture |
| **Scorch regrowth** | `createScorchMap.ts:205` fade uses `wearDecayForDelta`; constant at `groundInfluenceMath.ts:44` (`WEAR_REGROW_TIME_CONSTANT_SECONDS = 25`, full char fades <0.1 in ~58s); grass browning tracks it live (`createGrassField.ts:92` mixes `vScorch`) | Regrowth ALREADY IMPLEMENTED and grass-coupled | "Grass regrows over scorch" = tuning `groundInfluenceMath.ts` constants (unit-tested in `groundInfluenceMath.test.ts`) — possibly a separate slower constant for scorch vs wear if the shared clock reads wrong |
| **lightPool** | `src/game/systems/createLightPool.ts:26` — 4 PointLights added ONCE at startup, intensity-toggled, NEVER added/removed (light-count change = full shader recompile, comment :5-9); created `createGame.ts:317`, borrowed by effectSystem :320 | Transient projectile glows only | Fireflies must NOT be pool lights (4 total, combat owns them). Fireflies = emissive instanced quads/points, optionally ONE pooled light for the nearest cluster. Lanterns = permanent PointLights added at WORLD BUILD (campfire pattern: named light, `layers.enableAll()`, `createCampfire.ts:72-78`), faded via intensity by the day/night phase — intensity changes are free |
| **audioCore / SFX pattern** | `src/game/audio/audioCore.ts` (clampGain/createNoiseSource/jitter/panned); gesture-unlocked shared ctx in `createAudioSystem.ts:61-77` (`getContext()` exported :307); sibling modules take `audioSystem.getContext` (createGame.ts:369-375); `src/ui/pullSounds.ts` uses the same withAudio/unlock pattern | All one-shot voices | NEW `createAmbientAudio.ts` takes `audioSystem.getContext` like the other five audio siblings. Difference: LOOPED sources (`AudioBufferSourceNode.loop=true` noise through a lowpass, gain modulated per frame by `wind.sample()`), plus one-shot chirps/grunts on randomized timers driven from `frame()` — no free-running `setTimeout` (keep everything on the game clock) |
| **Camera control** | `updateCamera` `createGame.ts:1237-1248`: fixed `CAMERA_OFFSET` (:248), shake offsets, lerp, lookAt. Camera object created in `createPixelRenderer.ts:47` (`PerspectiveCamera(45,…)`, fov changes need `updateProjectionMatrix()`) | Position-only control; shake state `shakeMagnitude` :1234 | NEW `createCameraFeel.ts` owns lean (roll/offset from the move vector), idle sway, FOV kick (`camera.fov` + `updateProjectionMatrix` — cheap, but only call when changing), and can absorb the existing shake math. `updateCamera` shrinks to a call into it. FOV-kick trigger: `spawnSelfNumber` (:1656, big taken damage) and `handleAttackStrike` juice tiers (:1810-1885, where shake is already set) |
| **Hemisphere/sun lights + fog** | `createLighting` `createMondstadtWorld.ts:111-135`: `HemisphereLight(0xbfe3ff, 0x4a7a3a, 0.9)` :112, `DirectionalLight(0xfff2d8, 1.4)` :120; returned sunLight kept for shadow focus :349. `scene.background` (0x8ecae6) + `scene.fog = new THREE.Fog(0x8ecae6, 80, 300)` at :202-203 — fog ALREADY EXISTS, same hex as background | Static colors; sun DIRECTION is load-bearing (texel-snap basis `sunDirection/sunRight/sunUp` :106-108 — NEVER move it) | `createLighting` returns only sunLight today — widen to also return skyLight (or return an `AmbienceHandles` object: skyLight, sunLight, fog, background). Day/night drift mutates `color/groundColor/intensity` + `fog.color` + `scene.background` in place (Color.lerpColors between keyframes; zero allocs with scratch Colors). Fog near/far tune + horizon softening = adjust the existing Fog at :203 |
| **Day/night clock source** | ⚠️ `world_timer` is a **scheduled, PRIVATE table** (`spacetimedb/src/index.ts:695-704`, no `public: true`) — clients CANNOT subscribe to it. The milestone framing is wrong here | — | See "Day/night clock" pattern below — use SDK event timestamps via the existing `useGameTableBridge` callbacks, `Date.now()` fallback. NO server publish needed |
| **Camp positions** (goliath-grunt / flag placement) | `src/game/world/camps.ts:29` `getCampSites()` — deterministic, shared client/server; camps decorated in `createMondstadtWorld.ts:399-419` (campfire+teepees+totem per site) | | Ambient audio reads `getCampSites()` once for grunt-proximity gain; flags/smoke get placed in the same camp-decoration loop |
| **Campfire smoke anchor** | `createCampfire.ts:34-81` — voxel flame + named PointLight (`CAMPFIRE_LIGHT_NAME`), flicker driven from `world.update` (`createMondstadtWorld.ts:434-451` collects lights by name once, wobbles per frame) | No smoke today | Smoke columns follow the exact campfire-light pattern: instanced quads named/collected at build, sine-drifted per frame in `world.update` using `wind.sample()` |
| **Frozen-matrix world rule** | `createMondstadtWorld.ts:427-428` (`group.updateMatrixWorld(true); group.matrixWorldAutoUpdate = false`); the windmill blades are the template for a mover inside the frozen subtree (:443-445 — mutate, then `updateMatrixWorld(true)` on just that branch); renderer computes scene matrices once/frame (`createPixelRenderer.ts:107-109`) | | Flags/smoke/canopy CPU-sway must either (a) live OUTSIDE the frozen `world.group`, or (b) follow the blades pattern — mutate + manual `updateMatrixWorld` per branch. Canopy sway across 8+ trees is cheaper as a SHADER patch (grass pattern, `onBeforeCompile` + shared `wind.timeUniform` + `customProgramCacheKey`) than as per-tree CPU matrix pushes |
| **Perf kill-switch convention** | `createGame.ts:295-317`: `?nograss/?nobend/?noshadow/?nofx` URLSearchParams bisect flags | | Every new ambiance system should register one (`?nowind`, `?nowildlife`, `?noambientaudio`, `?nodaynight`) — this convention exists precisely for frame-cost bisection |
| **Quality profile** | `deviceProfile.detectQualityProfile()` (`createGame.ts:300`) gates grass blade count + influence resolution | | Wildlife instance counts and smoke quad counts should key off the same profile |

---

## Recommended Project Structure (new + modified files)

```
src/game/
├── systems/
│   ├── createWind.ts            # NEW ~80 LOC: timeUniform + gust envelope + sampleWind(x,z) CPU mirror
│   ├── windMath.ts              # NEW pure helper (zero-import): the sway formula shared GLSL↔JS↔test
│   ├── createDayNightCycle.ts   # NEW ~120 LOC: phase(serverMicros) → keyframe-lerped palette
│   ├── dayNightMath.ts          # NEW pure helper: phase math + keyframe lerp (vitest, no THREE)
│   ├── createWildlife.ts        # NEW ~250 LOC: butterflies+fireflies instanced; birds flush state
│   ├── createCameraFeel.ts      # NEW ~120 LOC: lean/sway/FOV kick/shake, owns camera mutation
│   └── createSmokeColumns.ts    # NEW ~100 LOC: instanced smoke quads over campfires (wind-driven)
├── audio/
│   └── createAmbientAudio.ts    # NEW ~250 LOC: wind bed loop, gusts, chirps, rustle, grunts
├── world/
│   ├── createGrassField.ts      # MOD: take wind.timeUniform instead of local clock (≈6 lines)
│   ├── createMondstadtWorld.ts  # MOD: return AmbienceHandles {skyLight,sunLight,fog}; add flags/
│   │                            #      lanterns/props/footpaths to build; wire smoke into update()
│   │                            #      ⚠ 494 LOC already — additions go in sibling modules, this
│   │                            #      file only gains placement calls (~20 lines net)
│   ├── createFootpaths.ts       # NEW ~80 LOC: static worn-path decals near camps (build-time)
│   └── assets/
│       ├── createCampFlag.ts    # NEW: banner mesh, exposes named sway pivot (campfire-light pattern)
│       ├── createLantern.ts     # NEW: mesh + named PointLight (CAMPFIRE pattern), day/night fades it
│       └── createPlazaProps.ts  # NEW: crates/fences (static, obstacles[] entries)
├── net/
│   └── createServerClock.ts     # NEW ~60 LOC: server-micros estimate from SDK event timestamps
└── createGame.ts                # MOD: construct + wire the new systems (~25 lines net; NO logic here)
src/hooks/
└── useGameTableBridge.ts        # MOD: pass ctx event timestamp into game.syncServerClock (≈8 lines)
```

### Structure Rationale

- **`systems/` siblings, not createGame growth:** createGame.ts is 1,963 LOC — the CLAUDE.md 300-LOC rule means every feature here is "new module + minimal wiring". The existing systems (`createLightPool`, `createScorchMap`, `createAttackViewClock`) are the template: factory function, returned interface, `update(deltaSeconds)` called from `frame()`.
- **Pure-helper twins (`windMath.ts`, `dayNightMath.ts`):** project discipline (memory: pure-helper testing) — extract the zero-import math first, test it, then wrap in THREE. The wind formula especially MUST have a single source of truth because it lives in both GLSL (grass vertex stage) and JS (flags/smoke/audio gusts).
- **Assets follow `createCampfire.ts`:** named sub-objects collected once by `group.traverse` at world build, animated in `world.update` — this is the established pattern for dynamic bits inside the frozen world.

---

## Architectural Patterns

### Pattern 1: One wind phase, two consumption paths (shader uniform + CPU mirror)

**What:** `createWind.ts` owns `timeUniform = { value }` (advanced in `frame()`), plus a gust envelope (slow LFO on amplitude). GPU consumers (grass, optionally canopy leaves) share the uniform OBJECT (same contract as `groundInfluence.textureUniform` — hold the object, never the value; `createGroundInfluence.ts:23-25`). CPU consumers (flags, smoke, butterfly drift, audio gust gain) call `wind.sample(x, z)` — a JS transliteration of the grass GLSL at `createGrassField.ts:120-122`.

**When to use:** Everything that "moves with the wind" this milestone.

**Trade-offs:** The GLSL and JS formulas can drift apart silently. Mitigate: keep the formula in `windMath.ts` with the constants exported, generate the GLSL string from those same constants (the shader is already template-built via `onBeforeCompile`, so `${WIND_FREQ_1}` interpolation is natural — `createGrassField.ts:118` already interpolates `1/BLADE_HEIGHT` this way).

**Example:**
```typescript
// windMath.ts — single source of truth, unit-tested
export const WIND = { f1: 1.7, x1: 0.35, z1: 0.25, f2: 3.3, z2: 0.7, amp2: 0.4 };
export function sampleWind(t: number, x: number, z: number): number {
  return Math.sin(t * WIND.f1 + x * WIND.x1 + z * WIND.z1)
       + WIND.amp2 * Math.sin(t * WIND.f2 + z * WIND.z2);
}
```

### Pattern 2: Server-anchored day/night phase (the clock the milestone framing got wrong)

**What:** The milestone says "phase from server timestamp (world_timer or similar)". **Verified: `world_timer` is a private scheduled table (`spacetimedb/src/index.ts:695-704`) — not subscribable.** No always-fresh public server-time column exists either (`player.lastKillRewardAt` only moves on kills; `unit_attack.startedAtMicros` only exists during goliath attacks — that's what `createAttackViewClock.ts:65-68` anchors from, but it's intermittent).

**The seam that works with ZERO server publish:** the SpacetimeDB TS SDK passes an `EventContext` as the first argument of every row callback — `useGameTableBridge.ts:30-35` already receives it (typed `unknown`, discarded). For reducer-driven transactions (`worldTick` fires every ~150ms and always touches `enemy`/`goliath` rows), `ctx.event` carries the reducer event's server timestamp. Bridge it: on each callback, extract the micros, re-anchor `createServerClock.ts` (`baseServerMicros + (performance.now() - basePerfMs)` — the exact estimator `createAttackViewClock.ts:65-68` already uses). Day/night phase = `(serverMicros / CYCLE_MICROS) % 1`.

**Fallback:** if the ctx event shape doesn't expose the timestamp (⚠ verify against the installed SDK version as the FIRST task of this phase), `Date.now()` is the degrade path — LAN machines agree within NTP skew (≪1s), invisible on a 20-minute cycle. Either way all clients converge on the same phase.

**Trade-offs:** ctx-based clock is exactly-right but couples to SDK internals; Date.now() is trivial but drifts with a badly-skewed clock. Recommend: try ctx, keep Date.now() as the documented fallback inside `createServerClock.ts` so the rest of the system doesn't care.

### Pattern 3: Day/night drives COLORS ONLY — the sun never moves

**What:** `createDayNightCycle.ts` maps phase → keyframed palette `{ skyColor, groundColor, sunColor, sunIntensity, hemiIntensity, fogColor, backgroundColor, lanternLevel, fireflyLevel }` (4-6 keyframes, `Color.lerpColors` into scratch Colors — zero allocs). Applied each frame to the handles `createMondstadtWorld` newly exposes.

**Why the constraint is hard:** `sunDirection/sunRight/sunUp` (`createMondstadtWorld.ts:106-108`) are module-level constants that texel-snap the shadow camera (`setShadowFocus` :472-486). Moving the sun breaks the snap basis and resurrects shadow shimmer. Intensity/color drift is free; direction is frozen. This matches the PROJECT.md decision ("NO sun movement").

**Also driven by the same phase:** lantern PointLight intensity (fade in at night), firefly spawn gate (dusk band, e.g. phase ∈ [0.45, 0.75]), ambient-audio crossfade (day birds → night crickets is a natural extension but NOT scoped — keep the hook).

### Pattern 4: Wildlife = instanced quads + CPU signal hooks, never texture readbacks

**What:** `createWildlife.ts` — three populations in one module (split if it passes 300 LOC):
- **Butterflies:** one InstancedMesh of camera-agnostic quads, wander = seeded noise + `wind.sample` drift, altitude ≈ grass height, placed over grass islands (`ISLANDS` from `world/terrain.ts` — the same anchor `createGrassField.ts:172-176` uses for bounding spheres). Frustum-cull per island like grass.
- **Birds (flush):** dormant ground clusters; the flush trigger is the SAME CPU signal that stamps grass wear — `updateLocalPlayer` at `createGame.ts:899` has position + world move vector + `isGrounded()`. Pass a `notifyPlayerMotion(x, z, speed)` call next to the existing stamp; birds within radius launch a one-shot flight animation (pooled instances, return to a new roost).
- **Fireflies:** emissive points/quads (additive material), spawn gate from day/night `fireflyLevel`, drifting near grass; at most ONE pooled light borrowed for the densest on-screen cluster — the pool has 4 lights total and combat owns them (`createLightPool.ts:22`), so glow comes from emissive sprites, not real lights.

**Why not "groundInfluence hook" literally:** the influence map is a write-only GPU ping-pong (`createGroundInfluence.ts:270-305`); reading it back (`readRenderTargetPixels`) stalls the pipeline. All gameplay-side reactions consume the CPU call sites instead.

### Pattern 5: Ambient audio bed = looped nodes on the existing gesture-unlocked context

**What:** `createAmbientAudio.ts(getContext)` — sixth sibling of the five existing audio modules (`createGame.ts:369-375`). Structure:
- **Wind bed:** one looping noise buffer (`loop = true`) → lowpass ~300-600Hz → GainNode; per-frame `update(deltaSeconds, windLevel, …)` sets `gain.value` toward `base + gustEnvelope` from `wind.sample` — the "loosely synced to grass sway" requirement is literally the same number the blades bend by.
- **Bird chirps:** one-shot oscillator chirps on a randomized 5-15s timer accumulated in `update()` (game clock, not setTimeout — survives tab-throttle consistently with the rest of the loop). Frequencies through `jitter()` (`audioCore.ts:31-33`) like every other repeated sound.
- **Grass rustle:** short bandpass noise loops gated by the same `isMoving && isGrounded` signal as the wear stamp; gain by player speed.
- **Goliath grunts:** low formant blats on a random timer, gain = distance falloff — reuse the `hitAudioGain/hitAudioPan` shape (`createGame.ts:378-390`); positions from `goliathRenderer.forEachAliveUnit` (live goliaths) and/or `getCampSites()` (camp murmur).

**Cold-start rule (learned in pullSounds):** never assume the context is running — every voice checks `state !== 'running'` and skips (pattern at `createAudioSystem.ts:80-81`); the looped bed must START (or re-start) lazily on the first update where the context reports running.

### Pattern 6: Camera feel is a system, not more createGame lines

**What:** `createCameraFeel.ts` receives `{ camera }` and per-frame inputs `{ moveX, moveZ, isMoving, deltaSeconds }`, plus impulses `kickFov(strength)` / `shake(magnitude)`. `updateCamera` (`createGame.ts:1237`) becomes: compute desired position → `cameraFeel.apply(desired, inputs)` → lerp/lookAt. The existing shake block (:1239-1244) moves in wholesale (no-legacy rule: refactor in place, don't layer).
- Lean: roll the camera (or offset the lookAt) a few degrees toward the run direction, spring-damped.
- Idle breathing sway on CHARACTERS is not camera work — it belongs in `createCharacterModel.animate` (called at `createGame.ts:959` with `elapsedSeconds, deltaSeconds, isMoving`) — small chest-scale/y-bob when `!isMoving`. Modify that file, not the camera.
- FOV kick: `camera.fov += kick; camera.updateProjectionMatrix()` only on frames where the spring is active (updateProjectionMatrix is not free — gate it).

---

## Data Flow

### New per-frame flow (additions in caps)

```
frame(deltaSeconds)                                   createGame.ts:1304
  ├─ WIND.update(dt)                 gust envelope + timeUniform advance
  ├─ SERVERCLOCK (passive — re-anchored by bridge callbacks, not per-frame)
  ├─ DAYNIGHT.update(serverClock.nowMicros())
  │     └─ writes: skyLight/sunLight colors+intensity, fog.color,
  │               scene.background, lantern intensities, firefly gate
  ├─ updateLocalPlayer(dt)
  │     ├─ groundInfluence.stamp(...)            existing :899
  │     └─ WILDLIFE.notifyPlayerMotion(x,z,speed) + AMBIENT.setRustle(speed)
  ├─ WILDLIFE.update(dt, wind, daynight.fireflyLevel)
  ├─ world.update(dt)                            :1340
  │     ├─ grassField.update (uses wind.timeUniform now)
  │     ├─ SMOKE columns (wind.sample per column)
  │     └─ FLAG pivots (wind.sample per camp; manual updateMatrixWorld)
  ├─ AMBIENT.update(dt, wind.level, goliathPositions, campSites)
  ├─ updateCamera(dt) → CAMERAFEEL.apply(...)    :1237
  ├─ groundInfluence.update / scorchMap.update    :1357-1360 (unchanged)
  └─ pixelRenderer.render(scene)                  :1361
```

### Data flow CHANGES (not just additions)

1. **Grass clock ownership moves:** `createGrassField` stops owning `timeUniform` (:147) and receives `wind.timeUniform` via options — its `update()` no longer advances time (may keep nothing and drop to a no-op; delete dead code per no-legacy rule).
2. **`createMondstadtWorld` return type widens:** from `{group, update, getGroundHeight, getObstacles, setShadowFocus, dispose}` (:31-48) to also expose `ambience: { skyLight, sunLight, fog, background-setter, lanternLights[] }` — day/night mutates through these handles instead of reaching into the scene.
3. **`useGameTableBridge` gains one output:** the mirror callbacks (:50-61) forward the ctx event timestamp (when present) to `game.syncServerClock(micros)` — a new 1-method addition to the `Game` interface.
4. **Strike juice fans out:** `handleAttackStrike` (:1771) and `spawnSelfNumber` (:1656) additionally call `cameraFeel.kickFov(...)` for the burst-damage kick.

---

## Scaling Considerations (frame budget, not users)

| Concern | Budget guidance |
|---|---|
| Wildlife instances | Butterflies ~64-128, fireflies ~64, birds ~4 clusters × 6 — all single InstancedMesh each, ONE matrix write per moving instance per frame. Key counts off `detectQualityProfile()` like grass does |
| Lights | Forward Lambert pays per-light per-fragment. World already carries ~7 campfire PointLights + 4 pool lights + hemi + sun. Lanterns: ≤4-6, plaza-only. Fireflies: 0-1 real lights |
| Day/night writes | Color lerps into pre-allocated scratch `THREE.Color`s; palette keyframes are module constants. Zero per-frame allocation (the ban at `createGame.ts` is real — see nearestEnemyScratch :661 style) |
| Smoke/flags CPU sway | ~7 camps × (1 flag + 1 smoke column). Follow the windmill-blades manual-matrix pattern (:443-445). If canopy sway is added for 8+ trees, do it in-shader, not CPU |
| Ambient audio | 2-3 persistent nodes (bed + rustle); one-shots are already the norm. Gain writes per frame are trivially cheap |

### First bottleneck
Per-frame `updateMatrixWorld` calls on CPU-swayed branches inside the frozen world — measure with the existing `?no*` bisect flags before adding more movers; prefer shader sway when count grows.

---

## Anti-Patterns (specific to this codebase)

### Anti-Pattern 1: Growing createGame.ts / createMondstadtWorld.ts
**What people do:** inline the wildlife/wind/ambience logic where the hook point is.
**Why it's wrong:** createGame is 1,963 LOC (6.5× the 300-LOC cap); the CLAUDE.md rule says carve new work into siblings.
**Do this instead:** factory-module + `update()` + wiring lines, exactly like `createAttackViewClock` (extracted for the same reason — see its header comment :4-8).

### Anti-Pattern 2: Reading GPU maps back for gameplay
**What people do:** "birds flush where the influence map shows disturbance" → readRenderTargetPixels.
**Why it's wrong:** synchronous GPU→CPU readback stalls the pipeline; the maps ping-pong every frame (`createGroundInfluence.ts:270+`).
**Do this instead:** consume the CPU stamp call sites (`createGame.ts:899`, `stampWalkerTrail` :1130) — position/velocity is already in hand there.

### Anti-Pattern 3: Dynamic light add/remove
**What people do:** spawn a PointLight per firefly/lantern on demand.
**Why it's wrong:** three re-compiles EVERY lit material when the scene's light count changes (documented at `createLightPool.ts:5-9`); also forgetting `layers.enableAll()` flips the lights-state hash per pass and re-inits all materials (`createMondstadtWorld.ts:113-117`).
**Do this instead:** all lights in the scene at build time, intensity 0 when off; `layers.enableAll()` on every one.

### Anti-Pattern 4: Free-running clocks per system
**What people do:** each system keeps its own `elapsed += dt` or setInterval.
**Why it's wrong:** wind/grass/smoke/audio drift out of the "one coherent wind" goal; timers desync from the render loop under tab throttle.
**Do this instead:** wind time is THE clock for sway consumers; day/night time comes from serverClock; everything advances inside `frame()`.

### Anti-Pattern 5: Caching `.value` of ping-pong uniforms
**What people do:** `const tex = influence.textureUniform.value` in a new shader consumer.
**Why it's wrong:** the target swaps every frame — you'd render last frame's map forever (warning at `createGroundInfluence.ts:23-25`).
**Do this instead:** hold the uniform OBJECT; applies to any new consumer (e.g. if footpath decals sample wear).

### Anti-Pattern 6: Re-tinting materials per frame via new materials
**What people do:** create/tint a material per day/night step.
**Why it's wrong:** material churn re-resolves shader params (the gem-drop lesson, `createGame.ts:977-991`).
**Do this instead:** mutate shared material/light `.color` in place; if terrain/props must tint with time of day, prefer letting the LIGHTS carry the mood (Lambert responds to light color for free — zero material changes needed).

---

## Integration Points

### Internal Boundaries (new)

| Boundary | Communication | Notes |
|---|---|---|
| createGame ↔ createWind | construct + `update(dt)`; consumers get the wind object | Wind has no deps — build first |
| createWind ↔ createGrassField | `timeUniform` object passed via options | The ONLY grass change; formula constants shared via windMath |
| useGameTableBridge ↔ createServerClock | `game.syncServerClock(micros)` on ctx timestamps | ⚠ verify SDK ctx shape first; Date.now() fallback lives inside serverClock |
| createServerClock ↔ createDayNightCycle | `nowMicros()` pull, per frame | Pure function of time — trivially testable |
| createDayNightCycle ↔ createMondstadtWorld | new `ambience` handles (skyLight/sunLight/fog/lanterns) | Sun DIRECTION untouchable (shadow texel-snap basis) |
| createDayNightCycle ↔ createWildlife / lanterns | `fireflyLevel` / `lanternLevel` scalars | Day/night must land before fireflies + lantern fade |
| createGame ↔ createWildlife | `notifyPlayerMotion` beside the :899 stamp; `update(dt)` | Also the dust-puff trigger (share the signal; puffs via `effectSystem.spawnBurst` or debrisSystem) |
| createGame ↔ createAmbientAudio | `getContext` at construction (like :369-375); `update()` with wind level + goliath/camp proximity | Distance/pan helpers :378-390 are closures over playerPosition — either export gain/pan math to a helper or pass computed gains in |
| createGame ↔ createCameraFeel | `apply()` in updateCamera; `kickFov` from strike/damage handlers | Absorbs existing shake state (refactor, don't duplicate) |

### Suggested build order (dependencies verified)

1. **Wind core** (`windMath.ts` + `createWind.ts` + grass refactor) — no dependencies; everything sways off it. Includes flags + campfire smoke + canopy decision (the visible payoff that proves the shared phase).
2. **Fog + sky + day/night** (`createServerClock.ts` + bridge tap + `dayNightMath.ts` + `createDayNightCycle.ts` + ambience handles in createMondstadtWorld + lantern assets with lights-at-build) — fog color must couple to the sky color, so fog tuning and the cycle land together. FIRST TASK: verify the SDK EventContext timestamp claim (MEDIUM confidence).
3. **Ambient audio bed** (`createAmbientAudio.ts`) — depends on wind (gust sync); goliath/camp proximity data already available. Independent of day/night (unless day/night SFX variants are wanted later).
4. **Props + wear** (`createPlazaProps.ts`, `createFootpaths.ts`, regrowth/bend-trail constant tuning, dust puffs off the motion signal) — static build-time work + tunes; no cross-deps. Note: worn footpaths near camps are STATIC bakes (decals/vertex tint), not influence-map stamps — the wear channel decays in ~1 minute by design.
5. **Wildlife** (`createWildlife.ts`) — butterflies need wind (drift); fireflies need day/night (`fireflyLevel`); birds need the motion signal. Latest of the world systems because it consumes phases 1-2.
6. **Camera feel** (`createCameraFeel.ts` + idle breathing in `createCharacterModel.animate`) — PROJECT.md says "do last (micro-polish)"; no other system depends on it.

Each phase adds its `?no*` bisect flag and keys counts off `detectQualityProfile()`.

---

## Sources

- Direct codebase inspection (primary, 2026-07-13): `src/game/createGame.ts` (frame loop :1304, camera :1237, stamps :899/:1130/:1798, audio wiring :369-375, perf flags :295-317), `src/game/world/createMondstadtWorld.ts` (lighting :111-135, fog :202-203, frozen matrices :427-428, campfire flicker :434-451, sun basis :96-108), `src/game/world/createGrassField.ts` (uTime :147/:184, sway GLSL :120-122, scorch tint :92), `src/game/systems/createGroundInfluence.ts` (channel contract :17-28, ping-pong warning :23-25), `src/game/systems/createScorchMap.ts` (decay :205), `src/game/systems/groundInfluenceMath.ts` (decay constants :14/:44), `src/game/systems/createLightPool.ts` (never add/remove :5-9), `src/game/systems/createAttackViewClock.ts` (server-clock anchor :65-68), `src/game/audio/audioCore.ts`, `src/game/audio/createAudioSystem.ts` (gesture unlock :61-77), `src/ui/pullSounds.ts` (cold-start pattern), `src/game/engine/createPixelRenderer.ts` (camera :47, matrix once/frame :107-109), `src/hooks/useGameTableBridge.ts` (ctx discarded :30-35), `src/game/world/camps.ts` (:29), `spacetimedb/src/index.ts` (world_timer private :695-704, player table :314-350, enemy/goliath/unit_attack schemas :389-503), `src/App.tsx` (subscription list :139-173).
- MEDIUM-confidence item flagged inline: SpacetimeDB TS SDK `EventContext.event` timestamp availability in row callbacks — verify against the installed SDK before building `createServerClock.ts`; `Date.now()` fallback keeps the design safe either way.

---
*Architecture research for: v0.3.0-alpha Living World (client-only ambiance integration)*
*Researched: 2026-07-13*
