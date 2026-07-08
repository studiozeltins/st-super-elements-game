# Phase 1: Constellation shard currency - Research

**Researched:** 2026-07-06
**Domain:** SpacetimeDB reducer economy change (server) + generated-binding client render (TypeScript/React)
**Confidence:** HIGH (all findings verified by direct file inspection of the live codebase)

## Summary

Phase 1 replaces the 800-gem duplicate refund with a scarce currency mint. When a gacha pull
grants a duplicate of a character already at C6 (`MAX_CONSTELLATION`), the player gains
`SHARD_PER_OVERFLOW_DUPE` (= 1) `transcendShards` instead of `DUPLICATE_REFUND` (= 800) gems.
Every moving part already exists in the repo: the Phase 0 constants are declared and mirrored,
the overflow path lives in one place (`grantCharacter` → `pullBanner`), and the client already
renders a gem balance the shard balance can be modeled on.

The work is a vertical slice: (1) add `transcendShards: t.u32()` to the `player` table plus its
three mirror sites (seed insert, `RestorePlayerRow`, `snapshot.mjs` keep-list); (2) extract the
overflow decision into a **pure helper file under `spacetimedb/src/`** so it is unit-testable via
the repo's established cross-import pattern; (3) wire that helper into `grantCharacter`/`pullBanner`,
deleting the `DUPLICATE_REFUND` path; (4) regenerate bindings, thread the new field through
`App.tsx` into `GachaScreen` and `CharacterScreen`, and render it. Deploy is an **additive
migrate** (no `--delete-data`) to `local`, per CLAUDE.md.

**Primary recommendation:** Create `spacetimedb/src/gachaOverflow.ts` exporting a pure
`resolveDupeGrant(constellation, maxConstellation, shardPerOverflow)` function; import it into
`grantCharacter`; test it from `src/game/data/__tests__/` using the same direct cross-import
pattern as `serverWorldSim.test.ts`. This satisfies the "pure-helper unit test" acceptance
without needing to boot a SpacetimeDB module in the test runner.

## Project Constraints (from CLAUDE.md + STATE.md)

No `CONTEXT.md` exists for this phase; these are the binding project-level constraints the plan
MUST honor (treated with locked-decision authority):

- **Server module path is `./spacetimedb`, NOT `./server`.** The `spacetime:publish` npm script
  points at the wrong `server` path and fails — **ignore it**. Publish with the explicit command
  (see Deploy Sequence). [VERIFIED: CLAUDE.md + package.json line 18]
- **Package manager is pnpm, not npm** (`npm i` crashes on the symlink layout). Use `pnpm`. [VERIFIED: MEMORY pnpm-package-manager]
- **Additive schema only** past Phase A — never `--delete-data` on a DB with real accounts.
  Phase 1 adds a column: additive migrate, no wipe. [VERIFIED: STATE.md Decisions]
- **Client/server mirrors must stay in sync** — `serverSync.test.ts` guards this (INV-5). Any
  new server constant must be mirrored in `src/game/data/constants.ts` and asserted. (Phase 1
  adds no new constant — it consumes existing Phase 0 constants.) [VERIFIED: STATE.md Blockers]
- **All work lands on `feat/transcendence`** (current branch). [VERIFIED: git status + STATE.md]
- SpacetimeDB reducers are deterministic and transactional; read via subscriptions, never return
  data from reducers; authorize via `ctx.sender`. [VERIFIED: CLAUDE.md core rules]

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-shard-currency-mint | Add `transcendShards: t.u32()` to `player`; in `grantCharacter` mint a shard on C6-overflow dupe instead of the 800-gem refund; regenerate bindings; show shard balance in `CharacterScreen.tsx` / `GachaScreen.tsx`; pure-helper unit test for the overflow logic. | Overflow path located (index.ts 1548-1571, 1634-1687); `SHARD_PER_OVERFLOW_DUPE`/`DUPLICATE_REFUND` located; pure-helper cross-import pattern confirmed; player-table mirror sites enumerated; UI render pattern located (GachaScreen 218-229). |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Shard mint decision (dupe → shard vs constellation++) | API / Backend (reducer) | Pure helper module | Economy must be server-authoritative + deterministic; the decision is extracted to a pure module only for testability, still executed server-side. |
| `transcendShards` persistence | Database / Storage (`player` table) | — | Durable player currency; additive column. |
| Shard balance display | Browser / Client (React screens) | Generated bindings | Read-only render from subscribed `player` row; no client authority over the value. |
| Backup/restore of shards | Backend reducer + Node scripts | — | Durable field must survive the dump→restore pair (`restorePlayers`, `snapshot.mjs`). |

