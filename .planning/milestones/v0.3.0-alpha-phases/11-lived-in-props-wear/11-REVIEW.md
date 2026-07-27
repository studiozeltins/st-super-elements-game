---
phase: 11-lived-in-props-wear
reviewed: 2026-07-18T12:26:20Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - src/game/audio/createMovementAudio.ts
  - src/game/createGame.ts
  - src/game/systems/createDustPuffs.ts
  - src/game/systems/groundInfluenceMath.ts
  - src/game/systems/surfaceAt.ts
  - src/game/world/assets/createBarrel.ts
  - src/game/world/assets/createCrate.ts
  - src/game/world/assets/createFence.ts
  - src/game/world/assets/createTownProps.ts
  - src/game/world/assets/index.ts
  - src/game/world/createMondstadtWorld.ts
  - src/game/world/grassPlacement.ts
  - src/game/world/roads.ts
  - src/game/world/terrain.ts
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-07-18T12:26:20Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Phase 11 (Lived-in Props & Wear) is a client-only render/tuning phase: a new
ground-hug dust emitter, a `surfaceAt` classifier shared by dust + footstep
audio, footpath/road terrain tinting, wear-decay retuning, and refactored
collidable voxel props (crate/barrel/fence) placed as market clutter.

The high-value performance-rule surface is clean. I verified each of the phase's
hard constraints:

- **`surfaceAt()` is called at most once per frame.** It runs only in
  `updateLocalPlayer` (gated on moving + grounded), and the result is cached in
  `playerSurface` and re-read by the footstep audio later the same frame — no
  second classify.
- **The dust pool is hard-capped and zero-alloc.** `DUST_POOL_SIZE = 24` fixed
  pool, slot recycling, closure-level scratch `Matrix4/Vector3/Quaternion`
  reused every frame, no per-frame `new`. `getGroundHeight` is analytic +
  bucketed (no GPU readback) and is called once per *spawn*, not per frame per
  puff. Mesh lives on the scene root (not the frozen world group).
- **Footpath tint stays off the `aRoad` fragment path.** `FOOTPATH_TINT` is
  baked into the terrain vertex `color` only (`terrainColorAt`); the `aRoad`
  attribute is `roadFactor` alone, so the cart-rut/`vRoad` fragment branch never
  sees footpaths. Road blend is applied *after* footpath so roads win on overlap.
- **Props are frozen-matrix lightless statics**, merged to one draw call each,
  placed before the world freeze, carrying self-declared collision footprints
  (no double-registration).

No blockers. Two warnings (a behavioral change from the prop refactor, and DRY
duplication called out by CLAUDE.md) and three cosmetic info items.

## Warnings

### WR-01: Refactored crate/barrel factories silently turned `buildTown` market scatter from walk-through decor into solid obstacles

**File:** `src/game/world/assets/createCrate.ts:55`, `src/game/world/assets/createBarrel.ts:66`, `src/game/world/town/buildTown.ts:119-120`

**Issue:** The old `createCrate`/`createBarrel` (removed from `createTownProps.ts`)
returned `{ group }` with **no** obstacles — explicitly documented as "All decor:
returned groups carry no obstacles (players walk through) to keep the spawn plaza
clear for movement." The new factories return `{ group, obstacles: [...] }`.

`buildTown.populate()` still scatters them in the market districts via
`scatter(ctx, d, 4, createCrate, 1.5)` / `scatter(ctx, d, 3, createBarrel, 1.5)`
— passing **no** `collisionRadius` (the walk-through contract). But `placeAsset`
unconditionally pushes `asset.obstacles`, so those ~14 scattered market props
(4 crate + 3 barrel × 2 market tiles) are now **solid**, on top of the ~9 new
deliberate stacks added in `createMondstadtWorld.ts:678-693`. `scatter` only
checks `ctx.isClear` (road avoidance) — it does not avoid other obstacles, and
the deliberate stacks don't check the scattered ones. Dense overlapping
collision circles in a 15×15 market tile risk boxing the player into a pocket or
producing movement snags where the ground used to be free.

This is a behavioral regression relative to the documented "walk through" intent,
introduced implicitly by the refactor rather than by an intentional edit at the
`buildTown` call site (whose call signature and surrounding contract are now
stale).

