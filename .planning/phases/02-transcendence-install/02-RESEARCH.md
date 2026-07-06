# Phase 2: Transcendence install - Research

**Researched:** 2026-07-06
**Domain:** SpacetimeDB TypeScript module (reducer + additive column) + client damage/heal scaling + gated install UI
**Confidence:** HIGH

> All findings in this research were VERIFIED by reading the live codebase this session
> (`spacetimedb/src/index.ts`, `src/game/createGame.ts`, `src/App.tsx`, `src/ui/*`, existing
> tests). No external documentation or web sources were needed — this phase reuses proven
> in-repo patterns. No new packages are installed. `[VERIFIED: codebase path:line]` tags point
> at the exact source lines a planner/implementer can open.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Server schema (`spacetimedb/src/index.ts`)**
- Add `transcendLevel: t.u32()` to the `owned_character` table, `default(0)`.
- Additive column → migrate-publish (drop `-c`), do NOT wipe.

**Reducer `transcendCharacter({ characterId })`**
- Reject with `SenderError` if the character is **below C6** (constellation < 6).
- Reject with `SenderError` if already at `MAX_TRANSCEND_LEVEL` (cap).
- Compute `nextLevel = transcendLevel + 1`; require `player.transcendShards >= TRANSCEND_SHARD_COST(nextLevel)`; else `SenderError`.
- On success: deduct `TRANSCEND_SHARD_COST(nextLevel)` from `player.transcendShards` and increment `owned_character.transcendLevel` by 1.
- `ctx.sender` is authority for who owns the character. Never trust caller-supplied identity.

**Damage scaling (client `src/game/createGame.ts` ~391–393; used at 417 & 485)**
- Current: `constellationDamageMultiplier() = 1 + activeConstellation * CONSTELLATION_DAMAGE_STEP` (0.08).
- New: multiplier also adds `transcendLevel * TRANSCEND_DAMAGE_STEP` (0.05).
- **Extract** the pure math into a dependency-free module under `src/game/combat/` (mirror `comboSystem.ts` / `damageKind.ts`) so it unit-tests without a DB or game loop. Exported as `transcendDamageMultiplier(constellation, transcend)`.

**Heal scaling (server `healParty` reducer, ~1496)**
- Heal multiplier adds `transcendLevel * TRANSCEND_HEAL_STEP` (0.08) for healers.

**UI (`src/ui/CharacterSheet.tsx`, `src/ui/ConstellationRing.tsx`)**
- Show `C6 · T{n}` when transcended.
- Install button calling `transcendCharacter`, **gated**: disabled when char < C6, at `MAX_TRANSCEND_LEVEL`, or `transcendShards < TRANSCEND_SHARD_COST(nextLevel)`.
- User-facing rare currency noun: "Constellation Shards".

**Bindings + build**
- After schema/reducer change: publish local → `pnpm run spacetime:generate` → `pnpm build`.

### Claude's Discretion
- Exact file name/signature of the extracted combat module (suggest `transcendScaling.ts`).
- Where in `createGame.ts` `transcendLevel` is sourced (state setter mirroring `setActiveConstellation`) — must stay in sync with the active character.
- UI layout/copy details of the Install button and `C6 · T{n}` badge.

### Deferred Ideas (OUT OF SCOPE)
- Shard at risk on death / PVP steal / erosion → Phase 3.
- Character roles, party, raid faucet, balance → Phases 4–7.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-transcend-install | Add `transcendLevel` to `ownedCharacter`; `transcendCharacter` reducer (require C6, deduct `TRANSCEND_SHARD_COST(nextLevel)`, increment level, reject past cap / <C6 / short on shards); extend healer scaling in `healParty` (`+transcendLevel*TRANSCEND_HEAL_STEP`); extend client damage multiplier (`+transcendLevel*TRANSCEND_DAMAGE_STEP`) via an extracted pure module; UI shows `C6 · T{n}` + gated Install button. | Reducer mirror pattern in "Don't Hand-Roll" + "Code Examples"; additive-column pattern verified (`transcendShards` at index.ts:290, `gemDrop.droppedAtMicros` at 306); damage-multiplier extraction target `createGame.ts:391-393` + client feed path via `setActiveConstellation` (App.tsx:370); heal scaling site `healParty` (index.ts:1496-1508); UI wiring via `CharacterScreen.tsx` (the LIVE screen — see Pitfall 1). |
</phase_requirements>

## Summary

