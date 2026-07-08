---
phase: 02-transcendence-install
plan: 04
subsystem: client-combat-bridge
tags: [transcendence, damage-scaling, react-bridge, game-loop, reducer-callback]

# Dependency graph
requires:
  - phase: 02-transcendence-install
    provides: transcendDamageMultiplier pure helper (plan 01, src/game/combat/transcendScaling.ts)
  - phase: 02-transcendence-install
    provides: transcendLevel column + transcendCharacter reducer client bindings (plan 03, src/module_bindings)
provides:
  - createGame loop scales active-character damage by constellation + transcend via the pure module, with a setActiveTranscend(transcend) setter feeding a mutable activeTranscend
  - App.tsx transcend bridge — transcendById map (owner-filtered), setActiveTranscend feed in the scaling effect, transcendCharacter reducer callback, and transcendById/onTranscend threaded into CharacterScreen
  - CharacterScreenProps now declares transcendById + onTranscend (interface only — UI consumption is plan 05)
affects:
  - "02-05 (CharacterScreen install control + T{n} badge consume transcendById + onTranscend)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client→game-loop feed: build a per-character map from ownedCharacterRows, push the active value via a setter in the existing scaling effect (no new subscription, no new dep)"
    - "Pure combat helper subsumes an inline loop multiplier: swap both consumption call sites, delete the local arrow fn + its private step constant"

key-files:
  created: []
  modified:
    - src/game/createGame.ts
    - src/App.tsx
    - src/ui/CharacterScreen.tsx

key-decisions:
  - "transcendDamageMultiplier(activeConstellation, activeTranscend) replaces the local constellationDamageMultiplier at both attack + skill sites; the local CONSTELLATION_DAMAGE_STEP arrow fn is deleted (the pure module owns the step constants)."
  - "transcendById reuses the already-subscribed ownedCharacterRows loop that builds constellationById (owner-filtered by row.owner.toHexString() === myIdentityHex) — no new subscription, and setActiveTranscend rides the existing scaling effect whose dep array already has ownedCharacterRows."
  - "Rule 3: added transcendById + onTranscend to CharacterScreenProps in this plan so threading them keeps pnpm build green — plan 05 owns the UI that consumes them."

requirements-completed: [REQ-transcend-install]

coverage:
  - id: C1
    description: "Loop damage scales by constellation + transcend through the pure module; setter feeds the active level"
    requirement: "REQ-transcend-install"
    verification:
      - kind: unit
        ref: "src/game/combat/__tests__/transcendScaling.test.ts#transcendDamageMultiplier"
        status: pass
      - kind: build
        ref: "pnpm build (typecheck + bundle) green after call-site swap + setter"
        status: pass
    human_judgment: false
  - id: C2
    description: "App.tsx builds transcendById, feeds setActiveTranscend, exposes transcendCharacter callback, threads props to CharacterScreen"
    requirement: "REQ-transcend-install"
    verification:
      - kind: build
        ref: "pnpm build green — proves plan-03 bindings (row.transcendLevel, conn.reducers.transcendCharacter) resolve"
        status: pass
    human_judgment: false

# Metrics
duration: 3min
completed: 2026-07-06
status: complete
---

# Phase 02 Plan 04: Client transcend damage + React bridge Summary

**The transcend level now scales client damage and reaches the UI: `createGame` consumes the pure `transcendDamageMultiplier(activeConstellation, activeTranscend)` at both the attack and skill sites behind a new `setActiveTranscend` setter, and `App.tsx` builds the owner-filtered `transcendById` map, feeds the active level into the loop, and hands `CharacterScreen` the `transcendById` data + `onTranscend` reducer callback the plan-05 Install UI needs.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-07-06T17:31:48Z
- **Completed:** 2026-07-06T17:35:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- **createGame damage path:** imported `transcendDamageMultiplier` from `./combat/transcendScaling`; deleted the local `CONSTELLATION_DAMAGE_STEP` + `constellationDamageMultiplier` arrow fn; added `let activeTranscend = 0;` and called `transcendDamageMultiplier(activeConstellation, activeTranscend)` at the regular-attack (`baseDamage`) and skill (`damageMultiplier`) sites.
- **Game interface + setter:** declared `setActiveTranscend(transcend: number): void` (mirroring the `setActiveConstellation` JSDoc + signature) and implemented `setActiveTranscend(transcend) { activeTranscend = transcend; }` next to `setActiveConstellation`.
- **App.tsx bridge:** built `transcendById: Record<string, number>` inside the existing `ownedCharacterRows` loop (owner-filtered, reads `row.transcendLevel`); added `gameRef.current?.setActiveTranscend(transcendById[active] ?? 0)` alongside the existing `setActiveConstellation` call in the scaling effect (dep array unchanged — already had `ownedCharacterRows`); added a `transcendCharacter` `useCallback` calling `connection?.reducers.transcendCharacter({ characterId })` with `[connection]` deps; threaded `transcendById={transcendById}` and `onTranscend={transcendCharacter}` into `<CharacterScreen>`.
- **Build green (both tasks):** the `transcendScaling` unit spec stayed green (5 tests) and `pnpm build` passed — the App.tsx build in particular confirms plan-03's bindings resolve (a missing `transcendLevel` column or `transcendCharacter` reducer would fail typecheck).

