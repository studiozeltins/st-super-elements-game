---
phase: 04-attack-state-machine-leapslam-end-to-end-delete-goliath-drai
plan: 06
subsystem: client-feel
tags: [attack-strike, webaudio, camera-shake, stun-reconcile, knockback, event-table]
requires:
  - 04-02 server stunnedUntilMicros write + updatePosition rejection while stunned
  - 04-04 telegraphSystem.flashStrike + attack_strike event table emission
  - 04-05 attack views / syncUnitAttacks plumbing in createGame.ts
provides:
  - createAudioSystem factory — zero-asset WebAudio slam one-shot, gesture-unlocked (D4-15)
  - attack_strike onInsert wiring in App.tsx (event-table ONE-subscription rule) -> handleAttackStrike
  - full strike juice fired once per slam — burst + rim flash + small short camera shake + SFX (ANIM-04)
  - HIT-01 client half — victim's screen adopts server knockback, input frozen ~0.3s
affects:
  - 04-07 (visual/feel sign-off human checkpoint covers this juice + stun feel)
tech-stack:
  added: []
  patterns:
    - gesture-unlocked lazy AudioContext with per-call, garbage-collectable node graphs
    - decaying random camera-shake offset injected into desiredPosition before the existing lerp
    - raised-watermark detection (stunnedUntilMicros GREATER than last seen) opening a perf-clock render window
key-files:
  created:
    - src/game/audio/createAudioSystem.ts
  modified:
    - src/App.tsx
    - src/game/createGame.ts
decisions:
  - "Slam SFX is procedural WebAudio (70->40Hz sine thump + 0.12s lowpass noise burst), zero asset files, zero new dependencies — RESEARCH Open Q2 resolved to the in-scope option"
  - "Stun input freeze covers movement AND jump/attack/skill (the must-have says input frozen, not just movement); gravity/ground physics keep running so knockback-off-an-edge still dies via VOID_KILL_DEPTH (D4-11)"
  - "Stun x/z lerp target is the FRESHEST self row (stunServerPosition updated every syncMyServerRow), y stays locally owned; syncPositionToServer untouched — the server-side updatePosition rejection is the real control (T-04-12)"
metrics:
  duration: ~8min
  completed: 2026-07-09
status: complete
---

# Phase 04 Plan 06: Strike Juice + Stun Reconcile Summary

The slam now lands with weight: one `attack_strike` insert fires exactly one impact burst + telegraph rim flash + small decaying camera shake + hand-rolled WebAudio thump (ANIM-04/D4-15), and the victim's own screen adopts the server's knockback — input frozen ~0.3s while x/z lerp to the authoritative row (HIT-01 client half, D4-10).

## What Was Built

### Task 1 — createAudioSystem.ts (zero-asset WebAudio slam)
- `createAudioSystem(): AudioSystem` factory (`playSlam()`, `dispose()`), zero dependencies, zero asset files.
- Lazy single `AudioContext`; one-time window `pointerdown`/`keydown` listeners create/resume it, self-removing once the context is running (browser gesture gate — the game always has input before combat).
- `playSlam()`: low sine thump (70Hz → 40Hz over 0.25s, fast-attack exponential-decay envelope to silence by ~0.35s) + 0.12s lowpass (400Hz) white-noise burst for impact texture. All nodes per-call, stopped and GC-able after the envelope. No-op guard when the context is absent/suspended — never throws mid-frame.
- `dispose()`: removes gesture listeners and closes the context.

### Task 2 — attack_strike wiring (ANIM-04, D4-15)
- **App.tsx**: `useTable(tables.attackStrike, { onInsert: strike => gameRef.current?.handleAttackStrike(strike) })` with the enemyHit-style one-subscription comment; `tables.attackStrike` appears exactly ONCE in App.tsx (proof it is absent from the manual subscribe list — T-04-13 mitigated).
- **createGame.ts** `handleAttackStrike(strike)` — each component fires once per event:
  - `effectSystem.spawnBurst` at `(landingX, groundHeight, landingZ)` in frost cyan `0x86e2ff` (26 particles);
  - `telegraphSystem.flashStrike(\`${unitKind}:${unitId}\`)` (rim pop);
  - `shakeMagnitude = 0.2` arms the camera shake;
  - `audioSystem.playSlam()`.
