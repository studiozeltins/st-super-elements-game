# Phase 1: Crit foundation - Pattern Map

**Mapped:** 2026-07-08
**Files analyzed:** 6 (2 CREATE helpers, 2 CREATE tests, 3 MODIFY — one modify is a test)
**Analogs found:** 6 / 6 (every file has a proven in-repo template)

> **CORRECTION (verify against live code):** CONTEXT.md and RESEARCH.md both say "18 characters".
> The live roster is **17** (`characters.test.ts:37-41` asserts `toHaveLength(17)`; 10 five-star + 7
> four-star). `CHARACTER_STATS` has 17 entries (`index.ts:44-64`). Plans MUST touch **all 17**, and
> any new distinctness/count assertion must use 17, not 18.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `spacetimedb/src/crit.ts` (CREATE) | utility (pure helper) | transform | `spacetimedb/src/deathPenalty.ts` | exact (zero-import sibling) |
| `spacetimedb/src/damage.ts` (CREATE) | utility (pure helper) | transform | `spacetimedb/src/combatMath.ts` + client `comboSystem.ts`/`transcendScaling.ts`/`weapons.ts` | exact (zero-import sibling; math ported verbatim) |
| `src/game/data/__tests__/crit.test.ts` (CREATE) | test | request-response | `src/game/data/__tests__/deathPenalty.test.ts` | exact (cross-boundary import) |
| `src/game/data/__tests__/damage.test.ts` (CREATE) | test | request-response | `src/game/data/__tests__/deathPenalty.test.ts` | exact (cross-boundary import) |
| `src/game/data/characters.ts` (MODIFY) | model (data registry) | CRUD (static) | its own existing entries + `CharacterDefinition` interface | exact (in-file) |
| `spacetimedb/src/index.ts` `CHARACTER_STATS` (MODIFY) | model (data mirror) | CRUD (static) | its own existing `CHARACTER_STATS` entries | exact (in-file) |
| `src/game/data/__tests__/serverSync.test.ts` (MODIFY) | test | request-response | its own `readField`/`extractServerStats` + `regularEnemyBaseGems` block | exact (in-file) |

---

## Pattern Assignments

### `spacetimedb/src/crit.ts` (utility, transform) — CREATE

**Analog:** `spacetimedb/src/deathPenalty.ts` (zero-import pure-helper sibling; also `combatMath.ts`, `rng.ts`).

**Zero-import file-header + pure-function shape** (`deathPenalty.ts:1-33`) — copy the doc-comment discipline (why dependency-free, why deterministic) then a plain exported function, NO `import` lines:
```typescript
// Pure ... decision, kept dependency-free so it can be unit-tested directly under
// the client's vitest runner (same pattern as transcendInstall.ts). No ctx/db/import,
// no random, no time — this preserves the calling reducer's determinism (CLAUDE.md rule 2).
export interface DeathShardPenalty { ... }
export function applyDeathShardPenalty(...): DeathShardPenalty { ... }
```

**RNG-injection signature** (recommended by RESEARCH §Pattern 3; `ctx.random` is `() => number` in `[0,1)`, matching `rng.ts:4` `createSeededRandom` return type). The helper takes an injected `rng` — it MUST NOT reference `Math.random`/`ctx`/`Date.now`:
```typescript
export function rollCrit(critRate: number, critDmg: number, rng: () => number): { isCrit: boolean; multiplier: number } {
  const isCrit = rng() < critRate;
  return { isCrit, multiplier: isCrit ? critDmg : 1 };
}
```
`critDmg` is stored as a **full multiplier** (e.g. `1.9`, matching the value it replaces — see next section) so `multiplier = isCrit ? critDmg : 1`. Pin this convention; the parity test locks it.

---

### `spacetimedb/src/damage.ts` (utility, transform) — CREATE

**Analog:** `spacetimedb/src/combatMath.ts` (zero-import math sibling) for the file shape; the **math to port verbatim** lives in three client files below. Parity is enforced by import-and-compare (see serverSync section), so the port must be exact.

**Port target 1 — `WEAPONS` (verbatim mirror of `src/game/data/weapons.ts:1-59`):** copy the `WeaponId` union, `WeaponDefinition` interface, and the full `WEAPONS` record. Concrete values that must match: `sword 60`, `greatsword 110`, `spear 70`, `bow 55` (`isRanged`), `book 65` (`isRanged`). Export as `const … as const`.

