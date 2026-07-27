---
phase: 09-atmosphere-day-night
plan: 05
subsystem: rendering
tags: [three, day-night, server-clock, lan-sync, event-context, spacetimedb, ambience-drift]

# Dependency graph
requires:
  - phase: 09-atmosphere-day-night (Plan 02)
    provides: "AmbienceHandles on world.ambience (skyLight, sunLight, fog, background, lanternLights, setSkyTop)"
  - phase: 09-atmosphere-day-night (Plan 04)
    provides: "createServerClock (anchor/nowMicros + Date.now() fallback) + createDayNightCycle (the ONE ambience writer)"
provides:
  - "Live day/night wiring: createGame constructs serverClock + daynight after createMondstadtWorld and advances daynight.update() once per frame() after wind.update()"
  - "?nodaynight URLSearchParams bisect flag freezing the palette at a neutral day key (D-09)"
  - "Game.syncServerClock(serverMicros) — serverClock.anchor passthrough on the Game interface"
  - "useGameTableBridge EventContext tap: enemy/goliath worldTick reducer timestamp re-anchors the clock (LAN time-of-day sync, DAYNITE-02)"
affects: [phase-10-ambient-audio, phase-12-fireflies]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Live-callback clock re-anchor: widen the discarded table-callback ctx from unknown to EventContext and, on ctx.event.tag === 'Reducer', call a Game setter with ctx.event.value.timestamp.microsSinceUnixEpoch — a setter from a live callback, never a render (Pitfall 6.1)"
    - "One coherent game-loop clock: daynight.update() runs once in frame() right after wind.update(), the cycle pulls serverClock.nowMicros() internally — no private accumulator, phase never derived per React render"
    - "?nodaynight mirrors the ?nowind/?nosmoke bisect convention: a single perfFlags.has() const gates the enabled path, freeze-once for a clean FPS baseline"

key-files:
  created: []
  modified:
    - src/game/createGame.ts
    - src/hooks/useGameTableBridge.ts

key-decisions:
  - "Called daynight.update() with NO argument (not the plan's daynight.update(serverClock.nowMicros())) — the shipped 09-04 DayNightCycle.update() reads clock.nowMicros() internally, the clock is passed into createDayNightCycle. Same behavior, single coherent clock; the plan text predated the finalized no-arg signature."
  - "Threaded the clock re-anchor into mirror() as an optional anchor?(serverMicros) param wired ONLY to the enemy + goliath tables (the two ~150ms worldTick-driven tables), not unit_attack/gem_drop/shard_drop — matches the plan's enemy/goliath scoping and re-anchors ~6.7x/s."
  - "One-time module-scope console log (loggedFirstReducerTap) of the first Reducer-tagged tap settles Assumption A1 (scheduled-reducer broadcast to a non-caller arrives tagged 'Reducer'); the Date.now() fallback covers the 'Transaction' case regardless."

patterns-established:
  - "Pattern: tap a previously-discarded SpacetimeDB table-callback EventContext for the reducer server timestamp to drive a cosmetic client clock — zero server publish, LAN-synced within one tick, Date.now() fallback within NTP skew"

requirements-completed: [ATMO-01, ATMO-02, ATMO-03, DAYNITE-01, DAYNITE-02, DAYNITE-03, DAYNITE-04]

coverage:
  - id: D1
    description: "createGame constructs serverClock + createDayNightCycle after createMondstadtWorld (world.ambience exists) and advances daynight.update() exactly once per frame() right after wind.update() — the only day/night clock advance, pulled by the loop never React"
    requirement: DAYNITE-01
    verification:
      - kind: unit
        ref: "grep: exactly one daynight.update() (createGame.ts:1348) immediately after wind.update(deltaSeconds) (:1344); tsc -b --force clean; vitest 757/757"
        status: pass
    human_judgment: false
  - id: D2
    description: "?nodaynight bisect flag freezes the palette at a neutral day key (dayNightEnabled = !perfFlags.has('nodaynight'), passed into createDayNightCycle)"
    requirement: DAYNITE-01
    verification:
      - kind: unit
        ref: "grep: dayNightEnabled const + ?nodaynight in the perfFlags comment; createDayNightCycle(dayNightEnabled, ...) freeze path (09-04 apply-once); tsc clean"
        status: pass
    human_judgment: false
  - id: D3
    description: "Game.syncServerClock(serverMicros) declared on the Game interface, implemented as a serverClock.anchor passthrough, and called ONLY from the bridge tap (never a render body)"
    requirement: DAYNITE-02
    verification:
      - kind: unit
        ref: "grep: syncServerClock declared (createGame.ts:182), implemented (:1806), called only at useGameTableBridge.ts:147; tsc clean"
        status: pass
    human_judgment: false
  - id: D4
    description: "useGameTableBridge taps the enemy/goliath onUpdate EventContext and, on ctx.event.tag === 'Reducer', re-anchors the clock via ctx.event.value.timestamp.microsSinceUnixEpoch; the iter() cache-seed loop (no ctx) never anchors and the tag guard skips the SubscribeApplied snapshot"
    requirement: DAYNITE-02
    verification:
      - kind: unit
        ref: "grep: anchor? threaded to enemy/goliath mirror() only; tag === 'Reducer' guard; iter() seed has no ctx; tsc clean, vitest 757/757"
        status: pass
    human_judgment: false
  - id: D5
    description: "Two-client LAN playtest: time-of-day sync (both clients same tint, mid-night joiner snaps not 30s sunrise), night readability (blue palette, telegraph/enemy/gem contrast, unlit safe-zone ring/campfire flames don't dominate), edge dissolve day+night, frozen sun (colors drift, shadows never rotate), lantern intensity fade dusk/dawn with no hitch, ?nodaynight freeze + real-time full-cycle soak (no banding, steady FPS)"
    requirement: ATMO-01
    verification:
      - kind: manual_procedural
        ref: "two-client LAN playtest, six-point checklist (09-05 Task 3) — human approved 2026-07-14"
        status: pass
    human_judgment: true
    rationale: "Night readability through the pixel filter, LAN time-of-day sync across two machines, frozen-sun visual drift, edge dissolve, lantern fade, and real-time perf/banding are visual/LAN/perf behaviors that cannot be unit-tested — human sign-off required."

