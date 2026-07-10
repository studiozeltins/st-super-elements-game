# Phase 5: swordSwing → swordSwirl combo - Research

**Researched:** 2026-07-10
**Domain:** SpacetimeDB server-authoritative attack FSM extension (chaining + cone hitbox) + Three.js sector telegraph + procedural clips
**Confidence:** HIGH — every seam verified against the actual codebase this session; zero new dependencies; zero external unknowns

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

> Cross-cutting constraints (server-authoritative, additive schema + `.default()` on new
> columns, INV-5 `ATTACKS` parity, test-first pure helpers, ≤300 LOC/file, tick-multiple
> windups ≥2 ticks, resolve-never-drop, migrated-DB verification, zero new deps, icy-cyan
> `#86e2ff`) are LOCKED in ROADMAP.md/REQUIREMENTS.md. Phase-4 decisions D4-01..D4-17 remain
> binding — D4-02 grace, D4-03 bystanders, D4-09 per-attack reaction DATA, D4-12 rooted
> windup, D4-14 telegraph language all carry to the new attacks verbatim.

**Chain mechanics (ATK-03)**
- **D5-01 — chain is DATA:** `AttackSpec` gains `chainsInto?: string`. At the chaining
  attack's strike-resolution transition (STRIKE→RECOVERY in `dueAttackTransitions` output),
  the glue enters the chained attack's windup via `enterWindup` INSTEAD of entering recovery —
  only the FINAL attack of a chain has a recovery window and writes a cooldown. Zero new FSM
  states, zero new tables; a future 3-hit chain is pure data. Rejected: a special CHAIN state
  (new state = schema+client churn) and selection-fn forcing (racy, not atomic with the swing).
- **D5-02 — chain is UNCONDITIONAL:** swirl always follows swing, hit or whiff — the
  telegraph never lies, the combo is learnable, and determinism is trivial. Rejected
  chain-on-hit (punishes the player for dodging the swing: dodge → no swirl warning habit).
