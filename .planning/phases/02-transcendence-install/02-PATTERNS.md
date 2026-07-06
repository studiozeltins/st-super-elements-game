# Phase 2: Transcendence install - Pattern Map

**Mapped:** 2026-07-06
**Files analyzed:** 9 (2 create, 5 modify, 2 test-create; +1 test-modify)
**Analogs found:** 9 / 9 (every file has a proven in-repo copy-shape)

> This phase is ~90% reuse. Every new artifact is a structural clone of a shipped file.
> Excerpts below are `[VERIFIED: file:line]` from a live read this session. Copy the SHAPE,
> swap constellation→transcend semantics.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `spacetimedb/src/transcendInstall.ts` (NEW) | utility (pure decision helper) | transform / pure | `spacetimedb/src/gachaOverflow.ts` | exact |
| `src/game/combat/transcendScaling.ts` (NEW) | utility (pure combat math) | transform / pure | `src/game/combat/comboSystem.ts` | exact |
| `spacetimedb/src/index.ts` — `owned_character` column | model (STDB table) | CRUD / persist | `player.transcendShards` col (index.ts:287-290) | exact |
| `spacetimedb/src/index.ts` — `transcendCharacter` reducer | reducer (currency-deduct + owned-row mutate) | request-response / transactional | `pullBanner` (deduct) + `setConstellation` (owned lookup) | role-match (hybrid) |
| `spacetimedb/src/index.ts` — `healParty` extend | reducer (server heal scaling) | transform | `healParty` itself (index.ts:1505-1508) | in-place |
| `src/game/createGame.ts` — multiplier + setter | service (game loop) | event-driven / render | `setActiveConstellation` setter + local multiplier (391-393) | exact |
| `src/App.tsx` — bridge (build map + effect + prop + reducer cb) | provider (React→game bridge) | event-driven | `constellationById` build + scaling effect + `setConstellation` cb | exact |
| `src/ui/CharacterScreen.tsx` — Install control + `T{n}` badge | component (React UI) | request-response | `.con-item` button (343-361) + shard chip (171-173) | exact |
| `src/game/data/__tests__/transcendInstall.test.ts` (NEW) | test (cross-boundary unit) | — | `gachaOverflow.test.ts` | exact |
| `src/game/combat/__tests__/transcendScaling.test.ts` (NEW) | test (pure math unit) | — | `comboSystem.test.ts` | exact |
| `src/game/data/__tests__/serverSync.test.ts` (MODIFY) | test (sync guard) | — | already asserts transcend constants (132-137) | in-place / stay-green |

---

## Pattern Assignments

### `spacetimedb/src/transcendInstall.ts` (NEW — utility, pure)

**Analog:** `spacetimedb/src/gachaOverflow.ts` (whole file, 24 lines)

**Copy-shape** — dependency-free module: a doc header rationalizing determinism/server-authority, an exported result interface/union, one pure exported function. No `ctx`, no `import`, no random, no time.

**Header + export shape** (gachaOverflow.ts:1-24):
```typescript
// Pure ... decision, kept dependency-free so it can be unit-tested directly
// under the client's vitest runner ... No ctx/db/import, no random, no time — this
// preserves the calling reducer's determinism (CLAUDE.md rule 2) and keeps the
// amount server-authoritative (mitigates T-1-01 ...).
export interface DupeGrantOutcome { constellation: number; shardMinted: number; }
export function resolveDupeGrant(
  currentConstellation: number, maxConstellation: number, shardPerOverflow: number
): DupeGrantOutcome {
  if (currentConstellation < maxConstellation) return { constellation: currentConstellation + 1, shardMinted: 0 };
  return { constellation: maxConstellation, shardMinted: shardPerOverflow };
}
```

**Phase 2 target signature** (from RESEARCH.md Pattern 3 — the locked shape):
```typescript
export type TranscendInstall =
  | { ok: true; nextLevel: number; shardCost: number }
  | { ok: false; reason: 'below_c6' | 'at_cap' | 'insufficient_shards' };

export function resolveTranscendInstall(
  constellation: number, maxConstellation: number,
  currentTranscend: number, maxTranscend: number,
  shards: number, cost: (n: number) => number
): TranscendInstall {
  if (constellation < maxConstellation) return { ok: false, reason: 'below_c6' };
  if (currentTranscend >= maxTranscend) return { ok: false, reason: 'at_cap' };
  const nextLevel = currentTranscend + 1;
  const shardCost = cost(nextLevel);
  if (shards < shardCost) return { ok: false, reason: 'insufficient_shards' };
  return { ok: true, nextLevel, shardCost };
}
```
Order matters: below_c6 → at_cap → insufficient_shards (the shard check must be LAST, gating the deduct — Pitfall 4, u32 underflow).

