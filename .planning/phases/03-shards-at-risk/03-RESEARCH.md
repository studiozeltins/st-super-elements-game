# Phase 3: Shards at risk (death loss, PVP steal, erosion) - Research

**Researched:** 2026-07-07
**Domain:** SpacetimeDB server-authoritative death economy (TypeScript module + React/Three.js client)
**Confidence:** HIGH (server mechanics verified against live source with line numbers) / MEDIUM (client toast/steal-feed UI — no existing pattern, design freedom)

## Summary

Phase 3 turns carried `transcendShards` into a real stake. On death, a pure helper
`applyDeathShardPenalty` decides what is lost in a fixed order (shard → transcend level →
one constellation level), and the three death paths are wired to it. PVE deaths spill the
lost shard as a **new `shard_drop` ground collectible** (a faithful mirror of the existing
`gem_drop` / `spillGems` / `collectGem` machinery, including the 1.2s pickup grace). PVP
deaths transfer the shard **directly** to the killer (no ground drop). All the scaffolding
this phase mirrors already exists and is verified in `spacetimedb/src/index.ts`; the
`SHARD_DEATH_LOSS = 1` constant is already defined and mirror-tested on both sides (landed in
Phase 0), so **no new constant is needed**.

The single highest-risk correctness point: the PVP killer must be credited **only the shards
the victim actually lost** (`result.shardsLost`), not a hardcoded `+1`. When the victim
carries 0 shards, the penalty erodes a transcend/constellation level instead — there is
nothing to steal, so the killer receives 0. The branch ORDER in the pure helper is itself the
u32-underflow safety property (same discipline Phase 2 used for `resolveTranscendInstall`):
each decrement only runs on a branch that already proved the value is `> 0`.

**Primary recommendation:** Extract a dependency-free pure helper
`spacetimedb/src/deathPenalty.ts` (sibling of `transcendInstall.ts`), unit-test it across all
four branches via cross-import, then wire it into `takeDamage`, the `worldTick` player-death
loop, and `attackPlayer` — keeping the existing gem spill in every path. Add a `shard_drop`
table + `collectShard` reducer mirroring `gem_drop`/`collectGem`, and a `spillShards` helper
mirroring `spillGems`. Client: subscribe + render `shard_drop` with a distinct visual, add a
`sendCollectShard` bridge, and a lightweight shard-lost/stolen toast driven by a
`transcendShards` diff.

## User Constraints (from canonical Transcendence spec + PROGRESS.md contracts)

> There is NO CONTEXT.md for this phase. These are the authoritative locked contracts from
> `.planning/transcendence/PROGRESS.md` and `phase-3-shard-risk.md` — treat them with the same
> authority as locked decisions.

### Locked naming (verbatim — do not paraphrase)
- Transcendence currency: **`transcendShards`** (u32 on `player`).
- PVE-death shard pickup table: **`shard_drop`** / accessor **`shardDrop`**.
- Spill helper: **`spillShards`** (mirrors `spillGems`).
- Reuse the generic **`gemIsCollectible`** for the grace check (do NOT fork it).
- Constant: **`SHARD_DEATH_LOSS`** (already exists = 1).
- Per-character transcend level: **`ownedCharacter.transcendLevel`**; constellation:
  **`ownedCharacter.constellation`**.
- NEVER `primogem`, NEVER "fragment"/"crystal" — always `shard`.
- User-facing noun: "Constellation Shards" (display copy only; code stays `shard`).

