# Phase 8: Wind Core - Research

**Researched:** 2026-07-14
**Domain:** Three.js shader/CPU shared-phase wind system (client-only, zero server work)
**Confidence:** HIGH — every integration seam re-verified against live code this session (file:line cited); zero new dependencies; the core formula already ships in the repo

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Gust feel & baseline
- **D-01:** Overall character = **near-still + rare strong gusts** for flags/smoke/canopy
  baseline, BUT **grass keeps today's constant gentle sway unchanged** — gusts layer on
  top. Zero visual regression risk on grass (WIND-01 "unchanged after extraction" honored
  literally, not just for the refactor step).
- **D-02:** Rare strong gusts roll through roughly every **30–60s** (randomized, never
  metronomic).
- **D-03:** Gust wave = **broad slow front**: wide wave (~30–50 world units wavelength)
  crossing the field over ~3–5s. Cinematic Tsushima-style read.
- **D-04:** Peak gust strength = **pronounced lean, not near-flat bow**: grass leans
  clearly (~2–3× base sway amplitude), flags snap taut, smoke visibly kinks. No cartoon
  flattening — combat readability untouched, no glitch-read under pixel filter.

#### Wind direction
- **D-05:** Direction **slowly wanders** — a few degrees per minute. Smoke plume and gust
  travel direction vary over a session; world feels less mechanical.
- **D-06:** Wander derived **deterministically from the wind clock** (summed slow sines —
  no per-frame RNG, no allocs). Cross-client sync NOT required — purely cosmetic.

#### Canopy & flag look
- **D-07:** Canopies = **shader vertex sway** (grass-pattern `onBeforeCompile` patch,
  shared wind uniform, `customProgramCacheKey`): height-weighted displacement, canopy top
  moves most. GPU-side, zero per-frame CPU, scales to any tree count. NOT the CPU
  whole-canopy rigid tilt.
- **D-08:** Flags/banners = **cloth ripple**: shader flap with phase gradient along flag
  length — free end whips more, wave travels down the cloth. Needs subdivided flag
  geometry. Flags flap faster than grass (WIND-03 per-consumer character).

#### Smoke columns
- **D-09:** Art style = **chunky voxel puffs** — small square/cube-ish puffs with stepped
  size+opacity as they rise. Matches voxel ambiance art; avoids soft-alpha banding under
  the nearest-filtered pixel target.
- **D-10:** Scale = **thin wisp**: ~8–12 puffs per fire, modest height. Ambient detail
  noticed second, not first.
- **D-11:** Smoke is **radius-culled**: updates+renders only within ~40–60 units of the
  player; pool reused across nearby fires. Flattest frame cost.

#### Debug / bisect flags
- **D-12:** TWO flags: `?nowind` zeroes ALL sway (grass gusts, flags, canopy, smoke
  drift — grass base sway may remain per its unchanged-look contract); `?nosmoke` removes
  smoke objects entirely. Smoke is the phase's only new draw-call source — separate switch
  = clean FPS bisect.

#### Performance (user-stated constraint, applies to every decision above)
- **D-13:** **FPS-aware, consistent frame cost** — no spikes. Prefer GPU/shader paths over
  per-frame CPU matrix work, fixed pools, no per-frame allocs, frozen-matrix rules
  respected. This constraint drove D-07 (shader canopy), D-10/D-11 (thin culled smoke).

### Claude's Discretion
- Exact gust peak amplitude, gust interval distribution, wavelength, wander rate —
  playtest-tuned constants in `windMath.ts` (exported, single source of truth).
- Whether grass sway *direction* follows the wander or keeps its current fixed axis with
  only gust-travel direction wandering — pick whichever avoids visible grass regression.
- Flag geometry subdivision count, smoke puff pool size, exact cull radius.
- Gust envelope API shape exposed for Phase 10 audio sidechain (0–1 envelope value
  expected; design the contract now, consume later).

### Deferred Ideas (OUT OF SCOPE)
Six pending todos keyword-matched Phase 8; ALL judged false positives (generic keywords
"phase/milestone/system") and none folded:
- `2026-07-08-phase-6-raid-boss-DEFERRED.md` — combat milestone material
- `2026-07-08-phase-7-role-enforcement-balance-DEFERRED.md` — combat milestone material
- `2026-07-13-phase-7-crit-poise-interrupt-DEFERRED.md` — combat milestone material
- `2026-07-07-ciena-star-restyle.md` — UI backlog
- `2026-07-07-boost-orbit-v2-paths-shapes.md` — game FX backlog
- `2026-07-08-miss-evasion-system-decision-accuracy-vs-evasion-vs-none.md` — needs its own
  user ruling, combat scope

No new scope-creep ideas surfaced.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WIND-01 | Grass, camp flags/banners, tree canopies, and campfire smoke all sway from ONE shared wind module (direction, strength, time, gust envelope) — grass rendering unchanged after the `uTime` extraction | Pattern 1 (single wind module, uniform-by-reference), Pattern 2 (grass extraction — exact code at `createGrassField.ts:147,184-186` verified), Pattern 4 (canopy patch), Pattern 5 (flag asset), Pattern 6 (smoke pool). Pitfall 1 (clock fragmentation) + Pitfall 2 (grass regression). |
| WIND-02 | Gusts visibly TRAVEL across the field (spatial phase offset by `dot(worldPos, windDir)/gustWavelength`), not the whole world bowing in unison | Pattern 3 (gust envelope + retarded-time traveling front, deterministic non-metronomic math). Code Example "Gust envelope". Unit-testable in `windMath.ts`. |
| WIND-03 | Each consumer keeps its own character on the shared phase — flags flap faster, smoke drifts laterally as it rises, canopies sway low-amplitude/low-frequency | Per-consumer constants table in Pattern 1; Patterns 4–6 give each consumer its own frequency/amplitude constants while reading the SAME `timeUniform`/`directionUniform`/gust front. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Directives that bind this phase's plans:

