# Phase 9: Atmosphere & Day/Night - Context

**Gathered:** 2026-07-14
**Status:** Ready for planning

<domain>
## Phase Boundary

ONE client-only color pipeline: distance fog + a sky/horizon gradient + a ~20min day/night
color drift, all blended from a single source of truth, plus plaza lanterns that fade in at
dusk. Delivered as `createDayNightCycle.ts` (server-anchored phase → keyframed palette) +
`dayNightMath.ts` (pure, tested, no THREE) driving `AmbienceHandles` newly exposed by
`createMondstadtWorld` (skyLight, sunLight, fog, background, lantern lights). Fog ALREADY
exists (`Fog(0x8ecae6, 80, 300)`); this phase couples it to sky + time-of-day and adds the
gradient sky + lanterns. Sun/shadow DIRECTION never moves — only colors/intensities drift.
Zero server publish (phase anchors off an SDK event timestamp with `Date.now()` fallback).
Requirements: ATMO-01, ATMO-02, ATMO-03, DAYNITE-01, DAYNITE-02, DAYNITE-03, DAYNITE-04.

**Out of scope (own phases):** fireflies (Phase 12 — this phase only exposes the
`fireflyLevel` dusk-gate scalar, does not consume it), ambient-audio time-of-day variants
(Phase 10 — expose the hook, do not wire), weather (deferred milestone-wide).

</domain>

<decisions>
## Implementation Decisions

### Cycle length & weighting
- **D-01:** ~20min total cycle, **asymmetric day-weighted** — long day, short dawn/dusk
  bands, moderate night. Smoothstep-blended keyframes (4–6 keys). Matches DAYNITE-01.
- **D-02:** Sun/shadow **direction is frozen** (load-bearing texel-snap basis
  `sunDirection/sunRight/sunUp`). Day/night drifts COLOR + INTENSITY only, never position.

### Night palette (never darkness)
- **D-03:** Night = **blue moonlight palette**, cool hemisphere + dimmed warm sun tint,
  held to a **~40–50% day-exposure floor** — combat stays fully readable. Night is a
  palette, not a dimmer. Enforced in `dayNightMath` keyframes (DAYNITE-03).

### Sky & fog coupling (ATMO-02 core contract)
- **D-04:** Replace the flat `scene.background` with a **vertical gradient** (top = sky key
  color, bottom = horizon). The **gradient's bottom color IS the fog color** — one scratch
  `THREE.Color` feeds both fog + sky-bottom every frame. Single source; they can never
  diverge. Render technique (inward sky-dome mesh vs gradient-texture background vs shader)
  is Claude's discretion so long as the single-source contract holds.
- **D-05:** Distant terrain **dissolves into the sky/fog color** at the world edge —
  `scene.fog` mutated **in place** (never reassigned; the object identity is shared).

### Fog tuning & combat readability
- **D-06:** Fog `near` stays **beyond the gameplay/telegraph radius** (start from today's
  `near≈80`, well past `SAFE_ZONE_RADIUS` + typical engage range); `far` hides the world
  edge (~250–320). Telegraphs, enemies, and gem drops inside the radius keep ~full
  contrast at every time of day (ATMO-03). Exact near/far = playtest-tuned discretion.

### Lanterns
- **D-07:** **4–6 warm PointLights**, plaza-only, added **once at world build** using the
  campfire pattern (named light, `layers.enableAll()`, collected by name) — NOT the 4-light
  combat pool (`createLightPool` is combat-owned, never grown). Simple voxel lantern posts
  matching the art. `lanternLevel` scalar from the day/night phase **fades intensity**
  (dusk in, dawn out) — no runtime light add/remove (recompile ban). DAYNITE-04.

