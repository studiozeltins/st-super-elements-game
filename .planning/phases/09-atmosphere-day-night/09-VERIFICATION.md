---
phase: 09-atmosphere-day-night
verified: 2026-07-14T18:20:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 9: Atmosphere & Day/Night Verification Report

**Phase Goal:** The world has horizon depth and a shared time-of-day palette that never hurts combat readability
**Verified:** 2026-07-14T18:20:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria — the contract)

| # | Truth | Status | Evidence |
| --- | ------- | ---------- | -------------- |
| 1 | Distant terrain dissolves into the sky color and the world edge is hidden, while telegraphs/enemies/gem drops inside the gameplay radius keep ~full contrast at all times of day | ✓ VERIFIED | `FOG_NEAR = 80` / `FOG_FAR = 300` (createMondstadtWorld.ts:160-161) — near 80 ≫ `SAFE_ZONE_RADIUS = 18`, far 300 dissolves `WORLD_BOUND` edge; gradient sky-dome behind world (createSkyDome, :178-325); `NIGHT_FLOOR = 0.45` keeps night lit and tested at every phase. Visual dissolve + in-radius contrast human-approved at Plan 05 Task 3 LAN playtest |
| 2 | The sky/horizon gradient's bottom color always equals the fog color — fog, sky, and day/night blend from a single source | ✓ VERIFIED | `createSkyDome(scene.fog.color, skyTopColor)` (createMondstadtWorld.ts:324) passes `scene.fog.color` by reference into `bottomColor: { value: bottomColor }` uniform (:182). Same THREE.Color instance by construction — fog and sky-bottom physically cannot diverge (ATMO-02). `createDayNightCycle.apply()` writes `ambience.fog.color.copy(...)` (:58) so both drift together |
| 3 | World color drifts dawn → day → dusk → night over a ~20min day-weighted cycle while the sun/shadow direction never moves | ✓ VERIFIED | `CYCLE_MICROS = 1_200_000_000n` (20 min, dayNightMath.ts:13); 6 asymmetric day-weighted KEYFRAMES; `createDayNightCycle.apply()` drifts only `sunLight.color`/`.intensity` (:64-67) — never touches sun position/basis (D-02 verified: no `sunLight.position` write anywhere in the cycle). Frozen-shadow drift confirmed by human LAN playtest |
| 4 | All LAN players see the same time of day, and night keeps a blue combat-readable ambient floor — night is a palette, never darkness | ✓ VERIFIED | Server-anchored clock: `createServerClock` (anchor + nowMicros, Date.now() fallback); `useGameTableBridge` taps enemy/goliath onUpdate `EventContext`, on `ctx.event.tag === 'Reducer'` re-anchors via `ctx.event.value.timestamp.microsSinceUnixEpoch` (:71-76), wired only to the two worldTick tables (:149-150). `phase01` takes bigint modulo before Number() (:164). `NIGHT_FLOOR = 0.45` asserted at every phase by test. LAN convergence + mid-night snap human-approved |
| 5 | Plaza lanterns fade in at dusk and out at dawn (intensity fade on build-time lights, no runtime light add/remove) | ✓ VERIFIED | `createLantern` builds a named warm PointLight once at build with `layers.enableAll()` (:55-59); 6 lanterns placed in a ring radius 14 (< SAFE_ZONE 18) at world build (:558-568), collected by name into `ambience.lanternLights` in the frozen-world traverse (:596). `createDayNightCycle` sets `lights[i].intensity = LANTERN_BASE_INTENSITY * palette.lanternLevel` (:78-81) — intensity only, no add/remove. Dusk/dawn fade + no hitch human-approved |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | ----------- | ------ | ------- |
| `src/game/systems/dayNightMath.ts` | Pure THREE-free phase/palette math | ✓ VERIFIED | Zero imports; exports CYCLE_MICROS, NIGHT_FLOOR, KEYFRAMES, smoothstep, phase01, samplePalette. 26 unit tests green |
| `src/game/systems/__tests__/dayNightMath.test.ts` | Exhaustive pure-helper suite | ✓ VERIFIED | 26 tests pass in 56ms — covers wraparound, bigint precision, night floor at every phase, lantern band ramps, seam continuity |
| `src/game/world/createMondstadtWorld.ts` | AmbienceHandles + gradient sky-dome + fog tune | ✓ VERIFIED | AmbienceHandles exported (:84-93), createSkyDome single-sources fog.color, fog near 80/far 300, setSkyTop copies into topColor uniform |
| `src/game/world/assets/createLantern.ts` | Voxel post + named warm PointLight | ✓ VERIFIED | Exports createLantern + LANTERN_LIGHT_NAME + LANTERN_BASE_INTENSITY; layers.enableAll(); no createLightPool usage |
| `src/game/net/createServerClock.ts` | Server-micros anchor + Date.now fallback | ✓ VERIFIED | ServerClock interface; nowMicros falls back to Date.now()*1000 before first anchor, perf.now() delta after |
| `src/game/systems/createDayNightCycle.ts` | Zero-alloc palette→ambience writer | ✓ VERIFIED | Scratch Colors at factory scope; update() only setHex/.copy/.intensity — no `new THREE.Color()` per frame; disabled path applies neutral key once + no-ops |
| `src/game/createGame.ts` | Wiring: flag, construct, frame line, interface | ✓ VERIFIED | `?nodaynight` flag (:324); serverClock+daynight after world (:337-338); one `daynight.update()` (:1348) right after `wind.update()` (:1344); syncServerClock declared (:182) + implemented (:1806) |
| `src/hooks/useGameTableBridge.ts` | EventContext LAN-sync tap | ✓ VERIFIED | ctx typed EventContext; Reducer-tagged re-anchor tap; iter() seed never anchors; anchor threaded only to enemy/goliath |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| createSkyDome bottomColor | scene.fog.color | shared THREE.Color reference | ✓ WIRED | Same instance passed by reference (ATMO-02) |
| createDayNightCycle | AmbienceHandles | apply() → fog.color/setSkyTop/sunLight/skyLight/lanternLights | ✓ WIRED | Only writer of the handles; color+intensity only |
| createGame.frame() | daynight.update() | single call after wind.update() | ✓ WIRED | Exactly one call at :1348, pulled by loop not React |
| useGameTableBridge onUpdate | serverClock.anchor | gameRef.syncServerClock(reducer timestamp) | ✓ WIRED | tag==='Reducer' guard; enemy/goliath tables only |
| createLantern PointLight | ambience.lanternLights | named traverse collection | ✓ WIRED | Collected by LANTERN_LIGHT_NAME in frozen-world traverse |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| dayNightMath invariants (night floor at every phase, lantern band ramps, wraparound continuity, bigint precision) | `vitest run dayNightMath.test.ts` | 26/26 passed (56ms) | ✓ PASS |
| Full integration typecheck | `tsc -b --force` | exit 0, clean | ✓ PASS |
| Visual: edge dissolve, night readability, frozen sun, lantern fade, LAN time-of-day sync, no banding | Two-client LAN playtest (Plan 05 Task 3) | Human-approved 2026-07-14 | ✓ PASS (human) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| ATMO-01 | 09-02 | Distant terrain dissolves into sky (linear fog) | ✓ SATISFIED | Fog near 80/far 300 + sky-dome; truth #1 |
| ATMO-02 | 09-02, 09-05 | Sky bottom color equals fog color (single source) | ✓ SATISFIED | Shared THREE.Color reference; truth #2 |
| ATMO-03 | 09-02, 09-05 | Combat readability untouched at all times of day | ✓ SATISFIED | Fog near ≫ safe zone + NIGHT_FLOOR 0.45; truth #1 |
| DAYNITE-01 | 09-01, 09-04, 09-05 | ~20min day-weighted color drift, sun direction frozen | ✓ SATISFIED | CYCLE_MICROS + color/intensity-only drift; truth #3 |
| DAYNITE-02 | 09-01, 09-04, 09-05 | Same time of day, server-anchored, bigint modulo | ✓ SATISFIED | ServerClock + EventContext tap + phase01; truth #4 |
| DAYNITE-03 | 09-01, 09-04 | Night blue floor, combat-readable | ✓ SATISFIED | NIGHT_FLOOR 0.45 tested every phase; truth #4 |
| DAYNITE-04 | 09-01, 09-03, 09-04 | Plaza lanterns intensity-fade, no add/remove | ✓ SATISFIED | Build-time named PointLights + intensity fade; truth #5 |

