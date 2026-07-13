# Phase 8: Wind Core - Context

**Gathered:** 2026-07-14
**Status:** Ready for planning

<domain>
## Phase Boundary

One shared wind module (`createWind.ts` + `windMath.ts` pure helper) owning phase, gust
envelope, and direction — consumed by grass (existing shader, refactored to the shared
uniform), camp flags/banners (cloth ripple), tree canopies (shader vertex sway), and NEW
campfire smoke columns (instanced voxel puffs). Gusts visibly travel across the field as a
moving wave. `?nowind` / `?nosmoke` bisect flags. Client-only; zero server work.
Requirements: WIND-01, WIND-02, WIND-03.

</domain>

<decisions>
## Implementation Decisions

### Gust feel & baseline
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

### Wind direction
- **D-05:** Direction **slowly wanders** — a few degrees per minute. Smoke plume and gust
  travel direction vary over a session; world feels less mechanical.
- **D-06:** Wander derived **deterministically from the wind clock** (summed slow sines —
  no per-frame RNG, no allocs). Cross-client sync NOT required — purely cosmetic.

### Canopy & flag look
- **D-07:** Canopies = **shader vertex sway** (grass-pattern `onBeforeCompile` patch,
  shared wind uniform, `customProgramCacheKey`): height-weighted displacement, canopy top
  moves most. GPU-side, zero per-frame CPU, scales to any tree count. NOT the CPU
  whole-canopy rigid tilt.
- **D-08:** Flags/banners = **cloth ripple**: shader flap with phase gradient along flag
  length — free end whips more, wave travels down the cloth. Needs subdivided flag
  geometry. Flags flap faster than grass (WIND-03 per-consumer character).

### Smoke columns
- **D-09:** Art style = **chunky voxel puffs** — small square/cube-ish puffs with stepped
  size+opacity as they rise. Matches voxel ambiance art; avoids soft-alpha banding under
  the nearest-filtered pixel target.
- **D-10:** Scale = **thin wisp**: ~8–12 puffs per fire, modest height. Ambient detail
  noticed second, not first.
- **D-11:** Smoke is **radius-culled**: updates+renders only within ~40–60 units of the
  player; pool reused across nearby fires. Flattest frame cost.

### Debug / bisect flags
- **D-12:** TWO flags: `?nowind` zeroes ALL sway (grass gusts, flags, canopy, smoke
  drift — grass base sway may remain per its unchanged-look contract); `?nosmoke` removes
  smoke objects entirely. Smoke is the phase's only new draw-call source — separate switch
  = clean FPS bisect.

### Performance (user-stated constraint, applies to every decision above)
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone research (verified against live code, file:line citations)
- `.planning/research/SUMMARY.md` — milestone-wide approach; wind = keystone phase; module
  layout (`createWind.ts`, `windMath.ts`, sibling-factory pattern into `createGame.ts` `frame()`)
- `.planning/research/ARCHITECTURE.md` — integration seams: grass `timeUniform` at
  `createGrassField.ts:147` (shader sway :120-122), frozen-matrix rule + windmill-blades
  mover pattern (`createMondstadtWorld.ts:427-451`), campfire light-collection pattern
  (`createCampfire.ts:34-81`), `?no*` flag convention (`createGame.ts:295-317`), uniform
  shared-by-reference contract (`createGroundInfluence.ts:23-25`)
- `.planning/research/PITFALLS.md` — Pitfall 10 ("one coherent wind" as N private clocks —
  extract ONE clock before consumer #2 exists); technical-debt table
- `.planning/research/FEATURES.md`, `.planning/research/STACK.md` — feature landscape +
  zero-new-deps ruling

### Project-level
- `.planning/REQUIREMENTS.md` §Wind Core — WIND-01..03 verbatim (incl. the
  `dot(worldPos, windDir)/gustWavelength` traveling-wave formula)
- `.planning/ROADMAP.md` §Phase 8 — success criteria 1–4

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/game/world/createGrassField.ts` — the wind formula already lives here
  (`timeUniform = { value: 0 }` :147, two-octave sway GLSL :120-122, `onBeforeCompile` +
  template-interpolated constants :118). Extraction source AND the shader-patch pattern
  for canopy sway.
- `src/game/world/assets/createCanopyTree.ts` — canopy trees to receive the shader sway.
- `src/game/world/createMondstadtWorld.ts` — frozen-matrix world (`matrixWorldAutoUpdate
  = false` :427-428); windmill blades show the sanctioned mover pattern; campfire flicker
  shows the collect-by-name-at-build pattern smoke should follow.
- `createGame.ts:295-317` — URLSearchParams bisect-flag convention (`?nograss` etc.) for
  `?nowind`/`?nosmoke`.

### Established Patterns
- Uniform objects shared BY REFERENCE (hold the object, never copy the value) — same
  contract as `groundInfluence.textureUniform`.
- Pure-helper twins: zero-import `windMath.ts` tested first, then wrapped in THREE
  (project testing discipline). Wind formula MUST be single-sourced — it lives in GLSL
  (grass/canopy vertex stage) AND JS (flags CPU?, smoke, future audio). Generate GLSL
  from the same exported constants.
- No legacy code: grass's private accumulator is DELETED in the same change that adds
  `createWind` — never two clocks.
- Frozen-matrix rule: CPU-swayed objects either live outside the frozen `world.group` or
  follow the blades pattern (mutate + manual `updateMatrixWorld` per branch). D-07/D-08
  chose shader paths largely to sidestep this.

### Integration Points
- `createGame.ts` single `frame()` — `wind.update(deltaSeconds)` wired 1–3 lines; module
  is a sibling factory (createGame must not grow logic; it is already ~1,963 LOC).
- `createGrassField(options)` — takes `wind.timeUniform` instead of its local clock.
- Phase 10 (audio) will consume the gust envelope; Phase 12 (butterflies) will consume
  `sampleWind(x,z)` — design the module API with those consumers in mind, implement only
  Phase 8 consumers now.

</code_context>

<specifics>
## Specific Ideas

- Tsushima-style broad gust front is the explicit visual reference for WIND-02 — "gusts
  read as events," reinforced by the chosen near-still baseline + 30–60s cadence.
- Voxel-toy art identity extends to smoke: chunky stepped puffs, not smooth alpha sprites.

</specifics>

<deferred>
## Deferred Ideas

### Reviewed Todos (not folded)
Six pending todos keyword-matched Phase 8; ALL judged false positives (generic keywords
"phase/milestone/system") and none folded:
- `2026-07-08-phase-6-raid-boss-DEFERRED.md` — combat milestone material
- `2026-07-08-phase-7-role-enforcement-balance-DEFERRED.md` — combat milestone material
- `2026-07-13-phase-7-crit-poise-interrupt-DEFERRED.md` — combat milestone material
- `2026-07-07-ciena-star-restyle.md` — UI backlog
- `2026-07-07-boost-orbit-v2-paths-shapes.md` — game FX backlog
- `2026-07-08-miss-evasion-system-decision-accuracy-vs-evasion-vs-none.md` — needs its own
  user ruling, combat scope

No new scope-creep ideas surfaced — discussion stayed within phase scope.

</deferred>

---

*Phase: 8-Wind Core*
*Context gathered: 2026-07-14*