## Task Commits

1. **Task 1: loop damage scales by transcend via the pure module** — `e914418` (feat)
2. **Task 2: App.tsx transcend bridge (map + feed + reducer cb + props)** — `8f8ed85` (feat)

## Files Created/Modified
- `src/game/createGame.ts` — import `transcendDamageMultiplier`; replaced the local constellation-only multiplier with the pure module at both consumption sites; added `activeTranscend` state + `setActiveTranscend` setter (interface + impl).
- `src/App.tsx` — `transcendById` map build, `setActiveTranscend` feed in the scaling effect, `transcendCharacter` reducer callback, `transcendById` + `onTranscend` props threaded to `CharacterScreen`.
- `src/ui/CharacterScreen.tsx` — added `transcendById: Record<string, number>` and `onTranscend(characterId: string): void` to `CharacterScreenProps` (declaration only, so the threaded props typecheck; plan 05 implements the Install control + `T{n}` badge that consume them).

## Decisions Made
- Swapped both damage call sites to the pure `transcendDamageMultiplier` and deleted the now-dead local `CONSTELLATION_DAMAGE_STEP`/`constellationDamageMultiplier` — no behavior change for constellation-only characters (`transcend=0` → identical multiplier), plus the transcend term for installed levels.
- Reused the existing `ownedCharacterRows` loop and scaling effect rather than adding a subscription or dependency, matching the `constellationById`/`setActiveConstellation` pattern exactly (owner filter mitigates T-02-09 — another player's `transcendLevel` never feeds the local loop).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Declared transcendById + onTranscend on CharacterScreenProps**
- **Found during:** Task 2
- **Issue:** The plan threads `transcendById` and `onTranscend` into `<CharacterScreen>`, but `CharacterScreenProps` (owned by plan 05) did not yet declare them — React JSX structurally type-checks props, so passing undeclared props would fail `pnpm build` (the plan's own acceptance gate).
- **Fix:** Added the two prop declarations (`transcendById: Record<string, number>`, `onTranscend(characterId: string): void`) to the interface with JSDoc, mirroring the existing `constellationById`/`onSetConstellation` shape. No UI/behavior added — the component does not yet reference them (allowed by TS). Plan 05 implements the Install control + `T{n}` badge that consume them.
- **Files modified:** src/ui/CharacterScreen.tsx
- **Commit:** 8f8ed85

## Threat Model Notes
- T-02-09 (spoofing via transcendById owner filter, disposition `mitigate`): satisfied — `transcendById` is populated only for rows where `row.owner.toHexString() === myIdentityHex`, so another player's transcend level cannot feed the local damage loop.
- T-02-08 (client damage authority, disposition `accept`): unchanged — this plan extends the existing client-authoritative multiplier consistently; the scarce-currency spend remains guarded server-side by the plan-02 `transcendCharacter` reducer.

## Issues Encountered
None.

## Next Phase Readiness
- The loop scales transcended characters' damage (SC3) and `App.tsx` exposes `transcendById` + `onTranscend` — plan 05's `CharacterScreen` Install control + `C6·T{n}` badge can consume them directly (props already declared on the interface).
- Reminder (from plan 03): maincloud still runs the pre-transcend module until its deferred un-pause + additive re-publish; do not ship client plans 04/05 to prod before that lands.

## Self-Check: PASSED
- FOUND: src/game/createGame.ts (setActiveTranscend + transcendDamageMultiplier call sites)
- FOUND: src/App.tsx (transcendById, setActiveTranscend feed, transcendCharacter callback)
- FOUND: src/ui/CharacterScreen.tsx (transcendById + onTranscend props)
- FOUND commits: e914418, 8f8ed85

---
*Phase: 02-transcendence-install*
*Completed: 2026-07-06*