This is a "wire an existing, fully-specified feature onto proven in-repo rails" phase, not a
research-heavy one. Every constant, currency column, table, reducer helper, subscription, and
test harness this phase touches already exists and was read this session. The four moving parts
map 1:1 to patterns already shipped in Phase 1 and earlier:

1. **Additive `u32` column with `.default(0)`** on `owned_character` — identical to how
   `player.transcendShards` (index.ts:290) and `gem_drop.droppedAtMicros` (index.ts:306) were
   added without a wipe. `.default(0)` is load-bearing: STDB refuses to add a non-defaulted
   column to a populated table.
2. **A currency-deduct + owned-row-mutate reducer** (`transcendCharacter`) — a near-exact blend
   of `pullBanner` (gems-balance check + `SenderError`, index.ts:1604) and `setConstellation`
   (ownership check via `findOwnedRow`, index.ts:986). The pure decision (deduct / raise / reject)
   should be **extracted into `spacetimedb/src/transcendInstall.ts`** and unit-tested cross-boundary
   exactly like Phase 1's `spacetimedb/src/gachaOverflow.ts` → `gachaOverflow.test.ts`. Reducers
   cannot run under vitest; extracting the decision is the ONLY way to satisfy the DoD's
   "server logic unit" without a live DB.
3. **A pure client damage multiplier** `transcendDamageMultiplier(constellation, transcend)` in
   `src/game/combat/transcendScaling.ts`, consumed at `createGame.ts:417` & `:485`, fed the
   active character's `transcendLevel` through a setter mirroring `setActiveConstellation`
   (createGame.ts:807, driven by an App.tsx effect at :366-371).
4. **Server heal scaling** — one line inside `healParty` (index.ts:1508) extends `healMultiplier`
   by `healActivated`-style `transcendLevel * TRANSCEND_HEAL_STEP`.

**Primary recommendation:** Extract two pure helpers (`transcendInstall.ts` server-side decision,
`transcendScaling.ts` client damage math), mirror `gachaOverflow.ts`/`comboSystem.ts` verbatim in
structure, wire the reducer as a `pullBanner`+`setConstellation` hybrid, target the LIVE
`CharacterScreen.tsx` (NOT the dead `CharacterSheet.tsx`) for UI, and deploy via the additive
migrate flow (`spacetime publish … -y` WITHOUT `-c` → `pnpm run spacetime:generate` → `pnpm build`).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Persist `transcendLevel` per owned character | Database / Storage (STDB table) | — | Durable per-character state; additive column on `owned_character` (index.ts:375). |
| Authorize + execute install (deduct shards, raise level) | API / Backend (STDB reducer) | — | Currency mutation MUST be server-authoritative; `ctx.sender` is the only trusted identity (CLAUDE.md rule 5). |
| Reject invalid install (<C6 / at cap / short shards) | API / Backend (pure helper `resolveTranscendInstall`) | — | Deterministic decision extracted for unit testing; reducer maps result → `SenderError`. |
| Heal scaling for healers | API / Backend (`healParty` reducer) | — | Heal amount is computed server-side (index.ts:1513); client only triggers via `sendHealParty` (createGame.ts:492). |
| Damage scaling from transcend level | Browser / Client (`createGame.ts` combat loop) | — | Damage is client-authoritative — client rolls damage and sends the number to the server (`attackRay`/`attackEnemies`). Pure math extracted to `src/game/combat/`. |
| Feed active character's `transcendLevel` into combat loop | Frontend (React → game bridge) | Browser / Client | App.tsx reads the subscribed `owned_character` row and pushes it via a setter mirroring `setActiveConstellation` (App.tsx:366-371). |
| Show `C6 · T{n}` + gated Install button | Browser / Client (React UI) | — | Reads subscribed `player.transcendShards` + `owned_character.transcendLevel`; calls `transcendCharacter` reducer. |

## Standard Stack

