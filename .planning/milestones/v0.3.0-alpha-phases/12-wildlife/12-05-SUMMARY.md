---
phase: 12-wildlife
plan: 05
subsystem: game-loop
tags: [wildlife, createGame, wiring, perf-bisect-flags, day-night-clock, sfx-bus, one-draw-call, WILD-01, WILD-02, WILD-03]

# Dependency graph
requires:
  - phase: 12-wildlife
    plan: 02
    provides: createButterflies(scene, getGroundHeight) — self-managing day-gated butterfly pool + Butterflies.update(dt, camera, playerX, playerZ, phase, t)
  - phase: 12-wildlife
    plan: 03
    provides: createBirdFlush(scene, getGroundHeight) with spawn(x,z) + update(dt, camera); createWildlifeSfx(getContext, getSfxBus).playWingFlap(gain, pan)
  - phase: 12-wildlife
    plan: 04
    provides: createFireflies(scene, getGroundHeight) — dusk/night unlit swarm + Fireflies.update(dt, camera, playerX, playerZ, phase, t)
  - phase: 12-wildlife
    plan: 01
    provides: wildlifeMath.flushReady(lastSec, nowSec) + FLUSH_COOLDOWN_SEC — the grass-flush debounce
  - phase: 11-lived-in-props-wear
    provides: the createGame dust-wiring template (flag, construction, grass-stamp gate, frame update, dispose) copied verbatim with wildlife deltas
provides:
  - createGame.ts wired live — all three wildlife pools + the wing sfx constructed, fed the shared clocks each frame, spawned at the grass-sprint hook, and disposed at teardown
  - "?nobugs / ?nobirds / ?nofireflies perf-bisect flags (each skips its pool's construction entirely)"
