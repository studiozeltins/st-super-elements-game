# Phase 1: Crit foundation - Research

**Researched:** 2026-07-08
**Domain:** SpacetimeDB TypeScript module — pure-helper extraction, client↔server stat mirror (INV-5), test-first vitest
**Confidence:** HIGH (entirely codebase-internal; every claim verified by grep/read against live source)

## Summary

Phase 1 is a **data + tested-pure-logic** slice with zero runtime behavior change. Everything needed
already has an established, verified pattern in this repo — there is nothing novel to design, only to
mirror. Crit stats attach to the existing single-line `CharacterDefinition` (client) / `CHARACTER_STATS`
(server) entries; the INV-5 parity mechanism (`serverSync.test.ts`) already regex-extracts those
single-line literals and is trivially extended. The base-damage math to mirror
(`WEAPONS`, `regularAttackMultiplier`, `skillAttackMultiplier`, `transcendDamageMultiplier`,
`skill.damage`) is small and pure. The zero-import helper + cross-boundary vitest pattern is already
proven by four sibling files (`deathPenalty.ts`, `partyRules.ts`, `transcendInstall.ts`,
`gachaOverflow.ts`), each with a test in `src/game/data/__tests__/` importing across `../../../../spacetimedb/src/…`.

**Primary recommendation:** Put the crit stats **inline** on the existing one-line character entries
(client + server), and put ALL the mirrored base-damage math (`WEAPONS` copy + the three multiplier
funcs + `computeBaseDamage`) in a new zero-import `spacetimedb/src/damage.ts`, with `rollCrit` in a new
`spacetimedb/src/crit.ts`. Write the tests in `src/game/data/__tests__/` (crit.test.ts, damage.test.ts)
importing the real helpers across the package boundary — do NOT create `*.test.ts` files inside
`spacetimedb/` (no such file exists there today; server tests live client-side and import across). Extend
`serverSync.test.ts` to assert crit parity (regex, works today) and weapon/multiplier parity (prefer
import-and-compare against the `damage.ts` exports over brittle regex).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-character `critRate`/`critDmg` values | Client data (`characters.ts`) | Server mirror (`CHARACTER_STATS`) | Client is the authoring source of truth; server mirrors for INV-5 and (Phase 2) the authoritative roll |
| `rollCrit(rate, dmg, rng)` pure helper | Server sibling (`crit.ts`) | — | Server owns the roll in Phase 2 via `ctx.random`; Phase 1 builds+tests it, wired to nothing |
| `computeBaseDamage(...)` + mirrored `WEAPONS`/multipliers | Server sibling (`damage.ts`) | — | Base damage becomes server-authoritative (Option B); Phase 1 mirrors + tests the math only |
| INV-5 parity enforcement | Test (`serverSync.test.ts`) | — | Client/server drift is caught in CI, not at runtime |
| Determinism ("grep-gate") | Discipline (no automated test today) | — | Convention: no `Math.random`/`Date.now` in `spacetimedb/src`; Phase 1 must not introduce them |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** `critRate`/`critDmg` are role-seeded then hand-tuned per character. Baseline by role
  (dps ~30–35% rate / high critDmg, tank ~12%, healer/support ~18%), then tune each of the 17
  characters for identity. Must be DISTINCT per character (CRIT-01) and coherent with the existing
  `Role` system. Values live on `CharacterDefinition` (client) and are mirrored into server
  `CHARACTER_STATS` (INV-5 parity).
- **D-02:** Executor may pick the concrete per-character numbers (role-seeded first pass); user tunes
  in playtest. Keep them legibly different so crit frequency/magnitude reads differently between
  characters (Success Criterion 1).
- **D-05 (Phase-1 portion only):** The server mirrors `WEAPONS` (damage/range/isRanged) + the
  multiplier funcs (`regularAttackMultiplier`, `skillAttackMultiplier`, combo scale,
  `transcendDamageMultiplier`) + skill damage into `spacetimedb/src`, as tested pure code.
  **No reducer wiring in Phase 1.** Planner MUST record the server-knows-vs-passed pre-check for Phase 2.