---

### `src/game/combat/transcendScaling.ts` (NEW — utility, pure)

**Analog:** `src/game/combat/comboSystem.ts`

**Imports pattern** — pure combat modules import ONLY sibling data constants, never three.js/DB (comboSystem.ts has zero imports; damageKind.ts similar). This module needs the two step constants:
```typescript
import { CONSTELLATION_DAMAGE_STEP } from '../data/constellations'; // 0.08 [VERIFIED :6]
import { TRANSCEND_DAMAGE_STEP } from '../data/constants';          // 0.05 [VERIFIED :9]
```

**Core pattern** — small pure exported fns with a JSDoc line, exactly like `regularAttackMultiplier`/`skillAttackMultiplier` (comboSystem.ts:22-32):
```typescript
/** Regular attacks get a small, capped boost from the combo. */
export function regularAttackMultiplier(combo: number): number {
  return 1 + Math.min(REGULAR_RAMP_CAP, Math.max(0, combo) * REGULAR_RAMP_PER_COMBO);
}
```

**Phase 2 target:**
```typescript
/** Active-character damage multiplier: constellation stars + transcend levels. */
export function transcendDamageMultiplier(constellation: number, transcend: number): number {
  return 1 + constellation * CONSTELLATION_DAMAGE_STEP + transcend * TRANSCEND_DAMAGE_STEP;
}
```
Note: this SUBSUMES the local `constellationDamageMultiplier` in createGame.ts:393 (which hardcodes 0.08). After extraction, createGame calls this fn instead.

---

### `spacetimedb/src/index.ts` — `owned_character` column (model, additive)

**Analog:** `player.transcendShards` additive column (index.ts:287-290) — VERIFIED

```typescript
// Durable transcendence currency ... .default(0) lets the additive migrate backfill
// existing player rows to 0 ... without a data wipe — SpacetimeDB refuses to add a
// non-defaulted column to a populated table.
transcendShards: t.u32().default(0),
```

**Target** — append to `owned_character` (index.ts:375-388, currently ends at `constellation: t.u32()`):
```typescript
constellation: t.u32(),
transcendLevel: t.u32().default(0),   // NEW — levels past C6, capped at MAX_TRANSCEND_LEVEL
```
`.default(0)` is load-bearing (additive migrate, no `-c`). APPEND, do not insert mid-table (STDB rejects mid-table insert on a live DB — see goliath cols 360-372).

---

### `spacetimedb/src/index.ts` — `transcendCharacter` reducer (reducer, transactional)

**Analog (structure):** `setConstellation` (index.ts:986-994) — owner lookup + reject shape
**Analog (deduct):** `pullBanner` (index.ts:1598-1604, 1700-1704) — balance check + player-row update

**Reducer skeleton** (mirror `setConstellation`, index.ts:986-994):
```typescript
export const setConstellation = spacetimedb.reducer(
  { characterId: t.string(), level: t.u32() },
  (ctx, { characterId, level }) => {
    const currentPlayer = requirePlayer(ctx);                 // canonical identity via ctx.sender
    const owned = findOwnedRow(ctx, currentPlayer, characterId);
    if (!owned) throw new SenderError('Character not owned');
    // ...
  }
);
```

**Balance check + SenderError** (pullBanner, index.ts:1598-1604):
```typescript
const currentPlayer = requirePlayer(ctx);
if (currentPlayer.gems < totalCost) throw new SenderError('Not enough gems');
```

**Two-row atomic mutate** (pullBanner player-row spread+override, index.ts:1700-1704):
```typescript
ctx.db.player.identity.update({
  ...currentPlayer,
  gems: currentPlayer.gems - totalCost,
  transcendShards: currentPlayer.transcendShards + shardsMinted,
});
```
Owned-row update pattern (setConstellation neighbourhood / setActiveCharacter index.ts:973):
```typescript
ctx.db.ownedCharacter.id.update({ ...outgoing, currentHealth: currentPlayer.currentHealth });
```

