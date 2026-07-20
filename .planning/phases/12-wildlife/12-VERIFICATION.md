---
phase: 12-wildlife
verified: 2026-07-18T23:30:00Z
status: passed
score: 26/26 code/math must-haves verified (47 automated tests pass + static wiring); 4 roadmap-SC perceptual/perf reads → human
behavior_unverified: 0
overrides_applied: 0
human_verification:

  - test: "Roam grass by day (WILD-01). Confirm butterflies drift naturally, read as SPARSE (an encounter, not wallpaper), spawn/despawn near the player, and NONE appear at night. Toggle ?nobugs to confirm they vanish."
    expected: "Rare, natural summed-sine drift over grass by day; empty at dusk/night; ?nobugs removes them entirely."
    why_human: "Perceptual density + motion feel — 'sparse enough that spotting one feels like an event' cannot be asserted by a unit test. The spawn/cull/day-gate mechanics ARE unit-tested (createButterflies.test.ts); only the aesthetic read is human."

  - test: "Sprint through grass (WILD-02). Confirm 2-4 birds burst up a rising arc, ONE wing one-shot plays with them, they despawn, and continuous running does not retrigger a flush spam (~6s debounce)."
    expected: "A single startle burst + one wing sound per flush, arc up then fade/despawn, no retrigger stream; ?nobirds off."
    why_human: "Timing/feel + audio perception. The 2-4 burst, birdArc despawn, and flushReady(6s) debounce are unit-tested + statically wired at the CPU surface==='grass' site; the audible/felt result needs a human."

  - test: "Advance to dusk/night (WILD-03). Confirm fireflies appear as glowing, phase-randomized emissive quads, none by day, and that combat lighting/telegraphs are unaffected (no new lights)."
    expected: "Glowing decorrelated pulses at dusk/night, clean day no-op, combat lightPool untouched; ?nofireflies off."
    why_human: "Perceptual glow read under the pixel filter. The unlit MeshBasicMaterial, no-scene-light guarantee, day no-op, level-scaled fade, and per-instance pulse are unit-tested (createFireflies.test.ts); only the visual glow quality is human."

  - test: "SC4 milestone FPS gate: run scripts/fps_playtest.py through a golem-class fight with ALL ambiance enabled (wind + daynight + audio + wear + wildlife). Use ?no* flags to isolate any per-system cost."
    expected: "Frame rate holds through the golem fight with everything on; each ?no* flag removes exactly its system for bisecting."
    why_human: "Perf under real render load — requires running the FPS harness against a live golem fight. Cannot be asserted by unit tests. WR-01 (per-frame palette allocation) was already fixed in code (scalar fireflyLevelForPhase), so the zero-alloc mandate holds in source."
---

# Phase 12: Wildlife Verification Report

**Phase Goal:** Sparse, reactive wildlife makes encounters feel like events, at zero frame cost blowout
**Verified:** 2026-07-18T23:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

This is a CLIENT-ONLY visual phase. The correctness risk is concentrated in the pure
`wildlifeMath` twin and per-factory pool mechanics — all test-provable and passing (47
tests). The remaining truths are perceptual (sparse feel, glow, wing audio) and perf (SC4
FPS gate), which are human-only by nature and were explicitly deferred to `/gsd-verify-work`
per the `--auto` policy (12-05-SUMMARY "Deferred", 12-VALIDATION.md "Manual-Only"). Every
such truth has a present + wired code path, so per the phase classification they are
`human_needed`, NOT gaps.

### Observable Truths (Roadmap Success Criteria)

