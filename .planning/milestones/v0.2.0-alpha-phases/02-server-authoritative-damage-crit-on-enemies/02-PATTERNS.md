# Phase 2: Server-authoritative damage + crit on enemies - Pattern Map

**Mapped:** 2026-07-08
**Files analyzed:** 9 (2 new, 7 modified)
**Analogs found:** 9 / 9 (every file has a same-repo analog — this is a wiring phase, no greenfield)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `spacetimedb/src/skillGate.ts` (NEW) | utility (pure helper) | transform | `spacetimedb/src/crit.ts` | exact (same zero-import pure-helper genre) |
| `src/game/data/__tests__/skillGate.test.ts` (NEW) | test | transform | `src/game/data/__tests__/crit.test.ts` | exact (cross-boundary import-real-helper) |
| `spacetimedb/src/damage.ts` (`CHARACTER_COMBAT` add) | model (data mirror) | transform | `WEAPONS` block in the SAME file | exact |
| `src/game/data/__tests__/serverSync.test.ts` (parity add) | test | transform | `WEAPONS` deep-equal block (lines 286-315) in the same file | exact |
| `spacetimedb/src/index.ts` — `enemy_hit` event table | model (event table) | event-driven / pub-sub | `rangedAttack` / `pvpHit` event tables (index.ts:529-551) | exact |
| `spacetimedb/src/index.ts` — `skillReadyAt`/window player state + gated `castSkill` | model (column) + controller (reducer) | request-response | `player.transcendShards` `.default` column (328) + current `castSkill` (1647) | exact |
| `spacetimedb/src/index.ts` — `attackEnemies`/`attackRay` rework + `resolvePlayerHit` glue | controller (reducer) | request-response | current reducer bodies (1816/1901) + `takeDamage` owned-row composition (1692-1698) | exact |
| `src/game/createGame.ts` — delete crit roll, intent send, local prediction | service (game loop) | request-response | current `performAttack`/`performSkill`/`dealDamage` (365-586) | exact (self-rework) |
| `src/App.tsx` — subscribe + `onInsert` `enemy_hit`, reducer bindings | provider (STDB wiring) | event-driven | `rangedAttack`/`pvpHit` `onInsert` (162-222) + reducer bindings (613-616) | exact |
| `createEntityRenderer.ts` / `createGame.ts` — drop HP-delta number, keep bar reveal | component (renderer) | event-driven | `onHealthDrop` block (createEntityRenderer.ts:175-181) | exact (self-rework) |

---

## Pattern Assignments

### `spacetimedb/src/skillGate.ts` (NEW — utility, pure/transform)

**Analog:** `spacetimedb/src/crit.ts` (whole file, 21 LOC) — the canonical zero-import injected-seam pure helper.

**Copy the file-header discipline verbatim** (crit.ts:1-8): a comment block stating "Zero dependencies, no global randomness, no wall-clock time — every input is a plain argument, so the calling reducer stays deterministic." CRITICAL per RESEARCH Pitfall 6 + LEARNINGS: the grep-gate matches `import`/`Math.random`/`Date.now`/`ctx` **even inside comments** — the header must not contain those literal tokens. crit.ts phrases around them successfully; mirror that phrasing.

