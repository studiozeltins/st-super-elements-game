---
phase: 08-wind-core
reviewed: 2026-07-14T07:45:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - src/game/createGame.ts
  - src/game/systems/__tests__/createWind.test.ts
  - src/game/systems/__tests__/windMath.test.ts
  - src/game/systems/createSmokeColumns.ts
  - src/game/systems/createWind.ts
  - src/game/systems/windMath.ts
  - src/game/world/assets/__tests__/assets.test.ts
  - src/game/world/assets/__tests__/windMaterialLifecycle.test.ts
  - src/game/world/assets/createCampFlag.ts
  - src/game/world/assets/createCanopyTree.ts
  - src/game/world/assets/index.ts
  - src/game/world/createGrassField.ts
  - src/game/world/createMondstadtWorld.ts
findings:
  critical: 0
  warning: 3
  info: 5
  total: 8
status: issues_found
---

# Phase 8: Code Review Report (wind core — fresh review incl. plans 08-08/08-09)

**Reviewed:** 2026-07-14T07:45:00Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

Reviewed the wind-core implementation (windMath single-source math, createWind clock, grass/canopy/flag shader consumers, smoke columns, world/game wiring) plus the newest 08-08/08-09 changes (flagSwing/flagDrape closed forms and the campflag shader/geometry rework). All 77 phase tests pass when run locally (windMath 21, createWind 7, assets 39, windMaterialLifecycle 10).

The core math checked out under adversarial tracing:

- `gustAt` retarded-time front verified against the GLSL generator (same constants, 4-decimal rounding, drift acknowledged and immaterial).
- The flag shader's signed-angle yaw (`sinA = heading.y*windDir.x − heading.x*windDir.y`, rotation `x' = x·cosθ + z·sinθ / z' = −x·sinθ + z·cosθ`) was hand-verified: heading (1,0) with wind (0,1) yields yaw −π/2 and rotates the heading exactly onto the wind — correct sign convention for three.js Y-rotation, and the "y-rotations commute" claim for composing local yaw with the baked `modelMatrix` y-rotation holds (no parent scale exists in the chain).
- `along ∈ [0,1]` band quantization is crack-free (shared vertices quantize identically; the 0.9091 rounding of `invLength` biases boundary vertices consistently into the upper band).
- `?nowind` contracts hold: grass gust term collapses to the arithmetic-identical base sway, flags evaluate `flagDrape(0,·)=1` (full drape + drape-gated limp sway), smoke drift zeroes, canopy goes static (accepted design).
- Wind-scoped material lifetime (CR-01/CR-02) is internally consistent: `world.dispose()` may dispose the cached flag/canopy materials, but every new game constructs a new wind, which forces the rebuild path; double-dispose is safe in three.js. The regression suite pins this.

