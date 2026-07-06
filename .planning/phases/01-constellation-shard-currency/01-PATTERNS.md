# Phase 1: Constellation shard currency - Pattern Map

**Mapped:** 2026-07-06
**Files analyzed:** 8 (2 new, 6 modified; bindings regenerated mechanically)
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `spacetimedb/src/gachaOverflow.ts` **(new)** | utility (pure server helper) | transform | `spacetimedb/src/combatMath.ts` | exact |
| `src/game/data/__tests__/gachaOverflow.test.ts` **(new)** | test | transform | `src/game/data/__tests__/serverWorldSim.test.ts` (cross-import) + `transcendence.test.ts` (structure) | exact |
| `spacetimedb/src/index.ts` (table def, seed, grantCharacter, pullBanner, restore) | model + reducer | CRUD / event-driven | self (existing currency `gems` flow in the same file) | exact (in-file exemplar) |
| `scripts/snapshot.mjs` (keep-list) | config | batch (backup) | self (existing `gems`/`gems_from_kills` entries) | exact |
| `src/ui/GachaScreen.tsx` (wallet chip) | component | request-response (render) | self (`.gacha__wallet` gems render lines 218-229) | exact |
| `src/ui/CharacterScreen.tsx` (new prop + chip) | component | request-response (render) | `GachaScreen.tsx` wallet chip (cross-file) | role-match |
| `src/App.tsx` (prop wiring) | provider (prop plumbing) | request-response | self (`gems={myPlayer?.gems ?? 0}` lines 426/451) | exact |
| `src/module_bindings/player_table.ts` | binding (generated) | — | regenerated via `pnpm run spacetime:generate` | mechanical |

## Pattern Assignments

### `spacetimedb/src/gachaOverflow.ts` (new — utility, transform)

**Analog:** `spacetimedb/src/combatMath.ts` — dependency-free pure module, unit-testable under the client's vitest runner, imported by `index.ts` for real execution.

**Module shape to copy** (`combatMath.ts` lines 1-13): file-level comment stating the module is kept dependency-free for direct vitest import, then plain exported functions with no `ctx`/`db`/`import`:
```typescript
// Pure combat math shared by the world tick. Kept dependency-free so it can be
// unit-tested directly under the client's vitest runner.

export function damagePerTick(damagePerSecond: number, tickMicros: bigint): number {
  return damagePerSecond * (Number(tickMicros) / 1_000_000);
}
```

**Concrete implementation** (from RESEARCH.md, matches the `combatMath.ts` style — exported interface + pure function, no side effects):
```typescript
// spacetimedb/src/gachaOverflow.ts (new) — pure, deterministic, no ctx/db
export interface DupeGrantOutcome { constellation: number; shardMinted: number; }
export function resolveDupeGrant(
  currentConstellation: number,
  maxConstellation: number,
  shardPerOverflow: number,
): DupeGrantOutcome {
  if (currentConstellation < maxConstellation) {
    return { constellation: currentConstellation + 1, shardMinted: 0 };
  }
  return { constellation: maxConstellation, shardMinted: shardPerOverflow };
}
```

**Import wiring to add in `index.ts`** — follow the existing relative-import cluster (`index.ts` lines 3-20, e.g. `import { damagePerTick, ... } from './combatMath';`). Add: `import { resolveDupeGrant } from './gachaOverflow';`

---

### `src/game/data/__tests__/gachaOverflow.test.ts` (new — test, transform)

**Analog A (cross-import mechanism):** `src/game/data/__tests__/serverWorldSim.test.ts` — imports server `.ts` modules directly across the package boundary via a `../../../../spacetimedb/src/` relative path.

**Cross-import pattern** (`serverWorldSim.test.ts` lines 7, 25-43):
```typescript
import { describe, expect, it } from 'vitest';
// Server ports under test.
import { createSeededRandom as serverSeededRandom } from '../../../../spacetimedb/src/rng';
import {
  damagePerTick,
  distanceBetween,
  gemIsCollectible,
} from '../../../../spacetimedb/src/combatMath';
```
So the new test imports: `import { resolveDupeGrant } from '../../../../spacetimedb/src/gachaOverflow';`