# Metrics
duration: 27min
completed: 2026-07-14
status: complete
---

# Phase 9 Plan 05: Day/Night Runtime Wiring & LAN Sync Summary

**The built day/night pieces go live: `createGame` constructs `serverClock` + `createDayNightCycle` against `world.ambience`, advances the cycle once per `frame()` after `wind.update()`, exposes `Game.syncServerClock`, and `useGameTableBridge` taps the previously-discarded enemy/goliath table-callback `EventContext` to re-anchor the clock off the `worldTick` reducer timestamp — a LAN-synced ~20-min day-weighted cycle with a `?nodaynight` freeze and `Date.now()` fallback, zero server publish.**

## Performance

- **Duration:** ~27 min
- **Started:** 2026-07-14T14:20:24Z
- **Completed:** 2026-07-14T14:47:08Z
- **Tasks:** 3 (2 code + 1 human-verify checkpoint)
- **Files modified:** 2

## Accomplishments
- `createGame.ts`: after `createMondstadtWorld` returns (so `world.ambience` exists), constructs `const serverClock = createServerClock()` and `const daynight = createDayNightCycle(dayNightEnabled, serverClock, world.ambience)`. In `frame()`, `daynight.update()` runs exactly once immediately after `wind.update(deltaSeconds)` — the only day/night clock advance, pulled by the loop and never derived per React render (Pitfall 6.1).
- `?nodaynight` bisect flag (`dayNightEnabled = !perfFlags.has('nodaynight')`) added beside `windEnabled`/`smokeEnabled` and listed in the perf-bisect comment; it freezes the palette at a neutral day key (D-09), mirroring the `?nowind`/`?nosmoke` convention.
- `Game.syncServerClock(serverMicros: bigint)` added to the `Game` interface with a doc comment and implemented in the return object as a `serverClock.anchor` passthrough — called only from the bridge tap, never a render.
- `useGameTableBridge.ts`: widened the discarded `mirror()` callback `ctx` from `unknown` to `EventContext`. On `ctx.event.tag === 'Reducer'` in the enemy/goliath `onUpdate` path, reads `ctx.event.value.timestamp.microsSinceUnixEpoch` and re-anchors via `gameRef.current?.syncServerClock(micros)`. The `iter()` cache-seed loop (no ctx) never anchors; the `tag === 'Reducer'` guard skips the `SubscribeApplied` snapshot. A one-time console log of the first Reducer-tagged tap settles Assumption A1.
- Two-client LAN human playtest approved: time-of-day sync (mid-night joiner snaps, no 30s sunrise), night readability (blue combat-readable palette), day+night edge dissolve, frozen sun (colors drift, shadows never rotate), lantern intensity fade dusk/dawn with no hitch, and `?nodaynight` freeze + real-time full-cycle soak with no banding / steady FPS.

## Task Commits

Each code task was committed atomically:

1. **Task 1: Wire serverClock + daynight into createGame (flag, construct, frame line, interface)** — `40cd9d9` (feat) — `tsc -b` clean
2. **Task 2: Tap the EventContext in useGameTableBridge to re-anchor the clock** — `be64038` (feat) — `tsc -b` clean, vitest 757/757, `vite build` green
3. **Task 3: Two-client LAN playtest** — human-verify checkpoint, approved 2026-07-14 (no code)

**Plan metadata:** docs commit (this SUMMARY + STATE + ROADMAP + REQUIREMENTS).

## Files Created/Modified
- `src/game/createGame.ts` (modified) — imports `createServerClock`/`createDayNightCycle`; `?nodaynight` flag + `dayNightEnabled` const; constructs `serverClock` + `daynight` after the world; one `daynight.update()` in `frame()` after `wind.update()`; `Game.syncServerClock` declared + implemented as a `serverClock.anchor` passthrough.
- `src/hooks/useGameTableBridge.ts` (modified) — `EventContext` import; widened `TableHandle`/`mirror` callback ctx types; optional `anchor?` param threaded to the enemy/goliath tables; Reducer-tagged re-anchor tap + one-time first-tap log.

