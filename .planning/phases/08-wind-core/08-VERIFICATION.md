---
phase: 08-wind-core
verified: 2026-07-14T10:50:00Z
status: human_needed
score: 14/20 must-haves verified
behavior_unverified: 6
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 16/20
  gaps_closed:
    - "UAT tests 4/5/9 (major): flag cloth now yaws/streams toward uWindDir in-shader — direction enters the DISPLACEMENT via flagSwingGlsl, not just the gust-front phase (plans 08-08/08-09)"
    - "UAT test 6 (minor): ?nowind / gust-lull limp drape — flagDrapeGlsl pitches the cloth down the pole at strength 0 with a drape-gated micro-sway, never a rigid horizontal quad"
    - "UAT test 8 (cosmetic): voxel-stepped cloth — CLOTH_BANDS floor-quantization + flatShading facets"
  gaps_remaining: []
  regressions: []
behavior_unverified_items:
  - truth: "Flag cloth visibly swings/streams toward the current wind direction, free end leading, and gusts snap it further downwind — same passing gust the smoke answers (UAT tests 4/5/9 reopened; WIND-01/WIND-03, D-05)"
    test: "Visit a camp during a gust in the built game (laragon dist/); compare the flag's swing direction to the fireplace smoke's kink; watch several minutes for the wander"
    expected: "Flag streams the SAME direction the smoke drifts; harder gusts swing it harder (75% aligned steady -> fully aligned at gust peak); pointing direction follows the slow wander, not one fixed axis"
    why_human: "The signed-angle yaw (atan(sinA,cosA) from modelMatrix[0].xz vs uWindDir) is self-consistent on paper and the flagSwing blend is unit-tested, but this exact invariant was FALSIFIED once by UAT — only eyes can confirm the rework reads correctly on screen"
  - truth: "Per-consumer character coheres with the flag reworked — flag faster AND direction-following, canopy slow/subtle, smoke lateral drift, all on one gust (ROADMAP SC3/SC1)"
    test: "Same camp visit: watch flag vs grass vs canopy vs smoke during one gust arrival; alt-tab 30s and return"
    expected: "All four respond to the same passing gust with distinct character; no desync after alt-tab; the flag no longer wiggles on a fixed axis"
    why_human: "Constants ordering and shared-uniform wiring are code-verified; multi-system perceptual coherence is a visual judgment, and the flag half of it was the UAT failure being re-verified"
  - truth: "?nowind (and deep lulls) hangs the cloth limp down the pole with a faint micro-sway — never a rigid horizontal quad (UAT test 6 reopened, D-12)"
    test: "Reload with ?nowind and look at a camp flag"
    expected: "Cloth pitched ~83 degrees down the pole (drapePitch 1.45), stepped voxel hang, tiny lazy pendulum sway (limpFreq 0.9 < grass f1 1.7); grass base sway still runs (D-12 semantics, accepted in UAT test 6 note)"
    why_human: "flagDrape(0,g)===1 is an exact unit-tested identity and the micro-sway term is verifiably NOT gated on uWindStrength, but 'hangs like cloth' is the user's visual acceptance bar"
  - truth: "Cloth reads chunky/voxel-faceted matching the game's art identity (UAT test 8 request, D-09)"
    test: "Look at a flag up close during wind and at rest"
    expected: "Discrete stepped bands (6), flat-shaded facets — not a smooth sheet"
    why_human: "flatShading:true and the alongQ quantization are present in code; 'reads chunky enough' is a cosmetic perceptual call"
  - truth: "Frame feel unchanged after the flag shader rework (D-13)"
    test: "Play near a camp; run scripts/fps_playtest.py if anything feels off"
    expected: "No regression — the patch adds atan + two rotations per cloth vertex (65 verts x a handful of flags, negligible on paper)"
    why_human: "Runtime performance feel; no automated frame benchmark ran"
  - truth: "Flag back face not black (assumption A2 — now MORE reachable since the cloth yaws toward the wind and can flip relative to the fixed camera)"
    test: "Watch a flag as the wander swings the wind direction around"
    expected: "DoubleSide Lambert cloth readable from both sides"
    why_human: "Skipped in the first UAT (fixed camera couldn't see it); the new downwind yaw makes back-face exposure more likely, so it should ride along in the re-verify"