**Analog B (test structure + constant use):** `src/game/data/__tests__/transcendence.test.ts` — imports the client mirror constant and asserts behaviour with `describe`/`it`. Use `SHARD_PER_OVERFLOW_DUPE` and `MAX_CONSTELLATION` from the client mirror to drive assertions (avoids re-hardcoding magic numbers).

**Structure to copy** (`transcendence.test.ts` lines 1-31):
```typescript
import { describe, expect, it } from 'vitest';
import { SHARD_PER_OVERFLOW_DUPE } from '../constants';

describe('transcendence tunables', () => {
  it('...', () => { expect(...).toBe(...); });
  it.each([0, 1, 2, 5, 10])('...(%i) === %i', n => { expect(...).toBe(n); });
});
```

**Required assertions** (from RESEARCH Test Map): sub-C6 dupe → `{ constellation: current+1, shardMinted: 0 }`; C6 dupe → `{ constellation: max, shardMinted: SHARD_PER_OVERFLOW_DUPE }`.

---

### `spacetimedb/src/index.ts` (modify — model + reducer, CRUD / event-driven)

This file is its own best exemplar: the new `transcendShards` currency mirrors the existing `gems` currency at every site. Five change points, all with a same-file `gems` pattern to copy.

**1. `player` table def — add column** (lines 267-288). Copy the `gems: t.u32()` line shape:
```typescript
gems: t.u32(),
currentHealth: t.u32(),
// ... add alongside the other u32 currency columns:
// transcendShards: t.u32(),
```

**2. `seedPlayer` insert — seed to 0** (lines 646-661). Every non-defaulted column must be present at insert (Pitfall 1). Mirror `gems: STARTING_GEMS` / `gemsFromKills: 0`:
```typescript
ctx.db.player.insert({
  identity, name, online: true,
  // ...
  gems: STARTING_GEMS,
  currentHealth: statsFor(STARTER_CHARACTER_ID).maxHealth,
  lastKillRewardAt: ctx.timestamp,
  gemsFromKills: 0,
  gemsCollected: 0,
  // transcendShards: 0,
});
```

**3. `grantCharacter` dupe branch — use the helper** (lines 1548-1571). Current C6-overflow returns `{ isNew: false, constellation: MAX_CONSTELLATION, maxed: true }`. Rework the owned branch to call `resolveDupeGrant` and return `shardMinted` instead of the `maxed` flag:
```typescript
// current owned branch (lines 1562-1570):
if (owned.constellation < MAX_CONSTELLATION) {
  const constellation = owned.constellation + 1;
  ctx.db.ownedCharacter.id.update({ ...owned, constellation });
  setActivation(ctx, owner, characterId, constellation);
  return { isNew: false, constellation, maxed: false };
}
return { isNew: false, constellation: MAX_CONSTELLATION, maxed: true };
```
New shape (per RESEARCH): call `resolveDupeGrant(owned.constellation, MAX_CONSTELLATION, SHARD_PER_OVERFLOW_DUPE)`, update `ownedCharacter`/`setActivation` only when `constellation` changed, return `{ isNew: false, constellation, shardMinted }`.

**4. `pullBanner` accumulator + wallet write** (two call sites lines 1634-1637 & 1650-1653; accumulator init line 1612; final update lines 1684-1687). Replace the `refund` accumulator with `shardsMinted`:
```typescript
let refund = 0;                              // line 1612 → let shardsMinted = 0;
// ... both call sites:
const result = grantCharacter(ctx, currentPlayer.identity, itemId);
isNew = result.isNew;
constellation = result.constellation;
if (result.maxed) refund += DUPLICATE_REFUND;   // → shardsMinted += result.shardMinted;
// ... final wallet write (lines 1684-1687):
ctx.db.player.identity.update({
  ...currentPlayer,
  gems: currentPlayer.gems - totalCost + refund,   // → drop `+ refund`
  // transcendShards: currentPlayer.transcendShards + shardsMinted,
});
```

**5. `RestorePlayerRow` object + `restorePlayers`** (lines 1374-1387, 1415-1423). Add `transcendShards: t.u32()` to the object mirror; `restorePlayers` insert (`{ ...row, online: false, ... }`, line 1420) carries it automatically:
```typescript
const RestorePlayerRow = t.object('RestorePlayerRow', {
  // ...
  gems: t.u32(),
  gemsFromKills: t.u32(),
  gemsCollected: t.u32(),
  // transcendShards: t.u32(),
});
```

