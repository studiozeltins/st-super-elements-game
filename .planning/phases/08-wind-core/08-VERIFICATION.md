---
phase: 08-wind-core
verified: 2026-07-14T08:10:00Z
status: human_needed
score: 16/20 must-haves verified
behavior_unverified: 4
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 13/20
  gaps_closed:
    - "Grass, camp flags/banners, tree canopies, and campfire smoke columns all sway from ONE shared wind phase — no system drifts out of sync (SC1/WIND-01, CR-01/CR-02)"
    - "Canopy caps sway height-weighted — tops move most (WIND-03, WR-02)"
    - "Flat frame cost / clean lifecycle for smoke (WR-01)"
  gaps_remaining: []
  regressions: []
behavior_unverified_items:
  - truth: "Gusts visibly TRAVEL across the field as a moving wave, not the whole world bowing in unison (ROADMAP SC2 / WIND-02)"
    test: "Stand at a wide grass field for ~60s in the built game (laragon-served dist/)"
    expected: "A gust arrives as a broad front sweeping across the field over ~3-5s — near blades lean before far blades"
    why_human: "The rigid-translation invariant is unit-tested in windMath (gustAt), and the grass shader interpolates the same retarded-time formula via gustGlsl — but the on-screen GPU read (front visible at this speed/wavelength/blade density) is a visual judgment no grep or test exercises"
  - truth: "Each consumer keeps its own character on the shared phase — flags faster, canopies slow/low, smoke drifting laterally (ROADMAP SC3 / WIND-03)"
    test: "Visit a camp; watch flag vs grass vs canopy vs campfire smoke during one gust; also alt-tab 30s and return to confirm no desync"
    expected: "Flag flaps visibly faster than grass; canopies subtler and slower with rigid trunks (tops moving more than cap bottoms — the new tree-base ramp); smoke rises in chunky stepped puffs drifting sideways; all four respond to the same gust as it passes"
    why_human: "Constant ordering (FLAG.freq > SWAY.f1 > CANOPY.freq) and the aTreeHeight ramp math are unit-tested, but 'reads as distinct character while coherent' is a perceptual truth"
  - truth: "Grass rendering looks unchanged after the uTime extraction, and ?nowind kills wind-driven sway for bisecting (ROADMAP SC4 / D-01 / D-12)"
    test: "Compare grass at rest vs pre-phase memory; reload with ?nowind and ?nosmoke"
    expected: "Between gusts grass is indistinguishable from the pre-phase build; ?nowind kills gust lean/flag flap/canopy sway/smoke lateral drift (grass base sway intentionally remains per D-12 — NOTE: ROADMAP SC4 literally says 'kills all sway'); ?nosmoke removes smoke entirely"
    why_human: "Arithmetic identity is proven in code (envelope rests at 0, gustGainFactor(0,g)===1 tested, toFixed(4) renders identical literals) but 'looks unchanged' is the locked D-01 contract only human eyes can close. The ?nowind grass-base-sway-remains semantics deviate from the literal ROADMAP SC4 wording by locked decision D-12 — human should confirm intent and consider an override entry"
  - truth: "Campfire smoke puffs rise, drift downwind, and visibly kink at gust fronts at runtime (Plan 08-04)"
    test: "Stand near a campfire for a couple of minutes, include one gust arrival; also check FPS feels unchanged (D-13) and wind direction wanders over several minutes (D-05)"
    expected: "Thin stepped voxel columns rise ~4.5u, lean downwind, kink sharply when a gust passes; no rhythmic hitches; drift direction slowly changes"
    why_human: "The update loop mutates instanced-mesh state per frame — spawn/recycle/drift/fade is a runtime state-transition pipeline with no test exercising it; presence + wiring verified only"