**Port target 2 — combo multipliers (verbatim from `src/game/combat/comboSystem.ts:19-32`):**
```typescript
const REGULAR_RAMP_PER_COMBO = 0.02;
const REGULAR_RAMP_CAP = 0.75;
export function regularAttackMultiplier(combo: number): number {
  return 1 + Math.min(REGULAR_RAMP_CAP, Math.max(0, combo) * REGULAR_RAMP_PER_COMBO);
}
const SKILL_RAMP_PER_COMBO = 0.12;
export function skillAttackMultiplier(combo: number): number {
  return 1 + Math.max(0, combo) * SKILL_RAMP_PER_COMBO;
}
```

**Port target 3 — transcend multiplier (from `src/game/combat/transcendScaling.ts:10-12`).** WATCH: the client version imports its two constants (`transcendScaling.ts:1-2`). To stay zero-import, INLINE both numeric constants:
```typescript
const CONSTELLATION_DAMAGE_STEP = 0.08;  // mirror src/game/data/constellations.ts:6
const TRANSCEND_DAMAGE_STEP = 0.05;      // mirror src/game/data/constants.ts:9
export function transcendDamageMultiplier(constellation: number, transcend: number): number {
  return 1 + constellation * CONSTELLATION_DAMAGE_STEP + transcend * TRANSCEND_DAMAGE_STEP;
}
```
**NOTE for the parity test:** `index.ts:83` already declares `const TRANSCEND_DAMAGE_STEP = 0.05` and `serverSync.test.ts:152` already regex-checks it against the client. `CONSTELLATION_DAMAGE_STEP` is currently **NOT** in `index.ts` (only client-side). The new inlined constant in `damage.ts` is the server's first copy of it — add a parity assertion for it.

**Port target 4 — `computeBaseDamage` (new; mirrors the client base-damage expressions).** The client math this reproduces is `createGame.ts:504-508` (regular) and `createGame.ts:575-577` + `skill.damage` (skill):
```typescript
// client regular (createGame.ts:504-508):
const baseDamage = weapon.damage * regularAttackMultiplier(combo) * transcendDamageMultiplier(activeConstellation, activeTranscend);
// client skill (createGame.ts:575-577): skill.damage * skillAttackMultiplier(combo) * transcendDamageMultiplier(...)
```
Recommended pure shape (all inputs passed → zero table reads; `skillDamage: null` = basic attack):
```typescript
export function computeBaseDamage(input: {
  weaponId: keyof typeof WEAPONS; skillDamage: number | null;
  combo: number; constellation: number; transcend: number;
}): number {
  const base = input.skillDamage ?? WEAPONS[input.weaponId].damage;
  const ramp = input.skillDamage != null ? skillAttackMultiplier(input.combo) : regularAttackMultiplier(input.combo);
  return base * ramp * transcendDamageMultiplier(input.constellation, input.transcend);
}
```
`skill.damage` values live on `SkillDefinition.damage` (`characters.ts:43`), e.g. `terron` earthquake = 220 (`characters.ts:120`).

---

### `src/game/data/__tests__/crit.test.ts` and `damage.test.ts` (test) — CREATE

**Analog:** `src/game/data/__tests__/deathPenalty.test.ts` (also `partyRules.test.ts`).

**Cross-boundary import** (`deathPenalty.test.ts:1-7`) — import the REAL helper across the package boundary, never re-implement it in the test:
```typescript
import { describe, expect, it } from 'vitest';
// Import the real helper across the package boundary (server module → client vitest
// runner), same mechanism as transcendInstall.test.ts — not a local re-implementation.
import { applyDeathShardPenalty } from '../../../../spacetimedb/src/deathPenalty';
```
So: `crit.test.ts` → `import { rollCrit } from '../../../../spacetimedb/src/crit';`
and `damage.test.ts` → `import { computeBaseDamage, WEAPONS, regularAttackMultiplier, skillAttackMultiplier, transcendDamageMultiplier } from '../../../../spacetimedb/src/damage';`

