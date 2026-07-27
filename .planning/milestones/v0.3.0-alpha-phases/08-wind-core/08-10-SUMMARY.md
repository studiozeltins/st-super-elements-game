---
phase: 08-wind-core
plan: 10
subsystem: wind
tags: [flag, cloth, drape, shader, windMath, uat-gap-closure]
requires:
  - windMath.ts flagDrape/flagDrapeGlsl (plan 08-09)
  - createCampFlag.ts begin_vertex cloth patch (plan 08-09)
provides:
  - gust-envelope-driven flag drape (calm droops in normal play)
affects:
  - src/game/systems/windMath.ts
  - src/game/world/assets/createCampFlag.ts
tech-stack:
  added: []
  patterns:
    - "wind pose constants single-sourced in windMath.ts feed both JS (flagDrape) and generated GLSL (flagDrapeGlsl) — shader/CPU cannot drift"
key-files:
  created: []
  modified:
    - src/game/systems/windMath.ts
    - src/game/systems/__tests__/windMath.test.ts
    - src/game/world/assets/createCampFlag.ts
key-decisions:
  - "Rebalance the two FLAG drape constants (drapeLift 0.7->0.15, drapeLiftGust 0.25->0.9) rather than add a new uniform or driver — the in-shader gust envelope was already the continuous low-wind signal; only the constants that dominated it with a baseline lift were wrong"
requirements-completed: [WIND-01, WIND-03]
coverage:
  - deliverable: "Rebalanced FLAG drape constants so the continuous gust envelope drives lift (calm droops, gusts lift, strength 0 full limp)"
    verification:
      - kind: test
        ref: "src/game/systems/__tests__/windMath.test.ts#droops in the lull and lifts under a gust at full strength"
        status: pass
      - kind: test
        ref: "src/game/systems/__tests__/windMath.test.ts#zero strength means full limp hang — exactly 1, for any gust"
        status: pass
      - kind: test
        ref: "src/game/systems/__tests__/windMath.test.ts#a full gust at full strength lifts the cloth essentially taut"
        status: pass
      - kind: test
        ref: "src/game/systems/__tests__/windMath.test.ts#is monotonic non-increasing in strength and in gust"
        status: pass
    human_judgment: false
  - deliverable: "Single-source integrity: flagDrapeGlsl string pin auto-follows the rebalanced constants (no shader/CPU drift)"
    verification:
      - kind: test
        ref: "src/game/systems/__tests__/windMath.test.ts#flagDrapeGlsl renders the exact flagDrape closed form from the FLAG constants"
        status: pass
    human_judgment: false
  - deliverable: "Reconciled cloth drape comments to the continuous-droop model (no re-derived math)"
    verification:
      - kind: command
        ref: "grep -q flagDrapeGlsl src/game/world/assets/createCampFlag.ts"
        status: pass
      - kind: command
        ref: "pnpm build"
        status: pass
    human_judgment: false
  - deliverable: "Visual droop read: flag hangs/droops between gusts in normal play, lifts to stream on a passing gust, full limp under ?nowind"
    human_judgment: true
    rationale: "Pure visual/cloth-feel judgment — no CI test can assert the on-screen pose reads as a limp hang vs a rigid banner. Routed to human UAT round 3 (verification truths 1-4)."
duration: 3 min
completed: 2026-07-14
status: complete
---

# Phase 8 Plan 10: Flag Windless-Droop Gap Closure Summary

Rebalanced the flag cloth's two drape constants so the continuous in-shader gust
envelope — not a permanent baseline lift — drives the pose: during normal play
(uWindStrength pinned at 1) the camp flag now droops in the lulls between gusts
and lifts toward taut/streaming as a gust rolls through, closing UAT round-2
test 3 (Gap 1, "its ridged all the time").

## Accomplishments