| # | Truth (SC) | Code substrate | Perceptual/perf | Overall |
| --- | --- | --- | --- | --- |
| SC1 | Butterflies wander over grass by day, sparse, spawn/despawn near player | ✓ VERIFIED (day gate, grass spawn, cull, cap, wander — createButterflies.test.ts 8 tests) | needs human | human_needed |
| SC2 | Sprint through grass flushes 2-4 birds on rising arc + wing one-shot, then despawn | ✓ VERIFIED (2-4 burst, birdArc despawn, slot recycle, flushReady debounce, wing sfx wired — createBirdFlush.test.ts 6 tests) | needs human | human_needed |
| SC3 | Fireflies pulse at dusk/night as emissive quads; combat light pool never touched | ✓ VERIFIED (no-scene-light test, unlit MeshBasicMaterial, pulse, day no-op, level fade — createFireflies.test.ts 11 tests) | needs human | human_needed |
| SC4 | FPS holds through a golem fight with ALL ambiance enabled (fps_playtest.py) | ✓ zero-alloc mandate met in code (WR-01 fixed) | needs human (perf harness) | human_needed |

**Score:** All 26 plan-level must-have truths (12-01..12-05) VERIFIED via 47 passing automated
tests + static wiring inspection. 4 roadmap-SC perceptual/perf reads routed to human.

### Plan Must-Have Truths (code-provable)