**Branch-per-case assertion style** (`deathPenalty.test.ts:9-30`) — one `it()` per branch, `toEqual` on the full return object:
```typescript
describe('applyDeathShardPenalty', () => {
  it('has-shards branch: spends shards, erodes nothing', () => {
    expect(applyDeathShardPenalty(2, 3, 6, SHARD_DEATH_LOSS)).toEqual({ shardsLost: SHARD_DEATH_LOSS, ... });
  });
```
For `crit.test.ts`: stub `rng` deterministically — `() => 0.1` forces crit (returns `{ isCrit: true, multiplier: critDmg }`), `() => 0.99` forces no-crit (`{ isCrit: false, multiplier: 1 }`); test a boundary at `rng() === critRate`.
For `damage.test.ts`: basic vs skill (`skillDamage: null` vs a number), combo ramp (combo 0 vs high), transcend ramp (constellation/transcend 0 vs non-zero).

---

### `src/game/data/characters.ts` (model) — MODIFY

**Analog:** its own `CharacterDefinition` interface (`characters.ts:51-69`) + each single-line entry (e.g. `aeris` at `characters.ts:94-107`).

**Interface addition** — add two flat scalar fields beside `healthRegen`/`role` (`characters.ts:59-65`), mirroring the existing JSDoc style:
```typescript
  /** Passive health regenerated per second (0 = no regen). */
  healthRegen: number;
  /** Base critical-hit chance [0,1] (server-rolled in Phase 2). */
  critRate: number;
  /** Critical-hit damage as a FULL multiplier (e.g. 1.9). */
  critDmg: number;
  role: Role;
```

**Per-entry addition — all 17 characters.** Each entry is a multi-line object literal here (unlike the server), so add the two fields on their own line, e.g. for `aeris` (`characters.ts:94-107`):
```typescript
    healthRegen: 0,
    role: 'support',
    critRate: 0.18,   // support baseline (D-01)
    critDmg: 1.5,
    hairColor: 0xd8f5e8,
```
Role baselines (D-01, first-pass, user tunes later): dps ~0.30–0.35 rate / high critDmg (~1.9+), tank ~0.12, healer/support ~0.18. Keep values legibly DISTINCT per character (CRIT-01). Existing roles per character are in `CHARACTER_STATS` below and on each client entry.

---

### `spacetimedb/src/index.ts` `CHARACTER_STATS` (model) — MODIFY

**Analog:** its own `CharacterStat` interface (`index.ts:33-41`) + the 17 single-line entries (`index.ts:44-64`).

**CRITICAL — single-line, flat, NO nested braces.** `serverSync.test.ts`'s extractor (`serverSync.test.ts:55`) matches each entry with `(\w+):\s*\{([^}]*)\}` — a nested `{}` in an entry body breaks it. Add `critRate`/`critDmg` as flat fields on the SAME line:
```typescript
// interface (index.ts:33-41): add two number fields
interface CharacterStat { stars: 4 | 5; maxHealth: number; healthRegen: number; role: ...; critRate: number; critDmg: number; healType: HealType; healMode: HealMode; healPower: number; }
// entries (index.ts:44-64), same line — e.g.:
aeris: { stars: 5, maxHealth: 950, healthRegen: 0, role: 'support', critRate: 0.18, critDmg: 1.5, ...NO_HEAL },
volta: { stars: 5, maxHealth: 1000, healthRegen: 0, role: 'dps', critRate: 0.34, critDmg: 1.9, ...NO_HEAL },
```
Existing 17 ids + roles to mirror: `aeris`(support), `terron`(tank), `volta`(dps), `silva`(dps), `marina`(healer), `ignis`(tank), `sarma`(dps), `nereida`(healer), `vesper`(dps), `glacia`(tank), `zefs`(support), `petra`(tank), `zibo`(dps), `lapa`(healer), `rasa`(healer), `dzirkste`(dps), `stindzis`(dps). Every `critRate`/`critDmg` must EXACTLY equal the client value for the same id (INV-5).

Anti-pattern (RESEARCH): do NOT add `WEAPONS`/multipliers inline here — `index.ts` is already 3286 LOC (worst monolith). Only the two crit fields per entry land in `index.ts`; all math goes in `damage.ts`.

---

### `src/game/data/__tests__/serverSync.test.ts` (test) — MODIFY

**Analog:** its own `readField`/`extractServerStats` (`serverSync.test.ts:43-68`), the role-parity block (`serverSync.test.ts:107-119`), the constant-parity table (`serverSync.test.ts:144-161`), and the formula-compare exemplar `regularEnemyBaseGems` (`serverSync.test.ts:213-229`).

