---
phase: 05-swordswing-swordswirl-combo
fixed_at: 2026-07-11T17:25:00Z
review_path: .planning/phases/05-swordswing-swordswirl-combo/05-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 05: Code Review Fix Report

**Fixed at:** 2026-07-11T17:25:00Z
**Source review:** .planning/phases/05-swordswing-swordswirl-combo/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (fix_scope: critical_warning — WR-01, WR-02, WR-03)
- Fixed: 3
- Skipped: 0

All fixes were applied in an isolated git worktree on a temp branch and fast-forwarded back onto `alpha-v0.2.0`. Verification per fix: file re-read, `tsc` typecheck (spacetimedb tsconfig for WR-01, full `tsc -b` for WR-02/03), the four phase-05 vitest suites (217 tests), and — after the WR-03 refactor — the FULL vitest suite (32 files, 553 tests). All green.

## Fixed Issues

### WR-01: Strike resolution overwrites — and can SHORTEN or CANCEL — an existing stun

**Status:** fixed: requires human verification (logic fix — syntax/type checks cannot prove the semantics; no unit test covers `resolveStrike` directly since it is ctx.db glue)
**Files modified:** `spacetimedb/src/unitAttacks.ts`
**Commit:** 4a074e3
**Applied fix:** `resolveStrike` now computes `newStun = stunDeadline(now, spec.stunTicks, tick)` once and writes `stunnedUntilMicros` monotonically: `newStun > victim.stunnedUntilMicros ? newStun : victim.stunnedUntilMicros`. A second attacker's hit can only EXTEND a victim's stun; the swirl (stunTicks: 0) can no longer cancel an active slam/swing stun. Comment added documenting the monotonic contract (HIT-01).
**Note:** Server-side change — deployment (publish to local/self-hosted + bindings) is intentionally NOT done here; handled separately by the user.

### WR-02: Strike juice (camera shake + SFX) fires at full strength for strikes anywhere on the map

**Files modified:** `src/game/createGame.ts`, `src/game/audio/createAudioSystem.ts`
**Commit:** 14d9150
**Applied fix:**
- New `STRIKE_JUICE_RANGE = 40` (world units) in createGame. `handleAttackStrike` computes the landing's distance from the local player: beyond range it returns (no juice at all); within range a linear `juiceFalloff = 1 - d/range` scales the tier shake magnitude and is passed as an SFX gain factor. `lastStrike` is still recorded unconditionally BEFORE the gate so stun-cause attribution survives muted strikes.
- Shake now joins via `Math.max(shakeMagnitude, tier * falloff)` so a faint far strike can never cut short an ongoing stronger shake.
- `AudioSystem.playSlam/playSwing/playSwirl` accept an optional `gain` (0..1) that scales every peak gain node; a shared `clampGain` helper clamps to (0..1] and skips playback at 0 (WebAudio exponential ramps reject a 0 target). Parameter named `gainFactor` in the implementations to avoid shadowing the local `GainNode` variables.

### WR-03: `createGame.ts` monolith grew +130 lines this phase against the ≤300 LOC / carve-when-touched rule

**Files modified:** `src/game/systems/createAttackViewClock.ts` (new), `src/game/createGame.ts`, `src/game/data/__tests__/serverSync.test.ts`
**Commit:** 05e3818
**Applied fix:** Extracted the self-contained "unit-attack view clock" subsystem (`UnitAttackTiming`, `syncAttackTimings`, `serverNowEstimate`, `refreshAttackViews`, `STRIKE_PHASE_MICROS`, attack-state mirror constants, `goliathAlive`/`isUnitAlive` gate, `latestUnitAttackRows`) into `src/game/systems/createAttackViewClock.ts`, exposing `{ syncGoliaths, syncAttackRows, getAttackRows, isUnitAlive, refreshViews }` — the same sibling-module shape as `createTelegraphSystem`. `createGame.ts` keeps only wiring (net −143 lines): `syncGoliaths`/`syncUnitAttacks` feed rows in; the frame loop pushes `attackViewClock.refreshViews()` into the goliath renderer. The now-unused `AttackAnimationView` import was removed and `THREE.MathUtils.clamp` replaced with plain `Math.min/Math.max` so the new module needs no three.js import. The serverSync test comment pointing at createGame.ts for the strike-phase window was updated to reference the new module. Per-attack juice tier dispatch stayed in `handleAttackStrike` (it belongs with the effect/audio wiring, and WR-02 had just reshaped it).

## Skipped Issues

None — all in-scope findings were fixed.

## Out of Scope (fix_scope = critical_warning)

Info findings IN-01 through IN-07 were NOT attempted (fix_scope excludes Info tier): IN-01 misleading transaction comment, IN-02 tick-length parity guard, IN-03 size-0 swing whiff band, IN-04 safe-zone knockback damage drop, IN-05 non-normalized-aim cone test, IN-06 missing vertical gate, IN-07 FSM walk fallback branch. Note: IN-02's concern ("STRIKE_PHASE_MICROS hardcoded in client mirrors") now points at `src/game/systems/createAttackViewClock.ts` after the WR-03 extraction.

---

_Fixed: 2026-07-11T17:25:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