### Locked decisions
- **PVE death shard → ground collectible** (spills via the gem-spill path + 1.2s grace so a
  camp can't instantly vacuum it; anyone can grab it).
- **PVP death → shard transfers directly to the killer** (no ground drop).
- **Erosion order (invariant #1 — the protected PVE floor):** shard first → then transcend
  level → then, as an absolute last resort, ONE constellation level (C6→C5). Never erode
  below one C-level beyond that; C0–C6 is the protected floor.
- Additive schema (new table + new reducer) → **migrate-publish, no data wipe** (drop `-c`).
- All work on branch **`feat/transcendence`**.

### Claude's discretion (no CONTEXT.md → these are open design choices for the planner)
- The exact visual of the `shard_drop` pickup (distinct from gems).
- The toast/steal-feed presentation (no existing toast system — see Client section).
- Whether the steal-feed uses a broadcast event table or a local diff (see Open Questions).

### Deferred / out of scope
- Raid shard faucet (Phase 6), role enforcement/balance (Phase 7), elemental resistance,
  XP/levelling. Do not touch.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-shard-risk | Extract `applyDeathShardPenalty(player, activeOwnedChar)` → `{ shardsLost, erodedTranscend, erodedConstellation }`; wire into 3 death paths keeping the 1/3-gem spill; PVE spills shard as ground collectible (1.2s grace), PVP credits killer `+= shardsLost`; client toast + counter + steal-feed hint. | Pure-helper pattern verified (`transcendInstall.ts`); all 3 death paths located with line numbers; `gem_drop`/`spillGems`/`collectGem`/`gemIsCollectible` shapes documented for faithful mirror; client render/subscribe path documented. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Death penalty decision (what is lost, in what order) | Pure module (`spacetimedb/src/deathPenalty.ts`) | — | Deterministic math, no `ctx`/DB/random/time → unit-testable via client vitest cross-import (Phase 1/2 precedent). |
| Applying the penalty + spawning/transferring the shard | Server reducers (`index.ts`) | — | Authoritative mutation; `ctx.sender` is the only trusted identity; clients cannot fake shard gain (CLAUDE.md rule 5). |
| `shard_drop` persistence + collectibility grace | Server table + `collectShard` reducer | Pure `gemIsCollectible` | Anti-cheat parity: server refuses a grab before 1.2s elapses, exactly like `collectGem`. |
| Rendering `shard_drop` pickups + magnet/collect request | Client (`createGame.ts`) | — | Pure presentation; the server owns whether a grab succeeds. |
| Shard-lost/stolen toast + counter + steal-feed | Client (`App.tsx` + UI) | Optional event table for the feed | UX only; the counter is already reactive via `useTable(player)`. |

## Standard Stack

No new packages. This phase is entirely in-repo TypeScript + the existing toolchain.

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| `spacetimedb` SDK (server + client) | as-installed (pnpm) | tables/reducers/subscriptions | The whole game runs on it. `[VERIFIED: codebase — spacetimedb/src/index.ts imports]` |
| `vitest` | as-installed | pure-helper + mirror tests | Existing test runner (`src/game/**/__tests__`). `[VERIFIED: codebase]` |
| `three` | as-installed | render `shard_drop` mesh | Existing gem renderer uses `THREE.OctahedronGeometry`. `[VERIFIED: createGame.ts:619]` |
| `pnpm` | repo standard | package/build | CLAUDE.md + PROGRESS: `pnpm`, never `npm`. `[CITED: PROGRESS.md]` |
| `spacetime` CLI | installed | publish/generate | Additive migrate publish + regenerate bindings. `[CITED: PROGRESS.md]` |

**Installation:** none — no `pnpm add`.

## Package Legitimacy Audit

Not applicable — this phase installs **zero external packages**. All work uses in-repo modules
and the already-installed toolchain. No `SLOP`/`SUS`/`ASSUMED` packages.

## Architecture Patterns

### System Data Flow

```
                          ┌─────────────────────── PURE (no ctx/db/random/time) ──────────────────────┐
                          │  deathPenalty.ts: applyDeathShardPenalty(shards, transcendLevel,           │
                          │  constellation, SHARD_DEATH_LOSS)                                          │
                          │   → { shardsLost, erodedTranscend, erodedConstellation, next* }            │
                          │   ORDER: shards>0 → transcendLevel>0 → constellation>0  (order = safety)   │
                          └───────────────▲───────────────────────────▲───────────────────▲───────────┘
                                          │ called by                 │                   │
   PVE enemy melee ─► takeDamage ─────────┤                           │                   │
   (client sendTakeDamage)   (HP hits 0)  │                           │                   │
                                          │                           │                   │
   worldTick player-death loop ───────────┤ (server sim, HP hits 0)   │                   │
   (150ms scheduled reducer)              │                           │                   │
                                          ▼                           ▼                   ▼
                            KEEP existing spillGems(...)   PVE: spillShards(...)   PVP (attackPlayer):
                            (1/4 or 1/3 of gems)           → insert shard_drop     killer.transcendShards
                                                            row (1.2s grace)        += shardsLost
                                                                  │                 (direct transfer,
                                                                  │                  NO ground drop)
                                                                  ▼
   Any player walks over ─► client magnet+grace ─► sendCollectShard(dropId)
                                                                  ▼
                            collectShard reducer: gemIsCollectible grace check →
                            delete shard_drop → grabber.transcendShards += amount
                                                                  ▼
   Client: useTable(shardDrop) renders pickups; useTable(player) diff on
   transcendShards → lost/stolen toast; ◈ counter updates reactively.
```

### Pattern 1: Pure cross-boundary decision helper (Phase 1/2 precedent — MUST reuse)
**What:** Extract the death-penalty branch into `spacetimedb/src/deathPenalty.ts` with **no**
`ctx`, DB, `import`, random, or time — only primitives in, a result object out. Unit-test it
from the client vitest runner by importing across the package boundary
(`../../../../spacetimedb/src/deathPenalty`).
**When to use:** Any reducer decision that must also be cheaply testable and/or previewed
client-side. This is the established house pattern.
**Example (recommended shape — primitives, not row objects):**
```typescript
// Source: mirror of spacetimedb/src/transcendInstall.ts (verified pattern)
export interface DeathShardPenalty {
  shardsLost: number;          // credited to a PVP killer; == SHARD_DEATH_LOSS or 0
  erodedTranscend: boolean;
  erodedConstellation: boolean;
  nextShards: number;
  nextTranscendLevel: number;
  nextConstellation: number;
}

// Branch ORDER is the u32-underflow safety property: each decrement only runs on a
// branch that already proved the value is > 0 (same discipline as resolveTranscendInstall).
export function applyDeathShardPenalty(
  transcendShards: number,
  transcendLevel: number,
  constellation: number,
  loss: number
): DeathShardPenalty {
  if (transcendShards > 0) {
    return { shardsLost: loss, erodedTranscend: false, erodedConstellation: false,
      nextShards: Math.max(0, transcendShards - loss), nextTranscendLevel: transcendLevel, nextConstellation: constellation };
  }
  if (transcendLevel > 0) {
    return { shardsLost: 0, erodedTranscend: true, erodedConstellation: false,
      nextShards: 0, nextTranscendLevel: transcendLevel - 1, nextConstellation: constellation };
  }
  if (constellation > 0) {
    return { shardsLost: 0, erodedTranscend: false, erodedConstellation: true,
      nextShards: 0, nextTranscendLevel: 0, nextConstellation: constellation - 1 };
  }
  return { shardsLost: 0, erodedTranscend: false, erodedConstellation: false,
    nextShards: 0, nextTranscendLevel: 0, nextConstellation: 0 };
}
```
> Note on the REQ signature `applyDeathShardPenalty(player, activeOwnedChar)`: the primitive
> form above is the faithful pure equivalent — the reducer reads `player.transcendShards`,
> `activeOwnedChar.transcendLevel`, `activeOwnedChar.constellation` and passes them in. Passing
> whole rows would drag STDB row types into the pure module and break the dependency-free
> testability the house pattern depends on. `[VERIFIED: spacetimedb/src/transcendInstall.ts, transcendInstall.test.ts]`

### Pattern 2: `shard_drop` table mirrors `gem_drop` exactly
**What:** A public autoInc table with position, amount, dropper, and a defaulted
`droppedAtMicros` for the grace check.
**Example (verified `gem_drop` shape to mirror):**
```typescript
// Source: spacetimedb/src/index.ts:297-309 (gem_drop) — mirror as shard_drop
const shardDrop = table(
  { name: 'shard_drop', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    positionX: t.f32(),
    positionZ: t.f32(),
    amount: t.u32(),
    droppedBy: t.identity(),
    // .default(0n) keeps this an additive migration; 0n reads as long-elapsed → collectible.
    droppedAtMicros: t.u64().default(0n),
  }
);
```
Register it in the `schema({ ... })` call (the `gemDrop` accessor sits at `index.ts:569`).
`[VERIFIED: index.ts:297-309, 569]`

### Pattern 3: `spillShards` — single-piece spill (do NOT denominate)
**What:** `spillGems` breaks a hoard into a shower of denominated pieces (`GEM_DENOMINATIONS`
= 500,100,...). A shard is a scarce count-of-1 currency, so `spillShards` should insert **one**
`shard_drop` row of `amount = SHARD_DEATH_LOSS`, lightly scattered, stamped with
`droppedAtMicros = ctx.timestamp.microsSinceUnixEpoch`.
**Example:**
```typescript
// Source: modeled on spillGems/spillDenominations (index.ts:746-795) but single-piece
function spillShards(ctx, positionX, positionZ, amount, droppedBy) {
  if (amount <= 0) return;
  const angle = ctx.random() * Math.PI * 2;
  const radius = ctx.random() * GEM_SPILL_SCATTER; // reuse 2.2 scatter
  ctx.db.shardDrop.insert({
    id: 0n,
    positionX: clampToWorld(positionX + Math.cos(angle) * radius),
    positionZ: clampToWorld(positionZ + Math.sin(angle) * radius),
    amount, droppedBy,
    droppedAtMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
}
```
`[VERIFIED: index.ts:205 (GEM_SPILL_SCATTER), 746-795 (spill helpers)]`

### Pattern 4: `collectShard` reducer mirrors `collectGem`
```typescript
// Source: spacetimedb/src/index.ts:1505-1521 (collectGem) — mirror as collectShard
export const collectShard = spacetimedb.reducer(
  { dropId: t.u64() },
  (ctx, { dropId }) => {
    const currentPlayer = requirePlayer(ctx);
    const drop = ctx.db.shardDrop.id.find(dropId);
    if (!drop) return;
    // Reuse the SAME generic grace check + GEM_PICKUP_DELAY_MICROS (do not fork).
    if (!gemIsCollectible(drop.droppedAtMicros, ctx.timestamp.microsSinceUnixEpoch, GEM_PICKUP_DELAY_MICROS)) return;
    ctx.db.shardDrop.id.delete(dropId);
    ctx.db.player.identity.update({
      ...currentPlayer,
      transcendShards: currentPlayer.transcendShards + drop.amount,
    });
  }
);
```
`[VERIFIED: index.ts:1505-1521, gemIsCollectible at combatMath.ts:22]`

### Anti-Patterns to Avoid
- **Hardcoding the PVP credit as `+1`.** Credit `result.shardsLost` (0 when the victim had no
  shards and eroded instead). A hardcoded `+1` mints a shard from nothing on a 0-shard kill —
  breaks invariant #2 (scarcity). `[VERIFIED: attackPlayer credit path index.ts:956-962]`
- **Dropping the existing gem spill.** Every death path already spills gems (`PVE_DEATH_SPILL`
  = 1/4, `PVP_DEATH_SPILL` = 1/3). The shard penalty is **additive** — keep the gem spill.
  `[VERIFIED: index.ts:184-185, 956, 1100, 2319]`
- **Adding `shard_drop` to `vacuumGems`.** `vacuumGems` (index.ts:1907) only sweeps `gemDrop`
  into camp hoards. Shards are scarce and meant for players to grab — do NOT extend the vacuum
  to shards (would let a camp eat a dropped shard). The 1.2s grace already stops instant
  pickup races; leaving shards out of the vacuum is the correct default. `[VERIFIED: index.ts:1907-1932]`
- **Underflow via subtract-before-check.** Never `transcendShards -= loss` outside the
  `transcendShards > 0` branch — the helper's order guarantees safety; keep it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Ground-drop grace / anti-vacuum timing | A new time check | `gemIsCollectible(droppedAt, now, GEM_PICKUP_DELAY_MICROS)` | Already generic, mirror-tested, and the client `GEM_PICKUP_DELAY = 1.2` matches. `[VERIFIED: combatMath.ts:22, createGame.ts:270]` |
| Scatter/placement math | New jitter code | `GEM_SPILL_SCATTER` + `clampToWorld` + `ctx.random()` | Deterministic, world-clamped, already used by `spillDenominations`. `[VERIFIED: index.ts:696-698, 770-778]` |
| Active-character resolution in a reducer | Ad-hoc scan | `findOwnedRow(ctx, player, player.activeCharacterId)` | The canonical accessor used by `setActiveHealth`/`respawnPlayerAtSpawn`. `[VERIFIED: index.ts:700-704, 710, 733]` |
| Client pickup request loop | New magnet/collect code | Copy `updateGemDrops`/`syncGemDrops` shape | Magnet, grace gate, dedupe set, and collect request already solved. `[VERIFIED: createGame.ts:628-661, 937-966]` |
| Death-loss amount | New constant | `SHARD_DEATH_LOSS` (already = 1, both sides, mirror-tested) | Landed in Phase 0; adding a second constant would desync. `[VERIFIED: index.ts:83, constants.ts:12, serverSync.test.ts:136]` |

**Key insight:** Almost everything this phase needs already exists for gems. The net-new code
is: one table, one `spillShards`, one `collectShard`, one pure `deathPenalty.ts`, three
2–4 line wiring edits, and the client mirror (subscribe + render + toast).

## Runtime State Inventory

Not a rename/refactor/migration phase — this is an additive feature. Section omitted per
protocol. (The only migration concern is the additive `shard_drop` table publish; see
Environment Availability + Common Pitfall 3.)

## Common Pitfalls

### Pitfall 1: PVP killer credited from an empty victim
**What goes wrong:** A player with 0 shards is PVP-killed; the killer gains a shard that was
minted from nothing.
**Why it happens:** Wiring `killer.transcendShards += 1` unconditionally instead of
`+= result.shardsLost`.
**How to avoid:** In `attackPlayer`, call `applyDeathShardPenalty` on the victim, apply the
`next*` values to the victim's rows, and credit the killer exactly `result.shardsLost`. When
the victim eroded a level instead, `shardsLost === 0` → killer gets nothing.
**Warning signs:** Total shards in the world rises after a kill; unit test "PVP transfers
exactly 1" only tested the has-shards branch.

### Pitfall 2: Constellation erosion desyncs the activation row
**What goes wrong:** `ownedCharacter.constellation` is the **unlocked ceiling**; a separate
`character_activation.activatedConstellation` tracks *active* stars. Eroding `constellation--`
could leave a stale higher `activatedConstellation`.
**Why it (doesn't) happen:** `activatedConstellationFor` already clamps with
`Math.min(row.activatedConstellation, unlocked)` (index.ts:1599), so effective active power
auto-clamps on read. **No extra write is strictly required**, but the planner should decide
whether to also write the clamped activation row for cleanliness. Document the choice.
**Warning signs:** A character shows C5 unlocked but still scales as C6 — would only happen if
some code read `activatedConstellation` without the clamp helper. `[VERIFIED: index.ts:1592-1600]`

### Pitfall 3: Additive publish backfill
**What goes wrong:** Publishing the new `shard_drop` table fails or wipes data.
**Why it happens:** `shard_drop` is a brand-new table (not a new column), so it's inherently
additive and safe. The subtlety from Phase 2 is columns, not tables — but if any restore/seed
path spread-inserts rows, adding a table is fine. Publish with `--server local` and NO `-c`.
**How to avoid:** `spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb --server
local --yes` (no `-c`) → confirm the Migration Plan shows only the table add →
`pnpm run spacetime:generate` → `pnpm build`. `[CITED: PROGRESS.md workflow; 02-LEARNINGS.md]`

### Pitfall 4: `fallToDeath` is a fourth death path the spec does not list
**What goes wrong:** `fallToDeath` (index.ts:1105) wipes half the victim's gems (not a loot
spill) and is NOT in the spec's three-path list. If left unwired, void-falling is a
shard-safe suicide.
**Why it matters:** Design ambiguity — the spec enumerates only `takeDamage`, worldTick, and
`attackPlayer`. See Open Questions; do not silently wire it without a decision.
`[VERIFIED: index.ts:1105-1115]`

## Code Examples

### The three death paths to wire (verified locations)
```typescript
// PVE #1 — takeDamage, index.ts:1099-1101 (keep spillGems, add shard penalty + spillShards)
const spilled = spillGems(ctx, currentPlayer, PVE_DEATH_SPILL, currentPlayer.identity);
// ... apply applyDeathShardPenalty(currentPlayer, activeOwned); if shardsLost>0 spillShards(...)
respawnPlayerAtSpawn(ctx, { ...currentPlayer, gems: currentPlayer.gems - spilled });

// PVE #2 — worldTick player-death loop, index.ts:2303-2321 (same treatment)
const spilled = spillGems(ctx, targetPlayer, PVE_DEATH_SPILL, ctx.sender);
respawnPlayerAtSpawn(ctx, { ...targetPlayer, gems: targetPlayer.gems - spilled });

// PVP — attackPlayer kill branch, index.ts:954-963
const stolen = spillGems(ctx, target, PVP_DEATH_SPILL, attacker.identity);   // KEEP
// result = applyDeathShardPenalty(target.transcendShards, activeOwned.transcendLevel, activeOwned.constellation, SHARD_DEATH_LOSS)
// write target next* rows; credit attacker.transcendShards += result.shardsLost (NOT +1)
respawnPlayerAtSpawn(ctx, { ...target, gems: target.gems - stolen, transcendShards: result.nextShards });
```
Each path resolves the active owned character with
`const activeOwned = findOwnedRow(ctx, <player>, <player>.activeCharacterId);` and, when
`erodedTranscend`/`erodedConstellation`, writes the owned-character row via
`ctx.db.ownedCharacter.id.update({ ...activeOwned, transcendLevel: result.nextTranscendLevel,
constellation: result.nextConstellation })`. `[VERIFIED: index.ts:700-704, 933, 1084, 2305]`

### Client: subscribe + render `shard_drop`
```typescript
// App.tsx:73-90 subscribe list — add tables.shardDrop
// App.tsx:106 add: const [shardDropRows] = useTable(tables.shardDrop);
// App.tsx:372 effect — add: gameRef.current?.syncShardDrops(shardDropRows);
// App.tsx:348 network bridge — add: sendCollectShard: dropId => connection.reducers.collectShard({ dropId }),
// createGame.ts — add syncShardDrops + updateShardDrops mirroring gem versions with a
//   distinct mesh (e.g. violet/◈ crystal), reusing GEM_PICKUP_DELAY / magnet / collect logic.
```
`[VERIFIED: App.tsx:73-90, 106, 348, 372; createGame.ts:628-661, 937-966]`

### Client: shard lost/stolen toast (diff-driven, no new event table needed for the minimal path)
```typescript
// The ◈ counter is already reactive (myPlayer.transcendShards via useTable(player)).
// A useRef holding the previous value + a useEffect diff fires the toast:
//   prev -> curr DOWN  => "You lost a Constellation Shard" (died as carrier / eroded)
//   prev -> curr UP    => "Stole a Constellation Shard!"   (PVP kill / picked one up)
// The pvpHit event table (index.ts, subscribed App.tsx:157-167) is the template if a
// broadcast steal-FEED (who stole from whom) is wanted — see Open Questions.
```
`[VERIFIED: App.tsx:157-174 (pvpHit/healEvent event pattern), 474/498 (transcendShards prop already flows)]`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Death only spills gems | Death also stakes a scarce shard (drop/steal/erode) | This phase | Shards become contestable, not pure insurance (invariant #3). |
| `transcendShards` shown only in CharacterScreen/Gacha ◈ chip | Also surfaced via in-combat toast on change | This phase | Player gets immediate feedback on loss/theft. |

**Deprecated/outdated:** none introduced.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | PVP killer credit should be `result.shardsLost` (0 when victim had no shards), NOT a flat +1. | Pitfall 1 | Flat +1 mints shards from nothing on 0-shard kills (breaks scarcity). Strongly recommend confirming in planning. |
| A2 | `spillShards` drops a single count-1 `shard_drop` (no denomination breakdown). | Pattern 3 | If shards should ever spill in quantity >1 with denominations, the helper needs the `spillDenominations` treatment. Current `SHARD_DEATH_LOSS=1` makes single-piece correct. |
| A3 | `shard_drop` is excluded from `vacuumGems` (camps can't eat shards). | Anti-Patterns | If camps SHOULD absorb shards, add a shard vacuum; but scarcity argues against it. |
| A4 | Constellation erosion needs no explicit activation-row write (read-time clamp suffices). | Pitfall 2 | If any consumer reads `activatedConstellation` un-clamped, a stale value over-scales after erosion. Verified none currently do. |
| A5 | `fallToDeath` (void death) is out of scope for the shard penalty (spec lists only 3 paths). | Pitfall 4 / Open Q | If void death should also cost a shard, a 4th wiring is needed. |
| A6 | Minimal toast is a local `transcendShards` diff; a broadcast steal-feed (attacker+victim names) is optional and would need a new event table. | Client / Open Q | A diff-only toast can't name WHO stole; if the "steal-feed hint" must name the thief, an event table is required. |

## Open Questions (RESOLVED)

1. **Does void death (`fallToDeath`) also cost a shard?** → **RESOLVED: NO — `fallToDeath` is
   NOT wired to the shard penalty. [D1]**
   - What we know: The spec enumerates exactly three death paths and `fallToDeath` wipes gems
     (not loot). It is a genuine death.
   - What's unclear: Whether self-inflicted void falls should also trigger `applyDeathShardPenalty`.
   - Disposition [D1]: Void death costs NO shard — `fallToDeath` (index.ts:1105) is left
     unchanged and only the three enumerated paths (takeDamage, worldTick loop, attackPlayer)
     apply the penalty. Encoded as a prohibition in Plan 03-02. If added later, it's a one-line
     wiring.

2. **Steal-feed hint: local toast or broadcast event?** → **RESOLVED: self-facing toast only —
   NO `shard_steal` broadcast table. [D2]**
   - What we know: There is NO existing toast/kill-feed system; `pvpHit`/`healEvent` are the
     event-table precedents. The counter itself is already reactive.
   - What's unclear: Whether "steal-feed hint" must name the thief/victim (needs a broadcast
     `shard_steal` event table) or is just a self-facing "you lost/stole a shard" toast.
   - Disposition [D2]: Ship the self-facing diff-driven toast only (zero new tables); NO
     `shard_steal` broadcast event table is created. Encoded as a prohibition in Plan 03-02. A
     named broadcast feed remains an optional future stretch.

3. **Write the clamped activation row on constellation erosion, or rely on read-time clamp?** →
   **RESOLVED: read-time clamp via `activatedConstellationFor`; write an activation row only if
   an un-clamped consumer is found. [D3]**
   - Disposition [D3]: Rely on `activatedConstellationFor`'s existing read-time clamp
     (index.ts:1592) — no extra write by default. During Plan 03-02 wiring, confirm no un-clamped
     consumer reads `activatedConstellation` directly; only if such a consumer exists, additionally
     write the clamped activation row (documented in the 03-02 SUMMARY).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `pnpm` | build/test | ✓ (repo standard) | — | none (never use npm) |
| `spacetime` CLI | additive publish + `spacetime:generate` | ✓ (used every phase) | — | none |
| local SpacetimeDB (`2d-impact-game-fr9ti`) | migrate publish + playtest | ✓ (Phase 1/2 published here) | — | `spacetime start` if down |
| `vitest` | pure + mirror tests | ✓ | — | none |
| `three` | render shard pickup | ✓ | — | none |

**Missing dependencies with no fallback:** none.
**Note:** maincloud is currently PAUSED (Phase 2 deferred its prod publish) — Phase 3 targets
**local only** for its slice; a prod push is a separate manual step once maincloud is resumed.
`[CITED: 02-LEARNINGS.md — "database is paused" 500]`

## Validation Architecture

Nyquist validation is ENABLED (`workflow.nyquist_validation: true`).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (as-installed) |
| Config file | repo `vitest`/`vite` config (existing) |
| Quick run command | `pnpm test` (or `pnpm vitest run <file>`) |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-shard-risk | `applyDeathShardPenalty` — has-shards branch: `shardsLost=1`, no erosion | unit | `pnpm vitest run src/game/data/__tests__/deathPenalty.test.ts` | ❌ Wave 0 |
| REQ-shard-risk | only-transcend branch: `erodedTranscend`, `transcendLevel-1`, `shardsLost=0` | unit | same | ❌ Wave 0 |
| REQ-shard-risk | only-constellation branch: `erodedConstellation` (C6→C5), `shardsLost=0` | unit | same | ❌ Wave 0 |
| REQ-shard-risk | nothing branch: all false, no negative values (u32 safety) | unit | same | ❌ Wave 0 |
| REQ-shard-risk | branch ORDER: shards present ⇒ never erodes a level | unit | same | ❌ Wave 0 |
| REQ-shard-risk | PVP credit == `shardsLost` (0 on empty victim) — asserted via helper output feeding the credit expression | unit | same | ❌ Wave 0 |
| REQ-shard-risk | `SHARD_DEATH_LOSS` server/client mirror stays in sync | mirror | `pnpm vitest run src/game/data/__tests__/serverSync.test.ts` | ✅ (already asserts SHARD_DEATH_LOSS) |
| REQ-shard-risk | `gemIsCollectible` grace governs shard pickup (reused) | unit | `pnpm vitest run src/game/data/__tests__/serverWorldSim.test.ts` | ✅ (grace test exists) |
| REQ-shard-risk | PVE creates a `shard_drop` (not a killer credit); PVP transfers, no drop | manual/playtest | two-client playtest | manual (no in-proc DB harness) |

### Sampling Rate
- **Per task commit:** `pnpm vitest run <touched test file>`.
- **Per wave merge:** `pnpm test` (full vitest suite, incl. `serverSync`).
- **Phase gate:** `pnpm test` green + `pnpm build` green + additive publish + regenerate, then
  two-client playtest (PVP steal moves a shard to killer; PVE 0-shard death erodes transcend
  then a C-level; PVE shard drop collectible after 1.2s).

### Wave 0 Gaps
- [ ] `spacetimedb/src/deathPenalty.ts` — the pure helper under test.
- [ ] `src/game/data/__tests__/deathPenalty.test.ts` — cross-import unit test, all four
      branches + order + empty-victim credit (mirror `transcendInstall.test.ts` structure).
- **Honest limitation:** The codebase has **no in-process reducer harness with a mock DB**
  (server-logic tests are all pure cross-imports — see `serverWorldSim.test.ts`). Therefore
  "PVE death creates a `shard_drop` row, not a killer credit" and "PVP transfers exactly 1 to
  the killer" are verifiable at the **helper** level (shardsLost math) plus **code review** of
  the wiring + the **two-client playtest** — they are not unit-automatable without introducing
  a DB mock (out of scope for this phase; do not build one).

## Security Domain

`security_enforcement: true`, ASVS level 1.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `ctx.sender` is the only trusted identity; killer/grabber/victim all derive from it, never from args (CLAUDE.md rule 5). `requirePlayer(ctx)` in every reducer. |
| V4 Access Control | yes | `collectShard` acts on `ctx.sender`'s player; PVP steal credits `attacker = requirePlayer(ctx)`. No client-supplied identity is trusted. |
| V5 Input Validation | yes | `collectShard` takes only a `dropId` (u64); it no-ops if the drop is absent or still inside the grace period — no client-supplied amount. |
| V6 Cryptography | no | none introduced. |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| u32 underflow on `transcendShards -= loss` | Tampering | Decrement only inside the `transcendShards > 0` branch; `Math.max(0, …)` guard; branch order = safety (T-02-03 discipline). `[VERIFIED: transcendInstall.ts rationale]` |
| Minting shards from an empty victim (flat `+1` credit) | Elevation of Privilege / economy break | Credit `result.shardsLost` only (0 when eroded). Invariant #2. |
| Instant-pickup / vacuum race on a fresh shard drop | Tampering | Reuse `gemIsCollectible` + `GEM_PICKUP_DELAY_MICROS` server-side; server refuses early grabs regardless of client. `[VERIFIED: collectGem:1513]` |
| Client forging a shard gain | Spoofing | All shard mutation is server-side in reducers; the client only *requests* a collect and *renders* — it cannot write `transcendShards`. |
| Camp eating a scarce shard | Denial (of reward) | Exclude `shard_drop` from `vacuumGems`. |

## Sources

### Primary (HIGH confidence — verified in live source)
- `spacetimedb/src/index.ts` — `SHARD_DEATH_LOSS`:83, `player.transcendShards`:291,
  `gem_drop`:297-309, `ownedCharacter.constellation`:387 / `.transcendLevel`:392, schema:569,
  `findOwnedRow`:700, `respawnPlayerAtSpawn`:725, `spillDenominations`:746 / `spillGems`:785,
  `attackPlayer` kill:928-965, `takeDamage`:1081-1103, `fallToDeath`:1105, `transcendCharacter`:1009,
  `collectGem`:1505-1521, `setActivation`:1581 / `activatedConstellationFor`:1592-1600,
  `vacuumGems`:1907-1932, worldTick player-death loop:2303-2321.
- `spacetimedb/src/combatMath.ts` — `gemIsCollectible`:22.
- `spacetimedb/src/transcendInstall.ts` + `src/game/data/__tests__/transcendInstall.test.ts` —
  pure-helper + cross-import test pattern to replicate.
- `src/game/createGame.ts` — gem render/collect: `GEM_PICKUP_DELAY`:270, `createGemMesh`:610,
  `updateGemDrops`:628-661, `syncGemDrops`:937-966.
- `src/game/data/gemDrops.ts` — `gemVisual`/denominations (distinct-visual reference).
- `src/App.tsx` — subscribe list:73-90, `useTable(gemDrop)`:106, event-table toasts:157-174,
  network bridge:348, sync effect:372, `transcendShards` prop flow:474/498.
- `src/game/data/__tests__/serverSync.test.ts` — `SHARD_DEATH_LOSS` mirror:136.
- `src/game/data/__tests__/serverWorldSim.test.ts` — grace-period test:172-182 (server-logic
  test style precedent).
- `src/game/data/constants.ts` — `SHARD_DEATH_LOSS`:12 (client mirror).

### Secondary (project docs — authoritative spec)
- `.planning/transcendence/phase-3-shard-risk.md`, `PROGRESS.md` (shared contracts).
- `.planning/REQUIREMENTS.md` (REQ-shard-risk), `.planning/phases/02-*/02-LEARNINGS.md`.

### Tertiary (LOW confidence)
- none — all findings verified against source.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all machinery verified in source.
- Architecture (helper + table + reducer + wiring): HIGH — direct mirror of verified gem code.
- Pitfalls: HIGH — each tied to a specific verified line/behavior.
- Client toast/steal-feed: MEDIUM — no existing toast system; design freedom (no CONTEXT.md).
- `fallToDeath` scope: MEDIUM — genuine ambiguity flagged as open question.

**Research date:** 2026-07-07
**Valid until:** ~2026-08-06 (stable in-repo domain; re-verify line numbers if `index.ts`
changes materially before planning).
</content>
</invoke>
