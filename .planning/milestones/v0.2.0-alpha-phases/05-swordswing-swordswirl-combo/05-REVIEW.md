---
phase: 05-swordswing-swordswirl-combo
reviewed: 2026-07-11T08:35:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - spacetimedb/src/attackHitbox.ts
  - spacetimedb/src/attacks.ts
  - spacetimedb/src/index.ts
  - spacetimedb/src/unitAttackFsm.ts
  - spacetimedb/src/unitAttacks.ts
  - src/App.tsx
  - src/game/audio/createAudioSystem.ts
  - src/game/createGame.ts
  - src/game/data/__tests__/attackHitbox.test.ts
  - src/game/data/__tests__/attacks.test.ts
  - src/game/data/__tests__/serverSync.test.ts
  - src/game/data/__tests__/unitAttackFsm.test.ts
  - src/game/data/attacks.ts
  - src/game/systems/createGoliathRenderer.ts
  - src/game/systems/createTelegraphSystem.ts
findings:
  critical: 0
  warning: 3
  info: 7
  total: 10
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-07-11T08:35:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

Reviewed the swordSwing → swordSwirl combo implementation end to end: the pure geometry layer (`attackHitbox.ts`), the data registry + selection (`attacks.ts`), the transition applier (`unitAttackFsm.ts`), the reducer glue (`unitAttacks.ts`), the schema/gate additions in `index.ts`, and the client render half (telegraph sector, procedural clips, SFX tiers, stun window, ATTACK_RENDER mirror + parity tests). All 217 tests in the four phase test files pass. Signatures of cross-module dependencies (`isWithinForwardArc`, `distanceBetween`, `clampToWorld`, `headingFromStep`) were verified against their definitions — argument order and degenerate-case semantics match the comments.

The core FSM chain contract is solid: I traced the coalesced-tick walks ([STRIKE], [STRIKE,RECOVERY], [STRIKE,RECOVERY,IDLE], [RECOVERY,IDLE]) for all three attacks and found no double-resolution, dropped strike, wrong-spec cooldown write, or chain loop; the break-on-chain contract is correctly enforced and tested. Determinism rules hold in `spacetimedb/src` (no `Math.random`/`Date.now`; all clocks injected). No security-relevant surface changed (the one new reducer gate is a hardening, not a hole).

Three warnings (a stun-clobbering logic flaw, undistanced global strike juice amplified by this phase, and a monolith-growth convention violation) and seven informational items below. No blockers.

## Warnings

### WR-01: Strike resolution overwrites — and can SHORTEN or CANCEL — an existing stun

**File:** `spacetimedb/src/unitAttacks.ts:109-114`
**Issue:** `resolveStrike` writes `stunnedUntilMicros: stunDeadline(now, spec.stunTicks, tick)` unconditionally on every hit victim. `stunDeadline` is `now + stunTicks*tick` with no comparison against the victim's current value. Two consequences in the multi-goliath case (up to 3 goliaths can be live and aggro'd to the same player):
1. Goliath A's leapSlam stuns a victim for 7 ticks; goliath B's swordSwing resolves 2 ticks later and rewrites the deadline to `now + 4` ticks — the slam stun is shortened.
2. Worse, swordSwirl has `stunTicks: 0`, so its resolution writes `stunnedUntilMicros = now` — a swirl hit **cancels** any active stun outright, instantly re-enabling `updatePosition` and `setActiveCharacter` for a player who should still be locked (HIT-01). Being hit by a second attack frees the victim from the first attack's stun.
Within a single chain the timing happens to never overlap (swing stun expires before swirl resolution), so solo play masks this; it only manifests with overlapping attackers.
**Fix:**
```typescript
// unitAttacks.ts resolveStrike — stuns must be monotonic, never shortened:
const newStun = stunDeadline(now, spec.stunTicks, tick);
ctx.db.player.identity.update({
  ...victim,
  positionX: clampToWorld(pushed.x),
  positionZ: clampToWorld(pushed.z),
  stunnedUntilMicros: newStun > victim.stunnedUntilMicros ? newStun : victim.stunnedUntilMicros,
});
```

### WR-02: Strike juice (camera shake + SFX) fires at full strength for strikes anywhere on the map — frequency amplified ~4x by this phase

