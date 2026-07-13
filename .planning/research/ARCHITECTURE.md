# Architecture Research — unit-agnostic attack FSM integration

**Domain:** SpacetimeDB server-authoritative combat state machine + Three.js client telegraphs
**Researched:** 2026-07-08
**Confidence:** HIGH (every integration point below cites a line verified against the live code, not the spec)

> This is an INTEGRATION study for an EXISTING architecture (v0.2.0-alpha "Combat Depth").
> It answers: where the FSM advance lives inside `worldTick`, how the shared registries
> factor into NEW sibling modules, how the client subscribes + renders telegraphs, and the
> client/server number-mirror seam. It ends with a dependency-ordered build sequence and a
> NEW-vs-MODIFIED file ledger. All new logic lands in SIBLING modules; `index.ts` (a ~3280 LOC
> monolith) gets only table defs, one pass call, and additive reducer args — per the
> no-monolith / no-legacy code style.

---

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│  SERVER MODULE  (spacetimedb/src/ — TS → WASM)                             │
│                                                                            │
│  index.ts (monolith, edit minimally)                                       │
│   ├─ schema(): + unit_attack (public)  + attack_strike (event)             │
│   ├─ attackEnemies (1814) / attackRay (1899): + isCrit arg → applyPoiseHit │
│   └─ worldTick (2806, scheduled ~150ms):                                   │
│        Pass1 goliath move → goliathPosition map                            │
│        Pass2 enemy move                                                    │
│        Pass3 goliath→enemy strike                                          │
│        Pass4/4b enemy/goliath→player  ──┐  (writes playerDamage map)       │
│      ► NEW Pass4c runUnitAttacks(...) ──┘  (writes SAME playerDamage map)  │
│        apply enemy/goliath/player damage (3164 / 3207)                     │
│                                                                            │
│  NEW sibling modules (pure, vitest-able, dependency-free):                 │
│   ├─ attacks.ts          ATTACKS[] + UNIT_ATTACKS[][] registry + selectAttack│
│   ├─ unitAttackFsm.ts    advanceAttack() · selectAttack() · applyPoiseHit()│
│   └─ attackHitbox.ts     resolveCircle/Cone/Lane vs live player positions  │
│  Reuses: combatMath (distanceBetween) · goliathAI (isWithinForwardArc)     │
│          · hitscan (pickRayHit projection) · resistances (resistedDamage)  │
└───────────────────────────────┬────────────────────────────────────────────┘
                        subscribe │ unit_attack rows + attack_strike events
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  CLIENT  (src/ — TS + Vite + Three.js, RENDER ONLY)                        │
│                                                                            │
│  App.tsx  subscribe([… tables.unitAttack, tables.attackStrike])           │
│   ├─ useTable(unitAttack) → game.syncUnitAttacks(rows)                     │
│   └─ useTable(attackStrike,{onInsert}) → game.handleAttackStrike(ev)       │
│                                                                            │
│  createGame.ts  game loop                                                  │
│   ├─ attackStateById: Map<unitId, {attackId,phase,progress}>              │
│   ├─ createAttackTelegraphs (NEW system) reads ATTACKS durations          │
│   └─ passes getAttackState into renderer.update(...)                       │
│                                                                            │
│  createEntityRenderer.ts (generic spine — extend, don't fork)             │
│   └─ EntityAnimation: + animateAttack(attackId, phase, progress)          │
│        driven per-entity from the injected getAttackState(id)              │
│  createGoliathRenderer / createEnemyRenderer implement animateAttack       │
│                                                                            │
│  data/attacks.ts  CLIENT MIRROR of durations/damage  ◄─ serverSync.test.ts │
└──────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Where it lives |
|-----------|----------------|----------------|
| `unit_attack` table | Per-unit FSM state: `phase/startedAt/cooldownUntil/poise/targetX-Z`, keyed `(unitKind,unitId)` unique | `index.ts` schema (new, public, additive) |
| `attack_strike` event | One-shot broadcast at the strike frame for VFX/audio; never cached | `index.ts` schema (new, `event:true`) |
| `attacks.ts` | Data registry `ATTACKS[attackId]` + `UNIT_ATTACKS[kind][archetype]` + `selectAttack()` | NEW server sibling |
| `unitAttackFsm.ts` | Pure phase advance, target locking, poise accrual/cancel | NEW server sibling |
| `attackHitbox.ts` | Pure geometry: which players are inside a circle/cone/lane at strike | NEW server sibling |
| `runUnitAttacks` pass | The only new code IN `worldTick`: reads/writes `unit_attack`, resolves strikes into the existing `playerDamage` map, roots/commits the body | small block added to `index.ts` worldTick, delegating to the siblings |
| `createAttackTelegraphs.ts` | Ground telegraph meshes (ring/arc/lane), grown by mirroring `ATTACKS` durations | NEW client system |
| `EntityAnimation.animateAttack` | Per-mesh windup/strike/recovery limb clips | added method on existing interface |
| `data/attacks.ts` | Client mirror of durations/damage for telegraph timing + display | NEW client data, guarded by `serverSync.test.ts` |

---

## Recommended Project Structure

```
spacetimedb/src/
├── index.ts                 # MODIFIED: +2 tables in schema(), +isCrit arg on 2 reducers,
│                            #   +runUnitAttacks pass call in worldTick, DELETE contact drain
├── attacks.ts               # NEW: ATTACKS + UNIT_ATTACKS + selectAttack (data + pure select)
├── unitAttackFsm.ts         # NEW: advanceAttack / applyPoiseHit (pure, no ctx)
├── attackHitbox.ts          # NEW: resolveCircle/Cone/Lane → hit unit indices (pure)
├── combatMath.ts            # REUSE: distanceBetween, stepToward
├── goliathAI.ts             # REUSE: isWithinForwardArc (already unit-agnostic)
├── hitscan.ts               # REUSE: pickRayHit projection math for the lane capsule
└── resistances.ts           # REUSE: resistedDamage (crit already multiplies at damage site)

src/game/
├── data/
│   ├── attacks.ts           # NEW: client MIRROR of ATTACKS (durations/shape/damage)
│   ├── characters.ts        # MODIFIED: +critRate / +critDmg on CharacterDefinition
│   └── __tests__/serverSync.test.ts  # MODIFIED: assert client attacks == server attacks
├── systems/
│   ├── createEntityRenderer.ts   # MODIFIED: +animateAttack on EntityAnimation, drive it in update()
│   ├── createGoliathRenderer.ts  # MODIFIED: implement animateAttack (sword/shield clips)
│   ├── createEnemyRenderer.ts    # MODIFIED: implement animateAttack (later reuse)
│   └── createAttackTelegraphs.ts # NEW: ring/arc/lane ground telegraphs
└── createGame.ts            # MODIFIED: rollDamage per-character, network isCrit args,
                             #   syncUnitAttacks + handleAttackStrike, feed getAttackState
src/App.tsx                  # MODIFIED: subscribe unit_attack + attack_strike, useTable wiring
```

### Structure Rationale

- **Three new server siblings, zero growth of `index.ts`.** `index.ts` already imports every
  combat helper from siblings (`combatMath`, `goliathAI`, `hitscan`, `resistances`, l.16–24).
  The FSM follows that exact pattern: `index.ts` gains ~2 table blocks, one `runUnitAttacks(ctx, …)`
  call inside `worldTick`, and `isCrit` on two reducers. All branching logic is pure and lives in
  the siblings — directly vitest-testable under the client runner, matching the "extract pure
  helpers from reducer logic" discipline.
- **`attacks.ts` split from `unitAttackFsm.ts`.** Data (the roster) changes on every tuning pass;
  the state-machine math is stable. Keeping them apart keeps each under ~150 LOC and makes the
  serverSync mirror target a single data file.
- **Client `data/attacks.ts` is a deliberate duplicate, not a shared import.** The server module
  compiles to WASM from `spacetimedb/src/`; the client builds from `src/`. There is no shared
  import boundary (same reason `resistances.ts` server duplicates the `resistances` field on
  client `characters.ts`). The duplication is safe *because* `serverSync.test.ts` fails the build
  on drift — INV-5.

---

## Architectural Patterns

### Pattern 1: Strike damage feeds the EXISTING `playerDamage` map (do not open a new damage path)

**What:** `worldTick` accumulates all per-player damage into one `playerDamage: Map<hex, number>`
(l.3028), then applies it ONCE at l.3207 through `resistedDamage(... 'contact')` + the death /
shard-spill / respawn path. The new strike resolves its hitbox against **current** player positions
and adds into that same map — reusing resistance, death, shard-erosion, and respawn logic for free.

**When to use:** every strike that damages a player.
**Trade-offs:** strikes share the `'contact'` resistance channel with the (now-deleted) drain; if a
strike ever needs its own channel, add a `DamageType` string in `resistances.ts` (already designed
for this). Net: one apply loop, one death path, no divergence.

```typescript
// inside runUnitAttacks, at the strike frame:
const hitHexes = resolveCircle(players, targetX, targetZ, atk.radius); // attackHitbox.ts, live pos
for (const hex of hitHexes) playerDamage.set(hex, (playerDamage.get(hex) ?? 0) + atk.damage);
ctx.db.attackStrike.insert({ unitKind, unitId, attackId, x: targetX, z: targetZ, dirX, dirZ });
```

### Pattern 2: FSM advance is a pure transition function; `worldTick` only does I/O

**What:** `advanceAttack(row, now, atk)` takes a `unit_attack` row + the clock + the ATTACKS entry
and returns `{ phase, startedAt, cooldownUntil, fireStrike, commitMove }` with no `ctx`. `worldTick`
reads the row via the `by_unit` index, calls the pure fn, resolves the hitbox if `fireStrike`, and
writes the row back. This mirrors how `goliathAI.chooseGoliathTargetCamp` / `headingFromStep` are
pure and `worldTick` (l.2870–2941) just maps their results.

**When to use:** all phase transitions and attack selection.
**Trade-offs:** none material; it is the established seam and keeps determinism obvious (no wall
clock, no RNG except `ctx.random` passed in if selection ever needs it).

### Pattern 3: Body commitment layered as an OVERRIDE on `goliathPosition`

**What:** Pass 1 (l.2870) already computes `goliathPosition: Map<id,{x,z}>` before anything is
written (goliaths are written at l.3164). `runUnitAttacks` runs AFTER Pass 1 and BEFORE that write,
so it can override a windup unit's position: `move:'root'` → snap back to current pos; `move:'leap'
/'charge'` → on the strike frame set position to `targetX/Z`. No new movement system, just a map
overwrite before the single apply.

**When to use:** rooting/leaping/charging during windup.
**Trade-offs:** ordering is load-bearing — `runUnitAttacks` MUST sit between Pass 1 and the goliath
apply loop, and its strike damage MUST land before the `playerDamage` apply at l.3207. Documented in
the build order below.

### Pattern 4: Client telegraph = server row + mirrored durations (no client timers of its own)

**What:** The client never counts down independently. `createAttackTelegraphs` reads each
`unit_attack` row's `attackId/phase/startedAt/targetX-Z`, looks up `ATTACKS[attackId]` in the client
mirror, and computes `progress = (nowMicros - startedAt) / phaseDurationMicros`. Same input the
server used → identical telegraph timing. Strike VFX fire on the `attack_strike` event
(`onInsert`), exactly mirroring how `skill_cast` (l.466) and `ranged_attack` (l.539) already drive
`handleRemoteSkillCast` / `handleRemotePlayerAttack` (createGame l.1131/1150; App.tsx l.162/170).

**When to use:** all telegraph rendering + strike VFX.
**Trade-offs:** clock skew between client and server micros can shift a telegraph by the RTT; acceptable
for a ground ring, and the strike event is authoritative for the actual hit moment.

---

## Data Flow

### Server FSM → client telegraph → strike

```
worldTick (150ms)
  Pass1 goliath move ─► goliathPosition map
  runUnitAttacks:
    for each goliath with a target in range & now>=cooldownUntil & phase==idle:
        selectAttack(distance, available) ─► attackId; write unit_attack{phase:windup, startedAt:now, targetX/Z}
    for each unit in windup: advanceAttack ─► at startedAt+windup → phase:strike
    for each unit in strike:
        resolve hitbox (circle/cone/lane) vs LIVE player pos ─► playerDamage[map] += damage
        insert attack_strike event ; phase:recovery
    for each unit in recovery→end: cooldownUntil=now+cd ; phase:idle
  apply playerDamage (3207): resistedDamage('contact') → death/shard/respawn
        │
        ▼  (subscription replication)
Client App.tsx
  useTable(unitAttack)  ─► game.syncUnitAttacks(rows)  → attackStateById map + telegraph meshes
  useTable(attackStrike,onInsert) ─► game.handleAttackStrike(ev) → effectSystem burst/slash VFX
        │
        ▼  (per frame)
createGame loop
  createAttackTelegraphs.update(now, rows)          # grow ring/arc/lane by ATTACKS durations
  renderer.update(dt, getGroundHeight, getAttackState)  # getAttackState(id)→{attackId,phase,progress}
        └─ if attack active: entity.animation.animateAttack(...)  else animateMovement(...)
```

### Crit → poise interrupt (needs Phase A `isCrit`)

```
player swing ─► rollDamage() (per-character critRate/critDmg) ─► {amount, isCrit}
  network.sendAttackEnemies(cx,cz,r, amount, combo, isCrit)      # additive arg
     ▼ server attackEnemies (1814)
  for each goliath hit: normal HP subtract (unchanged)
    + applyPoiseHit(ctx, unitKind:1, goliathId, isCrit, amount, ATTACKS):
        if unit_attack row is in windup and isCrit: poise += amount
        if poise >= ATTACKS[attackId].poiseThreshold: cancel → phase:idle, cooldownUntil=now+stagger, NO strike
```

### State Management (client)

```
unit_attack rows ──(useTable)──► syncUnitAttacks ──► attackStateById: Map<unitId,{attackId,phase,progress}>
                                                          │                         │
                                     createAttackTelegraphs (ground meshes)   getAttackState(id)
                                                                                     │
                                                                      renderer.update(...) per entity
```

---

## The number-mirror seam (INV-5 / serverSync parity)

`serverSync.test.ts` reads the server source as text (`readFileSync`, l.1) and asserts client
constants match (e.g. `CHARACTER_STATS` block at `index.ts:43`, tested l.76–120). Two new mirrors:

1. **Crit (Phase A):** `critRate`/`critDmg` added to client `CharacterDefinition`. If the server
   ever needs a copy (it currently only receives the final `damage` + `isCrit` bool, so it may not),
   add it to `CHARACTER_STATS` and extend the existing `toMatchObject` assertion. If the server does
   NOT store crit numbers, document that crit stays client-authored (consistent with today's trust
   model where the client already sends `damage`).
2. **ATTACKS (Phase B):** server `spacetimedb/src/attacks.ts` is the source of truth; client
   `src/game/data/attacks.ts` mirrors `windupMicros/activeMicros/recoveryMicros/cooldownMicros/
   damage/radius/angle/reach/laneWidth`. Add a `describe('server ATTACKS stays in sync …')` block
   that regexes the `ATTACKS` object out of `SERVER_SOURCE` (same technique as the `BANNERS` block
   test at l.122–125) and deep-equals the client copy. Every attack tuning change touches both files
   + this test — the guard that makes the duplication safe.

---

## Scaling Considerations

| Scale | Adjustment |
|-------|------------|
| Current (1–3 goliaths, dozens of enemies, handful of players) | `runUnitAttacks` is O(units × players) per tick, same order as the existing Pass 3/4 loops — negligible. Ship as-is. |
| Enemies join the FSM (dozens of `unit_attack` rows) | The `(unitKind,unitId)` unique index makes per-unit lookup O(1); iterate `unit_attack` once, not `enemy`×`attacks`. Reuse the tick-start snapshot arrays already built (l.2821–2825) instead of re-`iter()`. |
| Many concurrent telegraphs on the pixel filter | Pool telegraph meshes in `createAttackTelegraphs` (one ring/arc/lane geometry reused, matching `createGoliathModel`'s module-lifetime geometry idiom) — never allocate per strike. |

### Scaling priorities
1. **First bottleneck:** re-iterating tables inside the pass. Pass the already-filtered
   `goliaths`/`players` arrays + `goliathPosition` map into `runUnitAttacks` rather than re-reading.
2. **Second bottleneck:** telegraph mesh churn on the client — pool, don't allocate.

---

## Anti-Patterns

### Anti-Pattern 1: Adding columns to `goliath`/`enemy` for attack state
**What people do:** put `attackPhase`/`windupStart` on the `goliath` table.
**Why it's wrong:** breaks unit-agnosticism (heroes/enemies can't reuse it with zero schema change),
and mid-table column inserts are rejected by STDB migrate on a populated DB (see the `goliath`
append-only note at l.413–414). It would also force a non-additive change.
**Do instead:** one shared `unit_attack` table keyed `(unitKind, unitId)` — additive, reused by
every unit type forever.

### Anti-Pattern 2: A second damage/death code path for strikes
**What people do:** apply strike damage to the player inside `runUnitAttacks` directly.
**Why it's wrong:** duplicates the resistance (`resistedDamage 'contact'`), safe-zone check, shard
erosion, gem spill, and respawn logic (l.3207–3247) — two paths drift.
**Do instead:** accumulate into the existing `playerDamage` map before the single apply loop.

### Anti-Pattern 3: Forking the entity renderer for attacks
**What people do:** copy `createEntityRenderer` into an attack-aware variant.
**Why it's wrong:** the CLAUDE.md no-legacy rule; the generic spine already owns interpolation,
death timing, overlays. Two spines diverge.
**Do instead:** add ONE method `animateAttack` to `EntityAnimation`, feed per-entity state via a
`getAttackState(id)` callback into `update()`. Goliath and enemy adapters implement the method; the
spine stays single.

### Anti-Pattern 4: Client-side attack timers
**What people do:** start a client countdown when a `unit_attack` row appears.
**Why it's wrong:** drifts from the server clock; the strike could land visually out of sync with the
authoritative hit.
**Do instead:** derive `progress` from `(now - startedAt)/duration` using the mirrored ATTACKS
numbers — the client re-derives, never owns, the timeline.

### Anti-Pattern 5: Leaving the goliath contact drain in
**What people do:** keep `damagePerTick(goliathRow.contactDamage …)` at l.3057 alongside strikes.
**Why it's wrong:** double-damages the player (undodgeable drain + dodgeable strike) and contradicts
the milestone goal. It is dead code the moment strikes ship.
**Do instead:** DELETE the Pass 4b goliath→player block (l.3048–3058) in the same slice that lands
the first strike. Camp-enemy drain (Pass 4, l.3039–3045) stays until enemies join the FSM later.

---

## Integration Points

### Server seams (file + line, verified)

| Seam | Location | Change |
|------|----------|--------|
| `schema({…})` | `index.ts:666` | add `unitAttack, attackStrike` to the object |
| table defs | after `goliath` (`index.ts:426`) | add `unit_attack` (public) + `attack_strike` (`event:true`) blocks; event table mirrors `skill_cast`/`ranged_attack` shape (l.466/539) |
| `attackEnemies` | `index.ts:1814` args | add `isCrit: t.bool()`; in the goliath loop (l.1855) call `applyPoiseHit(...)` |
| `attackRay` | `index.ts:1899` args | add `isCrit: t.bool()` (forward/record for parity) |
| `worldTick` insertion | between Pass 1 end (`index.ts:2941`) and goliath apply (`index.ts:3164`), strike damage before player apply (`index.ts:3207`) | call `runUnitAttacks(ctx, now, goliaths, players, playerByHex, goliathPosition, playerDamage)` |
| contact drain to DELETE | `index.ts:3048–3058` (the Pass 4b goliath→player block; core line `3057`) | remove entirely |
| reuse | `resistedDamage` (l.3211), `distanceBetween`, `isWithinForwardArc`, `pickRayHit` | import into the siblings, do not reimplement |

### Client seams (file + line, verified)

| Seam | Location | Change |
|------|----------|--------|
| subscription list | `App.tsx:112` | add `tables.unitAttack, tables.attackStrike` |
| table → game | `App.tsx:156/662` pattern | `useTable(tables.unitAttack)` → effect → `game.syncUnitAttacks(rows)` |
| event → game | `App.tsx:162` (skillCast) pattern | `useTable(tables.attackStrike,{onInsert})` → `game.handleAttackStrike(ev)` |
| network args | `createGame.ts:84 / 97` + call sites l.379/520 | add `isCrit: boolean` to `sendAttackEnemies` / `sendAttackRay` |
| crit roll | `createGame.ts:478–489` (`CRIT_CHANCE=0.22`, `CRIT_MULTIPLIER=1.9`, `rollDamage`) | replace with active character's `critRate`/`critDmg`; return `isCrit` |
| renderer hook | `createEntityRenderer.ts:11` (`EntityAnimation`) + `update()` l.210 | add `animateAttack`; call it per entity from an injected `getAttackState(id)` |
| goliath clips | `createGoliathRenderer.ts:22` (`createGoliathAnimation`) | implement `animateAttack` (swing `sword`/raise `shield` named parts, l.71/85) |
| VFX | `createGame.ts` `effectSystem` (`spawnMeleeSlash`/`spawnBurst`/`spawnProjectile`) | fire from `handleAttackStrike` |
| mirror guard | `serverSync.test.ts:122` regex-block technique | assert client `attacks.ts` == server `attacks.ts` |

---

## Build Order (dependency-ordered)

Respects: crit foundation → FSM + one attack e2e → more shapes → poise interrupt. Each slice is one
atomic commit ending in a real Playwright playtest; deploy per phase is
`spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb --server local --yes` →
`pnpm run spacetime:generate` → `pnpm build`.

**Slice 0 — Crit foundation (Phase A of the spec; independently shippable, unblocks poise).**
- Add `critRate`/`critDmg` to `CharacterDefinition` + per-character values (`characters.ts`).
- Replace `rollDamage` (createGame l.484) to use the active character's stats; return `isCrit`.
- Add `isCrit: t.bool()` to `attackEnemies`/`attackRay` (server records/forwards; no behaviour yet).
- Regen bindings; wire `isCrit` through `sendAttackEnemies`/`sendAttackRay`.
- Extend `serverSync.test.ts`. **No FSM, no new tables.** Ships crit visuals + the server signal
  that Slice 4 will consume.

**Slice 1 — FSM + `leapSlam` end-to-end (the vertical slice).**
- NEW `unit_attack` + `attack_strike` tables; add to `schema()`.
- NEW `spacetimedb/src/attacks.ts` (ATTACKS with just `leapSlam`, UNIT_ATTACKS, `selectAttack`),
  `unitAttackFsm.ts` (`advanceAttack`), `attackHitbox.ts` (`resolveCircle`).
- NEW `runUnitAttacks` pass wired into `worldTick` at the documented position; **DELETE the goliath
  contact drain (l.3048–3058)** in this same commit.
- Client: NEW `data/attacks.ts` mirror; NEW `createAttackTelegraphs` (ring only); add `animateAttack`
  to `EntityAnimation` + drive it; `syncUnitAttacks` + `handleAttackStrike` in createGame; subscribe
  in App.tsx; serverSync mirror test.
- Playtest with the party test-bot / puppet (l.2827) as the strike target.

**Slice 2 — `swordSwing` (cone) → `swordSwirl` (circle) combo.**
- Add two ATTACKS entries + `resolveCone` in `attackHitbox.ts` (reuse `isWithinForwardArc` +
  `distanceBetween`); chain selection (swirl after swing).
- Client: cone + reuse circle telegraph renderers; goliath sword-swing clip.

**Slice 3 — `shieldDash` (lane, moving hitbox).**
- Add ATTACKS entry + `resolveLane` in `attackHitbox.ts` (reuse `pickRayHit`'s along-ray/perp
  projection, but collect ALL within `laneWidth`, not just nearest); `move:'charge'` body commit.
- Client: lane telegraph + charge animation.

**Slice 4 — Crit poise interrupt.**
- `applyPoiseHit` in `unitAttackFsm.ts`; call from `attackEnemies`/`attackRay` using Slice 0's
  `isCrit`. Accrue `poise` during windup; cancel + stagger at `poiseThreshold`; reset on attack end.
- Playtest: crit a goliath mid-windup → attack cancels, no strike.

**Dependency rationale:** Slice 0 is a prerequisite for Slice 4 (poise reads `isCrit`) but ships value
alone. Slice 1 is the risky vertical slice (schema + pass ordering + subscription + telegraph +
animation + drain deletion) proven on ONE attack before multiplying shapes in 2/3. Slice 4 last
because it depends on both the FSM (windup state to interrupt) and crit (the signal).

---

## Sources

- Verified against live code: `spacetimedb/src/index.ts` (schema 666, enemy 366, goliath 395,
  attackEnemies 1814, attackRay 1899, worldTick 2806, contact drain 3048–3058, playerDamage apply
  3207, imports 16–24), `combatMath.ts`, `resistances.ts`, `goliathAI.ts`, `hitscan.ts`.
- Client: `createEntityRenderer.ts` (EntityAnimation 11, update 210), `createGoliathRenderer.ts`,
  `createGoliathModel.ts` (named parts), `createGame.ts` (network 84/97, rollDamage 478–489, sync
  1125–1130, remote-event handlers 1131/1150), `App.tsx` (subscribe 112, useTable 156/162/662),
  `data/characters.ts`, `data/__tests__/serverSync.test.ts`.
- Design intent: `.planning/transcendence/combat-telegraphed-attacks-SPEC.md`, `.planning/PROJECT.md`.

---
*Architecture research for: unit-agnostic attack FSM integration (v0.2.0-alpha Combat Depth)*
*Researched: 2026-07-08*
