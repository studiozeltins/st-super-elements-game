---
phase: 08-wind-core
verified: 2026-07-14T12:00:00Z
status: human_needed
score: 11/14 must-haves verified
behavior_unverified: 3
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 14/20
  round: 3
  scope: "Focused re-verify of UAT round-2 gap-closure plans 08-10 (flag droop) + 08-11 (projectile→flag impulse)"
  gaps_closed:
    - "Gap 1 (UAT round-2 test 3, 'its ridged all the time'): flag drape rebalanced to gust-envelope-driven droop — FLAG.drapeLift 0.7→0.15, FLAG.drapeLiftGust 0.25→0.9; flagDrape(1,0) now 0.85 (was 0.30), full gust still ~0; ?nowind (strength 0) still exact 1.0 full limp"
    - "Gap 2 (UAT round-2 test 4, projectile reaction): projectile→flag directional impulse pipeline — per-flag additive uImpulseDir/uImpulseMag on the pooled campFlag material via onBeforeRender, distance-gated world.disturbFlags + per-frame decay, wired into the projectile loop beside stampGround"
  gaps_remaining: []
  regressions: []
behavior_unverified_items:
  - truth: "In normal play (uWindStrength pinned at 1) the camp flag DROOPS between gusts — a clear limp-ish hang, not a near-horizontal banner (Gap 1 on-screen read)"
    test: "Watch a camp flag in the built game (laragon dist/) during a lull between gusts"
    expected: "Clear downward droop/hang in the calm, NOT a rigid near-horizontal banner"
    why_human: "flagDrape(1,0)=0.85 is unit-pinned and the shader consumes flagDrapeGlsl, but 'reads as a limp hang' is a cloth-feel perceptual bar CI cannot assert"
  - truth: "When a gust rolls through, the same continuous envelope lifts the cloth toward taut/streaming, then it sags back as the gust passes (Gap 1 on-screen read)"
    test: "Watch the same flag as a gust arrives (the same gust that kinks the fireplace smoke)"
    expected: "Cloth lifts toward taut/streams on the gust, then sags back to the droop as it passes"
    why_human: "flagDrape monotonic-in-gust + flagDrape(1,1)≈0 are unit-pinned; the on-screen lift/sag transient is a visual read"
  - truth: "A projectile flying PAST a camp flag kicks the cloth ALIGNED with travel direction, then settles back to the wind pose over ~0.45s; distant flags do not react; kick sums on top of the droop and under ?nowind (Gap 2 on-screen read)"
    test: "Fire a projectile past a camp flag; fire another nowhere near a flag; fire one with ?nowind"
    expected: "Near flag snaps in the shot's travel direction and settles within ~0.5s; distant flags do not move; the kick is visible on a limp ?nowind flag too"
    why_human: "decayFlagImpulse (0.45s) + withinDisturbRadius gate are unit-pinned and the pipeline is wired end to end, but the direction-aligned snap + settle read is only verifiable on screen"
human_verification:
  - test: "Gap 1 — flag droops between gusts (reopened UAT round-2 test 3)"
    expected: "Calm/lull flag hangs in a clear droop, not a rigid banner; a passing gust lifts it toward taut then it sags back"
    why_human: "Cloth-feel perceptual acceptance bar; the drape math is unit-pinned but the on-screen read was the UAT failure"
  - test: "Gap 2 — projectile kicks the flag and it settles (reopened UAT round-2 test 4)"
    expected: "A shot flying past a flag snaps it in the travel direction and it settles back within ~0.5s; distant flags unaffected; visible under ?nowind too"
    why_human: "Direction-aligned snap + settle + distance-gate read is only verifiable by a human in UAT round 3"
  - test: "FPS sanity in a projectile-heavy fight near a camp (D-13)"
    expected: "Frame feel unchanged; scripts/fps_playtest.py if suspicious"
    why_human: "Runtime performance feel; no automated frame benchmark ran"
---

# Phase 8: Wind Core Verification Report (RE-VERIFICATION round 3 — UAT round-2 gap closure)

**Phase Goal:** One shared wind module (phase, gusts, direction) drives grass, flags, canopies, and smoke, with visibly traveling gust waves.
**Verified:** 2026-07-14T12:00:00Z
**Status:** human_needed
**Re-verification:** Yes — round 3, focused on gap-closure plans 08-10 (flag droop) + 08-11 (projectile→flag impulse)