**Exported signatures** (from RESEARCH §Skill Cooldown Gate, already spec'd):
```typescript
export function skillGrantActive(isSkill: boolean, nowMicros: bigint, windowEndsAtMicros: bigint): boolean {
  return isSkill && nowMicros <= windowEndsAtMicros;
}
export function nextSkillReadyAt(nowMicros: bigint, cooldownSeconds: number): bigint {
  return nowMicros + BigInt(Math.round(cooldownSeconds * 1_000_000));
}
```
Note `bigint` math (`_1_000_000` micros) mirrors the existing `AGGRO_DURATION_MICROS`/`droppedAtMicros` bigint convention already in index.ts.

---

### `src/game/data/__tests__/skillGate.test.ts` (NEW — test)

**Analog:** `src/game/data/__tests__/crit.test.ts` (whole file, 25 LOC).

**Copy the cross-boundary import idiom exactly** (crit.test.ts:3-5):
```typescript
// Import the real helper across the package boundary (server module → client vitest
// runner), same mechanism as deathPenalty.test.ts — not a local re-implementation.
import { skillGrantActive, nextSkillReadyAt } from '../../../../spacetimedb/src/skillGate';
```
**Boundary-case discipline** (crit.test.ts:17 pins strict `<`): pin the window boundary — `nowMicros === windowEndsAtMicros` MUST still grant (`<=`), one micro past must NOT. Cover: in-window skill → true; out-of-window skill → false; `isSkill=false` → always false; `nextSkillReadyAt` returns `now + cooldown*1e6` rounded. RESEARCH Test Map rows: skill-window gate + combo-clamp are Wave 0.

---

### `spacetimedb/src/damage.ts` — add `CHARACTER_COMBAT` mirror (model/data)

**Analog:** the `WEAPONS` block in the SAME file (damage.ts:21-68) — a `Record` keyed literal with a mirror-comment.

**Copy the mirror-comment + flat-literal convention** (damage.ts:21 `// Mirror of src/game/data/weapons.ts WEAPONS — values must match exactly.`). RESEARCH Pitfall 3: keep each entry **single-line flat** (no nested/multi-line braces) so it survives any regex scrape, and because the parity is import-and-compare it is formatting-robust. Source of truth = `src/game/data/characters.ts` (`CHARACTERS[id].weapon`, `.skill.damage`, `.skill.cooldownSeconds`; interface at characters.ts:39-49,57).

```typescript
export interface CharacterCombat {
  weaponId: WeaponId;            // CHARACTERS[id].weapon
  skillDamage: number;          // CHARACTERS[id].skill.damage
  skillCooldownSeconds: number; // CHARACTERS[id].skill.cooldownSeconds
}
export const CHARACTER_COMBAT: Record<string, CharacterCombat> = {
  aeris: { weaponId: 'sword', skillDamage: /*…*/, skillCooldownSeconds: /*…*/ },
  // …all ids present in CHARACTER_STATS (index.ts:46-66) …
};
```
The existing 17-ish ids are enumerated in `CHARACTER_STATS` (index.ts:45-67) — the mirror MUST cover the same key set. `WeaponId` type already exported at damage.ts:9. Stays under the 300-LOC cap (file is 111 LOC).

---

### `src/game/data/__tests__/serverSync.test.ts` — `CHARACTER_COMBAT` parity (test)

**Analog:** the `describe('server damage.ts mirror stays in sync', …)` block (lines 286-315), specifically the `WEAPONS` deep-equal (287-289) and the `it.each` per-id iteration idiom.

**Copy the import-and-compare-OUTPUTS pattern** (header comment lines 282-285: "imports both sides and compares OUTPUTS … the only robust way to catch a drifted mirror"). Add to the existing import block (already imports `CHARACTERS` at line 4 and server `WEAPONS`/multipliers at 22-27):
```typescript
import { CHARACTER_COMBAT } from '../../../../spacetimedb/src/damage';
```
Then iterate every `CHARACTERS[id]` and assert `CHARACTER_COMBAT[id].weaponId === CHARACTERS[id].weapon`, `.skillDamage === CHARACTERS[id].skill.damage`, `.skillCooldownSeconds === CHARACTERS[id].skill.cooldownSeconds` (INV-5 / CRIT-06). Use `it.each(Object.keys(CHARACTERS))` mirroring the existing `it.each` style at 291/299.

---

### `spacetimedb/src/index.ts` — `enemy_hit` event table (model, pub-sub)

**Analog:** `pvpHit` (index.ts:529-535) for the minimal `{target, amount}` payload shape; `rangedAttack` (541-551) for the `attacker`-carries-identity + coords shape.

**Table declaration** — copy the `{ name, public: true, event: true }` options object and the `t.identity()`/`t.f32()`/`t.u32()`/`t.bool()` column builders exactly (pvpHit at 529, rangedAttack at 541):
```typescript
const enemyHit = table(
  { name: 'enemy_hit', public: true, event: true },
  {
    attacker: t.identity(),
    positionX: t.f32(),
    positionZ: t.f32(),
    amount: t.u32(),   // POST-clamp, POST-resist truth (RESEARCH: number == HP drop)
    isCrit: t.bool(),  // CRIT-04 visual + CRIT-05 authoritative flag
  }
);
```
**Register in `schema({…})`** — add `enemyHit,` to the object at index.ts:668-691 (alongside `rangedAttack`, `pvpHit`, `skillCast`). Event rows are never stored (CLAUDE.md event-table rule): insert one per landed hit inside the `attackEnemies`/`attackRay` loops at the entity's position with the resolved `{amount, isCrit}`.

---

### `spacetimedb/src/index.ts` — `skillReadyAt`/window state + gated `castSkill` (column + reducer)

**Column analog:** `player.transcendShards: t.u32().default(0)` (index.ts:328) and `gemDrop.droppedAtMicros: t.u64().default(0n)` (344). RESEARCH Pitfall 2: every new column gets `.default(…)` and is **appended** (never mid-table) so the additive migrate backfills populated maincloud rows without a wipe. For micros timestamps use `t.u64().default(0n)` (matches `droppedAtMicros`). Copy the inline rationale-comment style of line 326-327.

**Reducer analog:** current `castSkill` (index.ts:1647-1667) — keep its arg shape + `requirePlayer(ctx)` + `skillCast.insert(...)`, but insert the cooldown gate BEFORE the emit. RESEARCH §Skill Cooldown Gate + Pitfall 5: derive cooldown from SERVER `CHARACTER_COMBAT[currentPlayer.activeCharacterId].skillCooldownSeconds` — NEVER from the client-sent `skillId`. Pattern:
```typescript
const now = ctx.timestamp.microsSinceUnixEpoch;              // deterministic clock (CLAUDE.md)
if (now < currentPlayer.skillReadyAtMicros) return;          // reject; emit no skill_cast
const cc = CHARACTER_COMBAT[currentPlayer.activeCharacterId];
ctx.db.player.identity.update({ ...currentPlayer,
  skillReadyAtMicros: nextSkillReadyAt(now, cc.skillCooldownSeconds),
  skillWindowEndsAtMicros: now + SKILL_HIT_WINDOW_MICROS });
ctx.db.skillCast.insert({ /* … unchanged … */ });
```
`ctx.timestamp.microsSinceUnixEpoch` is already the established server clock (see attackEnemies:1833, takeDamage). `SKILL_HIT_WINDOW_MICROS` is a new top-level const near `MAX_COMBO_FOR_GEMS` (index.ts:211) — RESEARCH Open Q1 recommends ≈4.5-5s.

---

### `spacetimedb/src/index.ts` — `attackEnemies`/`attackRay` rework + `resolvePlayerHit` glue (reducer)

**Signature analog:** current `attackEnemies` arg object (index.ts:1817-1823). Drop `damage: t.u32()`, add `isSkill: t.bool()`, keep `comboCount: t.u32()`:
```typescript
{ centerX: t.f32(), centerZ: t.f32(), radius: t.f32(), isSkill: t.bool(), comboCount: t.u32() }
```
Same for `attackRay` (1902-1911): drop `damage`, add `isSkill`.

**Combo-clamp analog (D2-04):** REUSE the exact clamp already in these reducers — `const combo = Math.min(comboCount, MAX_COMBO_FOR_GEMS);` (index.ts:1835, 1931). It is already present for gems; feed the SAME clamped `combo` into `computeBaseDamage` before the uncapped `skillAttackMultiplier`.

**Composition-glue analog:** `takeDamage`'s owned-row + activation read (index.ts:1692-1698) is the template for the new `resolvePlayerHit(ctx, player, isSkill, combo, dmgType)` `index.ts` helper (NOT zero-import — it reads `ctx`; its PURE parts are tested):
```typescript
const owned = findOwnedRow(ctx, player, player.activeCharacterId);           // helper at index.ts:808
const constellation = activatedConstellationFor(                              // index.ts:2222
  ctx, player.identity, player.activeCharacterId, owned ? owned.constellation : 0);
const transcend = owned ? owned.transcendLevel : 0;                           // takeDamage:1695 idiom
const cc = CHARACTER_COMBAT[player.activeCharacterId];
const grantSkill = skillGrantActive(isSkill, now, player.skillWindowEndsAtMicros); // skillGate.ts
const base = computeBaseDamage({ weaponId: cc.weaponId,
  skillDamage: grantSkill ? cc.skillDamage : null, combo, constellation, transcend }); // damage.ts:101
const stat = CHARACTER_STATS[player.activeCharacterId];                       // index.ts:45
const { isCrit, multiplier } = rollCrit(stat.critRate, stat.critDmg, () => ctx.random()); // crit.ts:18
```
**Apply order (RESEARCH, load-bearing):** base → `× multiplier` → `resistedDamage(...)` → `Math.min(_, MAX_HIT_DAMAGE)`. `attackRay` MUST keep `resistedDamage(clampedDamage, GOLIATH_RESISTANCES, 'ranged')` (index.ts:1976, resistances.ts:39) so ranged goliath stays 10% — now applied to the server-computed raw, not the client `damage`. Keep the existing `Number.isFinite` guards + `MAX_HIT_RANGE`/`MAX_ATTACK_RADIUS`/`MAX_RANGED_HIT_RADIUS` clamps (1830-1832, 1926-1929) unchanged (defense-in-depth, SC4). Insert an `enemyHit` row per landed hit with POST-clamp `amount`.

---

### `src/game/createGame.ts` — delete client crit, send intent, local prediction (service)

**Delete (CLAUDE.md no-legacy, RESEARCH State-of-the-Art):** `CRIT_CHANCE`/`CRIT_MULTIPLIER`/`rollDamage` (createGame.ts:478-489) in the SAME slice. The `{ amount, kind } = rollDamage(baseDamage)` call sites (508, and its use at 527/534/538/549) collapse: the client keeps computing a **display-only** base (`weapon.damage * regularAttackMultiplier(combo) * transcendDamageMultiplier(...)`, already at 504-507; and the skill path's `skillAttackMultiplier(combo) * transcend…` at 575-577) purely to pop the instant local `'normal'` number (D2-01), then pops it via `damageNumbers.spawn(...)` locally — but no longer decides crit.

**Intent-send analog:** current `dealDamage` (370-383) calls `network.sendAttackEnemies(center.x, center.z, radius, Math.round(damage), combo)`. Rework to drop `damage`, add `isSkill`: `network.sendAttackEnemies(center.x, center.z, radius, isSkill, combo)`. The `Network` interface (createGame.ts:84-106) `sendAttackEnemies`/`sendAttackRay` signatures drop the `damage: number` param and add `isSkill: boolean` — RESEARCH Pitfall 4: change interface + both call sites (dealDamage:379, performAttack ranged send:520-529) in the same slice. Basic melee/skill both route through `dealDamage` → `sendAttackEnemies`; `performSkill` (552) passes `isSkill=true`, `performAttack` (491) passes `isSkill=false`. Bow launch (`sendAttackRay`:520) is basic-only today (`isSkill=false`).

---

### `src/App.tsx` — subscribe + `onInsert` `enemy_hit`, reducer bindings (provider)

**Subscription analog:** the `.subscribe([...])` list (App.tsx:112-136) — add `tables.enemyHit,` alongside `tables.rangedAttack`/`tables.pvpHit`.

**`onInsert` analog:** `rangedAttack` self-skip (170-175) + `pvpHit` attacker/bystander branch (201-215). Copy the `attack.attacker.toHexString() === myIdentityRef.current` self-skip idiom exactly for the double-draw suppression (D2-02):
```typescript
useTable(tables.enemyHit, {
  onInsert: hit => {
    if (hit.attacker.toHexString() === myIdentityRef.current) {
      if (hit.isCrit) gameRef.current?.spawnWorldNumber(hit.positionX, hit.positionZ, hit.amount, 'crit'); // upgrade own crit only
      return; // own non-crit already drawn by local prediction
    }
    gameRef.current?.spawnWorldNumber(hit.positionX, hit.positionZ, hit.amount, hit.isCrit ? 'crit' : 'normal');
  },
});
```
(The `spawnWorldNumber` game-handle method is new — mirror the existing `spawnSelfNumber`/`flashRemoteHealth` handle methods used at 209/212/220.)

**Reducer-binding analog:** `App.tsx:613-616`. Drop `damage`, add `isSkill`:
```typescript
sendAttackEnemies: (centerX, centerZ, radius, isSkill, comboCount) =>
  connection.reducers.attackEnemies({ centerX, centerZ, radius, isSkill, comboCount }),
sendAttackRay: (originX, originZ, directionX, directionZ, range, hitRadius, isSkill, comboCount) =>
  connection.reducers.attackRay({ originX, originZ, dirX: directionX, dirZ: directionZ, range, hitRadius, isSkill, comboCount }),
```
Requires `spacetime generate` after the reducer signatures change (regenerates `src/module_bindings/`).

---

### `createEntityRenderer.ts` / `createGame.ts` — drop HP-delta number, keep bar reveal (component)

**Analog / target:** the `onHealthDrop` block (createEntityRenderer.ts:175-181) has a DUAL role — it (a) sets `existing.lastDamagedAt = elapsedSeconds` (reveals the health-bar overlay) AND (b) calls `onHealthDrop(...)` which spawns the floating number (wired at createGame.ts:238-243 → `damageNumbers.spawn(position, amount, 'normal')`).

**Change:** keep (a) the `lastDamagedAt` overlay reveal; remove ONLY (b) the number emission — the `damageNumbers.spawn` calls at createGame.ts:238-243 are deleted (numbers now come from local prediction + `enemy_hit` event). Simplest: keep the `onHealthDrop` callback for the bar reveal but drop the `damageNumbers.spawn` body, or narrow the callback to overlay-only. RESEARCH §Damage-Number Reconciliation + A7: this changes enemy-vs-enemy / worldTick HP drops to no longer float a player-facing number — flag for UAT/verify.

---

## Shared Patterns

### Zero-import pure-helper discipline
**Source:** `spacetimedb/src/crit.ts` (1-8 header), `damage.ts` (1-7 header)
**Apply to:** `skillGate.ts` (new), `CHARACTER_COMBAT` addition to `damage.ts`
The grep-gate matches `import`/`Math.random`/`Date.now`/`ctx` even in comments (LEARNINGS). New pure files carry zero import lines and phrase comments to avoid those literal tokens. `ctx.random`/`ctx.timestamp` live ONLY in the reducer (index.ts), injected into helpers as thunks/args.

### Injected-rng / injected-clock seam
**Source:** `rollCrit(critRate, critDmg, rng)` (crit.ts:18) called as `rollCrit(..., () => ctx.random())`
**Apply to:** the crit roll in `resolvePlayerHit`; `nextSkillReadyAt(now, …)` fed `ctx.timestamp.microsSinceUnixEpoch`
Keeps the reducer deterministic (CLAUDE.md rule 2) while the decision math stays pure/testable. `ctx.random()` is a `() => number` in `[0,1)` (CLAUDE.md TS SDK ref).

### Additive `.default()` column migration
**Source:** `player.transcendShards: t.u32().default(0)` (index.ts:328), `gemDrop.droppedAtMicros: t.u64().default(0n)` (344)
**Apply to:** new `skillReadyAtMicros`/`skillWindowEndsAtMicros` columns on `player`
Append at the end of the column list, `.default(0n)` for micros — SpacetimeDB refuses a non-defaulted new column on a populated (maincloud) table (RESEARCH Pitfall 2, migrate-gotchas memory).

### Event-table + self-skip `onInsert`
**Source:** table `{ name, public:true, event:true }` (index.ts:529/541) + client `attacker === me` skip (App.tsx:170-175)
**Apply to:** `enemy_hit` table + its `onInsert` double-draw suppression
Event rows never stored (zero cache cost); the attacker skips its own event (already drew locally), renders others' numbers, upgrades only its own crit.

### Import-and-compare INV-5 parity
**Source:** `serverSync.test.ts:286-315` (`describe('server damage.ts mirror stays in sync')`)
**Apply to:** `CHARACTER_COMBAT` parity (new `it.each` over `CHARACTERS`)
Import BOTH client source + server mirror and compare outputs/fields — robust to formatting, unlike source regex (Pitfall 3). Blocks merge on any mirror drift.

### Server range/finite guards (defense-in-depth, keep)
**Source:** `attackEnemies` finite + `MAX_HIT_RANGE`/`MAX_ATTACK_RADIUS` guards (index.ts:1830-1832), `MAX_HIT_DAMAGE` clamp (155)
**Apply to:** the reworked `attackEnemies`/`attackRay` — keep unchanged around the new server-computed damage
`MAX_HIT_DAMAGE=400` now also bounds honest crits (RESEARCH Pitfall 1 / A5) — keep 400 for no-regression, flag raising it as tuning. Emit POST-clamp amount so number == HP drop.

## No Analog Found

None. Every artifact maps to an in-repo analog — this phase is composition + intent-plumbing over Phase-1 assets, not new subsystems.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| — | — | — | (all files have same-repo analogs) |

## Metadata

**Analog search scope:** `spacetimedb/src/` (index.ts, crit.ts, damage.ts, resistances.ts), `src/game/` (createGame.ts, systems/, combat/, data/, data/__tests__/), `src/App.tsx`
**Files scanned:** 13 read + 4 grep/glob passes
**Pattern extraction date:** 2026-07-08