| Plan | Truths | Status | Evidence |
| --- | --- | --- | --- |
| 12-01 (wildlifeMath) | 7 (wander bounds/continuity, day gate, firefly level, ring, arc ease-out, floored pulse, flush debounce, THREE-free purity) | ✓ VERIFIED | wildlifeMath.test.ts 22 tests pass; `grep -c "from 'three'"` = 0; only import is fireflyLevelForPhase |
| 12-02 (butterflies) | 5 (one draw call, self-manage cull+topup+day gate, wander drift, hard cap, zero-alloc) | ✓ VERIFIED | createButterflies.test.ts 8 tests (cap, day/night gate, cull, dispose); closure scratch + out-param confirmed in source |
| 12-03 (bird flush + sfx) | 4 (spawn 2-4 + age + despawn t01>=1, one draw call hard-cap recycle, procedural gesture-guarded wing, arc delegated / debounce at call site) | ✓ VERIFIED | createBirdFlush.test.ts 6 tests (2-4 burst, despawn+recycle, cap, reuse); createWildlifeSfx ready()-guarded, .onended cleanup |
| 12-04 (fireflies) | 5 (one unlit draw call, decorrelated instanceColor pulse, dusk/night gate + day no-op, NO scene light, zero-alloc hard-cap) | ✓ VERIFIED | createFireflies.test.ts 11 tests (no-light, day no-op, level-scaled fade, pulse, cull, dispose) |
| 12-05 (createGame wiring) | 5 (constructed + ?no* skip, updates on shared clock, grass-sprint debounced flush never GPU read, disposed, ?no* isolates + SC4) | ✓ VERIFIED (wiring) / SC4 → human | imports :49-53; flags :359-361; construction :444-452 gated; flush hook :1069-1078 (surface==='grass' else-branch, flushReady); updates :1555-1571 fed wind.timeUniform.value + dayNightPhase; dispose :1741-1744 |

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/game/systems/wildlifeMath.ts` | Pure THREE-free twin | ✓ VERIFIED | 111 LOC; THREE-free; single sibling import; tunables `as const` |
| `src/game/systems/__tests__/wildlifeMath.test.ts` | vitest twin | ✓ VERIFIED | 218 LOC, 22 tests pass |
| `src/game/systems/createButterflies.ts` | Day butterfly pool | ✓ VERIFIED | 195 LOC; wired at createGame :444 |
| `src/game/systems/createBirdFlush.ts` | Flush bird pool | ✓ VERIFIED | 161 LOC; wired at createGame :450 |
| `src/game/audio/createWildlifeSfx.ts` | Procedural wing sfx | ✓ VERIFIED | 92 LOC; wired at createGame :498 (buses.sfx) |
| `src/game/systems/createFireflies.ts` | Dusk/night firefly pool | ✓ VERIFIED | 237 LOC; wired at createGame :447 |
| Per-factory pool tests | cap/gate/cull | ✓ VERIFIED | createButterflies/BirdFlush/Fireflies .test.ts — 25 tests pass |

### Key Link Verification

| From | To | Via | Status |
| --- | --- | --- | --- |
| createButterflies/BirdFlush/Fireflies | wildlifeMath | wander/gate/arc/ring math delegation | ✓ WIRED (named imports; all math via twin) |
| wildlifeMath | dayNightMath | fireflyLevelForPhase (allocation-free scalar gate) | ✓ WIRED (WR-01 fix — scalar, not object palette) |
| createGame flush hook | birdFlush.spawn + wildlifeSfx.playWingFlap | surface==='grass' else-branch gated by flushReady(lastFlushSec, elapsedSeconds) | ✓ WIRED (:1069-1078; CPU classify, no groundInfluence/GPU read) |
| createGame frame | butterflies/fireflies/birdFlush.update | wind.timeUniform.value + dayNightPhase + player pos | ✓ WIRED (:1555-1571) |
| createGame | ?nobugs/?nobirds/?nofireflies | construction gated `enabled ? create : undefined` | ✓ WIRED (:359-361, :444-452) |
| createGame teardown | 4 dispose() calls | beside dustPuffs?.dispose() | ✓ WIRED (:1741-1744) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full wildlife test suite | `pnpm exec vitest run` (4 wildlife files) | 4 files, 47 tests passed | ✓ PASS |
| wildlifeMath THREE-free | `grep -c "from 'three'" wildlifeMath.ts` | 0 | ✓ PASS |
| fireflyLevelForPhase allocation-free | source read (scalar lerp, no object literal) | scalar return | ✓ PASS (WR-01 fixed) |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| WILD-01 | 12-01, 12-02, 12-05 | Butterflies wander over grass by day, sparse, spawn/despawn near player | ✓ SATISFIED (code) / human (perceptual) | createButterflies + wildlifeMath tests; wired |
| WILD-02 | 12-01, 12-03, 12-05 | Sprint-flush 2-4 birds on arc + wing one-shot, CPU stamp site never GPU read | ✓ SATISFIED (code) / human (feel+audio) | createBirdFlush + createWildlifeSfx + flush hook :1069-1078 |
| WILD-03 | 12-01, 12-04, 12-05 | Fireflies pulse dusk/night, no runtime lights (lightPool combat-owned) | ✓ SATISFIED (code) / human (glow) | createFireflies tests incl. no-light assertion; wired |

No orphaned requirements — all three WILD IDs map to Phase 12 in REQUIREMENTS.md :213-215 and are declared across the plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| (none) | — | No TBD/FIXME/XXX/HACK/PLACEHOLDER in any modified file | — | Clean |
| createWildlifeSfx.ts | 88 | "synth-first ships now; real CC0 .ogg can drop in later" | ℹ️ Info | Documented future-swap path, not a debt marker — behavior is complete |

Code-review (12-REVIEW.md): WR-01 (per-frame palette allocation) already FIXED — wildlifeMath
now imports the scalar `fireflyLevelForPhase` instead of the object-returning `samplePalette`,
so the two per-frame allocations are gone. IN-01 (unused DynamicDrawUsage on constant-tint
instanceColor) and IN-02 (latent panner leak on pan!==0, pre-existing project-wide, call site
passes pan=0) are INFO-only, non-blocking.

### Human Verification Required

4 items — see frontmatter `human_verification`. All have present + wired code paths; the
remaining verification is perceptual (SC1-3 aesthetic reads, wing audio) and perf (SC4 FPS
harness), which unit tests cannot assert. These were auto-deferred to `/gsd-verify-work`.

### Gaps Summary

No gaps. Every artifact exists, is substantive, wired to the shared clock, disposed, and
gated by its `?no*` bisect flag. The pure creature math and all three pool mechanics
(cap/gate/cull/despawn/no-light) are proven by 47 passing tests. The zero-alloc mandate is
met in code (WR-01 fixed). The only outstanding items are perceptual/perf sign-offs that are
human-only by nature — status is `human_needed`, not `gaps_found`.

---

_Verified: 2026-07-18T23:30:00Z_
_Verifier: Claude (gsd-verifier)_