No new dependencies. Everything below is already installed and in use.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `spacetimedb` (server + react + client SDK) | in repo | Table + reducer + subscription runtime | The whole game runs on it; `[VERIFIED: package.json, spacetimedb/src/index.ts]` |
| `vitest` | in repo | Pure-helper + sync unit tests | `"test": "vitest run"` `[VERIFIED: package.json scripts]` |
| `react` | in repo | Install UI + `useTable` subscriptions | `[VERIFIED: src/App.tsx:2]` |
| `three` | in repo | Combat/render loop consuming the damage multiplier | `[VERIFIED: src/game/createGame.ts]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extracting `resolveTranscendInstall` into a pure module | Inline all logic in the reducer | Loses the DoD-required "server logic unit" — reducers can't run under vitest, so the reject/deduct branches would be untestable. Rejected. `[VERIFIED: gachaOverflow.ts pattern]` |
| Adding a `transcendLevel` column to `owned_character` | A separate `character_transcend` table (like `character_activation` at index.ts:394) | CONTEXT LOCKS the column approach. The separate-table trick exists only to avoid migration on a live DB; here the additive `.default(0)` column already avoids a wipe, so the column is simpler. |

**Installation:** none — no `pnpm add`.

## Package Legitimacy Audit

**Not applicable.** This phase installs zero external packages. All libraries (`spacetimedb`,
`vitest`, `react`, `three`) are already present and exercised across the existing codebase and
test suite. No `pnpm add`, no new registry lookups, no supply-chain surface introduced.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                         INSTALL FLOW (write path)
  ┌──────────────┐   transcendCharacter({characterId})   ┌───────────────────────────┐
  │  Install btn │ ────────────────────────────────────► │  transcendCharacter        │
  │ CharacterScr │                                        │  reducer (server)          │
  │  (React UI)  │                                        │  1. requirePlayer(ctx)     │
  └──────┬───────┘                                        │  2. findOwnedRow(ctx,…)    │
         │ gated by                                       │  3. resolveTranscendInstall│ ◄─ pure helper
         │ transcendShards + cap                          │     (pure, testable)       │    (transcendInstall.ts)
         ▼                                                │  4a. reject → SenderError  │
  ┌──────────────┐                                        │  4b. ok → deduct shards +  │
  │ subscribed   │                                        │        transcendLevel += 1 │
  │ rows via     │ ◄─────── real-time row updates ─────── │  (player + owned_character)│
  │ useTable:    │                                        └───────────────────────────┘
  │ player,      │
  │ ownedChar    │                READ / SCALING path
  └──────┬───────┘
         │ App.tsx effect (activeCharacterId + transcendLevel)
         ▼
  ┌──────────────┐  setActiveTranscend(level)   ┌────────────────────────────────────┐
  │  App.tsx     │ ───────────────────────────► │  createGame.ts combat loop         │
  │  bridge      │                              │  transcendDamageMultiplier(         │ ◄─ pure helper
  └──────────────┘                              │    activeConstellation, transcend)  │    (transcendScaling.ts)
                                                │  → consumed at :417 (attack) & :485 │
                                                │    (skill) → bigger damage numbers  │
                                                └────────────────────────────────────┘

  HEALERS: client sendHealParty(combo) ─► healParty reducer ─► healMultiplier +=
           transcendLevel * TRANSCEND_HEAL_STEP  (server computes the heal amount)
```

### Component Responsibilities

| File | Change | Anchor (verified) |
|------|--------|-------------------|
| `spacetimedb/src/index.ts` | Add `transcendLevel: t.u32().default(0)` to `owned_character`; new `transcendCharacter` reducer; one-line heal-multiplier extension in `healParty` | table @375-388; `healParty` @1496-1529; `pullBanner` @1595 (deduct pattern); `setConstellation` @986 (owned-row mutate pattern) |
| `spacetimedb/src/transcendInstall.ts` (NEW) | Pure `resolveTranscendInstall(...)` decision | mirror `spacetimedb/src/gachaOverflow.ts` |
| `src/game/combat/transcendScaling.ts` (NEW) | Pure `transcendDamageMultiplier(constellation, transcend)` | mirror `src/game/combat/comboSystem.ts` |
| `src/game/createGame.ts` | Replace local `constellationDamageMultiplier` with the pure fn; add `activeTranscend` + `setActiveTranscend` setter | multiplier @391-393; consumed @417 & @485; `setActiveConstellation` setter @807-808; interface @99 |
| `src/App.tsx` | Build `transcendById`; call `setActiveTranscend` in the existing scaling effect; pass `transcendById`/level into `CharacterScreen` | scaling effect @366-371; `constellationById`/`activatedById` build @188-202; `CharacterScreen` props @474-491 |
| `src/ui/CharacterScreen.tsx` | `C6 · T{n}` badge + gated Install button calling `transcendCharacter` | shard chip already rendered @171-173; constellation-toggle button (gate/`onClick` pattern to mirror) @343-361 |
| `src/game/data/__tests__/transcendInstall.test.ts` (NEW) | Cross-boundary unit of the server decision | mirror `gachaOverflow.test.ts` |
| `src/game/combat/__tests__/transcendScaling.test.ts` (NEW) | Pure damage-math unit | mirror `comboSystem.test.ts` |
| `src/game/data/__tests__/serverSync.test.ts` | Must stay green (already asserts the transcend constants) | @132-137 |