- **D-07:** Skill and basic damage both flow through `attackEnemies` server-side (indistinguishable);
  a single per-character `critRate` auto-covers skills. Phase 1 must ensure `computeBaseDamage` can
  compute *skill* base damage too (mirror `skill.damage` + `skillAttackMultiplier`).
- **D-08:** Crit roll uses `ctx.random` (Phase 2). Phase 1 helper takes an injected `rng` param and
  MUST NOT introduce `ctx.random`/`Math.random`/`Date.now` into `spacetimedb/src`.
- **Cross-cutting (ROADMAP):** additive schema only; server-authoritative; INV-5 mirror parity;
  test-first zero-import pure helpers; ≤300 LOC/file, never grow `index.ts`; one atomic commit per phase.

### Claude's Discretion
- Concrete per-character `critRate`/`critDmg` numbers (role-seeded first pass — D-02).
- Exact `critDmg` semantics (full multiplier vs bonus fraction) — see Open Questions Q1.
- Where exactly the mirrored `WEAPONS`/multiplier math lives (recommendation: `damage.ts`).
- The parity-test mechanism for weapon/multiplier constants (recommendation: import-and-compare).

### Deferred Ideas (OUT OF SCOPE for Phase 1)
- Reducer wiring, dropping the `damage` arg, `ctx.random` roll (Phase 2).
- The crit event table + deleting client `rollDamage` (Phase 2).
- PVP `attackPlayer` path (Phase 3).
- Weapon/constellation crit *contributions* / stacking (XCMB-02, v2).
- Attack FSM / telegraphs / poise (Phases 4–7).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CRIT-01 | Each character has distinct `critRate`/`critDmg`, replacing the global `Math.random()<0.22 → ×1.9`. | Add two fields to `CharacterDefinition` (`characters.ts:51`) + 17 inline entries; role baselines from D-01. The client roll itself is NOT deleted in Phase 1 (that is Phase 2) — CRIT-01's *stat existence* lands here, the *replacement* completes in Phase 2. |
| CRIT-03 | Per-character crit mirrored into server `CHARACTER_STATS`; `serverSync.test.ts` asserts client/server crit parity (INV-5). | Add crit fields inline to each `CHARACTER_STATS` entry (`index.ts:43-65`); extend `serverSync.test.ts` with a `readField`-based crit parity block (decimals already supported by its regex). |
</phase_requirements>

## Standard Stack

No external packages. Everything is in-repo and already installed.

| Tool | Version | Purpose | Source |
|------|---------|---------|--------|
| vitest | 3.2.4 | Test runner for the pure helpers + parity | `[VERIFIED: package.json:49]` |
| spacetimedb | 2.6.* | Server module runtime (not touched at runtime in Phase 1) | `[VERIFIED: package.json:27]` |
| TypeScript | ~5.6.2 | — | `[VERIFIED: package.json:46]` |
| pnpm | (repo standard) | Package manager — use `pnpm`, never `npm i` | `[CITED: MEMORY pnpm-package-manager]` |

**Test command:** `pnpm test` → runs `vitest run` `[VERIFIED: package.json:12]`.
No install step. No new dependency. **Package Legitimacy Audit: N/A — Phase 1 installs no external packages.**

## Architecture Patterns

### System Architecture Diagram (Phase 1 deliverables, wired to nothing)

