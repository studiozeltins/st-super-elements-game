# Stack Research

**Domain:** Server-authoritative telegraphed-attack combat + custom animation state machine (SpacetimeDB TS module + Three.js pixel-filter client)
**Researched:** 2026-07-08
**Confidence:** HIGH

## TL;DR (the headline recommendation)

**Add zero new runtime dependencies.** Every piece this milestone needs — the server
attack FSM, the client telegraph rendering, and the per-phase animation state machine —
is already achievable with what's in `package.json` today (`three@0.185.1`) plus the
project's own pure-helper conventions. The engine already contains working prototypes of
every primitive the feature requires:

- **FSM on a fixed tick** → the existing `worldTick` scheduled reducer already advances
  server-authoritative goliath/enemy combat every ~150 ms and gates on
  `ctx.timestamp.microsSinceUnixEpoch` (bigint) — the exact pattern a
  `windup→strike→recovery` phase clock needs.
- **Hitbox geometry** → circle (`distanceBetween`, `combatMath.ts`), cone
  (`isWithinForwardArc` dot-product arc, `goliathAI.ts`), and lane (`distanceToSegment`,
  `bridges.ts`) all already exist as pure, unit-tested helpers.
- **Ground telegraph rendering** → `createEffectSystem.ts` already draws expanding
  ground rings/torus/cone-slash meshes (`RingGeometry` rotated `-π/2`, additive blend,
  `update(delta)→progress→scale/opacity`) under the pixel filter. Telegraphs are the same
  shape driven by a *server* clock instead of a local age.
- **Per-phase mesh animation** → `createGoliathAnimation` already poses named limb objects
  procedurally (`Math.sin` on `leftArm.rotation.x`, etc.). Attack clips are the same idea,
  driven by phase-normalized `t∈[0,1]` instead of a walk cycle.

So the "stack" decision here is mostly a **discipline + what-NOT-to-add** decision. The
sections below name the concrete techniques, the one std helper worth adopting
(`THREE.MathUtils`), and the libraries to actively refuse.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `three` | `0.185.1` (already pinned; **current latest**, verified published ~2026-07-03) | Client render of ground telegraphs + procedural attack animation | Already the validated client renderer. r185 is the newest release — no bump needed. `RingGeometry`/`CircleGeometry`/`BufferGeometry` cover circle/cone/lane telegraphs; no add-on module is required for flat ground decals. |
| `spacetimedb` (TS module) | `2.6.*` (already pinned) | Server-authoritative `unit_attack` FSM resolved on `worldTick` | The FSM MUST live in a reducer for authority + determinism. The scheduled-tick + `ctx.timestamp` + additive-table pattern this feature needs is already proven by the live goliath sim. |
| `THREE.MathUtils` (built into `three`, no install) | ships with `three@0.185.1` | Easing / interpolation for telegraph fill + animation blends | `MathUtils.lerp`, `clamp`, `smoothstep`, `smootherstep`, `damp`, `mapLinear`, `pingpong` cover every easing curve a telegraph or attack clip needs. Adopting these instead of ad-hoc `progress*progress` removes a reason to ever reach for a tween lib. |

### Supporting Libraries

**None warranted.** Below is what a naive plan would reach for and why the in-repo
primitive already wins. (Full rationale in *What NOT to Use*.)

| Would-be library | Purpose it'd serve | In-repo replacement (use this) |
|---|---|---|
| `@tweenjs/tween.js` / `gsap` | ease telegraph fill + limb blends | `THREE.MathUtils.smoothstep`/`lerp` inside the existing `update(delta)` effect loop |
| `xstate` | the windup→strike→recovery machine | a `phase: u32` column + a `switch` on it in `worldTick` (must be a plain reducer for determinism anyway) |
| `cannon-es` / `rapier` | "physics feel" hitboxes | strike-instant point-in-shape tests (`distanceBetween` / `isWithinForwardArc` / `distanceToSegment`) — the SPEC explicitly rejects continuous collision |
| `bitecs` / `miniplex` (ECS) | per-unit attack state | one additive `unit_attack` table keyed `(unitKind,unitId)` — SpacetimeDB tables ARE the entity store |
| `howler` | strike SFX | out of scope this milestone; if added later, gate on the `attack_strike` event table, still no dep needed for a single `Audio` |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `vitest` (already dev dep `3.2.4`) | Unit-test the pure FSM/geometry/selection helpers and client/server mirror | Extract every bit of attack logic into dependency-free modules (`src/game/combat/*`, `spacetimedb/src/*`) so the tick logic tests without a running DB — matches the established `hitTest.ts`/`goliathAI.ts` pattern. Extend `serverSync.test.ts` to guard any `ATTACKS`/durations mirror. |
| `spacetime publish … --module-path spacetimedb` + `pnpm run spacetime:generate` | Ship the additive `unit_attack`/`attack_strike` schema + regen bindings | New tables + a new `isCrit` reducer arg are additive → migrate-publish, NO `--delete-data`. |

