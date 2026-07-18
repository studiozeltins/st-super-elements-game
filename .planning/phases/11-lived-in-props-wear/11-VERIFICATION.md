---
phase: 11-lived-in-props-wear
verified: 2026-07-18T12:30:43Z
status: human_needed
score: 5/5 code-verifiable must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Walk the camp↔plaza↔bridge routes on the LAN build (pnpm build, laragon page — not the dev server)"
    expected: "Footpaths read worn/trampled — lighter, greener tint than packed-dirt roads, grass thinned but blades still poke through, and they never fade"
    why_human: "WEAR-01 visual bake — no test can assert 'reads as a worn path'. Code path (footpathFactor → terrain tint + grass thinning) is present + wired and proven off the decaying channels, but the perceptual read is by-eye only."
  - test: "Inspect the plaza — crates/barrels along the market-tile edge facing the fountain, fences at plaza-boundary / path-entry gaps"
    expected: "Arrangement reads deliberate ('who put this here'), not random scatter; player paths cleanly around props without getting boxed into a pocket"
    why_human: "WEAR-02 perceptual arrangement judgment. Placement is deterministic + collidable in code, but 'reads lived-in' and 'no inescapable collision pocket' (see WR-01 warning) need a playtest."
  - test: "Fight to scorch the ground, leave, return after ~1–3 min; while running watch your own grass-bend trail"
    expected: "Scorch still visible on quick return, healed after longer; grass-bend trail fades in ~2s"
    why_human: "WEAR-03/04 timing feel over a live cycle. The decay math is unit-pinned (VERIFIED below), but the in-engine feel is a perceptual confirmation."
  - test: "Run over grass vs dirt/path/town; then append ?nodust to the URL"
    expected: "No dust on grass; subtle ground-hug puffs (not a spray) on dirt/path/town; ?nodust removes all puffs"
    why_human: "WEAR-05 perceptual + surface-gating by eye. Spawn gate (surface !== 'grass'), hard-capped pool, and ?nodust bisect are code-verified; 'subtle + ground-hugging' read is visual."
  - test: "Run scripts/fps_playtest.py in a golem-class fight with wind + day/night + audio + wear all enabled"
    expected: "No FPS regression vs baseline (toggle ?nodust to isolate dust cost if needed)"
    why_human: "Milestone perf gate — the phase's only new per-frame draw-call source. Cannot be asserted by unit tests."
---

# Phase 11: Lived-in Props & Wear Verification Report

**Phase Goal:** The world looks inhabited and reacts to traffic — paths, props, and healing battle wear
**Verified:** 2026-07-18T12:30:43Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

Every requirement's code path exists, is substantive, and is wired into the world/game loop. The two pure-math requirements (WEAR-03 scorch regrow, WEAR-04 ~2s bend) are behaviorally pinned by passing unit tests. The three perceptual/visual requirements (WEAR-01 footpaths, WEAR-02 plaza props, WEAR-05 dust) have their code paths verified but their by-eye look and the FPS gate are human-verify-only by nature (per 11-VALIDATION.md "Manual-Only Verifications" and 11-08-SUMMARY "Deferred / Human Verification"). No gaps: no code is missing, stubbed, or unwired.