## Standard Stack

No new libraries. This phase uses only what the repo already depends on.

### Core (existing, in-repo)
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| SpacetimeDB TS server SDK (`spacetimedb/server`) | as installed | table + reducer definitions | The project's entire backend model. [VERIFIED: index.ts line 1] |
| SpacetimeDB TS client SDK + `spacetimedb/react` | as installed | `useTable(tables.player)` subscription | Existing data-flow into `App.tsx`. [VERIFIED: App.tsx line 93] |
| Vitest | as installed | pure-helper unit tests | `"test": "vitest run"`. [VERIFIED: package.json line 12] |
| `spacetime` CLI | installed | publish + `generate` | Deploy + binding regen. [VERIFIED: package.json line 14] |

**Installation:** none. Do not add packages.

## Package Legitimacy Audit

**Not applicable — this phase installs zero external packages.** All code changes use existing
in-repo modules and already-installed toolchain. No registry lookups required.

## Architecture Patterns

### System Architecture Diagram

```
                 Gacha pull (client button)
                          │
                          ▼
            conn.reducers.pullBanner({bannerId,count})   [client, App.tsx]
                          │  (WebSocket)
                          ▼
   ┌─────────────────────────────────────────────────────────┐
   │  pullBanner reducer  (spacetimedb/src/index.ts 1583+)     │
   │    per slot:                                              │
   │      5★/4★ character won → grantCharacter(...)            │
   │                              │                            │
   │                              ▼                            │
   │        ┌──────────────────────────────────────────┐      │
   │        │ grantCharacter (index.ts 1548)            │      │
   │        │   not owned → insert C0                   │      │
   │        │   owned     → resolveDupeGrant(...)  ◄── NEW pure helper
   │        │                 { constellation, shardMinted }   │
   │        └──────────────────────────────────────────┘      │
   │      accumulate shardsMinted (was: refund += 800)         │
   │    end loop →                                             │
   │      player.update({ gems: gems - totalCost,   ◄── drop +refund
   │                       transcendShards: +shardsMinted })   │
   └─────────────────────────────────────────────────────────┘
                          │  (subscription push)
                          ▼
             useTable(tables.player) → myPlayer.transcendShards   [App.tsx]
                          │
             ┌────────────┴─────────────┐
             ▼                          ▼
      GachaScreen (wallet)      CharacterScreen (balance chip)   [render only]
```

File-to-role mapping lives in Component Responsibilities below, not the diagram.

### Component Responsibilities

| File | Change |
|------|--------|
| `spacetimedb/src/gachaOverflow.ts` **(new)** | Pure `resolveDupeGrant(...)`: given current constellation + max + shardPerOverflow, return `{ constellation, shardMinted }`. |
| `spacetimedb/src/index.ts` | Add `transcendShards: t.u32()` to `player`; seed it `0`; add to `RestorePlayerRow` + `restorePlayers` insert; import + use helper in `grantCharacter`; replace `refund += DUPLICATE_REFUND` with `shardsMinted += result.shardMinted`; update final `player.update`; delete `DUPLICATE_REFUND` const. |
| `scripts/snapshot.mjs` | Add `'transcend_shards'` to the player `keep` list. |
| `src/module_bindings/*` | Regenerated (`pnpm run spacetime:generate`). |
| `src/App.tsx` | Pass `transcendShards={myPlayer?.transcendShards ?? 0}` to both screens. |
| `src/ui/GachaScreen.tsx` | New `transcendShards: number` prop; render beside gems in `.gacha__wallet` (lines 218-229). |
| `src/ui/CharacterScreen.tsx` | New `transcendShards: number` prop; render a shard chip. |
| `src/game/data/__tests__/gachaOverflow.test.ts` **(new)** | Cross-import the helper; assert C6-dupe → shard, sub-C6 → constellation++. |