human_verification:
  - test: "Flag answers gust direction + strength like the smoke does (reopened UAT 4/5/9)"
    expected: "Flag streams the same direction smoke kinks; harder gusts swing harder; direction follows the slow wander over minutes"
    why_human: "The one invariant UAT falsified — code fix present, wired, math-pinned, but unwitnessed"
  - test: "Four-consumer coherence at a camp during one gust; alt-tab 30s (SC1/SC3)"
    expected: "Flag/grass/canopy/smoke all answer the same passing gust with distinct character; no desync"
    why_human: "Multi-system perceptual judgment"
  - test: "?nowind limp drape (reopened UAT 6, D-12)"
    expected: "Cloth hangs limp down the pole with faint micro-sway, never rigid horizontal; smoke drift + flag wind motion killed; grass base sway remains"
    why_human: "Visual acceptance bar for 'hangs like cloth'"
  - test: "Voxel cloth read (UAT 8)"
    expected: "Chunky stepped facets, not a smooth sheet"
    why_human: "Cosmetic perceptual call"
  - test: "FPS sanity after shader rework (D-13)"
    expected: "Unchanged frame feel; scripts/fps_playtest.py if suspicious"
    why_human: "Runtime performance feel"
  - test: "Flag back face (A2 — deferred from first UAT, now more exposed by the yaw)"
    expected: "Cloth not black from behind"
    why_human: "Known open assumption; fix (grass normal-fragment borrow) only if it fails"
---

# Phase 8: Wind Core Verification Report (RE-VERIFICATION after UAT gap closure)

**Phase Goal:** Everything that sways in the world moves on one coherent, gusting wind
**Verified:** 2026-07-14T10:50:00Z
**Status:** human_needed
**Re-verification:** Yes — third pass, after UAT (5 pass / 3 issues / 1 skip) and gap-closure plans 08-08/08-09

## Re-Verification Summary

The prior verification (08:10Z) ended human_needed; the human UAT then ran and **falsified** part of what code inspection had passed: the flag wiggled on a fixed random axis regardless of wind direction (major, tests 4/5/9), stayed a rigid horizontal quad under `?nowind` (minor, test 6), and read too plain for the voxel identity (cosmetic, test 8). Plans 08-08/08-09 closed all four flag gaps in code. This pass verified those fixes at all levels against the actual codebase — **all present, substantive, wired, and unit-pinned** — and regression-checked every previously-passed truth (full suite 46 files / 724 tests green this session; production build exit 0). What remains is exactly the reopened visual UAT: the flag's on-screen wind response was falsified once, so it must be re-witnessed, not presumed.

Positive movement from the UAT itself: SC2 (traveling gust front), the D-01 grass-unchanged gate, gust cadence, FPS, `?nowind`/`?nosmoke` bisect mechanics, and the StrictMode remount coherence fix were all **humanly confirmed passing** (UAT tests 1, 2, 3, 6-mechanics, 7, 9) — those truths are now fully closed, which is why previously behavior-unverified items 2 and part of 4 flipped to VERIFIED.

### Gap Closure Evidence (UAT gaps -> code, verified this session)

**Gap A — flag direction-blind wiggle (UAT 4/5/9, major) — CLOSED (commits 0f67694 RED -> 90595d9/6a56540 math -> 936a87f shader)**

- Root cause (from 08-UAT.md): `uWindDir` entered the flag shader only as gust-front phase; displacement was a zero-mean sine on a random baked heading.
- `src/game/systems/windMath.ts:159-161` — `flagSwing(strength, gust) = min(1, strength * (0.75 + 0.5 * gust))`: exact 0 at strength 0, 0.75 steady full wind, clamps to 1 at gust peak. `flagSwingGlsl` (:212-214) renders the identical closed form from the same FLAG constants through `f()` 4-decimal literals — no drift path.
- `src/game/world/assets/createCampFlag.ts:139-152` — begin_vertex patch recovers the baked world heading from `modelMatrix[0].xz` (build-time bake is a pure y-rotation, so exact), computes the signed angle to `uWindDir` via dot + 2D cross recovered with `atan(sinA, cosA)`, and yaws the vertex offset about the pole hinge scaled by `flagSwingGlsl('uWindStrength','gust')` with a `(0.7 + 0.3*along)` free-end-leads ease. Sign convention checked by hand: `sinA = h.z*w.x - h.x*w.z` matches the applied rotation matrix (`x' = x cos + z sin; z' = -x sin + z cos`) — the yaw rotates the heading toward the wind, self-consistent.
- Zero new uniforms (only `uTime/uWindDir/uWindStrength`, :87-89); pooled `campFlag` cache key intact (:157); wind-guarded material cache untouched (:67-73).
- Unit-pinned: windMath.test.ts:191-221 (strength-0 exact zero, monotonicity both args, `flagSwing(1,1) > flagSwing(1,0)` — gusts increase alignment) and :282-289 (GLSL expression pinned verbatim). RED-first: test commit 0f67694 (6 observed failures per 08-08 SUMMARY) precedes feat 90595d9 in git log — confirmed.