human_verification:
  - test: "Grass at rest between gusts vs pre-phase build (D-01 hard gate)"
    expected: "Identical feel — no visible change to base sway"
    why_human: "Locked visual contract; arithmetic identity proven but 'looks unchanged' needs eyes"
  - test: "Watch a wide grass field for ~60s (WIND-02 / D-03)"
    expected: "Gust arrives as a broad front sweeping across over ~3-5s; near blades lean before far blades"
    why_human: "GPU visual read of the traveling front"
  - test: "Gust strength + cadence over ~3 minutes (D-04 / D-02)"
    expected: "Peak lean ~2-3x base, telegraph readable; gusts every 30-60s, never on a beat"
    why_human: "Perceptual timing/intensity"
  - test: "Visit a camp during a gust; alt-tab 30s and return (WIND-03 / WIND-01)"
    expected: "Flag faster than grass, canopy slower/subtler with rigid trunk and tops moving most, smoke drifts as it rises; all respond to the same passing gust; no desync after alt-tab"
    why_human: "Multi-system perceptual coherence judgment"
  - test: "Watch drift/travel direction over several minutes (D-05)"
    expected: "Direction changes slowly — not a fixed fan"
    why_human: "Long-horizon visual"
  - test: "Reload with ?nowind, then ?nosmoke (D-12)"
    expected: "?nowind kills gust lean/flap/canopy sway/smoke lateral drift (grass base sway remains — D-12 deviation from SC4's literal wording); ?nosmoke removes smoke entirely"
    why_human: "End-to-end flag behavior in the real build; D-12 vs SC4 wording needs human sign-off (consider an override entry)"
  - test: "FPS sanity vs pre-phase (D-13); scripts/fps_playtest.py if suspicious"
    expected: "Unchanged frame feel, no gust-arrival hitches"
    why_human: "Runtime performance feel"
  - test: "View a camp flag from behind (assumption A2)"
    expected: "Cloth not black on the back face"
    why_human: "Known open assumption deferred to playtest; fix (grass normal-fragment borrow) only if it fails"
  - test: "StrictMode/reconnect coherence spot-check: run the vite dev server (npm run dev, StrictMode double-mount) and confirm flags + canopies sway"
    expected: "Flags flap and canopies sway in the dev server too — the environment where the old CR-01/CR-02 freeze always reproduced"
    why_human: "The staleness fix is unit-test-pinned, but the full React remount path (dispose -> new wind -> rebuild) is best confirmed once in the real double-mount environment"
---

# Phase 8: Wind Core Verification Report (RE-VERIFICATION)

**Phase Goal:** Everything that sways in the world moves on one coherent, gusting wind
**Verified:** 2026-07-14T08:10:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (plans 08-06, 08-07; commits 7c4e9c6..cf6a382)

## Re-Verification Summary

Prior report (2026-07-14T03:12Z): gaps_found, 13/20, 3 gaps. All 3 gaps re-checked against the current codebase with full 3-level verification — **all closed**, each pinned by a new RED-first regression test. All previously-passed truths regression-checked — **no regressions** (full suite 46 files / 716 tests green this session; production build exit 0). What remains is exactly the human playtest that plan 08-05's blocking checkpoint deferred: it was auto-approved in --auto mode and **has still never been run by a human**, so all four ROADMAP success criteria (all visual truths) stay behavior-unverified.

### Gap Closure Evidence

**Gap 1 — CR-01/CR-02: flag + canopy materials frozen to the first game's wind — CLOSED (commit 554858a; RED test commit 7c4e9c6)**

- `src/game/world/assets/createCampFlag.ts:30-57` — module singletons replaced by a wind-guarded cache (`flagWind` identity check in `getFlagMaterials`); a different wind disposes both cached materials and lazily rebuilds them, so the cloth's `onBeforeCompile` closure captures the LIVE game's uniform objects. Shader patch and `campFlag` cache key byte-identical to before (lifetime-only change).
- `src/game/world/assets/createCanopyTree.ts:43-49` — `initCanopyWind` now disposes every pooled material and calls `canopyMaterials.clear()` when a different wind arrives; `getCanopyMaterial` rebuilds against the new uniforms. Same-wind re-injection is a no-op (D-13 pooling preserved).
- Regression-pinned: `windMaterialLifecycle.test.ts` (10 tests, ran green this session) covers staleness (fresh materials on new wind, for canopy AND both flag materials), orphan disposal (dispose events fire), and same-wind pooling preservation. The 08-06 SUMMARY records 4/6 lifecycle tests failing RED against the pre-fix singletons at commit 7c4e9c6 — the freeze cannot silently return.
- `createWind` returns a fresh object literal per call (`createWind.ts:40-68`), so the `!==` identity guard reliably distinguishes game instances.

**Gap 2 — WR-02: canopy height ramp measured from sea level — CLOSED (commit 42adcdd; RED test commit 20b5cff)**