## Re-Verification Summary

UAT round 2 ran (4 passed / 2 issues) and reopened two gaps: **Gap 1** — the calm/windless
flag never droops in normal play ("its ridged all the time", round-2 test 3); **Gap 2** —
the flag does not react to projectiles flying past (round-2 test 4). Plans 08-10 and 08-11
closed both in code. This pass verified those closures at all levels against the ACTUAL
codebase — **all present, substantive, wired, and unit-pinned** — and regression-checked the
wind-scoped pooled-material lifetime (CR-01/CR-02), the frozen-matrix rule, and
`cloth.castShadow=false`. **No regressions.** The full suite is green (47 files / 731 tests,
run this session; up from 724 — 6 new flagImpulse + 1 new droop assertion). What remains is
exactly the on-screen visual acceptance both plans explicitly routed to human UAT round 3:
the droop-between-gusts read and the projectile kick/settle read.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | Gap 1: FLAG drape rebalanced so the continuous gust envelope drives lift — calm droops | ✓ VERIFIED | `windMath.ts:109` drapeLift 0.15, `:116` drapeLiftGust 0.9; `flagDrape(1,0)` now 0.85 (was 0.30) — `windMath.test.ts:261` `flagDrape(1,0) >= 0.6` green (RED-first per 08-10 SUMMARY) |
| 2 | Gap 1: full-strength lull→gust swing is large (calm droops, gust lifts to taut) | ✓ VERIFIED | `windMath.test.ts:264` `flagDrape(1,0) - flagDrape(1,1) >= 0.6` green; `flagDrape(1,1)≈0`, monotone-in-gust preserved |
| 3 | Gap 1: ?nowind (strength 0) STILL full limp — drape driver stays ×uWindStrength | ✓ VERIFIED | `windMath.ts:181` `1 - min(1, strength*(...))`; `windMath.test.ts:225` `flagDrape(0,g) === 1` exact identity green (D-12 preserved) |
| 4 | Gap 1: pose math single-sourced — flagDrape (JS) and flagDrapeGlsl (GLSL) share the SAME FLAG constants | ✓ VERIFIED | `flagDrape`/`flagDrapeGlsl` bodies unchanged (read the two constants); `windMath.test.ts:302` string pin references `FLAG.drapeLift.toFixed(4)` dynamically — auto-follows, green; `createCampFlag.ts:160` consumes `flagDrapeGlsl` |
| 5 | Gap 1: flagSwing direction/strength (round-2 UAT test 1) NOT regressed — swing constants untouched | ✓ VERIFIED | `FLAG.swingBase 0.75`/`swingGust 0.5` unchanged (`windMath.ts:98-99`); flagSwing tests green |
| 6 | Gap 1: droop between gusts reads as a limp hang on screen; gust lifts/sags | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Math verified; cloth-feel read routes to human UAT round 3 (items 1-2) |
| 7 | Gap 2: projectile flying past kicks the cloth aligned with travel dir, decays to wind pose | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Pipeline present+wired end to end; `decayFlagImpulse` 0.45s + gate unit-pinned; on-screen snap/settle = human item 2 |
| 8 | Gap 2: only flags NEAR an active projectile do work; idle flags cost ~one 3-float write | ✓ VERIFIED | `createMondstadtWorld.ts:509` `withinDisturbRadius` squared gate; `:498` decay loop skips `mag===0`; `flagImpulse.test.ts` (6) green |
| 9 | Gap 2: impulse is ADDITIVE + PER-FLAG via onBeforeRender on the SAME pooled campFlag material | ✓ VERIFIED | `createCampFlag.ts:66-67` module-level shared uniforms, `:119-120` wired by reference, `:257-260` per-flag onBeforeRender writer; cache key `'campFlag'` (`:205`) intact; windMaterialLifecycle 10/10 + assets green |
| 10 | Gap 2: wind pose preserved — impulse sums ON TOP; wind uniforms exactly uTime/uWindDir/uWindStrength; castShadow false; frozen matrix | ✓ VERIFIED | Impulse term `:196-200` post-yaw additive; wind uniforms `:114-116` unchanged; `cloth.castShadow = false` (`:246`); build-time `rotation.y` only (`:268`), onBeforeRender writes uniforms only |
| 11 | Gap 2: coupling mirrors stampGround — disturbFlags wired into the projectile update loop | ✓ VERIFIED | `createEffectSystem.ts:314` `disturbFlags?.(pos.x, pos.z, vel.x/speed, vel.z/speed)` beside `stampGround` (`:309`); `createGame.ts:353` closure passthrough to `world.disturbFlags` |
| 12 | Gap 2: pure impulse math (decay + distance gate) covered test-first | ✓ VERIFIED | `flagImpulse.ts` zero-import `decayFlagImpulse`/`withinDisturbRadius`; `flagImpulse.test.ts` 6 tests green |
| 13 | CR-01/CR-02 wind-scoped pooled-material lifetime NOT regressed | ✓ VERIFIED | `getFlagMaterials:94-101` disposes+rebuilds pole+cloth on wind-instance change; windMaterialLifecycle 10/10 green |
| 14 | Full test suite green with both closures in | ✓ VERIFIED | `pnpm vitest run` this session: 47 files / 731 tests pass, exit 0 |