**Phase 2 assembled logic** (args = ONLY `{ characterId: t.string() }` — never trust caller level/cost):
```typescript
const currentPlayer = requirePlayer(ctx);
const owned = findOwnedRow(ctx, currentPlayer, characterId);
if (!owned) throw new SenderError('Character not owned');
const result = resolveTranscendInstall(
  owned.constellation, MAX_CONSTELLATION,
  owned.transcendLevel, MAX_TRANSCEND_LEVEL,
  currentPlayer.transcendShards, TRANSCEND_SHARD_COST);
if (!result.ok) {
  throw new SenderError(
    result.reason === 'below_c6' ? 'Requires C6'
    : result.reason === 'at_cap' ? 'At transcend cap'
    : 'Not enough shards');
}
ctx.db.player.identity.update({ ...currentPlayer, transcendShards: currentPlayer.transcendShards - result.shardCost });
ctx.db.ownedCharacter.id.update({ ...owned, transcendLevel: result.nextLevel });
```
Reused helpers already exist: `requirePlayer` (677), `findOwnedRow` (694). `SenderError` already imported top-of-file. `MAX_CONSTELLATION` (70), `MAX_TRANSCEND_LEVEL`/`TRANSCEND_SHARD_COST` (78/84) already declared — reference, never redeclare.

---

### `spacetimedb/src/index.ts` — `healParty` heal scaling (reducer, in-place one-line)

**Analog:** `healParty` itself (index.ts:1503-1513) — VERIFIED

```typescript
const ownedList = [...ctx.db.ownedCharacter.owner.filter(currentPlayer.identity)];
const healer = ownedList.find(row => row.characterId === currentPlayer.activeCharacterId);
const healActivated = healer
  ? activatedConstellationFor(ctx, healer.owner, healer.characterId, healer.constellation)
  : 0;
const healMultiplier = 1 + healActivated * HEAL_CONSTELLATION_STEP;   // existing line 1508
// ... used at 1513:
const amount = Math.round(healAmountFor(stats, targetMax, comboCount) * healMultiplier);
```

**Phase 2 change** — extend `healMultiplier` by the healer's transcend level (`healer` IS the active owned row, so `healer.transcendLevel` is valid post-schema):
```typescript
const healMultiplier =
  1 + healActivated * HEAL_CONSTELLATION_STEP
    + (healer ? healer.transcendLevel : 0) * TRANSCEND_HEAL_STEP;
```
`TRANSCEND_HEAL_STEP` already declared (index.ts:80). Server-only — client never computes heal amount (Anti-pattern).

---

### `src/game/createGame.ts` — multiplier extraction + `activeTranscend` setter (service)

**Analog (setter):** `setActiveConstellation` (createGame.ts:807-809) — VERIFIED
```typescript
setActiveConstellation(constellation) {
  activeConstellation = constellation;
},
```

**Analog (mutable loop state + local multiplier being replaced):** createGame.ts:391-393
```typescript
const CONSTELLATION_DAMAGE_STEP = 0.08; // +8% damage per constellation (C6 = +48%)
let activeConstellation = 0;
const constellationDamageMultiplier = () => 1 + activeConstellation * CONSTELLATION_DAMAGE_STEP;
```

**Consumption sites (unchanged call, new fn):** attack `:417`, skill `:485`:
```typescript
weapon.damage * regularAttackMultiplier(combo) * constellationDamageMultiplier()          // :417
damageMultiplier: skillAttackMultiplier(combo) * constellationDamageMultiplier()          // :485
```

**Interface addition (Game interface, mirror :98-99):**
```typescript
/** Active character's constellation level, scaling its damage. */
setActiveConstellation(constellation: number): void;
// ADD:
/** Active character's transcend level, further scaling its damage. */
setActiveTranscend(transcend: number): void;
```

**Phase 2 change:**
```typescript
import { transcendDamageMultiplier } from './combat/transcendScaling';
// replace local const block (391-393):
let activeConstellation = 0;
let activeTranscend = 0;
// remove local constellationDamageMultiplier; call transcendDamageMultiplier(activeConstellation, activeTranscend) at :417 & :485
// add setter next to setActiveConstellation (807):
setActiveTranscend(transcend) { activeTranscend = transcend; },
```

---

### `src/App.tsx` — bridge: build map + feed effect + reducer cb + prop (provider)

**Analog (build per-character map):** `constellationById` build (App.tsx:188-192) — VERIFIED
```typescript
const constellationById: Record<string, number> = {};
for (const row of ownedCharacterRows) {
  if (row.owner.toHexString() !== myIdentityHex) continue;
  constellationById[row.characterId] = row.constellation;
}
```

