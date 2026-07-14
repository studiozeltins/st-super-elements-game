# Phase 9: Atmosphere & Day/Night - Research

**Researched:** 2026-07-14
**Domain:** Client-only Three.js color pipeline (distance fog + gradient sky + server-anchored day/night drift + plaza lanterns) grafted onto a frozen-matrix pixel-filter game
**Confidence:** HIGH (every seam re-verified against live code post-Phase-8; the one MEDIUM claim in the milestone research — SDK `EventContext` server timestamp — is now RESOLVED to HIGH by direct inspection of `spacetimedb@2.6.1` type defs)

> This RESEARCH.md CONFIRMS and TIGHTENS `.planning/research/ARCHITECTURE.md` + `PITFALLS.md` into a plan-ready phase doc. It does not repeat them. The single highest-value result is the **clock verification** (Pattern 2 below): the `EventContext` reducer timestamp is real, typed, and reachable — the `Date.now()` fallback is now a safety net, not the primary path.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** ~20min total cycle, **asymmetric day-weighted** — long day, short dawn/dusk bands, moderate night. Smoothstep-blended keyframes (4–6 keys). (DAYNITE-01)
- **D-02:** Sun/shadow **direction is frozen** (load-bearing texel-snap basis `sunDirection/sunRight/sunUp`). Day/night drifts COLOR + INTENSITY only, never position.
- **D-03:** Night = **blue moonlight palette**, cool hemisphere + dimmed warm sun tint, held to a **~40–50% day-exposure floor** — combat stays fully readable. Night is a palette, not a dimmer. Enforced in `dayNightMath` keyframes. (DAYNITE-03)
- **D-04:** Replace the flat `scene.background` with a **vertical gradient** (top = sky key color, bottom = horizon). The **gradient's bottom color IS the fog color** — one scratch `THREE.Color` feeds both fog + sky-bottom every frame. Single source; they can never diverge. Render technique is Claude's discretion so long as the single-source contract holds. (ATMO-02)
- **D-05:** Distant terrain **dissolves into the sky/fog color** at the world edge — `scene.fog` mutated **in place** (never reassigned; the object identity is shared).
- **D-06:** Fog `near` stays **beyond the gameplay/telegraph radius** (start from today's `near≈80`, well past `SAFE_ZONE_RADIUS` + typical engage range); `far` hides the world edge (~250–320). Telegraphs, enemies, gem drops inside the radius keep ~full contrast at every time of day. Exact near/far = playtest-tuned discretion. (ATMO-03)
- **D-07:** **4–6 warm PointLights**, plaza-only, added **once at world build** using the campfire pattern (named light, `layers.enableAll()`, collected by name) — NOT the 4-light combat pool. `lanternLevel` scalar **fades intensity** (dusk in, dawn out) — no runtime light add/remove. (DAYNITE-04)
- **D-08:** Time-of-day phase = `(serverMicros / CYCLE_MICROS) % 1`, **bigint modulo before `Number()`**, advanced inside the game loop (`serverClock.nowMicros()`), **never derived per React render**. Source: SDK `EventContext` reducer timestamp bridged through `useGameTableBridge`, re-anchoring `createServerClock`; **`Date.now()` fallback**. NO server publish. (DAYNITE-02)
- **D-09:** Register a `?nodaynight` URLSearchParams bisect flag that freezes the palette at a neutral day key — for FPS bisection.

### Claude's Discretion
- Exact keyframe count (4–6), palette hex values, sub-band boundaries (dawn/day/dusk/night fractions), fog near/far constants, sky render technique (dome mesh vs texture vs shader, provided bottom=fog is single-sourced), lantern count (4–6) and exact plaza positions.
- Shape of the `AmbienceHandles` object returned by `createMondstadtWorld` (skyLight, sunLight, fog, background-setter, lanternLights[]).
- `fireflyLevel` / `lanternLevel` scalar API — design the contract now for Phase 12 + lanterns; expose `fireflyLevel` but do NOT consume it (no fireflies this phase).

### Deferred Ideas (OUT OF SCOPE)
- Fireflies → Phase 12 (this phase exposes the `fireflyLevel` dusk-gate scalar, does not consume it).
- Ambient-audio time-of-day variants → Phase 10 (expose the hook, do not wire).
- Weather → deferred milestone-wide.
- All 8 `todo.match-phase 9` hits judged false positives — none folded.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ATMO-01 | Distant terrain dissolves into sky color; world edge hidden; gameplay-radius contrast preserved | Fog `near=80` >> `SAFE_ZONE_RADIUS=18` keeps combat crisp; `far~250–320` dissolves edge (`WORLD_BOUND=130`). Pattern 5 (fog tuning) |
| ATMO-02 | Sky/horizon gradient bottom color == fog color, single source | Pattern 3 (sky-dome ShaderMaterial: `bottomColor.value` IS the same `THREE.Color` object as `scene.fog.color`) |
| ATMO-03 | Telegraphs/enemies/gems keep full contrast at all times of day | Night exposure floor ~45% (D-03) + fog near beyond gameplay radius; Pitfall 5 audit |
| DAYNITE-01 | ~20min day-weighted color drift, sun/shadow direction never moves | Pattern 4 (keyframe model); D-02 freezes sun basis; only `.color`/`.intensity` drift |
| DAYNITE-02 | All LAN players see the same time of day | Pattern 2 (server-anchored clock — SDK reducer timestamp broadcast to every subscriber; `Date.now()` fallback within NTP skew ≪1s) |
| DAYNITE-03 | Night keeps a blue combat-readable ambient floor — palette not darkness | `dayNightMath` night keyframes clamped ≥~45% day exposure, cool hue shift |
| DAYNITE-04 | Plaza lanterns fade in at dusk, out at dawn (intensity fade on build-time lights) | Pattern 6 (`createLantern.ts` + campfire named-light pattern; `lanternLevel` scalar drives intensity) |

</phase_requirements>

## Summary

Phase 9 is ONE client-only color pipeline delivered as two new sibling modules plus a minimal widening of the world factory: `createDayNightCycle.ts` (server-anchored phase → keyframed palette), `dayNightMath.ts` (pure, THREE-free, vitest-covered twin), and `createServerClock.ts` (server-micros estimate). It mutates a new `AmbienceHandles` object that `createMondstadtWorld` newly exposes (skyLight, sunLight, fog, background, lanternLights). Fog already exists (`Fog(0x8ecae6, 80, 300)` at `createMondstadtWorld.ts:223`); this phase couples it to a new gradient sky and a time-of-day drift, and adds `createLantern.ts` plaza lights. Zero server publish. Every hard rule from the milestone research holds: sun DIRECTION frozen, mutate-in-place never-reassign, zero per-frame alloc, let lights carry mood (no material re-tint), one clock advance in `createGame.frame()`.

Phase 8 (wind) already shipped `createWind.ts` + `windMath.ts` + `createSmokeColumns.ts` + `createCampFlag.ts` and the `?nowind`/`?nosmoke` flags — **`createWind.ts` is the exact sibling-factory + pure-helper-twin precedent to mirror** for `createDayNightCycle.ts`/`dayNightMath.ts`. Build order inside the phase: (1) `dayNightMath.ts` + tests, (2) `createServerClock.ts` + bridge tap, (3) `createDayNightCycle.ts`, (4) `AmbienceHandles` widening + gradient sky, (5) `createLantern.ts` + plaza placement, (6) wire one `daynight.update()` line + `?nodaynight`.

**Primary recommendation:** Anchor the clock off the **verified** SDK `EventContext` reducer timestamp (`worldTick` fires every 150ms touching enemy/goliath rows — see Pattern 2 for the exact access path); render the gradient sky as an inward `ShaderMaterial` dome whose `bottomColor` uniform *is the same `THREE.Color` instance* as `scene.fog.color` (physical single-source, zero-alloc `.lerpColors` into it each frame).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Time-of-day phase (0..1) | Browser / Client (game loop) | — | Cosmetic only; must never gate gameplay (spoofable). Advanced in `frame()`, never React |
| LAN clock sync anchor | API / Backend (SpacetimeDB reducer broadcast) | Client (re-anchor) | Server's `worldTick` reducer start-timestamp is broadcast identically to every subscriber; client only re-derives via `performance.now()` delta |
| Palette keyframe math | Client (pure `dayNightMath.ts`) | — | THREE-free, deterministic, unit-tested — the source of truth for colors/intensities/scalars |
| Fog / sky / light mutation | Client (`createDayNightCycle` → `AmbienceHandles`) | — | Day/night writes through handles; never reaches into the scene directly |
| Lantern intensity fade | Client (day/night `lanternLevel` → build-time PointLights) | — | Lights added once at world build; only `.intensity` drifts (no recompile) |

## Standard Stack

**No new dependencies.** Confirmed against `.planning/research/STACK.md` (zero-new-deps ruling) and `package.json`.

### Core (all already present)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `three` | (project pinned) | Fog, HemisphereLight, DirectionalLight, PointLight, ShaderMaterial dome, `Color.lerpColors` | Already the entire render layer |
| `spacetimedb` | 2.6.1 (verified `node_modules/spacetimedb/package.json`) | `EventContext` reducer timestamp = LAN clock source | Already the multiplayer SDK; timestamp reachable with zero server change |
| `vitest` | 3.2.4 (verified `package.json:54`) | `dayNightMath.test.ts` pure-helper twin | Established test framework (`windMath.test.ts` is the template) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Sky-dome `ShaderMaterial` | `CanvasTexture` on `scene.background` | Rejected: animating colors means redrawing the canvas each keyframe change AND changing `scene.background` from `Color`→`Texture` risks the overlay-pass save/restore-by-reference contract (`createPixelRenderer.ts` pass 3). Dome keeps `scene.background` a `Color` (mutated in place) |
| Sky-dome `ShaderMaterial` | Vertex-color gradient dome | Rejected: to drift colors you'd rewrite the geometry color attribute per keyframe; a 2-uniform ShaderMaterial mutates two `Color`s in place, zero alloc |
| SDK `EventContext` timestamp | Anchor off a row data column (`createAttackViewClock` style) | Rejected: no enemy/goliath column advances every tick — `hopStartedAtMicros`/`aggroExpiresAtMicros` are event-driven, not per-tick `now`. The reducer event timestamp is the only universal per-tick source |

## Package Legitimacy Audit

**No external packages installed this phase.** All capabilities use `three`, `spacetimedb@2.6.1`, and `vitest@3.2.4`, already in `package.json` and already the project's load-bearing deps. Legitimacy gate not applicable (nothing to add to the dependency graph).

## Architecture Patterns

### Recommended file layout (new + modified)
```
src/game/
├── systems/
│   ├── createDayNightCycle.ts   # NEW ~120 LOC: phase → keyframe palette → AmbienceHandles writes
│   ├── dayNightMath.ts          # NEW pure helper (zero THREE import): phase01 + keyframe lerp + scalars
│   └── __tests__/dayNightMath.test.ts  # NEW vitest (mirror windMath.test.ts)
├── net/
│   └── createServerClock.ts     # NEW ~50 LOC: anchor(serverMicros) + nowMicros() estimate, Date.now() fallback
├── world/
│   ├── createMondstadtWorld.ts  # MOD: widen return to expose `ambience: AmbienceHandles`; collect lanternLights in the traverse loop (:471); place lanterns in the plaza build
│   └── assets/
│       └── createLantern.ts     # NEW: voxel post + named PointLight (campfire pattern), intensity faded by lanternLevel
├── createGame.ts                # MOD: const serverClock/daynight; one daynight.update() in frame(); ?nodaynight flag (~6 lines net)
src/hooks/
└── useGameTableBridge.ts        # MOD: on Reducer-tagged ctx, call game.syncServerClock(micros) (~8 lines)
```

### Pattern 2: Server-anchored day/night clock — CLOCK CLAIM VERIFIED (was MEDIUM, now HIGH)

**The milestone research rated "is the reducer server timestamp reachable client-side?" as MEDIUM. It is RESOLVED to HIGH.** Direct inspection of `spacetimedb@2.6.1` type defs:

- Table row callbacks receive `ctx: EventContext` (`node_modules/spacetimedb/dist/sdk/client_table.d.ts:15,26,37` — `onInsert/onUpdate/onDelete(cb: (ctx: EventContextInterface<RemoteModule>, row) => void)`). `useGameTableBridge.ts:30-35` currently types this ctx as `unknown` and **discards it** — that's the seam to tap.
- `ctx.event` is a discriminated union `Event` (`event.d.ts`): `tag: 'Reducer' | 'SubscribeApplied' | 'UnsubscribeApplied' | 'Error' | 'Transaction'`.
- When `ctx.event.tag === 'Reducer'`, `ctx.event.value` is a `ReducerEvent` (`reducer_event.d.ts`) with `timestamp: Timestamp` — documented verbatim as *"The time when the reducer started running."* Server-authoritative, deterministic, broadcast identically to **every** subscriber (this is what makes all LAN clients agree → DAYNITE-02, no server publish).
- `Timestamp.microsSinceUnixEpoch: bigint` (`lib/timestamp.d.ts` — getter over `__timestamp_micros_since_unix_epoch__`).

**Verified access path (in a table callback):**
```typescript
// useGameTableBridge.ts — widen the discarded ctx and tap it
import type { EventContext } from '../module_bindings';
// inside the enemy + goliath mirror callbacks:
const onUpdate = (ctx: EventContext, _oldRow: Row, row: Row) => {
  if (ctx.event.tag === 'Reducer') {
    const micros: bigint = ctx.event.value.timestamp.microsSinceUnixEpoch;
    gameRef.current?.syncServerClock(micros);   // re-anchor; NOT a render
  }
  map.set(keyOf(row), row);
  markDirty();
};
```

**Anchor / re-anchor (reuse the `createAttackViewClock.ts:65-68` estimator verbatim):**
```typescript
// createServerClock.ts
export function createServerClock() {
  let baseServerMicros: bigint | null = null;
  let basePerfMs = 0;
  return {
    anchor(serverMicros: bigint) { baseServerMicros = serverMicros; basePerfMs = performance.now(); },
    nowMicros(): bigint {
      if (baseServerMicros === null) return BigInt(Math.round(Date.now() * 1000)); // fallback until first tick
      return baseServerMicros + BigInt(Math.round((performance.now() - basePerfMs) * 1000));
    },
  };
}
```

**Anchor source:** `worldTick` is a scheduled reducer at `WORLD_TICK_INTERVAL_MICROS = 150_000n` (`spacetimedb/src/index.ts:268`, `~6.7 ticks/sec`) that mutates `enemy`/`goliath` rows every tick → the enemy/goliath `onUpdate` fires ~150ms with a `'Reducer'`-tagged ctx. Because SpacetimeDB broadcasts the reducer's call info (including its start timestamp) to all subscribed clients, every LAN client re-anchors to the same server micros within one tick.

**One cheap runtime confirmation (do it as the FIRST build step of the clock task):** log `ctx.event.tag` + `reducer.name` once on the first goliath/enemy update. The types guarantee the *shape*; this one-line log confirms that a *scheduled* reducer's broadcast to a *non-caller* arrives tagged `'Reducer'` (not `'Transaction'`) in this runtime. If it ever reads `'Transaction'` (no timestamp), the `Date.now()` fallback already covers it — LAN machines agree within NTP skew (≪1s), invisible on a 20-min cycle. Either way DAYNITE-02 holds. `[VERIFIED: spacetimedb@2.6.1 dist type defs]` for the shape; `[ASSUMED]` only for the exact tag of a scheduled-reducer broadcast to a non-caller — the one-line log settles it.

**Guards (must-haves):**
- The `handle.iter()` cache-seed loop (`useGameTableBridge.ts:48`) has NO ctx — only live callbacks carry it. Don't anchor from the seed.
- The initial subscription snapshot arrives tagged `'SubscribeApplied'` (no timestamp) — the `tag === 'Reducer'` guard already skips it.
- Anchor is a *setter called from a table callback*, never a render — the phase is pulled by the game loop only (Pitfall 6.1).

### Pattern 3: Gradient sky, single-sourced with fog (ATMO-02 core contract)

Render an inward-facing (`side: THREE.BackSide`) sphere/dome with a 2-uniform `ShaderMaterial` (`topColor`, `bottomColor`, optional `offset`/`exponent` for the horizon falloff — the classic three.js gradient-sky shader). Add it to `scene` **outside** the frozen `world.group`; keep it centered on the camera each frame (`skyDome.position.copy(camera.position); skyDome.updateMatrixWorld(true)` — one cheap matrix push) OR give it radius ≫ fog.far and accept a fixed origin. Material must set `fog: false`, `depthWrite: false`, and render first (behind everything).

**The load-bearing single-source contract:** make the dome's `bottomColor` uniform hold the *same `THREE.Color` instance* as `scene.fog.color`:
```typescript
// after createMondstadtWorld sets scene.fog:
skyMat.uniforms.bottomColor.value = scene.fog.color;   // SAME reference — cannot diverge
// each frame, createDayNightCycle lerps ONE scratch horizon color, then:
scene.fog.color.copy(scratchHorizon);                  // fog + sky-bottom update together
skyMat.uniforms.topColor.value.copy(scratchSkyTop);    // in place, zero alloc
```
Keep `scene.background` a `Color` (mutated in place to the horizon color as a fallback fill; the dome occludes it) — never reassign it (overlay-pass save/restore is by reference — Pitfall 4) and never set it to a Texture.

**Zero-alloc write path:** module-const keyframe `THREE.Color`s + preallocated scratch Colors; `THREE.Color.prototype.lerpColors(a, b, t)` writes into the scratch, then `.copy()` into the live fog/uniform/light colors. No `new Color()` per frame (Pitfall "day/night lerp allocating Colors").

### Pattern 4: Keyframe palette model (DAYNITE-01 / DAYNITE-03) — pure `dayNightMath.ts`

`dayNightMath.ts` is THREE-free (mirror `windMath.ts`). It owns:
```typescript
export const CYCLE_MICROS = 1_200_000_000n; // 20 min * 60 * 1_000_000
export function phase01(nowMicros: bigint): number {
  // bigint modulo BEFORE Number() (D-08 / Pitfall 6.2); guard negative defensively
  const m = ((nowMicros % CYCLE_MICROS) + CYCLE_MICROS) % CYCLE_MICROS;
  return Number(m) / Number(CYCLE_MICROS);
}
```
Keyframes = 4–6 entries over phase `[0,1)`, **asymmetric day-weighted** (long day band, short dawn/dusk, moderate night), each a plain-number/hex struct: `{ phase, skyTop, horizon /*=fog*/, sunColor, sunIntensity, hemiSky, hemiGround, hemiIntensity, lanternLevel, fireflyLevel }`. Blend adjacent keys with **smoothstep** (not linear). Example band layout (Claude's discretion on exact fractions/hex):
- `0.00` pre-dawn (cool-dim), `0.06` dawn (warm horizon), day band `~0.10–0.55` (bright neutral-warm), `0.62` dusk (orange horizon), night band `~0.70–0.98` (blue moonlight).
- **Night floor:** `sunIntensity`/`hemiIntensity` never below ~0.45–0.55 of day; hue shifts cool. Night is a palette, not a dimmer (D-03). Assert this floor in a test.
- **`lanternLevel`:** 0 across the day band → ramps 0→1 over dusk (~0.58–0.70) → 1 across night → ramps 1→0 over dawn. Consumed this phase (lantern intensity).
- **`fireflyLevel`:** gated to the dusk/night band (e.g. `[0.60, 0.98]`). **Exposed, NOT consumed** (Phase 12).
- **Wraparound:** the last key (`~0.98`) must blend continuously back to `phase 0.00` — no daylight flash at `0.99→0.01`. Test this explicitly.

`createDayNightCycle.ts` wraps the helper: pulls `phase01(serverClock.nowMicros())`, interpolates the palette, `lerpColors` into scratch Colors, writes through `AmbienceHandles`. `?nodaynight` (D-09) freezes at a neutral day key (apply once, skip `update`).

### Pattern 5: Fog tuning & in-place mutation (ATMO-01 / ATMO-03 / D-05)

Current: `scene.fog = new THREE.Fog(0x8ecae6, 80, 300)` (`createMondstadtWorld.ts:223`); `SAFE_ZONE_RADIUS = 18`, `WORLD_BOUND = 130` (`data/constants.ts:2-3`). Keep `near ≥ 80` (≫ gameplay + engage range → telegraphs/enemies/gems at full contrast at every time of day, ATMO-03). Tune `far` into `~250–320` to dissolve the world edge (D-06). **Mutate `scene.fog.color/.near/.far` in place forever** — never reassign, never `null`, never switch `Fog`→`FogExp2` (each is a `USE_FOG` recompile storm across every world material — Pitfall 4). `fog.color` must drift *with* the palette (dim at night) or distant terrain becomes a bright daylight-blue wall at night (Pitfall 5). The grass/terrain Lambert materials are `onBeforeCompile`-patched built-ins → they already carry fog chunks and respond automatically; no shader work needed.

### Pattern 6: `AmbienceHandles` refactor + lanterns (DAYNITE-04)

**Minimal safe widening** of `createLighting` (`createMondstadtWorld.ts:129-153`): today it returns only `sunLight: THREE.DirectionalLight`. `skyLight` (the `HemisphereLight` at :130) is a local const — expose it. Return `{ skyLight, sunLight }`. Then the world factory's return object (`:484`) gains:
```typescript
ambience: {
  skyLight,                 // HemisphereLight — drift .color/.groundColor/.intensity
  sunLight,                 // DirectionalLight — drift .color/.intensity ONLY (direction frozen, D-02)
  fog: scene.fog,           // mutate .color/.near/.far in place
  background: scene.background as THREE.Color, // mutate in place
  lanternLights,            // PointLight[] collected in the :471 traverse loop
  setSkyTop(c: THREE.Color): void,  // writes the dome topColor uniform
}
```
Day/night writes through these handles; it never touches the scene directly. The sun's DIRECTION (`sunDirection/sunRight/sunUp` basis, texel-snap `setShadowFocus`) is untouchable (D-02).

**Lanterns:** new `createLantern.ts` copying `createCampfire.ts:72-78` exactly — a voxel post + a named `THREE.PointLight` with `light.name = LANTERN_LIGHT_NAME`, `light.layers.enableAll()` (skipping `enableAll` flips the lights-state hash and re-inits every lit material per pass). Place 4–6 in the plaza (within `SAFE_ZONE_RADIUS = 18`) during the world build. Collect them by name in the existing `group.traverse` loop (`createMondstadtWorld.ts:471-481`, alongside `campfireLights`/`campFlags`). Day/night sets `light.intensity = LANTERN_BASE * lanternLevel` each frame — intensity changes are free (no recompile). **NOT** the combat `createLightPool` (size 4, combat-owned, never grown — D-07 / Anti-Pattern 3).

### Anti-Patterns (restated — all from PITFALLS.md, verified against current code)
- **Reassigning/toggling `scene.fog` or `scene.background`** → full-scene shader recompile hitch. Mutate in place; fog never null, never type-swapped (Pitfall 4).
- **Re-tinting materials per time-of-day** → material churn / recompile storm. Let LIGHTS carry the mood; Lambert responds to light color for free (Pitfall 5 / Anti-Pattern 6).
- **Deriving the phase in React / from a `useTable` row** → the 144→20fps regression class. Game loop owns the phase; React never sees it (Pitfall 6.1).
- **Runtime light add/remove for lanterns** → recompiles every lit material. All lights at build time, intensity 0 when off (Anti-Pattern 3).
- **`new THREE.Color()` per frame in the lerp** → GC sawtooth. Preallocated keyframe + scratch Colors (Perf Traps table).
- **Free-running per-system clock** → desync. Day/night pulls `serverClock.nowMicros()`; advanced once in `frame()` after `wind.update()`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Color interpolation | Manual channel-lerp math | `THREE.Color.lerpColors(a, b, t)` into scratch | Correct, zero-alloc when target preallocated |
| Server-time estimate | New timing code | The `createAttackViewClock.ts:65-68` estimator (`base + (performance.now()-basePerf)*1000`) | Already the project's proven server-clock anchor |
| Gradient sky | Per-frame canvas redraw / vertex rewrite | 2-uniform `ShaderMaterial` dome (classic three gradient-sky) | Two `Color` uniforms mutate in place; single-source with fog trivially |
| Distance haze | Custom depth-fade shader | Existing `scene.fog` (Lambert built-ins already fogged) | Fog already exists at :223; just tune + drift it |
| Sibling factory + pure twin | Ad-hoc structure | Copy `createWind.ts` + `windMath.ts` + `windMath.test.ts` (Phase 8) | Exact precedent: uniforms held by ref, math in the THREE-free twin, one `update()` from `frame()` |

**Key insight:** every piece of this phase already has a shipped precedent in the codebase (fog, campfire named-light, wind sibling-factory, server-clock anchor, pure-helper twin). The only genuinely new plumbing is `syncServerClock` on the `Game` interface and the one bridge tap — both ~8 lines.

## Common Pitfalls

The four day/night-relevant pitfalls (full detail in `.planning/research/PITFALLS.md` — do not re-derive):
- **Pitfall 4 — fog/background reassign → recompile hitch.** Verify: mutate in place; `renderer.info.programs.length` constant across a full cycle.
- **Pitfall 5 — world darkens except unlit/baked materials at night.** Grep-audit `MeshBasicMaterial` in-world before implementing (known: safe-zone ring `0x9fe86a` at `createMondstadtWorld.ts:167`, campfire flames `MeshBasicMaterial` in `createCampfire.ts:17`). Decide per-material: emissive things (flames, lanterns) stay bright by design; the safe-zone ring at night will be the brightest object — either accept (UI affordance) or multiply by the day/night factor. Restate the "no sun movement" constraint in the plan (D-02).
- **Pitfall 6 — phase in React / naive bigint / clock skew.** bigint modulo before `Number()`; anchor from a callback not a render; snap the palette before first render (or ≤2s ease) so a mid-cycle joiner spawns into the correct time — never a 30s sunrise on every page load.
- **Pitfall 10 (adjacent) — one coherent clock.** Day/night pulls `serverClock`, advanced once in `frame()`; do not add a private accumulator.

**Extra verification note (Pitfall 5 detail):** test the drift through the *pixelated* render path — the low-res nearest-filter target quantizes subtle sky-gradient drift into visible banding. Add a debug time-scale knob (gate behind the local-only convention) for iteration, but do one real-time full-cycle soak before phase close (banding/perf are invisible at 100×).

## State of the Art

| Old (milestone framing) | Current (verified) | Impact |
|--------------------------|--------------------|--------|
| "Phase from `world_timer` server table" | `world_timer` is PRIVATE scheduled (`index.ts:698-702`) — not subscribable | Use the reducer-event timestamp instead |
| "SDK `EventContext` timestamp — MEDIUM confidence, verify first" | RESOLVED HIGH — `ctx.event.value.timestamp.microsSinceUnixEpoch` on `tag==='Reducer'` (`spacetimedb@2.6.1`) | Primary clock path confirmed; `Date.now()` demoted to fallback |
| Research dated pre-Phase-8 | Phase 8 shipped `createWind.ts`/`windMath.ts`/`createSmokeColumns.ts`/`createCampFlag.ts` + `?nowind`/`?nosmoke` | Sibling-factory + pure-twin precedent now exists in-repo to copy exactly |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A *scheduled* reducer's (`worldTick`) row-update broadcast to a *non-caller* client arrives tagged `ctx.event.tag === 'Reducer'` (not `'Transaction'`) | Pattern 2 | LOW — one-line runtime log settles it as the first build step; `Date.now()` fallback covers it regardless. DAYNITE-02 holds either way |
| A2 | Exact keyframe count/hex/band fractions and fog near/far constants | Pattern 4 / 5 | LOW — explicitly Claude's discretion (D-06, D-01); playtest-tuned |

**Everything else in this research is `[VERIFIED]` against live code or the installed SDK type defs.**

## Open Questions

1. **Sky-dome camera tracking vs fixed origin.** Recommendation: parent-to-camera (or `position.copy(camera.position)` each frame) so the horizon sits at the horizon as the player roams `WORLD_BOUND=130`; one matrix push, trivial. Fixed-origin huge dome is acceptable if the horizon shift proves invisible — decide in playtest.
2. **Safe-zone ring brightness at night** (Pitfall 5). Recommendation: leave it bright (it's a gameplay affordance) unless the night screenshot audit says it dominates — then gate it by the day/night factor via a shared uniform. Flag for the night-readability playtest.

## Environment Availability

No external tools/services/runtimes beyond the already-installed stack (`three`, `spacetimedb@2.6.1`, `vitest@3.2.4`, `vite`). Purely client code/config. No fallback design needed.

## Validation Architecture

> `workflow.nyquist_validation: true` (`.planning/config.json:24`).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.2.4 |
| Config file | `package.json` script `"test": "vitest run"` (:12) |
| Quick run command | `pnpm exec vitest run src/game/systems/__tests__/dayNightMath.test.ts` |
| Full suite command | `pnpm test` (`vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DAYNITE-01 | 20-min day-weighted phase; smoothstep keyframe blend | unit | `pnpm exec vitest run …/dayNightMath.test.ts` | ❌ Wave 0 |
| DAYNITE-02 | `phase01` bigint-modulo-before-Number; precision at ~1.78e15 micros; wraparound continuity | unit | same | ❌ Wave 0 |
| DAYNITE-03 | night intensity ≥ ~45% day floor at every night-band phase | unit (assert floor) | same | ❌ Wave 0 |
| DAYNITE-04 | `lanternLevel` = 0 in day band, 1 in night band, ramps in dusk/dawn | unit | same | ❌ Wave 0 |
| ATMO-02 | fog.color === sky bottomColor (same reference) | integration/manual | side-by-side visual; assert shared reference in a wiring test | ❌ Wave 0 |
| ATMO-01/03 | telegraph/enemy contrast preserved at night; edge dissolves | manual-only | two-client night playtest + edge-pan screenshot | manual |
| DAYNITE-02 (sync) | two LAN clients show same sky within 1s; joiner spawns into night | manual-only | two-client side-by-side | manual |

### Sampling Rate
- **Per task commit:** `pnpm exec vitest run src/game/systems/__tests__/dayNightMath.test.ts`
- **Per wave merge:** `pnpm test` (full suite)
- **Phase gate:** full suite green + one real-time full-cycle soak (not time-scaled) + two-client night readability playtest before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/game/systems/__tests__/dayNightMath.test.ts` — covers DAYNITE-01/02/03/04 (mirror `windMath.test.ts` structure). Cases: phase wraparound (0.99→0.01 continuity), modulo precision at large micros, night-floor assertion, `lanternLevel`/`fireflyLevel` band boundaries, keyframe-exact values, smoothstep monotonicity.
- Framework already installed — no setup task.

## Security Domain

> `security_enforcement: true` (`.planning/config.json:46`). This is a **client-only cosmetic** phase — no new server surface (zero publish).

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | minimal | `?nodaynight` / debug time-scale read via `URLSearchParams` — cosmetic only, no injection surface |
| V6 Cryptography | no | — |
| Others (V2/V3/V4) | no | No auth/session/access-control touched |

**Threat note (the one that matters):** the day/night phase is **client-computed → spoofable**. It MUST remain 100% cosmetic. Never let it gate anything gameplay-relevant (spawns, drops, damage, access). Any future time-gated gameplay must come from a server reducer, not this client clock (PITFALLS.md security row). Debug knobs (time-scale) gate behind the existing local-only `debug_*` convention so they can't desync LAN play in prod.

## Sources

### Primary (HIGH confidence — direct reads, 2026-07-14)
- `node_modules/spacetimedb/dist/sdk/{event_context,event,reducer_event}.d.ts` + `lib/timestamp.d.ts` + `sdk/client_table.d.ts` — the **clock verification** (reducer timestamp shape + access path), `spacetimedb@2.6.1`
- `src/hooks/useGameTableBridge.ts` (ctx discarded :30-35,50-61 — the tap point)
- `src/game/systems/createAttackViewClock.ts:65-68` (server-clock anchor estimator to reuse)
- `src/game/systems/createWind.ts` + `windMath.ts` (Phase 8 sibling-factory + pure-twin precedent)
- `src/game/world/createMondstadtWorld.ts` (lighting :129-153, fog/background :222-223, frozen matrices :456-457, named-light collection :471-481, `setShadowFocus`/sun basis :113-127,535-550, return :484)
- `src/game/world/assets/createCampfire.ts:72-78` (named-PointLight-at-build lantern template)
- `src/game/createGame.ts` (wind/world construction :313-321, frame loop :1320-1383, `?no*` flags :297-325, `Game` interface :138-177)
- `src/game/data/constants.ts:2-3` (`SAFE_ZONE_RADIUS=18`, `WORLD_BOUND=130`)
- `spacetimedb/src/index.ts:268,698-702` (`WORLD_TICK_INTERVAL_MICROS=150_000n`, `world_timer` private/scheduled)
- `src/module_bindings/types.ts` (enemy/goliath schemas — no per-tick `now` column)
- `package.json` (vitest 3.2.4, `test` script)

### Milestone research (HIGH — verified against live code, 2026-07-13)
- `.planning/research/ARCHITECTURE.md` (Patterns 2 & 3, ambience handles, build order), `PITFALLS.md` (Pitfalls 4/5/6/10), `SUMMARY.md`, `FEATURES.md`, `STACK.md`

## Metadata

**Confidence breakdown:**
- Clock source / LAN sync: HIGH — SDK type defs fully confirm the reducer-timestamp shape + access path; one trivial runtime tag-log de-risks the scheduled-broadcast tag (A1)
- Standard stack: HIGH — zero new deps, all seams present in-repo
- Sky/fog single-source technique: HIGH — shared-`Color`-reference contract is mechanically guaranteed
- Keyframe hex/fractions & fog near/far: MEDIUM — explicitly discretion, playtest-tuned (A2)
- Pitfalls: HIGH — re-verified against current code

**Research date:** 2026-07-14
**Valid until:** ~2026-08-14 (stable; the only volatile input is the SpacetimeDB SDK version — re-verify the `EventContext` type path if `spacetimedb` is bumped past 2.6.1)