**Score:** 11/14 truths verified (3 present, behavior-unverified; 0 failed)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/game/systems/windMath.ts` | Rebalanced FLAG.drapeLift/drapeLiftGust; flagDrape/flagDrapeGlsl unchanged bodies | ✓ VERIFIED | `:109` 0.15, `:116` 0.9; doc comments reconciled to continuous-droop model; zero imports |
| `src/game/systems/__tests__/windMath.test.ts` | New continuous-droop assertion + preserved D-12/GLSL-pin | ✓ VERIFIED | `:256` droop test, `:225` full-limp identity, `:302` GLSL string pin — all green |
| `src/game/world/assets/createCampFlag.ts` | Reconciled drape comments (08-10) + impulse uniforms/onBeforeRender/shader term (08-11) | ✓ VERIFIED | Consumes flagDrapeGlsl (`:160`); impulse pipeline `:66-67,119-120,196-200,254-260`; castShadow false; cache key `campFlag`; ~270 LOC |
| `src/game/world/assets/flagImpulse.ts` | Zero-import decay + distance-gate + shared constants | ✓ VERIFIED | `decayFlagImpulse`, `withinDisturbRadius`, `FLAG_IMPULSE_DECAY_SECONDS 0.45`, `FLAG_DISTURB_RADIUS 3.0`, `FlagImpulse` type |
| `src/game/world/assets/__tests__/flagImpulse.test.ts` | Decay window + distance gate pinned test-first | ✓ VERIFIED | 6 tests green |
| `src/game/world/createMondstadtWorld.ts` | Collect flags by name, distance-gated disturbFlags, decay in update() | ✓ VERIFIED | `:469-481` collect + capture world xz once; `:507-515` disturbFlags gate+set; `:497-505` decay skips idle |
| `src/game/systems/createEffectSystem.ts` | Optional disturbFlags callback fired per live projectile | ✓ VERIFIED | `:94` param, `:314` fired beside stampGround with normalized dir |
| `src/game/createGame.ts` | Wire world.disturbFlags into createEffectSystem | ✓ VERIFIED | `:353` closure passthrough (world at `:314` before effect system) |
| `src/game/world/assets/__tests__/windMaterialLifecycle.test.ts` | Unchanged in meaning (CR-01/CR-02) | ✓ VERIFIED | Not modified; 10/10 green |
| `src/game/world/assets/__tests__/assets.test.ts` | Unchanged in meaning (flag invariants) | ✓ VERIFIED | Not modified; green in full run |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| FLAG.drapeLift/drapeLiftGust | flagDrape JS mirror AND flagDrapeGlsl generator | same constants through f() | ✓ WIRED | String pin auto-follows; no drift path |
| flagDrapeGlsl | createCampFlag begin_vertex drape term | template interpolation `:160` | ✓ WIRED | grep-confirmed consumed; no re-derived math |
| projectile update loop | world.disturbFlags | createEffectSystem `:314` → createGame `:353` closure | ✓ WIRED | Normalized travel dir, beside stampGround, alive branch only |
| world.disturbFlags | per-flag userData.flagImpulse | distance gate `:509` sets dirX/dirZ/mag=1 | ✓ WIRED | Same reference the cloth's onBeforeRender reads |
| cloth.userData.flagImpulse | shared uImpulseDir/uImpulseMag | onBeforeRender `:257-260` (per-mesh write) | ✓ WIRED | Writes every frame incl. mag 0 — no inherited kick; Vector2 reused via .set |
| uImpulseDir/uImpulseMag | begin_vertex impulse displacement | local-frame projection `:196-200`, post-yaw, along² | ✓ WIRED | Additive, independent of uWindStrength |
| world.update decay | live flag impulses | decayFlagImpulse `:499` (skips idle) | ✓ WIRED | Frozen-matrix untouched; xz captured once |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full suite regression (once, saved output) | `pnpm vitest run` | 47 files / 731 tests pass, exit 0 | ✓ PASS |
| Continuous-droop RED→GREEN + GLSL pin | windMath.test.ts (from run) | droop, full-limp identity, string pin green | ✓ PASS |
| Pure impulse math (decay + gate) | flagImpulse.test.ts (from run) | 6 tests pass | ✓ PASS |
| CR-01/CR-02 lifecycle regression | windMaterialLifecycle.test.ts (from run) | 10 tests pass | ✓ PASS |
| Flag through shared asset invariants | assets.test.ts (from run) | pass | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes exist and none are declared by the gap plans — SKIPPED.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
| ----------- | ------------ | ----------- | ------ | -------- |
| WIND-01 | 08-10 | Single shared wind module drives all consumers (grass unchanged) | ✓ SATISFIED (code) | Gap-1 drape stays single-sourced in windMath; flagDrape/flagDrapeGlsl share constants; string pin green |
| WIND-03 | 08-10, 08-11 | Per-consumer character on the shared phase (flag flaps/drapes/reacts) | ? NEEDS HUMAN | Drape-droop + projectile-impulse present, wired, unit-pinned; on-screen droop/kick reads route to UAT round 3 |

No orphaned requirements: 08-10 declares `[WIND-01, WIND-03]`, 08-11 declares `[WIND-03]` — both map to Phase 8 in REQUIREMENTS.md; WIND-02 (already verified in the round-2 code pass + humanly confirmed UAT test 2) is untouched by these closures. All IDs accounted for. NOTE (carried forward): REQUIREMENTS.md marks WIND-01/02/03 `Complete` — still premature for WIND-01/WIND-03 until the reopened UAT round-3 visual reads pass.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| src/game/createGame.ts | (whole file) | ~2,000-line monolith vs CLAUDE.md ≤300 LOC | ℹ️ Info | IN-03 carried forward; gap closure added only a one-line closure passthrough |
| windMath.ts / createCampFlag.ts | f() helper | GLSL float-literal helper still duplicated | ℹ️ Info | IN-04 carried forward; not consolidated by these plans |

No TBD/FIXME/XXX/TODO/HACK/placeholder markers in any file modified by 08-10/08-11. No stub patterns: every new constant/uniform/helper flows into the shader patch or the world loop; onBeforeRender writes real per-flag state; disturbFlags mutates real impulse objects.

### Human Verification Required

Both gap closures are code-complete, wired, and unit-pinned; the remaining gate is the
reopened UAT round 3 (run against the laragon-served `dist/` build).

1. **Gap 1 — droop between gusts** (round-2 test 3): calm flag hangs in a clear droop, not a rigid banner; a passing gust lifts it toward taut then it sags back; `?nowind` stays full limp.
2. **Gap 2 — projectile kick + settle** (round-2 test 4): a shot flying past a flag snaps it in the travel direction and it settles within ~0.5s; distant flags do not react; the kick is visible under `?nowind` too.
3. **FPS sanity** (D-13): frame feel unchanged in a projectile-heavy fight near a camp.

### Gaps Summary

No code gaps. Both UAT round-2 gaps are closed in the codebase: Gap 1 by a single-sourced
windMath drape-constant rebalance (test-first RED→GREEN, ?nowind identity preserved, swing
untouched), Gap 2 by an additive per-flag projectile-impulse pipeline that mirrors stampGround
end to end without regressing the pooled `campFlag` material, CR-01/CR-02 lifetime, the
frozen-matrix rule, or `cloth.castShadow=false`. Full suite (731) green. The phase stays
`human_needed` because both closures' acceptance is an on-screen visual read UAT must witness —
the three behavior-unverified items above. After they pass in UAT round 3, WIND-01/WIND-03 can
be considered humanly satisfied.

---

_Verified: 2026-07-14T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
