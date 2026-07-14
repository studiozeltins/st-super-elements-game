---
phase: 08-wind-core
verified: 2026-07-14T03:12:00Z
status: gaps_found
score: 13/20 must-haves verified
behavior_unverified: 4
overrides_applied: 0
gaps:
  - truth: "Grass, camp flags/banners, tree canopies, and campfire smoke columns all sway from ONE shared wind phase — no system drifts out of sync (ROADMAP SC1 / WIND-01)"
    status: failed
    reason: "Module-level material singletons in createCampFlag and createCanopyTree capture the FIRST game instance's wind uniforms. createGame is disposed/recreated by a React effect (App.tsx:757-810) and the app runs under <StrictMode> (main.tsx:50), so every dev session and every prod reconnect builds flags and canopies from cached materials wired to a dead clock whose update() never runs again — flags and canopies freeze while grass and smoke follow the live wind. Code review CR-01/CR-02 (08-REVIEW.md) — confirmed unfixed in the codebase (no commits after the review report b4a2d19)."
    artifacts:
      - path: "src/game/world/assets/createCampFlag.ts"
        issue: "poleMaterial created at module load (line 22); clothMaterial lazy singleton (lines 23, 36-37) ignores the wind argument on every call after the first. disposeObject also disposes these shared materials on world.dispose() while the cache keeps handing them out."
      - path: "src/game/world/assets/createCanopyTree.ts"
        issue: "canopyMaterials Map (line 23) is never invalidated; initCanopyWind (lines 26-28) re-sets canopyWind but getCanopyMaterial returns pooled materials whose onBeforeCompile closure captured the OLD wind (line 41) at creation time — re-injection is dead code for any cached color."
    missing:
      - "Invalidate the canopy material pool when initCanopyWind receives a different wind: dispose orphaned materials and clear the Map (CR-02 fix)"
      - "Scope the flag cloth/pole materials to the wind instance (cache keyed on the wind object, dispose + rebuild on change), or move to a per-world factory closure like createGrassField (CR-01 fix)"
      - "Test asserting a second initCanopyWind/first-flag-build with a different wind yields materials distinct from the first batch"
  - truth: "Canopy caps sway height-weighted — tops move most (Plan 08-03 / WIND-03)"
    status: partial
    reason: "heightWeight ramps on ABSOLUTE world Y (swayBaseY=2.0, createCanopyTree.ts:74) but terrain rises to ~7.5u and canopy trees scatter across the whole map. Any tree with ground Y >= ~3 has weight 1 on every cap vertex including cap bottoms — the whole canopy translates rigidly (reads as sliding off the stationary trunk) and hill trees move more than valley trees under identical wind. Review WR-02, unfixed."
    artifacts:
      - path: "src/game/world/assets/createCanopyTree.ts"
        issue: "clamp((canopyWorld.y - 2.0000) * 0.2000, 0.0, 1.0) — ramp is relative to sea level, not the tree base"
    missing:
      - "Ramp on height-above-tree-base (bake cap base offset into geometry or a vertex attribute), or explicitly accept full-canopy weight and delete the ramp + comment"
  - truth: "Flat frame cost / clean lifecycle for smoke (Plan 08-04)"
    status: partial
    reason: "createGame.dispose() (createGame.ts:1482-1511) tears down debrisSystem, lightPool, world, etc. but never calls smokeColumns?.dispose() — on every game re-creation (StrictMode remount, reconnect) the old InstancedMesh, BoxGeometry, Lambert material, and instance buffers leak in the abandoned scene. Review WR-01, unfixed."
    artifacts:
      - path: "src/game/createGame.ts"
        issue: "smokeColumns created at :358 with a dispose() implementation that is never invoked"
    missing:
      - "Add smokeColumns?.dispose(); next to debrisSystem?.dispose(); in the dispose block"
