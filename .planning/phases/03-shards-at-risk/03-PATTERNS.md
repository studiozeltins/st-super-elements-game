# Phase 3: Shards at risk (death loss, PVP steal, erosion) - Pattern Map

**Mapped:** 2026-07-07
**Files analyzed:** 5 (2 create, 3 modify)
**Analogs found:** 5 / 5

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `spacetimedb/src/deathPenalty.ts` (CREATE) | utility (pure helper) | transform | `spacetimedb/src/transcendInstall.ts` | exact |
| `src/game/data/__tests__/deathPenalty.test.ts` (CREATE) | test | transform | `src/game/data/__tests__/transcendInstall.test.ts` | exact |
| `spacetimedb/src/index.ts` (MODIFY) | model + reducer | event-driven / CRUD | `gem_drop` table / `spillGems` / `collectGem` / death paths (same file) | exact (in-file mirror) |
| `src/game/createGame.ts` (MODIFY) | component (Three.js renderer) | streaming (sync loop) | `createGemMesh` / `updateGemDrops` / `syncGemDrops` (same file) | exact (in-file mirror) |
| `src/App.tsx` (MODIFY) | provider/store (React) | pub-sub (subscription) | `gemDrop` subscribe + `pvpHit`/`healEvent` toasts (same file) | exact (in-file mirror) |

**Note:** This is a mirror-heavy phase — 3 of 5 files copy patterns from *elsewhere in the same file*. The gem-drop machinery is the template for the shard-drop machinery throughout.

---

## Pattern Assignments

### `spacetimedb/src/deathPenalty.ts` (utility, pure transform) — CREATE

**Analog:** `spacetimedb/src/transcendInstall.ts` (entire file, 35 lines — read in full)

**Header-comment + dependency-free discipline** (transcendInstall.ts:1-11):
```typescript
// Pure transcend-install decision, kept dependency-free so it can be unit-tested
// directly under the client's vitest runner (same pattern as gachaOverflow.ts). No
// ctx/db/import, no random, no time — this preserves the calling reducer's determinism
// (CLAUDE.md rule 2) ...
//
// Branch ORDER is load-bearing (mitigates T-02-03): the insufficient_shards check is the
// LAST gate ... so the reducer can never subtract below cost (u32 underflow).
```

**Result-type + priority-gate pattern to mirror** (transcendInstall.ts:13-34):
```typescript
export type TranscendInstall =
  | { ok: true; nextLevel: number; shardCost: number }
  | { ok: false; reason: 'below_c6' | 'at_cap' | 'insufficient_shards' };

export function resolveTranscendInstall(
  constellation: number,
  maxConstellation: number,
  currentTranscend: number,
  maxTranscend: number,
  shards: number,
  cost: (n: number) => number
): TranscendInstall {
  if (constellation < maxConstellation) return { ok: false, reason: 'below_c6' };
  if (currentTranscend >= maxTranscend) return { ok: false, reason: 'at_cap' };
  const nextLevel = currentTranscend + 1;
  const shardCost = cost(nextLevel);
  if (shards < shardCost) return { ok: false, reason: 'insufficient_shards' };
  return { ok: true, nextLevel, shardCost };
}
```

**Target shape** (from RESEARCH.md Pattern 1 — a flat result object, NOT a discriminated union, because every branch produces `next*` values the reducer applies): interface `DeathShardPenalty { shardsLost, erodedTranscend, erodedConstellation, nextShards, nextTranscendLevel, nextConstellation }` and `applyDeathShardPenalty(transcendShards, transcendLevel, constellation, loss)`. Branch order = safety: `transcendShards > 0` → `transcendLevel > 0` → `constellation > 0` → nothing. Only decrement inside the branch that proved `> 0`; use `Math.max(0, transcendShards - loss)` on the shards branch.

**Key adaptation from analog:** transcendInstall returns a discriminated union (`ok: true|false`); deathPenalty always "succeeds" (a death always resolves to *some* loss or a no-op), so it returns a single flat interface. Keep the same purity constraint (no imports, no ctx) and the same load-bearing-order comment.

---

### `src/game/data/__tests__/deathPenalty.test.ts` (test, transform) — CREATE