**6. Delete `DUPLICATE_REFUND`** (line 73). The `SHARD_PER_OVERFLOW_DUPE = 1` constant already exists (line 81) — do NOT redeclare. Removing `DUPLICATE_REFUND` and the `refund` variable is required (Anti-pattern: no dangling 800-gem path).

---

### `scripts/snapshot.mjs` (modify — config, batch)

**Analog:** the same `player` `keep` array (lines 14-27) — snake_case column names. Add `'transcend_shards'` next to `'gems'`:
```javascript
keep: [
  'identity', 'name', 'position_x', 'position_y', 'position_z',
  'rotation_y', 'active_character_id', 'party_order',
  'gems', 'current_health', 'gems_from_kills', 'gems_collected',
  // 'transcend_shards',
],
```
Note snake_case here (`transcend_shards`) vs camelCase in the TS module (`transcendShards`) — the HTTP/SQL layer uses column names.

---

### `src/ui/GachaScreen.tsx` (modify — component, render)

**Analog:** the existing `.gacha__wallet` block in the same file (lines 218-229) and the prop declaration (lines 38-84).

**Prop pattern** — add `transcendShards: number` to `GachaScreenProps` (lines 38-57) and destructure it (lines 67-84), mirroring `gems`:
```typescript
interface GachaScreenProps {
  gems: number;
  // transcendShards: number;
  // ...
}
export function GachaScreen({ gems, /* transcendShards, */ ... }: GachaScreenProps) {
```

**Wallet render** (lines 218-229) — per UI-SPEC, render the shard chip inside `.gacha__wallet` immediately to the LEFT of the existing readout, on every tab, `◈` glyph, 12px gap. Copy the `gacha__gem` span pattern:
```tsx
<div className="gacha__wallet">
  {/* shard chip always shown, left of the swapping readout */}
  <span className="gacha__gem">◈</span> {transcendShards}
  {tab === 'characters' ? (
    <><span className="gacha__gem">❖</span> {[...ownedCharacterIds].length}/{CHARACTER_LIST.length}</>
  ) : (
    <><span className="gacha__gem">✦</span> {gems}</>
  )}
</div>
```
(Add the 12px gap + `aria-label="Zvaigžņu šķembas: {n}"` per UI-SPEC; see Shared Patterns → Wallet chip styling.)

---

### `src/ui/CharacterScreen.tsx` (modify — component, render)

**Analog:** `GachaScreen.tsx` wallet chip (cross-file) for the visual; the local `CharacterScreenProps` (lines 15-30) and destructure (lines 54-64) for the prop.

**Prop pattern** — this screen has no currency prop today. Add `transcendShards: number` to `CharacterScreenProps` and destructure it:
```typescript
interface CharacterScreenProps {
  characterId: string;
  // transcendShards: number;
  // ...
}
export function CharacterScreen({ characterId, /* transcendShards, */ ... }: CharacterScreenProps) {
```

**Chip placement** (`.cscreen__topbar`, lines 128-170) — per UI-SPEC, right-aligned, BEFORE the `.cscreen__close` button (line 167-169), pinned outside the roster scroll region. Same glyph/color/size as the gacha instance:
```tsx
<header className="cscreen__topbar">
  <h2 className="cscreen__title">VAROŅI</h2>
  <nav className="cscreen__roster drag-scroll" /* ... */>...</nav>
  {/* new shard chip here, before close */}
  <span className="gacha__wallet" aria-label="Zvaigžņu šķembas: ...">
    <span className="gacha__gem">◈</span> {transcendShards}
  </span>
  <button className="cscreen__close" onClick={onClose} aria-label="Aizvērt">✕</button>
</header>
```

---

### `src/App.tsx` (modify — provider, prop plumbing)

**Analog:** the existing `gems={myPlayer?.gems ?? 0}` prop passed to `GachaScreen` (line 451) and to `Hud` (line 426).

**Wiring** — after bindings regen, `myPlayer.transcendShards` resolves. Add to both screen instantiations:
```tsx
// GachaScreen (line 450-451):
<GachaScreen gems={myPlayer?.gems ?? 0} transcendShards={myPlayer?.transcendShards ?? 0} ... />
// CharacterScreen (lines 472-478 — currently no currency prop):
<CharacterScreen characterId={characterPageId} transcendShards={myPlayer?.transcendShards ?? 0} ... />
```