## Decisions Made
- **`daynight.update()` with no argument** — the shipped 09-04 `DayNightCycle.update()` takes no args and reads `clock.nowMicros()` internally (the clock is passed into `createDayNightCycle`). The plan text (`daynight.update(serverClock.nowMicros())`) predated that finalized signature; behavior is identical — one coherent clock, no private accumulator. Recorded as a deviation below.
- **Anchor threaded only to enemy + goliath** — the re-anchor is an optional `anchor?(serverMicros)` param on `mirror()`, wired only to the two `worldTick`-driven tables (they mutate every ~150ms tick), not `unit_attack`/`gem_drop`/`shard_drop`. Matches the plan's enemy/goliath scoping and re-anchors ~6.7x/s.
- **One-time first-tap log** — a module-scope `loggedFirstReducerTap` flag logs the first Reducer-tagged tap once (tag + reducer name) to settle Assumption A1 (a scheduled reducer's broadcast to a non-caller arrives tagged `'Reducer'`). The `Date.now()` fallback covers the `'Transaction'` case regardless, so DAYNITE-02 holds either way.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `daynight.update()` called with no argument to match the shipped module signature**
- **Found during:** Task 1 (frame-loop wiring)
- **Issue:** The plan's `must_haves` and `<action>` specified `daynight.update(serverClock.nowMicros())`, but the shipped 09-04 `DayNightCycle.update()` is a no-arg method that reads `clock.nowMicros()` internally (the `serverClock` is passed into `createDayNightCycle(dayNightEnabled, serverClock, world.ambience)`). Passing an argument would not type-check.
- **Fix:** Wired `daynight.update()` (no arg) in `frame()` immediately after `wind.update(deltaSeconds)`. The clock is already held by the cycle, so the phase is pulled from the single shared `serverClock` — identical semantics to the plan's intent (one coherent clock, no private accumulator).
- **Files modified:** src/game/createGame.ts
- **Verification:** `tsc -b --force` clean; grep confirms exactly one `daynight.update()` at :1348 right after `wind.update(` at :1344.
- **Committed in:** `40cd9d9` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — signature alignment).
**Impact on plan:** No functional change; the plan text predated the finalized no-arg `update()` signature from Plan 04. No scope creep.

## Issues Encountered
- `pnpm exec tsc -b` prints pnpm's "Already up to date" wrapper output rather than tsc's; invoked `node node_modules/typescript/bin/tsc -b --force` directly to get an authoritative type-check (clean, exit 0). No project change needed.

## Deferred / Follow-up
- **"Shadows follow the sun" (raised by the human at the playtest gate) — DEFERRED, out of scope for 09-05.** This reverses locked decision **D-02** (sun/shadow direction is frozen — the load-bearing texel-snap `sunDirection/sunRight/sunUp` basis) and contradicts the **DAYNITE-01** success criterion ("sun/shadow direction never moves"). It is a scope change, not a bug, and is being routed separately by the orchestrator. Nothing in this plan changes as a result; day/night drifts COLOR + INTENSITY only.

## Known Stubs
None. Both files are fully wired: `daynight.update()` has its frame-loop caller and `serverClock.anchor()` has its live-callback producer (the two open ends left by Plan 04 are now closed).

## Threat Flags
None. No new network endpoint, auth path, or trust boundary beyond the already-registered cosmetic `serverClock.anchor` re-anchor (T-09-01, accepted). The tapped reducer timestamp re-anchors a COSMETIC clock only — read-only, no server write, never gates gameplay. No packages installed; no server publish.

## User Setup Required
None — client-only runtime wiring, no dependencies added, no server publish. Ships in the normal `pnpm build` → laragon `dist/` flow.

## Next Phase Readiness
- Phase 9 (Atmosphere & Day/Night) is fully wired and LAN-synced; the color pipeline is live and human-verified. Ready for `/gsd-verify-work` / phase close.
- Phase 10 (Ambient Audio) can hook the exposed time-of-day cadence; Phase 12 (Fireflies) can consume the already-exposed `fireflyLevel` dusk-gate scalar.

## Self-Check: PASSED
- FOUND: src/game/createGame.ts (modified)
- FOUND: src/hooks/useGameTableBridge.ts (modified)
- FOUND: .planning/phases/09-atmosphere-day-night/09-05-SUMMARY.md
- FOUND commit: 40cd9d9 (Task 1)
- FOUND commit: be64038 (Task 2)
- VERIFIED: exactly one daynight.update() (createGame.ts:1348) immediately after wind.update(deltaSeconds) (:1344)
- VERIFIED: syncServerClock declared (:182), implemented (:1806), called only at useGameTableBridge.ts:147
- VERIFIED: tsc -b --force clean; vitest 757/757 green; vite build succeeds

---
*Phase: 09-atmosphere-day-night*
*Completed: 2026-07-14*