```
CLIENT (authoring source of truth)                 SERVER (mirror, un-wired in Phase 1)
──────────────────────────────────                 ────────────────────────────────────
src/game/data/characters.ts                        spacetimedb/src/index.ts
  CharacterDefinition                                 CHARACTER_STATS  (line 43-65)
    + critRate  ────────── INV-5 parity ───────────►    + critRate     (inline per entry)
    + critDmg   ────────── serverSync.test.ts ─────►    + critDmg
                                                    spacetimedb/src/damage.ts   [NEW, zero-import]
src/game/data/weapons.ts                              WEAPONS mirror
  WEAPONS  ───────────── mirror + parity ──────────►    regularAttackMultiplier
src/game/combat/comboSystem.ts                         skillAttackMultiplier
  regularAttackMultiplier ─────────────────────────►    transcendDamageMultiplier
  skillAttackMultiplier                                 computeBaseDamage(...)   ← pure, no rng
src/game/combat/transcendScaling.ts                 spacetimedb/src/crit.ts     [NEW, zero-import]
  transcendDamageMultiplier                            rollCrit(rate, dmg, rng) ← rng injected

TEST (client vitest runner, imports across the package boundary)
────────────────────────────────────────────────────────────────
src/game/data/__tests__/crit.test.ts     → imports ../../../../spacetimedb/src/crit
src/game/data/__tests__/damage.test.ts   → imports ../../../../spacetimedb/src/damage
src/game/data/__tests__/serverSync.test.ts (EXTEND) → crit parity + weapon/multiplier parity
```

No arrows cross into a reducer in Phase 1. `attackEnemies` (1814), `attackRay` (1899),
`attackPlayer` (1060) are UNTOUCHED this phase.

### Pattern 1: Inline single-line stat on the character entry (INV-5-safe)
**What:** Both `CharacterDefinition` (client) and `CHARACTER_STATS` (server) store each character as a
**single-line** object literal. `serverSync.test.ts` relies on this (its extractor forbids nested braces
per entry).
**Why it matters:** Add `critRate`/`critDmg` as flat scalar fields on the same line, NOT as a nested
`{ crit: {...} }` object — a nested object would break the parity extractor.
```typescript
// client — src/game/data/characters.ts (add fields to interface + every entry)
volta: { id:'volta', ..., role:'dps', hairColor:0x7a4fd8, critRate: 0.34, critDmg: 1.9, skill: ... },
// server — spacetimedb/src/index.ts CHARACTER_STATS (mirror the two numbers on the same line)
volta: { stars: 5, maxHealth: 1000, healthRegen: 0, role: 'dps', critRate: 0.34, critDmg: 1.9, ...NO_HEAL },
```
`[VERIFIED: characters.ts:93-364, index.ts:43-65]`

### Pattern 2: Zero-import server sibling + cross-boundary vitest (the crit.ts/damage.ts template)
**What:** A pure helper lives in `spacetimedb/src/<name>.ts` importing nothing; its test lives in
`src/game/data/__tests__/<name>.test.ts` and imports the *real* helper across the boundary.
**Proven by four existing pairs** — mirror any of them verbatim:
```typescript
// src/game/data/__tests__/deathPenalty.test.ts:5  [VERIFIED]
import { applyDeathShardPenalty } from '../../../../spacetimedb/src/deathPenalty';
// src/game/data/__tests__/partyRules.test.ts:5     [VERIFIED]
import { canAccept, nextLeader } from '../../../../spacetimedb/src/partyRules';
```
`spacetimedb/src/resistances.ts` and `combatMath.ts` are further examples of the zero-import sibling
shape. `[VERIFIED: resistances.ts, combatMath.ts]`

### Pattern 3: RNG injection (forward-compatible with Phase 2's `ctx.random`)
**What:** `ctx.random()` returns a float in `[0.0, 1.0)` `[CITED: CLAUDE.md Reducer Context API]`.
`createSeededRandom(seed)` returns a `() => number` thunk over the same range
`[VERIFIED: spacetimedb/src/rng.ts:4-12]`. `ctx.random` is itself callable (has `.integerInRange`/`.fill`
methods but is invoked as `ctx.random()`).
**Recommended signature** (Phase-1 helper, wired to nothing):
```typescript
// spacetimedb/src/crit.ts  — zero-import, no ctx, no Math.random
export function rollCrit(critRate: number, critDmg: number, rng: () => number): { isCrit: boolean; multiplier: number } {
  const isCrit = rng() < critRate;
  return { isCrit, multiplier: isCrit ? critDmg : 1 };
}
```
In Phase 2 the reducer calls `rollCrit(stat.critRate, stat.critDmg, ctx.random)` — `ctx.random` slots
straight into the `rng: () => number` param. Tests inject a stub (`() => 0.1` forces crit, `() => 0.99`
forces no-crit) for deterministic assertions.