**File:** `src/game/createGame.ts:1428-1472` (`handleAttackStrike`)
**Issue:** `handleAttackStrike` applies `shakeMagnitude` and plays SFX with no distance attenuation or culling relative to the local player. This is pre-existing from 04-06 (verified against the pre-phase source), but phase 05 materially amplifies it: basics fire on a 2.5s chain cooldown (vs the slam's 5.5s), each chain emits TWO strike events (swing + swirl), and up to 3 goliaths can be attacking different players simultaneously. A player on the far side of the archipelago now gets recurring camera shake and swing/swirl/slam audio from fights they cannot see — disorienting and it also misleads (shake normally signals *I* was hit or something nearby landed).
**Fix:** Gate/attenuate by distance from `playerPosition` to the strike landing, e.g.:
```typescript
const d = Math.hypot(strike.landingX - playerPosition.x, strike.landingZ - playerPosition.z);
const AUDIBLE_RANGE = 40;
if (d > AUDIBLE_RANGE) return; // still flash the telegraph if desired
const falloff = 1 - d / AUDIBLE_RANGE;
shakeMagnitude = tierMagnitude * falloff;
// scale SFX gain by falloff (pass a gain factor into playSwing/playSwirl/playSlam)
```

### WR-03: `createGame.ts` monolith grew +130 lines this phase against the project's ≤300 LOC / carve-when-touched rule

**File:** `src/game/createGame.ts:295-413` (and 1428-1472)
**Issue:** CLAUDE.md mandates ≤300 LOC of functional code per file and "carve new work into sibling modules rather than growing it, and refactor existing chunks out when you touch them." The server side honored this (attacks/unitAttackFsm/attackHitbox/unitAttacks are clean sibling modules), but the client half added ~130 lines to an already-1,533-line `createGame.ts`. The added subsystem is cohesive and extractable: `UnitAttackTiming`, `syncAttackTimings`, `serverNowEstimate`, `refreshAttackViews`, `STRIKE_PHASE_MICROS`, and the attack-state constants form a self-contained "unit-attack view clock" with two inputs (rows, alive-gate) and one output (views map) — exactly the shape of the existing `createTelegraphSystem.ts` sibling.
**Fix:** Extract `src/game/systems/createAttackViewClock.ts` (or similar) exposing `{ syncRows, refreshViews, dispose }`; `createGame` keeps only the wiring. The per-attack juice tier dispatch in `handleAttackStrike` could move with it or into the telegraph/effect layer.

## Info

### IN-01: Misleading comment — strike event and stun row update do NOT ride the same transaction in the normal path

**File:** `src/game/createGame.ts:1296-1302` (also the comment at 814)
**Issue:** The comment claims "The strike event and my stunned row update ride the same worldTick transaction, so a fresh (<600ms) strike is MY stun's cause." In the normal (non-coalesced) path the `attack_strike` event is inserted at the STRIKE transition and the stun is written one tick later at the grace-deadline resolution — two separate transactions ~150ms apart. The code still works because the freshness window is 600ms, but the comment documents a false invariant; someone raising `graceTicks` or the tick length past 600ms would break attribution while trusting this comment. (The `graceTicks === 1` parity test partially guards this.)
**Fix:** Reword the comment to "the strike event lands ≤1 tick (150ms) before the stun row update, well inside the 600ms freshness window."

### IN-02: 150ms world-tick length hardcoded in client mirrors with no parity guard

**File:** `src/game/createGame.ts:295`, `src/game/data/__tests__/serverSync.test.ts:460`
**Issue:** `STRIKE_PHASE_MICROS = 150_000n` and the mirror test's `stunTicks * 0.15` both bake in `WORLD_TICK_INTERVAL_MICROS`. The serverSync suite pins `graceTicks === 1` (tick *count*) but nothing pins the tick *length* — changing `WORLD_TICK_INTERVAL_MICROS` on the server would silently desync every client stun duration and the strike clip window, and no test would fail.
**Fix:** Add a serverSync extraction for `WORLD_TICK_INTERVAL_MICROS` (regex path like `extractServerConstant`, adjusted for the `n` suffix) and derive `0.15`/`150_000n` assertions from it.

### IN-03: Size-0 goliath has a guaranteed swing whiff band (selectable at 3.0–3.5u but cone range is 3.0u)

**File:** `spacetimedb/src/attacks.ts:69,72`
**Issue:** `swordSwing.maxBand` is a flat 3.5 for all sizes, but `radiusBySize` (reused as cone RANGE) is `[3.0, 3.5, 4.0]`. A size-0 goliath selects the swing against a target at 3.0–3.5u; if the target simply stands still, the strike resolves at a distance beyond range 3.0 → guaranteed whiff, which then still chains into the swirl (radius 4.0, which CAN connect). Whiff-into-chain is documented as intended behavior, but a *deterministic* whiff opener for one size tier reads like a band/range mismatch rather than tuning.
**Fix:** Either make `maxBand` per-size data (aligned with `radiusBySize`) or lower it to 3.0 so every size's swing can connect on a stationary target.

### IN-04: Knockback that pushes a victim into the safe zone silently drops that tick's accumulated damage

**File:** `spacetimedb/src/unitAttacks.ts:109-114` + `spacetimedb/src/index.ts:3437-3439`
**Issue:** `resolveStrike` writes the knocked-back position immediately; the single damage-apply loop later re-finds the player and skips damage if `isInsideSafeZone(targetPlayer.positionX, ...)` — using the *post-knockback* position. A victim standing just outside the safe-zone edge who is hit by a slam (6u) or swirl (4.5u) knockback aimed inward takes ZERO damage from that strike (and any enemy bite damage accumulated the same tick also vanishes). Player-favorable and rare (goliaths rarely fight at the spawn edge), but it is an ordering inconsistency: eligibility was already checked against the pre-knockback position inside `resolveStrike`.
**Fix:** Capture safe-zone eligibility at accumulation time (e.g. accumulate into the map only for eligible victims and drop the second safe-zone check for FSM damage), or apply damage before writing the displaced position.

### IN-05: resolveCone's non-normalized-aim contract (D5-05) has no direct test

**File:** `src/game/data/__tests__/attackHitbox.test.ts:31-79`
**Issue:** The comments lean on "the aim vector is landing minus cast, NOT normalized — isWithinForwardArc normalizes internally (D5-05)", and the production call site passes raw `landing - cast` deltas of arbitrary length. But every cone test passes a unit aim `(1, 0)` or the zero vector — a regression that started requiring normalized aim (e.g. someone "simplifying" the internal normalization away) would pass this suite while breaking every real strike whose target stood ≠1u away.
**Fix:** Add one case with a long diagonal aim, e.g. `resolveCone(2, 0, 0, 0, 30, 40, RANGE, MIN_DOT)` asserting the same result as aim `(0.6, 0.8)`.

### IN-06: Goliath strikes have no vertical gate — cone extends the 2D-only hit test

**File:** `spacetimedb/src/unitAttacks.ts:86-97`
**Issue:** Both `resolveCircleHit` and `resolveCone` are pure X/Z tests; a player standing on a terrace/bridge directly above the goliath within horizontal range is hit and knocked back. The client's own melee applies `VERTICAL_HIT_GATE = 3` (createGame.ts:238), so player-vs-entity and entity-vs-player use asymmetric rules. Pre-existing for the slam (phase 4); this phase extended the same 2D-only semantics to the new cone shape without revisiting it.
**Fix:** When a vertical gate becomes desirable, thread `positionY` into the resolvers as an optional band check (data field on `AttackSpec`); until then, note it as a known asymmetry.

### IN-07: `walkAttackTransitions` treats ANY unrecognized transition value as IDLE and writes a cooldown

**File:** `spacetimedb/src/unitAttackFsm.ts:179-184`
**Issue:** The final `else` in the walk matches everything that is not STRIKE/RECOVERY — including `ATTACK_STATE_WINDUP` or a garbage value — and responds by writing a cooldown and going IDLE. Today `dueAttackTransitions` is the only producer and never emits those, so this is unreachable; but the function is exported as a general-purpose pure applier and its tests feed hand-built lists, so a future caller passing a wrong constant would be silently converted into a cooldown write instead of failing loudly.
**Fix:** Make the IDLE branch explicit (`else if (nextState === ATTACK_STATE_IDLE)`) and ignore (or throw on) anything else.

---

_Reviewed: 2026-07-11T08:35:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