- `src/game/world/assets/createCanopyTree.ts:143-148` — each cap bakes `aTreeHeight = layerHeight + localY * CAP_SCALE_Y` (height above the TREE base) into a per-vertex attribute; `CAP_SCALE_Y = 0.55` (line 20) is the single source for both `cap.scale.y` (line 154) and the bake, so baked heights equal rendered heights (Y-only cap rotation is height-invariant; the group carries no scale; `placeAsset` only translates).
- Shader (lines 86, 100): `attribute float aTreeHeight;` declared; `heightWeight = clamp((aTreeHeight - 2.0000) * 0.2000, 0.0, 1.0)` — no non-comment `canopyWorld.y` read remains in the ramp; `canopyWorld` survives solely for the wind-direction projection. Hill and valley trees now get identical weights; cap bottoms (~0.8u above base, below swayBaseY 2.0) stay near the trunk while tops ramp to 1.
- CANOPY constants untouched (`windMath.ts:76-77` — swayBaseY 2.0, invSwaySpan 0.2; doc comment corrected, IN-02 "byte-for-byte" claim softened at :158).
- Regression-pinned: 4 aTreeHeight tests (attribute shape, span > 1, layer ordering, determinism) in `windMaterialLifecycle.test.ts:105-163`, green.

**Gap 3 — WR-01: smoke never disposed by createGame — CLOSED (commit b0fcdb7)**

- `src/game/createGame.ts:1502` — `smokeColumns?.dispose();` sits in the dispose block between `debrisSystem?.dispose()` (:1501) and `lightPool?.dispose()` (:1503), matching the optional-system teardown pattern, and runs before `world.dispose()`/renderer teardown.
- `src/game/systems/createSmokeColumns.ts:201-208` — dispose now also calls `mesh.dispose()`, which releases the instanceMatrix/instanceColor GPU buffers that geometry+material disposal alone do not free.
- Bonus (IN-01 cleared): the dead per-puff `fireIndex` field is gone from the interface, pool initializer, and `spawnPuff` — zero non-comment occurrences remain.

**Warning WR-03 (flag missing from asset invariants suite) — also CLOSED (commit ce74406):** `assets.test.ts:27-28,44` hoists `const testWind = createWind(true)` and adds `createCampFlag: { create: random => createCampFlag(random, testWind), climbable: false }` to FACTORIES; the "every factory exported from assets/index.ts" doc claim is true again; the flag passes the group-shape/determinism/non-climbable checks (39 tests green).

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | All four consumers sway from ONE shared wind phase, no drift (SC1) | ✓ VERIFIED | Wind-scoped material caches close CR-01/CR-02; a second game's flags/canopies bind to ITS wind (behaviorally tested — windMaterialLifecycle 10/10 green); all four consumers share the same uniform objects by reference; on-screen coherence read remains in human item 4 |
| 2 | Gusts visibly TRAVEL across the field (SC2) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Retarded-time front unit-tested (rigid translation); gustGlsl wired into grass shader; on-screen read needs human (playtest never run) |
| 3 | Per-consumer character on shared phase (SC3) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | FLAG.freq(4.25) > SWAY.f1(1.7) > CANOPY.freq(0.68) unit-tested; all consumers wired and now lifetime-correct; visual character needs human |
| 4 | Grass looks unchanged + ?nowind bisect flag (SC4) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Arithmetic identity verified (`gustGainFactor(0,g)===1` tested); ?nowind uniform-driven (`createGame.ts:311-313` unchanged); "looks unchanged" is the locked D-01 human gate; D-12 deviation from SC4's literal "kills all sway" still needs human sign-off |
| 5 | gustEnvelope stays in [0,1], rests near 0 | ✓ VERIFIED | windMath.test.ts green in this session's full run (716/716) |
| 6 | Gust peaks every 30-60s, non-metronomic | ✓ VERIFIED | Cadence test green (regression check via full run) |
| 7 | Gust front translates rigidly at GUST.speed | ✓ VERIFIED | Translation-invariance test green |
| 8 | windAngle deterministic, bounded wander | ✓ VERIFIED | Determinism + rate tests green |
| 9 | Nine grass sway constants byte-identical to prior literals | ✓ VERIFIED | Exact-value pins green; SWAY values untouched by gap closure (comment-only windMath edits; swayBaseY 2.0 / invSwaySpan 0.2 confirmed at :76-77) |
| 10 | Exactly ONE wind clock; grass private accumulator gone | ✓ VERIFIED | Regression grep: `wind.update(` appears once in game code (`createGame.ts:1325`); other hits are tests/comments |
| 11 | Between-gust grass sway arithmetically identical to pre-phase | ✓ VERIFIED | Multiplicative gust term unchanged; envelope rests at 0 → factor exactly 1.0 |
| 12 | ?nowind zeroes strength uniform, no recompile | ✓ VERIFIED | `createWind(false)` test green; flag wiring confirmed unchanged (`createGame.ts:311-313`) |
| 13 | wind.getGustEnvelope() 0..1 — Phase 10 audio contract | ✓ VERIFIED | Delegation-equality test green (createWind.test.ts in full run) |
| 14 | Canopy sway height-weighted — tops move most | ✓ VERIFIED | WR-02 closed: per-vertex `aTreeHeight` ramp (tree-local, terrain-independent), bake math = render math via shared CAP_SCALE_Y; 4 behavioral tests pin attribute shape/span/layer-ordering/determinism; on-screen subtlety folded into human item 4 |
| 15 | Every camp has a flag whose cloth ripples with a phase gradient, faster than grass | ✓ VERIFIED | Ripple math + one `placeAroundCamp(createCampFlag...)` per camp unchanged; CR-01 closed so the cloth binds to the live wind on every instance; flag now also passes the shared invariants suite (WR-03) |
| 16 | Pooled materials: 4 canopy caps + 1 cloth | ✓ VERIFIED | Pooling now scoped per wind lifetime (the correct lifetime): 4 canopy + 1 cloth + 1 pole per wind, same-wind reuse behaviorally pinned (windMaterialLifecycle same-wind tests) |
| 17 | No updateMatrixWorld — sway is vertex-shader displacement only | ✓ VERIFIED | Gap fixes are lifetime/bake-only; neither canopy nor flag registers in any update loop; distinct cache keys grassField/canopySway/campFlag intact |
| 18 | Smoke puffs rise, drift downwind, kink at gust fronts near player | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Pipeline wired (live uniform reads, spawn/recycle); runtime instanced-mesh state pipeline still has no test — human item |
| 19 | ?nosmoke skips construction entirely; opaque stepped fade; fixed 48-slot pool | ✓ VERIFIED | Conditional construction confirmed (`createGame.ts:358-360`); update loop untouched by 08-07 (dispose + dead-state removal only) |
| 20 | Full test suite and production build green with all consumers wired | ✓ VERIFIED | Ran this session: `pnpm vitest run` — 46 files / 716 tests passed (703 prior + 13 new: 10 lifecycle + 3 flag-factory cases); `pnpm build` exit 0 (pre-existing >500kB chunk warning only) |