### Anti-Patterns to Avoid
- **Growing `index.ts`.** It is already **3286 LOC** — the repo's worst monolith `[VERIFIED: wc -l]`.
  Phase 1 adds ONLY the two inline crit fields per `CHARACTER_STATS` entry to `index.ts`; all new logic
  goes in `crit.ts`/`damage.ts` siblings. Do NOT put `WEAPONS`/multipliers inline in `index.ts`.
- **Creating `*.test.ts` inside `spacetimedb/`.** There are zero such files today `[VERIFIED: Glob]`;
  `spacetime build` compiles that dir into the wasm module. Keep tests client-side, importing across.
- **Nested crit object on the character entry.** Breaks `serverSync.test.ts`'s single-line extractor
  (Pattern 1).
- **Introducing `Math.random`/`Date.now` into `spacetimedb/src`.** Currently zero occurrences
  `[VERIFIED: grep spacetimedb/src]`. The helper takes an injected `rng` instead (D-08).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Combo → damage ramp | A fresh multiplier formula server-side | Port `regularAttackMultiplier`/`skillAttackMultiplier` VERBATIM from `comboSystem.ts:19-32` into `damage.ts` | Parity test compares the two; any drift fails INV-5 |
| Transcend/constellation ramp | New scaling | Port `transcendDamageMultiplier` from `transcendScaling.ts:10-12` (note it pulls `CONSTELLATION_DAMAGE_STEP` + `TRANSCEND_DAMAGE_STEP` — inline those two constants to stay zero-import) | Same math the client uses |
| Cross-boundary test wiring | A local re-implementation of the helper in the test | Import the real helper across `../../../../spacetimedb/src/…` | Four existing pairs prove it; a re-impl defeats the parity |
| Parity extraction | Ad-hoc string parsing | Reuse `serverSync.test.ts`'s `readField`/`extractServerStats` helpers (already handle decimals via `[\w.]`) | Established, green |

**Key insight:** Phase 1 is almost entirely *copying existing pure math to a new file and pinning it
with a parity test*. The only genuinely new logic is the 3-line `rollCrit`.

## Runtime State Inventory

> This is a **greenfield data/logic phase** (no rename, no migration, no runtime wiring). No stored
> data, live service config, OS-registered state, secrets, or build artifacts are touched.
> **Confirmed:** additive-only in-code changes; no `spacetime publish` behavior change; the new tables
> for the crit event land in Phase 2, not here. Nothing to inventory.

## Common Pitfalls

### Pitfall 1: The "grep-gate" is a discipline, not an automated test
**What goes wrong:** The planner assumes a CI test enforces "no `Math.random`/`Date.now` in
`spacetimedb/src`" and plans to "keep it green."
**Reality:** No such test exists. `grep` across the repo found the phrase only in planning docs and the
`serverWorldSim.test.ts` header comment — there is **no assertion** that fails on `Math.random`
`[VERIFIED: grep Math.random|Date.now|grep|gate across repo]`. Current `spacetimedb/src` has **zero**
occurrences `[VERIFIED]`.
**How to avoid:** Phase 1 simply must not introduce them (the injected-`rng` design guarantees this).
Whether to *add* an automated grep-gate test is a discretion call — see Open Questions Q3; leaning
out-of-scope for a data/logic phase.
**Warning sign:** A plan task titled "keep grep-gate green" implies a test that isn't there.

