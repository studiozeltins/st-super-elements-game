# SPEC — Telegraphed, dodgeable enemy attacks (+ real crit system)

**Status:** Draft (design agreed in session 2026-07-07). Not yet planned/executed.
**Shape:** Two phases. Phase A (crit system) is a prerequisite for Phase B's interrupt.

---

## Problem

Goliaths (and camp enemies) deal a **continuous per-tick contact drain**
(`damagePerTick(contactDamage, tick)` every 150 ms while in range). It cannot be
dodged — standing near a goliath just bleeds you. We want **discrete, telegraphed
attacks** resolved against live positions so players can **dash out of the way**,
and a real **crit system** that (among other things) can **interrupt** an enemy
mid-windup.

## Non-goals

- A real rigid-body physics engine. "Physics feel" = hitboxes resolved at the
  strike instant vs current positions, not continuous collision.
- Converting camp enemies in Phase B (goliaths first; the schema is built to reuse
  for enemies later with zero schema change).

---

# Phase A — Crit system (foundation)

### What exists today (to replace)
`src/game/createGame.ts:472` — a **client-only, global** roll: `Math.random() < 0.22`
→ `×1.9`. It is not per-character, uses `Math.random`, and the server never learns
a hit crit (it only receives the final `damage`).

### Deliverable
- **Per-character crit stats** on `CharacterDefinition` (`src/game/data/characters.ts`):
  `critRate: number` (0..1) and `critDmg: number` (e.g. 0.9 = +90%). Optionally
  weapon-contributed later. Mirror any server-visible copy per the naming contract.
- **Replace `rollDamage`** to use the active character's `critRate` / `critDmg`
  instead of the global constants. Roll stays client-side (consistent with the
  existing trust model — the client already sends the damage amount).
- **`isCrit: bool` added to `attackEnemies` and `attackRay`** reducer args (additive
  arg; regenerate bindings). The server records/forwards it — needed by Phase B's
  interrupt. No other server behaviour changes in Phase A.
- Damage-number `kind: 'crit'` visual stays; now driven by the real roll.

### Acceptance
- Each character has distinct `critRate`/`critDmg`; the floated crit number and the
  damage sent both reflect them.
- `attackEnemies`/`attackRay` receive and (for now) log/forward `isCrit`.
- No regression to existing combat/tests; `serverSync` parity holds for any mirrored
  constant.

### Open tuning
- Starting values per character (design pass). Whether weapons/constellations also
  add crit. Whether crit is capped.

---

# Phase B — Telegraphed dodge-attacks (`unit_attack` system)

## Core model: `windup → strike → recovery`, dodgeable

A per-unit **attack state machine** on the world tick. Damage resolves **once at the
strike frame** against **current** player positions — moved out during windup = no
damage. The unit is **committed** during windup (rooted / leaping / charging), except
a crit interrupt (below) can cancel it.

## Schema — decoupled, reusable, additive

**New public table `unit_attack`** (NOT columns on `goliath`/`enemy`, so every unit
type shares one machine and it stays additive):

```
unit_attack (public)
  id            u64  primaryKey autoInc
  unitKind      u32  index(btree)   // 0 = camp enemy, 1 = goliath, … extensible
  unitId        u64                 // the enemy/goliath id (unique with unitKind)
  attackId      u32                 // which ATTACKS entry is running
  phase         u32                 // 0 idle · 1 windup · 2 strike · 3 recovery
  startedAt     u64                 // micros the current phase began
  targetX       f32
  targetZ       f32                 // landing spot / lane dir / swing origin
  cooldownUntil u64                 // per-unit next-attack gate
  poise         u32                 // crit damage accrued during this windup
  indexes: by_unit (unitKind, unitId) unique
```

**New event table `attack_strike`** (`event: true`) — broadcast the strike instant
for one-shot VFX/audio (mirrors `skill_cast` / `ranged_attack`):
`{ unitKind, unitId, attackId, x, z, dirX, dirZ }`.

Both are **additive** (new tables + new reducer arg) → safe migrate-publish, no
mid-table column insert.

## Attack definitions — data-driven registry (shared client + server)

`ATTACKS[attackId] = { shape, windupMicros, activeMicros, recoveryMicros,
cooldownMicros, radius?, angle?, reach?, laneWidth?, damage, move, poiseThreshold }`

- `shape`: `'circle' | 'cone' | 'lane'` — generic telegraph geometry (3 shapes cover
  all four attacks; new attacks usually reuse a shape → free).