### Pattern 1: Pure server helper, cross-imported by client tests (THE key pattern)
**What:** Server logic that must be unit-tested is factored into a plain `.ts` module under
`spacetimedb/src/` that (a) `index.ts` imports for real execution, and (b) a test in
`src/game/data/__tests__/` imports directly via a relative path across package boundaries.
**When to use:** Exactly this phase — the overflow decision must have a pure-helper unit test.
**Evidence:** `serverWorldSim.test.ts` imports server modules directly:
```typescript
// Source: src/game/data/__tests__/serverWorldSim.test.ts lines 25-43 [VERIFIED]
import { createSeededRandom as serverSeededRandom } from '../../../../spacetimedb/src/rng';
import { enemyMaxHealth /* ... */ } from '../../../../spacetimedb/src/enemyStats';
import { damagePerTick /* ... */ } from '../../../../spacetimedb/src/combatMath';
```
And `index.ts` imports those same modules for execution:
```typescript
// Source: spacetimedb/src/index.ts lines 4-20 [VERIFIED]
import { createSeededRandom } from './rng';
import { damagePerTick, distanceBetween, gemIsCollectible /* ... */ } from './combatMath';
```
So the new helper belongs in `spacetimedb/src/gachaOverflow.ts`, imported by `index.ts` as
`./gachaOverflow` and by the test as `../../../../spacetimedb/src/gachaOverflow`.

### Pattern 2: Additive column with all mirror sites updated together
**What:** Adding a `player` column requires touching four sites so insert/restore/backup stay
consistent (STDB `insert` requires every non-defaulted column).
**Sites (all VERIFIED):**
1. Table def — `player` table, `spacetimedb/src/index.ts` lines 267-288 (add `transcendShards: t.u32()`).
2. Seed insert — `seedPlayer`, index.ts lines 646-661 (add `transcendShards: 0`).
3. Restore row type — `RestorePlayerRow`, index.ts lines 1374-1387 (add `transcendShards: t.u32()`),
   consumed by `restorePlayers` (lines 1415-1423) whose `insert({ ...row, ... })` will carry it.
4. Backup keep-list — `scripts/snapshot.mjs` player `keep` array, lines 14-27 (add `'transcend_shards'`).

### Pattern 3: Read-through render from the subscribed player row
**What:** The client never computes the balance; it reads `myPlayer.transcendShards` and passes
it as a prop, mirroring how `gems` flows today.
```typescript
// Source: src/App.tsx lines 451 & 426 [VERIFIED] — mirror this for shards
gems={myPlayer?.gems ?? 0}
// add: transcendShards={myPlayer?.transcendShards ?? 0}
```
```tsx
// Source: src/ui/GachaScreen.tsx lines 218-229 [VERIFIED] — wallet render to extend
<div className="gacha__wallet">
  {tab === 'characters' ? ( /* owned count */ ) : ( <><span className="gacha__gem">✦</span> {gems}</> )}
</div>
```

### Anti-Patterns to Avoid
- **Computing or storing the shard balance client-side.** It is server-authoritative; the client
  renders the subscribed value only.
- **Leaving `DUPLICATE_REFUND` in place "just in case."** The requirement says replace/remove it;
  a dangling 800-gem path would fail success criterion 1 (gems must be unchanged).