### Pitfall 2: `serverSync.test.ts` extractor is line-fragile
**What goes wrong:** `extractServerStats` matches `(\w+):\s*\{([^}]*)\}` — a per-character body with a
nested `{}` (e.g. a `crit: { rate, dmg }` sub-object) silently fails to parse `[VERIFIED: serverSync.test.ts:55]`.
**How to avoid:** Keep crit fields flat + on one line (Pattern 1). Its `readField` regex
`${name}:\s*'?([\w.]+)'?` already captures decimals, so `critRate: 0.34` parses fine `[VERIFIED:44]`.
**Warning sign:** New CHARACTER_STATS parity test returns `NaN` for a crit field.

### Pitfall 3: `transcendDamageMultiplier` is not self-contained
**What goes wrong:** Copying `transcendScaling.ts` into `damage.ts` naively drags in
`import { CONSTELLATION_DAMAGE_STEP } from '../data/constellations'` and `TRANSCEND_DAMAGE_STEP` from
`'../data/constants'` `[VERIFIED: transcendScaling.ts:1-2]`, breaking the zero-import rule.
**How to avoid:** Inline both numeric constants into `damage.ts` and add a parity assertion so they
can't drift from the client constants (mirror how `serverSync.test.ts` already checks
`TRANSCEND_DAMAGE_STEP` at line 152).

