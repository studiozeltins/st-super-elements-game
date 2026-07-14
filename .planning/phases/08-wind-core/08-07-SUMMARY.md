---
phase: 08-wind-core
plan: 07
subsystem: world-ambiance
tags: [wind, smoke, lifecycle, three.js, gap-closure]
requires:
  - phase: 08-wind-core plan 04 (createSmokeColumns — the system whose teardown is wired here)
  - phase: 08-wind-core plan 05 (08-REVIEW findings WR-01/IN-01)
provides:
  - createGame.dispose() tears the smoke system down (WR-01 closed — no InstancedMesh/geometry/material/instance-buffer leak on game re-creation)
  - createSmokeColumns.dispose() releases the instance attribute GPU buffers via mesh.dispose()
  - Dead per-puff emitter-index state removed from the smoke module (IN-01 cleared)
affects:
  - 08-VERIFICATION re-run (WIND-01/WIND-03 clean-lifecycle precondition restored)
tech-stack:
  added: []
  patterns:
    - "InstancedMesh teardown triple: scene.remove + geometry.dispose + material.dispose is NOT enough — mesh.dispose() must also run to release instanceMatrix/instanceColor GPU buffers"
key-files:
  created: []
  modified:
    - src/game/createGame.ts
    - src/game/systems/createSmokeColumns.ts
decisions:
  - "mesh.dispose() appended after geometry/material disposal inside the existing dispose() — the InstancedMesh dispose event is the only path that frees the instance attribute buffers"
  - "spawnPuff parameter renamed fireIndex → emitterIndex (it indexes emitters); with the dead per-puff field gone this leaves zero non-comment fireIndex occurrences"
metrics:
  duration: ~3 min
  completed: 2026-07-14
  tasks: 1
  tests-before: 716
  tests-after: 716
status: complete
---

# Phase 8 Plan 07: Smoke Teardown Gap Closure Summary

**One-liner:** createGame.dispose() now tears down the smoke InstancedMesh (WR-01 leak closed), createSmokeColumns.dispose() additionally frees the instance GPU buffers via mesh.dispose(), and the dead per-puff emitter-index field is removed (IN-01).

## What was built

### Task 1 — Wire smoke teardown + complete the release (commit b0fcdb7)

**createGame.ts** — one line: `smokeColumns?.dispose();` added immediately after `debrisSystem?.dispose();` in the `dispose()` block, matching the existing optional-system teardown pattern exactly. No other changes (IN-03's ambiance extraction stays out of gap-closure scope).

**createSmokeColumns.ts:**
1. `dispose()` now also calls `mesh.dispose()` after removing the mesh from the scene — InstancedMesh.dispose() dispatches the dispose event that releases the instanceMatrix/instanceColor GPU attribute buffers, which geometry.dispose() + material.dispose() alone do not free.
2. Dead per-puff `fireIndex` field deleted from the `SmokePuff` interface, the pool initializer, and the `spawnPuff` assignment — it was written but never read (08-REVIEW IN-01; no-dead-code rule).
3. `spawnPuff`'s live parameter renamed `fireIndex` → `emitterIndex` (it indexes `emitters`). The single call site is positional (`spawnPuff(index)`), so no call-site change was needed.

Update loop, pool sizing, drift math, and ?nosmoke wiring are byte-identical — verified-green and out of scope.

## Verification

- All acceptance greps pass: `smokeColumns?.dispose()` count 1 in createGame.ts, adjacent to `debrisSystem?.dispose()`; `mesh.dispose()` count 1 in createSmokeColumns.ts; non-comment `fireIndex` count 0
- `pnpm vitest run`: 716/716 green (unchanged from 08-06 baseline — no behavior change)
- `pnpm build`: exit 0
- Dispose parity restored: every optional system constructed in createGame (lightPool, debrisSystem, smokeColumns) has a matching teardown in dispose()
- Threat register T-08-07-01 (GPU resource leak DoS across re-creation) mitigated by this plan itself

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| 1 | b0fcdb7 | fix | wire smoke teardown into createGame.dispose and free instance buffers |

## Known Stubs

None — no stubs, placeholders, or unwired data paths introduced.

## Threat Flags

None — no new security-relevant surface; client-only teardown wiring, no user input, no network.

## Next Steps

- Phase 8 gap-closure plans (08-06, 08-07) are both complete — the human playtest checklist (08-VERIFICATION §Human Verification Required) is the remaining gate via `/gsd-verify-work`.

## Self-Check: PASSED

Both modified files exist on disk; commit b0fcdb7 present in git log; commit contains no file deletions (2 files changed, line-level edits only).