- **D5-03 — swirl is NOT directly selectable:** `UNIT_ATTACKS[goliath].default =
  ['leapSlam', 'swordSwing']`; `swordSwirl` exists in `ATTACKS` but is reachable ONLY via
  `chainsInto`. Its band fields are inert (author them to swing's values for parity sanity).
- **D5-04 — swirl center = the goliath's planted position:** swirl's `enterWindup` locks
  landing = cast (`castX/Z`) — a self-centered 360° circle. The existing circle telegraph and
  `resolveCircleHit` work UNCHANGED for swirl (it is literally a circle at the goliath's feet).
  Player must move OUT (radius), not around (SC2).

**Cone geometry & client shape data (ATK-02)**
- **D5-05 — cone aim locked at windup entry, resolved vs LIVE positions:** aim direction =
  normalize(target sample − cast), stored via the EXISTING `landingX/Z` (aim point) with apex
  = `castX/Z`. Zero new geometry columns. At strike, every live player inside the cone is hit
  (D4-03 bystanders); stepping to side/back during the windup escapes (SC1). Grace (D4-02)
  applies as on leapSlam: resolve at strike+grace vs live rows.
- **D5-06 — cone shape numbers:** full angle **120°** (`minDot = cos(60°) = 0.5` — reuse
  `isWithinForwardArc` verbatim for the arc test + a range check for distance; that pair IS
  `resolveCone`, ATK-06 geometry-reuse honored). Range per size via `radiusBySize` semantics
  (field reused as "cone range"): seed **3.0 / 3.5 / 4.0**. Seeds; user tunes in playtest.
- **D5-07 — client shape data via a small mirror:** static per-attack render data (shape kind,
  cone half-angle, juice hints) lives in a client mirror `src/game/data/attacks.ts` keyed by
  `attackId`, guarded by `serverSync.test.ts` parity (the established INV-5 pattern — the test
  already imports the server `ATTACKS` cross-boundary). Rejected: bundling
  `spacetimedb/src/attacks.ts` into the client at runtime (the server file can later gain
  server-only imports and break the client build at a distance) and new row columns (static
  registry data does not belong per-row).

**Kit numbers & cooldown pacing (D4-07/D4-08 fulfillment)**
- **D5-08 — per-role cooldown split (additive column):** `unit_attack` gains
  `basicCooldownUntilMicros: t.u64().default(0)` (additive, migrate-safe per the
  spacetimedb-migrate-gotchas rule). `cooldownUntilMicros` stays the SKILL cooldown.
  `selectAttack` gains the basic-cooldown parameter and now gates basics too:
  `(distance, nowMicros, skillCooldownUntil, basicCooldownUntil, available)`. The IDLE
  transition writes the field matching the finished attack's `role`. Rejected: one shared
  cooldown for all attacks (slam's 5.5s would block swing → 5.5s of dead facetank air, the
  exact ATK-05 anti-pattern).
- **D5-09 — slam retune + band split (D4-07 honored):** `leapSlam.cooldownMicros` 3.5s →
  **5.5s**. Bands: slam stays 0..8 (skill), swing = basic band **0..3.5** (melee poke). Beyond
  3.5u with slam on cooldown → selection returns null → existing chase closes distance (D4-13).
- **D5-10 — damage seeds (chain cannot one-shot):** swing `damageMultiplier` **1.5×**
  contactDamage (→ 135/195/255 raw), swirl **2.5×** (→ 225/325/425 raw). Chain worst case =
  4.0× = **680 raw on the big goliath < 950 minimum squishy HP pool** — the swing+swirl chain
  alone cannot one-shot even before 'contact' resistance (roadmap note satisfied; slam stays
  the big hit at 4.5×). Damage lands in the SAME shared `playerDamage` map → same 'contact'
  resistance channel as the slam.
  *(Research correction: the actual minimum HP pool is **900** — zefs, `characters.ts:286` —
  not 950. The conclusion is unchanged: 680 < 900. See Pitfall 8.)*
- **D5-11 — timing seeds (exact tick multiples):** swing windup **4 ticks (0.6s)** — faster
  than slam's 1.2s (it's the cheap poke) but reactable over real RTT; active 1, grace 1;
  recovery UNUSED (chains into swirl). Swirl windup **5 ticks (0.75s)** — the chain warning
  window; active 1, grace 1, recovery **8 ticks (1.2s)** = the chain's single punish window.
- **D5-12 — reactions (D4-10 recorded intents, verbatim):** swing = **stun-only**
  (stunTicks 4 ≈ 0.6s, knockback 0 — Phase-4 playtest showed 0.3s reads as stutter); swirl =
  **knockback** (~4.5u, stunTicks 0 — the spin throws you clear, movement stays yours).
  Seeds; user tunes in playtest (D-02 pattern).
- **D5-13 — chain pacing:** basic (chain) cooldown seed **2.5s**, written at swirl's IDLE
  transition. Resulting rhythm at melee ≈ slam → chain → short gap → chain → slam off
  cooldown — the D4-08 basic-basic-skill feel.

**Telegraph & animation readability (SC3)**
- **D5-14 — cone telegraph = sector variant of the D4-14 language:** instant full-sector
  outline + progress sector expanding from the apex over the windup + rim flash at strike —
  `THREE.RingGeometry`'s `thetaStart/thetaLength` gives the sector slice; positioned at
  `castX/Z`, oriented from the cast→landing aim vector; same `#86e2ff`, additive blending,
  depth-test off, timing re-derived from the server row (ANIM-01). Swirl reuses the EXISTING
  circle telegraph path untouched (D5-04).
- **D5-15 — chain readability = sequencing, not pre-showing:** the swirl telegraph appears at
  swirl's own windup entry (0.75s warning). No double-telegraph during the swing — the chain
  teaches itself through repetition; SC2's "move OUT" is enforced by swirl's radius vs its
  windup escape distance.
- **D5-16 — two distinct procedural clips** on the existing `animateAttack` hook (ANIM-03):
  swing = arm/torso wind-back during windup → forward slash lunge at strike; swirl = torso
  coil → full 360° spin through strike, recovery settles heavy. Neutral-restore contract from
  04-05 (animateMovement re-poses first) carries.

### Claude's Discretion
- Exact `chainsInto` glue shape in `unitAttacks.ts` (how the STRIKE→RECOVERY branch swaps to
  `enterWindup(swirl)`; whether swing's `recoveryEndsAtMicros` is written-but-unused) and the
  coalesced-tick test for "swing strike + chain windup entry in one pass".
- `resolveCone` exact signature/edge semantics (inclusive edges like `resolveCircleHit`;
  zero-length aim fallback mirroring `knockbackDisplacement`).
- Cone sector mesh construction + progress-fill technique so the sector reads through the
  pixel filter at max pixelation (ANIM-02) — verify like 04-04 did.
- Per-attack strike juice variants (shake magnitude, WebAudio whoosh/thud composition) keyed
  by `attack_strike.attackId` — both SMALLER than the slam's full juice; swing lightest.
- Exact client-mirror module shape (`src/game/data/attacks.ts`) + which fields serverSync
  asserts (at minimum: windup/active/grace/recovery ticks, cooldowns, ranges, multipliers,
  chainsInto, cone angle).
- Whether the goliath stays rooted through BOTH windups (expected: yes — D4-12 applies per
  windup; the swirl cast root = wherever the swing left it).
- Inert band values authored on `swordSwirl` for parity sanity.

### Deferred Ideas (OUT OF SCOPE)
- **shieldDash-after-whiff selection preference** — Phase 6 discuss (selection weighting after
  a whiffed chain; carried from 04-CONTEXT).
- **shieldDash reaction assignment** (knockback+stun intent recorded in D4-10) — Phase 6.
- **Reposition/strafe AI between attacks** — revisit ONLY if the Phase-5 kit still feels
  static (carried from 04-CONTEXT).
- **3-hit+ chains / per-archetype attack lists (XCMB-03)** — v2; `chainsInto` makes them pure
  data when wanted.
- Miss/evasion RNG (pending USER decision — Phase 5 must NOT introduce miss RNG), poise
  accrual/interrupt (Phase 7), hero FSM (XCMB-04), camp-enemy conversion (XCMB-01).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ATK-02 | `swordSwing` — a frontal cone resolved vs live positions (close-range poke) | `isWithinForwardArc` verified at `goliathAI.ts:69–88` (exact signature confirmed); `resolveCone` = that + `distanceBetween` range check in `attackHitbox.ts`; aim derives from existing `castX/Z → landingX/Z` row fields (no schema change); `resolveStrike` shape-branch point identified at `unitAttacks.ts:71`; sector telegraph construction mapped onto the existing `createTelegraphSystem` recipe |
| ATK-03 | `swordSwirl` — a 360° circle that chains immediately after `swordSwing` | Chain swap point identified at the RECOVERY branch of the transition walk (`unitAttacks.ts:193–198`) with a mandatory `break` for coalesced-tick safety (analysis below); `resolveCircleHit` + circle telegraph serve swirl unchanged (verified — swirl is a circle at `castX/Z`); per-role cooldown column precedent verified (`stunnedUntilMicros: t.u64().default(0n)` appended last to populated `player` table, `index.ts:346`) |
</phase_requirements>

## Summary

Phase 5 is a **data + two-branch extension of a fully verified Phase-4 spine**. Every seam named
in CONTEXT.md exists exactly where claimed, with three material findings the planner must
absorb:

1. **The STRIKE transition unconditionally teleports the goliath to the landing**
   (`unitAttacks.ts:183` — the `move:'leap'` comment is not enforced in code). Shipping
   `swordSwing` (`move:'none'`) without gating this on `spec.move === 'leap'` teleports the
   goliath onto its aim point every swing. This is the single most dangerous latent bug in the
   phase.
2. **The chain swap must `break` the transition walk.** `dueAttackTransitions` is computed
   once per tick with the OLD attack's deadlines; a coalesced tick that jumped past swing's
   recovery deadline emits `[STRIKE, RECOVERY, IDLE]`. If the glue swaps to swirl's windup at
   the RECOVERY step and keeps walking, the stale IDLE step overwrites the fresh windup and
   writes a cooldown. Swirl's deadlines are now-relative (`strikeAt = now + 5 ticks`), so
   breaking is both correct and guarantees termination — FSM-05's resolve-never-drop holds
   because swing's strike resolves inside the same RECOVERY branch *before* the swap.
3. **The telegraph system re-anchors timing on a fresh cast but never rebuilds geometry**
   (`createTelegraphSystem.ts:178–187`). The chain arrives on the SAME telegraph key
   (`unitKind:unitId`) with a new `startedAtMicros`, new radius, and a different SHAPE — the
   existing code would keep showing the cone mesh during the swirl. The sync must
   remove+re-insert when the row's `attackId` changes.

Everything else is confirmed reuse: `AttackAnimationView` **already carries `attackId`**
(`createEntityRenderer.ts:16` — no interface change needed for ANIM-03), the `attack_strike`
event already carries `attackId` (`index.ts:642` — per-attack juice needs zero schema change),
the client timing anchor already re-bases on `startedAtMicros` change (`createGame.ts:324` —
the chain swap re-anchors animation timing for free), and the serverSync `ATTACKS` parity block
(`serverSync.test.ts:350–371`) auto-covers new entries via `it.each`.

**Primary recommendation:** Implement in three slices — (1) server data + pure helpers
(`ATTACKS` entries, `chainsInto`, `resolveCone`, `selectAttack` split, tests first), (2) server
glue + additive column + migrate-publish, (3) client mirror + telegraph sector branch + clips +
juice — verifying the parity suite green after each slice and gating on a migrated-DB playtest.

## Project Constraints (from CLAUDE.md)

Extracted directives that bind this phase's plans:

| Directive | Source | Phase-5 consequence |
|-----------|--------|---------------------|
| Reducers deterministic — no filesystem/network/timers/random | CLAUDE.md rule 2 | All new server logic clock/RNG-free; `now`/`tick` injected (existing pattern); grep-gate `Math.random`/`Date.now` in `spacetimedb/src` |
| Read via subscriptions, not reducer returns | CLAUDE.md rules 1,3 | No new subscriptions needed — `unit_attack` + `attack_strike` already subscribed once each |
| ≤300 LOC functional code per file; split by responsibility | Code Style | `unitAttacks.ts` is 207 lines — chain branch + shape branch + cooldown writes fit, but watch the ceiling; `createTelegraphSystem.ts` is 242 lines — the sector branch may justify extracting mesh-construction helpers |
| Never keep legacy/dead code; refactor in place | Code Style | Update `attacks.test.ts` literals (slam cooldown, UNIT_ATTACKS list, selectAttack signature) in the same slice, don't duplicate |
| No per-row-per-render identity compares; memoize App-body derivations | Perf rules | No new App.tsx work needed (event hook already wired); keep any new client work out of the App body |
| Module path is `./spacetimedb`; ignore broken `spacetime:publish` npm scripts | Environments | Publish: `spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb --server local --yes` |
| pnpm only (`pnpm add` — npm crashes on the symlink layout) | Memory | No installs expected (zero new deps) |
| NO maincloud publish — self-hosted pivot | Memory (self-hosted-spacetimedb) | Local publish + migrated-DB playtest ONLY |
| Additive schema; new column MUST have `.default()`; never `--delete-data` on real accounts | Memory (spacetimedb-migrate-gotchas) | `basicCooldownUntilMicros: t.u64().default(0n)` appended LAST to `unit_attack` |
| After schema change: publish → `pnpm run spacetime:generate` → `pnpm build` | Environments | Slice-2 deploy sequence |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Attack selection, chain sequencing, cooldown writes | Server module (worldTick glue) | — | Server-authoritative combat (locked); atomic with the strike, un-spoofable |
| Cone/circle hit resolution vs live positions | Server module (pure helpers) | — | FSM-02: damage resolves server-side at strike+grace vs live rows |
| Chain/attack timing deadlines | Server module (pure FSM math) | Client (re-derivation only) | Server writes micros on the row; client re-derives progress (ANIM-01), never owns timing |
| Telegraph rendering (sector + circle) | Browser client (Three.js) | — | Render-only; reads `unit_attack` rows via existing single subscription |
| Attack animation clips | Browser client (renderer) | — | Render-only; `AttackAnimationView` already carries `attackId` |
| Strike juice (shake/SFX/burst) | Browser client (event handler) | — | Fires once per `attack_strike` onInsert (ANIM-04) |
| Shape/angle/juice static data | Client mirror module | Server registry (source of truth) | D5-07: client mirror + serverSync parity, not runtime cross-bundle import |
| Persistence/migration of new column | SpacetimeDB (additive migrate) | — | `.default()` backfill on populated table — verified precedent |

## Standard Stack

### Core (all existing — zero new dependencies, locked)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| spacetimedb (server SDK) | workspace (module in `./spacetimedb`) | Tables, scheduled worldTick, deterministic time | Existing platform `[VERIFIED: codebase]` |
| three | ^0.185.1 | Sector telegraph (`RingGeometry` thetaStart/thetaLength), procedural clips | Already bundled; `RingGeometry(inner, outer, thetaSegments, phiSegments, thetaStart, thetaLength)` signature stable and already used 3-arg in `createTelegraphSystem.ts:94` `[VERIFIED: package.json + codebase usage]` |
| vitest | 3.2.4 | Pure-helper tests + serverSync parity | Existing runner; server pure modules imported cross-boundary `[VERIFIED: package.json + serverSync.test.ts:29]` |
| WebAudio (browser built-in) | — | Per-attack whoosh/thud variants | `createAudioSystem.ts` procedural-SFX pattern established (zero assets) `[VERIFIED: codebase]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `THREE.MathUtils` | bundled | clamp/lerp in clips + telegraph | Only sanctioned interpolation helper (locked decision) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `RingGeometry` sector | `THREE.Shape` + `ShapeGeometry` arc | More vertices/control but new code path; RingGeometry with thetaStart/Length reuses the exact existing material/renderOrder recipe — preferred |
| Client mirror module | Runtime import of `spacetimedb/src/attacks.ts` into the client bundle | REJECTED by D5-07 (server file may gain server-only imports; breaks client build at a distance) |

**Installation:** none — zero new dependencies (locked).

## Package Legitimacy Audit

No new packages are installed in this phase (zero-new-deps is a locked constraint).

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                         SERVER (worldTick, every ~150ms, one clock sample)
  ┌──────────────────────────────────────────────────────────────────────────────┐
  │ position-build passes → runUnitAttacks(ctx, now, tick, goliaths, ...)        │
  │                                                                              │
  │  IDLE row ──selectAttack(dist, now, skillCd, basicCd, list)──► attackId?     │
  │     │  null → chase continues (D4-13)                                        │
  │     ▼                                                                        │
  │  enterWindup(spec) — locks castX/Z (apex/center) + landingX/Z (aim/target)   │
  │     │                                                                        │
  │  dueAttackTransitions(state, now, strikeAt, graceAt, recoveryEnd)            │
  │     │  ordered walk: [STRIKE, RECOVERY, IDLE] (coalesced-safe)               │
  │     ├─ STRIKE: emit attack_strike (UNCONDITIONAL, attackId on event)         │
  │     │          teleport-to-landing ONLY IF spec.move === 'leap'  ◄── NEW GATE│
  │     ├─ RECOVERY: resolveStrike — shape branch:                               │
  │     │      circle → resolveCircleHit(victim, landing, radius)                │
  │     │      cone   → resolveCone(victim, cast, aim=landing−cast, range, dot)  │
  │     │      hits → shared playerDamage map + knockback + stun                 │
  │     │      then: spec.chainsInto?                                            │
  │     │        YES → row = enterWindup(chained) + attackId swap + BREAK ◄── NEW│
  │     │        NO  → state = RECOVERY                                          │
  │     └─ IDLE: write cooldown to the field matching spec.role  ◄── NEW SPLIT   │
  │              ('skill' → cooldownUntilMicros, 'basic' → basicCooldownUntil…)  │
  │                                                                              │
  │  playerDamage apply loop (existing): round → 'contact' resistance → death    │
  └───────────────┬──────────────────────────────────┬───────────────────────────┘
                  │ unit_attack rows (1 sub)         │ attack_strike events (1 sub)
                  ▼                                  ▼
  ┌──────────────────────────────────┐  ┌───────────────────────────────────────┐
  │ CLIENT render-only               │  │ App.tsx useTable(attackStrike)        │
  │ syncUnitAttacks(rows)            │  │  → handleAttackStrike(strike)         │
  │  ├─ telegraphSystem.syncAttacks  │  │     branch juice by strike.attackId   │
  │  │   shape lookup ← client mirror│  │     (shake magnitude, SFX variant,    │
  │  │   circle → existing rings     │  │      burst/shockwave)  ◄── NEW BRANCH │
  │  │   cone → sector @ castX/Z     │  └───────────────────────────────────────┘
  │  │   attackId changed → rebuild  │
  │  ├─ syncAttackTimings (re-anchors on startedAt change — chain works free)   │
  │  └─ refreshAttackViews → AttackAnimationView{attackId,...}                  │
  │      → goliath animateAttack branches clip by view.attackId  ◄── NEW BRANCH │
  └──────────────────────────────────┘
        client mirror src/game/data/attacks.ts (shape/half-angle/juice hints)
        ⇅ guarded by serverSync.test.ts parity vs server ATTACKS (INV-5)
```

### Recommended Project Structure (deltas only)

```
spacetimedb/src/
├── attacks.ts            # +swordSwing/+swordSwirl entries, +chainsInto?/+coneMinDot? on
│                         #  AttackSpec, selectAttack 5-arg split, slam 5.5s (stays well <300 LOC)
├── attackHitbox.ts       # +resolveCone (pure; reuses isWithinForwardArc + distanceBetween)
├── unitAttackFsm.ts      # likely UNCHANGED (enterWindup/dueAttackTransitions already serve chain)
├── unitAttacks.ts        # glue: chain swap+break, move gate, shape branch, per-role cooldown,
│                         #  idleAttackRow +basicCooldownUntilMicros (watch 300-LOC ceiling)
└── index.ts              # unit_attack +basicCooldownUntilMicros: t.u64().default(0n) LAST

src/game/
├── data/attacks.ts       # NEW client mirror: { shape, coneHalfAngleDegrees?, juice hints }
├── data/__tests__/
│   ├── attacks.test.ts       # UPDATE literals (slam 5.5s, list, selectAttack args) + chain tests
│   ├── attackHitbox.test.ts  # +resolveCone edge/inclusive/degenerate tests
│   └── serverSync.test.ts    # extend ATTACKS block: damage seeds, chainsInto integrity,
│                             #  cone minDot ↔ mirror half-angle, mirror key parity
├── systems/createTelegraphSystem.ts  # shape branch + rebuild-on-attackId-change
├── systems/createGoliathRenderer.ts  # animateAttack branches by view.attackId (2 new clips)
├── audio/createAudioSystem.ts        # +playSwing/+playSwirl (or parameterized variant)
└── createGame.ts                     # handleAttackStrike branches juice by attackId
```

### Pattern 1: Chain swap inside the transition walk (the D5-01 mechanism)

**What:** At the RECOVERY step of the walk, after resolving the strike, swap the row into the
chained attack's windup and stop walking.
**When to use:** Any `spec.chainsInto` — swirl now, 3-hit chains later as pure data.
**Example (glue shape, adapted from verified `unitAttacks.ts:178–204`):**

```typescript
// Source: spacetimedb/src/unitAttacks.ts:178-204 (verified this session) + D5-01
for (const nextState of transitions) {
  if (nextState === ATTACK_STATE_STRIKE) {
    // NEW GATE: only a leaping attack teleports (see Pitfall 1)
    if (spec.move === 'leap') {
      goliathPosition.set(goliathRow.goliathId, { x: row.landingX, z: row.landingZ });
    }
    ctx.db.attackStrike.insert({ /* unconditional, unchanged — carries attackId */ });
    row = { ...row, state: ATTACK_STATE_STRIKE };
  } else if (nextState === ATTACK_STATE_RECOVERY) {
    if (!row.strikeResolved) {
      resolveStrike(/* shape-branched — see Pattern 2 */);
    }
    const chained = spec.chainsInto ? ATTACKS[spec.chainsInto] : undefined;
    if (chained) {
      // Chain entry (D5-01): swirl's cast = wherever the unit is NOW; swirl's
      // landing = cast (D5-04 self-centered) falls out of passing pos as target.
      const pos = goliathPosition.get(goliathRow.goliathId)!;
      const entry = enterWindup(now, tick, chained, goliathRow.sizeIndex, pos.x, pos.z, pos.x, pos.z);
      row = { ...row, ...entry, attackId: spec.chainsInto! };
      break; // CRITICAL: remaining transitions ([IDLE]) belong to the OLD attack's
             // deadlines — walking on would stomp the fresh windup + write a cooldown.
             // Swirl's deadlines are now-relative, so nothing else is due this tick.
    }
    row = { ...row, state: ATTACK_STATE_RECOVERY, strikeResolved: true };
  } else {
    // IDLE — per-role cooldown split (D5-08/D5-13): the FINISHING attack's role decides.
    row =
      spec.role === 'basic'
        ? { ...row, state: ATTACK_STATE_IDLE, basicCooldownUntilMicros: now + spec.cooldownMicros }
        : { ...row, state: ATTACK_STATE_IDLE, cooldownUntilMicros: now + spec.cooldownMicros };
  }
}
if (transitions.length > 0) attackTable.id.update(row);
```

**Coalesced-tick analysis (FSM-05 must hold — verified against `dueAttackTransitions`,
`unitAttackFsm.ts:100–120`):** a tick that jumped past ALL of swing's deadlines emits
`[STRIKE, RECOVERY, IDLE]`. The walk fires swing's strike event (STRIKE), resolves swing's hit
(RECOVERY, before the swap), swaps to swirl's windup, breaks. Swing's strike was resolved —
never dropped. Swirl's `strikeAtMicros = now + 4×tick... (5 ticks)` is strictly future, so the
NEXT tick's `dueAttackTransitions` call handles it normally; a single pass cannot loop.
`dueAttackTransitions` itself needs **zero changes**. The coalesced-tick unit test should
assert exactly this sequence (see Validation Architecture).

Note on `strikeResolved`: after the swap the row carries `enterWindup`'s
`strikeResolved: false` — correct, since swirl's own strike is pending. Swing's
`recoveryEndsAtMicros` (written at swing's windup entry) is overwritten by swirl's — the
"written-but-unused" question in Claude's Discretion resolves itself: keep `enterWindup`
untouched; the field is simply superseded on chain.

### Pattern 2: `resolveCone` — pure reuse of verified geometry

**What:** Arc test + range check, edge-inclusive, matching `resolveCircleHit` semantics.
**Verified inputs:** `isWithinForwardArc(headingX, headingZ, fromX, fromZ, targetX, targetZ, minDot)`
at `goliathAI.ts:69–88`; `distanceBetween` at `combatMath.ts:16–18`.

```typescript
// Source: goliathAI.ts:69 + combatMath.ts:16 (verified) — attackHitbox.ts addition
import { isWithinForwardArc } from './goliathAI';

// True when (px,pz) lies inside the cone: within `range` of the apex (INCLUSIVE,
// like resolveCircleHit) AND within the forward arc of the aim vector. minDot =
// cos(half-angle) — 0.5 for the 120° swing (D5-06).
export function resolveCone(
  px: number, pz: number,
  apexX: number, apexZ: number,
  aimX: number, aimZ: number,   // landing − cast, NOT normalized (arc test normalizes)
  range: number,
  minDot: number
): boolean {
  if (distanceBetween(px, pz, apexX, apexZ) > range) return false;
  return isWithinForwardArc(aimX, aimZ, apexX, apexZ, px, pz, minDot);
}
```

**Degenerate-edge semantics (verified in `isWithinForwardArc`):**
- Near-zero AIM (`landing ≈ cast`, target sample on top of the goliath): `headingLength < 1e-6`
  → returns `true` → the cone degrades to a 360° range check. Acceptable: it only happens when
  the aim sample was point-blank, and it errs toward hitting a player standing inside the
  goliath. Mirrors the "no facing info → still fights" intent of the original helper.
- Target AT the apex (`directionLength < 1e-6`) → returns `true` → point-blank always hit.
  Consistent with `resolveCircleHit`'s inclusive edge.
- Arc edge: `dot >= minDot` — inclusive, matching the circle's `<=` radius.

**Caller-side branch in `resolveStrike` (currently hardcodes circle at `unitAttacks.ts:71`):**

```typescript
const hit =
  spec.shape === 'cone'
    ? resolveCone(victim.positionX, victim.positionZ, row.castX, row.castZ,
        row.landingX - row.castX, row.landingZ - row.castZ, row.radius, spec.coneMinDot ?? 0.5)
    : resolveCircleHit(victim.positionX, victim.positionZ, row.landingX, row.landingZ, row.radius);
if (!hit) continue;
```

**Knockback center for the cone:** push away from the APEX (`row.castX/Z` — the goliath), not
the landing/aim point; for circle attacks keep `row.landingX/Z` (unchanged; for swirl
landing == cast so both are identical). Swing seeds knockback 0 (D5-12) so this branch is
inert this phase, but author it correctly — a later cone with knockback must not pull toward
the aim point. `knockbackDisplacement`'s zero-delta fallback (heading) already covers the
victim-on-apex case (`attackHitbox.ts:39–41`).

### Pattern 3: Per-role cooldown split (D5-08)

`selectAttack` (verified `attacks.ts:76–94`) becomes:

```typescript
// Source: attacks.ts:76 (verified) + D5-08 signature
export function selectAttack(
  distance: number,
  nowMicros: bigint,
  skillCooldownUntilMicros: bigint,
  basicCooldownUntilMicros: bigint,
  available: readonly string[]
): string | null {
  let basicInBand: string | null = null;
  for (const attackId of available) {
    const spec = ATTACKS[attackId];
    if (!spec) continue;
    if (distance < spec.minBand || distance > spec.maxBand) continue;
    if (spec.role === 'skill') {
      if (nowMicros >= skillCooldownUntilMicros) return attackId;
      continue;
    }
    if (nowMicros < basicCooldownUntilMicros) continue; // NEW: basics gate too
    if (basicInBand === null) basicInBand = attackId;
  }
  return basicInBand;
}
```

Call site (`unitAttacks.ts:133–138`) passes `row.basicCooldownUntilMicros` as the new arg.
Cooldown authoring that makes D5-13 work: `swordSwirl.role = 'basic'` and
`swordSwirl.cooldownMicros = 2_500_000n` — the chain's cooldown is written by the FINISHING
attack (swirl) at its IDLE transition into `basicCooldownUntilMicros`, which gates the next
swing. `swordSwing.cooldownMicros` is never written (swing never reaches IDLE — it always
chains); author it to `2_500_000n` anyway so the registry reads honestly (same
inert-for-parity-sanity treatment as swirl's bands, D5-03).

### Pattern 4: Telegraph sector branch + rebuild-on-attackId-change

**Shape lookup:** `insert(row)` consults the client mirror by `row.attackId`
(`shape: 'circle' | 'cone'`, `coneHalfAngleDegrees`). Unknown/empty attackId → circle
(back-compat with rows written before the client updated).

**Sector construction (mirrors the verified circle recipe, `createTelegraphSystem.ts:88–139`):**

```typescript
// Cone telegraph (D5-14) — same flatMaterial/renderOrder recipe as the circle.
const fullAngle = THREE.MathUtils.degToRad(coneHalfAngleDegrees * 2); // 120° → 2.094
// Outline: arc rim at the outer edge of the sector (constant danger edge).
new THREE.RingGeometry(range - RIM_WIDTH, range, RING_SEGMENTS, 1, -fullAngle / 2, fullAngle);
// Progress: FILLED sector (inner ≈ 0) built at full size, scaled 0.0001 → 1 over the
// windup — RingGeometry fans out from the origin, and the group sits at the APEX
// (castX/Z), so the scale-up expands from the apex exactly as D5-14 specifies.
new THREE.RingGeometry(0.001, range, RING_SEGMENTS, 1, -fullAngle / 2, fullAngle);
// Both rotated flat (rotation.x = -Math.PI / 2) like the circle rings, then the GROUP
// is yawed to the aim: after the -PI/2 X-rotation, geometry angle θ maps to world
// (cosθ, 0, -sinθ), so with the sector authored centered on θ=0 (the +X axis):
group.rotation.y = Math.atan2(-(row.landingZ - row.castZ), row.landingX - row.castX);
group.position.set(row.castX, getGroundHeight(row.castX, row.castZ) + GROUND_EPSILON, row.castZ);
```

The yaw sign convention is derived, not visually confirmed — treat as MEDIUM confidence and
verify through the pixel filter exactly like 04-04 did (ANIM-02 check is already mandated).
A filled additive-blended sector at PROGRESS_OPACITY reads brighter than the thin ring; if it
overwhelms at max pixelation, drop the progress opacity for cones — discretion.

**Rebuild on attackId change (REQUIRED — see Pitfall 3):** store `attackId` on
`ActiveTelegraph`; in `syncAttacks`, when `existing` is found and `row.attackId !==
existing.attackId`, `remove(key, existing)` then `telegraphs.set(key, insert(row))`. The
existing `startedAtMicros` re-anchor branch then only ever handles same-attack re-casts.

**Swirl:** zero telegraph changes — it is a circle at `landingX/Z` (== cast), radius from
`radiusBySize` (seed swirl radii to taste; a self-centered circle slightly larger than swing's
range enforces SC2's "move OUT"). Note swirl's radius must exceed the escape distance
reachable during its 0.75s windup *from inside swing's cone* for the chain to threaten — but
D5-15 explicitly makes this a playtest-tuned seed, not a computed guarantee.

### Pattern 5: Animation clip branch (ANIM-03, zero interface change)

`AttackAnimationView.attackId` **already exists** (`createEntityRenderer.ts:16`) and is already
populated from the row (`createGame.ts:389`). The chain swap re-anchors timing automatically:
`syncAttackTimings` re-bases when `startedAtMicros` changes (`createGame.ts:324`), and the
swap writes a fresh `startedAtMicros`. So `animateAttack(view)` in `createGoliathRenderer.ts:100`
just branches:

```typescript
animateAttack(view) {
  if (view.attackId === 'swordSwing') return animateSwing(view);   // windback → slash lunge
  if (view.attackId === 'swordSwirl') return animateSwirl(view);   // coil → 360° spin → settle
  return animateLeapSlam(view); // existing crouch/arc/settle body, unchanged
}
```

Clip notes from the verified rig (`createGoliathRenderer.ts:36–125`): the model exposes named
parts (`leftArm`/`rightArm`/`head`/legs) and `applyCrouch`; the neutral-restore contract is
`applyCrouch(0)` (+ any new transforms reset) inside `animateMovement`/`animateDeath` — new
clips that rotate arms or yaw `model.body` MUST add their transforms to that restore. The
swirl spin should rotate a body/torso node, NOT `model.group` (the renderer owns group
rotation via `lookAt`, `createEntityRenderer.ts:267–273`). `travelFraction` is leap-specific —
new clips use `view.phaseProgress` only (swing/swirl are `move:'none'`, mesh doesn't travel).

Camp enemies compile unchanged — `animateAttack` is optional (`createEntityRenderer.ts:40`,
verified) and only the goliath adapter implements it.

### Pattern 6: Per-attack strike juice (ANIM-04)

`handleAttackStrike` (`createGame.ts:1391–1405`, verified) already receives `strike.attackId`.
Branch there: slam keeps the full package (burst 26 + shockwave + flash + shake 0.45 +
`playSlam`); swirl = medium (smaller shake, shockwave fits since it IS a circle); swing =
lightest (no shockwave — a circle shockwave misreads a cone — small burst + flash + light
shake + whoosh). New WebAudio variants follow the `playSlam` recipe (`createAudioSystem.ts:30`):
swing whoosh = short bandpassed noise sweep; swirl = longer noise swell + low thump. Juice
magnitudes can live as hints in the client mirror or as constants in the handler — discretion.

### Anti-Patterns to Avoid
- **Selection-fn chain forcing** (making `selectAttack` return swirl after swing): rejected by
  D5-01 — racy, not atomic with the swing's strike resolution.
- **New FSM state for chaining:** rejected by D5-01 — schema + client churn for zero gain.
- **Pre-showing the swirl telegraph during the swing:** rejected by D5-15.
- **Shared cooldown for all attacks:** the exact ATK-05 facetank dead-air anti-pattern (D5-08).
- **Runtime client import of the server attacks module:** rejected by D5-07 — use the mirror.
- **Re-aiming the cone at the strike frame:** perfect-homing is a REQUIREMENTS.md anti-feature;
  aim locks at windup entry (D5-05).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cone membership test | New dot-product/angle math | `isWithinForwardArc` (`goliathAI.ts:69`) | ATK-06 mandate; handles zero-length heading/direction edges already |
| Range check | Manual `Math.hypot` | `distanceBetween` (`combatMath.ts:16`) | Shared planar helper; ATK-06 |
| Swirl hit test + telegraph | Anything new | `resolveCircleHit` + existing circle telegraph | D5-04: swirl IS a circle at the goliath's feet |
| Chain timing | New deadline fields/state | `enterWindup` + `dueAttackTransitions` unchanged | D5-01: chain = data + one glue branch |
| Knockback push | New displacement math | `knockbackDisplacement` (`attackHitbox.ts:28`) | Zero-delta fallback already handled |
| Sector mesh | Custom BufferGeometry | `THREE.RingGeometry(..., thetaStart, thetaLength)` | Bundled; same material recipe as circle rings |
| Attack SFX | Audio assets/library | Procedural WebAudio per `createAudioSystem.ts` pattern | Zero-asset precedent (04-06); zero new deps |
| Client/server drift protection | Manual doc discipline | `serverSync.test.ts` import-and-compare | INV-5 established mechanism, release-blocking |

**Key insight:** Phase 4 deliberately built every seam this phase needs. The entire phase is
two `ATTACKS` entries, one optional `AttackSpec` field pair, one pure resolver, four small
branches (glue chain/move-gate/shape, telegraph shape, clip, juice), one additive column, and
test extensions. Any plan that adds a table, an FSM state, a subscription, or a dependency is
wrong.

## Common Pitfalls

### Pitfall 1: STRIKE transition teleports EVERY attack to its landing (latent bug)
**What goes wrong:** `unitAttacks.ts:183` does `goliathPosition.set(goliathId, landing)`
unconditionally at the STRIKE transition. The comment says "The leap (move: 'leap')" but the
code never checks `spec.move`. `swordSwing` (`move:'none'`, landing = aim point up to 3.5u
away) would teleport the goliath onto the player every swing; the chained swirl would then
center there, silently converting the poke into a gap-closer.
**Why it happens:** Phase 4 had exactly one attack and it leaped; the gate was unnecessary.
**How to avoid:** Gate: `if (spec.move === 'leap') goliathPosition.set(...)`. Add a glue-level
or playtest check that a swing leaves the goliath at its cast root.
**Warning signs:** Goliath "snaps" toward the player at swing strike in playtest; swirl circle
centered on the player instead of the goliath.

### Pitfall 2: Chain swap must `break` the transition walk (coalesced-tick stomp)
**What goes wrong:** `dueAttackTransitions` output is computed ONCE with swing's deadlines. On
a coalesced tick emitting `[STRIKE, RECOVERY, IDLE]`, swapping to swirl's windup at RECOVERY
and continuing the walk lets the stale IDLE step overwrite `state` to IDLE and write a
cooldown — the swirl never happens and the chain silently drops (violates SC2 + FSM-05 intent).
**How to avoid:** `break` immediately after the swap (Pattern 1). Swing's strike is resolved
before the swap, so nothing is dropped; swirl's now-relative deadlines guarantee the next tick
picks it up.
**Warning signs:** Unit test: state after a jumped-past-everything tick must be WINDUP
(swirl), not IDLE; `basicCooldownUntilMicros` must be 0 until swirl finishes.

### Pitfall 3: Telegraph geometry is never rebuilt on the chain swap
**What goes wrong:** The chain arrives on the SAME telegraph key with new `startedAtMicros` +
new radius + different SHAPE. The existing re-anchor branch (`createTelegraphSystem.ts:178–187`)
only updates timing and group position — the CONE mesh (wrong shape, wrong size, wrong yaw)
keeps displaying through the whole swirl windup. SC3 fails.
**How to avoid:** Track `attackId` on `ActiveTelegraph`; on mismatch, remove + re-insert
(Pattern 4). Keep the startedAt re-anchor for same-attack re-casts.
**Warning signs:** After a swing, the circle warning for the swirl never appears — the cone
sector lingers instead.

### Pitfall 4: `resolveStrike` hardcodes circle semantics (hit test AND knockback center)
**What goes wrong:** `unitAttacks.ts:71` tests `resolveCircleHit(..., row.landingX, row.landingZ,
row.radius)` and `unitAttacks.ts:73–81` pushes victims away from `landing`. For a cone, the
hit test must run from the APEX (`castX/Z`) with the aim vector, and knockback (if any) must
push away from the apex — pushing away from the aim point would drag side-victims TOWARD the
goliath's facing line.
**How to avoid:** Shape branch per Pattern 2; knockback center = `cast` for cones, `landing`
for circles.
**Warning signs:** Players beside the goliath get hit by a swing "cone" centered 3.5u in front
of it; `resolveCone` tests with apex ≠ aim-point catch this.

### Pitfall 5: `idleAttackRow` misses the new column
**What goes wrong:** `unitAttacks.ts:27–46` constructs the full lazy-upsert row literal. Adding
`basicCooldownUntilMicros` to the table without adding `basicCooldownUntilMicros: 0n` to
`idleAttackRow` fails the insert (or silently relies on default behavior differing between
fresh insert and migration backfill).
**How to avoid:** Same slice as the schema change; the pure glue has no compile-time row type
(it's `any`-typed), so nothing catches it except runtime publish/logs.
**Warning signs:** `spacetime logs 2d-impact-game-fr9ti` insert errors on first goliath engage
after publish.

### Pitfall 6: Additive column rules on the populated `unit_attack` table
**What goes wrong:** The local DB has live `unit_attack` rows from the Phase-4 playtest. A new
column without `.default()`, or inserted mid-table, is refused by STDB's auto-migration.
**How to avoid:** `basicCooldownUntilMicros: t.u64().default(0n)` appended LAST — the exact
pattern verified at `index.ts:346` (`stunnedUntilMicros` on the populated `player` table) and
`index.ts:498` (`transcendLevel`). Note the default literal is `0n` (bigint) for `t.u64()`,
not `0` (see the u64 precedents at `index.ts:340–346`). D3-01 (STATE.md) confirmed additive
`.default()` columns are accepted as UPDATE on a populated DB — no wipe, no fallback ladder.
Verify on the MIGRATED local DB, never a fresh seed. `[VERIFIED: codebase + STATE.md D3-01]`
**Warning signs:** `spacetime publish` migration rejection; plan must publish to `local` and
confirm rows survive.

### Pitfall 7: Existing tests hard-assert Phase-4 literals — they MUST be updated in-slice
**What goes wrong:** `attacks.test.ts:20–37` asserts `leapSlam` via `toEqual` including
`cooldownMicros: 3_500_000n`; `:51` asserts `UNIT_ATTACKS[...].default` equals `['leapSlam']`;
`:72–90` calls `selectAttack` with the 4-arg signature. The slam retune (5.5s), the list change
(`['leapSlam','swordSwing']`), and the 5-arg signature all break these. Also: if `AttackSpec`
gains fields present on `leapSlam` (e.g. authored `coneMinDot` — don't; keep it
optional/absent on non-cones), the `toEqual` literal breaks too.
**How to avoid:** Update the literals in the same task as the data change (no-dead-code rule:
refactor in place). `serverSync.test.ts:350–371` `it.each` auto-covers new entries for
tick-multiple invariants — no changes needed there for that part.
**Warning signs:** Red suite immediately after slice 1 — expected; plan the updates, don't
discover them.

### Pitfall 8: Worst-case chain damage — numbers verified, one figure corrected
**What goes wrong:** Shipping the seeds without re-deriving the one-shot bound against real
data.
**Verified model:** `GOLIATH_SIZE_STATS.contactDamage = 90/130/170` (`enemyStats.ts:71–73`).
Swing 1.5× → 135/195/255; swirl 2.5× → 225/325/425. Worst chain (big goliath) = 255 + 425 =
**680 raw**. Minimum player pool is **900 (zefs, `characters.ts:286`)** — NOT the 950 stated in
D5-10 — followed by 950 (three characters). Worst victim (zefs has no `PLAYER_RESISTANCES`
entry → contact ×1.0, `resistances.ts:44–48`) takes the full 680 < 900 → the chain alone
cannot one-shot any max-HP character. Margin: 220 HP (~24%). Swing and swirl also resolve on
DIFFERENT ticks (separate `playerDamage` applies ~1s apart), so there is no single-tick 680
spike; the bound holds even for the sum. Slam(765) + full chain(680) = 1445 CAN kill a squishy
over ~6+ telegraphed seconds — that is intended kit lethality, outside the roadmap's
chain-only mandate. `[VERIFIED: codebase]`
**How to avoid:** serverSync should assert the per-size damage arrays AND
`max(chain damage) < min(maxHealth over CHARACTERS)` as a live invariant, so future retunes
can't silently cross the line.

### Pitfall 9: Swirl "escapability" is a radius-vs-windup race — seed consciously
**What goes wrong:** SC2 requires that a player CAN escape by moving out during swirl's 0.75s
windup, and MUST die if they merely strafe. If swirl's radius is much larger than
(moveSpeed × 0.75s + grace 0.15s) from anywhere inside swing's cone, the chain is undodgeable
(a REQUIREMENTS.md anti-feature); much smaller and it never threatens. Player moveSpeeds run
~6.4–7.6u/s → escape budget ≈ 0.9s × ~7 ≈ 6.3u minus starting depth inside the circle.
**How to avoid:** Seed swirl radii around swing's range (e.g. 4.0/4.5/5.0 — a player at the
cone edge starts near the rim; one caught at the apex must commit hard). Radii are explicitly
playtest seeds (D-02 pattern); document the race arithmetic next to the seed so tuning is
informed. (Exact seed = planner/user discretion; CONTEXT locks only swing's 3.0/3.5/4.0.)
**Warning signs:** Playtest: standing still through the swirl telegraph survives, or full
sprint from the rim still dies.

### Pitfall 10: New clips leak transforms past the neutral-restore contract
**What goes wrong:** 04-05's contract: `animateMovement` restores neutral BEFORE
`animateAttack` re-poses each frame (`createGoliathRenderer.ts:81–85`). Swing's arm wind-back
and swirl's torso yaw introduce transforms `applyCrouch(0)` does NOT reset — a chain ending or
a death mid-spin leaves a twisted rig.
**How to avoid:** Extend the restore in `animateMovement`/`animateDeath` to zero every
transform the new clips touch (arm rotations, body yaw), exactly as the existing arm-swing
lines already re-write `rotation.x` each frame.
**Warning signs:** Goliath walks around with a rotated torso after its first swirl.

## Code Examples

Verified patterns from the codebase (primary sources for this phase):

### New ATTACKS entries (data shape, from verified `AttackSpec` + D5 numbers)
```typescript
// Source: spacetimedb/src/attacks.ts:23-59 (verified interface) + D5-06/09/10/11/12/13
// AttackSpec gains two OPTIONAL fields (absent on leapSlam — keeps its toEqual literal valid):
//   chainsInto?: string;   // D5-01
//   coneMinDot?: number;   // cos(half-angle); only meaningful for shape 'cone'
swordSwing: {
  shape: 'cone',
  role: 'basic',
  windupTicks: 4,            // 0.6s (D5-11)
  activeTicks: 1,
  graceTicks: 1,
  recoveryTicks: 8,          // inert — always chains (author sane; never reached)
  cooldownMicros: 2_500_000n,// inert — swing never reaches IDLE (chain writes swirl's)
  radiusBySize: [3.0, 3.5, 4.0], // reused as CONE RANGE (D5-06)
  damageMultiplier: 1.5,     // 135/195/255 raw (D5-10)
  minBand: 0,
  maxBand: 3.5,              // basic melee band (D5-09)
  knockback: 0,
  stunTicks: 4,              // 0.6s stun-only (D5-12)
  move: 'none',
  poiseThreshold: 600,       // Phase-7 seam; seed like slam
  chainsInto: 'swordSwirl',
  coneMinDot: 0.5,           // cos(60°) — 120° full angle (D5-06)
},
swordSwirl: {
  shape: 'circle',
  role: 'basic',             // finishing attack's role → basicCooldownUntilMicros (D5-13)
  windupTicks: 5,            // 0.75s chain warning (D5-11)
  activeTicks: 1,
  graceTicks: 1,
  recoveryTicks: 8,          // 1.2s — the chain's single punish window (D5-11)
  cooldownMicros: 2_500_000n,// the CHAIN cooldown, written at swirl's IDLE (D5-13)
  radiusBySize: [4.0, 4.5, 5.0], // seed — see Pitfall 9 escape-race note
  damageMultiplier: 2.5,     // 225/325/425 raw (D5-10)
  minBand: 0,                // inert (D5-03): author to swing's values for parity sanity
  maxBand: 3.5,              // inert (D5-03)
  knockback: 4.5,            // throw clear (D5-12)
  stunTicks: 0,
  move: 'none',
  poiseThreshold: 600,
},
// UNIT_ATTACKS: { [UNIT_KIND_GOLIATH]: { default: ['leapSlam', 'swordSwing'] } }  (D5-03)
// leapSlam.cooldownMicros: 3_500_000n → 5_500_000n  (D5-09)
```

### Additive column (exact verified precedent form)
```typescript
// Source: index.ts:344-346 (stunnedUntilMicros precedent, verified) — append LAST in unit_attack:
    // Basic-attack cooldown split from the skill cooldown (D5-08). Appended LAST
    // with .default(0n) so the additive migrate backfills the populated table.
    basicCooldownUntilMicros: t.u64().default(0n),
```

### serverSync parity extensions (mechanism verified at `serverSync.test.ts:350–371`)
```typescript
// The existing it.each(Object.entries(ATTACKS)) tick-invariant block covers the two
// new entries automatically. ADD:
it('swordSwing damage = 1.5x per-size contactDamage -> 135/195/255 (D5-10)', ...);
it('swordSwirl damage = 2.5x per-size contactDamage -> 225/325/425 (D5-10)', ...);
it('the swing+swirl chain cannot one-shot the lowest max-HP character', () => {
  const minHp = Math.min(...Object.values(CHARACTERS).map(c => c.maxHealth)); // 900 today
  const worstChain = Math.max(...GOLIATH_SIZE_STATS.map(s =>
    Math.round(s.contactDamage * ATTACKS.swordSwing.damageMultiplier) +
    Math.round(s.contactDamage * ATTACKS.swordSwirl.damageMultiplier)));
  expect(worstChain).toBeLessThan(minHp);
});
it.each(...)('chainsInto resolves in ATTACKS and terminates (no cycles)', ...);
it('swordSwirl is not directly selectable (D5-03)', () =>
  expect(UNIT_ATTACKS[UNIT_KIND_GOLIATH].default).not.toContain('swordSwirl'));
// Client-mirror parity (D5-07): mirror keys === Object.keys(ATTACKS); mirror shape ===
// spec.shape; cone: Math.cos(degToRad(mirror.coneHalfAngleDegrees)) ≈ spec.coneMinDot.
```

### Client mirror module shape (D5-07; new file `src/game/data/attacks.ts`)
```typescript
// Static per-attack RENDER data keyed by attackId. Server ATTACKS stays the source
// of truth for all TIMING/damage (rows are denormalized from it); this mirror holds
// only what the renderer needs to pick shape/orientation/juice. Guarded by
// serverSync.test.ts parity (INV-5).
export interface AttackRenderSpec {
  shape: 'circle' | 'cone';
  coneHalfAngleDegrees?: number; // 60 for swordSwing — parity-checked vs coneMinDot
  // juice hints (shakeMagnitude, sfx kind) — discretion; may live here or in createGame
}
export const ATTACK_RENDER: Record<string, AttackRenderSpec> = {
  leapSlam: { shape: 'circle' },
  swordSwing: { shape: 'cone', coneHalfAngleDegrees: 60 },
  swordSwirl: { shape: 'circle' },
};
```

## State of the Art

| Old Approach (Phase 4) | Current Approach (Phase 5) | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single attack; strike teleport unconditional | `spec.move === 'leap'` gate | This phase | Non-leaping attacks stay planted |
| One shared `cooldownUntilMicros` | Skill/basic split via additive column | This phase (D5-08) | D4-08 basic-basic-skill rhythm becomes real |
| `resolveStrike` hardcodes circle | Shape branch (circle/cone) | This phase (ATK-06) | Third shape (lane) lands Phase 6 on the same branch |
| Telegraph = circle only, geometry never rebuilt | Shape lookup + rebuild on attackId change | This phase (D5-14) | Chain renders honestly |
| `selectAttack(distance, now, cooldown, available)` | 5-arg with basic cooldown | This phase (D5-08) | Existing tests updated in-slice |

**Deprecated/outdated:** nothing external; no library API changes involved (three ^0.185.1
`RingGeometry` signature unchanged since r125+ `[VERIFIED: codebase usage]`).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Sector yaw convention `group.rotation.y = atan2(-(aimZ), aimX)` with the sector authored centered on geometry +X after the `-π/2` X-rotation | Pattern 4 | Cone telegraph points the wrong way — caught immediately by the mandated ANIM-02 visual check through the pixel filter; a sign flip is a one-line fix `[ASSUMED — derived from rotation math, not visually verified this session]` |
| A2 | The local `unit_attack` table currently holds rows (populated by the Phase-4 playtest), making `.default()` mandatory rather than merely prudent | Pitfall 6 | None — `.default(0n)` is required by the locked constraint regardless; if the table happens to be empty the migrate is trivially safe `[ASSUMED — DB not queried this session]` |
| A3 | Swirl radius seeds 4.0/4.5/5.0 satisfy the SC2 escape race | Pitfall 9 | Playtest tuning pass (already planned per D-02/04-07 precedent); seeds are explicitly user-tunable `[ASSUMED — arithmetic estimate]` |

## Open Questions

1. **Does the chain glue stay under `unitAttacks.ts`'s 300-LOC ceiling?**
   - What we know: file is 207 functional-ish lines; chain branch + move gate + shape branch +
     cooldown split add roughly 30–50.
   - What's unclear: whether the planner also lands the cone knockback-center branch there.
   - Recommendation: it fits; if it crosses ~300, extract `resolveStrike` into a sibling
     (`unitStrike.ts`) in the same slice — pre-authorize this in the plan.
2. **Where do juice hints live — client mirror or `createGame` constants?**
   - What we know: both satisfy D5-07/ANIM-04; mirror keeps per-attack data in one place,
     constants keep the mirror minimal for parity.
   - Recommendation: put shape + half-angle in the mirror (parity-checked); keep juice
     magnitudes as plain constants in the handler (not parity material). Discretion.
3. **Cone telegraph straight edges:** the arc-rim outline has no straight edges from the apex.
   - Recommendation: ship arc rim + filled progress sector first (cheapest, reuses recipe);
     add two thin edge quads only if the 04-04-style pixel-filter check says the cone reads
     ambiguously. Discretion.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| pnpm | build/test | ✓ | 11.9.0 | — |
| spacetime CLI | publish/generate/sql | ✓ | installed (`spacetimedb-cli.exe`, commit 052c83f) | — |
| Local SpacetimeDB standalone (`spacetime start`) | migrated-DB playtest | assumed available (Phase-4 playtest ran 2026-07-10) | — | start `spacetimedb-standalone.exe` per CLAUDE.md |
| vitest | test suite | ✓ | 3.2.4 | — |
| three | telegraph/clips | ✓ | ^0.185.1 | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.2.4 |
| Config file | vite/vitest default (project root; tests under `src/**/__tests__`) |
| Quick run command | `pnpm vitest run src/game/data/__tests__/attacks.test.ts src/game/data/__tests__/attackHitbox.test.ts src/game/data/__tests__/unitAttackFsm.test.ts` |
| Full suite command | `pnpm test` (= `vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ATK-02 | `resolveCone` inclusive edges, arc membership, apex/zero-aim degenerates, side/back escape | unit (pure) | `pnpm vitest run src/game/data/__tests__/attackHitbox.test.ts` | ✅ file exists — extend |
| ATK-02 | `selectAttack` 5-arg: basic gated by basic cooldown, skill preferred, band split 0..3.5 vs 0..8, chase sentinel | unit (pure) | `pnpm vitest run src/game/data/__tests__/attacks.test.ts` | ✅ file exists — update + extend |
| ATK-03 | Chain data integrity: chainsInto resolves + terminates; swirl not selectable; damage seeds; no-one-shot invariant | unit (parity) | `pnpm vitest run src/game/data/__tests__/serverSync.test.ts` | ✅ file exists — extend |
| ATK-03 | Coalesced tick across the chain: `dueAttackTransitions` list + glue break contract (swing strike resolved, state ends WINDUP-swirl, no cooldown written) | unit (pure + glue-shaped) | `pnpm vitest run src/game/data/__tests__/unitAttackFsm.test.ts` (pure part); glue break contract needs either a pure extraction (e.g. `nextAfterStrike(spec)`) or a Wave-0 harness | ✅ pure file exists; ❌ glue test — Wave 0 decision |
| SC1/SC2/SC3 | Frontal hit / side escape / chain forces move-out / telegraphs + clips + parity green | human playtest (migrated local DB, two clients ideal) | manual — publish local → `pnpm run spacetime:generate` → `pnpm build` → LAN playtest | manual-only (server-authoritative UX gate per pure-helper-testing-discipline memory) |

### Sampling Rate
- **Per task commit:** the quick run command above (< 5s)
- **Per wave merge:** `pnpm test`
- **Phase gate:** full suite green + `tsc -b` clean (`pnpm build`) + migrated-DB playtest before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Decide the chain-glue test seam: EITHER extract a pure helper (recommended: a tiny
  `nextAfterStrike(spec) → 'chain' | 'recovery'` or a pure transition-applier taking the
  transitions list + spec and returning the row mutation plan) tested in
  `unitAttackFsm.test.ts`, OR document the `break` contract and cover it indirectly. The
  pure-helper-testing-discipline memory strongly favors the extraction — the coalesced-tick
  chain test is the phase's highest-value test (CONTEXT explicitly asks for it).
- No framework/config gaps — existing vitest infrastructure covers everything else.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (no new auth surface) | existing `ctx.sender` model untouched |
| V3 Session Management | no | — |
| V4 Access Control | yes (trust boundary) | ALL new combat logic runs inside the scheduled `worldTick` — zero new client-callable reducers, zero new client arguments. The client remains render-only; a modified client cannot trigger, skip, redirect, or re-aim a chain. |
| V5 Input Validation | no new inputs | no new reducer args; `unit_attack`/`attack_strike` writes are server-originated only |
| V6 Cryptography | no | — |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client damage/aim spoofing | Tampering | Already closed (CRIT-06 intent model); this phase adds no client input — chain + cone resolve entirely server-side vs live rows |
| Determinism break (`Math.random`/`Date.now` in module) | Tampering/Repudiation | Existing grep-gate; all new server code takes injected `now`/`tick` (pure-helper pattern verified in every touched module) |
| Stun/knockback griefing amplification | DoS (gameplay) | Damage/reaction numbers are server data; no-one-shot invariant enforced by parity test (Pitfall 8) |
| Telegraph desync (client shows wrong danger zone) | Spoofing (self-inflicted) | INV-5 parity test is release-blocking; timing re-derived from server row (ANIM-01) |

## Sources

### Primary (HIGH confidence — read in full this session)
- `spacetimedb/src/attacks.ts` (registry, AttackSpec, selectAttack — 95 lines)
- `spacetimedb/src/unitAttackFsm.ts` (enterWindup, dueAttackTransitions — 121 lines)
- `spacetimedb/src/unitAttacks.ts` (glue: transition walk, resolveStrike, idleAttackRow — 207 lines)
- `spacetimedb/src/attackHitbox.ts` (resolveCircleHit, knockbackDisplacement)
- `spacetimedb/src/goliathAI.ts:69–88` (isWithinForwardArc exact signature/edge behavior)
- `spacetimedb/src/combatMath.ts` (distanceBetween)
- `spacetimedb/src/resistances.ts` (contact channel, PLAYER_RESISTANCES)
- `spacetimedb/src/enemyStats.ts:70–74` (GOLIATH_SIZE_STATS 90/130/170)
- `spacetimedb/src/index.ts:454–480` (unit_attack), `:637–647` (attack_strike), `:333–346, 496–498` (`.default()` precedents), `:3206–3433` (playerDamage flow)
- `src/game/systems/createTelegraphSystem.ts` (full — re-anchor gap found at 178–187)
- `src/game/systems/createGoliathRenderer.ts` (full — rig, clips, neutral restore)
- `src/game/systems/createEntityRenderer.ts` (AttackAnimationView.attackId at :16; optional hook at :40)
- `src/game/createGame.ts:276–424` (timing anchors, view build), `:1391–1405` (strike juice), `:1012–1030` (shake)
- `src/game/audio/createAudioSystem.ts` (procedural SFX pattern)
- `src/App.tsx:285–294` (attack_strike single subscription)
- `src/game/data/characters.ts` (maxHealth pools; min = 900 at zefs)
- `src/game/data/__tests__/serverSync.test.ts:1–60, 320–371` + `attacks.test.ts` (full) (parity mechanism + literals to update)
- `.planning/phases/05-swordswing-swordswirl-combo/05-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md` (incl. D3-01 migrate resolution)
- `package.json` (three ^0.185.1, vitest 3.2.4); `pnpm 11.9.0` + spacetime CLI probed live

### Secondary (MEDIUM confidence)
- THREE.RingGeometry 6-arg signature (thetaStart/thetaLength) — training knowledge, corroborated by the 3-arg usage already in the codebase; API stable across three releases for years

### Tertiary (LOW confidence)
- none — no web research needed (zero new deps; everything codebase-grounded)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new deps; all versions read from package.json/probed live
- Architecture: HIGH — every extension point read in source this session; the three material findings (move gate, walk break, telegraph rebuild) are line-cited
- Pitfalls: HIGH — 8 of 10 verified directly in source; A1 (sector yaw sign) and A3 (swirl radius seed) flagged as the only derived/tunable items
- Damage model: HIGH — recomputed from live constants; D5-10's "950 minimum" corrected to 900 with conclusion intact

**Research date:** 2026-07-10
**Valid until:** ~2026-08-10 (internal codebase research — invalidated only by changes to the cited seams, not external churn)