### Pitfall 4: Weapon/multiplier parity has no existing regex path
**What goes wrong:** `serverSync.test.ts` currently proves character/constant/gacha parity by *regex over
`index.ts` text*. If the mirrored `WEAPONS`/multipliers live in `damage.ts`, a regex over `index.ts`
finds nothing.
**How to avoid:** Because `damage.ts` is a zero-import importable module, assert parity by **importing
both sides and comparing** (client `WEAPONS` vs `damage.ts`'s mirror; client `regularAttackMultiplier(c)`
vs server's over sampled `c`) — strictly more robust than regex. This mirrors the existing
`regularEnemyBaseGems` test which rebuilds the formula and compares outputs `[VERIFIED: serverSync.test.ts:213-229]`.

## Code Examples

### Base-damage computation to mirror (client, `createGame.ts`)
```typescript
// src/game/createGame.ts:504-508 — regular attack base damage  [VERIFIED]
const baseDamage =
  weapon.damage *
  regularAttackMultiplier(combo) *
  transcendDamageMultiplier(activeConstellation, activeTranscend);
// createGame.ts:575-577 — skill base uses skillAttackMultiplier + skill.damage  [VERIFIED]
damageMultiplier:
  skillAttackMultiplier(combo) *
  transcendDamageMultiplier(activeConstellation, activeTranscend),
// (skill base damage = activeCharacter.skill.damage * that multiplier, applied in effectSystem)
```
`skill.damage` lives on `SkillDefinition.damage` `[VERIFIED: characters.ts:43]`; per-character skill
damage values at `characters.ts:106-359` (e.g. `skill('earthquake','…','nova',220,10,…)` → 220).

### Recommended `computeBaseDamage` shape (server, `damage.ts`, all inputs passed → zero-import)
```typescript
// spacetimedb/src/damage.ts  [NEW — zero-import]
export const WEAPONS = { /* verbatim mirror of src/game/data/weapons.ts:13-59 */ } as const;
export function regularAttackMultiplier(combo: number): number { /* port comboSystem.ts:23-25 */ }
export function skillAttackMultiplier(combo: number): number { /* port comboSystem.ts:30-32 */ }
export function transcendDamageMultiplier(constellation: number, transcend: number): number { /* port transcendScaling.ts:10-12, constants inlined */ }

export function computeBaseDamage(input: {
  weaponId: keyof typeof WEAPONS; skillDamage: number | null; // null = basic attack
  combo: number; constellation: number; transcend: number;
}): number {
  const base = input.skillDamage ?? WEAPONS[input.weaponId].damage;
  const ramp = input.skillDamage != null
    ? skillAttackMultiplier(input.combo)
    : regularAttackMultiplier(input.combo);
  return base * ramp * transcendDamageMultiplier(input.constellation, input.transcend);
}
```
All inputs are plain args (no `ctx`, no table reads) so it stays a pure, importable, testable sibling.

## Server-knows-vs-passed pre-check (Phase 2 handoff — informational; confirms Phase-1 mirror completeness)

Verified against `index.ts`. This determines that `computeBaseDamage`'s inputs are satisfiable
server-side in Phase 2:

| Input to base damage | Server already knows? | Source | Phase-2 disposition |
|----------------------|----------------------|--------|---------------------|
| Acting character id | ✅ YES | `player.activeCharacterId` `[VERIFIED: index.ts:313, 771]` | Server reads it; not passed |
| Weapon | ✅ YES (derived) | `WEAPONS[CHARACTERS[activeCharacterId].weapon]` — from the mirrored stat | Derived server-side |
| Constellation | ✅ YES | `ownedCharacter.constellation` `[VERIFIED: index.ts:439]`, looked up via `findOwnedRow(ctx, player, activeCharacterId)` `[VERIFIED: index.ts:816, 1098]` | Server reads it; not passed |
| Transcend level | ✅ YES | `ownedCharacter.transcendLevel` `[VERIFIED: index.ts:444]`, same lookup | Server reads it; not passed |
| Combo | ❌ CLIENT-SIDE today | `createGame.ts` local `combo` var `[VERIFIED: createGame.ts:265,407]`; already sent as `comboCount` arg and clamped server-side to `MAX_COMBO_FOR_GEMS = 100` `[VERIFIED: index.ts:209,1833,1929]` | **Must be passed** as intent (already is, already bounded) |
| Basic vs skill | ❌ Indistinguishable server-side | Both arrive via `attackEnemies` `[VERIFIED: resistances.ts:14-17]` | **Must be passed** as a discriminator (new intent field in Phase 2) |

**Conclusion for Phase 1:** `computeBaseDamage` taking `{ weaponId | characterId, skillDamage|null,
combo, constellation, transcend }` as plain args is correct and future-proof — every input is either
server-derivable (character/weapon/constellation/transcend) or a bounded client intent (combo,
basic-vs-skill). Nothing forces a table import into the helper.

## State of the Art

| Old Approach (today) | Phase-1 change | Later |
|----------------------|----------------|-------|
| Global client crit `Math.random()<0.22 → ×1.9` (`createGame.ts:478-489`) | UNCHANGED (still rolls) — Phase 1 only *adds* per-char stats + un-wired server helpers | Deleted in Phase 2 |
| No server crit stats | `critRate`/`critDmg` mirrored into `CHARACTER_STATS` | Rolled via `ctx.random` in Phase 2 |
| Client computes base damage, sends number | UNCHANGED | Server computes it in Phase 2 (drops `damage` arg) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Role baselines (dps ~30–35% / tank ~12% / healer-support ~18%) are sensible first-pass numbers | User Constraints D-01 | Low — D-02 explicitly defers final numbers to user playtest tuning |
| A2 | `critDmg` stored as a full multiplier (e.g. `1.9`) rather than a bonus fraction (`0.9`) | Open Q1 | Low — internal convention; pin it once and the parity test enforces it. Recommend full-multiplier to match the existing `×1.9`. |
| A3 | A `*.test.ts` inside `spacetimedb/` would be swept into `spacetime build` | Anti-Patterns | Low — established practice already keeps tests client-side; the recommendation holds regardless |

## Open Questions (RESOLVED)

> All three resolved into the plans at `/gsd-plan-phase 1` — the executor faces no ambiguity.
> 1 → RESOLVED: store full multiplier (`critDmg = 1.9`). 2 → RESOLVED: import-and-compare parity.
> 3 → RESOLVED: grep-gate stays a discipline (out-of-scope for this data/logic phase), grep used as an acceptance-check only.

1. **`critDmg` semantics — full multiplier vs bonus fraction.** [RESOLVED → full multiplier]
   - Known: the value it replaces is a full multiplier `×1.9` (`createGame.ts:479`).
   - Unclear: store `critDmg = 1.9` (multiplier) or `critDmg = 0.9` (bonus, Genshin-style) with
     `multiplier = 1 + critDmg`.
   - Recommendation: store the **full multiplier** (`rollCrit` returns `isCrit ? critDmg : 1`) — least
     surprising vs the current `×1.9`, and XCMB-02 stacking can still add fractions later. Pin it in
     both the helper and the mirror; the parity test locks it.

2. **Weapon/multiplier parity mechanism.** [RESOLVED → import-and-compare]
   - Recommendation (Pitfall 4): import-and-compare `damage.ts` exports against client
     `WEAPONS`/`comboSystem`/`transcendScaling`, rather than regex over `index.ts`. Robust and matches
     the existing `regularEnemyBaseGems` output-comparison test.

3. **Add an automated grep-gate test now?** [RESOLVED → out-of-scope; grep as acceptance-check only]
   - Known: none exists; Phase 1 introduces no `Math.random`/`Date.now`.
   - Recommendation: treat as out-of-scope for this data/logic phase (or a tiny optional task) — flag
     for the planner rather than silently expanding scope.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| vitest | test-first helpers + parity | ✓ | 3.2.4 | — |
| pnpm | dependency mgmt (none added) | ✓ | repo standard | — |
| SpacetimeDB CLI | NOT needed in Phase 1 (no publish; no runtime change) | n/a | — | — |

No missing dependencies. Phase 1 is code + tests only; **no `spacetime publish` / `generate` / build-deploy
is required** (per CONTEXT "no wiring, no behavior change"). The deploy steps in the ROADMAP apply from
Phase 2 onward.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.2.4 |
| Config file | `vitest.config.ts` (globals, jsdom env, `setupFiles: ./src/setupTests.ts`) `[VERIFIED]` |
| Discovery | vitest default include (`**/*.{test,spec}.…`); no custom `include`, so any `*.test.ts` outside `node_modules` is picked up. Established convention: server-sibling tests live in `src/game/**/__tests__/` importing across the boundary. |
| Quick run command | `pnpm test` (`vitest run`) |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CRIT-01 | Every character has a distinct `critRate`/`critDmg`; role-coherent | unit | `pnpm test -- characters` (extend `characters.test.ts` with distinctness + range asserts) | ✅ exists — extend |
| CRIT-03 | Client↔server crit parity | unit | `pnpm test -- serverSync` (extend with crit parity block) | ✅ exists — extend |
| CRIT-03 / D-05 | Weapon-damage + multiplier parity | unit | `pnpm test -- serverSync` (add import-and-compare block) | ✅ exists — extend |
| D-08 helper | `rollCrit(rate,dmg,rng)` crit/no-crit branches via injected rng | unit | `pnpm test -- crit` | ❌ Wave 0 (`crit.test.ts`) |
| D-05 helper | `computeBaseDamage` for basic + skill; combo/transcend ramp | unit | `pnpm test -- damage` | ❌ Wave 0 (`damage.test.ts`) |

### Sampling Rate
- **Per task commit:** `pnpm test -- <file>` (targeted).
- **Per wave merge / phase gate:** `pnpm test` (full suite green) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/game/data/__tests__/crit.test.ts` — `rollCrit` branches (stub `rng` = `() => 0.1` / `() => 0.99`), covers the D-08 helper.
- [ ] `src/game/data/__tests__/damage.test.ts` — `computeBaseDamage` basic vs skill, combo & transcend ramps.
- [ ] Extend `src/game/data/__tests__/serverSync.test.ts` — crit parity + weapon/multiplier parity (CRIT-03/D-05).
- [ ] Extend `src/game/data/__tests__/characters.test.ts` — per-character crit distinctness + role-coherent ranges (CRIT-01).
- No framework install needed (vitest already present).

## Security Domain

> Phase 1 adds **no runtime attack surface** — it only adds data fields and un-wired pure helpers. The
> security *payoff* (closing the client damage/crit spoof) lands in Phases 2–3 when the helpers are
> wired. Recorded here for completeness.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | Deferred (Phase 2) | Combo/intent args already clamped (`MAX_COMBO_FOR_GEMS`, `MAX_HIT_DAMAGE`) — kept as defense-in-depth |
| V6 Cryptography / RNG | Partial | Crit roll will use SpacetimeDB deterministic `ctx.random` (Phase 2); Phase 1 injects a generic `rng` param, never `Math.random` |
| V4 Access Control | N/A Phase 1 | `ctx.sender` authority is a reducer concern (Phase 2) |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation | Phase-1 relevance |
|---------|--------|---------------------|-------------------|
| Client-sent damage/crit inflation (PVP shard theft incentive) | Tampering | Server-authoritative base damage + `ctx.random` crit | The *helpers* enabling this are built+tested here; wired Phase 2–3 |
| Non-deterministic module logic | — | No `Math.random`/`Date.now` in `spacetimedb/src`; inject rng | Enforced by the Phase-1 helper design |

## Sources

### Primary (HIGH confidence) — all codebase-internal, read this session
- `src/game/data/characters.ts` — `CharacterDefinition` (51-69), `Role`/`ROLE_META` (7-31), 17-char roster (93-364), `SkillDefinition.damage` (43), `healSpecFor` (390).
- `src/game/data/weapons.ts` — `WEAPONS` shape + values (1-59).
- `src/game/createGame.ts` — client crit roll (478-489), `performAttack` base damage (491-549), `performSkill` (552-586), combo lifecycle (265, 407, 890).
- `src/game/combat/comboSystem.ts` — `regularAttackMultiplier` (23-25), `skillAttackMultiplier` (30-32).
- `src/game/combat/transcendScaling.ts` — `transcendDamageMultiplier` (10-12) + its two imported constants (1-2).
- `spacetimedb/src/index.ts` — `CHARACTER_STATS` (33-65), `player.activeCharacterId` (313), `ownedCharacter.constellation`/`transcendLevel` (439/444), `findOwnedRow` (816/1098), clamps `MAX_HIT_DAMAGE=400` (153) / `MAX_COMBO_FOR_GEMS=100` (209), reducers `attackPlayer` (1060) / `attackEnemies` (1814) / `attackRay` (1899); 3286 LOC total.
- `spacetimedb/src/resistances.ts` — basic/skill indistinguishable server-side (14-19).
- `spacetimedb/src/rng.ts` — `createSeededRandom` returns `() => number` in [0,1) (4-12).
- `spacetimedb/src/combatMath.ts` — zero-import sibling exemplar.
- `src/game/data/__tests__/serverSync.test.ts` — INV-5 extractor `readField`/`extractServerStats` (43-68), constant parity (144-161), formula-compare exemplar (213-229).
- `src/game/data/__tests__/deathPenalty.test.ts:5`, `partyRules.test.ts:5` — cross-boundary import pattern.
- `package.json` — vitest 3.2.4, `test` script, deps.
- `vitest.config.ts` — runner config.
- `.planning/config.json` — `nyquist_validation: true`, `security_enforcement: true`.

### Secondary (MEDIUM)
- `CLAUDE.md` — `ctx.random()` returns [0.0,1.0); ≤300 LOC/file no-monolith rule; pnpm; deploy workflow.
- MEMORY: `pure-helper-testing-discipline`, `pnpm-package-manager`, `spacetimedb-migrate-gotchas`.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no external deps; all in-repo and version-pinned.
- Architecture / patterns: HIGH — every pattern verified against ≥1 live exemplar in this repo.
- Pitfalls: HIGH — each pitfall traced to a specific verified line (extractor fragility, non-self-contained
  import, absent grep-gate, monolith size).

**Research date:** 2026-07-08
**Valid until:** ~2026-08-07 (stable; codebase-internal, no fast-moving external deps)