affects: [13-camera-feel, milestone-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "createGame WIRE-only integration of a pooled system (dust template): ?no* flag → conditional construction (undefined when off) → grass-stamp spawn hook → one update() per frame fed by game-loop clocks → dispose() at teardown"
    - "Grass-sprint bird flush gated on the CPU surface==='grass' classify + wildlifeMath.flushReady debounce (lastFlushSec closure var) — never a groundInfluence GPU texture read"
    - "Wildlife update() fed the shared wind drift clock (wind.timeUniform.value) + the server-anchored dayNightPhase + player position from inside frame() — never a React-derived clock"

key-files:
  created:
    - .planning/phases/12-wildlife/12-05-SUMMARY.md
  modified:
    - src/game/createGame.ts

key-decisions:
  - "Bird flush uses a literal wing gain (0.6) at the grass-stamp call site — OWN_STEP_GAIN is defined later (~:1258) and is out of scope at the flush hook, per the plan's key_links"
  - "lastFlushSec declared beside playerSurface (createGame scope, before updateLocalPlayer) so the flush debounce shares the same once-per-frame surface classify the dust gate uses"
  - "Tasks 2 (perceptual UAT) + 3 (SC4 FPS gate) are blocking human checkpoints — auto-deferred to /gsd-verify-work per the --auto policy (phase-11 precedent); NOT fabricated"

requirements-completed: [WILD-01, WILD-02, WILD-03]

coverage:
  - id: W1
    description: "All three pools + the wing sfx constructed in createGame, each skipped entirely when its ?no* flag is set (undefined ⇒ zero objects, clean FPS bisect)"
    requirement: WILD-01
    verification:
      - kind: static
        ref: "grep: butterfliesEnabled/birdsEnabled/firefliesEnabled gate `enabled ? create… : undefined`; flag grep count == 5; tsc --noEmit clean"
        status: pass
    human_judgment: false
  - id: W2
    description: "Butterflies + fireflies update once/frame fed wind.timeUniform.value + dayNightPhase + player pos; birdFlush updates once/frame — all from inside frame(), never React"
    requirement: WILD-01
    verification:
      - kind: static
        ref: "grep: 3 update lines after dustPuffs?.update, each passing pixelRenderer.camera + dayNightPhase + wind.timeUniform.value; tsc clean"
        status: pass
    human_judgment: false
  - id: W3
    description: "Sprinting through grass spawns a bird flush + plays the wing one-shot at the CPU surface==='grass' stamp site, debounced by flushReady — never a GPU texture read, never every frame"
    requirement: WILD-02
    verification:
      - kind: static
        ref: "grep: flush hook is the else-branch of the surface!=='grass' dust gate; guarded by flushReady(lastFlushSec, elapsedSeconds); no groundInfluence line added in the diff"
        status: pass
      - kind: human
        ref: "Perceptual UAT — 12-05 Task 2 (deferred to /gsd-verify-work): 2-4 birds burst on a rising arc + ONE wing sound + ~6s debounce"
        status: deferred
    human_judgment: true
  - id: W4
    description: "All three pools + the wing sfx disposed in createGame teardown"
    requirement: WILD-01
    verification:
      - kind: static
        ref: "grep: 4 dispose lines (butterflies/fireflies/birdFlush/wildlifeSfx) beside dustPuffs?.dispose()"
        status: pass
    human_judgment: false
  - id: W5
    description: "?nobugs / ?nobirds / ?nofireflies each remove exactly their system; FPS holds through a golem-class fight with ALL ambiance enabled (SC4)"
    requirement: WILD-03
    verification:
      - kind: static
        ref: "grep: each flag gates exactly one construction; kill-switch comment updated"
        status: pass
      - kind: human
        ref: "SC4 milestone-wide FPS gate — 12-05 Task 3 (deferred to /gsd-verify-work): scripts/fps_playtest.py golem fight, all ambiance on, holds frame rate; ?no* bisect available"
        status: deferred
    human_judgment: true

# Metrics
duration: 3min
completed: 2026-07-18
status: complete
---

# Phase 12 Plan 05: Wildlife Wiring into createGame Summary

**The three tested wildlife factories + the wing sfx are now live in `createGame.ts` — constructed behind `?nobugs`/`?nobirds`/`?nofireflies` bisect flags (undefined when off, zero objects), fed the shared wind drift clock + the server-anchored day/night phase + the player position once per frame, spawned as a startle-flush + one wing one-shot at the CPU grass-sprint stamp site (debounced by `flushReady`, never a GPU read), and disposed at teardown — a WIRE-only change that keeps every creature decision in the factories + the wildlifeMath twin.**

## Performance
- **Duration:** ~3 min
- **Tasks:** 1 code-wiring task completed + committed; 2 blocking human checkpoints auto-deferred
- **Files modified:** 1 (`src/game/createGame.ts`) — additive wiring only, no creature logic inline

## Accomplishments
- **MOD 0 (imports):** added `createButterflies`, `createFireflies`, `createBirdFlush`, `createWildlifeSfx`, and `flushReady` imports beside the dust/audio siblings.
- **MOD 1 (flags):** `butterfliesEnabled`/`birdsEnabled`/`firefliesEnabled` beside `dustEnabled`, and `?nobugs / ?nobirds / ?nofireflies` appended to the kill-switch comment — the shipped `?nodust`/`?nosmoke` convention.
- **MOD 2 (construction):** `butterflies`/`fireflies`/`birdFlush` constructed after `dustPuffs` with the `enabled ? create…(scene, (x,z)=>world.getGroundHeight(x,z)) : undefined` pattern (zero objects when disabled), and `wildlifeSfx = createWildlifeSfx(audioSystem.getContext, buses.sfx)` beside the audio siblings.
- **MOD 3 (flush hook):** an `else if (birdFlush && flushReady(lastFlushSec, elapsedSeconds))` branch on the existing `surface !== 'grass'` dust gate — sets `lastFlushSec`, calls `birdFlush.spawn(playerPosition.x, playerPosition.z)` + `wildlifeSfx?.playWingFlap(0.6, 0)`. A `let lastFlushSec = -Infinity;` closure var declared beside `playerSurface`. This is the CPU `surface==='grass'` gate — no `groundInfluence` texture read added (confirmed via diff).
- **MOD 4 (frame update):** three `.update()` lines after `dustPuffs?.update(deltaSeconds)` — butterflies + fireflies fed `pixelRenderer.camera`, `playerPosition.x/z`, `dayNightPhase` (computed earlier in `frame()`), and `wind.timeUniform.value` (the shared clock advanced at frame top); `birdFlush` fed `(deltaSeconds, pixelRenderer.camera)`.
- **MOD 5 (dispose):** `butterflies?.dispose()`, `fireflies?.dispose()`, `birdFlush?.dispose()`, `wildlifeSfx?.dispose()` beside `dustPuffs?.dispose()`.
- Full suite **884/884 green** (no regression — this plan adds no tests, it wires already-tested factories); `tsc --noEmit` clean; flag grep count 5.

## Task Commits
1. **Task 1: wire wildlife pools + wing sfx into createGame** — `e85a5a5` (feat)

## Files Created/Modified
- `src/game/createGame.ts` — +66/-2: 5 imports, 3 flags + comment, 3 pool constructions + wildlifeSfx, the `lastFlushSec` var + grass-flush hook, 3 frame updates, 4 dispose calls. Wire-only; all creature logic stays in the factories + the wildlifeMath twin.

## Decisions Made
- **Literal wing gain (0.6)** at the flush hook — `OWN_STEP_GAIN` is defined later (~:1258) and is out of scope at the ~:1043 flush site, per the plan's `key_links`.
- **`lastFlushSec` beside `playerSurface`** (createGame scope, before `updateLocalPlayer`) so the flush debounce rides the same once-per-frame `surfaceAt` classify the dust gate already does — no second surface call, no GPU read.
- **Fed `dayNightPhase` + `wind.timeUniform.value` from inside `frame()`** (both already computed there for the day/night cycle + wind), never a React-derived clock — the milestone's 144→20fps regression class.

## Deviations from Plan
None — plan executed exactly as written. The dust wiring template was mirrored with the documented wildlife deltas (three pools instead of one, self-managing update signatures for butterflies/fireflies, the grass-complement flush hook instead of the dust spawn).

## Issues Encountered
None.

## Deferred Verification (auto-deferred per --auto policy → run in /gsd-verify-work)

This plan's frontmatter is `autonomous: false`: Tasks 2 and 3 are **blocking human checkpoints** that cannot be automated. Per the project's `--auto` policy (phase-11 precedent), all code + automated verification is complete and these two human gates are deferred to phase-level `/gsd-verify-work`. **No human/FPS result has been fabricated.**

### Task 2 — Perceptual UAT (DEFERRED)
Build + serve (`pnpm run build`, open the laragon LAN URL or dev server), then:
1. **Butterflies (WILD-01):** at day (`?time=0.3`), roam over grass — confirm butterflies are SPARSE (spotting one feels like an event), drift naturally, spawn/despawn near you, NONE at night (`?time=0.82`). Append `?nobugs` — they disappear.
2. **Bird flush (WILD-02):** at day, sprint through grass — confirm 2-4 birds burst up on a believable rising arc with ONE wing sound, then vanish; continuous running does NOT machine-gun birds (~6s debounce). Append `?nobirds` — no flush.
3. **Fireflies (WILD-03):** at dusk/night (`?time=0.82`), confirm small quads GLOW and shimmer with a randomized pulse, none by day, no material-recompile hitch when they appear. Append `?nofireflies` — they disappear.

### Task 3 — SC4 milestone-wide FPS gate (DEFERRED)
1. Run `scripts/fps_playtest.py` in a golem-class fight with ALL ambiance enabled (no `?no*` flags) — confirm frame rate holds vs the pre-wildlife baseline.
2. If FPS regressed, bisect: re-run adding `?nobugs`, then `?nobirds`, then `?nofireflies` — the flag whose addition recovers FPS names the culprit pool; retune its cap/geometry in the factory + wildlifeMath and re-run.
3. Confirm each pool is one draw call + hard-capped (no unbounded growth over a long session).

## User Setup Required
None — pure client-side cosmetic wiring; no server publish, no external service.

## Known Stubs
None. All three factories are fully functional and now live in the game loop. The only outstanding work is the two human verification gates above (deferred by design in `--auto`).

## Self-Check: PASSED
- FOUND: src/game/createGame.ts (modified, +66/-2)
- FOUND commit: e85a5a5 (feat 12-05 wiring)
- flag grep (`nobugs|nobirds|nofireflies`) == 5
- 3 update lines + 4 dispose lines (grep-confirmed)
- no groundInfluence GPU-read line added in the diff (only a comment referencing it)
- tsc --noEmit clean; full suite 884/884 green