- `move`: `'root' | 'leap' | 'charge'` — body behaviour during the attack.

**Extend = add one entry** (+ a client renderer only for a genuinely new shape).

## Which unit does which attacks — per-archetype data

`UNIT_ATTACKS[unitKind][archetype] = [attackId, …]`
- Goliath (by size): `[shieldDash, leapSlam, swordSwing, swordSwirl]`.
- Camp enemies (later): e.g. `[swordSwing]` / `[lunge]` — no schema change.

One shared **selection fn**: `(distance, cooldownUntil, available[]) → attackId | null`.

## The attack roster (v1, goliath)

| id | shape | trigger | windup | hitbox @ strike | move | dmg |
|----|-------|---------|--------|-----------------|------|-----|
| `shieldDash` | lane | player **far** (>~9) | ~0.6 s lane telegraph toward player | capsule along lane (halfWidth ~1.2) | charge | ~130 |
| `leapSlam` | circle | mid range | ~0.9 s ring at **locked** landing (player pos at cast) | circle r≈3.5 | leap | ~220 |
| `swordSwing` | cone | **close** | ~0.45 s frontal arc | cone ±60°, reach ~3.0 | root | ~120 |
| `swordSwirl` | circle | chains after swing | ~0.5 s 360° flash | circle r≈3.2 | root | ~150 |

Damage is **flat burst** (dodgeable), not DPS. The goliath **contact drain is
removed** (`damagePerTick(goliathRow.contactDamage …)` at index.ts ~2579 deleted);
goliaths damage only via strikes. Camp-enemy drain unchanged in this phase.

## State machine (world tick, deterministic)

Per unit, per tick:
- **In an attack** (`phase != idle`): advance by elapsed micros.
  - `windup` → at `startedAt + windupMicros`: enter `strike` (goliath finishes the
    leap/charge move to `targetX/Z`).
  - `strike` (one tick / short active window): resolve the shape's hitbox vs current
    player positions → damage those inside (through the existing synced-HP path);
    insert an `attack_strike` event; enter `recovery`.
  - `recovery` → at end: `cooldownUntil = now + cooldownMicros`, back to `idle`.
- **Idle** + a target in engage range + `now >= cooldownUntil`: run selection fn →
  set `attackId, phase=windup, startedAt=now, targetX/Z`. Movement toward the target
  continues to use the existing bridge pathing.

## Crit interrupt (poise) — needs Phase A

While a unit is in `windup`, a **crit** hit (server sees `isCrit` from Phase A) adds
its damage to `poise`. When `poise >= ATTACKS[attackId].poiseThreshold` → **cancel**:
clear the attack, apply a brief stagger (short `cooldownUntil` bump / stun), no strike
fires. Non-crit hits do not interrupt (poise resets when the attack ends).

## Client (rendering only — server-authoritative)

- Subscribe `unit_attack` + `attack_strike`. Render the telegraph by reading
  `attackId, phase, startedAt, targetX/Z` and mirroring the `ATTACKS` durations:
  - `circle` → growing/filling ground ring at the target (leap/swirl).
  - `cone` → arc from the unit along its heading (swing).
  - `lane` → a directed lane from the unit toward the target (dash).
- Play the goliath's attack animation per `attackId`; strike VFX on the
  `attack_strike` event. Damage feedback stays via the synced HP drop.

## Reusability recap (the point of the schema)

- **New enemy type attacks** → insert `unit_attack` rows + a `UNIT_ATTACKS` list.
  **Zero schema change.**
- **New attack** → one `ATTACKS` entry (+ renderer only for a new shape).
- The state table is **unit-agnostic**; goliaths and camp enemies share one machine.

## Build slices (Phase B)

1. `unit_attack` + `attack_strike` schema, `ATTACKS`/`UNIT_ATTACKS` registries, state
   machine + **leapSlam** end-to-end (server hitbox + client ring telegraph), remove
   goliath drain. Publish + regen + playtest via the party test-bot as a target.
2. `swordSwing → swordSwirl` combo (cone + circle).
3. `shieldDash` (lane, moving hitbox).
4. Crit interrupt wired to Phase A's `isCrit`.

## Open questions / tuning
- Exact windup/damage/cooldown values (feel pass).
- Should a landed hit knock back / briefly stun the player?
- Telegraph readability on the pixel filter (ring contrast).
- Milestone placement: new "Combat depth" milestone vs appended phases 8/9 on
  Transcendence.
