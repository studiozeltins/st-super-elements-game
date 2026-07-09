# Phase 4: Attack state machine + leapSlam end-to-end + delete goliath drain - Research

**Researched:** 2026-07-09
**Domain:** Server-authoritative attack FSM on a SpacetimeDB scheduled tick + Three.js render-only telegraphs/animation
**Confidence:** HIGH (codebase-verified; zero new dependencies; all seams read directly this session)

## Summary

This phase is composition over existing, verified seams — not greenfield. The server already runs a
deterministic 150ms `worldTick` (`WORLD_TICK_INTERVAL_MICROS = 150_000n`, index.ts:257) with a
clean pass structure: position-build maps (passes 1–2, index.ts:2996–3120) → damage maps (passes
3–4b) → single apply loops (~3225–3379). `runUnitAttacks` slots between position-build and the
`playerDamage` apply exactly as the roadmap mandates, and the goliath→player contact drain to
delete is a single, isolated block (pass 4b, index.ts:3182–3190). The event-table pattern
(`enemy_hit`, index.ts:573–582), the additive-`.default()` migrate answer (Phase 3, confirmed on a
populated DB), the cross-boundary import-and-compare parity test (`serverSync.test.ts`), and the
zero-import pure-helper discipline (`crit.ts`/`skillGate.ts`/`goliathAI.ts`) are all proven analogs.

Three findings materially shape the plan. **(1) Player movement is client-authoritative** —
`updatePosition` (index.ts:1066) accepts client positions with only an anti-teleport clamp
(`MAX_STEP_DISTANCE = 12`), so a server-written knockback would be silently overwritten by the
client's next 100ms position sync unless the server also *rejects* client positions during a stun
window. HIT-01's "server-authoritative" therefore needs a `stunnedUntilMicros` column on `player`
plus a stun guard in `updatePosition`, with the honest client reconciling to the server row while
stunned. **(2) Reducers cannot keep in-memory state across ticks** (CLAUDE.md rule 2: all state
from tables), so the D4-02 dodge-grace "one tick of position history" cannot live in a module
variable — recommend the storage-free equivalent: resolve the hit across TWO consecutive tick
samples (inside at strike tick AND at strike+1 grace tick), reading live table positions both
times. **(3) No audio system exists anywhere in `src/`** — "slam SFX" (D4-15, SC3) is greenfield;
a ~40-LOC hand-rolled WebAudio one-shot is the only zero-dep option, and it must be planned as its
own small task or explicitly descoped by the user.

**Primary recommendation:** One `unit_attack` row per unit (lazily upserted, keyed by
`unitKind`+`unitId` btree index) holding FSM state + cooldown + poise + denormalized attack
timing/geometry, so the client renders telegraphs from the row alone with zero client-side attack
registry; pure FSM/hitbox/selection helpers in `attacks.ts`/`unitAttackFsm.ts`/`attackHitbox.ts`
tested first; `attack_strike` event for VFX/SFX; stun column + `updatePosition` guard for HIT-01.

## User Constraints (from CONTEXT.md)

<user_constraints>

### Locked Decisions

> Cross-cutting constraints (server-authoritative, additive schema, INV-5 `ATTACKS` parity,
> test-first pure helpers, ≤300 LOC/file, tick-multiple windups, resolve-never-drop late strikes,
> migrated-DB verification, zero new deps, icy-cyan `#86e2ff`) are LOCKED in ROADMAP.md and
> REQUIREMENTS.md — not re-litigated here. Phase-4 decisions from this discussion:

**Dodge timing & fairness (FSM-02, FSM-05)**
- **D4-01:** leapSlam windup = **1.2s (8 ticks @150ms)** — Hades/Genshin boss-AOE budget;
  reactable over maincloud RTT. Rejected 0.9s (RTT eats the budget) and 1.5s (sluggish).