### Pattern 1: Additive `u32` column with `.default(0)` (no wipe)
**What:** Add a persistent per-character field without destroying the live DB.
**When to use:** Any new column on a populated STDB table.
**Example:**
```typescript
// Source: spacetimedb/src/index.ts:287-290 (transcendShards on player) — VERIFIED
// Durable transcendence currency … .default(0) lets the additive migrate backfill
// existing rows to 0 without a data wipe — STDB refuses a non-defaulted column on a populated table.
transcendShards: t.u32().default(0),

// Phase 2 mirror — add to owned_character (index.ts:375-388):
constellation: t.u32(),
transcendLevel: t.u32().default(0),   // NEW — levels past C6, capped at MAX_TRANSCEND_LEVEL
```

### Pattern 2: Currency-deduct + owned-row-mutate reducer
**What:** Authorize by `ctx.sender`, check a balance, throw `SenderError` on any invalid path, then mutate two rows atomically (reducers are transactional).
**When to use:** `transcendCharacter`.
**Example:**
```typescript
// Balance-check + SenderError shape — Source: pullBanner, index.ts:1598-1604 (VERIFIED)
const currentPlayer = requirePlayer(ctx);              // canonical identity via ctx.sender
if (currentPlayer.gems < totalCost) throw new SenderError('Not enough gems');

// Ownership lookup + owned-row update — Source: setConstellation, index.ts:986-993 (VERIFIED)
const owned = findOwnedRow(ctx, currentPlayer, characterId);  // filters by owner.identity
if (!owned) throw new SenderError('Character not owned');
// … ctx.db.ownedCharacter.id.update({ ...owned, <field>: <new> });

// Player-row update (spread + override) — Source: setActiveCharacter, index.ts:975-979 (VERIFIED)
ctx.db.player.identity.update({ ...currentPlayer, currentHealth: nextOwned.currentHealth });
```
`requirePlayer` (index.ts:677) and `findOwnedRow` (index.ts:694) already exist — reuse them. `SenderError` is already imported at the top of index.ts.

### Pattern 3: Pure decision helper, cross-boundary tested
**What:** Extract the reducer's branching decision into a dependency-free function so vitest can test it without a DB (reducers can't run under vitest).
**Example:**
```typescript
// Source: spacetimedb/src/gachaOverflow.ts (VERIFIED — the proven Phase 1 pattern)
export interface DupeGrantOutcome { constellation: number; shardMinted: number; }
export function resolveDupeGrant(current, max, shardPerOverflow): DupeGrantOutcome { … }

// Phase 2 mirror — spacetimedb/src/transcendInstall.ts (NEW):
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
The reducer then does: call the helper; on `!ok` map `reason` → `SenderError('…')`; on `ok` deduct `result.shardCost` from `player.transcendShards` and set `owned.transcendLevel = result.nextLevel`.

Test import path (Source: `gachaOverflow.test.ts:5`, VERIFIED):
`import { resolveTranscendInstall } from '../../../../spacetimedb/src/transcendInstall';`

### Pattern 4: Pure client scaling module + game-loop feed
**What:** Combat math lives in a dependency-free module; the game loop holds a mutable `activeTranscend` set by App.tsx from the subscribed row.
**Example:**
```typescript
// src/game/combat/transcendScaling.ts (NEW — mirror comboSystem.ts style)
import { CONSTELLATION_DAMAGE_STEP } from '../data/constellations'; // 0.08, already exported (VERIFIED :6)
import { TRANSCEND_DAMAGE_STEP } from '../data/constants';          // 0.05, already exported (VERIFIED :9)

export function transcendDamageMultiplier(constellation: number, transcend: number): number {
  return 1 + constellation * CONSTELLATION_DAMAGE_STEP + transcend * TRANSCEND_DAMAGE_STEP;
}