- **≤300 LOC of functional code per file** — every new module (`createWind.ts`, `windMath.ts`, `createSmokeColumns.ts`, `createCampFlag.ts`) is a sibling module; `createGame.ts` (1,963 LOC) and `createMondstadtWorld.ts` (494 LOC) gain only wiring/placement lines.
- **No legacy/dead code** — the grass field's private `timeUniform` accumulator (`createGrassField.ts:147,184-186`) is DELETED in the same change that adds `createWind`; never two clocks.
- **Client performance rules** — no per-frame allocs (module-level scratch objects), pooled materials, frozen-matrix rules respected, game-loop-owned clocks (never React). The 144→20fps regression class is the guarded history.
- **pnpm only** (`pnpm add` — npm crashes on the symlink layout). Not needed this phase: zero new deps.
- **Client visual-only change → just `pnpm build`** — no SpacetimeDB publish, no binding regen. This entire phase is that category.
- **Unbounded-growth structures are frame-cost time bombs** — the smoke pool is FIXED size, reused across fires (D-11 already encodes this).

## Summary

Phase 8 is an extraction-plus-fanout: the wind formula already exists and works in the grass vertex shader (`createGrassField.ts:120-122` — two-octave sine sway with world-position phase offset, verified this session). The phase (1) lifts the clock and constants out into a shared `createWind.ts`/`windMath.ts` pair, (2) layers a deterministic traveling gust front on top, and (3) adds three new consumers — camp flag assets (new, none exist today), canopy sway (shader patch on existing `createCanopyTree` caps), and campfire smoke columns (new instanced pool; campfires exist at every camp with a named-light collection pattern to mirror).

