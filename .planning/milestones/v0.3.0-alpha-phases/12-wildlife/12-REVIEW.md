---
phase: 12-wildlife
reviewed: 2026-07-18T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - src/game/audio/createWildlifeSfx.ts
  - src/game/createGame.ts
  - src/game/systems/createBirdFlush.ts
  - src/game/systems/createButterflies.ts
  - src/game/systems/createFireflies.ts
  - src/game/systems/wildlifeMath.ts
findings:
  critical: 0
  warning: 1
  info: 2
  total: 3
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-07-18
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Phase 12 (Wildlife) is a client-only render phase (butterflies, fireflies, startle-flush
birds + a procedural wing SFX). It was reviewed against the milestone FPS gate (SC4) and
the project's documented client-performance rules.

The core architecture holds up under adversarial reading and meets every hard requirement
called out for this phase:

- **One draw call per system.** Each creature is a single `InstancedMesh` (butterflies:
  `PlaneGeometry`+`MeshLambertMaterial`; fireflies: `BoxGeometry`+`MeshBasicMaterial`;
  birds: `PlaneGeometry`+`MeshLambertMaterial`), `frustumCulled=false`, added to the scene
  root (never the frozen world group).
- **Hard-capped, self-managing pools** with slot recycling — `BUTTERFLY_POOL_SIZE=8`,
  `FIREFLY_POOL_SIZE=32`, `BIRD_POOL_SIZE=12`. No unbounded growth, spawn/cull throttled to
  a ~2 Hz recheck, and both spawn loops are provably terminating (bounded by
  `MAX_SPAWNS_PER_RECHECK` and `SPAWN_ATTEMPTS`).
- **Fireflies are unlit + `instanceColor`**, never a scene light and never additive/alpha
  (`MeshBasicMaterial` default opaque, no `transparent`/`blending`), so the combat
  `lightPool` (size 4) is untouched and no lit material recompiles at night. Verified.
- **Bird flush triggers at the CPU grass-classify site** (`createGame.ts:1068-1078`,
  `surfaceAt(...) === 'grass'`), debounced by `wildlifeMath.flushReady` — never a GPU
  influence-texture read. No `readPixels`/GPU readback anywhere in the phase.
- **Game-loop-owned clock:** all three `update()`s are fed `wind.timeUniform.value` +
  `deltaSeconds` + `serverClock`-derived `dayNightPhase`, never a React clock.
- **`createGame.ts` is wire-only:** construction gated behind `?nobugs` / `?nobirds` /
  `?nofireflies` bisect flags that skip pool construction entirely, `update()`s fed the
  shared clocks, and all four (incl. `wildlifeSfx`) disposed. No leaked logic.
- **`wildlifeMath` twin is correct** (bounds, continuity, monotonic ease-out arc, floored
  periodic pulse, complementary day/dusk gate) and its constants are single-sourced by the
  vitest twin. No correctness defects found in the pure math.
- **Wing SFX per-beat nodes self-clean** via `.onended` (`noise`/`band`/`gain` all
  disconnected), gesture-guarded via `ready()`, `clampGain` keeps every exponential-ramp
  target strictly positive.

One WARNING (a per-frame heap allocation that contradicts the zero-alloc mandate) and two
INFO items follow.

## Warnings

### WR-01: Butterflies and fireflies heap-allocate once per frame via `samplePalette`

**File:** `src/game/systems/createButterflies.ts:121`, `src/game/systems/createFireflies.ts:144`
**Issue:**
`createButterflies.update` calls `isDayTime(phase)` every frame (line 121) and
`createFireflies.update` calls `fireflyLevelAt(phase)` every frame (line 144). Both delegate
to `dayNightMath.samplePalette`, which returns a **fresh `DayNightPalette` object literal on
every call** (`dayNightMath.ts:224`). So each live wildlife system adds one heap allocation
per frame — two per frame total — on top of the one `createDayNightCycle` already makes
(`createDayNightCycle.ts:91`).