All 7 requirement IDs declared across Phase 9 plans are accounted for and map 1:1 to REQUIREMENTS.md (all under Phase 9, marked Complete). No orphaned requirements — REQUIREMENTS.md assigns exactly ATMO-01..03 + DAYNITE-01..04 to Phase 9, and every one appears in a plan's `requirements` field.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None — no TODO/FIXME/XXX/TBD/HACK/PLACEHOLDER/stub markers in any phase file | — | — |

### Accepted Deviation (noted, not a gap)

`daynight.update()` is called with no argument in createGame.ts (:1348) rather than the plan text's `daynight.update(serverClock.nowMicros())`. The shipped `DayNightCycle.update()` reads `clock.nowMicros()` internally (the clock is passed into `createDayNightCycle`), so behavior is semantically identical — one coherent shared clock, no private accumulator. Documented in 09-05-SUMMARY as an auto-fixed signature alignment.

### Out of Scope (not a gap)

"Shadows follow the sun" — deliberately deferred. Implementing it would reverse locked decision D-02 (frozen sun/shadow basis) and contradict DAYNITE-01 ("sun/shadow direction never moves"). Being routed to a follow-up phase by the orchestrator; correctly excluded from this phase.

### Human Verification Required

None outstanding. The visual/LAN/perf success criteria (edge dissolve, night readability, LAN time-of-day sync, frozen sun, lantern fade, no banding) are inherently not unit-testable and were already validated and approved by the operator at the Plan 05 Task 3 two-client LAN playtest checkpoint.

### Gaps Summary

None. All 5 ROADMAP success criteria are observably achieved in the codebase: the code implementing each criterion exists, is substantive, and is wired; the behavior-dependent math invariants (night exposure floor at every phase, lantern dusk/dawn ramps, seam continuity, bigint precision) are exercised by 26 passing unit tests; the integration typechecks clean; and the non-unit-testable visual/LAN behaviors were human-approved. All 7 requirement IDs are satisfied and traced.

---

_Verified: 2026-07-14T18:20:00Z_
_Verifier: Claude (gsd-verifier)_