**Fix:** Decide the intent explicitly. If market clutter should stay walk-through,
strip obstacles for the scatter path (e.g. a decor variant, or have `scatter`
place only the visual group). If solid clutter is intended, thin the counts
and/or add an obstacle-overlap rejection so scattered + deliberate stacks can't
form an inescapable pocket, and update the `buildTown` market-scatter comment to
state these are now collidable. Example (reject overlap in `scatter`):

```typescript
// after ctx.isClear check, before placeAsset:
if (obstacleTooClose(ctx, p.x, p.z, radius)) continue;
```

### WR-02: `box()` and `mergedMesh()` helpers are copy-pasted verbatim across three new prop files

**File:** `src/game/world/assets/createBarrel.ts:19-28`, `src/game/world/assets/createCrate.ts:18-27`, `src/game/world/assets/createFence.ts:19-28`

**Issue:** The identical local helpers

```typescript
function box(w, h, d, x, y, z) { return new THREE.BoxGeometry(w, h, d).translate(x, y, z); }
function mergedMesh(geos, material) {
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  return new THREE.Mesh(merged, material);
}
```

appear verbatim in `createBarrel.ts`, `createCrate.ts`, and `createFence.ts` (and
the same merge idiom is inlined again in `createTownProps.createGrassTuft`). This
directly contradicts CLAUDE.md's "No Monolith Files… Prefer refactoring the
existing code over layering a new path beside it" and DRY guidance — three
divergence points for one behavior.

**Fix:** Move `box` and `mergedMesh` into `assets/assetHelpers.ts` (which the
three files already import from) and import them, deleting the local copies. Reuse
`mergedMesh` inside `createGrassTuft` too.

## Info

### IN-01: Dust is emitted every frame while moving, not per footstep

**File:** `src/game/createGame.ts:1038-1040`

**Issue:** `dustPuffs.spawn(...)` is called on every grounded, moving,
non-grass frame — not gated on the footstep-audio stride cadence. With a 24-slot
pool and 0.5s life this reads as a continuous dust stream rather than the
discrete per-footfall puffs implied by the module name/comments ("kick low off
the foot"). No performance risk (pool is hard-capped, over-spawn slots are
skipped), purely a look/tuning concern.

**Fix (optional):** Emit only when the movement-audio step actually crosses its
stride length (share the same cadence signal), or throttle spawns to ~1 per
N frames.

### IN-02: `playerSurface` goes stale during stun/knockback, mis-gating the grass rustle on a slide

**File:** `src/game/createGame.ts:1006-1041`, `1329-1339`

**Issue:** `playerSurface` is reclassified only inside `if (isMoving) { if
(isGrounded()) … }`, and `isMoving` is forced false while stunned
(`!isStunned && …`). During a knockback the player still slides (position lerps
toward `stunServerPosition`), so `updateFootsteps` accumulates travel and emits
steps — using the **last walked** surface for grass-rustle gating rather than the
surface actually being slid across. Cosmetic only (audio layer), never a crash.

**Fix (optional):** If footsteps should fire during knockback, also refresh
`playerSurface` on the stun-lerp branch; otherwise suppress footstep emission
while `isStunned`.

### IN-03: Footpath vertex tint may be largely reprocessed by the grass fragment recolor

**File:** `src/game/world/terrain.ts:162-163`, `256-277`

**Issue:** `FOOTPATH_TINT` is lerped into the terrain vertex `color`, but the
`#include <color_fragment>` grass branch detects grass (`g > r+0.015 && g >= b`,
which the footpath tone `0x7d8a54` still satisfies) and rewrites `diffuseColor`
toward a `dry`/`lush` palette derived from `diffuseColor.rgb`. The footpath's
darker/greyer bias survives only as a scale factor, so the intended
"trodden-but-not-bare" distinction may read weaker than the vertex color suggests.
Low confidence — needs a perceptual/visual check in-engine, not provable from the
source alone.

**Fix (optional):** If footpaths look indistinct in playtest, either raise the
footpath tint weight or apply a small footpath desaturation inside the grass
fragment branch (guarded by a footpath varying) rather than relying solely on the
pre-recolor vertex color.

---

_Reviewed: 2026-07-18T12:26:20Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
