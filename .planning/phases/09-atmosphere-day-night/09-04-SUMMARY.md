---
phase: 09-atmosphere-day-night
plan: 04
subsystem: rendering
tags: [three, day-night, server-clock, zero-alloc, bigint-clock, ambience-drift]

# Dependency graph
requires:
  - phase: 09-atmosphere-day-night (Plan 01)
    provides: "dayNightMath — phase01(nowMicros), samplePalette(phase) blended hex/intensity palette"
  - phase: 09-atmosphere-day-night (Plan 02)
    provides: "AmbienceHandles (skyLight, sunLight, fog, background, lanternLights, setSkyTop) write surface"
  - phase: 09-atmosphere-day-night (Plan 03)
    provides: "LANTERN_BASE_INTENSITY — the lit base the cycle scales by lanternLevel"
provides:
  - "createServerClock(): ServerClock — anchor(serverMicros) + nowMicros() with Date.now() fallback (DAYNITE-02, D-08)"
  - "createDayNightCycle(enabled, clock, ambience): DayNightCycle — the ONE writer of the ambience handles; zero per-frame allocation"
affects: [09-05-wiring, phase-12-fireflies]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server-clock estimator reused verbatim from createAttackViewClock: baseServerMicros + BigInt(round((performance.now()-basePerfMs)*1000)); Date.now()*1000 fallback pre-anchor"
    - "Zero-alloc palette render: pure twin returns already-blended hex; the wrapper only .setHex() into factory-scope scratch Colors then .copy() into live scene objects — never new THREE.Color() per frame"
    - "Snap-on-load: apply the current phase immediately in the constructor so there is no 30s sunrise ramp from a cold neutral start (Pitfall 6)"

key-files:
  created:
    - src/game/net/createServerClock.ts
    - src/game/systems/createDayNightCycle.ts
  modified: []

key-decisions:
  - "createDayNightCycle uses .setHex(palette.field) into scratch Colors rather than Color.lerpColors between per-keyframe Colors — the plan explicitly listed .setHex as an allowed path, and dayNightMath.samplePalette already returns fully-blended hex, so re-lerping two keyframe Colors would duplicate (and could drift from) the tested blend. setHex is truly zero-alloc and single-sources the blend in the pure twin. No module-const keyframe Colors are needed."
  - "Neutral freeze phase = 0.3 (the 'day' key whose horizon === the shipped fog hex 0x8ecae6) so the ?nodaynight scene reads identically to the pre-day/night look — a clean FPS-bisection baseline."
  - "LANTERN_BASE_INTENSITY imported directly from world/assets/createLantern (it is not barrel-exported); the barrel was left untouched to keep this plan's footprint to its two declared files."
  - "background is intentionally NOT written — the gradient sky-dome renders over scene.background, so drifting fog.color + setSkyTop covers the visible gradient; background stays the static creation color."

patterns-established:
  - "Pattern: a pure math twin that returns pre-blended values means the render wrapper is a plain setHex+copy loop (no lerp state), the simplest possible zero-alloc write path"

requirements-completed: [DAYNITE-01, DAYNITE-02, DAYNITE-03, DAYNITE-04]

coverage:
  - id: D1
    description: "createServerClock exposes anchor(serverMicros) + nowMicros(); nowMicros returns Date.now()*1000 pre-anchor, then baseServerMicros + performance.now() delta"
    requirement: DAYNITE-02
    verification:
      - kind: unit
        ref: "tsc -b clean; estimator copied verbatim from createAttackViewClock:65-92"
        status: pass
    human_judgment: false
  - id: D2
    description: "createDayNightCycle.update() pulls phase01(clock.nowMicros()), samples the palette, and writes fog.color / sky-top / sun+hemi color+intensity / lantern intensity through AmbienceHandles with zero per-frame allocation"
    requirement: DAYNITE-01
    verification:
      - kind: unit
        ref: "grep: no new THREE.Color inside apply()/update() (only 5 factory-scope scratch Colors); tsc -b clean; vitest 757/757"
        status: pass
    human_judgment: true
    rationale: "That the drift reads correctly (dawn/dusk warmth, blue-moonlight night, no daylight flash at the seam) through the pixel filter is a visual playtest — Plan 05 wires update() into the frame loop and gates it"
  - id: D3
    description: "Night exposure floor holds at runtime — the cycle applies samplePalette values verbatim (sun/hemi intensity), which Plan 01 proved ≥45% of the day peak across the whole cycle"
    requirement: DAYNITE-03
    verification:
      - kind: unit
        ref: "intensity written = palette.sunIntensity/hemiIntensity (dayNightMath night-floor suite, 09-01)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Lantern fade: each ambience.lanternLights[i].intensity = LANTERN_BASE_INTENSITY * palette.lanternLevel (0 by day, 1 by night); no runtime add/remove, sun direction untouched"
    requirement: DAYNITE-04
    verification:
      - kind: unit
        ref: "grep: no sunLight.position/target/SUN_OFFSET writes; lantern loop sets .intensity only"
        status: pass
    human_judgment: true
    rationale: "Warm glow reading + dusk fade-in/dawn fade-out through the pixel filter is a visual playtest — carried to the Plan 05 phase gate"

# Metrics
duration: 6min
completed: 2026-07-14
status: complete
---

# Phase 9 Plan 04: Day/Night Runtime Summary

**The day/night runtime: `createServerClock` (server-micros anchor + `Date.now()` fallback estimator reused verbatim from `createAttackViewClock`) and `createDayNightCycle` (the `createWind` sibling — pulls the phase, samples the tested `dayNightMath` palette, and drifts fog/sky/light colors + lantern intensity through `AmbienceHandles` with zero per-frame allocation, sun direction frozen).**