- **D4-02:** Latency model = **favor-the-dodger grace**: strike resolves vs live positions, but a
  player who LEFT the circle within the final grace tick (~150ms / 1 tick) counts as OUT
  (defender-bias, Overwatch/Destiny standard). Needs one tick of position history (or
  prev-tick position snapshot) per attack resolution. Rejected exact-deadline resolve ("I dodged
  that!" over RTT is the feeling this milestone exists to kill).
- **D4-03:** AOE scope = **everyone inside the circle** is hit (shared co-op danger; the telegraph
  never lies to bystanders). Rejected aggro-target-only.

**Damage & pacing (ATK-01, ATK-05)**
- **D4-04:** Slam damage = **~4.5× contactDamage per size → 405/585/765** (user chose the
  Souls-tier option over the recommended 3×; ~40–65% of a squishy's 950–1400 HP pool).
  Values seeded in `ATTACKS`; user tunes in playtest (D-02 pattern).
- **D4-05:** Circle radius **scales per goliath size: 4.0 / 4.75 / 5.5 units** — fixes
  center-escape fairness at 1.2s windup (player moveSpeed 6–7.5 → 5.5u escape ≈ 0.75–0.9s);
  the big goliath earns the monster moment. Matches the existing per-size stat pattern
  (`GOLIATH_SIZE_STATS`).
- **D4-06:** Recovery (punish window) = **1.2s / 8 ticks**.
- **D4-07:** leapSlam cooldown = **3.5s in Phase 4** (it is the ONLY attack — avoids dead-air
  walking) with an **explicit Phase-5 retune to ~5.5s** when `swordSwing` lands as the basic
  filler. Full Phase-4 cycle ≈ 6s.
- **D4-08 (kit rhythm — binding on selection-fn design):** the user wants
  **basic-basic-skill rhythm, never skill-skill-skill**. Selection rule: *skill off cooldown +
  target in band → use the skill (maximize DPS); else basic attack (Phase 5+); else chase.* The
  FSM-03 selection fn signature and `UNIT_ATTACKS` data must support filler-vs-skill weighting
  from day one so Phases 5–6 slot in with zero schema change.

**Hit reaction & movement (HIT-01)**
- **D4-09:** Hit reaction is **per-attack DATA**: knockback distance + stun duration are fields
  in the `ATTACKS` registry, assigned per attack by animation logic + power (user). Server
  applies displacement/stun authoritatively; client renders.
- **D4-10:** leapSlam reaction = **knockback ~3u + micro-stun 0.3s (2 ticks)**. Recorded intents
  for later phases (assigned in THEIR discusses, fields exist now): swordSwing = stun-only,
  swordSwirl = knockback, shieldDash = knockback+stun.
- **D4-11:** **Edge-of-map/bridge knockback deaths are a feature** — positioning awareness is
  fun (user). No knockback safety rails.
- **D4-12:** Goliath is **ROOTED at the cast point during windup** (crouch in place), then leaps
  to the LOCKED landing at strike. Rejected creep-forward (desyncs body from the locked circle).
- **D4-13:** Between attacks: **existing chase AI unchanged**; body collision still shoves but
  deals ZERO damage; no new reposition/strafe AI this phase.

**Telegraph & strike visuals (ANIM-01..04)**
- **D4-14:** Telegraph = **instant full-radius outline + inner disc that fills outward over the
  windup + rim flash at strike** (FFXIV/WoW style — fill % IS the countdown), icy-cyan `#86e2ff`,
  timing re-derived from the server row. Rejected clock-sweep (aliases through the pixel filter)
  and pulse-ring (vibe, not countdown).
- **D4-15:** Strike moment = **full juice**: impact flash + dust/shard burst + SMALL short camera
  shake + slam SFX, fired ONCE on `attack_strike` onInsert. Camera shake needs a taste pass
  (keep small/short).
- **D4-16:** Animation = **crouch (silhouette compress during windup) → leap arc to the locked
  landing → slam impact**, procedural on the existing mesh rig via the `animateAttack` hook; the
  arc interpolates to the landing position already stored on the attack row.

**Scope confirmations**
- **D4-17:** `swordSwing` **stays Phase 5** (user confirmed over pulling it forward) — Phase 4
  isolates integration risk on one attack. "Shield rush during recovery" is reframed: NOT a
  recovery-cancel (breaks FSM determinism); Phase 6's selection may PREFER shieldDash right
  after a whiffed slam when the target fled — noted for the Phase 6 discuss.

### Claude's Discretion

- Exact `unit_attack` / `attack_strike` column shapes and the `ATTACKS` /
  `UNIT_ATTACKS[unitKind][archetype]` data layout (within the registry fields decided above:
  shape, windup/active/recovery/cooldown ticks, radius per size, damage multiplier, knockback,
  stunSeconds, `move`, `poiseThreshold`).
- Grace-tick implementation (prev-tick position snapshot vs 1-deep history) — pick the cheaper
  deterministic one.
- Telegraph mesh/shader implementation (ring + disc geometry vs shader fill) and exact
  strike-flash composition; small-camera-shake magnitude.
- Whether the slam's aggro interaction changes (goliath already has aggroPlayer) — keep existing
  aggro semantics unless the selection fn needs a target handle.
- Engage-range band values for the selection fn (must return an attack in every band per ATK-05;
  with one attack this phase, leapSlam covers all bands — design the bands so Phase 5/6 split them).

### Deferred Ideas (OUT OF SCOPE)

- **shieldDash-after-whiff selection preference** — Phase 6 discuss (selection weighting, not a
  recovery-cancel).
- **Per-attack reaction assignments for swing/swirl/dash** — their phases (fields exist now, D4-10).
- **Slam cooldown retune 3.5s → ~5.5s** — Phase 5, when swordSwing lands (D4-07).
- **Reposition/strafe AI between attacks** — rejected this phase; revisit only if the Phase-5 kit
  still feels static.
- Reviewed todos: 0 folded (user confirmed) — CIEŅA star restyle, BŪSTS orbit v2, transcend
  scaling, raid-boss/role-enforcement DEFERRED specs, miss/evasion decision (Phase 4 must NOT
  introduce miss RNG).

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FSM-01 | windup→strike→recovery FSM on server world tick, public unit-agnostic `unit_attack` (`unitKind`/`unitId`) | Table shape + lazy-upsert pattern (§Architecture); `worldTick` insertion point verified at index.ts:2996–3379 |
| FSM-02 | Strike damage resolves once at the strike frame vs LIVE player positions | `playerByHex` live map already built (index.ts:2956); circle resolver vs `player.positionX/Z` (§Hitbox Resolution) |
| FSM-03 | Selection fn `(distance, cooldownUntil, available[]) → attackId` | Pure helper in `attacks.ts`; band design honoring D4-08 skill-priority rhythm (§Selection Fn) |
| FSM-04 | Data-driven `ATTACKS` registry + `UNIT_ATTACKS[unitKind][archetype]` | Registry layout with all D4 fields incl. `move`, `poiseThreshold`, `role: 'skill'|'basic'` (§ATTACKS Registry) |
| FSM-05 | Deterministic: `ctx.timestamp` sampled once/tick, tick-multiple windups, late strikes resolved never dropped | `now >= strikeAtMicros` comparison semantics; jumped-two-intervals pure test (§FSM Determinism) |
| FSM-06 | Additive tables deploy to a MIGRATED DB; lazy state creation iterating UNIT tables | Phase-3 verified: additive tables/`.default()` columns accepted on populated DB; lazy upsert never iterates empty attack table (§Migration) |
| ATK-01 | `leapSlam` circle AOE at landing LOCKED at cast | Landing sampled from aggro target at windup entry, stored on row (§leapSlam Lifecycle) |
| ATK-05 | Contact drain deleted same slice; selection returns an attack in every band | Drain block isolated at index.ts:3182–3190; leapSlam band = 0..max with rooted-cast reachability (§Drain Deletion) |
| ATK-06 | Pure circle/cone/lane resolvers reusing geometry helpers | `distanceBetween`/`isWithinForwardArc` verified in combatMath.ts/goliathAI.ts; circle ships now, cone/lane signatures stubbed for 5/6 (§Hitbox Resolution) |
| ANIM-01 | Ground telegraph fills over windup, timing re-derived from server row | Row carries `startedAtMicros`+`strikeAtMicros`; client fill = `(now−startedAt)/(strikeAt−startedAt)` (§Telegraph) |
| ANIM-02 | Legible through pixel filter, icy-cyan `#86e2ff` | Pixel pipeline = 440px-wide internal buffer, nearest upscale (createPixelRenderer.ts); thick-ring guidance + human-verify gate (§Telegraph) |
| ANIM-03 | Shared procedural anim FSM via `animateAttack` hook on `EntityAnimation` | Hook does NOT exist yet — additive optional method; renderer plumbing design (§Animation Hook) |
| ANIM-04 | Strike VFX/SFX fire once on `attack_strike` onInsert | Event-table + ONE-subscription rule verified (App.tsx:118–121, Phase-2 lesson); no audio system exists — SFX is greenfield (§Strike Juice) |
| HIT-01 | Landed strike knocks back and/or stuns, server-authoritative, client-rendered | Client-authoritative movement discovered (updatePosition, index.ts:1066); stun column + reject-while-stunned guard design (§Knockback/Stun) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Reducers deterministic** — no filesystem/network/timers/random; state from tables only; `ctx.random`/`ctx.timestamp` are the sole time/RNG sources. Cross-tick FSM state MUST live in tables (kills any in-memory grace-tick snapshot).
- **Event tables**: rows never stored client-side; only `onInsert` fires — `attack_strike` follows `enemy_hit`.
- **ONE subscription per event table** (Phase-2 lesson, App.tsx comment): `useTable` opens the only subscription; do NOT also list event tables in the manual `.subscribe([...])`.
- **`ctx.sender` for authz** — no new client-callable reducers in this phase's core (FSM runs inside `worldTick`), keeping the attack surface unchanged.
- **≤300 LOC functional per file; no monoliths** — `index.ts` (3418 LOC, worst offender) gains ONLY table defs + one `runUnitAttacks(...)` call; logic goes to siblings `attacks.ts`, `unitAttackFsm.ts`, `attackHitbox.ts` (per CONTEXT).
- **No legacy code** — the contact-drain block, once replaced, is deleted in the same commit; no dead branches.
- **pnpm only** (`pnpm add` — npm crashes on symlink layout); module path is `./spacetimedb` (the `spacetime:publish` npm scripts point at the wrong `server` path — never use them).
- **Publish workflow**: schema change → `spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb --server local --yes` → `pnpm run spacetime:generate` → `pnpm run build`. Migrated maincloud deploy: publish WITHOUT `--delete-data`, then reducers activate lazily (no `seed_world` needed for this feature — FSM rows self-create).
- **Never `--delete-data` on a DB with real accounts**; `account`/`account_link` are NOT in the backup set.
- **Grep-gate**: no `Math.random`/`Date.now`/`import`/`ctx` tokens in zero-import pure helper files (matches even inside comments — phrase around them, per crit.ts header discipline).
- **Frost design language**: icy-cyan `#86e2ff`, minimal frostglass — telegraph + strike VFX must fit.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Attack FSM (windup/strike/recovery transitions) | Server (worldTick) | — | Determinism + cheat-proofing; the whole point of the phase |
| Attack selection (band + cooldown) | Server (worldTick, pure helper) | — | Feeds FSM; must be deterministic per D4-08 rhythm |
| Strike damage + grace resolution | Server (worldTick → `playerDamage` map) | — | Reuses resistance/death/shard-spill/respawn apply for free |
| Knockback displacement + stun window | Server (player row write + `updatePosition` guard) | Client (local reconcile + input freeze render) | Movement is client-authoritative today — server must OWN position during stun or knockback is cosmetic |
| Telegraph rendering (fill countdown) | Client (Three.js world layer) | — | Render-only from `unit_attack` row; timing re-derived, never client-local timer |
| Goliath windup/leap/slam animation | Client (`animateAttack` hook) | — | Procedural on existing rig; server row drives phase + landing |
| Strike VFX/SFX/camera shake | Client (`attack_strike` onInsert) | — | Event-table one-shot, mirrors `skill_cast`/`enemy_hit` |
| ATTACKS registry (durations/shapes/damage) | Server (`spacetimedb/src/attacks.ts`) | Test-only cross-boundary import (parity) | Single source of truth; client renders from denormalized row fields |

## Standard Stack

Zero new dependencies (locked). Everything hand-rolled on existing seams.

### Core (existing, verified)
| Asset | Location | Purpose | Why Standard |
|-------|----------|---------|--------------|
| `worldTick` scheduled reducer | index.ts:2938–3384 | FSM host; 150ms deterministic tick | Only deterministic clock/loop on the server [VERIFIED: codebase] |
| `playerDamage: Map<string, number>` + apply loop | index.ts:3160, 3339–3379 | Strike damage lands here → resistance/death/spill/respawn free | The single player-damage apply the roadmap mandates [VERIFIED: codebase] |
| `enemy_hit` event table pattern | index.ts:573–582 | Template for `attack_strike` | Proven onInsert-only broadcast; Phase-2/3 hardened [VERIFIED: codebase] |
| `GOLIATH_SIZE_STATS` | enemyStats.ts:70–74 | contactDamage 90/130/170 → 4.5× = 405/585/765; per-size radius pattern | Exactly matches D4-04/D4-05 arithmetic [VERIFIED: codebase] |
| `distanceBetween`, `stepToward` | combatMath.ts | Circle resolver + leap step geometry | Zero-import pure, already tick-tested [VERIFIED: codebase] |
| `isWithinForwardArc` | goliathAI.ts:69–88 | Cone resolver ingredient (Phase 5 signature stub) | ATK-06 mandates reuse [VERIFIED: codebase] |
| `resistedDamage` + `PLAYER_RESISTANCES` 'contact' | resistances.ts | Slam damage channel (default YES per CONTEXT — keeps tank identity: glacia 0.55, nereida 0.7, vesper 0.85) | Applied automatically by the existing playerDamage apply (index.ts:3343–3347) [VERIFIED: codebase] |
| `createEntityRenderer` + `EntityKindAdapter` | src/game/systems/createEntityRenderer.ts | Goliath mesh reconcile/lerp; hook point for `animateAttack` | Generic renderer both enemy+goliath share [VERIFIED: codebase] |
| `createEffectSystem` bursts/rings | src/game/systems/createEffectSystem.ts | Strike VFX composition (spawnBurst; RingGeometry ground-ring idiom in spawnNova) | ANIM-04 reuse target [VERIFIED: codebase] |
| `createPixelRenderer` two-pass | src/game/engine/createPixelRenderer.ts | Telegraph must live in the pixelated world pass (440px internal width) | ANIM-02 verification context [VERIFIED: codebase] |
| `serverSync.test.ts` cross-boundary import | src/game/data/__tests__/serverSync.test.ts:22–28 | ATTACKS parity extension (INV-5) | Import-and-compare-outputs, Phase-2 pattern [VERIFIED: codebase] |
| vitest 3.x (`pnpm test` = `vitest run`) | vitest.config.ts | All pure-helper + parity tests | Existing runner, 475+ green tests [VERIFIED: codebase] |
| `THREE.MathUtils` (bundled three) | client | Arc/lerp interpolation for leap + fill | The ONLY sanctioned interpolation helper (STATE lock) [VERIFIED: codebase] |

### New files (all hand-rolled)
| File | Purpose | LOC budget |
|------|---------|-----------|
| `spacetimedb/src/attacks.ts` | `ATTACKS` registry + `UNIT_ATTACKS` + selection fn (zero-import pure) | ~120 |
| `spacetimedb/src/unitAttackFsm.ts` | Pure FSM step fn: `(state, nowMicros, …) → transition` incl. late-tick resolution | ~100 |
| `spacetimedb/src/attackHitbox.ts` | Pure circle resolver (+ cone/lane signatures for 5/6) | ~60 |
| `spacetimedb/src/unitAttacks.ts` (or inline in index.ts if trivial) | `runUnitAttacks(ctx, now, tick, maps…)` reducer-side glue | ~120 |
| `src/game/systems/createTelegraphSystem.ts` | Ground telegraph meshes driven by `unit_attack` rows | ~150 |
| `src/game/audio/createAudioSystem.ts` (if SFX kept in scope) | WebAudio one-shot thump (no assets) | ~50 |
| Tests: `attacks.test.ts`, `unitAttackFsm.test.ts`, `attackHitbox.test.ts` + serverSync extension | Wave 0 test-first | ~250 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| One persistent `unit_attack` row per unit (state='idle' between attacks) | Insert row per attack, delete after recovery | Per-attack rows churn inserts/deletes every 6s per goliath and complicate "lazily insert by index"; persistent row gives stable subscription + natural cooldown/poise home. **Use persistent row.** |
| Two-tick AND-resolution for dodge grace (strike + 1 grace tick, both live reads) | Private `tick_position` snapshot table (prev-tick history) | Snapshot table = N player-row writes per 150ms tick forever, even with no attack active; two-tick read needs zero storage and is deterministic. **Use two-tick resolution** (see §Dodge Grace). |
| u32 state enum consts (`ATTACK_IDLE=0…`) | `t.string()` state | Matches existing `aggroKind` u32 idiom (index.ts:398); smaller rows. **Use u32 consts.** |
| Denormalized row (landing, radius, strikeAt, recoveryEndsAt on row) | Client-side ATTACKS mirror keyed by attackId | Mirror = second INV-5 surface to drift; denormalized row lets the client render with zero registry. Parity test still asserts registry invariants via direct import. **Denormalize.** |

**Installation:** none — zero new deps (locked).

## Package Legitimacy Audit

No packages are installed in this phase (zero-new-deps is a locked milestone constraint; `three`,
`spacetimedb`, `vitest` are already present in package.json). **Packages removed due to [SLOP]
verdict:** none. **Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
                              SERVER (worldTick, every 150ms)
  ┌──────────────────────────────────────────────────────────────────────────┐
  │ now = ctx.timestamp (sampled ONCE)                                       │
  │                                                                          │
  │ Pass 1–2: position-build ──► goliathPosition / enemyPosition /           │
  │                              playerByHex maps                            │
  │        │                                                                 │
  │        ▼                                                                 │
  │ runUnitAttacks(ctx, now, tick, goliaths, goliathPosition, playerByHex,   │
  │                playerDamage)                              ◄── NEW        │
  │   ├─ per goliath: lazy-find/insert unit_attack row (by_unit index)       │
  │   ├─ IDLE: selection fn (aggro target in band + off cooldown)            │
  │   │        → enter WINDUP: lock landing = target pos, poise=0,           │
  │   │          startedAt=now, strikeAt=now+8*tick  ── row update           │
  │   ├─ WINDUP: root goliath (override goliathPosition to cast point);      │
  │   │        now >= strikeAt → STRIKE: teleport goliathPosition to         │
  │   │          landing; insert attack_strike event; mark strike resolved   │
  │   ├─ STRIKE resolve (two-tick grace, D4-02): victims inside circle at    │
  │   │        strike tick AND grace tick → playerDamage.set(+405/585/765)   │
  │   │        + knockback displacement + stunnedUntilMicros                 │
  │   └─ RECOVERY: now >= recoveryEndsAt → IDLE, cooldownUntil=now+3.5s      │
  │        │                                                                 │
  │        ▼                                                                 │
  │ Pass 3–4: camp/goliath-vs-enemy drains (UNTOUCHED)                       │
  │ Pass 4b: goliath→player contact drain ── DELETED (ATK-05)                │
  │        ▼                                                                 │
  │ Apply: playerDamage → resist('contact') → death/spill/respawn (reused)   │
  └──────────────────────────────────────────────────────────────────────────┘
        │ subscription (unit_attack rows)        │ onInsert (attack_strike)
        ▼                                        ▼
  ┌─────────────────────────┐   ┌───────────────────────────────────────────┐
  │ CLIENT telegraph system │   │ CLIENT strike juice (once per event)      │
  │ rows where state=WINDUP │   │ impact flash + dust burst + small camera  │
  │ outline + fill disc:    │   │ shake + WebAudio thump                    │
  │ (now−startedAt)/        │   └───────────────────────────────────────────┘
  │ (strikeAt−startedAt)    │   ┌───────────────────────────────────────────┐
  └─────────────────────────┘   │ CLIENT goliath animateAttack hook         │
  ┌─────────────────────────┐   │ WINDUP: crouch · STRIKE: leap arc to      │
  │ CLIENT self-hit react   │   │ landing · RECOVERY: slam pose ease-out    │
  │ my player row: stunned  │   └───────────────────────────────────────────┘
  │ → reconcile local pos to│
  │ server row + freeze     │
  │ input until stun ends   │
  └─────────────────────────┘
```

### Recommended Project Structure
```
spacetimedb/src/
├── attacks.ts          # ATTACKS registry + UNIT_ATTACKS + selectAttack() (zero-import pure)
├── unitAttackFsm.ts    # pure FSM step/transition math (zero-import pure)
├── attackHitbox.ts     # resolveCircleHit() (+ cone/lane sigs) (zero-import pure)
├── unitAttacks.ts      # runUnitAttacks() glue: reads/writes ctx.db, calls pure helpers
└── index.ts            # + unit_attack/attack_strike table defs, + player.stunnedUntilMicros,
                        #   + one runUnitAttacks() call, − pass 4b drain block

src/game/
├── systems/createTelegraphSystem.ts   # telegraph meshes from unit_attack rows
├── systems/createGoliathRenderer.ts   # + animateAttack in createGoliathAnimation
├── systems/createEntityRenderer.ts    # EntityAnimation gains optional animateAttack; update() consults attack views
├── audio/createAudioSystem.ts         # (if SFX in scope) WebAudio one-shot
└── createGame.ts                      # syncUnitAttacks(), handleAttackStrike(), stun reconcile, camera shake
```

### Pattern 1: Lazy row-optional FSM state (FSM-06)
**What:** Iterate the UNIT table (goliaths); for each, find-or-insert its `unit_attack` row via the `by_unit` btree index. Never iterate `unit_attack` as the driver — on a migrated DB it starts empty.
**When to use:** Every tick, inside `runUnitAttacks`.
**Example:**
```typescript
// Source: existing multi-column index idiom (characterActivation, index.ts:467-479) + CLAUDE.md SDK ref
const unitAttack = table(
  {
    name: 'unit_attack',
    public: true,
    indexes: [{ accessor: 'by_unit', algorithm: 'btree', columns: ['unitKind', 'unitId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    unitKind: t.u32(),              // 0 = goliath (1 = enemy, 2 = hero later — zero schema change)
    unitId: t.u64(),                // goliathId
    state: t.u32(),                 // 0 idle / 1 windup / 2 strike / 3 recovery (consts)
    attackId: t.string(),           // 'leapSlam'
    startedAtMicros: t.u64(),       // windup entry (client fill timing base)
    strikeAtMicros: t.u64(),        // startedAt + windupTicks*tick (client countdown end)
    recoveryEndsAtMicros: t.u64(),
    cooldownUntilMicros: t.u64(),   // per-unit skill cooldown (D4-07)
    landingX: t.f32(),              // LOCKED at cast (ATK-01)
    landingZ: t.f32(),
    radius: t.f32(),                // denormalized per-size (client renders row-only)
    castX: t.f32(),                 // root point during windup (D4-12)
    castZ: t.f32(),
    strikeResolved: t.bool(),       // grace bookkeeping (see §Dodge Grace)
    poise: t.u32(),                 // established here; reset on windup entry; accrual Phase 7
  }
);

// in runUnitAttacks:
const existing = [...ctx.db.unitAttack.by_unit.filter([UNIT_KIND_GOLIATH, goliathRow.goliathId])][0];
const row = existing ?? ctx.db.unitAttack.insert({ id: 0n, unitKind: UNIT_KIND_GOLIATH,
  unitId: goliathRow.goliathId, state: ATTACK_IDLE, attackId: '', startedAtMicros: 0n, /* … zeros */ });
```
Note: this is a NEW table — no `.default()` needed on its columns (defaults are only required when
adding columns to an EXISTING populated table). The new `player.stunnedUntilMicros` column DOES
need `.default(0n)` (appended last, per the migrate-gotchas discipline).

**Dead-row hygiene:** a goliath that dies/retires leaves its `unit_attack` row behind. Cheap sweep:
when iterating, delete rows whose unit is gone, or reset to idle on `!alive`. Rows are tiny; either
works — but a windup row for a dead goliath must NOT keep its telegraph alive client-side (client
should also gate telegraph on the goliath row's `alive`).

### Pattern 2: FSM tick step — deadline comparisons, never equality (FSM-05)
**What:** All transitions are `now >= deadline` on the once-sampled `now`. A coalesced/late tick that jumped past `strikeAtMicros` still resolves the strike on the first tick that observes it (resolved, never dropped). Windups authored as tick multiples: `windupTicks: 8` → `strikeAt = startedAt + 8n * tick`.
**Example (pure helper, zero-import):**
```typescript
// unitAttackFsm.ts — every input a plain argument; caller injects the tick clock
export interface AttackTimingSpec { windupTicks: number; recoveryTicks: number; cooldownMicros: bigint; }
export function strikeDeadline(startedAtMicros: bigint, windupTicks: number, tickMicros: bigint): bigint {
  return startedAtMicros + BigInt(windupTicks) * tickMicros;
}
// state-step returns what the reducer should do; test with a now that jumped 2+ intervals
export function windupDue(nowMicros: bigint, strikeAtMicros: bigint): boolean {
  return nowMicros >= strikeAtMicros; // late tick still fires — never dropped
}
```
**Required test (from Notes):** `windupDue(startedAt + 10n*tick, strikeAt)` (a "jumped two
intervals" now) → true, and the strike resolves exactly once (`strikeResolved` flips).

### Pattern 3: Two-tick dodge grace with zero storage (D4-02 — recommended discretion pick)
**What:** D4-02 wants "left within the final grace tick counts as OUT". The module CANNOT keep
prev-tick positions in memory (CLAUDE.md: all state from tables), and a snapshot table costs
per-player writes every tick forever. Equivalent semantics with zero storage: resolve victims as
*inside the circle at the strike tick AND still inside one grace tick later*. The strike tick
inserts `attack_strike` (VFX fires on time) and records candidacy is unnecessary — simply resolve
damage on the tick AFTER the strike deadline (`strikeAt + graceTicks*tick`), requiring
`inside(strikeTick) AND inside(graceTick)`… which collapses to needing one remembered sample.
The cheapest deterministic form that needs NO history at all:

- **Tick T (now ≥ strikeAt, !strikeResolved):** teleport goliath to landing, emit `attack_strike`,
  compute `insideAtStrike` per player and store nothing — instead DEFER damage: set
  `state=STRIKE`, `strikeResolved=false`.
- **Tick T+1 (grace):** damage = players inside the circle NOW who were also inside at T. "Was
  inside at T" without history: because positions only move ≤ moveSpeed×0.15s ≈ 1.1u/tick, an
  exact-AND needs T's sample. Two clean options:
  a) **Store the strike-tick verdict on the row** as a compact victims field — rejected: STDB
     columns don't hold identity arrays cleanly.
  b) **Shrink-test at T+1 only:** hit = inside(radius) at T+1, i.e. resolve ONCE at
     `strikeAt + 1 tick` vs live positions. A player who left within the final ~150ms reads
     outside → OUT (grace achieved); a player who stays reads inside → hit. A player who *enters*
     during the grace tick is a rare self-inflicted edge (walked into a just-landed slam) — hit is
     acceptable and telegraph-honest (D4-03: the circle never lies).
**Recommendation:** option (b) — single resolution at `strikeAt + GRACE_TICKS(1) * tick` vs live
positions. It is literally "the strike lands, and anyone still standing in the circle 150ms later
takes it": defender-biased, deterministic, zero storage, resolves ONCE (FSM-02 satisfied — one
resolution at the strike frame's grace deadline). VFX/animation still fire at `strikeAt` (tick T)
via `attack_strike`; the damage apply rides the T+1 tick's `playerDamage` map. If the planner
prefers visual-and-damage same-tick, option (a′) exists — resolve at T against live positions with
no grace — but that re-introduces the "I dodged that!" RTT unfairness D4-02 exists to kill.
**Validate on maincloud RTT** (SC5) either way — the grace constant lives in `ATTACKS` as
`graceTicks: 1` so playtest tuning is data-only.

### Pattern 4: Root-during-windup / leap-at-strike via position-map override (D4-12)
**What:** `runUnitAttacks` runs AFTER pass 1 built `goliathPosition`. For a unit in WINDUP it
overwrites its map entry back to `(castX, castZ)` (rooted crouch); at the strike tick it writes
`(landingX, landingZ)` (the leap). The existing goliath apply-pass (index.ts:3296–3336) persists
the map — no new write path. Heading during windup should face the landing so the crouch reads
aimed (write into `goliathHeading` map).
**Watch:** client mesh lerp — `SNAP_DISTANCE = 8` / `LERP_RATE = 10` in createEntityRenderer.ts:
a leap ≤ 8u lerps (~0.1s time constant — reads as a fast lunge); > 8u snaps. Cap leapSlam's
engage band so `distance(cast→landing) ≤ ~8u`, or let `animateAttack` own the arc explicitly
(recommended — see Pattern 6).

### Pattern 5: Server-authoritative knockback/stun against client-authoritative movement (HIT-01)
**What:** `updatePosition` (index.ts:1066) lets the client set its own position (clamped to
12u/step at 10Hz sync — POSITION_SYNC_INTERVAL_SECONDS = 0.1). A server-written knockback would be
overwritten within ~100ms. The fix has three coordinated parts:
1. **Server, strike resolution:** displace victim row position by `knockback` units along
   `(victimPos − landingCenter)` normalized (`clampToWorld`, do NOT require walkable — D4-11
   edge-deaths are a feature), and set `stunnedUntilMicros = now + stunTicks*tick`
   (new `.default(0n)` column appended to `player`).
2. **Server, `updatePosition`:** early-return while `now < stunnedUntilMicros` — the server owns
   the player's position during the stun; a modified client can't wiggle out.
3. **Client, self-row reconcile:** the local player already subscribes to its own `player` row.
   When `stunnedUntilMicros > nowEstimate`, lerp local `playerPosition` to the server row's
   position (createGame.ts owns `playerPosition`) and suppress `inputSystem` movement (input freeze
   0.3s). When the stun expires the local position ≈ server position, so the next `updatePosition`
   continues seamlessly. Zero-length knockbacks (stun-only attacks, D4-10 futures) work unchanged.
**Direction edge case:** victim standing exactly on the landing center → zero-length vector; fall
back to the goliath's heading or a fixed axis (pure-helper branch, test it).
**Y handling:** leave `positionY` untouched; the client's ground physics + `VOID_KILL_DEPTH`
(−15) + `sendFallToDeath` already handle knocked-off-bridge deaths (createGame.ts:663–666).

### Pattern 6: `animateAttack` hook on `EntityAnimation` (ANIM-03)
**What:** `EntityAnimation` today has only `animateMovement`/`animateDeath`
(createEntityRenderer.ts:11–16). Add an OPTIONAL method so the enemy renderer (no attacks yet)
compiles unchanged:
```typescript
export interface AttackAnimationView {
  attackId: string;
  phase: 'windup' | 'strike' | 'recovery';
  phaseProgress: number;              // 0..1 within the phase, client-derived from row micros
  castX: number; castZ: number;
  landingX: number; landingZ: number;
}
export interface EntityAnimation {
  animateMovement(elapsedSeconds: number, isMoving: boolean): void;
  animateDeath(progress: number): void;
  animateAttack?(view: AttackAnimationView): void;   // NEW, optional
}
```
Renderer plumbing: `createEntityRenderer.update()` needs the attack view per unit. Cheapest:
give the renderer a `setAttackViews(map: Map<string, AttackAnimationView>)` (keyed by unitId
string) that `createGame.syncUnitAttacks(rows)` refreshes; `update()` calls
`animation.animateAttack?.(view)` after `animateMovement` when a view exists (and skips
`lookAt`-toward-target during windup so the crouch faces the landing). Goliath implementation
(createGoliathRenderer.ts `createGoliathAnimation`): windup = body Y compress
(`model.body.scale.y`/position toward ground, progress-eased); strike = parabolic Y arc
(`sin(progress*π) * leapHeight`) while X/Z ride the existing lerp toward the server's landing
position; recovery = ease back to neutral. Heroes reuse later by implementing the same optional
method — zero schema change.

### Pattern 7: Telegraph system (ANIM-01/02, D4-14)
**What:** A dedicated `createTelegraphSystem(scene)` keyed by `unit_attack` rows in WINDUP:
- **Outline:** `THREE.RingGeometry(radius − rim, radius, 48)` MeshBasicMaterial `#86e2ff`,
  transparent, `depthWrite:false`, rotated flat (`rotation.x = −π/2`), at
  `world.getGroundHeight(landingX, landingZ) + 0.06` (spawnNova ground-ring idiom,
  createEffectSystem.ts:205–217).
- **Fill disc:** `THREE.CircleGeometry(radius, 48)` at lower opacity, `scale.setScalar(fillFraction)`
  each frame — fill % IS the countdown: `fill = clamp((nowMicros − startedAt)/(strikeAt − startedAt))`.
- **Rim flash at strike:** brief opacity/scale pop when `state` transitions to strike or on the
  `attack_strike` event.
- **Client clock:** derive `nowMicros` from an offset (serverRowMicros vs `performance.now()`)
  captured on row insert/update — NEVER a free-running client timer (ANIM-01). Simplest robust
  form: on each row update, `fillAtUpdate = (rowUpdateArrival)`; interpolate forward with
  render-frame delta; clamp to 1.
- **Pixel-filter legibility (ANIM-02):** the world buffer is only ~440px wide
  (PIXEL_TARGET_INTERNAL_WIDTH, MAX_PIXELATION_FACTOR 4) — hairline rings alias away. Rim width
  ≥ ~0.2 world-units, additive blending, and verify through the ACTUAL filter (human-verify
  checkpoint, not raw Three.js). Icy-cyan `#86e2ff` on Mondstadt-green terrain is high-contrast.
  If a `polygonOffset` z-fight appears on sloped ground, raise the y-epsilon before reaching for
  shaders — keep it geometry-simple (discretion allows either; geometry is cheaper).

### Pattern 8: `attack_strike` event + one-subscription rule (ANIM-04)
```typescript
// analog: enemy_hit (index.ts:573-582)
const attackStrike = table(
  { name: 'attack_strike', public: true, event: true },
  {
    unitKind: t.u32(),
    unitId: t.u64(),
    attackId: t.string(),
    landingX: t.f32(),
    landingZ: t.f32(),
    radius: t.f32(),
  }
);
```
ONE insert per strike (not per victim — victims learn via their own player row: HP drop +
stunnedUntilMicros + displaced position). Client: `useTable(tables.attackStrike, { onInsert })`
is the ONLY subscription — do NOT add it to the manual `.subscribe([...])` list (Phase-2
double-fire lesson, App.tsx:118–121). `unit_attack` (a normal cached table) DOES go in the
`.subscribe([...])` list + a `useTable` for rows.

### Anti-Patterns to Avoid
- **Iterating `unit_attack` as the FSM driver** — empty on a migrated DB; drive from the unit table (FSM-06, STATE blocker #1).
- **Client-local telegraph timers** — a timer started on row arrival drifts vs server; always re-derive from row micros (ANIM-01).
- **Keeping the drain "just during transition"** — drain + strikes double-dip is an explicit anti-feature (REQUIREMENTS Out of Scope); delete pass 4b in the same commit that lands the selection fn.
- **Re-aiming the landing after cast** — perfect-homing windups are banned (Out of Scope); landing is immutable once written.
- **In-memory cross-tick state** (module-scope Maps for prev positions/pending strikes) — violates determinism; all FSM state on the row.
- **Emitting `attack_strike` inside the survivor/victim branch** — emit unconditionally at the strike transition, THEN branch bookkeeping (Phase-2 "guarded event emission" lesson).
- **New client-callable reducers for the FSM** — everything runs in `worldTick`; adding client entry points would open spoof surface for zero benefit.
- **Growing index.ts beyond table defs + one call** — logic in siblings (CLAUDE.md monolith rule; index.ts is already 3418 LOC).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| FSM library / statechart | xstate or any FSM lib | u32 state consts + pure step fns | Zero-deps locked; 4 states don't need a library |
| Tweening the leap/fill | tween.js / gsap | `THREE.MathUtils.lerp/clamp` + progress math | STATE lock: MathUtils is the only interpolation helper |
| Physics for knockback | rigid-body/CCD engine | discrete displacement at strike instant | Out-of-scope anti-feature; determinism on 150ms tick |
| Skeletal animation | THREE.AnimationMixer + clips | procedural rig transforms in `animateAttack` | Locked (STATE zero-new-deps note); rig already procedural |
| Damage application plumbing | new player-damage path for strikes | write into the existing `playerDamage` map | Reuses resistance/death/shard-spill/respawn verbatim (roadmap pass-ordering lock) |
| Circle hit test | new geometry code | `distanceBetween(px, pz, landingX, landingZ) <= radius` | combatMath.ts already tick-proven |
| Audio asset pipeline | sample files + loader | single WebAudio oscillator/noise one-shot (~40 LOC) | No audio system exists; zero assets keeps the bundle clean (see Open Q2) |

**Key insight:** every hard sub-problem here (deterministic tick, damage apply, event broadcast,
mesh reconcile, parity testing, additive migration) was already solved in Phases 1–3 or the
goliath milestone — the risk is INTEGRATION ordering, not novel machinery. That is exactly why
this phase proves the spine on one attack.

## Common Pitfalls

### Pitfall 1: Knockback that rubber-bands (client-authoritative movement)
**What goes wrong:** Server displaces the player row; 100ms later the client's `updatePosition` writes its local (un-knocked) position back — knockback visible only to spectators, victim never moves.
**Why it happens:** `updatePosition` trusts client positions (anti-teleport clamp only, index.ts:1072–1076); `syncPositionToServer` fires every 0.1s (createGame.ts:682–695).
**How to avoid:** the three-part Pattern 5 (stun column + reject-while-stunned + client self-row reconcile). All three land in the same plan slice or HIT-01 silently fails.
**Warning signs:** two-client playtest — victim's screen shows no displacement, or victim teleports back after ~0.1s.

### Pitfall 2: Grace model that needs cross-tick memory
**What goes wrong:** FSM keeps `prevPositions` in a module-scope Map; works in one process, breaks determinism/time-travel and dies on module hot-swap (republish wipes it mid-windup).
**Why it happens:** "1-deep history" sounds like a variable; reducers look like a long-lived program but aren't guaranteed to be.
**How to avoid:** two-tick/deferred resolution reading only live tables (Pattern 3), or a real table if history is truly needed. `strikeResolved` bool on the row is the only bookkeeping bit required.
**Warning signs:** any `let`/`const` Map at module scope in spacetimedb/src touched by worldTick; grep for it in review.

### Pitfall 3: The insert-type tax on new columns (Phase-2 lesson, verbatim trap)
**What goes wrong:** `player.stunnedUntilMicros` with `.default(0n)` still MUST be supplied at every `ctx.db.player.insert(...)` call site — the TS insert type requires it; the miss surfaces only at module compile.
**How to avoid:** grep ALL `player.insert` sites including `restorePlayers`, seed/debug/bot paths before calling the slice done (Phase-2 surprise: the restore path was the one missed).
**Warning signs:** `spacetime build`/`spacetime:generate` type errors listing the new field.

### Pitfall 4: Event table double-fire (Phase-2 lesson)
**What goes wrong:** `attack_strike` listed in BOTH the manual subscription and `useTable` → onInsert fires twice → double camera shake, double SFX, double VFX per strike.
**How to avoid:** `useTable` only. Copy the App.tsx:118–121 comment convention onto the new hook.
**Warning signs:** two overlapping shakes/bursts per slam in playtest.

### Pitfall 5: Facetank dead zone after drain deletion (ATK-05)
**What goes wrong:** drain deleted, but the selection fn has a minimum band (e.g., leapSlam only ≥ 3u) — a player hugging the goliath takes ZERO damage forever.
**Why it happens:** band design borrowed from games where a basic melee fills the gap — Phase 4 has ONE attack.
**How to avoid:** leapSlam's Phase-4 band = `0..maxEngage` (it covers ALL bands; landing lock on a point-blank target is fine — the circle centers on them). Structure `UNIT_ATTACKS` band fields so Phase 5/6 SPLIT the band rather than re-shape the schema. Assert "an attack is returned for every distance in 0..maxEngage" as a unit test sweep.
**Warning signs:** playtest — standing inside the goliath's collision radius is safe.

### Pitfall 6: Windup telegraph outliving a dead goliath / retired window
**What goes wrong:** goliath dies mid-windup (or its 5-min window retires it) but the `unit_attack` row still says WINDUP → telegraph circle hangs forever client-side; or worse, the strike resolves posthumously next tick.
**How to avoid:** `runUnitAttacks` iterates only `alive` goliaths AND resets/deletes rows whose unit is dead/missing; client telegraph gates on the goliath row's `alive` too (belt-and-suspenders, both cheap).
**Warning signs:** frozen cyan circles after a goliath dies mid-cast.

### Pitfall 7: Publishing order on maincloud (SC5)
**What goes wrong:** new client build (calls/renders new tables) served before the module is published → "no such reducer"/missing-table subscription errors for remote testers; OR maincloud module updated while its DB still runs Phases-1–3 schema and the cumulative diff surprises.
**Why it happens:** maincloud was deliberately NOT updated during Phases 2–3 (deploy deferred to a user-facing point) — Phase 4's maincloud publish carries the crit-era schema/reducer changes too (`attackEnemies`/`attackRay` signature changes, `enemy_hit`, `pvp_hit` columns, skill cooldown columns).
**How to avoid:** `pnpm run backup -- --server maincloud --token <bearer>` FIRST; publish module (additive migrate, NO `--delete-data`); verify with `spacetime sql`/`logs`; then deploy the client `dist/`. The FSM needs no `seed_world`-style activation — rows lazily create on first engage (verify SC5's "rows exist after a real engage on a MIGRATED DB" via `spacetime sql <db> "SELECT * FROM unit_attack" --server maincloud`).
**Warning signs:** remote client console shows unknown-reducer or subscription errors.

### Pitfall 8: MAX_HIT_DAMAGE does NOT clamp slams — but don't add it
**What goes wrong (inverted):** a well-meaning reviewer routes slam damage through `resolvePlayerHit`/`MAX_HIT_DAMAGE(400)` — clamping 405/585/765 to 400 and silently deleting the per-size damage identity.
**How to avoid:** slam damage is CONTACT-channel world-tick damage (like the old drain): raw → `resistedDamage(…, 'contact')` → HP, via the existing apply loop (index.ts:3343–3347). `resolvePlayerHit` is for PLAYER-dealt hits only. Parity/unit tests pin 405/585/765 pre-resist.
**Warning signs:** big goliath slam floats 400.

### Pitfall 9: Telegraph illegible through the pixel filter (ANIM-02)
**What goes wrong:** a 2px-wide ring at 440px internal width shimmers/vanishes; clock-sweep-style thin geometry aliases (why D4-14 rejected it).
**How to avoid:** thick rim (≥0.2u), filled disc for the countdown (area, not line), verify through the real `createPixelRenderer` path at target resolution — an explicit human-verify item, not a unit test.
**Warning signs:** screenshot through the filter shows a broken/dotted circle.

## Code Examples

### ATTACKS registry shape (attacks.ts — zero-import pure)
```typescript
// Registry fields locked by D4-04..D4-10; layout is discretion. One entry = one attack (FSM-04).
export interface AttackSpec {
  shape: 'circle' | 'cone' | 'lane';      // circle ships now; cone/lane = Phases 5/6
  role: 'skill' | 'basic';                 // D4-08 rhythm: skill preferred when off cooldown
  windupTicks: number;                     // EXACT tick multiples (FSM-05); 8 = 1.2s
  activeTicks: number;                     // strike window; 1 for leapSlam
  graceTicks: number;                      // D4-02 dodge grace; 1 = ~150ms
  recoveryTicks: number;                   // 8 = 1.2s (D4-06)
  cooldownMicros: bigint;                  // 3_500_000n µs… (D4-07; Phase-5 retune noted)
  radiusBySize: readonly number[];         // [4.0, 4.75, 5.5] (D4-05)
  damageMultiplier: number;                // 4.5 × unit contactDamage → 405/585/765 (D4-04)
  minBand: number;                         // 0 this phase (Pitfall 5)
  maxBand: number;                         // ≤ ~8u so the leap stays under client SNAP_DISTANCE
  knockback: number;                       // 3 (D4-10)
  stunTicks: number;                       // 2 = 0.3s (D4-10)
  move: 'none' | 'leap' | 'charge';        // 'leap' teleports to landing at strike
  poiseThreshold: number;                  // consumed Phase 7; field exists now (FSM-04)
}
export const ATTACKS: Record<string, AttackSpec> = {
  leapSlam: { shape: 'circle', role: 'skill', windupTicks: 8, activeTicks: 1, graceTicks: 1,
    recoveryTicks: 8, cooldownMicros: 3_500_000n, radiusBySize: [4.0, 4.75, 5.5],
    damageMultiplier: 4.5, minBand: 0, maxBand: 8, knockback: 3, stunTicks: 2,
    move: 'leap', poiseThreshold: 600 },
};
export const UNIT_ATTACKS: Record<number, Record<string, readonly string[]>> = {
  0 /* goliath */: { default: ['leapSlam'] },   // per-archetype lists; new unit = one list
};
// FSM-03 signature (D4-08-compatible: skills first, basics fill, else chase)
export function selectAttack(
  distance: number,
  nowMicros: bigint,
  cooldownUntilMicros: bigint,
  available: readonly string[]
): string | null { /* skill in band + off cooldown → it; else basic in band; else null */ }
```

### runUnitAttacks call site (index.ts — the ONE line it gains)
```typescript
// after pass 2 (enemyPosition built), before pass 3/4 damage maps are consumed:
runUnitAttacks(ctx, now, tick, goliaths, goliathPosition, goliathHeading, playerByHex, playerDamage);
// pass 4b (index.ts:3182-3190) DELETED in the same slice (ATK-05)
```
Note the `playerDamage` map is declared in pass 4 (index.ts:3160) — declaring it before
`runUnitAttacks` (hoist next to the other maps) is part of the wiring. Strike damage written here
flows through the EXISTING resist('contact')/death/spill/respawn apply unchanged.

### serverSync.test.ts extension (INV-5 ATTACKS parity)
```typescript
// analog: existing cross-boundary import (serverSync.test.ts:22-28) — import-and-compare OUTPUTS
import { ATTACKS, UNIT_ATTACKS } from '../../../../spacetimedb/src/attacks';
import { GOLIATH_SIZE_STATS } from '../../../../spacetimedb/src/enemyStats';

describe('ATTACKS registry invariants (INV-5)', () => {
  it.each(Object.entries(ATTACKS))('%s durations are exact tick multiples ≥ 2 ticks', (_, spec) => {
    expect(Number.isInteger(spec.windupTicks)).toBe(true);
    expect(spec.windupTicks).toBeGreaterThanOrEqual(2);      // ≥0.35s lock
    expect(Number.isInteger(spec.recoveryTicks)).toBe(true);
  });
  it('leapSlam damage = 4.5× per-size contactDamage → 405/585/765', () => {
    expect(GOLIATH_SIZE_STATS.map(s => Math.round(s.contactDamage * ATTACKS.leapSlam.damageMultiplier)))
      .toEqual([405, 585, 765]);
  });
  it('radius array covers every goliath size', () =>
    expect(ATTACKS.leapSlam.radiusBySize).toHaveLength(GOLIATH_SIZE_STATS.length));
  it('selection returns an attack for every distance band 0..maxEngage', () => {
    for (let d = 0; d <= 8; d += 0.25)
      expect(selectAttack(d, 0n, 0n, UNIT_ATTACKS[0].default)).not.toBeNull(); // ATK-05 dead-zone sweep
  });
});
```
Client render needs NO ATTACKS mirror (row is denormalized), so parity here asserts the registry's
internal invariants + the shared size arithmetic — duration/shape parity in the INV-5 sense is
"client-rendered timing/shape comes from the same numbers", guaranteed by construction + these
assertions. Keep the whole existing suite green.

### Client stun reconcile (createGame.ts sketch)
```typescript
// in the per-frame loop, before updateLocalPlayer():
const myRow = latestSelfRow();                        // already-synced player row
const stunned = myRow && myRowStunnedUntilMicros > estimatedServerNowMicros();
if (stunned) {
  inputSuppressed = true;                             // freeze move input (render-only feedback)
  playerPosition.lerp(new THREE.Vector3(myRow.positionX, playerPosition.y, myRow.positionZ),
    Math.min(1, deltaSeconds * 12));                  // adopt server knockback
} // syncPositionToServer keeps running; server rejects writes while stunned anyway
```

## State of the Art

| Old Approach (current code) | Current Approach (this phase) | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Goliath→player per-tick contact drain (index.ts:3182–3190) | One telegraphed, dodgeable leapSlam via unit_attack FSM | This slice (ATK-05) | Damage becomes counterplayable; drain block deleted, camp + goliath→enemy drains untouched |
| Enemy damage = undodgeable attrition | windup→strike→recovery with defender-biased grace | This slice | The milestone's core value ("dodgeable attacks") |
| `EntityAnimation` = movement + death only | + optional `animateAttack` hook | This slice (ANIM-03) | Heroes/camp enemies reuse with zero schema change (XCMB-01/04 ready) |
| No hit reaction on players | knockback + stun columns, server-owned during stun | This slice (HIT-01) | First time the server ever overrides client movement |
| No ground telegraphs | fill-disc telegraph system from server rows | This slice (ANIM-01/02) | New render subsystem, FFXIV/WoW-standard readability |

**Deprecated/outdated (delete in this slice):**
- Pass 4b drain block (index.ts:3182–3190) — replaced by strike damage; `GOLIATH_PLAYER_CONTACT_RANGE` const dies with it if unreferenced elsewhere (grep before deleting; body-collision shove is client-side and stays, D4-13).
- `goliath.contactDamage` column STAYS (it's the 4.5× base and feeds goliath→enemy drain) — only the player-directed use is removed.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Slam damage uses the 'contact' resistance channel (CONTEXT default YES; keeps glacia/nereida tank identity) | Standard Stack / Pitfall 8 | Tank characters lose identity vs slams; one-line change (`resistedDamage` channel) — confirm at plan checkpoint |
| A2 | 1 grace tick (~150ms) is enough for maincloud RTT fairness (D4-02 says "~150ms / 1 tick") | Pattern 3 | If maincloud playtest still feels unfair, bump `graceTicks` to 2 — data-only retune, SC5 validates |
| A3 | leapSlam maxBand ≈ 8u keeps the leap under the client SNAP_DISTANCE and gives the rooted goliath reach without a facetank hole | Pattern 4 / Pitfall 5 | Too short: goliath chases forever (chase AI covers it); too long: mesh snaps instead of arcs — tune in playtest |
| A4 | WebAudio one-shot SFX is in scope as the "slam SFX" (no audio system exists; zero-dep hand-roll is the only compliant option) | Open Q2 | If user prefers descoping audio, SC3's "SFX" clause needs an explicit user waiver |
| A5 | Client stun rendering via self-row reconcile (no new event payload for victims) is acceptable UX at 10Hz row sync | Pattern 5 | If knockback feels late on the victim's screen, add knockback fields to `attack_strike` for client-side prediction — additive, no schema risk |
| A6 | `strikeResolved`/deferred-resolution satisfies FSM-02's "resolves once at the strike frame" reading (one resolution, at the grace deadline) | Pattern 3 | If reviewers read FSM-02 literally (damage at strikeAt exactly), use resolve-at-T-no-grace… which contradicts D4-02; the CONTEXT decision (D4-02) outranks — flag in plan for verifier awareness |

## Open Questions

1. **Grace mechanics final form (planner must pick, discretion granted):** Pattern 3 recommends
   single resolution at `strikeAt + 1 grace tick` vs live positions (zero storage). The
   alternative (true two-sample AND) needs a private snapshot table. Recommendation: ship the
   zero-storage form; the SC5 maincloud playtest is the acceptance test either way.
2. **SFX scope:** No audio system exists anywhere in `src/` (grep-verified). Options: (a) ~50-LOC
   WebAudio procedural thump (`createAudioSystem.ts`, AudioContext resumed on first user gesture —
   the game already has click/touch input); (b) descope SFX from SC3 with user sign-off.
   Recommendation: (a) — small, zero-dep, and SC3 explicitly says "VFX/SFX".
3. **Camera shake taste (D4-15 "needs a taste pass"):** implement as a decaying offset added to
   `desiredPosition` before the camera lerp (createGame.ts:838) — magnitude ~0.15–0.25u,
   ~0.25s decay; human-verify checkpoint tunes it. Not blocking.
4. **`GOLIATH_PLAYER_CONTACT_RANGE` afterlife:** dies with pass 4b unless referenced elsewhere
   (grep at execution time). If the selection fn wants a point-blank band edge, define a NEW named
   const in attacks.ts rather than reusing the drain-era one.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build/tests | ✓ | v24.15.0 | — |
| pnpm | installs/scripts | ✓ | 11.9.0 | — |
| spacetime CLI | publish/generate/sql | ✓ | current channel (commit 052c83f) | — |
| Local SpacetimeDB server | dev loop | ✓ | responds 200 on 127.0.0.1:3000 | `spacetime start` |
| maincloud server config | SC5 remote verify | ✓ | configured (default) | — |
| vitest | Wave-0 tests | ✓ | via `pnpm test` | — |
| three (bundled) | telegraph/animation | ✓ | in package.json | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none. (SC5 additionally needs a second client/device over
non-LAN RTT — a human-coordination item, not a tool.)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (vitest.config.ts at repo root) |
| Config file | `vitest.config.ts` |
| Quick run command | `pnpm vitest run src/game/data/__tests__/<file>.test.ts` |
| Full suite command | `pnpm test` (= `vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FSM-01/04 | ATTACKS registry invariants + UNIT_ATTACKS layout | unit | `pnpm vitest run src/game/data/__tests__/attacks.test.ts` | ❌ Wave 0 |
| FSM-03 / ATK-05 | selection fn returns an attack for EVERY distance 0..maxBand (dead-zone sweep) | unit | same file | ❌ Wave 0 |
| FSM-05 | jumped-two-intervals now → strike resolved exactly once, never dropped | unit | `pnpm vitest run src/game/data/__tests__/unitAttackFsm.test.ts` | ❌ Wave 0 |
| FSM-02 / D4-02 | circle resolver: inside → hit, left-before-grace-deadline → OUT; zero-vector knockback fallback | unit | `pnpm vitest run src/game/data/__tests__/attackHitbox.test.ts` | ❌ Wave 0 |
| ATK-01 | landing locked at cast (windup-entry sample immutable through transitions) | unit | unitAttackFsm.test.ts | ❌ Wave 0 |
| HIT-01 | knockback displacement math (direction, clamp, edge cases) | unit | attackHitbox.test.ts | ❌ Wave 0 |
| INV-5 | ATTACKS duration/shape parity + 405/585/765 arithmetic; whole existing suite stays green | unit | `pnpm vitest run src/game/data/__tests__/serverSync.test.ts` | ✅ extend |
| FSM-06 | rows exist after a real engage on a MIGRATED DB | manual + SQL probe | `spacetime sql 2d-impact-game-fr9ti "SELECT * FROM unit_attack" --server local` after publish-without-wipe | manual-only (needs live DB; justification: subscription/migration behavior not unit-testable) |
| ANIM-01..04, D4-14..16 | telegraph fill/legibility, crouch/leap/slam, strike juice once | manual (human-verify) | two-client playtest through pixel filter | manual-only (visual/frame-level — Phase-2 lesson: playtest catches what green tests cannot) |
| SC5 | dodge fair over maincloud RTT, migrated DB | manual | remote two-client engage + `spacetime logs`/`sql` probes | manual-only |
| Determinism gate | no Math.random/Date.now in spacetimedb/src | lint-ish grep | `grep -rn "Math.random\|Date.now" spacetimedb/src` → empty | ✅ (established gate) |

### Sampling Rate
- **Per task commit:** targeted `pnpm vitest run <new test file>` (< 10s)
- **Per wave merge:** `pnpm test` (full suite, keeps 475+ green incl. serverSync)
- **Phase gate:** full suite green + `pnpm run build` (tsc) + module `spacetime build` before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/game/data/__tests__/attacks.test.ts` — FSM-03/04, ATK-05 sweep, INV-5 arithmetic
- [ ] `src/game/data/__tests__/unitAttackFsm.test.ts` — FSM-01/02/05, ATK-01, late-tick input
- [ ] `src/game/data/__tests__/attackHitbox.test.ts` — ATK-06 circle, HIT-01 displacement math
- [ ] serverSync.test.ts extension block (ATTACKS invariants) — file exists, block is new
- Framework install: none (vitest present)

## Security Domain

`security_enforcement` is on (ASVS L1). This phase's trust-boundary profile:

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (no new auth surface) | existing account bridge untouched |
| V3 Session Management | no | — |
| V4 Access Control | yes | FSM runs ONLY in the scheduled `worldTick` (module identity) — zero new client-callable reducers; `updatePosition` keeps `requirePlayer(ctx)`/`ctx.sender` |
| V5 Input Validation | yes | No new client inputs at all; the stun guard in `updatePosition` NARROWS what a client can do (rejects movement while stunned) |
| V6 Cryptography | no | — |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Modified client ignores stun and keeps moving | Tampering | Server rejects `updatePosition` while `now < stunnedUntilMicros` (Pattern 5.2) — stun is enforced, not advisory |
| Modified client "dodges" by teleporting out at the last frame | Tampering | Existing `MAX_STEP_DISTANCE = 12`/0.1s clamp bounds escape speed; grace resolution reads SERVER row positions only |
| Client spoofs strike damage | Tampering | Impossible by construction: strike damage originates in `worldTick` from `ATTACKS` data; no client value in the path |
| Telegraph suppression (client hides the circle to grief co-op) | Info disclosure (inverse) | `unit_attack` is public — all clients get the same rows; suppression only harms the modifier |
| Poise perma-stun spoof (Phase-7 concern seeded here) | Tampering/DoS | `poise` column server-written only; accrual will consume server-owned `isCrit` (CRIT-02) — no client input path exists |

## Sources

### Primary (HIGH confidence — read directly this session)
- `spacetimedb/src/index.ts` — worldTick passes (2938–3384), drain block (3182–3190), updatePosition (1066–1094), player/goliath/event tables, resolvePlayerHit (1870–1901), schema() (699)
- `spacetimedb/src/{combatMath,goliathAI,enemyStats,resistances}.ts` — pure helpers, GOLIATH_SIZE_STATS, contact channel
- `src/game/systems/{createEntityRenderer,createGoliathRenderer,createEffectSystem}.ts` — EntityAnimation shape, lerp/snap constants, VFX idioms
- `src/game/createGame.ts` — local movement (635–695), camera lerp (838), void death (663), game↔App handle idioms (1151–1210)
- `src/App.tsx` — subscription list + one-subscription-per-event-table convention (112–246)
- `src/game/data/__tests__/{serverSync,serverWorldSim}.test.ts` — cross-boundary import parity pattern
- `src/game/engine/createPixelRenderer.ts` + `constants.ts` — pixel pipeline (440px internal, ×4 max)
- `.planning/phases/02-*/02-{LEARNINGS,PATTERNS}.md` — event double-fire, insert-type tax, playtest discipline, additive-column pattern
- `.planning/STATE.md` + `04-CONTEXT.md` — locks, blockers, Phase-3 migrate answer (additive `.default()` accepted on populated DB)
- Toolchain probes: node v24.15.0, pnpm 11.9.0, spacetime CLI present, local server 200, maincloud configured

### Secondary (MEDIUM confidence)
- CLAUDE.md SpacetimeDB TS SDK reference (table options, multi-column indexes, event-table semantics, scheduled tables) — treated as project-authoritative docs [CITED: ./CLAUDE.md]

### Tertiary (LOW confidence)
- None used. No external web research was needed (zero-new-deps, all-internal seams); telegraph/grace design norms (FFXIV fill-telegraphs, defender-bias netcode) are cited from the user's own locked decisions (D4-02/D4-14), not re-researched.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every seam read directly; zero new deps
- Architecture: HIGH — pass ordering, table idioms, and client plumbing all have in-repo analogs; the two novel designs (stun-guard movement, zero-storage grace) are reasoned from verified code constraints and flagged (A5/A6) for planner/verifier attention
- Pitfalls: HIGH — five of nine are documented prior-phase lessons; the rest are read-from-code interactions (lerp/snap, MAX_STEP_DISTANCE, empty-table migration)

**Research date:** 2026-07-09
**Valid until:** 2026-08-09 (internal-codebase research; invalidated earlier only by refactors to worldTick/updatePosition/createEntityRenderer)