---

### `src/module_bindings/player_table.ts` (regenerated — binding)

Auto-generated (header: "EDITS TO THIS FILE WILL NOT BE SAVED"). Currently lists `gems`/`gemsFromKills`/`gemsCollected` as `__t.u32()` (lines 23-27) but NOT `transcendShards`. Do NOT hand-edit — run `pnpm run spacetime:generate` AFTER publishing the schema change so `transcendShards: __t.u32().name("transcend_shards")` is added.

## Shared Patterns

### Additive currency column (four mirror sites, always together)
**Source:** the existing `gems` / `gemsCollected` columns across `spacetimedb/src/index.ts` + `scripts/snapshot.mjs`.
**Apply to:** the `transcendShards` addition. All four sites must change in one wave or the module fails to `insert` (STDB requires every non-defaulted column):
1. Table def (`index.ts` 267-288) — `t.u32()`.
2. Seed insert (`index.ts` 646-661) — `transcendShards: 0`.
3. Restore object (`index.ts` 1374-1387) — `t.u32()` (restore insert `{ ...row }` carries it).
4. Snapshot keep-list (`snapshot.mjs` 14-27) — `'transcend_shards'` (snake_case).

### Pure server helper cross-imported by client test
**Source:** `spacetimedb/src/combatMath.ts` (module) + `src/game/data/__tests__/serverWorldSim.test.ts` (lines 25-43, cross-import).
**Apply to:** `gachaOverflow.ts` + its test. Helper is `ctx`/`db`-free pure arithmetic (keeps the reducer deterministic per CLAUDE.md rule 2); `index.ts` imports `./gachaOverflow`, the test imports `../../../../spacetimedb/src/gachaOverflow`.

### Server↔client constant mirror (INV-5)
**Source:** `src/game/data/constants.ts` (line 11 `SHARD_PER_OVERFLOW_DUPE = 1`) mirrored from `index.ts` line 81; guarded by `serverSync.test.ts`.
**Apply to:** Phase 1 adds NO new constant — it consumes existing Phase 0 constants. Deleting `DUPLICATE_REFUND` (server-only, no client mirror) does not touch the mirror set. Run `pnpm vitest run src/game/data/__tests__/serverSync.test.ts` to confirm no regression.

### Wallet chip styling
**Source:** `src/index.css` `.gacha__wallet` (lines 1090-1095): `font-size: 15px; color: var(--gold); letter-spacing: 0.04em;` and the `.gacha__gem` glyph span.
**Apply to:** both shard chips. UI-SPEC locks glyph `◈` (U+25C8), `--gold` `#f2c14e`, 15px, `letter-spacing: 0.04em`, `aria-label="Zvaigžņu šķembas: {n}"`, always visible (renders `0`). Preferred DRY: extract a shared `.wallet-chip` class both gems and shard readouts consume (non-blocking; screen-local copy of the `.gacha__wallet` values is an acceptable alternative).

### Read-through render from subscribed player row
**Source:** `src/App.tsx` `gems={myPlayer?.gems ?? 0}` (lines 426, 451); `myPlayer` derived from `useTable(tables.player)`.
**Apply to:** `transcendShards={myPlayer?.transcendShards ?? 0}`. Client never computes or mutates the value (Anti-pattern: no client-side balance). The `?? 0` guard also covers the pre-regen/undefined window.

## No Analog Found

None. Every change site has a working in-repo exemplar (same-file `gems` currency, `combatMath.ts` pure helper, `serverWorldSim.test.ts` cross-import, `.gacha__wallet` chip). No file needs to fall back to RESEARCH.md abstractions.

## Metadata

**Analog search scope:** `spacetimedb/src/` (server module + pure helpers), `src/game/data/__tests__/` (vitest), `src/ui/` (React HUD), `src/App.tsx` (prop plumbing), `scripts/` (backup), `src/module_bindings/` (generated), `src/index.css` (chip styling).
**Files scanned:** 10 (index.ts targeted sections, combatMath.ts, serverWorldSim.test.ts, transcendence.test.ts, snapshot.mjs, GachaScreen.tsx, CharacterScreen.tsx, App.tsx, player_table.ts, index.css).
**Pattern extraction date:** 2026-07-06