// createGame.ts — replace local const (VERIFIED @391-393); feed via a setter mirroring
// setActiveConstellation (VERIFIED @807-808). Consumed unchanged at :417 (attack) & :485 (skill).
let activeTranscend = 0;
// interface (:99) gains: setActiveTranscend(level: number): void;
// setter:  setActiveTranscend(level) { activeTranscend = level; }
// use:     transcendDamageMultiplier(activeConstellation, activeTranscend)
```
```typescript
// App.tsx — build transcendById from the subscribed rows (mirror constellationById @188-192),
// then push it in the SAME effect that already calls setActiveConstellation (VERIFIED @366-371):
gameRef.current?.setActiveTranscend(transcendById[active] ?? 0);
// add ownedCharacterRows dep is already present in that effect's dep array.
```

### Pattern 5: Server heal scaling (one line)
**What:** Extend the healer's multiplier by transcend level.
**Example:**
```typescript
// healParty — Source: index.ts:1504-1508 (VERIFIED)
const healActivated = healer
  ? activatedConstellationFor(ctx, healer.owner, healer.characterId, healer.constellation)
  : 0;
const healMultiplier = 1 + healActivated * HEAL_CONSTELLATION_STEP;   // existing
// Phase 2: add the transcend term (healer is the active owned row, so healer.transcendLevel):
//   + (healer ? healer.transcendLevel : 0) * TRANSCEND_HEAL_STEP
```
`TRANSCEND_HEAL_STEP` is already declared server-side (index.ts:80). Healers are identified by
`stats.healType !== 'none'` (index.ts:1501) — no new role lookup needed.

### Anti-Patterns to Avoid
- **Editing `src/ui/CharacterSheet.tsx`.** It is DEAD CODE — no file imports it (verified: grep for `CharacterSheet` outside its own file returns nothing). The LIVE character UI is `src/ui/CharacterScreen.tsx`, wired in `App.tsx:474`. The CONTEXT/spec name `CharacterSheet.tsx` by legacy; retarget to `CharacterScreen.tsx`.
- **Re-declaring the transcend constants.** All four already exist server-side (index.ts:78-84) and client-side (constants.ts:8-15). `serverSync.test.ts:132-137` already guards them. Reference, never redefine.
- **Trusting a caller-supplied identity or cost.** Ownership comes from `ctx.sender` → `findOwnedRow`; the shard cost comes from the server `TRANSCEND_SHARD_COST` constant only. Never accept a level/cost/owner from the reducer args beyond `characterId`.
- **Computing the heal amount on the client.** The server owns the heal number (index.ts:1513); the client only calls `sendHealParty(combo)` (createGame.ts:492). Transcend heal scaling is server-only.
- **Publishing with `-c` / `--delete-data`.** That wipes accounts+players. This column is additive → migrate-publish WITHOUT `-c` (CONTEXT + PROGRESS.md workflow).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Identity / ownership | A custom identity arg or map | `requirePlayer(ctx)` + `findOwnedRow(ctx, player, characterId)` (index.ts:677, 694) | Canonical account-identity resolution + owner-filtered lookup already handle device→account bridging. |
| Balance-check + reject | `throw new Error(...)` | `throw new SenderError('…')` (already imported) | `SenderError` surfaces cleanly to the client; matches every existing reducer (`pullBanner`, `setConstellation`). |
| Testing the reducer decision | A mock DB / integration harness | Extract `resolveTranscendInstall` to `spacetimedb/src/transcendInstall.ts` and unit-test cross-boundary | Reducers can't run under vitest; Phase 1 proved the extract-and-cross-import pattern (`gachaOverflow.ts`/`.test.ts`). |
| Client damage math | Inline arithmetic in the loop | `transcendDamageMultiplier()` pure module in `src/game/combat/` | Matches `comboSystem.ts`; unit-testable without three.js/DB. |
| Feeding live state into the game loop | New subscription | Reuse the `owned_character` `useTable` rows already in App.tsx (:94) + the existing scaling effect (:366-371) | The rows are already subscribed and re-render on install; only a new setter call is needed. |
| Migration safety | `--delete-data`/manual SQL | `.default(0)` additive column + migrate-publish | STDB backfills defaulted columns; proven twice already (`transcendShards`, `droppedAtMicros`). |

**Key insight:** This phase is 90% reuse. The only genuinely new artifacts are two small pure
functions and their tests; everything else is a copy-shape of an existing reducer, effect, or column.

## Common Pitfalls

### Pitfall 1: Editing the dead `CharacterSheet.tsx`
**What goes wrong:** You add the Install button + `T{n}` badge to `CharacterSheet.tsx`, build passes, but nothing changes in-game.
**Why it happens:** `CharacterSheet.tsx` is orphaned — no import references it. The live screen is `CharacterScreen.tsx` (App.tsx:474).
**How to avoid:** Target `CharacterScreen.tsx`. Its shard chip (line 171-173) and constellation-toggle button (343-361) are the exact spots to extend.
**Warning signs:** Playtest shows no Install button despite green build.

### Pitfall 2: Forgetting to regenerate bindings after the schema change
**What goes wrong:** Client code references `row.transcendLevel` / `conn.reducers.transcendCharacter` and TypeScript errors, or the reducer call 404s ("no such reducer").
**Why it happens:** `src/module_bindings/` is generated from the published module; a new column/reducer isn't visible to the client until regeneration.
**How to avoid:** Publish local first, then `pnpm run spacetime:generate`, THEN edit client code, THEN `pnpm build`. Order matters.
**Warning signs:** `Property 'transcendLevel' does not exist` or runtime "no such reducer".

### Pitfall 3: Publishing to only one environment / with the wrong module path
**What goes wrong:** Client hits a server whose module lacks the reducer.
**Why it happens:** The `spacetime:publish*` npm scripts point at `--module-path server` (WRONG — the module is `spacetimedb/`). Also local vs maincloud drift.
**How to avoid:** Use the explicit command from PROGRESS.md/CLAUDE.md: `spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb --server local -y` (no `-c`). Ignore the npm publish scripts.
**Warning signs:** "no such reducer" at runtime despite a green build.

### Pitfall 4: `u32` underflow on shard deduction
**What goes wrong:** Deducting more shards than the player has wraps a `u32` to a huge number.
**Why it happens:** `transcendShards` is `t.u32()`; the balance check must precede the subtraction.
**How to avoid:** The `resolveTranscendInstall` `insufficient_shards` branch gates the deduct — never subtract on the reject path. Deduct exactly `result.shardCost` only inside the `ok` branch.
**Warning signs:** A player who installs while broke suddenly shows a 4-billion shard balance.

### Pitfall 5: `serverSync.test.ts` breaks on a stray edit
**What goes wrong:** The sync test regex-extracts `CHARACTER_STATS`, `BANNERS`, and the transcend constants from the server source; a formatting change to those literals can fail extraction.
**Why it happens:** The test parses source text, not runtime values (index.ts is imported as a string, serverSync.test.ts:28).
**How to avoid:** Don't reformat the constant declarations (index.ts:78-84) or `CHARACTER_STATS` single-line entries. Add `transcendLevel` to the table, not to the parsed constant blocks.
**Warning signs:** `X not found in server source` assertion failures.

## Code Examples

Covered inline in Architecture Patterns 1–5 above (all `[VERIFIED: codebase]` with file:line anchors). No external code sources were required.

## State of the Art

Not applicable — no framework/version decisions in this phase. The relevant "state" is the
in-repo convention set already established:

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Inline reducer logic | Extract pure decision → cross-boundary vitest | Phase 1 (`gachaOverflow.ts`) | Phase 2 must follow: extract `resolveTranscendInstall`. |
| `primogem` currency | `gems` + `transcendShards` two-tier | Phase A / Phase 1 | `transcendShards` already on `player` (index.ts:290). |

**Deprecated/outdated:**
- `src/ui/CharacterSheet.tsx` — superseded by `CharacterScreen.tsx`; leave untouched (out of scope to delete this phase).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The active healer row in `healParty` is `healer` (the active owned character), so `healer.transcendLevel` is the correct scaling source. | Pattern 5 | LOW — `healer` is resolved as the active character's owned row (index.ts:1504); if wrong, healers scale by the wrong char's level. Verify during playtest with a transcended healer. |
| A2 | Feeding `transcendLevel` via a `setActiveTranscend` setter parallel to `setActiveConstellation` keeps damage in sync with the active character. | Pattern 4 | LOW — mirrors the proven constellation path exactly; the same App.tsx effect fires on `ownedCharacterRows` change. |

*Both assumptions are LOW risk and confirmable in the required playtest. Everything else is `[VERIFIED: codebase]`.*

## Open Questions

1. **Where exactly to place the `T{n}` badge + Install button in `CharacterScreen.tsx`.**
   - What we know: the constellation tab (index.ts screen lines 329-366) and the character card header (221-239) are the natural homes; the shard chip already sits in the topbar (171-173).
   - What's unclear: exact layout/copy — explicitly Claude's Discretion per CONTEXT.
   - Recommendation: add a compact "Pārsniegšana / T{n}" row under the constellation list with an Install button gated by `transcendShards >= TRANSCEND_SHARD_COST(nextLevel) && transcendLevel < MAX_TRANSCEND_LEVEL && constellation >= 6`. Reuse the `con-item` button styling.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `spacetime` CLI | publish + generate bindings | Assumed ✓ (used every prior phase) | — | none — blocks deploy step |
| `pnpm` | build/test/generate | Assumed ✓ (repo standard) | — | none — never use npm (crashes on symlink layout) |
| local `spacetimedb-standalone` | additive publish + playtest | Assumed ✓ | — | none — required for the `--server local` publish |

**Missing dependencies with no fallback:** none identified — this toolchain shipped Phases A/0/1.
**Note:** No probing was run this session (Windows/PowerShell env); availability is inferred from the fact that every prior phase used this exact toolchain. The planner may add a `checkpoint:human-verify` that `spacetime` + `pnpm` respond before the deploy task.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (`"test": "vitest run"`) `[VERIFIED: package.json]` |
| Config file | vitest via vite (no standalone config needed; tests live in `**/__tests__/*.test.ts`) |
| Quick run command | `pnpm test src/game/combat/__tests__/transcendScaling.test.ts src/game/data/__tests__/transcendInstall.test.ts` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-transcend-install | `transcendDamageMultiplier(c, t)` extends correctly: `(6,0)=1.48`, `(6,1)=1.53`, `(6,10)=1.98`, `(0,0)=1` | unit (pure) | `pnpm test transcendScaling` | ❌ Wave 0 (`src/game/combat/__tests__/transcendScaling.test.ts`) |
| REQ-transcend-install | Install ok → `{ok, nextLevel, shardCost: cost(nextLevel)}`; deducts exactly `cost(n)` for level n | unit (pure, cross-boundary) | `pnpm test transcendInstall` | ❌ Wave 0 (`src/game/data/__tests__/transcendInstall.test.ts`) |
| REQ-transcend-install | Reject when constellation < C6 → `reason:'below_c6'` | unit | `pnpm test transcendInstall` | ❌ Wave 0 |
| REQ-transcend-install | Reject at `MAX_TRANSCEND_LEVEL` cap → `reason:'at_cap'` | unit | `pnpm test transcendInstall` | ❌ Wave 0 |
| REQ-transcend-install | Reject when `shards < cost(nextLevel)` → `reason:'insufficient_shards'` | unit | `pnpm test transcendInstall` | ❌ Wave 0 |
| REQ-transcend-install | Cost-curve: level n costs n shards (n = 1,2,5,10) | unit | `pnpm test transcendInstall` | ❌ Wave 0 |
| REQ-transcend-install | Client/server transcend constants stay mirrored | unit | `pnpm test serverSync` | ✅ (must stay green — serverSync.test.ts:132-137) |
| REQ-transcend-install | Install deducts shards, damage rises, `C6·T{n}` shows | manual playtest | webapp-testing skill | manual (DoD requires it) |

### Sampling Rate — required edge cases (from CONTEXT DoD)
Boundary sampling is where install bugs hide; the pure `transcendInstall` unit MUST cover:
- **Cap boundary:** `currentTranscend = MAX_TRANSCEND_LEVEL - 1` → ok (nextLevel = MAX); `currentTranscend = MAX_TRANSCEND_LEVEL` → `at_cap`.
- **Exact-shard boundary:** `shards === cost(nextLevel)` → ok; `shards === cost(nextLevel) - 1` → `insufficient_shards`.
- **C5 rejection:** `constellation = 5` (one below C6) → `below_c6`, regardless of shards.
- **Cost curve:** parametrize `n ∈ {1,2,5,10}` asserting `shardCost === n` (mirror `transcendence.test.ts:28`).
- **Damage multiplier:** parametrize `(constellation, transcend)` including `(6,0)`, `(6,MAX)`, `(0,0)`.

- **Per task commit:** `pnpm test transcendScaling transcendInstall` (fast, the two new units)
- **Per wave merge:** `pnpm test` (full suite — `serverSync`, `gachaOverflow`, all combat)
- **Phase gate:** full suite green + `pnpm build` green before `/gsd-verify-work`; then the required playtest (earn shards → install → confirm damage numbers rise + shards drop by the cost curve).

### Wave 0 Gaps
- [ ] `src/game/combat/__tests__/transcendScaling.test.ts` — covers REQ-transcend-install (pure damage math). Mirror `comboSystem.test.ts`.
- [ ] `src/game/data/__tests__/transcendInstall.test.ts` — covers REQ-transcend-install (server decision, all 4 branches + cost curve). Mirror `gachaOverflow.test.ts` (cross-boundary import from `spacetimedb/src/transcendInstall.ts`).
- No framework install needed — vitest is configured and running (23 existing test files).

## Security Domain

`security_enforcement: true`, ASVS level 1. This phase mutates a scarce currency + persistent
character power, so access-control and input-validation controls are load-bearing.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Business Logic | yes | Server-authoritative amounts: shard cost from the `TRANSCEND_SHARD_COST` server constant only; cap enforced server-side; balance check precedes deduction (no `u32` underflow). |
| V4 Access Control | yes | `requirePlayer(ctx)` resolves the canonical identity from `ctx.sender`; `findOwnedRow` scopes to the caller's owned characters. Caller can only transcend a character they own. Never trust a caller-supplied owner/identity. |
| V5 Input Validation | yes | Reducer accepts only `characterId: t.string()`; non-owned/unknown id → `SenderError('Character not owned')`. No client-supplied level, cost, or shard delta. |
| V6 Cryptography | no | No crypto in this phase. |
| V2 Auth / V3 Session | no (unchanged) | Auth handled upstream by the accounts system; this reducer only reads the already-authenticated `ctx.sender`. |

### Known Threat Patterns for {STDB reducer + currency}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client forges the shard cost or transcend delta | Tampering | Args limited to `characterId`; cost/level derived server-side from constants + the stored row. |
| Caller transcends someone else's character | Elevation of Privilege / Spoofing | Ownership via `ctx.sender` → `findOwnedRow`; reject non-owned. |
| Install while broke → `u32` underflow to a huge balance | Tampering | `insufficient_shards` gate before any subtraction (Pitfall 4). |
| Bypass the C6 gate or the level cap | Tampering | `below_c6` / `at_cap` branches in `resolveTranscendInstall`, unit-tested at the boundaries. |
| Non-determinism leaking into the reducer | (Repudiation / consistency) | Pure helper is `ctx`/random/time-free (mirrors `gachaOverflow.ts` header rationale) — preserves reducer determinism (CLAUDE.md rule 2). |

This mirrors the T-1-01 threat class already documented in `spacetimedb/src/gachaOverflow.ts`
(server-derived amounts, never client-supplied) — the same mitigation applies verbatim here.

## Sources

### Primary (HIGH confidence) — codebase, verified this session
- `spacetimedb/src/index.ts` — constants @78-84; `player.transcendShards` @287-290; `owned_character` @375-388; `character_activation` @394-406; helpers `requirePlayer` @677, `ownsCharacter` @685, `findOwnedRow` @694, `healAmountFor` @708; `setActiveCharacter` @961, `setConstellation` @986; `healParty` @1496-1529; `grantCharacter` @1555; `pullBanner` @1595-1604.
- `spacetimedb/src/gachaOverflow.ts` — the pure-helper pattern to mirror.
- `src/game/createGame.ts` — multiplier @391-393, consumed @417 & @485; interface @99; `setActiveConstellation` @807-808; `sendHealParty` @492.
- `src/App.tsx` — `useTable` subscriptions @93-101; row-shaping @168-202; scaling effect @366-371; UI prop-passing @450-491.
- `src/ui/CharacterScreen.tsx` — shard chip @171-173, constellation button @343-361 (live UI).
- `src/ui/CharacterSheet.tsx` — confirmed DEAD (no external import).
- `src/ui/ConstellationRing.tsx` — ring component (shared).
- `src/game/data/constants.ts` @8-15; `src/game/data/constellations.ts` @6 (`CONSTELLATION_DAMAGE_STEP`); `src/game/data/characters.ts` @337-346 (`HEALERS`/`healSpecFor`).
- Tests: `serverSync.test.ts` (@132-137 transcend guard), `transcendence.test.ts`, `gachaOverflow.test.ts`, `comboSystem.ts`.
- `package.json` scripts (`test`, `spacetime:generate`, `build`).
- `CLAUDE.md`, `.planning/transcendence/PROGRESS.md`, phase-2 spec, REQUIREMENTS.md — contracts.

### Secondary / Tertiary
- None — no web or external documentation sources were needed or used.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; all libs already exercised in-repo.
- Architecture: HIGH — every pattern is a copy-shape of verified, shipped code with file:line anchors.
- Pitfalls: HIGH — derived from reading the live files (dead `CharacterSheet.tsx`, `-c` wipe risk, binding-regen order, `u32` underflow, source-parsing sync test).

**Research date:** 2026-07-06
**Valid until:** 2026-08-05 (stable — internal patterns; only invalidated by large refactors of index.ts/createGame.ts/App.tsx)