All hard architectural questions were settled in the milestone research (verified file:line) and by user decisions in CONTEXT.md. What phase-level research adds: (a) fresh verification that every cited seam still matches the live code — all confirmed, including the exact GLSL, the `?no*` flag site (`createGame.ts:295-317`), the frozen-matrix rule and windmill-blades mover pattern (`createMondstadtWorld.ts:427-446`), and the campfire named-light pattern (`createCampfire.ts:12,72-78`); (b) concrete deterministic gust/wander math that satisfies D-02/D-03/D-06 (product-of-incommensurate-sines envelope, retarded-time front); (c) two implementation facts the milestone research missed: `lambert()` allocates a NEW material per call (`assetHelpers.ts:4-6`) so canopy patching requires a small material-pooling refactor, and shadow depth passes do not include `onBeforeCompile` surface patches, so swaying canopies cast static shadows (acceptable at D-07's low amplitude, but the plan should state it).

**Primary recommendation:** Build `windMath.ts` (pure, zero-import, test-first) → `createWind.ts` (uniform objects + `update()` + `sampleWind`/gust API) → refactor grass to consume it with bit-identical constants → then fan out to canopy patch, flag asset, smoke pool — each with its own character constants but the SAME uniform objects. All sway is uniform-driven (never define-driven) so `?nowind` cannot trigger recompiles.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Wind clock + gust envelope + direction wander | Client game loop (`createWind.update` in `frame()`) | — | One clock, advanced once per frame with the clamped delta; Pitfall 1 forbids per-system clocks |
| Grass / canopy / flag sway | GPU vertex shader (patched Lambert) | — | D-07/D-13: zero per-frame CPU, scales with count, sidesteps frozen-matrix rule |
| Smoke puff motion | Client CPU (instanced pool, ≤~48 instances) | GPU renders one InstancedMesh | Puffs need lifecycle state (spawn/rise/recycle) — CPU with scratch objects; D-11 radius cull keeps cost flat |
| Bisect flags `?nowind`/`?nosmoke` | Client bootstrap (`createGame.ts` perfFlags) | — | Existing convention at :295-317 |
| Cross-client wind sync | NONE — explicitly not required (D-06) | — | Purely cosmetic; no server tier involvement anywhere in this phase |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| three | ^0.185.1 (installed) | `onBeforeCompile` shader patching, InstancedMesh smoke pool, uniform objects | Already the renderer; milestone ruling: zero new deps [VERIFIED: package.json + node_modules, this session] |
| vitest | 3.2.4 (installed) | `windMath.test.ts` pure-helper tests | Existing test runner; `pnpm test` = `vitest run` [VERIFIED: package.json] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| — | — | — | Nothing else. No noise package (summed sines suffice per D-06); no tween lib. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Summed/product sines for gust timing | `three/addons/math/SimplexNoise` | Noise gives richer irregularity but needs an instance + is harder to mirror in GLSL 1:1; sines are trivially identical in JS and GLSL and unit-testable. Use sines. |
| Uniform-driven `?nowind` | `#define`-driven kill switch | Defines change the program hash → recompile on toggle and a second program variant. Uniforms are free. Use uniforms. |
| Per-instance smoke opacity (transparent material) | Opaque puffs color-faded toward fog/sky color + scale steps | Transparency needs sorting and bands under the nearest-filtered pixel target (D-09 explicitly avoids soft alpha). Use opaque color-fade + shrink. |

**Installation:** none — `pnpm install` state is already sufficient.

## Package Legitimacy Audit

No external packages are installed by this phase. Zero new dependencies is a locked milestone decision (STATE.md, verified against `package.json` this session).

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                     createGame.ts frame(deltaSeconds)            (:1304-1362)
                     ────────────────────────────────
   perfFlags (?nowind/?nosmoke) ─┐
                                 ▼
        ┌─────────────── createWind.update(dt) ── NEW, called before world.update
        │  windMath.ts constants (single source of truth, unit-tested)
        │  owns: timeUniform{value}  directionUniform{value:Vector2}
        │        strengthUniform{value: 0|1}   gustEnvelope(t) 0..1
        │
        │ shared BY REFERENCE (uniform objects)          CPU API
        ▼                                                  ▼
  ┌───────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐
  │ grass shader  │  │ canopy patch │  │ flag shader  │  │ createSmokeColumns │
  │ (existing,    │  │ (NEW patch on│  │ (NEW asset,  │  │ (NEW system:       │
  │  refactored:  │  │  pooled cap  │  │  subdivided  │  │  1 InstancedMesh,  │
  │  uTime now =  │  │  materials)  │  │  cloth plane)│  │  ~48 puffs, radius │
  │  wind clock,  │  │ low-amp/low- │  │ fast flap,   │  │  -culled to fires  │
  │  + gust term) │  │ freq + gust  │  │ phase along  │  │  ≤~50u from player;│
  │               │  │              │  │ cloth length │  │  drift=sampleWind) │
  └──────┬────────┘  └──────┬───────┘  └──────┬───────┘  └─────────┬──────────┘
         │  GPU vertex sway — no CPU, no matrix updates            │ CPU writes
         ▼                   ▼                ▼                    ▼ instanceMatrix
       one coherent, traveling gust front:  env(t − dot(pos.xz, windDir)/gustSpeed)
                                                                   │
   Phase 10 (audio sidechain) ◄── wind.getGustEnvelope(): 0..1  ◄──┘ (contract only,
   Phase 12 (butterflies)     ◄── wind.sampleWind(x,z)               no consumer now)
```

Trace WIND-02: `frame()` advances the wind clock → each shader evaluates the gust envelope at retarded time `t − proj/gustSpeed` → blades farther along the wind direction peak later → the gust front visibly crosses the field.

### Recommended Project Structure

```
src/game/
├── systems/
│   ├── windMath.ts              # NEW pure helper (ZERO imports): constants + sampleWind +
│   │                            #   gustEnvelope + windAngle; GLSL snippets template-built
│   │                            #   from the SAME exported constants
│   ├── createWind.ts            # NEW ~60-80 LOC: uniform objects, update(dt), CPU API
│   ├── createSmokeColumns.ts    # NEW ~120-150 LOC: instanced puff pool over campfires
│   └── __tests__/windMath.test.ts  # NEW (Wave 0): envelope bounds, peak cadence, wander rate,
│                                #   traveling-front invariance, strength=0 kill
├── world/
│   ├── createGrassField.ts      # MOD: delete local timeUniform (:147,:184-186); accept wind
│   │                            #   uniforms via options; add gust term to sway GLSL (:120-122)
│   ├── createMondstadtWorld.ts  # MOD: accept wind in options; place flags in the camp loop
│   │                            #   (:399-419); pass wind to canopy/flag creators (~15 lines)
│   └── assets/
│       ├── createCanopyTree.ts  # MOD: pooled wind-patched cap materials (see Pattern 4)
│       └── createCampFlag.ts    # NEW ~80-100 LOC: pole + subdivided cloth, wind flap patch
└── createGame.ts                # MOD: construct wind BEFORE createMondstadtWorld (:306);
                                 #   wind.update(dt) in frame(); ?nowind/?nosmoke at :297;
                                 #   construct smoke system (unless ?nosmoke); ~12 lines net
```

### Pattern 1: One wind module, uniform objects shared by reference

**What:** `createWind.ts` owns the ONLY clock and exposes uniform OBJECTS (never values):

```typescript
export interface Wind {
  timeUniform: { value: number };              // the shared uTime
  directionUniform: { value: THREE.Vector2 };  // normalized gust-travel dir (wanders)
  strengthUniform: { value: number };          // 1 normally; 0 under ?nowind
  update(deltaSeconds: number): void;          // advance clock, wander direction (in place)
  sampleWind(x: number, z: number): number;    // JS mirror of the grass sway scalar
  sampleGust(x: number, z: number): number;    // 0..1 local gust front value (smoke kick)
  getGustEnvelope(): number;                   // 0..1 global envelope — Phase 10 contract
}
```

Same contract as `groundInfluence.textureUniform` (documented at `createGroundInfluence.ts:23-25` [VERIFIED this session]): consumers hold the object; `update()` mutates `.value` in place (`directionUniform.value.set(x, z)` — no allocs).

**Per-consumer character (WIND-03) — each consumer owns only its amplitude/frequency constants, all in `windMath.ts`:**

| Consumer | Base motion | Gust response | Frequency vs grass |
|----------|------------|---------------|--------------------|
| Grass | UNCHANGED today's formula (D-01) | amplitude ×(1 + GUST_GAIN·gust), ~2–3× at peak (D-04) | 1× (reference) |
| Canopy | near-still, tiny idle sway | low-amplitude lean, low-frequency (D-07) | ~0.3–0.5× |
| Flags | gentle ripple | snap taut, whip at free end (D-04/D-08) | ~2–3× |
| Smoke | rise + slight lateral drift | visible kink downwind (D-04) | CPU: drift = k·sampleWind + gust kick |

**When to use:** everything that sways, this phase and later (Phase 10 audio, Phase 12 butterflies consume the same API — design now, consume later).

### Pattern 2: Grass extraction with bit-identical constants (WIND-01 "unchanged")

**What:** the live grass shader [VERIFIED `createGrassField.ts:113-134` this session]:

```glsl
float sway = sin(uTime * 1.7 + bladeOrigin.x * 0.35 + bladeOrigin.z * 0.25)
           + 0.4 * sin(uTime * 3.3 + bladeOrigin.z * 0.7);
transformed.xz += vec2(0.85, 0.55) * sway * 0.09 * heightFactor;
```

The refactor: `createGrassField(options)` gains `wind` (the uniform objects); `shader.uniforms.uTime = timeUniform` at :95 becomes `= options.wind.timeUniform`; the local `const timeUniform = { value: 0 }` (:147) and `update()`'s `timeUniform.value += deltaSeconds` (:184-186) are DELETED (grass `update()` becomes a no-op → delete the method and its call in `createMondstadtWorld.ts:447` per the no-legacy rule, or keep `update` only if anything else remains). Constants `1.7 / 0.35 / 0.25 / 3.3 / 0.7 / 0.4 / 0.85 / 0.55 / 0.09` move to `windMath.ts` and are template-interpolated into the GLSL exactly like `${(1 / BLADE_HEIGHT).toFixed(4)}` already is at :118.

**Gust layering (keeps base sway untouched per D-01):**

```glsl
float gust = /* envelope at retarded time, see Pattern 3 */;
transformed.xz += vec2(0.85, 0.55) * sway * 0.09 * heightFactor
                * (1.0 + uWindStrength * ${GUST_GAIN} * gust);
```

With `gust = 0` between events (the envelope rests at 0), rendering is arithmetically identical to today. Grass keeps its current fixed sway axis `vec2(0.85, 0.55)`; only the gust TRAVEL direction wanders (`uWindDir`) — this is the zero-regression option CONTEXT leaves to discretion, and it means the base formula needs no direction input at all.

**Wiring order in createGame:** `createWind` must be constructed BEFORE `createMondstadtWorld` (world built at `createGame.ts:306` [VERIFIED]); wind uniforms travel via `MondstadtWorldOptions` → `createGrassField` options.

### Pattern 3: Deterministic, non-metronomic gust envelope + traveling front (WIND-02)

**What:** all gust state is a pure function of the wind clock — no per-frame RNG, no allocs, no event scheduling (D-06). Two pieces:

**(a) Envelope — rare peaks from a product of incommensurate slow sines:**

```typescript
// windMath.ts — every constant exported, playtest-tunable
export const GUST = {
  // Incommensurate periods (~37s, ~23s, ~53s): peaks coincide irregularly,
  // roughly every 30-60s, never metronomic. Tune by running gustPeakCadence test.
  w1: (2 * Math.PI) / 37.0,
  w2: (2 * Math.PI) / 23.0,
  w3: (2 * Math.PI) / 53.0,
  sharpness: 3.0,   // higher = rarer, sharper peaks
  gain: 1.6,        // peak amplitude multiplier ≈ 1+gain ≈ 2.6× base sway (D-04)
  speed: 12.0,      // front travel, world units/s (~50u field in ~4s, D-03)
  wavelength: 40.0, // front width in world units (D-03: 30-50u)
};
export function gustEnvelope(t: number): number {
  const raw = Math.sin(t * GUST.w1) * Math.sin(t * GUST.w2) * Math.sin(t * GUST.w3);
  return Math.pow(Math.max(0, raw), GUST.sharpness); // 0..1, mostly ~0
}
```

The same three-sine product transliterates to GLSL 1:1 (`pow(max(0.0, ...), S)`), generated from the SAME constants via template interpolation — single source of truth, unit-testable peak cadence (simulate an hour, assert inter-peak gaps ∈ ~[25, 75]s and mean ≈ 30–60s).

**(b) Traveling front — evaluate the envelope at retarded time:**

```
proj  = dot(worldPos.xz, windDir)               // windDir = directionUniform (normalized)
gust  = gustEnvelope(t − proj / GUST.speed)     // far-downwind points peak LATER
```

This is the REQUIREMENTS formula (`dot(worldPos, windDir)/gustWavelength` as the spatial phase term) expressed as a moving wave: the front's spatial width = envelope peak duration × speed ≈ wavelength; expose `wavelength` and derive the effective peak-duration/sharpness relationship in `windMath.ts` so tuning one constant keeps D-03 honest. Verifiable property (unit test): `gustAt(pos + dir·speed·dt, t + dt) === gustAt(pos, t)` — the wave translates rigidly.

**(c) Direction wander (D-05/D-06) — summed slow sines on the angle:**

```typescript
export const WANDER = { base: 0.6 /*rad*/, a1: 0.20, w1: (2*Math.PI)/170, a2: 0.12, w2: (2*Math.PI)/311 };
export function windAngle(t: number): number {
  return WANDER.base + WANDER.a1 * Math.sin(t * WANDER.w1) + WANDER.a2 * Math.sin(t * WANDER.w2);
}
```

Max wander rate = `a1·w1 + a2·w2` rad/s ≈ tune to "a few degrees per minute" (unit test asserts the bound). `createWind.update()` writes `directionUniform.value.set(cos θ, sin θ)` in place.

**`getGustEnvelope()` (Phase 10 contract):** return `gustEnvelope(timeUniform.value)` — the un-retarded global envelope, 0..1. Audio doesn't care about spatial position; document that in the interface now.

### Pattern 4: Canopy sway — shader patch on POOLED cap materials (D-07)

**What:** `createCanopyTree.ts` [VERIFIED this session] builds 2–3 icosahedron caps per tree via `lambert(color)` — and `lambert()` allocates a NEW `MeshLambertMaterial` per call (`assetHelpers.ts:4-6`). 8 trees × ~2–3 caps ≈ 16–24 separate materials today. The patch refactor must POOL: one module-level patched material per canopy color (4 colors: orange, deep orange, green, light green), created lazily with the wind uniforms, `customProgramCacheKey = 'canopySway'` (distinct from `'grassField'` — collision = wrong shader served from cache). This is also a small win under the "pool materials" memory rule; delete the per-cap `lambert()` calls in the same change.

**Height weighting with non-instanced meshes:** caps are plain Meshes positioned via the (frozen) world matrix, so the vertex stage sees geometry-local `position` (icosahedron centered on the cap origin) — local `position.y` alone can't express "canopy top moves most" across stacked caps. Use world height:

```glsl
// begin_vertex patch on the pooled canopy material
vec3 transformed = vec3(position);
vec4 canopyWorld = modelMatrix * vec4(position, 1.0);
float heightWeight = clamp((canopyWorld.y - ${SWAY_BASE_Y}) * ${INV_SWAY_SPAN}, 0.0, 1.0);
float proj = dot(canopyWorld.xz, uWindDir);
float gust = /* shared envelope snippet, retarded time */;
float lean = sin(uTime * ${CANOPY_FREQ} + proj * ${CANOPY_PHASE}) * ${CANOPY_IDLE_AMP};
transformed.xz += uWindDir * (lean + gust * ${CANOPY_GUST_AMP}) * heightWeight * uWindStrength;
```

Trees stand 5–7u tall with caps from ~2.5u up ([VERIFIED `createCanopyTree.ts:13-31`]); `SWAY_BASE_Y ≈ 2.0`, span ≈ 5.0 works for all of them. Trunks stay unpatched (rigid). `modelMatrix` is valid under the frozen-matrix rule — matrices are computed once at build and never change; the sway is purely in-shader.

**Known limitation to state in the plan:** the shadow depth pass uses the material's depth variant, which does NOT carry `onBeforeCompile` surface patches — canopy shadows will not sway. At D-07's low amplitude this is invisible; do NOT add `customDepthMaterial` (cost without visible payoff).

**GLSL literal trap:** every JS number interpolated into GLSL must format as a float (`toFixed(4)` — the grass patch at :118 is the template). `2` interpolated raw is an int and breaks the shader.

### Pattern 5: Camp flags — NEW asset with cloth-ripple vertex patch (D-08)

**What:** no flag/banner asset exists today ([VERIFIED: `src/game/world/assets/` listing — teepees/totems/spikes/arches only]). New `createCampFlag.ts` following the asset factory convention (`(random: SeededRandom) => WorldAsset` + wind uniforms): a thin pole (cylinder, Lambert, small `obstacles` entry optional) + a subdivided cloth `PlaneGeometry(width, height, ~8, ~3)` whose x=0 edge is at the pole (fixed) and free end at x=width.

```glsl
// cloth vertex patch, cacheKey 'campFlag'
float along = position.x * ${INV_FLAG_LENGTH};          // 0 at pole → 1 at free end
vec4 flagWorld = modelMatrix * vec4(position, 1.0);
float gust = /* shared envelope snippet, retarded time (world pos of the flag) */;
float flap = sin(uTime * ${FLAG_FREQ} - along * ${FLAG_WAVE_K}) // wave travels down the cloth
           * along * along                                       // free end whips more
           * (${FLAG_IDLE_AMP} + gust * ${FLAG_GUST_AMP});
transformed.z += flap * uWindStrength;
transformed.x -= abs(flap) * ${FLAG_TAUT_PULL} * along;          // cloth shortens as it lifts
```

`FLAG_FREQ` ≈ 2–3× grass frequency (WIND-03). Material: `MeshLambertMaterial({ side: THREE.DoubleSide })` — a vertical cloth's flipped backface normal reads acceptably here (unlike grass, which needed the up-normal hack because blades shade as ground); check visually and only borrow the grass normal trick if the back face reads black. `castShadow = false` (swaying shadow can't follow the patch anyway). One pooled cloth material for all flags, `customProgramCacheKey = 'campFlag'`.

**Placement:** in the existing camp decoration loop (`createMondstadtWorld.ts:399-419` [VERIFIED]) — `placeAroundCamp(createCampFlag(campRandom, wind), ~5.5)`, one or two per camp, matching the seeded-random convention. Flags orient by build-time rotation (static); the CLOTH answers the wind in-shader, so the frozen-matrix rule is never touched.

### Pattern 6: Smoke columns — fixed instanced pool, radius-culled, opaque stepped puffs (D-09/D-10/D-11)

**What:** NEW `createSmokeColumns.ts` sibling system (constructed in `createGame.ts`, `update(dt, playerX, playerZ)` in `frame()` — NOT inside `createMondstadtWorld`, which is at 494 LOC and should only gain placement lines).

- **Fire anchors:** `getCampSites()` (`camps.ts:29` [VERIFIED]) + `world.getGroundHeight(x, z)` once at construction — positions are static. Emitter top ≈ ground + 1.0 (flame top, `createCampfire.ts:65-70`).
- **Pool:** ONE `InstancedMesh(BoxGeometry(1,1,1), material, POOL_SIZE)` with `POOL_SIZE ≈ 4 fires × 12 puffs = 48` (discretion: tune). `instanceMatrix.setUsage(THREE.DynamicDrawUsage)`; `frustumCulled = false` (world-space matrices would need a manual bounding sphere; at ≤48 boxes the cull test isn't worth it); `castShadow = false; receiveShadow = false`. Added to the SCENE root at identity — never inside the frozen `world.group`, so no `updateMatrixWorld` bookkeeping at all.
- **Material:** `MeshLambertMaterial` (NOT Basic — Phase 9's day/night dims only lit materials; a Basic smoke column would glow at night, the Pitfall-5 class). Opaque. "Stepped size+opacity" (D-09) = discrete scale tiers as the puff ages + `setColorAt` fading the gray toward the fog/sky color (`0x8ecae6`) in 3–4 hard steps — reads as dissolution under the pixel filter with zero transparency sorting.
- **Per-frame update:** only fires within `CULL_RADIUS ≈ 50u` of the player get active puffs (recheck membership at ~2Hz, not per frame); each active puff: `y += riseSpeed·dt`, `xz += windDir · (drift + gustKick·sampleGust(x,z)) · dt · uWindStrength-equivalent` (CPU mirrors read `wind` directly), recycle at max height. Compose matrices with module-level scratch `Matrix4/Vector3/Quaternion/Color` — zero per-frame allocs. Spawn cadence ~0.5–1s per fire, staggered by fire index.
- **`?nosmoke`:** skip construction entirely (the flag convention at `createGame.ts:297`); `?nowind`: puffs still rise, lateral drift × 0.

### Anti-Patterns to Avoid

- **A second clock anywhere** (Pitfall 10, milestone research): every accumulator except `createWind`'s is a bug. Grass's dies in the same commit; smoke/flag/canopy read the wind clock.
- **Define-driven toggles:** `?nowind` must be a uniform (`strengthUniform.value = 0`), never a shader `#define` — defines fork the program cache and recompile.
- **New materials per asset instance:** pool the patched canopy/flag/smoke materials at module level; `lambert()`-per-cap dies in the canopy refactor.
- **Smoke as transparent sprites:** alpha banding under the nearest-filtered pixel target (D-09 explicitly rejects); opaque color-fade instead.
- **Growing `createGame.ts`/`createMondstadtWorld.ts`:** wiring lines only; logic lives in the new siblings.
- **Caching `directionUniform.value` components:** hold the uniform object; the Vector2 is mutated in place每 frame — same contract as the influence texture uniform.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Wind irregularity | A noise library / fluid sim / vorticles | Product of 3 incommensurate sines (Pattern 3) | Out-of-scope table explicitly rejects fluid sim ("weeks of work, invisible at this camera"); sines are deterministic, alloc-free, GLSL-mirrorable, testable |
| Shader-patched Lambert plumbing | A custom ShaderMaterial for canopy/flags | `onBeforeCompile` + `customProgramCacheKey` (grass pattern, `createGrassField.ts:66-138`) | Built-ins keep fog/shadow/lighting chunks for free — a raw ShaderMaterial would break Phase 9's fog (milestone Pitfall 4 note) |
| CPU sway inside frozen world | Manual matrix mover per flag/canopy | In-shader vertex displacement | D-07/D-08 chose shader paths precisely to sidestep the frozen-matrix bookkeeping; the windmill-blades mover pattern (`createMondstadtWorld.ts:443-446`) stays a last resort |
| Smoke particle system | A general particle engine | One InstancedMesh + fixed pool + scratch objects | Matches debris/effect system conventions; a general engine is scope creep with per-frame alloc risk |

**Key insight:** every "buy" here is already in the repo — this phase is pattern reuse, not invention.

## Runtime State Inventory

This phase refactors the grass clock and adds client render code. Verified per category:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no database/table touches; client-only (verified: no reducer/schema changes in scope) | none |
| Live service config | None — no SpacetimeDB publish, no bindings regen needed | none |
| OS-registered state | None | none |
| Secrets/env vars | None — `.env.local` only affects the localhost socket host, untouched | none |
| Build artifacts | `dist/` goes stale after the change — `pnpm build` redeploys (laragon serves `dist/`) | rebuild at phase close |

## Common Pitfalls

### Pitfall 1: Clock fragmentation ("one coherent wind" as N private clocks)
**What goes wrong:** each consumer keeps its own `+= dt` accumulator; they drift on tab refocus/clamped deltas and the phase's headline promise silently dies.
**Why it happens:** copy-paste from the grass implementation.
**How to avoid:** `createWind` owns the ONLY accumulator; grass's local `timeUniform` (:147) and its `update()` increment (:184-186) are deleted in the SAME change. Smoke/flags/canopy never see a raw delta for phase purposes.
**Warning signs:** flags peaking while adjacent grass rests; desync appearing only after alt-tab.

### Pitfall 2: Grass visual regression during extraction
**What goes wrong:** WIND-01 demands "grass rendering unchanged" — a subtly different constant, a float formatted as an int in GLSL, or a changed sway axis reads as regression.
**Why it happens:** constants move files; template interpolation formats numbers.
**How to avoid:** move constants verbatim (`1.7, 0.35, 0.25, 3.3, 0.7, 0.4, 0.85, 0.55, 0.09`); interpolate with `.toFixed(4)`; gust term multiplies by `(1.0 + …·gust)` where the envelope RESTS AT 0; keep grass's fixed sway axis (only gust travel direction wanders). Verify: `?nowind` side-by-side vs pre-change build, plus a between-gusts eyeball.
**Warning signs:** grass "feels different" reports; sway axis visibly rotated.

### Pitfall 3: `customProgramCacheKey` collisions across patched variants
**What goes wrong:** the new canopy/flag patches on `MeshLambertMaterial` collide with grass's `'grassField'` key (or with each other) → three serves the wrong compiled program to one of them.
**How to avoid:** distinct keys: `'grassField'` (exists), `'canopySway'`, `'campFlag'`. Integration gotcha documented in milestone PITFALLS.md; grass sets the precedent at `createGrassField.ts:137`.
**Warning signs:** canopies rendering with grass scorch/bend logic, or vice versa.

### Pitfall 4: Toggle/tuning path triggers recompiles or per-frame allocs
**What goes wrong:** `?nowind` as a define, direction as a re-created Vector2, gust constants as per-frame uniforms objects — recompile hitches or GC sawtooth.
**How to avoid:** strength/direction are uniforms mutated in place; constants are compile-time template interpolations (they only change at build). `renderer.info.programs.length` must be constant across a session with wind on.
**Warning signs:** hitch when toggling flags; program count growing.

### Pitfall 5: Smoke pool violates instancing rules
**What goes wrong:** default frustum culling (origin bounding sphere) blinks the column out; static buffer usage respecifies per frame; Basic material glows at night (Phase 9); transparent puffs band under the pixel filter.
**How to avoid:** `frustumCulled = false`, `DynamicDrawUsage` on instanceMatrix AND instanceColor, Lambert opaque, color-fade toward `0x8ecae6`, `castShadow=false`. Scratch objects only.
**Warning signs:** smoke vanishing when panning; GC spikes with smoke on.

### Pitfall 6: Swaying mesh, static shadow (depth pass ignores surface patches)
**What goes wrong:** canopy/flag shadows don't move with the sway — noticeable if amplitude is cranked.
**How to avoid:** accept at D-07/D-08 amplitudes (state in the plan); flags/smoke `castShadow=false`; don't add customDepthMaterial.
**Warning signs:** a reviewer files "shadow doesn't match tree" — that's the accepted trade, not a bug.

### Pitfall 7: Non-metronomic requirement quietly failed
**What goes wrong:** a single-sine envelope or fixed 45s modulo makes gusts a metronome — the D-02 anti-goal (mirrors the milestone's fixed-interval-chirp ban).
**How to avoid:** product of ≥3 incommensurate sines; unit test asserts inter-peak gap variance over a simulated hour (gaps must not all be equal, mean within 30–60s).
**Warning signs:** players can predict the next gust; test shows uniform gaps.

## Code Examples

Verified patterns from the live codebase:

### Uniform injection into a patched built-in (grass — the template for canopy/flags)
```typescript
// src/game/world/createGrassField.ts:95-99 [VERIFIED this session]
shader.uniforms.uTime = timeUniform;                       // ← becomes wind.timeUniform
shader.uniforms.uInfluenceMap = influence.textureUniform;  // uniform OBJECT by reference
// :137 — distinct program cache key per patched variant
material.customProgramCacheKey = () => 'grassField';
// :118 — constants interpolated into GLSL as formatted floats
`float heightFactor = position.y * ${(1 / BLADE_HEIGHT).toFixed(4)};`
```

### Bisect flag convention
```typescript
// src/game/createGame.ts:295-317 [VERIFIED this session]
const perfFlags = new URLSearchParams(window.location.search);
if (perfFlags.has('noshadow')) pixelRenderer.renderer.shadowMap.enabled = false;
// ...
bladeCount: perfFlags.has('nograss') ? 0 : quality.grassBladeCount,
// Phase 8 adds: const windEnabled = !perfFlags.has('nowind');
//               const smokeEnabled = !perfFlags.has('nosmoke');
```

### Named-object collection inside the frozen world (campfire lights — smoke anchors mirror this idea)
```typescript
// src/game/world/createMondstadtWorld.ts:433-437 [VERIFIED this session]
const campfireLights: THREE.PointLight[] = [];
group.traverse(node => {
  if (node.name === CAMPFIRE_LIGHT_NAME) campfireLights.push(node as THREE.PointLight);
});
// (Smoke doesn't need traverse — getCampSites() + getGroundHeight gives anchors directly,
//  and the smoke mesh lives at scene root, outside the frozen subtree.)
```

### The sanctioned mover pattern (only if a CPU-swayed branch inside the frozen world is ever unavoidable)
```typescript
// src/game/world/createMondstadtWorld.ts:442-446 [VERIFIED this session]
blades.rotation.z += deltaSeconds * 0.6;
blades.updateMatrixWorld(true); // manual push — the subtree skips auto updates
// D-07/D-08 chose shader sway specifically so Phase 8 never needs this.
```

### windMath pure-helper + GLSL generation (single source of truth)
```typescript
// windMath.ts — zero imports (project pure-helper discipline)
export const SWAY = { f1: 1.7, x1: 0.35, z1: 0.25, f2: 3.3, z2: 0.7, amp2: 0.4,
                      ampX: 0.85, ampZ: 0.55, scale: 0.09 } as const;
export function sampleWind(t: number, x: number, z: number): number {
  return Math.sin(t * SWAY.f1 + x * SWAY.x1 + z * SWAY.z1)
       + SWAY.amp2 * Math.sin(t * SWAY.f2 + z * SWAY.z2);
}
const f = (n: number) => n.toFixed(4); // GLSL float-literal safety
export function swayGlsl(timeExpr: string, xExpr: string, zExpr: string): string {
  return `(sin(${timeExpr} * ${f(SWAY.f1)} + ${xExpr} * ${f(SWAY.x1)} + ${zExpr} * ${f(SWAY.z1)})
        + ${f(SWAY.amp2)} * sin(${timeExpr} * ${f(SWAY.f2)} + ${zExpr} * ${f(SWAY.z2)}))`;
}
// gustEnvelopeGlsl(...) built the same way from GUST constants → grass/canopy/flag
// shaders and the JS mirror can never drift apart.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Grass owns a private wind clock (`createGrassField.ts:147`) | Shared `createWind` module, uniform by reference | This phase | The keystone extraction — 5 later systems consume it (Phases 10, 12) |
| Whole-world uniform sway (single global phase) | Traveling gust front via retarded-time envelope | This phase (Tsushima GDC insight, milestone research) | "Synced sway" becomes visible WIND — the milestone's top value-per-LOC item |
| Per-call `lambert()` materials on canopy caps | Pooled patched materials | This phase (canopy refactor) | Fewer material instances + required for the shared-uniform patch |

**Deprecated/outdated (after this phase):** `grassField.update()`'s clock role — deleted, not kept as a shim (no-legacy rule).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Product-of-3-incommensurate-sines gives inter-peak gaps that read as "roughly every 30–60s, never metronomic" with tunable constants [ASSUMED — standard technique, verified only by unit-test simulation during Wave 0] | Pattern 3 | Low: constants are exported and playtest-tuned (explicit discretion grant); worst case swap in a hash-jittered schedule, still deterministic |
| A2 | DoubleSide Lambert cloth reads acceptably without the grass backface-normal hack [ASSUMED — flags are vertical, unlike ground-shaded grass] | Pattern 5 | Low: if the back face reads black, copy the grass `normal_fragment_begin` replacement (~6 lines) |
| A3 | Static shadows under swaying canopies are invisible at D-07 amplitude [ASSUMED] | Pattern 4 | Low: accepted trade documented in plan; escalation (customDepthMaterial) exists but should not be pre-built |
| A4 | ~48 opaque Lambert cubes updated on CPU per frame is negligible frame cost [ASSUMED — consistent with debris system scale already shipped] | Pattern 6 | Low: `?nosmoke` exists precisely to bisect this; pool size is a discretion constant |

## Open Questions

1. **Does grass `update()` survive at all after extraction?**
   - What we know: its only job today is the clock increment (:184-186).
   - What's unclear: whether removing it simplifies or complicates the `MondstadtWorld.update` call site (:447).
   - Recommendation: delete the method and its call if nothing else lands in it (no-legacy rule); planner decides at task granularity.
2. **One flag or two per camp, and any plaza banners?**
   - What we know: success criteria say "camp flags/banners"; camps get seeded decoration (:399-419).
   - Recommendation: 1 flag per camp minimum for the phase promise; extra plaza banners are Phase 11 (Lived-in Props) territory — don't scope-creep here.
3. **Exact `?nowind` semantics for smoke rise** — D-12 zeroes "smoke drift"; puffs presumably still rise (fire without wind still smokes).
   - Recommendation: `?nowind` → lateral drift and gust kick × 0, vertical rise unchanged; `?nosmoke` for full removal. State it in the plan so verification is unambiguous.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node | build/test | ✓ | v24.15.0 | — |
| pnpm | installs/scripts (repo rule) | ✓ | 11.9.0 | — |
| vitest | windMath tests | ✓ | 3.2.4 (devDep, installed) | — |
| three | everything | ✓ | ^0.185.1 (installed) | — |
| SpacetimeDB server/CLI | NOT required | n/a | — | — (client-only phase, zero publishes) |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.2.4 (jsdom available; pure helpers need no DOM) |
| Config file | none dedicated — vitest picks up `__tests__/*.test.ts` (existing suites in `src/game/systems/__tests__/`, `src/game/world/__tests__/`) |
| Quick run command | `pnpm vitest run src/game/systems/__tests__/windMath.test.ts` |
| Full suite command | `pnpm test` (= `vitest run`); compile gate: `pnpm build` (`tsc -b && vite build`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WIND-01 | Single clock; grass formula constants unchanged; sampleWind mirrors GLSL constants | unit | `pnpm vitest run src/game/systems/__tests__/windMath.test.ts` | ❌ Wave 0 |
| WIND-01 | All consumers compile & render off the shared uniforms | build + manual | `pnpm build` + human playtest (visual coherence, alt-tab desync check) | ✅ (build) / manual |
| WIND-02 | Envelope ∈ [0,1]; peaks non-metronomic, ~30–60s cadence; front translates rigidly (`gust(pos+dir·v·dt, t+dt) === gust(pos,t)`) | unit | same windMath test file | ❌ Wave 0 |
| WIND-03 | Per-consumer constants distinct (flag freq > grass freq > canopy freq); wander rate ≤ bound (deg/min); `strength=0` zeroes gust contribution | unit + manual | same windMath test file + human playtest | ❌ Wave 0 |
| SC4 | `?nowind` kills sway; grass looks unchanged | manual | side-by-side browser check with/without flag | manual-only (visual judgment — justified) |

### Sampling Rate
- **Per task commit:** `pnpm vitest run src/game/systems/__tests__/windMath.test.ts` (< 5s)
- **Per wave merge:** `pnpm test && pnpm build`
- **Phase gate:** full suite green + `?nowind`/`?nosmoke` bisect check + FPS sanity (existing `scripts/fps_playtest.py` harness available if a regression is suspected) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/game/systems/__tests__/windMath.test.ts` — covers WIND-01/02/03 pure math (write test-first per project pure-helper discipline; `windMath.ts` must be zero-import)

## Security Domain

Client-only cosmetic rendering phase: no auth, no session, no new input surface beyond two boolean URL flags, no crypto, no server code, no packages.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | minimal | `?nowind`/`?nosmoke` read via `URLSearchParams.has()` only (boolean presence — no value ever parsed/interpolated); follows the existing :295-317 convention |
| V6 Cryptography | no | — |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client-derived state later gating gameplay | Tampering | Wind is 100% cosmetic and MUST stay so (D-06: cross-client sync not required); any future gameplay-relevant wind would need a server reducer — note for posterity, no action now |
| GLSL string injection via interpolated constants | Tampering | Constants come exclusively from the compile-time `windMath.ts` module (never user input, never URL params) |

## Sources

### Primary (HIGH confidence)
- Direct codebase reads, this session (2026-07-14): `src/game/world/createGrassField.ts` (full — formula :120-122, uniform :95/:147, clock :184-186, cache key :137, template interpolation :118), `src/game/world/createMondstadtWorld.ts` (full — frozen matrices :427-428, blades mover :442-446, campfire flicker :433-437,448-451, camp loop :399-419, canopy scatter :385, LOC=494), `src/game/world/assets/createCanopyTree.ts` (full — per-cap `lambert()`, heights), `src/game/world/assets/createCampfire.ts` (full — named light :12/:72-78, flame stack :65-70), `src/game/world/assets/assetHelpers.ts` (`lambert()` allocates per call :4-6), `src/game/createGame.ts` (perfFlags :295-317, world construction :306, `frame()` :1304-1362 incl. delta clamp :1306 and `world.update` :1340), `src/game/systems/createGroundInfluence.ts` (uniform-object contract :23-25), `src/game/world/camps.ts` (`getCampSites` :29), `src/game/engine/deviceProfile.ts` (quality tiers), `package.json` (three ^0.185.1, vitest 3.2.4, pnpm scripts), asset directory listing (no flag asset exists)
- `.planning/research/ARCHITECTURE.md`, `PITFALLS.md`, `SUMMARY.md` (milestone research, 2026-07-13 — itself verified against live code; spot-re-verified this session, no drift found)
- Environment probes: node v24.15.0, pnpm 11.9.0 [VERIFIED this session]

### Secondary (MEDIUM confidence)
- Milestone research's web-verified claims inherited here: Tsushima GDC traveling-gust principle, three.js `onBeforeCompile`/program-cache behavior (cited in `.planning/research/PITFALLS.md` sources)

### Tertiary (LOW confidence)
- Initial numeric values for GUST/WANDER constants (periods, sharpness, gain) — [ASSUMED], explicitly playtest-tunable per CONTEXT discretion grant; unit tests pin the behavioral envelope (cadence bounds, wander rate), not the exact numbers

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new deps; everything verified installed
- Architecture: HIGH — every seam re-verified against live code this session; two new facts (per-call `lambert()`, depth-pass patch limitation) discovered and folded in
- Pitfalls: HIGH — grounded in this repo's own documented regression history + direct reads
- Gust math specifics: MEDIUM — technique is standard and testable, exact constants are playtest territory (by design)

**Research date:** 2026-07-14
**Valid until:** ~2026-08-14 (stable domain: pinned three version, in-repo patterns; re-verify file:line citations if other phases land first — Phase 8 is first in the milestone, so drift risk is nil right now)