## Installation

```bash
# Nothing to install. Confirm the existing lockfile is intact:
pnpm install            # pnpm ONLY — never npm (symlink layout breaks npm i)

# No `pnpm add` for this milestone. THREE.MathUtils is already inside `three`.
```

> If any plan proposes a `pnpm add`, treat it as a red flag to re-justify against this
> document — the feature is designed to be dependency-free.

## Technique Recommendations (the real substance)

### 1. Server attack FSM — hand-rolled in `worldTick`, deterministic by construction

- **Phase clock via bigint micros, never a wall clock or timer.** Store `startedAt: u64`
  and compare `ctx.timestamp.microsSinceUnixEpoch >= startedAt + windupMicros` (all
  `bigint`). This is exact integer arithmetic — no float drift, no `setTimeout`. Mirrors
  how `windowBucketFor` and the gem-grace `gemIsCollectible` already gate on micros.
- **Selection fn stays deterministic.** `(distance, cooldownUntil, available[]) →
  attackId | null` from distance thresholds only. If a tie-break or variety roll is ever
  wanted, use `ctx.random.integerInRange(...)` (the module's seeded RNG) — **never**
  `Math.random()`. Prefer pure distance bands (like `chooseGoliathTargetCamp` already does)
  so it's trivially unit-testable and stable.
- **Strike resolution = point-in-shape at the strike tick vs LIVE positions**, reusing the
  three existing pure helpers:
  - `circle` → `distanceBetween(px,pz,targetX,targetZ) <= radius`
  - `cone` → `isWithinForwardArc(...)` with `minDot = cos(halfAngle)` + a reach check
  - `lane` → `distanceToSegment(px,pz, unitX,unitZ, targetX,targetZ) <= laneHalfWidth`
  Extract these into a shared `attackShapes.ts` pure helper (server) whose numbers the
  client mirrors for telegraph sizing — guard with `serverSync.test.ts`.
- **`ATTACKS` registry as a plain frozen object of integer micros + float dims.** Keep it a
  pure data module imported by both the reducer and the client renderer. Durations in
  `bigint` micros server-side; the client mirror can use `Number(...)` ms for rendering.
- **Keep it out of the `index.ts` monolith.** `index.ts` is already 3286 LOC. Land the FSM
  as `spacetimedb/src/unitAttack.ts` (pure phase-advance + selection + shape tests) called
  from `worldTick`, per the ≤300-LOC/file code-style rule.

### 2. Client telegraph rendering — extend the existing effect system, server-clock driven

- **Reuse the `createEffectSystem` shape vocabulary.** Telegraphs are ground decals:
  `RingGeometry`/`CircleGeometry` for circle, a thin `RingGeometry` thetaLength arc (or a
  custom triangle-fan `BufferGeometry`) for cone, a stretched `PlaneGeometry` for lane — all
  rotated `rotation.x = -π/2`, `depthWrite:false`, transparent. This is exactly how
  `spawnNova`/`spawnMeleeSlash` already draw on the ground plane.
- **Drive fill from the SERVER phase, not a local age.** Read `unit_attack.startedAt` +
  `phase` and compute `t = clamp((clientNow - startedAt)/windupMicros, 0, 1)`, then
  `MathUtils.smoothstep` for the fill. This keeps the telegraph honest to the authoritative
  windup even under latency — do NOT restart a local timer on subscribe.
- **Pixel-filter readability:** telegraphs render into the same low-res target as everything
  else, so use high-contrast additive edges (bright rim ring) rather than thin outlines that
  the downsample eats. This is a tuning/UX task (SPEC open question), not a lib.
- **`attack_strike` event → one-shot VFX** via the existing `onInsert`-only event-table
  pattern (like `skill_cast`/`ranged_attack`): spawn a `spawnBurst`/flash at `(x,z)`.

### 3. Animation state machine — stay procedural, do NOT adopt AnimationMixer

- **Verdict: procedural, hand-rolled.** `AnimationMixer`/`AnimationClip`/`KeyframeTrack`
  exist to play *authored keyframe tracks* (typically imported from glTF). This project has
  **no clips** — models are code-built `THREE.Group`s with named limb children posed live by
  `Math.sin` (`createGoliathAnimation`). Adopting the Mixer would force you to author
  `KeyframeTrack`s in code (verbose indirection, extra objects per unit, its own internal
  clock to keep in sync with the server phase) for zero benefit. It fights both the
  code-style ("no indirection, game performance") and the server-authoritative phase clock.
- **Recommended shape:** a tiny unit-agnostic `AnimationState` machine keyed by the SAME
  `phase` the FSM exposes: `idle | move | windup | strike | recovery`. Each state is a pure
  function `pose(model, tNormalized)` that sets limb rotations — windup = wind arm back,
  strike = snap forward, recovery = ease home — using `MathUtils.lerp`/`smoothstep`/`damp`
  for blends. Per-`attackId` clip = pick which `pose` fns to run. Build it in
  `src/game/systems/` as `createUnitAttackAnimation.ts` so hero + enemy meshes share it
  later with zero schema change (the milestone's stated design goal).
- **`t` comes from the server phase**, same derivation as the telegraph, so animation and
  telegraph and actual damage all key off one authoritative clock — no third source of truth.

## Server Determinism Rules (hard constraints — what MUST stay hand-rolled)

| Rule | Why | What to do instead |
|------|-----|--------------------|
| No `setTimeout`/`setInterval`/wall clock in the module | Reducers must be deterministic + replayable | Advance phases by comparing `ctx.timestamp` micros (bigint) against `startedAt + durationMicros` |
| No `Math.random()` in reducers | Non-deterministic across replays/nodes | `ctx.random.integerInRange()` / `ctx.random()` (seeded) — only if a roll is truly needed; prefer pure distance bands |
| No `Date.now()` / `performance.now()` | Same as timers | `ctx.timestamp.microsSinceUnixEpoch` |
| Keep phase math in **integer micros** where possible | Float accumulation can diverge; bigint compares are exact | Store `startedAt`/`cooldownUntil` as `u64`; do `>=` on bigints, not fractional-second floats |
| Damage/geometry helpers must be **byte-identical** client↔server | Prevents telegraph-vs-hit disagreement | One shared pure module per shape; mirror constants; `serverSync.test.ts` guards it |
| No new runtime deps in the module | Every import ships into the WASM sandbox and risks non-determinism | Hand-roll; the WASM module already runs pure TS helpers only |

> Float note: the client's *render* interpolation (`MathUtils.damp`, lerp on `deltaSeconds`)
> is fine to be floaty — it never feeds authority. Only the **server's** strike decision must
> be deterministic, and it already is (integer-micros gate + `Math.hypot` on the same WASM
> runtime is deterministic within the module).

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Procedural limb posing keyed to server phase | `THREE.AnimationMixer` + `AnimationClip` | Only if the project ever imports **authored glTF skeletal animations**. It has none, and code-built primitive meshes make the Mixer pure overhead. Revisit only on a full art/rig pipeline change (not this milestone). |
| `THREE.MathUtils` easing | `@tweenjs/tween.js` | Only if you needed a large declarative timeline of chained tweens with callbacks. A telegraph is a single `smoothstep(t)` per frame — a timeline lib is strictly heavier. |
| One `unit_attack` STDB table | An in-module ECS (`bitecs`) | Never here — the DB tables already ARE the authoritative entity store; an ECS would duplicate state and break the single-source-of-truth. |
| Strike-instant shape tests | `rapier`/`cannon-es` physics | Only if the design pivots to continuous rigid-body collision — the SPEC explicitly lists a physics engine as a **non-goal**. |
| Plain `switch(phase)` in the reducer | `xstate` statechart | Only for a UI-side machine with many orthogonal regions. A 4-state linear combat phase in a deterministic reducer must be plain code; `xstate`'s scheduler/timers are actively wrong for a reducer. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `THREE.AnimationMixer` / `AnimationClip` / `KeyframeTrack` | No authored clips exist; forces verbose in-code keyframe tracks + a second animation clock to reconcile with the server phase; violates "no indirection / game performance" | Procedural `pose(model, t)` fns keyed to the server `phase`, blended with `THREE.MathUtils` |
| `@tweenjs/tween.js` / `gsap` | A telegraph fill and a limb blend are one `smoothstep(t)` per frame inside the existing `update(delta)` loop; a tween runtime + its own clock is pure weight and another non-authoritative timer | `THREE.MathUtils.smoothstep` / `lerp` / `damp` |
| `xstate` (or any statechart lib) in the module | Reducers must be deterministic and side-effect-free; xstate carries schedulers/timers and belongs to event-driven UI, not a fixed-tick authoritative sim | `phase: u32` column + `switch` in `worldTick`, transitions gated on `ctx.timestamp` micros |
| `cannon-es` / `rapier` / `@dimforge/rapier3d` | SPEC non-goal — "physics feel" = strike-instant hitboxes, not continuous collision; a physics engine is non-deterministic across builds and huge | `distanceBetween` (circle), `isWithinForwardArc` (cone), `distanceToSegment` (lane) at the strike tick |
| `bitecs` / `miniplex` / any client-or-server ECS | Would duplicate the authoritative entity state that STDB tables already hold; two sources of truth = desync bugs | The additive `unit_attack` table keyed `(unitKind,unitId)` |
| `howler` / audio libs | Out of scope this milestone; even later, one strike sound doesn't justify a dep | (later) a single `HTMLAudioElement` gated on the `attack_strike` event |
| A new geometry/vector math lib (`gl-matrix`, etc.) | All planar math is 2D x/z `Math.hypot`/dot; `three`'s `Vector3`/`MathUtils` already cover client needs | Existing pure helpers + `THREE.Vector3` |
| Bumping `three` past `0.185.1` | It is already the current latest; a bump is churn with migration risk and no feature gain for flat ground decals | Stay pinned at `^0.185.1` |

## Stack Patterns by Variant

**If a new attack reuses an existing shape (circle/cone/lane):**
- Add one `ATTACKS` entry + one `UNIT_ATTACKS` list slot. Zero new code, zero new deps,
  zero schema change. This is the designed-for common case.

**If a genuinely new telegraph shape is needed (e.g. a spiral):**
- Add one client renderer branch (a new ground `BufferGeometry`) + one server shape test in
  the shared `attackShapes.ts`. Still no dependency; still mirror-tested.

**If heroes later adopt the FSM:**
- Insert `unit_attack` rows with a new `unitKind` and a hero `UNIT_ATTACKS` list. No schema
  change (that's why the table is `(unitKind,unitId)`-keyed and unit-agnostic).

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `three@0.185.1` | `@types/three@^0.185.0` (already matched in devDeps) | Keep the `@types/three` minor aligned to `three`'s minor on any future bump. `THREE.MathUtils` API is stable across recent r18x. |
| `spacetimedb@2.6.*` (module) | generated `src/module_bindings/` | Additive `unit_attack`/`attack_strike` tables + `isCrit` arg → `pnpm run spacetime:generate` after publish; no breaking regen. |
| WASM module | no runtime deps | Adding an npm dep to the module is the main way to accidentally introduce non-determinism — the "zero new deps" rule is also a determinism safeguard. |

## Sources

- Repo `package.json` — verified `three@^0.185.1`, `@types/three@^0.185.0`,
  `spacetimedb@2.6.*`, `vitest@3.2.4`, pnpm project. (HIGH — direct read)
- Repo source: `createEffectSystem.ts` (ground-ring/torus/cone effect + `update(delta)`
  pattern), `createGoliathRenderer.ts`/`createGoliathAnimation` (procedural limb posing),
  `combatMath.ts` (`distanceBetween`, `damagePerTick`, micros bucketing), `goliathAI.ts`
  (`isWithinForwardArc`, deterministic `chooseGoliathTargetCamp`), `bridges.ts`
  (`distanceToSegment` lane test), `index.ts` (`worldTick` scheduled reducer, `ctx.timestamp`
  micros gating, `ctx.random` seeded RNG), `hitTest.ts` (shared client/server geometry
  contract). (HIGH — direct read, these are the exact integration points)
- `combat-telegraphed-attacks-SPEC.md` — `unit_attack`/`attack_strike` schema, `ATTACKS`
  registry shape, physics-engine non-goal. (HIGH — design source of record)
- three.js releases via npm — `0.185.1` confirmed current latest (published ~2026-07-03).
  https://www.npmjs.com/package/three · https://github.com/mrdoob/three.js/releases (HIGH)
- `THREE.MathUtils` (`lerp`/`clamp`/`smoothstep`/`smootherstep`/`damp`/`mapLinear`/
  `pingpong`) — stable in `three` r18x, bundled, no install. https://threejs.org/docs/ (HIGH)

---
*Stack research for: server-authoritative telegraphed-attack combat + custom animation FSM*
*Researched: 2026-07-08*