## Performance
- **Duration:** ~6 min
- **Started:** 2026-07-14T14:14:04Z
- **Completed:** 2026-07-14T14:20:00Z
- **Tasks:** 2
- **Files created:** 2 / **modified:** 0

## Accomplishments
- New `src/game/net/createServerClock.ts`: `ServerClock { anchor(serverMicros); nowMicros() }`. `anchor` stamps `baseServerMicros` + `performance.now()` (a table-callback setter, never a render); `nowMicros()` falls back to `Date.now() * 1000` until the first anchor, then returns `baseServerMicros + BigInt(round((performance.now() - basePerfMs) * 1000))` — the exact `createAttackViewClock` estimator, THREE-free, cosmetic-by-design (DAYNITE-02, D-08, threat T-09-01 accepted).
- New `src/game/systems/createDayNightCycle.ts`: `createDayNightCycle(enabled, clock, ambience)` mirroring `createWind`. Five factory-scope scratch `THREE.Color`s; `apply(phase)` samples `dayNightMath.samplePalette` and `.setHex().copy()`s the blended hex into `fog.color` (the shared sky-bottom uniform — ATMO-02), `setSkyTop`, `sunLight.color`+`.intensity`, `skyLight.color`/`.groundColor`/`.intensity`, and each `lanternLights[i].intensity = LANTERN_BASE_INTENSITY * lanternLevel`. Zero `new THREE.Color()` per frame; the sun DIRECTION basis is never touched (D-02); no material re-tint.
- Constructor snaps to the current time of day on load (no 30s sunrise ramp — Pitfall 6). `?nodaynight` (`enabled === false`) applies a neutral day keyframe (phase 0.3, horizon === shipped fog hex) ONCE and makes `update()` a no-op — a clean FPS-bisection freeze (D-09).

## Task Commits
1. **Task 1: createServerClock.ts — anchor + nowMicros estimator** — `07bc67a` (feat) — `tsc -b` clean
2. **Task 2: createDayNightCycle.ts — phase→palette→AmbienceHandles, zero-alloc** — `53dd505` (feat) — `tsc -b` clean, vitest 757/757

## Files Created/Modified
- `src/game/net/createServerClock.ts` (created) — server-micros clock with `Date.now()` fallback.
- `src/game/systems/createDayNightCycle.ts` (created) — the ambience-drift factory; the ONE writer of the ambience handles.

## Decisions Made
- **`.setHex` over `Color.lerpColors`**: `dayNightMath.samplePalette` already returns fully-blended hex, so the wrapper is a plain `setHex(blendedHex) → copy` loop into scratch Colors — no per-keyframe Colors, no re-lerp state, and the blend is single-sourced in the tested pure twin. The plan listed `.setHex` as an allowed path; this is the simplest zero-alloc write and cannot drift from the unit-tested math.
- **Neutral freeze = phase 0.3**: the "day" keyframe's horizon is exactly the shipped fog hex `0x8ecae6`, so `?nodaynight` reproduces the pre-day/night look byte-for-byte.
- **`background` left static**: the gradient sky-dome renders over `scene.background`; drifting `fog.color` (= dome bottom) + `setSkyTop` (dome top) covers the entire visible gradient, so writing `background` would be dead work.
- **`LANTERN_BASE_INTENSITY` imported directly** from `world/assets/createLantern` (not barrel-exported) to keep this plan's footprint to its two declared files.

## Deviations from Plan
None — plan executed exactly as written. One within-intent implementation choice: the plan's `<action>` offered "`THREE.Color.prototype.lerpColors` / `.setHex` into scratch Colors" and mentioned preallocating module-const keyframe Colors; because the pure twin returns pre-blended hex, the `.setHex` path was taken and no keyframe Colors were needed (documented above). Not a rule deviation — both paths are enumerated in the plan.

## Known Stubs
None. Both modules are complete and self-contained. They are not yet wired into the frame loop / LAN-sync tap — that is Plan 05's explicit scope (`update()` has no caller and `anchor()` no producer until then), not a stub.

## Threat Flags
None. No new network endpoint, auth path, or trust boundary introduced beyond the already-registered cosmetic `serverClock.anchor` (T-09-01, accepted). No packages installed.

## User Setup Required
None — client-only runtime modules, no dependencies added, no server publish.

## Next Phase Readiness
- Plan 05 constructs `createServerClock()` + `createDayNightCycle(enabled, clock, world.ambience)` in `createGame`, calls `daynight.update()` once per frame, and taps the world-tick table callback into `clock.anchor(serverMicros)` for the LAN-synced time of day. `enabled` is gated on the `?nodaynight` flag.
- Visual/playtest verification (dawn/dusk warmth, blue-moonlight night readability, lantern fade, no seam flash, two-client sync) is manual-only per the RESEARCH test map — carried to the Plan 05 phase gate.

## Self-Check: PASSED
- FOUND: src/game/net/createServerClock.ts
- FOUND: src/game/systems/createDayNightCycle.ts
- FOUND: .planning/phases/09-atmosphere-day-night/09-04-SUMMARY.md
- FOUND commit: 07bc67a (Task 1)
- FOUND commit: 53dd505 (Task 2)
- VERIFIED: no `new THREE.Color(` inside apply()/update() (5 scratch Colors at factory scope only)
- VERIFIED: no sunLight.position/target/SUN_OFFSET writes (sun direction frozen)
- VERIFIED: tsc -b clean, vitest 757/757 green

---
*Phase: 09-atmosphere-day-night*
*Completed: 2026-07-14*