- **Mutating `gems` when minting a shard.** Criterion 1 requires gems unchanged on a C6-dupe.
- **Putting the overflow branch inline in the reducer only.** It must be an extractable pure
  function to satisfy the unit-test acceptance.
- **Adding the column to the table but forgetting `RestorePlayerRow`/seed/snapshot.** The module
  will fail to insert players (missing column) or silently drop shards on restore.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Client↔server value sync | Manual polling / custom fetch | `useTable(tables.player)` subscription (already wired) | STDB pushes updates; App.tsx already derives `myPlayer`. |
| Persisting new currency | Side table / JSON blob | A plain `t.u32()` column on `player` | Additive, matches every other currency (`gems`, `gemsFromKills`). |
| Testing the reducer | Boot a live module in the test runner | Pure helper + direct cross-import (Pattern 1) | Repo's established, fast, deterministic pattern. |
| Regenerating client types | Hand-edit `player_table.ts` | `pnpm run spacetime:generate` | File is auto-generated; hand edits are overwritten (header says so). |

**Key insight:** Every seam this phase needs (subscription plumbing, currency column shape, pure-helper
test harness, wallet render) already has a working exemplar in the repo — copy the exemplar, don't invent.

## Runtime State Inventory

This is an **additive schema change**, not a rename/migration, so most categories are empty. The
one real consideration is backup/restore continuity:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `player` rows on `local` (and `maincloud`) gain a `transcend_shards` column. Existing rows must default to 0 under additive migrate. | Verify additive migrate defaults the new u32 to 0 (no reseed). Code edit: seed + restore insert must set it. |
| Live service config | None — no external service embeds this field. | None. |
| OS-registered state | None. | None — verified: no scheduler/pm2 name references shards. |
| Secrets/env vars | None. | None. |
| Build artifacts / bindings | `src/module_bindings/player_table.ts` is stale after the schema change (currently lacks `transcendShards`, lines 13-28). | Regenerate: `pnpm run spacetime:generate`. |

**Additive-default note:** STATE.md locks "all later phases are additive schema (no data wipe)"
and the requirement asserts "default 0, additive migrate — no data wipe." SpacetimeDB should
auto-add a new `u32` column defaulting to 0 on republish without `--delete-data`. This is an
established project assumption; confirm in the playtest that existing local players show shards = 0
(not an error). [ASSUMED — additive-default behavior; A1 in log]

## Common Pitfalls

### Pitfall 1: STDB refuses `insert` when a new required column is omitted
**What goes wrong:** After adding `transcendShards` to the table, `seedPlayer` and `restorePlayers`
still call `insert({...})` without the field → module error at runtime.
**Why it happens:** `t.u32()` with no default is required at insert time.
**How to avoid:** Add `transcendShards: 0` to the seed insert (index.ts ~660) and `transcendShards`
to `RestorePlayerRow` so `restorePlayers`' `{ ...row }` carries it.
**Warning signs:** `spacetime logs` shows an insert/validation error on connect or restore.

### Pitfall 2: Publishing to the wrong module path (the broken npm script)
**What goes wrong:** `pnpm run spacetime:publish` targets `--module-path server` and fails.
**How to avoid:** Publish explicitly:
`spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb --server local --yes`.
**Warning signs:** "module not found" / build errors referencing a `server/` dir.

### Pitfall 3: Client still on the old build after schema change ("no such reducer"/missing field)
**What goes wrong:** `myPlayer.transcendShards` is `undefined` because bindings weren't regenerated,
or the browser is on the built `dist/` while you tested the dev server.
**How to avoid:** After publish, run `pnpm run spacetime:generate`, then `pnpm build`. A hashed
`index-<hash>.js` in an error means the browser is on `dist/` (laragon), not the dev server.