**Analog:** `src/game/data/__tests__/transcendInstall.test.ts` (entire file, 72 lines — read in full)

**Cross-package-boundary import + shared-mirror-constant pattern** (transcendInstall.test.ts:1-11):
```typescript
import { describe, expect, it } from 'vitest';

// Import the real helper across the package boundary (server module → client vitest
// runner), same mechanism as gachaOverflow.test.ts — not a local re-implementation.
import { resolveTranscendInstall } from '../../../../spacetimedb/src/transcendInstall';
import { MAX_TRANSCEND_LEVEL, TRANSCEND_SHARD_COST } from '../constants';
```
→ For the new test: `import { applyDeathShardPenalty } from '../../../../spacetimedb/src/deathPenalty';` and `import { SHARD_DEATH_LOSS } from '../constants';` (the client mirror already exists — `constants.ts:12`, asserted in `serverSync.test.ts:136`).

**Branch/boundary describe-block structure to mirror** (transcendInstall.test.ts:13-62): one top `describe`, `.toEqual({...})` on the whole result object, plus nested `describe` blocks for boundaries. The four required branches (from RESEARCH Test Map, lines 448-453): has-shards (`shardsLost=1`, no erosion), only-transcend (`erodedTranscend`, `transcendLevel-1`, `shardsLost=0`), only-constellation (`erodedConstellation` C6→C5, `shardsLost=0`), nothing (all false, no negatives). Plus an ORDER test (shards present ⇒ never erodes) and an empty-victim PVP-credit test (`shardsLost === 0`).

**Parametrized-case idiom available** (transcendInstall.test.ts:64): `it.each([...])('...%i...', n => {...})` — use for the branch table if desired.

---

### `spacetimedb/src/index.ts` (model + reducer, event-driven/CRUD) — MODIFY

**Analog:** in-file gem machinery. Six concrete edits, each mirroring a verified location.

**Edit 1 — `shard_drop` table** (mirror `gem_drop` at index.ts:297-309):
```typescript
const gemDrop = table(
  { name: 'gem_drop', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    positionX: t.f32(),
    positionZ: t.f32(),
    amount: t.u32(),
    droppedBy: t.identity(),
    // .default(0n) makes adding this column an additive migration ...
    droppedAtMicros: t.u64().default(0n),
  }
);
```
→ Define `const shardDrop = table({ name: 'shard_drop', public: true }, { ...identical columns... })`. Keep `droppedAtMicros: t.u64().default(0n)` for the grace check + additive migration.

**Edit 2 — register in schema** (index.ts:565-579): add `shardDrop,` to the `schema({ ... })` object alongside `gemDrop,` (line 569). Accessor becomes `ctx.db.shardDrop`.

**Edit 3 — `spillShards` helper** (mirror the insert body of `spillDenominations` at index.ts:769-780, but single-piece — do NOT denominate). Reference `spillGems` (index.ts:785-795) for the fraction/return shape:
```typescript
// spillDenominations insert body (index.ts:769-780) — the shape to copy per-piece:
    const angle = ctx.random() * Math.PI * 2;
    const radius = ctx.random() * GEM_SPILL_SCATTER;
    ctx.db.gemDrop.insert({
      id: 0n,
      positionX: clampToWorld(centerX + Math.cos(angle) * radius),
      positionZ: clampToWorld(centerZ + Math.sin(angle) * radius),
      amount,
      droppedBy,
      droppedAtMicros: ctx.timestamp.microsSinceUnixEpoch,
    });
```
→ `spillShards(ctx, positionX, positionZ, amount, droppedBy)` inserts ONE `ctx.db.shardDrop` row (`amount = SHARD_DEATH_LOSS`), reusing `GEM_SPILL_SCATTER`, `clampToWorld`, `ctx.random()`, `ctx.timestamp.microsSinceUnixEpoch`. Guard `if (amount <= 0) return;`.