**Gap B — rigid horizontal quad under ?nowind (UAT 6, minor) — CLOSED (same commit chain)**

- Root cause: rest geometry was the strong-wind pose and ALL motion was multiplied by `uWindStrength`.
- `windMath.ts:168-170` — `flagDrape(strength, gust) = 1 - min(1, strength * (0.7 + 0.25 * gust))`: exactly 1 at strength 0 (full limp, D-12), 0.05 at full gust (essentially taut, D-04). `flagDrapeGlsl` (:221-223) mirrors it exactly.
- `createCampFlag.ts:125-132` — drape pitches vertices down about the pole edge (`transformed.y -= alongQ * width * sin(pitch)`, `transformed.x *= cos(pitch)`, pitch = drape × 1.45 rad); the limp micro-sway (`sin(uTime * 0.9) * 0.03 * drape * alongQ`) is gated on DRAPE, verifiably NOT on `uWindStrength` — the flag never freezes rigid at strength 0. Ripple flap + taut pull stay ×uWindStrength and correctly die at 0 (:114-119).
- Unit-pinned: windMath.test.ts:224-253 (`flagDrape(0,g) === 1` exact, monotone non-increasing, `flagDrape(1,1) <= 0.15`).

**Gap C — plain cloth vs voxel identity (UAT 8, cosmetic) — CLOSED (commit 8047e97)**