**Crit parity (regex path, works today).** Extend `ServerStat` (`serverSync.test.ts:31-39`) with `critRate`/`critDmg`, populate them in `extractServerStats` via the existing `readField` (its regex `${name}:\s*'?([\w.]+)'?` at line 44 already captures decimals like `0.34`), then add an `it.each` block mirroring the role-match test (`serverSync.test.ts:114-119`):
```typescript
stats[id] = { ...existing, critRate: Number(readField(body, 'critRate')), critDmg: Number(readField(body, 'critDmg')) };
// then:
it.each(...)('%s crit matches server CHARACTER_STATS', id => {
  expect(serverStats[id].critRate).toBe(CHARACTERS[id].critRate);
  expect(serverStats[id].critDmg).toBe(CHARACTERS[id].critDmg);
});
```

**Weapon + multiplier parity (import-and-compare, NOT regex — RESEARCH Pitfall 4).** The mirrored math lives in `damage.ts`, so regex over `index.ts` finds nothing. Import both sides and compare outputs, mirroring the `regularEnemyBaseGems` rebuild-and-compare block (`serverSync.test.ts:213-229`):
```typescript
import { WEAPONS as CLIENT_WEAPONS } from '../weapons';
import { regularAttackMultiplier as clientRegular, skillAttackMultiplier as clientSkill } from '../../combat/comboSystem';
import { transcendDamageMultiplier as clientTranscend } from '../../combat/transcendScaling';
import { WEAPONS as SERVER_WEAPONS, regularAttackMultiplier as serverRegular, skillAttackMultiplier as serverSkill, transcendDamageMultiplier as serverTranscend } from '../../../../spacetimedb/src/damage';
// assert WEAPONS deep-equal; sample combos/constellation/transcend and expect server fn === client fn.
```
Also assert the inlined `CONSTELLATION_DAMAGE_STEP` (0.08) matches the client — it has no `index.ts` regex path (unlike `TRANSCEND_DAMAGE_STEP`, already at `serverSync.test.ts:152`); prove it via the `transcendDamageMultiplier` output comparison at `constellation=1, transcend=0`.

**Also extend `characters.test.ts`** (`characters.test.ts`, roster-integrity `it.each` at line 9) with per-character crit distinctness + role-coherent range asserts (CRIT-01). Use roster length **17**, not 18.

---

## Shared Patterns

### Zero-import pure-helper sibling
**Source:** `spacetimedb/src/deathPenalty.ts`, `combatMath.ts`, `rng.ts` (all import nothing).
**Apply to:** `crit.ts`, `damage.ts`.
Header comment states WHY dependency-free (vitest-testable, preserves reducer determinism), then plain `export function`/`export interface`. No `import` line, no `ctx`, no `Math.random`, no `Date.now` (currently ZERO such occurrences in `spacetimedb/src` — do not introduce; D-08).

### Cross-boundary vitest import
**Source:** `src/game/data/__tests__/deathPenalty.test.ts:5`, `partyRules.test.ts` (via 4 proven pairs).
**Apply to:** `crit.test.ts`, `damage.test.ts`, and the new `damage.ts` import in `serverSync.test.ts`.
Tests live client-side under `src/game/data/__tests__/`, import the real helper via `../../../../spacetimedb/src/<name>`. NEVER create `*.test.ts` inside `spacetimedb/` (zero exist; `spacetime build` sweeps that dir into the wasm).

### INV-5 client↔server mirror parity
**Source:** `serverSync.test.ts:43-119` (`readField`/`extractServerStats` regex) + `:213-229` (import-and-compare).
**Apply to:** every crit value (regex path) and every weapon/multiplier constant (import-and-compare path). Keep server `CHARACTER_STATS` entries single-line/flat so the extractor parses them.

---

## No Analog Found

None. Every Phase-1 file maps to a verified in-repo template.

## Metadata

**Analog search scope:** `spacetimedb/src/` (14 sibling modules), `src/game/data/`, `src/game/combat/`, `src/game/data/__tests__/`.
**Files scanned:** deathPenalty.ts, rng.ts, combatMath.ts, weapons.ts, comboSystem.ts, transcendScaling.ts, characters.ts, index.ts (CHARACTER_STATS + constants), createGame.ts (crit/damage path), serverSync.test.ts, deathPenalty.test.ts, characters.test.ts, constants.ts, constellations.ts.
**Pattern extraction date:** 2026-07-08
</content>
</invoke>