**Edit 4 — `collectShard` reducer** (mirror `collectGem` at index.ts:1505-1521):
```typescript
export const collectGem = spacetimedb.reducer(
  { dropId: t.u64() },
  (ctx, { dropId }) => {
    const currentPlayer = requirePlayer(ctx);
    const drop = ctx.db.gemDrop.id.find(dropId);
    if (!drop) return;
    if (!gemIsCollectible(drop.droppedAtMicros, ctx.timestamp.microsSinceUnixEpoch, GEM_PICKUP_DELAY_MICROS)) return;
    ctx.db.gemDrop.id.delete(dropId);
    ctx.db.player.identity.update({
      ...currentPlayer,
      gems: currentPlayer.gems + drop.amount,
      gemsCollected: currentPlayer.gemsCollected + drop.amount,
    });
  }
);
```
→ `collectShard`: same skeleton, `ctx.db.shardDrop.id.find/delete`, REUSE the generic `gemIsCollectible(...)` + `GEM_PICKUP_DELAY_MICROS` (do NOT fork), credit `transcendShards: currentPlayer.transcendShards + drop.amount`.

**Edit 5a — wire `takeDamage` PVE death** (index.ts:1099-1101):
```typescript
    // Died to an enemy: drop a quarter of your gems where you fell.
    const spilled = spillGems(ctx, currentPlayer, PVE_DEATH_SPILL, currentPlayer.identity);
    respawnPlayerAtSpawn(ctx, { ...currentPlayer, gems: currentPlayer.gems - spilled });
```
→ KEEP the `spillGems`. Resolve `const activeOwned = findOwnedRow(ctx, currentPlayer, currentPlayer.activeCharacterId);` (helper at index.ts:700-704), call `applyDeathShardPenalty(currentPlayer.transcendShards, activeOwned.transcendLevel, activeOwned.constellation, SHARD_DEATH_LOSS)`, write victim `next*` (player row `transcendShards: result.nextShards`; owned row via `ctx.db.ownedCharacter.id.update({ ...activeOwned, transcendLevel, constellation })` when eroded), and if `result.shardsLost > 0` call `spillShards(...)` at the victim's position.

**Edit 5b — wire worldTick PVE death loop** (index.ts:2319-2320): identical treatment on `targetPlayer`:
```typescript
      const spilled = spillGems(ctx, targetPlayer, PVE_DEATH_SPILL, ctx.sender);
      respawnPlayerAtSpawn(ctx, { ...targetPlayer, gems: targetPlayer.gems - spilled });
```

**Edit 5c — wire `attackPlayer` PVP kill** (index.ts:954-963) — **highest-risk edit**:
```typescript
    const stolen = spillGems(ctx, target, PVP_DEATH_SPILL, attacker.identity);
    if (stolen > 0) {
      ctx.db.player.identity.update({
        ...attacker,
        gemsFromKills: attacker.gemsFromKills + stolen,
      });
    }
    respawnPlayerAtSpawn(ctx, { ...target, gems: target.gems - stolen });
```
→ KEEP the gem spill/credit. Compute the penalty on the VICTIM (`target`), write victim `next*` (add `transcendShards: result.nextShards` to the `respawnPlayerAtSpawn` spread; erode owned row when flagged), and credit the killer `attacker.transcendShards += result.shardsLost` (NOT a hardcoded `+1` — 0 on a 0-shard victim; see Pitfall 1). No ground drop on PVP.

**Edit 6 — do NOT touch `vacuumGems`** (index.ts:1907-1932): it iterates `ctx.db.gemDrop.iter()` only. Leave it iterating gems exclusively — shards must NOT be vacuumable by camps (anti-pattern, RESEARCH lines 261-264).

**Supporting facts (verified):**
- `SHARD_DEATH_LOSS = 1` already defined at index.ts:83 (client mirror `constants.ts:12`). No new constant.
- `ownedCharacter.constellation` at index.ts:387, `.transcendLevel` (`.default(0)`) at index.ts:392.
- `player.transcendShards` (`.default(0)`) at index.ts:291.
- `findOwnedRow` at index.ts:700-704; `respawnPlayerAtSpawn` at index.ts:725-740.

---

### `src/game/createGame.ts` (component/renderer, streaming) — MODIFY

**Analog:** in-file gem renderer (`createGemMesh`:610-626, `updateGemDrops`:628-661, `syncGemDrops`:937-966).