### Observable Truths

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | WEAR-01 — Worn footpaths bake along REAL routes as a static bake and never fade | ✓ VERIFIED (code) | `getFootpaths()` builds a data-driven, same-island route graph (plaza→camp, bridge landings, city camp↔camp) at `roads.ts:135-196`; `footpathFactor` capped at `FOOTPATH_MAX 0.6` (`roads.ts:207-217`); tint baked into terrain **vertex color** (`terrainColorAt`, `terrain.ts:162-163`), never the decaying influence channel, so it is permanent; grass partially thinned (`grassPlacement.ts:80-81`). `roads.test.ts` (6) + `terrain.test.ts` (9) + `grassPlacement.test.ts` (7) green. |
| 1b | WEAR-01 — footpaths *read* as worn/trampled routes by eye | ? HUMAN | Perceptual bake — routed to human verification (item 1). IN-03 review note flags the grass fragment recolor may weaken the tint read — confirm in-engine. |
| 2 | WEAR-02 — Plaza props placed deterministically at data-driven anchors, collidable, lightless, before the freeze | ✓ VERIFIED (code) | `createMondstadtWorld.ts:668-703` seeds `propRandom = WORLD_DECOR_SEED ^ 0xc4a7e`, anchors from `TOWN_DISTRICTS` (market-e/market-ne/plaza — no magic coords), placed at :682-703 **before** `scene.add`/freeze at :705/:711. Factories return `{group, obstacles}` (crate/barrel/fence), assert lightlessness + determinism — `assets.test.ts` (48) green. |
| 2b | WEAR-02 — plaza *reads* lived-in ("who put this here"), player paths around props | ? HUMAN | Perceptual arrangement + collision-pocket risk (WR-01). Routed to human verification (item 2). |
| 3 | WEAR-03 — Scorch/wear heals over minutes, still readable on ~1min return | ✓ VERIFIED (test) | `WEAR_REGROW_TIME_CONSTANT_SECONDS = 75` (`groundInfluenceMath.ts:46`); `wearDecayForDelta(60) > 0.4` and `wearDecayForDelta(180) < 0.1` pinned in `groundInfluenceMath.test.ts:89-94`. Green. |
| 4 | WEAR-04 — Player leaves a ~2s grass-bend trail | ✓ VERIFIED (test) | `DECAY_PER_FRAME_AT_60 = 0.980` (`groundInfluenceMath.ts:15`); `decayForDelta(1) > 0.1`, `(2) < 0.1`, `(3) < 0.03` + frame-rate-independence composition pinned in `groundInfluenceMath.test.ts:70-76`. Green (11 tests). |
| 5 | WEAR-05 — Dust puffs on dirt/path/town only (never grass), hard-capped, ?nodust bisect, surface-aware footsteps | ✓ VERIFIED (code+test) | `surfaceAt` precedence town>dirt>path>grass with `>0.5` road threshold matching `grassPlacement.ts:74` (`surfaceAt.ts:25-30`); spawn gated `surface !== 'grass'` (`createGame.ts:1037-1040`); one classify/frame shared with audio (`createGame.ts:1006/1037/1337`); `DUST_POOL_SIZE=24` hard cap + closure-level scratch (`createDustPuffs.ts:19,85,95-99`); `?nodust` skips construction (`createGame.ts:350,426`); `update`/`dispose` wired (:1511,:1680). `surfaceAt.test.ts` (9) + `createDustPuffs.test.ts` (5) green. |
| 5b | WEAR-05 — dust *reads* subtle + ground-hugging; FPS holds with all ambiance on | ? HUMAN | Perceptual + FPS gate — routed to human verification (items 4, 5). |

