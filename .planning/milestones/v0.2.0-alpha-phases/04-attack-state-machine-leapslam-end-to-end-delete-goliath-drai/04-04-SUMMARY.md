---
phase: 04-attack-state-machine-leapslam-end-to-end-delete-goliath-drai
plan: 04
subsystem: client-render
tags: [telegraph, windup-countdown, frost, unit-attack, subscription]
requires:
  - 04-03 regenerated bindings (unit_attack_table.ts, UnitAttack type)
provides:
  - src/game/systems/createTelegraphSystem.ts — ground telegraph (outline + outward fill + rim flash) from unit_attack rows
  - syncUnitAttacks game handle storing latest rows for later plans (animation views)
  - unit_attack cached-table subscription end-to-end (App.tsx -> createGame -> telegraph)
affects:
  - 04-05 (goliath attack animation reuses latestUnitAttackRows via syncUnitAttacks)
  - 04-07 (visual legibility sign-off human checkpoint)
tech-stack:
  added: []
  patterns:
    - createEffectSystem factory + flat ground-ring idiom (RingGeometry, transparent, depthWrite false, rotation.x = -PI/2)
    - createEntityRenderer seen-set row reconcile (syncAttacks)
    - cached-table subscription (manual subscribe list + plain useTable), NOT the event-table pattern
key-files:
  created:
    - src/game/systems/createTelegraphSystem.ts
  modified:
    - src/App.tsx
    - src/game/createGame.ts
decisions:
  - "Telegraph timing anchor is re-armed whenever a row's startedAtMicros changes — a fresh cast on a reused row re-locks the landing and restarts the fill without a remove/insert cycle"
  - "syncGoliaths also re-runs telegraphSystem.syncAttacks with the fresh alive map — a goliath death mid-windup drops its disc immediately, before the stale unit_attack row updates"
  - "Fill disc pauses during flash/fade (state left windup); scale floor 0.0001 avoids a degenerate zero-scale matrix"
metrics:
  duration: ~8min
  completed: 2026-07-09
status: complete
---

# Phase 04 Plan 04: Windup Ground Telegraph Summary

Goliath windups now render as a readable FFXIV-style ground countdown: an instant icy-cyan (#86e2ff) full-radius outline at the LOCKED landing, an inner disc that fills outward over exactly the row's windup duration, and a 0.2s rim flash at the strike transition — all timing re-derived from unit_attack row micros with an arrival-captured offset.

## What Was Built

### Task 1 — createTelegraphSystem.ts (D4-14, ANIM-01, ANIM-02)
- Factory `createTelegraphSystem(scene, getGroundHeight)` returning `{ syncAttacks, update, flashStrike, dispose }`, following the createEffectSystem convention.
- OUTLINE: `RingGeometry(radius - 0.25, radius, 48)`, 0.25u rim (>= the 0.2u ANIM-02 legibility floor for the 440px pixel buffer), MeshBasicMaterial 0x86e2ff transparent 0.85, depthWrite false, DoubleSide, rotated flat, y = groundHeight(landing) + 0.06. Appears instantly at windup entry, full radius.
- FILL: `CircleGeometry(radius, 48)` at opacity 0.3, `scale.setScalar(fillFraction)` — the fill IS the countdown.
- TIMING (ANIM-01): `arrivalPerfMs` captured when a row arrives (or when `startedAtMicros` changes = fresh cast); each frame `fill = clamp(elapsedMicros / Number(strikeAtMicros - startedAtMicros), 0, 1)`. Zero timer APIs, zero hard-coded windup constants; `THREE.MathUtils.clamp` is the only helper.
- RIM FLASH: windup→strike transition (detected in syncAttacks) or external `flashStrike(key)` pops outline to opacity 1.0 / scale 1.08, decaying over 0.2s in update(). Rows that left strike linger only until the flash decays, then meshes are removed.
- Lifetime gate: rows keyed `${unitKind}:${unitId}`; a caller-supplied `isUnitAlive` predicate removes dead/missing units' meshes immediately — no telegraph outlives its goliath. Cleanup via the engine `disposeObject`.

### Task 2 — Subscription plumbing (cached-table pattern)
- App.tsx: `tables.unitAttack` added to the manual `.subscribe([...])` list AND read via `const [unitAttackRows] = useTable(tables.unitAttack)` — the goliath cached-table analog, explicitly NOT the event-table onInsert pattern (grep gate: exactly 2 occurrences). Forwarding effect mirrors the goliathRows idiom: `gameRef.current?.syncUnitAttacks(unitAttackRows)`.
- createGame.ts: `telegraphSystem` instantiated beside sibling factories with `(x, z) => world.getGroundHeight(x, z)`; `syncUnitAttacks` on the Game interface stores `latestUnitAttackRows` (reused by later animation plans) and calls `telegraphSystem.syncAttacks(rows, isUnitAlive)`; `telegraphSystem.update(deltaSeconds)` runs in the frame loop next to the renderers; `dispose()` beside sibling disposes.
- Alive predicate: `goliathAlive` Map (goliathId → alive) refreshed inside `syncGoliaths`, which also re-runs `syncAttacks` with the latest rows so a goliath death mid-windup drops its telegraph the same frame the goliath row flips.

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- `pnpm exec tsc -b` exit 0; `pnpm build` exit 0; `pnpm test` **510/510 green**
- `grep -c "0x86e2ff" createTelegraphSystem.ts` → 1; `grep -c "RingGeometry\|CircleGeometry"` → 2; `grep -c "strikeAtMicros"` → 3; `grep -c "setInterval\|setTimeout"` → 0
- Fill divides by `Number(windupDurationMicros)` where `windupDurationMicros = row.strikeAtMicros - row.startedAtMicros` — no hard-coded windup duration in the file
- `grep -c "tables.unitAttack" src/App.tsx` → 2 (manual subscribe + useTable); `grep -c "syncUnitAttacks" src/game/createGame.ts` → 2; `grep -c "telegraphSystem.update"` → 1
- **Manual spot-check note:** local DB probed live — `SELECT ... FROM unit_attack` returns FSM rows for both goliaths (900001 radius 4.75, 900002 radius 5.5, idle at probe time); the built dist/ now carries the subscription + telegraph render path. A provoked-goliath cyan-circle-fills observation and full visual legibility sign-off are Plan 07's human checkpoint as planned.

## Commits

| Task | Type | Hash | Description |
|------|------|------|-------------|
| 1 | feat | b97def0 | createTelegraphSystem — outline + outward-fill disc + rim flash from unit_attack rows |
| 2 | feat | 8804800 | wire unit_attack rows App.tsx → createGame → telegraph system |

## Known Stubs

None — the telegraph path is fully wired end-to-end (subscription → rows → meshes); `latestUnitAttackRows` is intentionally stored for Plan 05's animation views per the plan's own instruction, not a stub.

## Threat Flags

None beyond the plan's threat model. T-04-10 mitigated as specified: no timer APIs, no hard-coded durations, fill derives from row micros with arrival anchoring. No new client-callable surface, zero new dependencies.

## Self-Check: PASSED

- src/game/systems/createTelegraphSystem.ts exists on disk
- Commits b97def0, 8804800 verified in git log
- Build + 510/510 tests re-confirmed green after final edits