### Pitfall 4: Forgetting the snapshot keep-list → shards lost on the next backup/restore
**What goes wrong:** `snapshot.mjs` `keep` filters columns; if `transcend_shards` isn't listed,
a backup drops it and a later restore resets everyone to 0.
**How to avoid:** Add `'transcend_shards'` to the player `keep` array (snapshot.mjs lines 14-27).
**Note:** `restorePlayers` refuses a non-empty table, so this only bites on a fresh-DB restore —
but it must still be correct (INV / no silent data loss).

### Pitfall 5: Gems drift on a C6-dupe
**What goes wrong:** Leaving any `+ refund` term in the final `player.update` makes gems change on
a C6-dupe, failing criterion 1.
**How to avoid:** Final update becomes `gems: currentPlayer.gems - totalCost` (no refund) plus
`transcendShards: currentPlayer.transcendShards + shardsMinted`. Delete the `refund` variable and
`DUPLICATE_REFUND` const entirely.

## Code Examples

### Exact current overflow path to modify (server)
```typescript
// Source: spacetimedb/src/index.ts lines 1562-1570 [VERIFIED] — grantCharacter dupe branch
if (owned.constellation < MAX_CONSTELLATION) {
  const constellation = owned.constellation + 1;
  ctx.db.ownedCharacter.id.update({ ...owned, constellation });
  setActivation(ctx, owner, characterId, constellation);
  return { isNew: false, constellation, maxed: false };
}
return { isNew: false, constellation: MAX_CONSTELLATION, maxed: true };
```
```typescript
// Source: spacetimedb/src/index.ts lines 1634-1637 & 1650-1653 [VERIFIED] — the two call sites
const result = grantCharacter(ctx, currentPlayer.identity, itemId);
isNew = result.isNew;
constellation = result.constellation;
if (result.maxed) refund += DUPLICATE_REFUND;   // ← replace with: shardsMinted += result.shardMinted
```
```typescript
// Source: spacetimedb/src/index.ts lines 1684-1687 [VERIFIED] — final wallet write
ctx.db.player.identity.update({
  ...currentPlayer,
  gems: currentPlayer.gems - totalCost + refund,   // ← drop `+ refund`
  // ← add: transcendShards: currentPlayer.transcendShards + shardsMinted,
});
```

### Suggested pure helper (new file)
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
`grantCharacter` calls this for the owned branch, updates `ownedCharacter`/activation only when
`constellation` changed, and returns `{ isNew: false, constellation, shardMinted }`.

### Relevant constants (Phase 0, already present — do NOT redeclare)
```typescript
// Source: spacetimedb/src/index.ts lines 69, 73, 81 [VERIFIED]
const MAX_CONSTELLATION = 6;
const DUPLICATE_REFUND = 800;          // ← delete in this phase
const SHARD_PER_OVERFLOW_DUPE = 1;     // ← use this instead
```
Client mirror already exists: `src/game/data/constants.ts` line 11
`export const SHARD_PER_OVERFLOW_DUPE = 1;`. [VERIFIED]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| C6-dupe refunds 800 gems (`DUPLICATE_REFUND`) | C6-dupe mints 1 `transcendShard` | This phase | Duplicates become the scarce Transcendence faucet, not a gem sink. |

**Deprecated/outdated after this phase:**
- `DUPLICATE_REFUND` constant and the `refund` accumulator in `pullBanner` — removed.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | SpacetimeDB additive republish (no `--delete-data`) auto-adds the new `u32` column defaulting to 0 for existing rows. | Runtime State Inventory | If it errors or nulls, existing local players break on connect; may need a one-time backfill or accept a local wipe. Verify in playtest before touching maincloud. |

**Only one assumption** — the additive-default behavior. It is backed by an explicit project
decision (STATE.md) and the requirement text, and is easy to falsify in the local playtest.

## Open Questions (RESOLVED)