Three warnings found: a genuine visual discontinuity in the new flag yaw math at the upwind antipode (08-08/08-09 code), a GPU-buffer leak in `createGrassField.dispose()` (misses `InstancedMesh.dispose()` — the exact hazard `createSmokeColumns` documents and handles), and a pre-existing stale-reference bug in `createGame.syncRemotePlayers` (in-scope file, untouched by this phase's diff).

## Warnings

### WR-01: Flag yaw snaps discontinuously when the wind crosses a flag's exact upwind heading

**File:** `src/game/world/assets/createCampFlag.ts:139-152` (with `src/game/systems/windMath.ts:159-161`)
**Issue:** The downwind yaw is `atan(sinA, cosA) * flagSwing(...) * ease`. `atan2` has a branch cut at ±π: as the slowly wandering wind direction passes through a flag's exact opposite heading (`cosA ≈ −1`, `sinA` crossing 0), the raw angle jumps from +π to −π in one frame. Because the angle is then scaled by `flagSwing < 1` (0.75 steady, up to 1 under gust) times the 0.7–1.0 ease, the two poses are NOT the same point on the circle — at steady strength the cloth snaps instantaneously between roughly +135° and −135° from its baked heading, a visible ~90° pop. Wind wander spans [0.23, 0.97] rad, so any flag baked with heading in ≈[3.37, 4.11] rad (~12% of flags, heading is `random()*2π`) can hit this whenever the wander crosses its antipode. Per-vertex consistency means no mesh cracks — the whole cloth pops as one.
**Fix:** Make the blended pose continuous through the antipode by blending direction *vectors* instead of scaling the angle, e.g.:
```glsl
// replace: float yaw = atan(sinA, cosA) * swing * ease;
vec2 blended = normalize(mix(heading, uWindDir, ${flagSwingGlsl('uWindStrength', 'gust')} * (0.7 + 0.3 * along)));
float yaw = atan(heading.y * blended.x - heading.x * blended.y,
                 dot(heading, blended));
```
`mix` of unit vectors is continuous everywhere (at the exact antipode with swing < 0.5 it stays on the heading side), and the closed form stays a windMath-mirrorable one-liner. Alternatively, fade the yaw ease to 0 as `cosA → −1`.

### WR-02: `createGrassField.dispose()` never calls `InstancedMesh.dispose()` — instanceMatrix/instanceColor GPU buffers leak on every game teardown

**File:** `src/game/world/createGrassField.ts:197-203`
**Issue:** `dispose()` disposes each child's `geometry` and the shared material, but not the `InstancedMesh` itself. In three.js the `instanceMatrix`/`instanceColor` GL buffers are released only by the `dispose` event the mesh dispatches (`WebGLRenderer.onInstancedMeshDispose`); geometry/material disposal does not touch them. At the quality-profile blade count (~tens of thousands of instances × 16 floats × 4 bytes) that is on the order of 1–2 MB of GPU buffers leaked per game creation — StrictMode remounts and reconnect-driven `createGame` re-runs accumulate it. `createSmokeColumns.ts:201-208` handles this correctly and its comment explicitly documents the hazard ("geometry/material alone don't"), so the pattern was known within this same phase. The same gap exists for the bridge/pillar `InstancedMesh`es torn down via `disposeObject` (`src/game/world/createMondstadtWorld.ts:252-261` / `src/game/engine/disposeObject.ts`), which also never dispatches the mesh dispose event.
**Fix:**
```typescript
dispose() {
  for (const child of group.children) {
    if (child instanceof THREE.InstancedMesh) {
      child.geometry.dispose();
      child.dispose(); // releases instanceMatrix/instanceColor GPU buffers
    }
  }
  material.dispose();
  group.removeFromParent();
}
```
Optionally add `if (node instanceof THREE.InstancedMesh) node.dispose();` to `disposeObject` to cover bridges/pillars too.

### WR-03: `syncRemotePlayers` keeps a stale `nameSprite` reference after a remote character swap — nameplate picking silently breaks

**File:** `src/game/createGame.ts:1575-1585` (consumed at `createGame.ts:460-462`)
**Issue:** When a remote player's `activeCharacterId` changes, the swap branch disposes the old model and does `existingView.model.group.add(createNameSprite(row.name), existingView.healthBar.sprite)` — but never reassigns `existingView.nameSprite`. The nameplate pick raycast (`handleNameplatePick`) collects `view.nameSprite`, which now points at the old sprite: detached from the scene, material disposed, `matrixWorld` frozen at the swap-time position. Result after any remote character switch: clicking the player's live nameplate does nothing, while clicking the empty air where they stood at swap time can still "select" them (the raycaster tests the objects it is given regardless of scene membership). Pre-existing (not introduced by this phase's diff) but live in a reviewed file.
**Fix:**
```typescript
const newNameSprite = createNameSprite(row.name);
existingView.model.group.add(newNameSprite, existingView.healthBar.sprite);
existingView.nameSprite = newNameSprite;
```
(Also dispose the old sprite's material/texture explicitly if `model.dispose()` does not traverse to it.)

## Info

### IN-01: GUST periods are documented as "incommensurate" but 9/10/22 are commensurate — the envelope repeats exactly every 990 s

**File:** `src/game/systems/windMath.ts:36-48`
**Issue:** `TAU/9`, `TAU/10`, `TAU/22` share LCM 990 s, so `gustEnvelope` is exactly periodic at 16.5 min — not incommensurate as the doc comment (and the D-02 rationale) claims. Behavior within a period is non-metronomic and the cadence test pins the felt spec, so this is a documentation inaccuracy rather than a behavior bug — but a future tuner trusting the comment could be misled.
**Fix:** Either correct the comment ("irregular within a 990 s repeat — indistinguishable in play") or nudge one period to break the ratio (e.g. `TAU / 21.7`), re-running the cadence test.

### IN-02: `FLAG.width` and `FLAG.invLength` duplicate the 1.1 literal

**File:** `src/game/systems/windMath.ts:95-96`
**Issue:** `width: 1.1` and `invLength: 1 / 1.1` must stay in lockstep; editing one without the other silently breaks the shader's `along` normalization (cloth over/under-shoots the [0,1] band range).
**Fix:** Derive it: define `const FLAG_WIDTH = 1.1;` above the object and use `width: FLAG_WIDTH, invLength: 1 / FLAG_WIDTH`.

### IN-03: GLSL float-literal helper `f()` is defined three times

**File:** `src/game/systems/windMath.ts:176-178`, `src/game/world/assets/createCampFlag.ts:27`, `src/game/world/assets/createCanopyTree.ts:14`
**Issue:** The same one-liner (with the same load-bearing "raw ints break the compile" contract) is re-declared privately in each consumer. Divergence (e.g. someone changing precision in one copy) would desynchronize shader constants from the windMath mirrors this phase exists to keep in lockstep.
**Fix:** Export `f` from windMath (e.g. as `glslFloat`) and import it in both asset factories.

### IN-04: GLSL generators interpolate caller expressions without defensive parentheses

**File:** `src/game/systems/windMath.ts:198-205, 212-214, 221-223`
**Issue:** `gustGlsl` emits `(${timeExpr} - ${projExpr} / 12.0000)` and `flagSwingGlsl`/`flagDrapeGlsl` emit `${strengthExpr} * (…)`. A compound expression argument (e.g. `a + b`) would bind wrong (`t - a + b/12`) and compile silently into wrong math. All current call sites pass atoms or self-parenthesized `dot(...)` expressions, so nothing is broken today — this is a footgun for the Phase 10/12 consumers the header comment promises.
**Fix:** Wrap every interpolated argument: `(${projExpr})`, `(${strengthExpr})`, `(${gustExpr})`.

### IN-05: The wind clock accumulates unboundedly — float32 phase quantization degrades animation on very long sessions

**File:** `src/game/systems/createWind.ts:53-57`
**Issue:** `timeUniform.value` grows forever and is consumed as a GLSL `float` (float32). Around t ≈ 1.3×10⁵ s (~36 h uptime) float32 spacing reaches ~8 ms; at the flag's 4.25 rad/s flap frequency that is ~0.03 rad phase steps — visible stutter in the fastest consumers. Irrelevant for normal sessions, but this is a browser game left open on second monitors.
**Fix (optional):** Wrap the clock modulo a common period of all consumers (gust repeats at 990 s — see IN-01; wander at 15600 s; choose constants so a clean LCM wrap exists), or leave a comment explicitly accepting the bound.

---

## Verification notes

- `npx vitest run` on the four phase test files: 77/77 pass.
- No security-relevant findings: all GLSL string interpolation sources are compile-time numeric constants (no user input reaches shader source); no secrets, no eval, no debug artifacts in the reviewed files.
- Material lifetime contracts (CR-01/CR-02) traced end-to-end: `createGame` always constructs a fresh wind per game, so the wind-guard rebuild in `getFlagMaterials`/`initCanopyWind` correctly invalidates caches that `world.dispose()` may have disposed; the regression suite covers same-wind pooling, different-wind rebuild, and dispose events.
- Flag shader hand-verified: yaw sign convention, band quantization vertex-consistency, drape y-drop/x-foreshorten approximation, `?nowind` full-drape + limp-sway contract, `atan(0,-1)` reachability (see WR-01 for the one real defect found there).

_Reviewed: 2026-07-14T07:45:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