- `createCampFlag.ts:24` — `CLOTH_BANDS = 6` documented as an ART constant deliberately kept out of windMath (boundary noted in the comment); `:109` floor-quantizes `along` for the ripple/drape terms while the yaw stays on raw `along` (stepped yaw would read as tearing — per plan); `:83` `flatShading: true` gives faceted fragment-derivative normals for free; `:168` plane segmentation 12x4 (two columns per band, 65 verts — within D-13's "tens of vertices").

**Gap D — beige "grass" blades (UAT 4, cosmetic) — DISPOSITIONED OUT OF PHASE (commit cf8c361)**

- UAT root-caused this as PRE-EXISTING art (flower blades, `FLOWER_COLOR 0xfff0a8` in grassPlacement.ts:41 — predates phase 8, not introduced by it). Captured as `.planning/todos/pending/flower-blade-color-art-pass.md`. Not a phase-8 gap; correctly not in scope for closure here.

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | SC1: all four consumers sway from ONE shared wind phase, no drift — including the flag actually ANSWERING gusts | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Shared clock/uniforms + lifetime caches code-verified and regression-checked; the flag half of on-screen coherence was UAT-falsified once, fix present+wired+math-pinned but unwitnessed — human item 2 |
| 2 | SC2: gusts visibly TRAVEL across the field as a moving wave | ✓ VERIFIED | Retarded-time front unit-tested (rigid translation) AND humanly confirmed — UAT test 2 PASS 2026-07-14 |
| 3 | SC3: per-consumer character on the shared phase (flags faster, smoke lateral, canopies low/slow) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Canopy + smoke character humanly observed OK; flag character was the UAT failure — reworked (direction-following swing + drape), re-witness pending — human items 1/2 |
| 4 | SC4: grass unchanged after uTime extraction; ?nowind kills wind-driven sway for bisecting | ✓ VERIFIED | UAT test 1 PASS (grass at rest identical — D-01 gate humanly closed); UAT test 6: bisect mechanics PASS (?nowind kills smoke drift + flag wind motion; grass base sway remains per locked D-12 — deviation from SC4's literal wording de-facto accepted in the UAT note); the NEW limp-drape pose under ?nowind is truth 11 |
| 5 | flagSwing contracts: exact 0 at strength 0, monotone, gusts increase alignment, clamped | ✓ VERIFIED | windMath.test.ts:191-221 green (21/21 file, in full run this session) |
| 6 | flagDrape contracts: exactly 1 at strength 0 (?nowind full drape), gust leaves <=0.15 | ✓ VERIFIED | windMath.test.ts:224-253 green |
| 7 | GLSL generators render EXACTLY the JS closed forms from the same FLAG constants (no drift path) | ✓ VERIFIED | flagSwingGlsl/flagDrapeGlsl expression-pinning tests :282-297 green; both built through the same f() 4-decimal path as gustGlsl |
| 8 | gustGainFactor + SWAY/GUST/WANDER/CANOPY + existing FLAG values untouched (D-01 hard gate) | ✓ VERIFIED | git diff across 08-08: 0 deletions in windMath.ts (purely additive — verified via git show 90595d9/6a56540 stats); SWAY literals :18-28 unchanged; gustGainFactor :149-151 unchanged; strength-0-returns-1 test green |
| 9 | Flag cloth swings/streams toward uWindDir in-shader, free end leads, zero new uniforms | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Yaw term present (:139-152), consumes flagSwingGlsl (grep-confirmed, no locally re-derived pose math), sign convention self-consistent; on-screen direction match vs smoke is human item 1 |
| 10 | Gusts snap the flag further downwind on the SAME traveling gust envelope the smoke reads | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Same gustGlsl retarded-time value feeds both the flap amplitude and the swing blend (:111, :145); flagSwing(1,1)>flagSwing(1,0) unit-tested; visible synchrony with smoke = human item 1 |
| 11 | ?nowind / lulls: cloth hangs limp with drape-gated micro-sway, never a rigid horizontal quad | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Drape pitch + micro-sway present (:125-132), micro-sway verifiably NOT gated on uWindStrength, flagDrape(0,g)===1 exact; "hangs like cloth" is the user's visual bar — human item 3 |
| 12 | Cloth reads chunky/voxel-stepped (faceted bands) matching the art identity | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | CLOTH_BANDS quantization + flatShading + 12x4 segmentation present; perceptual read = human item 4 |
| 13 | Constraints intact: zero new uniforms, pooled 'campFlag' key, frozen matrix, castShadow false, no per-frame CPU | ✓ VERIFIED | Uniforms exactly uTime/uWindDir/uWindStrength (:87-89); cache key :157; build-time rotation.y only (:206), no update-loop registration; cloth.castShadow false (:198); file 209 total lines, under 300 functional LOC |
| 14 | CR-01/CR-02 lifecycle + assets invariant suites unchanged in meaning and green | ✓ VERIFIED | 08-09 modified ONLY createCampFlag.ts (git stat: 936a87f, 8047e97 touch 1 file) — zero test files edited; windMaterialLifecycle 10/10, assets 39/39 green this session |
| 15 | Regression: exactly ONE wind clock | ✓ VERIFIED | `wind.update(` once in game code (createGame.ts:1325); other hit is a comment |
| 16 | Regression: canopy tree-local aTreeHeight ramp intact | ✓ VERIFIED | Bake :148, attribute decl :86, heightWeight ramp :100 in createCanopyTree.ts — untouched by 08-08/09 |
| 17 | Regression: smoke update + dispose wiring intact | ✓ VERIFIED | smokeColumns?.update :1345, smokeColumns?.dispose :1502 in createGame.ts |
| 18 | Regression: world builder threads wind — initCanopyWind + one flag per camp | ✓ VERIFIED | createMondstadtWorld.ts:391 (initCanopyWind), :429 (placeAroundCamp(createCampFlag(campRandom, options.wind), 5.5)) |
| 19 | Full test suite + production build green with the rework in | ✓ VERIFIED | Ran this session: `pnpm vitest run` 46 files / 724 tests pass (716 prior + 8 new flag-pose contracts); `pnpm build` exit 0 (pre-existing >500kB chunk warning only) |
| 20 | All UAT gaps dispositioned — three closed in code, pre-existing cosmetic captured as todo | ✓ VERIFIED | Gaps A/B/C closed per evidence above; Gap D (flower blades, pre-existing) captured at .planning/todos/pending/flower-blade-color-art-pass.md (commit cf8c361) |

**Score:** 14/20 truths verified (6 present, behavior-unverified; 0 failed)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/game/systems/windMath.ts` | FLAG pose constants + flagSwing/flagDrape mirrors + flagSwingGlsl/flagDrapeGlsl generators, zero imports | ✓ VERIFIED | 7 new FLAG keys (:97-110), mirrors (:159-170), generators (:212-223); zero imports; purely additive vs prior state |
| `src/game/systems/__tests__/windMath.test.ts` | Contract tests for the new helpers | ✓ VERIFIED | 8 new tests (swing/drape contracts + expression pinning); 21/21 green; pre-existing tests unmodified (git: additions only) |
| `src/game/world/assets/createCampFlag.ts` | Directional swing + drape + voxel-stepped cloth in begin_vertex + geometry | ✓ VERIFIED | Yaw :139-152, drape :125-132, quantization :109, flatShading :83, 12x4 geometry :168; consumes windMath generators (no duplicated pose math) |
| `src/game/world/assets/__tests__/windMaterialLifecycle.test.ts` | Unchanged in meaning (CR-01/CR-02 semantics) | ✓ VERIFIED | Not modified by 08-09 (git stat); 10/10 green |
| `src/game/world/assets/__tests__/assets.test.ts` | Unchanged in meaning (flag invariants) | ✓ VERIFIED | Not modified by 08-09; 39/39 green |

(All phase-8 artifacts from plans 08-01..08-07 regression-verified in the prior pass and spot-rechecked above — truths 15-18.)

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| FLAG pose constants | flagSwing/flagDrape JS mirrors AND GLSL generators | same constants through f() | ✓ WIRED | Single source; expression-pinning tests forbid drift |
| windMath flagSwingGlsl/flagDrapeGlsl | createCampFlag begin_vertex patch | template interpolation :125, :145 | ✓ WIRED | grep-confirmed both consumed; import at :3 |
| wind.directionUniform | vertex DISPLACEMENT yaw (not just gust phase) | uWindDir in atan + rotation :140-152 | ✓ WIRED | The exact coupling the UAT found missing — now present |
| modelMatrix[0].xz baked heading | in-shader per-flag variation on a pooled material | normalize(modelMatrix[0].xz) :139 | ✓ WIRED | Zero new uniforms/attributes; build-time rotation.y bake :206 feeds it |
| gustGlsl retarded-time value | both flap amplitude AND swing blend | `gust` local :111 -> :116, :145 | ✓ WIRED | Flag answers the same traveling front as grass/smoke (WIND-01) |
| createGame frame() | wind.update(deltaSeconds) | single clock advance | ✓ WIRED | createGame.ts:1325, sole occurrence |
| ?nowind flag | strengthUniform zeroing (no recompile) | perfFlags :311 | ✓ WIRED | Unchanged; drape now gives the windless pose meaning |
| createMondstadtWorld camp loop | createCampFlag(campRandom, options.wind) | placeAroundCamp :429 | ✓ WIRED | Unchanged |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full suite regression (once, saved output) | `pnpm vitest run` | 46 files / 724 tests pass, exit 0 | ✓ PASS |
| Flag pose contracts + generator pinning | windMath.test.ts (from saved run) | 21 tests pass | ✓ PASS |
| CR-01/CR-02 lifecycle regression | windMaterialLifecycle.test.ts (from saved run) | 10 tests pass | ✓ PASS |
| Flag through shared asset invariants | assets.test.ts (from saved run) | 39 tests pass | ✓ PASS |
| Production build (shader template assembly TS-checked) | `pnpm build` | exit 0, built in 5.74s (pre-existing chunk-size warning only) | ✓ PASS |
| TDD RED-first evidence (08-08) | git log order | test 0f67694 precedes feat 90595d9/6a56540; 08-08 SUMMARY records 6 observed RED failures | ✓ PASS |
| Commit integrity | git show 0f67694 90595d9 6a56540 936a87f 8047e97 | all exist; file stats match SUMMARY claims (08-09 touched only createCampFlag.ts) | ✓ PASS |
| Yaw sign-convention consistency | manual derivation | sinA = h.z·w.x − h.x·w.z matches the applied rotation matrix convention — rotation moves heading toward wind, not away | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes exist in this project and none are declared by the phase plans — SKIPPED.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
| ----------- | ------------ | ----------- | ------ | -------- |
| WIND-01 | 08-01..08-09 | All four consumers on ONE shared wind module; grass unchanged after uTime extraction | ? NEEDS HUMAN | Code fully satisfied (single clock, shared uniforms, single-sourced pose math, D-01 gate humanly passed in UAT test 1); flag-coherence half reopened by UAT 4/5/9 — fix in code, re-witness pending |
| WIND-02 | 08-01, 08-02, 08-05, 08-06 | Gusts visibly travel (spatial phase offset) | ✓ SATISFIED | Unit-tested rigid front AND humanly confirmed — UAT test 2 PASS |
| WIND-03 | 08-01, 08-03, 08-04, 08-05..08-09 | Per-consumer character: flags faster, smoke lateral, canopies low/slow | ? NEEDS HUMAN | Canopy/smoke character humanly observed; flag character reworked (direction + drape) after UAT failure — re-witness pending |

No orphaned requirements: REQUIREMENTS.md maps exactly WIND-01/02/03 to Phase 8 and all three appear across plan frontmatter (gap plans 08-08/08-09 declare [WIND-01, WIND-03]). NOTE (carried forward): REQUIREMENTS.md marks all three `[x] Complete` — still premature for WIND-01/WIND-03 until the reopened UAT items pass.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| src/game/createGame.ts | (whole file) | ~2,000-line monolith vs CLAUDE.md <=300 LOC rule | ℹ️ Info | IN-03 carried forward — untouched by gap closure; recorded debt (next touch: extract createAmbiance) |
| windMath.ts:176-178, createCampFlag.ts:27, createCanopyTree.ts | — | GLSL float-literal helper `f()` still duplicated across three files | ℹ️ Info | IN-04 carried forward — 08-08/08-09 did not consolidate; export from windMath on next touch |

No TBD/FIXME/XXX/TODO/HACK/placeholder markers in any file modified by plans 08-08/08-09 (scanned this session). No stub patterns: every new constant/helper flows into the shader patch; no hardcoded-empty or console-only implementations.

### Human Verification Required

All code-level work is done and pinned; the remaining gate is the **reopened UAT** — specifically the flag items UAT falsified plus the ride-along checks. Run against the laragon-served `dist/` build.

### 1. Flag answers gust direction + strength (reopened UAT 4/5/9)
**Test:** Visit a camp during a gust; compare the flag's swing to the fireplace smoke's kink; watch several minutes for the wander. **Expected:** Flag streams the SAME direction smoke drifts; harder gusts swing harder; pointing direction follows the slow wander, not one fixed axis. **Why human:** This exact invariant was falsified once by UAT; the fix is present, wired, and math-pinned but unwitnessed.

### 2. Four-consumer coherence (SC1/SC3)
**Test:** Same camp visit — flag vs grass vs canopy vs smoke through one gust; alt-tab 30s and return. **Expected:** All four answer the same passing gust with distinct character; no desync. **Why human:** Multi-system perceptual judgment.

### 3. ?nowind limp drape (reopened UAT 6, D-12)
**Test:** Reload with `?nowind`; look at a camp flag. **Expected:** Cloth hangs limp down the pole (stepped voxel hang, ~83 degrees) with a faint lazy micro-sway — never a rigid horizontal quad; smoke drift and flag wind motion killed; grass base sway remains (D-12). **Why human:** "Hangs like cloth" is the user's visual acceptance bar.

### 4. Voxel cloth read (UAT 8)
**Test:** Look at a flag up close, moving and at rest. **Expected:** Chunky flat-shaded stepped bands, not a smooth sheet. **Why human:** Cosmetic perceptual call.

### 5. FPS sanity (D-13)
**Test:** Frame feel near camps vs pre-rework; `scripts/fps_playtest.py` if suspicious. **Expected:** Unchanged — the patch adds atan + two rotations across ~65 verts per flag. **Why human:** Runtime performance feel.

### 6. Flag back face (A2 — now more exposed)
**Test:** Watch a flag as the wander swings the wind around (the yaw can now flip the cloth relative to the fixed camera). **Expected:** DoubleSide cloth not black from behind. **Why human:** Deferred from the first UAT (camera couldn't reach it); the downwind yaw makes it reachable now. Fix (grass normal-fragment borrow) only if it fails.

### Gaps Summary

No code gaps. All three phase-scoped UAT gaps (flag direction response — major; windless limp drape — minor; voxel cloth — cosmetic) are closed in the codebase with single-sourced, unit-pinned math (8 new contract tests, RED-first), zero new uniforms, and all pooling/frozen-matrix constraints intact; the fourth UAT finding (beige flower blades) was root-caused as pre-existing art outside phase 8 and captured as a pending todo (commit cf8c361). The full suite (724 tests) and production build are green. The phase cannot be marked passed because the flag's wind response is a behavior UAT has already falsified once — the six behavior-unverified truths above must be closed by the reopened human UAT (items 1-6), after which WIND-01 and WIND-03 can be considered humanly satisfied and REQUIREMENTS.md's `Complete` marks become accurate.

---

_Verified: 2026-07-14T10:50:00Z_
_Verifier: Claude (gsd-verifier)_