1. **Should the pull result / animation surface the minted shard to the player?**
   - What we know: Success criterion 3 only requires the balance be visible in Character/Gacha
     screens; the `pullResult` event table (index.ts lines 449-467, 1664-1674) has no shard field.
   - What's unclear: Whether the planner wants per-pull "+1 shard" feedback (nice-to-have, not required).
   - Recommendation: Keep Phase 1 minimal — render the running balance only; defer per-pull shard
     feedback (fits better with Phase 2's transcend UI). Not a blocker.
   - **(RESOLVED):** Deferred to Phase 2. Phase 1 renders the running balance only; per-pull "+1 shard"
     feedback is out of scope and folds into Phase 2's transcend UI. No `pullResult` shard field added.

2. **Where exactly in `CharacterScreen` should the shard chip sit?**
   - What we know: `CharacterScreen` currently receives no currency prop (verified: no `gems`/wallet
     in the file); it has a tab header area (`TABS`, lines 46-50).
   - Recommendation: Add a small shard chip near the header/roster, using the `✦`/`❖` glyph style
     from `gacha__wallet`. Planner/UI-spec can pin the exact slot; leave to discretion.
   - **(RESOLVED):** Pinned by UI-SPEC and plan 01-04 — the shard chip's exact slot is specified there
     (header/roster area, `✦`/`❖` glyph style from `gacha__wallet`). No longer at planner discretion.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `spacetime` CLI | publish + `generate` | ✓ (established workflow) | project-pinned | — |
| local SpacetimeDB (`spacetimedb-standalone`) | local publish + playtest | ✓ (dev workflow) | — | — |
| pnpm | test / build / generate | ✓ | — | — |

No new external dependencies. No missing blockers.

## Validation Architecture

*(nyquist_validation = true → included)*

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | vite/vitest config in repo (tests run via `vitest run`) |
| Quick run command | `pnpm vitest run src/game/data/__tests__/gachaOverflow.test.ts` |
| Full suite command | `pnpm test` (`vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-shard-currency-mint | C6-dupe → `shardMinted === SHARD_PER_OVERFLOW_DUPE`, constellation stays at max | unit (pure helper) | `pnpm vitest run src/game/data/__tests__/gachaOverflow.test.ts` | ❌ Wave 0 (new `gachaOverflow.ts` + test) |
| REQ-shard-currency-mint | sub-C6 dupe → `constellation+1`, `shardMinted === 0` | unit (pure helper) | same as above | ❌ Wave 0 |
| REQ-shard-currency-mint | existing constants still mirror server (no regression from const deletion) | unit | `pnpm vitest run src/game/data/__tests__/serverSync.test.ts` | ✅ exists |
| REQ-shard-currency-mint | existing gacha/pity behavior unbroken | unit/regression | `pnpm test` | ✅ exists (serverWorldSim / serverSync suites) |
| REQ-shard-currency-mint | client renders shard balance; build compiles with new bindings | build/manual | `pnpm build` + playtest | ✅ (build) / manual (render) |

### Sampling Rate
- **Per task commit:** `pnpm vitest run src/game/data/__tests__/gachaOverflow.test.ts`
- **Per wave merge:** `pnpm test`
- **Phase gate:** `pnpm test` green + `pnpm build` green + local playtest (dupe of a C6 char raises
  shard count, gems unchanged, no 800-gem refund).

### Wave 0 Gaps
- [ ] `spacetimedb/src/gachaOverflow.ts` — pure `resolveDupeGrant` (implementation under test)
- [ ] `src/game/data/__tests__/gachaOverflow.test.ts` — covers both branches of REQ-shard-currency-mint
- [ ] (No framework install needed — Vitest already present.)

## Security Domain

*(security_enforcement = true, ASVS level 1 → included)*

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No new auth surface; `pullBanner` already gated by `requirePlayer`. |
| V3 Session Management | no | Unchanged. |
| V4 Access Control | yes | Reducer mutates only the caller's own `player` row, resolved via `ctx.sender` through `requirePlayer` (index.ts 671-677). Shard mint is not exposed as a client-settable value. |
| V5 Input Validation | yes | Shard amount is server-computed from `SHARD_PER_OVERFLOW_DUPE`, never from client input. `bannerId`/`count` validation already exists (`Unknown banner`, `MAX_PULLS_PER_REQUEST`, gem check). |
| V6 Cryptography | no | None. |

### Known Threat Patterns for this change
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client forging a large shard grant | Tampering / Elevation | Value derives only from server constants + owned-constellation state; client sends no shard amount. [VERIFIED: mint is inside the reducer] |
| Determinism break (non-deterministic mint) | — | Helper is pure arithmetic, no `ctx.random`/time; keeps reducer deterministic per CLAUDE.md rule 2. |
| Cross-player mutation | Elevation | `requirePlayer` resolves the caller's canonical identity; update targets `currentPlayer.identity` only. |

No new attack surface beyond the existing (already-authorized) `pullBanner` reducer.

## Sources

### Primary (HIGH confidence — direct file inspection this session)
- `spacetimedb/src/index.ts` — constants (69-84), `player` table (267-288), `seedPlayer` (640-669),
  `grantCharacter` (1548-1571), `pullBanner` overflow/wallet (1583-1689), `RestorePlayerRow` +
  `restorePlayers` (1374-1423).
- `src/game/data/__tests__/serverWorldSim.test.ts` (1-50) — cross-import pure-helper test pattern.
- `src/game/data/__tests__/serverSync.test.ts` (100-141) — constant-mirror assertion pattern.
- `src/game/data/__tests__/transcendence.test.ts` — Phase 0 constant unit test (extend-or-mirror model).
- `src/game/data/constants.ts` (8-15) — client constant mirrors.
- `src/App.tsx` (93, 167, 424-488) — player subscription + prop wiring.
- `src/ui/GachaScreen.tsx` (38-84, 218-229) — props + wallet render.
- `src/ui/CharacterScreen.tsx` (15-89) — props (no currency yet).
- `src/module_bindings/player_table.ts` (13-28) — generated row type (stale target).
- `scripts/snapshot.mjs` (9-51) + `scripts/backup.mjs` — backup keep-list mechanics.
- `package.json` (7-18) — `dev`/`build`/`test`/`spacetime:generate` scripts.
- `./.claude/CLAUDE.md` + `.planning/{REQUIREMENTS,ROADMAP,STATE}.md` — constraints + phase spec.

### Secondary / Tertiary
- None. No web research required — this is an internal-codebase phase; all claims are VERIFIED
  against repo files.

## Deploy Sequence (per CLAUDE.md)

1. Edit server (`spacetimedb/src/index.ts` + new `gachaOverflow.ts`).
2. `pnpm test` (pure helper + regressions) and iterate.
3. Publish additive (NO `--delete-data`):
   `spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb --server local --yes`
4. Regenerate bindings: `pnpm run spacetime:generate`.
5. Wire client (`App.tsx`, `GachaScreen.tsx`, `CharacterScreen.tsx`).
6. `pnpm build`.
7. Playtest on `local`: dupe of an already-C6 char → shard +1, gems unchanged, no 800-gem refund;
   sub-C6 dupe → constellation++ only.
8. (Maincloud deploy is out of scope for Phase 1's local acceptance; the full multi-env deploy is a
   Phase 7 responsibility. If the planner chooses to also publish maincloud, use the same additive
   command with `--server maincloud`, no `--delete-data`.)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; all tooling in `package.json`.
- Architecture: HIGH — exact files/lines for every change verified; pure-helper pattern has a
  working exemplar (`serverWorldSim.test.ts`).
- Pitfalls: HIGH — each derived from a concrete code site (insert requirements, broken npm script,
  snapshot keep-list, refund removal).
- One MEDIUM/ASSUMED point: additive-column default-to-0 behavior (A1) — verify in playtest.

**Research date:** 2026-07-06
**Valid until:** ~2026-08-05 (30 days; stable internal codebase, no fast-moving external deps).