This directly contradicts both the phase's "ZERO per-frame allocations" mandate and the
factories' own doc comments ("Closure-level scratch — zero per-frame allocations (the
144→20fps cliff class)"). It is also redundant work: `createGame.frame()` already computes
`dayNightPhase` and `createDayNightCycle` already samples the palette that same frame; the
wildlife factories re-derive the same scalar from scratch.

Magnitude is small (2 short-lived objects/frame vs. the documented 62k-serializations/sec
cliff), so it is not a BLOCKER — but it is a real GC-pressure regression in a brand-new
per-frame system, on the exact axis the milestone FPS gate guards, and it is trivially
fixable.

**Fix:** Compute the gate scalar once in `createGame.frame()` (or expose it from
`createDayNightCycle`, which already samples the palette) and pass the number into
`update()` instead of the raw `phase`:

```typescript
// createGame.frame(), reuse the phase already computed for ambience/music:
const fireflyLevel = fireflyLevelAt(dayNightPhase); // still one alloc — see below
butterflies?.update(deltaSeconds, camera, x, z, fireflyLevel, wind.timeUniform.value);
fireflies?.update(deltaSeconds, camera, x, z, fireflyLevel, wind.timeUniform.value);
```

Better: have `createDayNightCycle` expose the palette/`fireflyLevel` it already samples each
frame, and thread that scalar through — collapsing three `samplePalette` calls per frame to
one and removing the wildlife-added allocations entirely. Inside the factories, replace
`isDayTime(phase)` with `fireflyLevel < 0.01` and `fireflyLevelAt(phase)` with the passed
scalar.

## Info

### IN-01: Butterflies/birds pay for a per-instance color buffer they never vary

**File:** `src/game/systems/createButterflies.ts:81-87`, `src/game/systems/createBirdFlush.ts:71-77`
**Issue:**
Butterflies and birds seed `instanceColor` with a single constant tint at construction and
then **never update it** — yet they mark it `DynamicDrawUsage` (`createButterflies.ts:87`,
`createBirdFlush.ts:77`). `DynamicDrawUsage` is a "this changes often" hint that is false
here, and the whole per-instance color buffer is unnecessary for a uniform tint. (Fireflies
correctly need dynamic `instanceColor` — the pulse writes it every frame — so this applies
only to the two constant-tint systems.)

**Fix:** For butterflies and birds, drop `instanceColor` entirely and set the tint on the
material (`new THREE.MeshLambertMaterial({ color: BUTTERFLY_TINT, side: THREE.DoubleSide })`),
removing the per-instance `setColorAt` loop and the `instanceColor!.setUsage(...)` line. This
is smaller GPU footprint and clearer intent. If per-instance color is kept for future
variation, at least use `StaticDrawUsage`.

### IN-02: Wing SFX leaves the pan node connected when `pan !== 0` (latent; matches project pattern)

**File:** `src/game/audio/createWildlifeSfx.ts:59,81-85,88`
**Issue:**
`playWingFlap` builds its output via `panned(ctx, pan, bus)` (line 59). When `pan !== 0`,
`audioCore.panned` creates a `StereoPanner` connected to the bus, but the per-beat
`.onended` handlers only disconnect `noise`/`band`/`gain` (lines 81-85) — the panner is
never disconnected, so it lingers connected to the sfx bus. This makes the module's "No
retained nodes — every beat self-cleans on `.onended`" comment (line 88) inaccurate for the
panned path.

Severity is INFO, not WARNING, because (a) the only call site passes `pan = 0`
(`createGame.ts:1078` → `playWingFlap(0.6, 0)`), so `panned` returns the bus directly and no
panner is created today, and (b) this is a **pre-existing, project-wide pattern** — every
sibling that uses `panned` (`createAmbience.fire`, `createWeaponAudio`, `createCombatAudio`,
`createMovementAudio`) leaves the panner connected identically. It is a latent leak that only
manifests if a future caller passes a non-zero pan.

**Fix (project-wide, out of this phase's strict scope):** have `panned` return a handle whose
disconnect can be chained into the one-shot's `.onended`, or track and disconnect the panner
alongside the other nodes. If addressing only this file, note in the doc comment that the pan
node's lifetime is bus-scoped when `pan !== 0`.

---

_Reviewed: 2026-07-18_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