- **Camera shake** (SMALL + SHORT, taste-tunable consts): random per-frame offset scaled by `shakeMagnitude` added to `desiredPosition` before the existing camera lerp; magnitude decays `e^(-12·dt)` (~5% left after 0.25s, snaps off below 0.005). Cosmetic client randomness — render only.
- `audioSystem` instantiated beside the other systems and disposed with them.

### Task 3 — Stun reconcile (HIT-01 client half, D4-10/D4-11)
- `syncMyServerRow` tracks `lastStunnedUntilMicros`; a row arriving with a RAISED `stunnedUntilMicros` opens `stunActiveUntilPerfMs = performance.now() + STUN_RENDER_MS` (300 = `ATTACKS.leapSlam.stunTicks` (2) × 150ms tick, named constant with pointer comment). `stunServerPosition` copies the freshest self-row position on every sync.
- While the window is active in `updateLocalPlayer`: movement, jump, attack, and skill input are suppressed; `playerPosition.x/z` lerp toward the server row (`min(1, delta·12)`); `y` stays locally owned — gravity keeps running, so a knockback past an edge falls and dies via the existing `VOID_KILL_DEPTH` path (no new death handling, D4-11).
- `syncPositionToServer` untouched (zero diff hunks inside it) — it keeps firing; the server rejects position writes while stunned (Plan 02 guard), and when the stun expires local ≈ server so movement resumes seamlessly.

## Deviations from Plan

None - plan executed exactly as written.

(Note: the stun input freeze also gates jump/attack/skill, not only movement displacement — the plan's action text named movement, but the must-have truth specifies "input frozen ~0.3s"; gating all input satisfies the stated truth and is the smaller surprise for the victim.)

## Verification Results

- `pnpm build` exit 0 (all three tasks); `pnpm test` **510/510 green** (all three tasks)
- `grep -c "tables.attackStrike" src/App.tsx` → **1** exactly (one-subscription gate)
- `grep -c "handleAttackStrike" src/game/createGame.ts` → 2 (interface + implementation)
- `grep -c "playSlam\|flashStrike\|spawnBurst" src/game/createGame.ts` → 9 (≥3 required; all four juice components wired, shake via the magnitude var)
- `grep -c "AudioContext" createAudioSystem.ts` → 3; `grep -c "new Audio("` → 0 (WebAudio synthesis, no asset-backed elements); `grep -c "playSlam"` → 3
- `grep -c "stunnedUntilMicros" src/game/createGame.ts` → 5
- `git diff package.json` empty across the whole plan — zero new dependencies (T-04-SC lock held)
- `updateLocalPlayer` contains the stun-window guard bypassing input-driven movement; no diff hunk inside `syncPositionToServer`

## Commits

| Task | Type | Hash | Description |
|------|------|------|-------------|
| 1 | feat | 83463c6 | zero-asset WebAudio slam SFX behind createAudioSystem factory |
| 2 | feat | c94ed17 | attack_strike one-shot juice — burst + rim flash + camera shake + slam SFX |
| 3 | feat | 592e297 | stun reconcile — victim adopts server knockback, input frozen 0.3s |

## Known Stubs

None — the strike juice and stun reconcile are fully wired end-to-end. The feel/legibility sign-off (shake size, SFX taste, stun feel over real RTT) is Plan 07's human checkpoint as planned.

## Threat Flags

None beyond the plan's threat model. T-04-12: the input freeze is cosmetic by design — the Plan-02 `updatePosition` rejection remains the authoritative control. T-04-13: single-subscription grep gate pinned at exactly 1. T-04-SC: zero new packages.

## Self-Check: PASSED

- src/game/audio/createAudioSystem.ts exists; App.tsx + createGame.ts changes on disk
- Commits 83463c6, c94ed17, 592e297 verified in git log
- Build + 510/510 tests green after the final task