### Clock source (LAN sync)
- **D-08:** Time-of-day phase = `(serverMicros / CYCLE_MICROS) % 1`, **bigint modulo before
  `Number()`**, advanced inside the game loop (`serverClock.nowMicros()`), **never derived
  per React render**. Source: the SpacetimeDB SDK `EventContext` reducer timestamp
  (`worldTick` fires ~150ms and always touches enemy/goliath rows) bridged through
  `useGameTableBridge`, re-anchoring `createServerClock` with the
  `createAttackViewClock.ts:65-68` estimator; **`Date.now()` fallback**. NO server publish.
  All LAN players see the same time of day (DAYNITE-02).
  - ⚠️ **FIRST research/plan task:** verify the `EventContext` carries a usable server
    timestamp (ARCHITECTURE.md rates this MEDIUM confidence). If it does not, fall back to
    `Date.now()`-anchored phase — still satisfies "all clients within a few seconds."

### Kill-switch
- **D-09:** Register a `?nodaynight` URLSearchParams bisect flag (existing convention,
  `createGame.ts:295-317`) that freezes the palette at a neutral day key — for FPS bisection.

### Claude's Discretion
- Exact keyframe count (4–6), palette hex values, sub-band boundaries (dawn/day/dusk/night
  fractions), fog near/far constants, sky render technique (dome mesh vs texture vs shader,
  provided bottom=fog is single-sourced), lantern count (4–6) and exact plaza positions.
- Shape of the `AmbienceHandles` object returned by `createMondstadtWorld` (skyLight,
  sunLight, fog, background-setter, lanternLights[]).
- `fireflyLevel` / `lanternLevel` scalar API — design the contract now for Phase 12 +
  lanterns; expose `fireflyLevel` but do NOT consume it (no fireflies this phase).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone research (verified against live code, file:line citations)
- `.planning/research/ARCHITECTURE.md` — THE Phase 9 blueprint. Pattern 2 (server-anchored
  day/night clock — corrects the milestone's wrong `world_timer` framing; SDK EventContext
  seam, `useGameTableBridge.ts:30-35`, `createServerClock` re-anchor
  `createAttackViewClock.ts:65-68`), Pattern 3 (day/night = COLORS ONLY, sun never moves),
  ambience handles table (`createLighting` `createMondstadtWorld.ts:129-153`, fog+background
  `:222-223`), lantern-at-build vs light-pool ruling, `dayNightMath.ts` pure-helper twin,
  zero-alloc scratch-Color rule, build-order note (§"Fog + sky + day/night").
- `.planning/research/SUMMARY.md` — milestone approach; day/night ordered second because
  fog/sky/palette are ONE pipeline that gates fireflies + lanterns.
- `.planning/research/PITFALLS.md` — per-firefly/lantern PointLight anti-pattern; per-frame
  material re-tint anti-pattern (let LIGHTS carry mood, Lambert is free); phase-from-render
  anti-pattern.
- `.planning/research/FEATURES.md`, `.planning/research/STACK.md` — feature landscape +
  zero-new-deps ruling.

### Project-level
- `.planning/REQUIREMENTS.md` §Atmosphere (ATMO-01..03) + §Day/Night Lite (DAYNITE-01..04)
  — verbatim requirements incl. the in-place-fog-mutation + bigint-modulo constraints.
- `.planning/ROADMAP.md` §Phase 9 — success criteria 1–5.
- `.planning/phases/08-wind-core/08-CONTEXT.md` — sibling-factory + pure-helper-twin +
  frozen-matrix conventions this phase mirrors; `wind.timeUniform` frame-loop precedent.

### Source seams (read before touching)
- `src/game/world/createMondstadtWorld.ts` — `createLighting` :129-153 (hemisphere+sun),
  `scene.background`/`scene.fog` :222-223, frozen matrices :427, campfire-light collection
  by name :463-472, sun basis (NEVER move) :125-127.
- `src/game/world/assets/createCampfire.ts:34-78` — named-PointLight-at-build pattern the
  lanterns copy (`CAMPFIRE_LIGHT_NAME`, `layers.enableAll()`, :72).
- `src/game/systems/createLightPool.ts:5-9,22` — combat-owned 4-light pool; DO NOT use for
  lanterns (never-add/remove recompile ban explained inline).
- `src/game/systems/createAttackViewClock.ts:65-68` — the exact server-clock anchor
  estimator to reuse; `src/hooks/useGameTableBridge.ts:30-35` — the discarded `EventContext`
  to tap.