**Mesh-creation pattern** (createGame.ts:610-626):
```typescript
  function createGemMesh(drop: GemDrop): { mesh: THREE.Mesh; baseY: number } {
    const visual = gemVisual(drop.amount);
    const material = new THREE.MeshLambertMaterial({
      color: visual.color,
      emissive: visual.color,
      emissiveIntensity: GEM_EMISSIVE_INTENSITY,
    });
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(GEM_RADIUS), material);
    const baseY = world.getGroundHeight(drop.positionX, drop.positionZ) + 0.9;
    mesh.position.set(drop.positionX, baseY, drop.positionZ);
    scene.add(mesh);
    effectSystem.spawnBurst(mesh.position.clone(), visual.sparkle ? visual.color : 0xffe08a, 10);
    return { mesh, baseY };
  }
```
→ `createShardMesh`: same structure with a DISTINCT visual (RESEARCH suggests violet/◈ crystal — Claude's discretion, no CONTEXT.md). A fixed shard color/geometry is fine since `amount` is always 1 (no denomination tiers).

**Magnet + collect-request loop** (createGame.ts:628-661) — reuse `GEM_PICKUP_DELAY`, `GEM_MAGNET_RADIUS`, `GEM_COLLECT_RADIUS`:
```typescript
      if (gem.age < GEM_PICKUP_DELAY) continue;
      ...
      if (playerDistance < GEM_MAGNET_RADIUS && playerDistance > 0.001) {
        const pull = Math.min(1, deltaSeconds * (3 + (GEM_MAGNET_RADIUS - playerDistance)));
        gem.mesh.position.x += playerDx * pull;
        gem.mesh.position.z += playerDz * pull;
      }
      if (playerDistance <= GEM_COLLECT_RADIUS && !requestedGemPickups.has(key)) {
        requestedGemPickups.add(key);
        network.sendCollectGem(gem.rawId);
      }
```
→ `updateShardDrops`: identical, with a `requestedShardPickups` Set and `network.sendCollectShard(shard.rawId)`.

**Sync/dedupe/dispose pattern** (createGame.ts:937-966):
```typescript
    syncGemDrops(drops) {
      const seen = new Set<string>();
      for (const drop of drops) {
        const key = drop.id.toString();
        seen.add(key);
        if (!gemDrops.has(key)) {
          const { mesh, baseY } = createGemMesh(drop);
          gemDrops.set(key, { mesh, rawId: drop.id, age: 0, baseY, ... });
        }
      }
      for (const [key, gem] of gemDrops) {
        if (seen.has(key)) continue;
        scene.remove(gem.mesh);
        gem.mesh.traverse(object => { ...dispose geometry+material... });
        gemDrops.delete(key);
        requestedGemPickups.delete(key);
      }
    },
```
→ `syncShardDrops`: same add/remove/dispose reconciliation against a `shardDrops` Map. Wire `updateShardDrops(deltaSeconds)` into the same animation frame that calls `updateGemDrops`.

---

### `src/App.tsx` (provider/store, pub-sub) — MODIFY

**Analog:** in-file `gemDrop` subscribe/useTable/sync + `pvpHit`/`healEvent` toasts.

**Subscribe list** (App.tsx:75-91): add `tables.shardDrop,` next to `tables.gemDrop,` (line 88).

**useTable reactive read** (App.tsx:106):
```typescript
  const [gemDropRows] = useTable(tables.gemDrop);
```
→ add `const [shardDropRows] = useTable(tables.shardDrop);`

**Sync effect** (App.tsx:371-373):
```typescript
  useEffect(() => {
    gameRef.current?.syncGemDrops(gemDropRows);
  }, [gemDropRows]);
```
→ add a sibling effect calling `gameRef.current?.syncShardDrops(shardDropRows)` on `[shardDropRows]`.

**Network bridge** (App.tsx:348):
```typescript
        sendCollectGem: dropId => connection.reducers.collectGem({ dropId }),
```
→ add `sendCollectShard: dropId => connection.reducers.collectShard({ dropId }),` (also add to the `NetworkBridge` type/interface wherever `sendCollectGem` is declared).

**Toast driver — diff pattern (NEW, no existing toast system; design freedom):** The `pvpHit`/`healEvent` event-table `onInsert` toasts (App.tsx:157-174) are the *event* template if a broadcast steal-feed is wanted; for the minimal self-facing toast, RESEARCH recommends a `useRef(prev transcendShards)` + `useEffect` diff on `myPlayer.transcendShards` (already reactive via `useTable(player)`): DOWN → "You lost a Constellation Shard", UP → "Stole a Constellation Shard!". The `◈` counter updates automatically. See Open Questions in RESEARCH (broadcast feed = optional stretch behind a new `shard_steal` event table mirroring `pvpHit`).

**pvpHit event-toast template** (App.tsx:157-167) — for the optional broadcast steal-feed only:
```typescript
  useTable(tables.pvpHit, {
    onInsert: row => {
      const targetHex = row.target.toHexString();
      if (targetHex === myIdentityRef.current) {
        gameRef.current?.spawnSelfNumber(row.amount, 'pvp');
      } else {
        gameRef.current?.flashRemoteHealth(targetHex);
      }
    },
  });
```

---

## Shared Patterns

### Purity / determinism (pure helper)
**Source:** `spacetimedb/src/transcendInstall.ts:1-11`
**Apply to:** `deathPenalty.ts` — no `ctx`/DB/import/random/time; branch order is the u32-underflow safety property; document it in a header comment.

### Cross-boundary vitest import
**Source:** `src/game/data/__tests__/transcendInstall.test.ts:5` (`../../../../spacetimedb/src/...`)
**Apply to:** `deathPenalty.test.ts` — import the server helper directly; consume the client `constants.ts` mirror (`SHARD_DEATH_LOSS`), never re-hardcode.

### Anti-cheat pickup grace (reuse, do not fork)
**Source:** `spacetimedb/src/index.ts:1513` — `gemIsCollectible(drop.droppedAtMicros, now, GEM_PICKUP_DELAY_MICROS)` (definition `combatMath.ts:22`)
**Apply to:** `collectShard` reducer. Same 1.2s grace; `droppedAtMicros = ctx.timestamp.microsSinceUnixEpoch` on spill.

### `ctx.sender`-only authority (CLAUDE.md rule 5)
**Source:** `requirePlayer(ctx)` used in every reducer (e.g. `collectGem`:1508, `attackPlayer`:931)
**Apply to:** `collectShard` (grabber = `requirePlayer(ctx)`), PVP credit (killer = `attacker = requirePlayer(ctx)`), victim penalty (target from row lookup, never client arg). No client-supplied amount or identity is trusted.

### Additive-migration column defaults
**Source:** `t.u64().default(0n)` (gem_drop `droppedAtMicros`, index.ts:307) and `t.u32().default(0)` (transcendLevel:392, transcendShards:291)
**Apply to:** `shard_drop.droppedAtMicros: t.u64().default(0n)`. Whole `shard_drop` is a NEW table → inherently additive; publish with NO `-c` / `--delete-data`.

### Deterministic scatter/placement
**Source:** `spillDenominations` insert body (index.ts:769-780) — `GEM_SPILL_SCATTER`, `clampToWorld`, `ctx.random()`
**Apply to:** `spillShards` single-piece insert.

---

## No Analog Found

None. Every file has a strong in-repo analog. The ONE genuinely new UI element — the shard lost/stolen **toast** — has no existing toast system; RESEARCH grants design freedom (no CONTEXT.md) and provides two documented approaches (diff-driven self toast = minimal; `shard_steal` event table mirroring `pvpHit` = optional broadcast feed). This is a design choice for the planner, not a missing pattern.

## Metadata

**Analog search scope:** `spacetimedb/src/` (server module), `src/game/`, `src/game/data/__tests__/`, `src/App.tsx`
**Files scanned:** transcendInstall.ts, transcendInstall.test.ts, index.ts (targeted ranges: 80-85, 290-309, 380-394, 560-579, 690-810, 925-965, 1075-1115, 1500-1521, 1905-1932, 2298-2326), createGame.ts (605-674, 930-972), App.tsx (70-109, 150-178, 340-379)
**Pattern extraction date:** 2026-07-07
