---
phase: 05-swordswing-swordswirl-combo
plan: 05
subsystem: testing
tags: [gate, playtest, deploy-verify, spacetimedb, vitest, webaudio, threejs]

# Dependency graph
requires:
  - phase: 05-swordswing-swordswirl-combo
    provides: "05-01 server pure layer (resolveCone, ATTACKS chain data, selectAttack, walkAttackTransitions); 05-02 clips + juice + SFX; 05-03 glue wiring + basicCooldownUntilMicros migrate-publish; 05-04 ATTACK_RENDER mirror + cone sector telegraph"
provides:
  - "Phase-5 exit gate: 553/553 vitest green (incl. extended serverSync parity), clean pnpm build, migrated local DB verified (describe/sql/logs)"
  - "Human playtest APPROVAL of SC1 (cone frontal-hit/side-escape), SC2 (unconditional chain forces move-OUT), SC3 (telegraph/clip legibility at max pixelation), planted goliath + slam→chain→gap rhythm"
  - "ATTACK_RENDER extended with per-attack stunSeconds (parity-locked) + juiceColor (ELEMENTS palette render hint)"
  - "setActiveCharacter stun gate: server reducer rejects character switch while stunned (HIT-01 window), mirrored client-side for feel"
  - "Strike-phase clip timing contract: in-strike progress rides the one-tick zero-storage grace deadline (STRIKE_PHASE_MICROS = 150_000n), never recoveryEndsAtMicros"