**Analog (scaling effect that pushes to game loop):** App.tsx:366-371 — VERIFIED. Add the transcend push in the SAME effect (dep array already has `ownedCharacterRows`):
```typescript
useEffect(() => {
  const active = myPlayer?.activeCharacterId;
  if (!active) return;
  gameRef.current?.setActiveConstellation(effectiveConstellation(active));
  // ADD:
  gameRef.current?.setActiveTranscend(transcendById[active] ?? 0);
}, [myPlayer, ownedCharacterRows, activationRows, myIdentityHex]);
```

**Analog (reducer callback):** `setConstellation` useCallback (App.tsx:242-247) — VERIFIED
```typescript
const setConstellation = useCallback(
  (characterId: string, level: number) => {
    connection?.reducers.setConstellation({ characterId, level });
  },
  [connection]
);
```
Phase 2 twin:
```typescript
const transcendCharacter = useCallback(
  (characterId: string) => { connection?.reducers.transcendCharacter({ characterId }); },
  [connection]
);
```

**Analog (prop threading):** `<CharacterScreen ... constellationById={constellationById} onSetConstellation={setConstellation} />` (App.tsx:474-491). Add `transcendById={transcendById}` and `onTranscend={transcendCharacter}`.

---

### `src/ui/CharacterScreen.tsx` — Install control + `C6·T{n}` badge (component)

**Analog (gated button + reducer onClick):** `.con-item` constellation button (CharacterScreen.tsx:343-361) — VERIFIED
```typescript
<button
  className={`con-item ${isOn ? 'con-item--on' : ''} ${isUnlocked ? '' : 'con-item--off'}`}
  disabled={!owned || !isUnlocked}
  onClick={() => onSetConstellation(characterId, nextLevel)}
>
  <span className="con-item__badge">C{bonus.level}</span>
  <span className="con-item__text">
    <span className="con-item__title">{bonus.title}{...}</span>
    <span className="con-item__effect">{bonus.effect}</span>
  </span>
  {isUnlocked && owned && <span className="con-item__toggle">{isOn ? '●' : '○'}</span>}
</button>
```
The Install control is a purple-accented clone of this (`disabled` = the three gate conditions; `onClick` → `onTranscend(characterId)`). Placement: directly below `</ol>` (con-list closes :365), above the `.ctab__soon` explainer (:366). Per UI-SPEC §Placement.

**Analog (status badge):** active-character tag in `.cchar__id` (CharacterScreen.tsx:235-238) — VERIFIED
```typescript
<div className="cchar__id">
  <CharacterIdentity character={character} className="cident--lg" />
  {isActive && <span className="cchar__active-tag">AKTĪVS VARONIS</span>}
</div>
```
Add a sibling purple `T{n}` tag here, rendered only when `transcendLevel > 0` → `C6 · T{n}` (UI-SPEC §Status Badge).

**Analog (props interface):** the shard-chip + constellation props already threaded (CharacterScreen.tsx:15-31). Add `transcendById: Record<string, number>` and `onTranscend(characterId: string): void`. The read-only shard chip (:171-173) already displays `transcendShards` — reuse for the affordance/glyph `◈`.

Gate conditions (UI-SPEC §Interaction & States): enabled iff `constellation >= 6 && transcendLevel < MAX_TRANSCEND_LEVEL && transcendShards >= TRANSCEND_SHARD_COST(transcendLevel + 1)`. Three DISTINCT disabled states (below-C6 / at-cap / not-enough-shards) — do not collapse. No `--danger`; dim via `opacity: 0.45` (mirror `.con-item--off`).

---

### `src/game/data/__tests__/transcendInstall.test.ts` (NEW — test)

**Analog:** `gachaOverflow.test.ts` — VERIFIED (cross-boundary import + `it.each`)
```typescript
import { describe, expect, it } from 'vitest';
// Import the real helper across the package boundary (server module → client vitest runner)
import { resolveDupeGrant } from '../../../../spacetimedb/src/gachaOverflow';
import { SHARD_PER_OVERFLOW_DUPE } from '../constants';
const MAX = 6;
describe('resolveDupeGrant', () => {
  it.each([0, 1, 2, 5])('sub-C6 dupe at constellation %i ...', current => { ... });
});
```
Phase 2 import path: `import { resolveTranscendInstall } from '../../../../spacetimedb/src/transcendInstall';` plus `MAX_TRANSCEND_LEVEL`, `TRANSCEND_SHARD_COST` from `../constants`. Required edge cases (RESEARCH §Sampling Rate): cap boundary (MAX-1 → ok, MAX → at_cap), exact-shard (`shards === cost` ok, `cost-1` insufficient), C5 → below_c6, cost curve `n∈{1,2,5,10}`.