- `src/game/createGame.ts:295-317` — `?no*` bisect-flag convention (add `?nodaynight`);
  single `frame()` loop where `daynight.update(serverClock.nowMicros())` wires in.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Fog already exists** — `createMondstadtWorld.ts:223` `Fog(0x8ecae6, 80, 300)`, same hex
  as `scene.background` :222. This phase couples it to sky + time, not creates it.
- `createLighting` (`:129-153`) returns only `sunLight` today — widen to an
  `AmbienceHandles` object (skyLight, sunLight, fog, background, lanternLights).
- Campfire named-light-at-build (`createCampfire.ts:72-78`) = the lantern template.
- `createServerClock` + `createAttackViewClock.ts:65-68` anchor estimator = the day/night
  clock source; `useGameTableBridge.ts` already receives (and discards) the `EventContext`.
- `windMath.ts`/`createWind.ts` (Phase 8) = the pure-helper-twin + sibling-factory precedent
  for `dayNightMath.ts`/`createDayNightCycle.ts`.

### Established Patterns
- **Zero per-frame allocation** — palette keyframes are module constants; drift lerps into
  pre-allocated scratch `THREE.Color`s (`Color.lerpColors`). Same ban as `createGame.ts`.
- **Mutate in place, never reassign** — `scene.fog` object identity is shared; lerp its
  `.color`, never `new Fog()`. Same for light `.color`/`.intensity`.
- **Let lights carry mood** — Lambert responds to light color for free; do NOT re-tint
  materials per time-of-day (per-frame material churn = recompile storm).
- **Frozen sun direction** — texel-snap shadow basis; day/night touches color+intensity ONLY.
- Pure-helper twin: `dayNightMath.ts` (phase math + keyframe lerp) tested with vitest, no
  THREE import; wrapped by `createDayNightCycle.ts`.

### Integration Points
- `createGame.ts` single `frame()` — `daynight.update(serverClock.nowMicros())` wired 1–3
  lines; sibling factory (createGame is ~1,963 LOC, must not grow logic).
- `createMondstadtWorld` return type widens to expose `ambience` handles day/night mutates
  through — day/night never reaches into the scene directly.
- Phase 10 (audio) may consume time-of-day for bird/cricket variants; Phase 12 (fireflies)
  consumes `fireflyLevel` — expose both scalars now, consume neither.

</code_context>

<specifics>
## Specific Ideas

- The ATMO-02 "bottom of sky gradient == fog color, from one source" is the load-bearing
  contract — a single scratch Color feeds fog AND sky-bottom so they physically cannot
  drift apart. This is what makes fog+sky+day/night read as ONE pipeline.
- "Night is a palette, never darkness" — the explicit visual identity for DAYNITE-03; blue
  moonlight ambient floor at ~45% day exposure, tuned so a golem telegraph is still crisp.

</specifics>

<deferred>
## Deferred Ideas

### Reviewed Todos (not folded)
`todo.match-phase 9` surfaced 8 matches; **all judged false positives** (generic keywords
"phase/world/combat/color/source") — none belong to the atmosphere/day-night color pipeline,
so none folded:
- `2026-07-08-phase-6-raid-boss-DEFERRED.md` — combat milestone material
- `2026-07-08-phase-7-role-enforcement-balance-DEFERRED.md` — combat milestone material
- `2026-07-13-phase-7-crit-poise-interrupt-DEFERRED.md` — combat milestone material
- `2026-07-07-boost-orbit-v2-paths-shapes.md` — BŪSTS orbit FX backlog (matched "world/single")
- `flower-blade-color-art-pass.md` — flower-blade art pass (matched "color/world"); unrelated
- `2026-07-07-expand-transcend-scaling.md` — transcendence scaling, combat scope
- `2026-07-07-ciena-star-restyle.md` — constellation UI backlog

No new scope-creep ideas surfaced — discussion stayed within the color-pipeline boundary
(fireflies → Phase 12, audio time-variants → Phase 10, weather → deferred, all pre-scoped).

</deferred>

---

*Phase: 9-Atmosphere & Day/Night*
*Context gathered: 2026-07-14*