affects: [06-shielddash, 07-crit-poise-interrupt, verify-work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Strike clip windows anchor on the graceTicks deadline (strikeAt + 1 tick), not the row's recovery deadline — the row's only stored later deadline spans strike+grace+recovery and dilutes in-strike progress to unusable"
    - "Client feel windows (stun freeze, popup) ride the CAUSING attack's ATTACK_RENDER data, correlated via same-transaction strike events, with a leapSlam-tuned fallback for unknown causes"
    - "Combat-window action gates live on BOTH sides: server reducer check (authoritative) + client UI gate (feel), same stunnedUntilMicros window as updatePosition"

key-files:
  created: []
  modified:
    - src/game/createGame.ts
    - src/game/systems/createGoliathRenderer.ts
    - src/game/data/attacks.ts
    - src/game/data/__tests__/serverSync.test.ts
    - src/game/audio/createAudioSystem.ts
    - src/App.tsx
    - spacetimedb/src/index.ts

key-decisions:
  - "Strike-phase clip window = graceTicks anchor: phaseEnd for STRIKE is strikeAtMicros + STRIKE_PHASE_MICROS (one 150ms world tick, the zero-storage D4-02 deadline), NOT recoveryEndsAtMicros"
  - "Stun feel is per-attack: ATTACK_RENDER.stunSeconds (swing 0.6, slam 1.05, swirl 0) drives the client freeze + STUNNED! popup; a stunSeconds of 0 means knockback with NO freeze/popup"
  - "setActiveCharacter is stun-gated server-side (silent return while now < stunnedUntilMicros) — switching to a fresh HP pool mid-stun would sidestep the swing tag's escape race"
  - "juiceColor render hints on ATTACK_RENDER from the ELEMENTS palette (leapSlam geo amber, swordSwing anemo teal, swordSwirl electro violet) — pure client visual data, NOT parity material; telegraphs stay Frost cyan"

patterns-established:
  - "Playtest-gate fix loop: feel bug → root-cause to a timing/data contract → fix as data or one anchor change → extend serverSync parity to lock it → re-run full gate → re-present"

requirements-completed: [ATK-02, ATK-03]

coverage:
  - id: D1
    description: "Exclusive full gate green on the merged Phase-5 tree: full vitest suite incl. extended serverSync ATTACKS/ATTACK_RENDER parity, clean tsc -b + vite build, fresh dist/"
    verification:
      - kind: unit
        ref: "pnpm test — 553/553 passed (post fix-round-2 re-run)"
        status: pass
      - kind: automated_ui
        ref: "pnpm build — tsc -b + vite build clean"
        status: pass
    human_judgment: false
  - id: D2
    description: "Migrated local DB deploy verified: unit_attack describe lists basicCooldownUntilMicros, SQL select exits 0, worldTick logs error-free; module republished additively during fix round 1 (stun gate is a server change)"
    verification:
      - kind: manual_procedural
        ref: "spacetime describe/sql/logs 2d-impact-game-fr9ti --server local (Task 1 + post-republish re-check)"
        status: pass
    human_judgment: false
  - id: D3
    description: "SC1 (ATK-02): frontal close-range player is hit by swordSwing's 120° cone after the 0.6s sector fill; stepping side/back during the windup escapes; sector points at the aim (A1 yaw sign confirmed correct)"
    verification: []
    human_judgment: true
    rationale: "Server-authoritative combat FEEL over a real network is human-only by design (pure-helper-testing-discipline memory); user approved on the migrated local DB over LAN"
  - id: D4
    description: "SC2 (ATK-03): swordSwirl chains after EVERY swing (hit or whiff); standing still/strafing gets hit and thrown ~4.5u; sprinting OUT of the circle escapes; no swirl warning during the swing itself"
    verification: []
    human_judgment: true
    rationale: "Chain-escape race timing is a feel judgment; user approved after the round-1 stun-window fix restored the escape race"
  - id: D5
    description: "SC3 (ANIM-02): cone sector + circle telegraphs and both clips read at max pixelation; swing wind-back→slash and swirl coil→360° spin visible; per-attack sub-slam shake/SFX audible; goliath stays planted at swing strike; slam→chain→gap→chain rhythm holds"
    verification: []
    human_judgment: true
    rationale: "Pixel-filter legibility and animation readability are visual judgments; approved after round-1 clip fix and round-2 SFX/juice-color fixes"

# Metrics
duration: ~13h wall (checkpoint-gated, 3 sessions; ~1h active)
completed: 2026-07-11
status: complete
---

# Phase 05 Plan 05: Exclusive Gate + Human Playtest Summary

**Phase-5 capstone approved: 553/553 tests + clean build + migrated-DB checks green, and the human playtest signed off SC1/SC2/SC3 after two fix rounds — strike clips now ride the one-tick grace deadline, stun feel is per-attack (no more 1.05s blanket freeze eating the SC2 escape race), character switch is stun-gated server-side, and swing/swirl got audible SFX + element-palette juice colors**

## Performance

- **Duration:** ~13h wall clock across the blocking playtest checkpoint (3 sessions); ~1h active work
- **Started:** 2026-07-10T18:50:00Z (approx, Task 1 gate)
- **Completed:** 2026-07-11T07:15:00Z
- **Tasks:** 2/2 (Task 1 auto gate, Task 2 human-verify checkpoint)
- **Files modified:** 7 across the two fix rounds

## Accomplishments

- **Task 1 exclusive gate (all green):** full `pnpm test` (553/553 after the fix rounds extended serverSync with stunSeconds-parity, strike-window, and juiceColor assertions), clean `pnpm build` (first full typecheck over all merged Phase-5 client code, fresh laragon-served dist/), and migrated-DB verification — `spacetime describe` lists `basicCooldownUntilMicros` on `unit_attack`, SQL select exits 0, `spacetime logs -n 100` free of worldTick errors. No maincloud command anywhere (self-host pivot honored).
- **Task 2 human playtest APPROVED** on the migrated local DB over LAN: SC1 cone frontal-hit/side-escape with the sector pointing at the aim (A1 yaw sign confirmed — no flip needed), SC2 unconditional chain with the move-OUT escape working, SC3 telegraph + clip legibility at max pixelation, goliath planted at swing strike (Pitfall 1 gate held live), slam → chain → gap → chain rhythm confirmed.
- **Module republished additively during fix round 1** (58ddf60 touched `spacetimedb/src/index.ts`) using the plan-05-03 command — no data wipe, local only.
- Seeded numbers (D5-06/09/10/11/12/13, swirl radii, chain cooldown) all approved as-is — zero ATTACKS data retunes; the two fix rounds were bug fixes and juice polish, not number tuning.

## Task Commits

1. **Task 2 fix round 1 (playtest: "slash/spin don't play, stun feels wrong, can cheese stun via switch"):**
   - `f427a66` (fix) — strike-phase clip window rides the one-tick grace deadline
   - `2e51639` (fix) — stun freeze + popup ride the causing attack's stunSeconds
   - `58ddf60` (fix) — block character switch while stunned (server gate + client UI gate)
2. **Task 2 fix round 2 (playtest: "can't hear swing/swirl, strikes need element color"):**
   - `4a1e0ed` (fix) — swing/swirl SFX clearly audible
   - `6a41300` (fix) — element-palette strike-juice colors via ATTACK_RENDER.juiceColor

Task 1 produced no commits (verification only; dist/ rebuild is gitignored).

## Files Created/Modified

- `src/game/createGame.ts` — STRIKE_PHASE_MICROS strike-window anchor; per-attack stun freeze/popup via lastStrike.attackId → ATTACK_RENDER.stunSeconds; juiceColor pass-through to burst/shockwave
- `src/game/systems/createGoliathRenderer.ts` — swirl spin re-split: fast release to SWIRL_STRIKE_YAW in the one-tick strike, spin completes to exactly 2π over the recovery's opening SWIRL_SPIN_TAIL slice
- `src/game/data/attacks.ts` — AttackRenderSpec gains `stunSeconds` (parity-locked to server stunTicks × 150ms) and `juiceColor` (ELEMENTS palette, render-only)
- `src/game/data/__tests__/serverSync.test.ts` — new parity assertions: stunSeconds ↔ stunTicks, graceTicks=1 lock for the strike window, juiceColor presence
- `src/game/audio/createAudioSystem.ts` — swing whoosh gain 0.25→0.6 / Q 1.2→0.8, swirl equivalently boosted (bandpass discards most noise energy; peak must sit above the slam's broadband 0.5)
- `spacetimedb/src/index.ts` — `setActiveCharacter` silent-returns while `now < stunnedUntilMicros` (same window as the updatePosition gate)
- `src/App.tsx` — character-switch UI disabled during the client stun window

## Verification Evidence

- `pnpm test`: 553/553 green (full suite re-run after each fix round; serverSync extended, never skipped — SC3 release-blocking mandate held)
- `pnpm build`: tsc -b + vite build clean; dist/ refreshed for the LAN playtest after every round
- `spacetime describe 2d-impact-game-fr9ti table unit_attack --json --server local`: `basicCooldownUntilMicros` present
- `spacetime sql 2d-impact-game-fr9ti "SELECT * FROM unit_attack" --server local`: exit 0, live rows on the MIGRATED DB (lazy FSM row creation confirmed — never freshly seeded)
- `spacetime logs 2d-impact-game-fr9ti -n 100 --server local`: no error/panic lines from worldTick (Pitfall 5 clear), re-checked after the round-1 republish
- Human verdict: **"approved"** (round 1: clips/stun/escape approved; round 2: SFX audibility + element juice colors approved)

## Decisions Made

- **Strike clip window = graceTicks anchor:** in-strike phaseEnd is `strikeAtMicros + 150_000n` (the zero-storage D4-02 grace deadline the row actually leaves STRIKE at), not `recoveryEndsAtMicros`. Locked by a serverSync graceTicks=1 assertion so a future graceTicks change breaks the build, not the feel.
- **Stun feel is per-attack data:** the client freeze + STUNNED! popup duration comes from the causing attack's `ATTACK_RENDER.stunSeconds` (swing 0.6s, slam 1.05s, swirl 0 = knockback only, no popup), correlated via the same-transaction strike event with the old 1050ms as unknown-cause fallback.
- **setActiveCharacter stun gate:** switching characters is a combat action — swapping to a fresh body/HP pool mid-stun would sidestep the swing tag's escape race (D5-12). Server-side silent return, client UI mirrors the window for feel.
- **juiceColor is a render hint, not parity material:** attacks carry no element server-side (elemental combat deferred); the ELEMENTS-palette tints (geo/anemo/electro) are pure client visual data. Telegraphs stay Frost cyan.

## Deviations from Plan

The plan's checkpoint loop anticipated ATTACKS data retunes; what the playtest actually surfaced was three bugs and two juice gaps — all fixed forward within the checkpoint loop, gate re-run and re-presented each round.

### Auto-fixed Issues

**1. [Rule 1 - Bug] Strike-phase clip progress denominator spanned strike+grace+recovery — slash/spin never played**
- **Found during:** Task 2 (playtest round 1: "the swing slash and swirl spin don't visibly play")
- **Issue:** in-strike clip progress divided by the window ending at `recoveryEndsAtMicros` (the row's only stored later deadline), so progress crawled to ~11% before the RECOVERY state change arrived — the strike-phase animations were effectively invisible
- **Fix:** strike phaseEnd = `strikeAtMicros + STRIKE_PHASE_MICROS` (one 150ms tick — the zero-storage graceTicks deadline); swirl spin re-split so the 360° stays readable (fast release in-strike, completion over the recovery's opening 35%); serverSync assertion locks graceTicks=1
- **Files modified:** src/game/createGame.ts, src/game/systems/createGoliathRenderer.ts, src/game/data/__tests__/serverSync.test.ts
- **Verification:** full gate re-run green; round-2 playtest confirmed both clips visibly play
- **Committed in:** f427a66

**2. [Rule 1 - Bug] Fixed 1050ms stun freeze ate the SC2 escape race and fired ghost popups on swirl knockback**
- **Found during:** Task 2 (playtest round 1: swing stun felt way too long; getting knocked back by the swirl froze inputs + popped STUNNED! despite the swirl applying no stun)
- **Issue:** `STUN_RENDER_MS = 1050` (leapSlam-tuned) applied to EVERY stunnedUntilMicros bump — over-froze swing victims by 450ms (0.6s server stun) and treated the swirl's knockback row-touch as a stun
- **Fix:** freeze + popup duration ride the causing attack's `ATTACK_RENDER.stunSeconds` (via the fresh same-transaction strike event); stunSeconds 0 (swirl) = no freeze, no popup; unknown cause falls back to the old default; stunSeconds parity-locked to server stunTicks in serverSync
- **Files modified:** src/game/createGame.ts, src/game/data/attacks.ts, src/game/data/__tests__/serverSync.test.ts
- **Verification:** gate green; round-2 playtest confirmed per-attack stun feel and no ghost swirl stun
- **Committed in:** 2e51639

**3. [Rule 2 - Missing critical] Character switch was not stun-gated — swapping mid-stun sidestepped the combat window**
- **Found during:** Task 2 (playtest round 1: user could escape the swing tag's stun by switching to a fresh character)
- **Issue:** `setActiveCharacter` had no stun check — a stunned player is server-owned for the whole stun window (HIT-01, same contract as the updatePosition rejection), but switching swapped in a fresh body/HP pool, sidestepping the D5-12 escape race
- **Fix:** server reducer silent-returns while `now < stunnedUntilMicros`; client disables the switch UI over the same window for feel; **server change → additive republish to local** (plan-05-03 command, no wipe, no maincloud)
- **Files modified:** spacetimedb/src/index.ts, src/App.tsx, src/game/createGame.ts
- **Verification:** gate green; post-republish logs clean; round-2 playtest confirmed switch blocked while stunned
- **Committed in:** 58ddf60

**4. [Rule 1 - Bug] Swing/swirl SFX inaudible under gameplay**
- **Found during:** Task 2 (playtest round 2: "can't hear the new attacks at all")
- **Issue:** the 05-02 whoosh recipe (peak gain 0.25, bandpass Q 1.2) discarded most of the noise energy — inaudible next to the slam's broadband 0.5 gain
- **Fix:** peak gains raised (whoosh 0.6, swirl equivalently), Q relaxed to 0.8 — still clearly lighter/shorter than the slam per the SC3 sub-slam tier requirement
- **Files modified:** src/game/audio/createAudioSystem.ts
- **Verification:** user confirmed both SFX clearly audible in the approval round
- **Committed in:** 4a1e0ed

**5. [Rule 1 - Bug (feel gap flagged at playtest)] All three strikes shared one juice tint — unreadable which attack hit you**
- **Found during:** Task 2 (playtest round 2 request)
- **Issue:** burst/shockwave juice used a single color for slam, swing, and swirl
- **Fix:** `ATTACK_RENDER.juiceColor` from the ELEMENTS palette — leapSlam geo amber, swordSwing anemo teal, swordSwirl electro violet (pops against the green terrain); render-only hint, telegraphs stay Frost cyan; serverSync asserts every entry carries one
- **Files modified:** src/game/data/attacks.ts, src/game/createGame.ts, src/game/data/__tests__/serverSync.test.ts
- **Verification:** user approved the colors in the final round
- **Committed in:** 6a41300

---

**Total deviations:** 5 auto-fixed (4× Rule 1 bug, 1× Rule 2 missing critical)
**Impact on plan:** All fixes were the checkpoint loop working as designed (fix forward, re-gate, re-present). Zero ATTACKS number retunes — every D5-xx seed approved as-is. No scope creep; the stun gate closed a real combat-integrity hole (T-05-01 family).

## Known Stubs

None. The A1 sector yaw sign flagged by 05-04 is RESOLVED — confirmed correct in the playtest (sector points at the aim, no flip needed).

## Threat Flags

None new. T-05-01 (server-authoritative chain/cone) observed live per the plan's mitigation — the goliath stayed planted and the chain fired unconditionally regardless of client movement. The round-1 stun gate on `setActiveCharacter` closed an adjacent tampering-by-legitimate-input hole in the same trust boundary. T-05-06 honored: the one republish was additive, local-only, no `--delete-data`.

## Issues Encountered

None beyond the playtest findings documented as deviations. The fix rounds' server change made the plan's "no republish needed" expectation false — handled with the exact plan-05-03 additive command as the plan's retune branch prescribed.

## User Setup Required

None.

## Next Phase Readiness

- **Phase 5 COMPLETE:** all three ROADMAP success criteria human-verified on the migrated local DB over LAN; serverSync ATTACKS/ATTACK_RENDER parity green at phase end (SC3 mandate); no red tests, clean tree, module published.
- Phase 6 (shieldDash lane) inherits: the proven cone+circle+chain spine, the graceTicks strike-window anchor for its dash clip, ATTACK_RENDER now carrying stunSeconds + juiceColor (a lane entry needs all three fields), and the resolveCone precedent for the lane resolver.
- Phase 7 (crit poise interrupt) inherits the per-attack stun-feel plumbing — an interrupt stagger can ride the same lastStrike→ATTACK_RENDER correlation.

## Self-Check: PASSED

- SUMMARY on disk; all 7 modified files present
- Commits f427a66, 2e51639, 58ddf60, 4a1e0ed, 6a41300 in git log
- 553/553 tests green at final gate; clean tree before doc commit

---
*Phase: 05-swordswing-swordswirl-combo*
*Completed: 2026-07-11*