**Score:** 16/20 truths verified (4 present, behavior-unverified; 0 failed)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/game/systems/windMath.ts` | Pure helper, constants + GLSL generators | ✓ VERIFIED | Comment-only edits in gap closure; constants unchanged |
| `src/game/systems/createWind.ts` | Wind factory, fresh object per call | ✓ VERIFIED | Unchanged; per-call object literal makes the `!==` cache guards sound |
| `src/game/world/createGrassField.ts` | Consumes options.wind | ✓ VERIFIED | Untouched by gap closure; regression via full suite |
| `src/game/world/assets/createCanopyTree.ts` | Wind-scoped pooled cap materials + tree-local sway ramp | ✓ VERIFIED | Pool invalidation in initCanopyWind (:43-49); aTreeHeight bake (:143-148) + shader ramp (:100); was HOLLOW-on-instance-#2, now lifetime-correct and test-pinned |
| `src/game/world/assets/createCampFlag.ts` | Wind-guarded material cache, campFlag key, DoubleSide cloth | ✓ VERIFIED | getFlagMaterials wind guard (:46-57); shader patch + cache key untouched; was HOLLOW-on-instance-#2, now lifetime-correct and test-pinned |
| `src/game/world/assets/__tests__/windMaterialLifecycle.test.ts` | NEW regression suite for CR-01/CR-02/WR-02 | ✓ VERIFIED | 10 tests, ran green this session; RED phase recorded in 08-06 SUMMARY at commits 7c4e9c6/20b5cff |
| `src/game/world/assets/__tests__/assets.test.ts` | createCampFlag in FACTORIES table | ✓ VERIFIED | testWind hoisted (:27), flag entry (:44); 39 tests green |
| `src/game/systems/createSmokeColumns.ts` | Complete dispose, no dead state | ✓ VERIFIED | mesh.dispose() added (:207); fireIndex gone (zero non-comment occurrences) |
| `src/game/createGame.ts` | smoke teardown wired into dispose() | ✓ VERIFIED | `smokeColumns?.dispose()` at :1502, adjacent to debrisSystem/lightPool teardown, before world/renderer disposal |
| `src/game/world/createMondstadtWorld.ts` | wind threaded; initCanopyWind + one flag per camp | ✓ VERIFIED | Untouched by gap closure; regression via full suite |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| createGame frame() | wind.update(deltaSeconds) | only clock advance | ✓ WIRED | Single occurrence (`createGame.ts:1325`) |
| wind uniform objects | grass shader uniforms | by-reference assignment | ✓ WIRED | Unchanged |
| wind uniform objects | canopy + flag shader uniforms | by-reference in onBeforeCompile, per wind lifetime | ✓ WIRED | Was PARTIAL (bound to first game's wind forever); now caches are keyed on the wind instance — rebuild on new wind is behaviorally tested |
| initCanopyWind(newWind) | canopyMaterials pool cleared + orphans disposed | identity guard | ✓ WIRED | `createCanopyTree.ts:43-49`; dispose events asserted in test |
| createCampFlag(random, wind) | wind-guarded material cache | getFlagMaterials | ✓ WIRED | `createCampFlag.ts:46-57`; rebuild + disposal asserted in test |
| cap geometry aTreeHeight attribute | shader heightWeight ramp | BufferAttribute → attribute read | ✓ WIRED | Bake :148, GLSL declaration :86, ramp :100; no world-Y read remains |
| createMondstadtWorld camp loop | placeAroundCamp(createCampFlag(...)) | decoration loop | ✓ WIRED | Unchanged |
| wind.sampleGust + directionUniform | per-puff CPU drift | live reads each frame | ✓ WIRED | Unchanged |
| createGame frame() | smokeColumns?.update(...) | after wind.update | ✓ WIRED | :1345, ordering intact |
| createGame dispose() | smokeColumns.dispose() | teardown chain | ✓ WIRED | Was NOT_WIRED (WR-01); now :1502, and dispose releases mesh + geometry + material + instance buffers |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Material staleness across game re-creation (the prior report's failing spot-check) | `pnpm vitest run src/game/world/assets/__tests__/windMaterialLifecycle.test.ts` | 10/10 pass (staleness, orphan disposal, same-wind pooling, aTreeHeight invariants) | ✓ PASS |
| Flag through shared asset invariants | `pnpm vitest run src/game/world/assets/__tests__/assets.test.ts` | 39/39 pass (flag: shape, determinism, non-climbable) | ✓ PASS |
| Full suite regression (once) | `pnpm vitest run` | 46 files / 716 tests pass | ✓ PASS |
| Production build | `pnpm build` | exit 0, built in 5.96s (pre-existing chunk-size warning only) | ✓ PASS |
| TDD RED-first evidence | git log 7c4e9c6..cf6a382 | test commits 7c4e9c6 (lifecycle) and 20b5cff (aTreeHeight) precede fix commits 554858a and 42adcdd; 08-06 SUMMARY records observed RED failures | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes exist in this project and none are declared by the phase plans — SKIPPED.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| WIND-01 | 08-01..08-07 | All four consumers sway from ONE shared wind module; grass unchanged after uTime extraction | ? NEEDS HUMAN | Code-side fully satisfied and regression-pinned (CR-01/CR-02 closed); "grass unchanged" (D-01) and on-screen coherence remain the unrun human gate |
| WIND-02 | 08-01, 08-02, 08-05, 08-06 | Gusts visibly travel (spatial phase offset) | ? NEEDS HUMAN | Math unit-tested (rigid front), shader wired; "visibly" is playtest item 2 |
| WIND-03 | 08-01, 08-03, 08-04, 08-05..08-07 | Per-consumer character: flags faster, smoke lateral drift, canopies low/slow | ? NEEDS HUMAN | Constants, wiring, and now lifetime + tree-base ramp all verified; perceptual character is playtest item 4 |

No orphaned requirements: REQUIREMENTS.md maps exactly WIND-01/02/03 to Phase 8 and all three appear in plan frontmatter (gap plans 08-06/08-07 included). NOTE (carried forward): REQUIREMENTS.md marks all three `[x] Complete` — still premature until the human playtest closes the visual criteria.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| src/game/createGame.ts | (whole file) | 1,983-line monolith vs CLAUDE.md ≤300 LOC rule | ℹ️ Info | IN-03 — explicitly declined in gap-closure scope; recorded debt (next touch: extract createAmbiance) |
| windMath.ts:139-141, createCampFlag.ts:17, createCanopyTree.ts:14 | — | GLSL float-literal helper `f()` duplicated in three files | ℹ️ Info | IN-04 — trivial DRY nit from re-review; export from windMath next touch |

All prior blockers (CR-01, CR-02) and warnings (WR-01, WR-02, WR-03) resolved and verified against code. No TBD/FIXME/XXX/TODO/HACK/placeholder markers in any phase-modified file (scanned this session).

### Human Verification Required

**The Plan 08-05 blocking playtest checkpoint has STILL not been run by a human** — it was auto-approved in --auto mode. All code-level gaps are now closed, so this checklist is the only remaining gate. Run against the laragon-served `dist/` build; item 9 additionally uses the vite dev server (the StrictMode environment where the old freeze reproduced).

### 1. Grass unchanged between gusts (D-01 hard gate)
**Test:** Watch grass at rest between gusts. **Expected:** Identical feel to the pre-phase build. **Why human:** Locked visual contract.

### 2. Gust travels as a front (WIND-02/D-03)
**Test:** Watch a wide field for ~60s. **Expected:** Broad front sweeps across over ~3-5s; near blades lean first. **Why human:** GPU visual read.

### 3. Gust strength + cadence (D-04/D-02)
**Test:** ~3 minutes of observation. **Expected:** Peak lean ~2-3x base, telegraphs readable; gusts every 30-60s, never on a beat. **Why human:** Perceptual timing/intensity.

### 4. Per-consumer character + coherence (WIND-03/WIND-01)
**Test:** Visit a camp during a gust; alt-tab 30s and return. **Expected:** Flag faster, canopy slower/subtler with rigid trunk and tops moving most, smoke drifts as it rises; all respond to the same passing gust; no desync. **Why human:** Multi-system perceptual judgment.

### 5. Wander (D-05)
**Test:** Several minutes. **Expected:** Drift/travel direction changes slowly — not a fixed fan. **Why human:** Long-horizon visual.

### 6. ?nowind / ?nosmoke (D-12)
**Test:** Reload with each flag. **Expected:** ?nowind kills gust lean/flap/canopy sway/smoke lateral drift (grass base sway remains — D-12 deviation from SC4's literal wording); ?nosmoke removes smoke entirely. **Why human:** End-to-end flag behavior; D-12 vs SC4 wording needs sign-off (consider an override entry).

### 7. FPS sanity (D-13)
**Test:** Compare frame feel vs pre-phase; `scripts/fps_playtest.py` if suspicious. **Expected:** Unchanged, no gust-arrival hitches. **Why human:** Runtime performance feel.

### 8. Flag back face (assumption A2)
**Test:** View a flag from behind. **Expected:** Cloth not black on the back face. **Why human:** Known open assumption; fix (grass normal-fragment borrow) only if it fails.

### 9. StrictMode remount coherence (CR-01/CR-02 fix, end-to-end)
**Test:** Open the vite dev server (`npm run dev`, StrictMode double-mount) and confirm flags flap + canopies sway. **Expected:** Both animate — this environment previously froze them 100% of the time. **Why human:** The rebuild path is unit-test-pinned, but one look in the real double-mount environment closes it end-to-end.

### Gaps Summary

No code gaps remain. All three gaps from the initial verification were closed by plans 08-06/08-07 (commits 7c4e9c6..cf6a382) and verified directly against the codebase — not from SUMMARY claims: the wind-scoped material caches are identity-sound and dispose their orphans, the canopy ramp is terrain-independent with bake math matching render math, and the smoke teardown chain is wired and complete. Each fix is guarded by RED-first regression tests (13 new tests; full suite 716/716 green; build green). The re-review (08-REVIEW.md) independently confirms resolution, leaving only two info-level debts (IN-03 monolith, IN-04 helper duplication).

The phase's remaining exposure is singular: all four ROADMAP success criteria are visual truths, and the human playtest that plan 08-05 gated on was auto-approved, never run. Until a human walks the 9-item checklist above (via `/gsd-verify-work`), the phase goal — "everything that sways moves on one coherent, gusting wind" — is proven in math, wiring, and lifetime, but not on screen.

---

_Verified: 2026-07-14T08:10:00Z_
_Verifier: Claude (gsd-verifier)_