**Score:** 5/5 code-verifiable truths verified (0 behavior-unverified). 3 perceptual/FPS dimensions routed to human verification.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/game/systems/groundInfluenceMath.ts` | Retuned bend + wear constants | ✓ VERIFIED | 0.980 / τ=75, doc comments updated, no dead constants |
| `src/game/systems/__tests__/groundInfluenceMath.test.ts` | Re-pinned bend-2s + wear-75s | ✓ VERIFIED | 11 tests green; stale <0.1@60s block replaced |
| `src/game/world/roads.ts` | getFootpaths + footpathFactor | ✓ VERIFIED | Same-island data-driven graph, capped partial mask, reuses smoothstep/distanceToSegment, no aFootpath attribute |
| `src/game/world/__tests__/roads.test.ts` | footpathFactor contract | ✓ VERIFIED | 6 tests green (on-route>0, off-route=0, capped, no across-water) |
| `src/game/world/assets/createCrate.ts` / `createBarrel.ts` / `createFence.ts` | Lightless voxel factories w/ obstacles | ✓ VERIFIED | Merged-box bodies, obstacles declared, no PointLight |
| `src/game/systems/createDustPuffs.ts` | Hard-capped zero-alloc dust pool | ✓ VERIFIED | 24-slot pool, closure scratch, opaque Lambert, scene root |
| `src/game/systems/surfaceAt.ts` | Pure 4-tag classifier | ✓ VERIFIED | THREE-free, precedence order, threshold matches grass |
| `src/game/world/terrain.ts` | Footpath tint (vertex color only) | ✓ VERIFIED | Lerp before road blend; aRoad = roadFactor only |
| `src/game/world/grassPlacement.ts` | Partial footpath thinning | ✓ VERIFIED | Probabilistic drop capped by footpathFactor |
| `src/game/world/createMondstadtWorld.ts` | Deterministic prop placement | ✓ VERIFIED | Before freeze, data-driven anchors, no lights |
| `src/game/createGame.ts` | Dust + surfaceAt + ?nodust wiring | ✓ VERIFIED | Wire-only; one classify/frame; update+dispose |
| `src/game/audio/createMovementAudio.ts` | FootstepSurface widened | ✓ VERIFIED | `FootstepSurface = Surface` re-export (single tag set) |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| `footpathFactor` (roads) | `terrainColorAt` + `grassPlacement` | single source of truth import | ✓ WIRED |
| footpath tint | terrain vertex color ONLY | never aRoad/aRoadCross (only roadFactor written :351-352) | ✓ WIRED |
| `createCrate/Barrel/Fence` | `createMondstadtWorld` placement | `placeAsset` before freeze, obstacles pushed | ✓ WIRED |
| `WEAR_REGROW_TIME_CONSTANT_SECONDS` | scorch (R) + wear (A) decay | one constant read by both | ✓ WIRED |
| `surfaceAt` | dust spawn + footstep audio | one call/frame via `playerSurface` closure var | ✓ WIRED |
| `createDustPuffs` | scene root + game loop | conditional construct, update, dispose | ✓ WIRED |
| `Surface` | `FootstepSurface` | re-export (no drift) | ✓ WIRED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| WEAR-03/04 decay math | `vitest run groundInfluenceMath.test.ts` | 11 passed | ✓ PASS |
| WEAR-05 dust pool cap/expiry/dispose | `vitest run createDustPuffs.test.ts` | 5 passed | ✓ PASS |
| WEAR-05 surface classifier | `vitest run surfaceAt.test.ts` | 9 passed | ✓ PASS |
| WEAR-01 footpath contract | `vitest run roads.test.ts` | 6 passed | ✓ PASS |
| WEAR-01 tint + thinning | `vitest run terrain.test.ts grassPlacement.test.ts` | 16 passed | ✓ PASS |
| WEAR-02 prop factories | `vitest run assets.test.ts` | 48 passed | ✓ PASS |
| Dust "subtle/ground-hug" look + FPS | `scripts/fps_playtest.py` | not runnable in verify (needs live golem fight + WebGL) | ? SKIP → human |

95 phase-related tests pass (SUMMARY claims full suite 837/54 files green; typecheck clean).

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
| ----------- | -------------- | ----------- | ------ | -------- |
| WEAR-01 | 11-02, 11-05 | Worn footpaths along real routes, static bake, never fade | ✓ SATISFIED (code) / ? human (visual) | Route graph + tint + thinning verified; "reads worn" → human |
| WEAR-02 | 11-03, 11-07 | Plaza lived-in props at path/market anchors | ✓ SATISFIED (code) / ? human (visual) | Deterministic collidable placement; "reads lived-in" → human |
| WEAR-03 | 11-01 | Scorch marks regrow over minutes | ✓ SATISFIED | Unit-pinned (τ=75) |
| WEAR-04 | 11-01 | ~2s grass-bend trail | ✓ SATISFIED | Unit-pinned (0.980) |
| WEAR-05 | 11-04, 11-06, 11-08 | Sprint steps on dirt/path puff pooled dust | ✓ SATISFIED (code) / ? human (visual+FPS) | Classifier + pool + wiring verified; "subtle/FPS" → human |

All 5 declared requirement IDs (WEAR-01..05) appear in PLAN frontmatter AND in REQUIREMENTS.md (all marked `[x]` Complete, mapped to Phase 11). No orphaned requirements.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
| ---- | ------- | -------- | ------ |
| (phase-modified files) | No TODO/FIXME/XXX/HACK/placeholder debt markers | — | Clean — completion is auditable |
| `createCrate.ts` / `createBarrel.ts` + `buildTown.populate()` | Refactor turned market-scatter decor from walk-through into solid obstacles (WR-01) | ⚠️ Warning | ~14 scattered market props are now collidable on top of ~9 deliberate stacks; risk of a movement pocket. Verify in playtest (folded into human item 2). |
| `createCrate/Barrel/Fence.ts` | `box()`/`mergedMesh()` copy-pasted verbatim across 3 files (WR-02) | ⚠️ Warning | DRY violation vs CLAUDE.md; three divergence points. Quality debt, not a goal blocker. |
| `createGame.ts:1038-1040` | Dust emitted per-frame while moving, not per footstep (IN-01) | ℹ️ Info | Reads as continuous stream vs discrete puffs; no perf risk (pool capped). Tuning. |
| `createGame.ts` (stun path) | `playerSurface` goes stale during knockback slide (IN-02) | ℹ️ Info | Cosmetic audio-gate only. |
| `terrain.ts` (grass fragment) | Footpath vertex tint may be recolored by grass fragment branch (IN-03) | ℹ️ Info | Tint may read weaker than vertex color — confirm in human item 1. |

### Human Verification Required

See frontmatter `human_verification` — 5 items covering the perceptual reads (WEAR-01 worn-path look, WEAR-02 lived-in arrangement + collision-pocket check, WEAR-03/04 live timing feel, WEAR-05 subtle ground-hug dust) and the `scripts/fps_playtest.py` FPS gate. All are visual/timing/perf checks that unit tests cannot assert. This is the deferred phase-gate checkpoint from 11-08 Task 3.

### Gaps Summary

None. Every requirement's code path exists, is substantive, and is wired; the two math requirements are unit-pinned green; the full targeted test set (95 tests) passes and typecheck is clean. The remaining work is purely the human perceptual + FPS gate that was deliberately deferred (VALIDATION.md Manual-Only table). Two code-review warnings (WR-01 solid-obstacle regression, WR-02 DRY duplication) are quality/tuning items, not goal blockers — WR-01 is folded into the plaza playtest so the developer can confirm the player is not boxed in.

---

_Verified: 2026-07-18T12:30:43Z_
_Verifier: Claude (gsd-verifier)_