behavior_unverified_items:
  - truth: "Gusts visibly TRAVEL across the field as a moving wave, not the whole world bowing in unison (ROADMAP SC2 / WIND-02)"
    test: "Stand at a wide grass field for ~60s in the built game (laragon-served dist/)"
    expected: "A gust arrives as a broad front sweeping across the field over ~3-5s — near blades lean before far blades"
    why_human: "The rigid-translation invariant is unit-tested in windMath (gustAt), and the grass shader interpolates the same retarded-time formula via gustGlsl — but the on-screen GPU read (front visible at this speed/wavelength/blade density) is a visual judgment no grep or test exercises"
  - truth: "Each consumer keeps its own character on the shared phase — flags faster, canopies slow/low, smoke drifting laterally (ROADMAP SC3 / WIND-03)"
    test: "Visit a camp; watch flag vs grass vs canopy vs campfire smoke during one gust"
    expected: "Flag flaps visibly faster than grass; canopies subtler and slower with rigid trunks; smoke rises in chunky stepped puffs drifting sideways; all four respond to the same gust as it passes"
    why_human: "Constant ordering (FLAG.freq > SWAY.f1 > CANOPY.freq) is unit-tested, but 'reads as distinct character while coherent' is a perceptual truth"
  - truth: "Grass rendering looks unchanged after the uTime extraction, and ?nowind kills wind-driven sway for bisecting (ROADMAP SC4 / D-01 / D-12)"
    test: "Compare grass at rest vs pre-phase memory; reload with ?nowind and ?nosmoke"
    expected: "Between gusts grass is indistinguishable from the pre-phase build; ?nowind kills gust lean/flag flap/canopy sway/smoke lateral drift (grass base sway intentionally remains per D-12 — NOTE: ROADMAP SC4 literally says 'kills all sway'); ?nosmoke removes smoke entirely"
    why_human: "Arithmetic identity is proven in code (envelope rests at 0, gustGainFactor(0,g)===1 tested, toFixed(4) renders identical literals) but 'looks unchanged' is the locked D-01 contract only human eyes can close. The ?nowind grass-base-sway-remains semantics deviate from the literal ROADMAP SC4 wording by locked decision D-12 — human should confirm intent and consider an override entry"
  - truth: "Campfire smoke puffs rise, drift downwind, and visibly kink at gust fronts at runtime (Plan 08-04)"
    test: "Stand near a campfire for a couple of minutes, include one gust arrival; also check FPS feels unchanged (D-13) and wind direction wanders over several minutes (D-05)"
    expected: "Thin stepped voxel columns rise ~4.5u, lean downwind, kink sharply when a gust passes; no rhythmic hitches; drift direction slowly changes"
    why_human: "The update loop mutates instanced-mesh state per frame — spawn/recycle/drift/fade is a runtime state-transition pipeline with no test exercising it; presence + wiring verified only"
---

# Phase 8: Wind Core Verification Report