### `src/game/combat/__tests__/transcendScaling.test.ts` (NEW — test)

**Analog:** `comboSystem.test.ts` — VERIFIED (import fns + constants, assert exact values at boundaries)
```typescript
import { describe, expect, it } from 'vitest';
import { regularAttackMultiplier, skillAttackMultiplier } from '../comboSystem';
it('regular multiplier is 1 at zero combo ...', () => {
  expect(regularAttackMultiplier(0)).toBe(1);
});
```
Phase 2 assertions (RESEARCH §Test Map): `transcendDamageMultiplier(6,0)=1.48`, `(6,1)=1.53`, `(6,10)=1.98`, `(0,0)=1`. Use `toBeCloseTo` for float sums.

### `src/game/data/__tests__/serverSync.test.ts` (MODIFY — stay green)

Already asserts all six transcend constants against the server source (lines 132-137, VERIFIED). No new assertion needed for this phase's column/reducer. **Constraint (Pitfall 5):** the test regex-parses `index.ts` as a STRING — do NOT reformat the constant declarations (index.ts:78-84) or single-line `CHARACTER_STATS`. Adding the `transcendLevel` column and the new reducer does not touch the parsed blocks, so it stays green.

---

## Shared Patterns

### Server authority (identity + ownership)
**Source:** `requirePlayer(ctx)` (index.ts:677-683), `findOwnedRow(ctx, player, characterId)` (index.ts:694-698)
**Apply to:** `transcendCharacter` reducer
```typescript
const currentPlayer = requirePlayer(ctx);            // canonical identity from ctx.sender (never trust args)
const owned = findOwnedRow(ctx, currentPlayer, characterId);
if (!owned) throw new SenderError('Character not owned');
```
Reducer args carry ONLY `characterId`. Cost/level/owner derive server-side (V4 access control, V5 input validation).

### Error surfacing
**Source:** `SenderError` (imported top of index.ts; used by `pullBanner`, `setConstellation`, `setActiveCharacter`)
**Apply to:** every reject branch of `transcendCharacter`
```typescript
throw new SenderError('...');   // surfaces cleanly to client; matches every existing reducer
```

### Additive migration (no wipe)
**Source:** `.default(0)` columns — `player.transcendShards` (index.ts:290), `gemDrop.droppedAtMicros` (index.ts:306)
**Apply to:** `owned_character.transcendLevel`
Publish WITHOUT `-c`/`--delete-data`: `spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb --server local -y` → `pnpm run spacetime:generate` → `pnpm build`. (Pitfalls 2 & 3: regenerate bindings BEFORE editing client; module path is `spacetimedb`, ignore the broken `spacetime:publish` npm scripts.)

### Pure-helper cross-boundary test
**Source:** `spacetimedb/src/gachaOverflow.ts` → `src/game/data/__tests__/gachaOverflow.test.ts:5`
**Apply to:** both new pure modules
Reducers can't run under vitest — extract the decision, import it across the package boundary (`../../../../spacetimedb/src/...`), test the branches directly.

### Client→game-loop feed
**Source:** `setActiveConstellation` setter (createGame.ts:807) ← App.tsx scaling effect (:366-371) ← `constellationById`/`effectiveConstellation` (:188-202)
**Apply to:** `setActiveTranscend` ← same effect ← new `transcendById` map. Reuse the already-subscribed `ownedCharacterRows` (App.tsx:94) — no new subscription.

---

## No Analog Found

None. Every file this phase touches has a verified in-repo copy-shape. The two "new" files
(`transcendInstall.ts`, `transcendScaling.ts`) are structural clones of `gachaOverflow.ts` /
`comboSystem.ts` respectively.

## Metadata

**Analog search scope:** `spacetimedb/src/` (module, helpers, reducers, pure helpers, tests), `src/game/combat/`, `src/game/data/`, `src/game/data/__tests__/`, `src/game/createGame.ts`, `src/App.tsx`, `src/ui/CharacterScreen.tsx`, `src/game/data/constants.ts` + `constellations.ts`.
**Files scanned:** ~18 (all read or grep-anchored this session).
**Pattern extraction date:** 2026-07-06