- **Rebalanced the flag drape driver (test-first).** `FLAG.drapeLift` 0.7 -> 0.15
  and `FLAG.drapeLiftGust` 0.25 -> 0.9 in `windMath.ts`. The calm/lull pose at
  full strength went from `flagDrape(1,0) = 0.30` (a near-horizontal banner) to
  `0.85` (a clear limp-ish hang); a full gust still lifts it to `flagDrape(1,1) ≈ 0`
  (taut). The gust envelope, resting near 0 most of the time, now owns the pose.
- **Preserved the ?nowind contract (D-12).** `flagDrape(0, gust) === 1` for any
  gust — strength 0 is still an exact full limp hang. The `drape` term stays
  multiplied by `uWindStrength`, so the debug kill-switch is untouched.
- **Held single-source integrity (WIND-01).** `flagDrape` and `flagDrapeGlsl`
  bodies are unchanged — they already read these two constants — so the rebalance
  flows into the generated GLSL for free on the next compile. The `flagDrapeGlsl`
  exact-string pin references `FLAG.*.toFixed(4)` dynamically, so it auto-followed
  and stayed green with no test edit.
- **No regression to the passing swing behavior.** `flagSwing` / `FLAG.swingBase`
  / `FLAG.swingGust` (UAT test 1, downwind direction + strength response) were not
  touched.
- **Reconciled the now-stale cloth comments.** Rewrote the `getFlagMaterials`
  summary and the `begin_vertex` drape narrative in `createCampFlag.ts` from the
  old "strength 0 hangs limp; wind lifts" story to the continuous-droop model
  (calm droops in normal play, gusts lift, ?nowind = full limp). Comment-only —
  zero shader-logic change; the file still consumes `flagDrapeGlsl` (no re-derived
  math), stays well under 300 LOC, `cloth.castShadow` still false, cache key still
  `campFlag`.

## must_have truths — status

1. Normal play (strength 1) droops between gusts — SATISFIED (`flagDrape(1,0)` = 0.85, was 0.30). Test-pinned; visual read routed to UAT round 3.
2. Gust lifts toward taut then sags back — SATISFIED by the math (`flagDrape(1,1)` ≈ 0; monotonic in gust). Visual read routed to UAT round 3.
3. ?nowind still full limp — SATISFIED (`flagDrape(0,gust) === 1`, preserved D-12 test green).
4. Pose math single-sourced — SATISFIED (bodies unchanged; GLSL string pin auto-follows and is green).
5. flagSwing not regressed — SATISFIED (swing constants untouched; all flagSwing tests green).
6. Test-first continuous-droop coverage — SATISFIED (RED confirmed on old constants: `0.30 >= 0.6` failed; GREEN after rebalance; full suite 725/725).

## Verification Results

- `pnpm vitest run src/game/systems/__tests__/windMath.test.ts` — 22/22 pass (RED->GREEN confirmed on the new assertion).
- `pnpm vitest run` (full suite) — 46 files, 725/725 pass.
- `grep -q flagDrapeGlsl src/game/world/assets/createCampFlag.ts` — pass (still consumes the generator).
- `pnpm build` — production bundle built in 5.36s (pre-existing >500 kB chunk-size warning is unrelated).

## Deviations from Plan

None - plan executed exactly as written. The planned starting constants (0.15 / 0.9)
satisfied all behavior pins on the first rebalance; no tuning iteration was needed.

## Known Stubs

None.

## Commits

- `d82b691` fix(08-10): rebalance flag drape to gust-envelope-driven droop
- `1bc52df` docs(08-10): reconcile flag drape comments to continuous-droop model

## Next Phase Readiness

Gap 1 is closed at the code/test level. The visual droop read (verification truths
1-4) is the remaining acceptance step and is enumerated for human UAT round 3
(`/gsd-verify-work`). Gap 2 (projectile reaction) is a separate plan (08-11).

## Self-Check: PASSED

- Modified files exist on disk: windMath.ts, windMath.test.ts, createCampFlag.ts — all present.
- Commits exist: d82b691, 1bc52df — both in `git log`.
- Full suite green (725/725); build succeeds.