**Phase Goal:** Everything that sways in the world moves on one coherent, gusting wind
**Verified:** 2026-07-14T03:12:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | All four consumers sway from ONE shared wind phase, no drift (SC1) | ✗ FAILED | CR-01/CR-02 unfixed: flag + canopy materials are module singletons capturing game #1's wind uniforms; frozen on every StrictMode dev session and prod reconnect (`createCampFlag.ts:22-23,36-37`, `createCanopyTree.ts:23-28,41`; StrictMode confirmed `main.tsx:50`, game re-creation `App.tsx:757-810`) |
| 2 | Gusts visibly TRAVEL across the field (SC2) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Retarded-time front unit-tested (rigid translation, windMath.test.ts green); gustGlsl wired into grass shader (`createGrassField.ts:132`); on-screen read needs human |
| 3 | Per-consumer character on shared phase (SC3) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | FLAG.freq(4.25) > SWAY.f1(1.7) > CANOPY.freq(0.68) unit-tested; all consumers wired; visual character needs human (and is compromised by gap #1 on re-instantiation) |
| 4 | Grass looks unchanged + ?nowind bisect flag (SC4) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Arithmetic identity verified in code + test (`gustGainFactor(0,g)===1`); ?nowind is uniform-driven (`createGame.ts:311-313`); "looks unchanged" is the locked D-01 human gate; note D-12 deviation from SC4's literal "kills all sway" (grass base sway remains) |
| 5 | gustEnvelope stays in [0,1], rests near 0 | ✓ VERIFIED | windMath.test.ts — 13/13 green (ran this session) |
| 6 | Gust peaks every 30-60s, non-metronomic | ✓ VERIFIED | Cadence test: gaps ∈ [20,90]s, mean ∈ [30,60]s, spread > 5s — green |
| 7 | Gust front translates rigidly at GUST.speed | ✓ VERIFIED | Translation-invariance test (|Δ| < 1e-9) — green |
| 8 | windAngle deterministic, bounded wander | ✓ VERIFIED | Determinism + rate ≤ 0.0035 rad/s + ≥ 0.035 rad/10min tests — green |
| 9 | Nine grass sway constants byte-identical to prior literals | ✓ VERIFIED | Exact-value pins in test; `SWAY` in windMath.ts:18-28 matches; grass shader renders them via toFixed(4) (numerically identical) |
| 10 | Exactly ONE wind clock; grass private accumulator gone | ✓ VERIFIED | `wind.update(deltaSeconds)` appears once, at frame() top (`createGame.ts:1325`); zero `deltaSeconds` in createGrassField.ts; GrassField.update deleted |
| 11 | Between-gust grass sway arithmetically identical to pre-phase | ✓ VERIFIED | Gust term is multiplicative `(1.0 + uWindStrength * 1.6000 * gust)`; envelope rests at 0 → factor exactly 1.0 (`createGrassField.ts:133-134`) |
| 12 | ?nowind zeroes strength uniform, no recompile | ✓ VERIFIED | `createWind(false).strengthUniform.value === 0` tested; uniform-driven, cache key `grassField` unchanged |
| 13 | wind.getGustEnvelope() 0..1 — Phase 10 audio contract | ✓ VERIFIED | Interface + implementation + delegation-equality test (`createWind.ts:37,64-66`) |
| 14 | Canopy sway height-weighted — tops move most | ✗ FAILED (partial) | WR-02: absolute-world-Y ramp (swayBaseY 2.0) saturates for trees on terrain y ≥ ~3 — whole canopy translates rigidly on hills; plus frozen on instance #2 (CR-02) |
| 15 | Every camp has a flag whose cloth ripples with a phase gradient, faster than grass | ✗ FAILED | Ripple math + placement wired correctly (`createCampFlag.ts:62-70`, one `placeAroundCamp(createCampFlag...)` per camp), but CR-01 freezes the cloth on every StrictMode dev session and every reconnect — headline feature dead in the standard dev environment |
| 16 | Pooled materials: 4 canopy caps + 1 cloth | ✓ VERIFIED | Map-pooled per color; single lazy cloth singleton with vertex-color banner tint (pooling exists as specified — it is also the mechanism of gap #1) |
| 17 | No updateMatrixWorld — sway is vertex-shader displacement only | ✓ VERIFIED | Neither canopy nor flag registers in any update loop; frozen-matrix rule untouched; distinct cache keys grassField/canopySway/campFlag |
| 18 | Smoke puffs rise, drift downwind, kink at gust fronts near player | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Full pipeline wired (sampleGust drift, live uniform reads `createSmokeColumns.ts:162-181`); runtime spawn/drift/recycle behavior has no test — human item |
| 19 | ?nosmoke skips construction entirely; opaque stepped fade; fixed 48-slot pool | ✓ VERIFIED | Conditional construction (`createGame.ts:358-360`); no `transparent`, no MeshBasicMaterial; hard-cap pool with slot recycling, closure-level scratch objects |
| 20 | Full test suite and production build green with all consumers wired | ✓ VERIFIED | Ran this session: `pnpm vitest run` — 45 files / 703 tests passed; `pnpm build` exit 0 (pre-existing >500kB chunk warning only) |

**Score:** 13/20 truths verified (4 present, behavior-unverified; 3 failed)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/game/systems/windMath.ts` | Zero-import pure helper, 5 constant groups + 7 functions | ✓ VERIFIED | 165 lines, zero imports, no Math.random, all exports present |
| `src/game/systems/__tests__/windMath.test.ts` | Behavioral suite | ✓ VERIFIED | 13 tests, ran green |
| `src/game/systems/createWind.ts` | WindUniforms + Wind + createWind factory | ✓ VERIFIED | 68 lines; one Vector2 mutated in place; groundInfluence-style doc contract |
| `src/game/systems/__tests__/createWind.test.ts` | Factory behavior suite | ✓ VERIFIED | 7 tests, ran green |
| `src/game/world/createGrassField.ts` | Consumes options.wind, local clock deleted, gust term added | ✓ VERIFIED | Uniforms by object reference (:98-100); swayGlsl/gustGlsl generated (:131-132); no private clock |
| `src/game/world/assets/createCanopyTree.ts` | Pooled wind-patched cap materials, canopySway key | ⚠️ HOLLOW on instance #2 | Pool exists and is wired, but never invalidated across wind re-injection (CR-02) + absolute-Y ramp (WR-02) |
| `src/game/world/assets/createCampFlag.ts` | New flag asset, campFlag key, DoubleSide subdivided cloth | ⚠️ HOLLOW on instance #2 | Asset correct on first instance; module-singleton materials capture dead wind on re-creation (CR-01) |
| `src/game/systems/createSmokeColumns.ts` | Fixed instanced puff pool over campfires | ✓ VERIFIED | All Pitfall-5 rules honored; dispose() exists but is never called by createGame (WR-01) |
| `src/game/createGame.ts` | ?nowind/?nosmoke flags, wind before world, wind.update in frame() | ✓ VERIFIED | Flags :311-312; construction :313; frame ordering wind.update(:1325) → smokeColumns?.update(:1345) |
| `src/game/world/createMondstadtWorld.ts` | wind threaded; initCanopyWind + one flag per camp | ✓ VERIFIED | :200, :362, :391, :429 |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| createGame frame() | wind.update(deltaSeconds) | only clock advance | ✓ WIRED | Single occurrence, top of frame() |
| wind uniform objects | grass shader uniforms | by-reference assignment | ✓ WIRED | `shader.uniforms.uTime = wind.timeUniform` etc. |
| windMath swayGlsl/gustGlsl | grass GLSL | template interpolation | ✓ WIRED | Same constants as JS mirrors |
| wind uniform objects | canopy + flag shader uniforms | by-reference in onBeforeCompile | ⚠️ PARTIAL | Wired by reference — but to the FIRST game's wind, permanently, via module-singleton materials (CR-01/CR-02) |
| createMondstadtWorld camp loop | placeAroundCamp(createCampFlag(...)) | decoration loop | ✓ WIRED | Exactly one placement line (:429) |
| wind.sampleGust + directionUniform | per-puff CPU drift | live reads each frame | ✓ WIRED | Components read live, never cached (`createSmokeColumns.ts:162-164`) |
| getCampSites() + getGroundHeight | static fire anchors | construction-time map | ✓ WIRED | No scene traversal |
| createGame frame() | smokeColumns?.update(...) | optional chain after wind.update | ✓ WIRED | Ordering verified in source |
| createGame dispose() | smokeColumns.dispose() | teardown chain | ✗ NOT_WIRED | WR-01 — dispose exists, never called |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| windMath invariants (cadence, rigid front, wander, pins) | `pnpm vitest run src/game/systems/__tests__/windMath.test.ts` | 13/13 pass | ✓ PASS |
| createWind clock/direction/delegation | `pnpm vitest run src/game/systems/__tests__/createWind.test.ts` | 7/7 pass | ✓ PASS |
| Full suite (Plan 08-05 gate truth) | `pnpm vitest run` (once) | 45 files / 703 tests pass | ✓ PASS |
| Production build (Plan 08-05 gate truth) | `pnpm build` | exit 0, built in 5.17s | ✓ PASS |
| Material staleness across game re-creation | — | No test exercises a second initCanopyWind / second flag build with a different wind (assets.test.ts injects once — masks CR-02) | ✗ FAIL (gap) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes exist in this project and none are declared by the phase plans — SKIPPED.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| WIND-01 | 08-01..08-05 | All four consumers sway from ONE shared wind module; grass unchanged after uTime extraction | ✗ BLOCKED | Single-instance wiring complete and tested, but CR-01/CR-02 break one-phase coherence on every game re-creation (StrictMode dev = always; prod reconnect); grass-unchanged also needs the human gate |
| WIND-02 | 08-01, 08-02, 08-05 | Gusts visibly travel (spatial phase offset) | ? NEEDS HUMAN | Math unit-tested (rigid front), shader wired from same constants; "visibly" is the pending playtest item 2 |
| WIND-03 | 08-01, 08-03, 08-04, 08-05 | Per-consumer character: flags faster, smoke lateral drift, canopies low/slow | ✗ BLOCKED | Constants + wiring verified, but flag/canopy character is frozen on instance #2 (CR-01/CR-02) and canopy height ramp no-ops on hills (WR-02) |

No orphaned requirements: REQUIREMENTS.md maps exactly WIND-01/02/03 to Phase 8 and all three appear in plan frontmatter. NOTE: REQUIREMENTS.md already marks all three `[x] Complete` — premature given this verification's gaps and the unrun human playtest.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| src/game/world/assets/createCampFlag.ts | 22-23, 36-37 | Module-level singleton capturing per-instance dependency | 🛑 Blocker | CR-01 — flags frozen on dead wind clock after game re-creation |
| src/game/world/assets/createCanopyTree.ts | 23-28, 41 | Stale closure capture; re-injection is dead code for cached entries | 🛑 Blocker | CR-02 — canopies frozen on dead wind clock after game re-creation |
| src/game/createGame.ts | 1482-1511 | Resource leak — dispose() implemented but never invoked | ⚠️ Warning | WR-01 — InstancedMesh/geometry/material leak per re-creation |
| src/game/world/assets/createCanopyTree.ts | 74 | Silent no-op ramp on half the map | ⚠️ Warning | WR-02 — hill canopies translate rigidly |
| src/game/world/assets/__tests__/assets.test.ts | 29-43 | Suite doc claims full-factory coverage; createCampFlag omitted | ⚠️ Warning | WR-03 — flag escapes group-shape/determinism checks |
| src/game/systems/createSmokeColumns.ts | 49, 130 | `fireIndex` written, never read (dead state; project no-dead-code rule) | ℹ️ Info | IN-01 |
| src/game/systems/windMath.ts | 154-157 | Doc overstates "byte-for-byte" GLSL/CPU parity (toFixed(4) rounding, ~0.11 rad/h drift) | ℹ️ Info | IN-02 — behaviorally negligible |

No TBD/FIXME/XXX/TODO/HACK/placeholder markers in any phase-modified file.

### Human Verification Required

The Plan 08-05 blocking playtest checkpoint was AUTO-APPROVED by the --auto chain (recorded in 08-05-SUMMARY.md) — **no human has run the 10-item checklist**. These items remain open and are consolidated in `behavior_unverified_items` above. Run against the laragon-served `dist/` (not the vite dev server — which, note, is exactly the StrictMode environment where gap #1 freezes flags/canopies):

### 1. Grass unchanged between gusts (D-01 hard gate)
**Test:** Watch grass at rest between gusts. **Expected:** Identical feel to the pre-phase build. **Why human:** Locked visual contract.

### 2. Gust travels as a front (WIND-02/D-03)
**Test:** Watch a wide field for ~60s. **Expected:** Broad front sweeps across over ~3-5s; near blades lean first. **Why human:** GPU visual read.

### 3. Gust strength + cadence (D-04/D-02)
**Test:** ~3 minutes of observation. **Expected:** Peak lean ~2-3× base, not flattened, telegraphs readable; gusts every 30-60s, never on a beat. **Why human:** Perceptual timing/intensity.

### 4. Per-consumer character + coherence (WIND-03/WIND-01)
**Test:** Visit a camp during a gust; alt-tab 30s and return. **Expected:** Flag faster, canopy slower/subtler with rigid trunk, smoke drifts as it rises; all respond to the same passing gust; no desync. **Why human:** Multi-system perceptual judgment.

### 5. Wander (D-05)
**Test:** Several minutes. **Expected:** Drift/travel direction changes slowly — not a fixed fan. **Why human:** Long-horizon visual.

### 6. ?nowind / ?nosmoke (D-12)
**Test:** Reload with each flag. **Expected:** ?nowind kills gust lean/flap/canopy sway/smoke lateral drift (grass base sway remains — D-12 deviation from SC4's literal wording); ?nosmoke removes smoke entirely. **Why human:** End-to-end flag behavior in the real build.

### 7. FPS sanity (D-13)
**Test:** Compare frame feel vs pre-phase; `scripts/fps_playtest.py` if suspicious. **Expected:** Unchanged, no gust-arrival hitches. **Why human:** Runtime performance feel.

### 8. Flag back face (assumption A2)
**Test:** View a flag from behind. **Expected:** Cloth not black on the back face. **Why human:** Known open assumption deferred to playtest; fix (grass normal-fragment borrow) only if it fails.

### Gaps Summary

The wind system's foundation is genuinely solid: the pure math layer is behaviorally tested (cadence, rigid traveling front, bounded wander, exact SWAY extraction), the single-clock architecture is real (one `wind.update` call site, grass's private accumulator deleted), the full suite (703 tests) and build are green, and all four consumers are wired to the same uniform objects by reference.

The phase goal fails on one concern with two expressions: **material lifetime vs game lifetime**. `createCampFlag` and `createCanopyTree` pool their patched materials at MODULE level, capturing the first game instance's wind uniforms in their `onBeforeCompile` closures. The game is disposed and recreated by a React effect under `<StrictMode>`, so every dev session — and every prod reconnect — produces flags and canopies bound to a clock that never ticks again: the phase's headline feature silently frozen, while grass (per-world material) and smoke (per-instance system) keep moving. That directly falsifies SC1 ("no system drifts out of sync") in the standard dev environment. Both were flagged as critical in 08-REVIEW.md and remain unfixed (no commits after the review). Related lifecycle/quality items: smoke never disposed (WR-01), canopy height ramp measured from sea level instead of tree base (WR-02), flag missing from the asset test table (WR-03).

Separately, the ROADMAP's four success criteria are all visual truths and the human playtest gate was auto-approved, not run — so even after the gaps close, the phase needs the checklist walked via `/gsd-verify-work`.

Suggested fix routing: CR-01/CR-02/WR-02/WR-03 → 08-03 scope; WR-01 → 08-04 scope; then re-verify and run the human playtest.

---

_Verified: 2026-07-14T03:12:00Z_
_Verifier: Claude (gsd-verifier)_
