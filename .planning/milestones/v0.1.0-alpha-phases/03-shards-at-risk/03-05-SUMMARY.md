---
phase: 03-shards-at-risk
plan: 05
subsystem: phase-validation-gate
tags: [playtest, validation, vitest, build, tracker, shard-economy]
requires:
  - shard-drop-renderer
  - shard-movement-toast
  - shard-counter-flash
  - reducers.collectShard-bindings
provides:
  - phase-03-validation-signoff
  - progress-tracker-phase3-done
affects:
  - .planning/transcendence/PROGRESS.md
tech-stack:
  added: []
  patterns:
    - "Manual two-client playtest as the phase gate for behaviors with no in-process reducer/DB harness (PVE-drop-not-credit, PVP-transfer-exactly-shardsLost, erosion order + C-floor, empty-victim no-mint, 0-gem carrier still transfers)"
key-files:
  created:
    - .planning/phases/03-shards-at-risk/03-05-SUMMARY.md
  modified:
    - .planning/transcendence/PROGRESS.md
decisions:
  - "Task 1 is verification-only (no source diff): deathPenalty.test.ts was created in Plan 01; this plan just re-runs the full suite + build as the pre-playtest gate."
  - "All five playtest scenarios were run by a human tester and approved; results are not fabricated — the agent stopped at the blocking checkpoint and resumed on 'approved'."
metrics:
  duration: ~9m (excludes human playtest wait)
  completed: 2026-07-07
  tasks: 2
  files: 1
status: complete
---

# Phase 3 Plan 05: Validation Gate + Playtest Sign-Off Summary

Proved the shards-at-risk phase end-to-end: the full vitest suite (339 tests, 25 files — including `deathPenalty.test.ts`, `serverSync.test.ts`, `serverWorldSim.test.ts`) and `pnpm build` are both green, and a human-run two-client live playtest confirmed all five not-unit-automatable shard behaviors, after which the transcendence PROGRESS.md tracker was marked Phase 3 ✅ DONE.

## What Was Built

This plan ships no source code — it is the phase's observation gate. It produced:

- **Automated gate (Task 1)** — `pnpm test` → **339 passed / 25 files** (incl. `deathPenalty.test.ts` 6, `serverSync.test.ts` 57, `serverWorldSim.test.ts` 29); `pnpm build` (`tsc -b && vite build`) → `✓ built in 4.85s`. The jsdom `HTMLCanvasElement.getContext` stderr lines from `createGoliathModel.test.ts` are pre-existing environment noise, not failures (that suite reports `✓ 4 tests`). No source diff — `deathPenalty.test.ts` was authored in Plan 01.
- **Human playtest sign-off (Checkpoint)** — a two-client live playtest against the local server; all five scenarios approved by the tester.
- **Tracker update (Task 2)** — `.planning/transcendence/PROGRESS.md` Phase 3 row set to ✅ DONE with the phase commit hash and the Phase 3 checklist box ticked.

## Playtest Results (human-verified, approved)

| # | Scenario | Expected | Result |
| - | -------- | -------- | ------ |
| 1 | PVP steal | Victim ◈ −1 + drain flash + "Zvaigžņu šķemba nozagta!"; killer ◈ +1 exact + pulse + "Nozagi zvaigžņu šķembu!"; no ground drop | ✅ pass |
| 2 | PVE drop + grace + no-vacuum | Purple shard_drop scatters (distinct from gold gems); "Zvaigžņu šķemba nokrita"; no credit; grabbable by anyone after ~1.2s (pulse, no steal toast); nearby camp does NOT vacuum it | ✅ pass |
| 3 | Erosion order + floor (0 shards) | 0→0 no counter change; transcend level erodes first; second death at transcend 0 erodes exactly one C-level (C6→C5); C0–C6 floor holds | ✅ pass |
| 4 | PVP empty victim (no mint) | Killer gains nothing; world shard total does not rise (Threat T-03-02) | ✅ pass |
| 5 | 0-gem shard carrier still transfers | Shard still moves to killer (+1 exact, "Nozagi zvaigžņu šķembu!"), victim −1, shard not destroyed; world total conserved (credit independent of the `if (stolen > 0)` gem guard) | ✅ pass |

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Full suite + build green | (no commit — verification-only gate) | src/game/data/__tests__/deathPenalty.test.ts (already committed Plan 01) |
| — | Checkpoint: two-client playtest | (human sign-off, no commit) | — |
| 2 | Update PROGRESS.md tracker | see final phase commit | .planning/transcendence/PROGRESS.md |

## Deviations from Plan

None — plan executed exactly as written. Task 1 had no source changes to commit (it is a pure verification gate; the test file predates this plan), which is expected, not a deviation.

## Notable Behavior / Follow-up

**Emergent shard re-pickup + enemy pickup (tester-approved, NOT fixed this phase).**
The `shard_drop` client/server pickup path reuses the shipped gem magnet/collect loop verbatim. As an emergent consequence the tester observed during the playtest:

- A dropped shard can be **re-picked by the player** (and by any player) — expected and intended (matches the "grabbable by anyone after grace" design).
- **Enemies can also pick up a shard_drop**, and when such an enemy is later killed the shard **drops again** at the enemy's death spot.

The tester likes this behavior and it does **not** fail any of the five gated invariants (in particular, scenario 2's "a nearby *camp* must not vacuum the drop" passed — camp vacuuming and enemy magnet-pickup are distinct code paths). Flagged here so it is not lost:

- **Interaction to review in a future phase:** whether enemy pickup should be reconciled with the "camps must not vacuum a drop" invariant — they are adjacent concerns (both are non-player entities absorbing a drop). Enemy pickup is currently *reversible* (the shard re-drops on the enemy's death), whereas a camp vacuum would be a permanent denial-of-reward (Threat T-03-05); that difference is why this is a like-to-keep behavior rather than a defect. A future phase (candidate: Phase 7 balance) should decide whether to formalize, bound, or restrict enemy shard pickup.
- **No code change made** — phase stays approved; this is a note only.

## Known Stubs

None — no source introduced this plan.

## Self-Check: PASSED

- FOUND: .planning/phases/03-shards-at-risk/03-05-SUMMARY.md
- FOUND: .planning/transcendence/PROGRESS.md (Phase 3 row ✅ DONE + checklist box ticked)
- `pnpm test` → 339 passed; `pnpm build` → built OK (Task 1 gate confirmed green above)
- Phase source commits from prior plans present: adce511, 849f3d3, b9d488c (Plan 04); shard economy (Plans 01–03) landed earlier on feat/transcendence
