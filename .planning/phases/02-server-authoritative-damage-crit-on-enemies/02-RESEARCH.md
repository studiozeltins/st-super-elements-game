# Phase 2: Server-authoritative damage + crit on enemies - Research

**Researched:** 2026-07-08
**Domain:** SpacetimeDB server-authoritative combat wiring (TypeScript module + React/Three.js client)
**Confidence:** HIGH (all findings verified directly against the live codebase)

## Summary

This is a **wiring phase**: Phase 1 already produced the pure, zero-import helpers (`spacetimedb/src/crit.ts` `rollCrit`, `damage.ts` `computeBaseDamage`/`regularAttackMultiplier`/`skillAttackMultiplier`/`transcendDamageMultiplier`, and the mirrored crit values in `CHARACTER_STATS`). The architecture is locked (Option B: server owns base damage + crit roll via `ctx.random`; drop the client `damage` arg; add a per-hit event table). This research answers the OPEN questions CONTEXT left to planner discretion, grounded in the live code.

Reading the live code surfaced **three findings that materially change the plan versus what CONTEXT assumed** — the planner must account for these:

1. **The server cannot yet compute skill base damage or read a skill cooldown.** `computeBaseDamage` needs `weaponId` and `skillDamage`; the server has **no character→weapon mapping and no skill-damage/skill-cooldown mirror**. CONTEXT D2-03 says the server "can already know" the cooldown "from mirrored data" — it **cannot today**. A new per-character combat mirror (`weaponId`, `skillDamage`, `skillCooldownSeconds`) must be added to `damage.ts` and parity-locked in `serverSync.test.ts` (INV-5). This is the single biggest under-specified item.
2. **Enemy/goliath damage numbers are ALREADY 100% server-HP-delta-driven** (`createEntityRenderer.ts:175-181`), always rendered as `'normal'`, with **no local prediction and no crit visual today**. The client `rollDamage` crit `amount`/`kind` currently only drives PvP numbers and the local projectile visual — never the enemy number. So D2-01/D2-02's "double-draw" is between the existing HP-delta path and the new event, not between two local draws. The number system needs a real refactor, not just an added event.
3. **`castSkill` exists and already fires on every skill** (`index.ts:1647`), alongside the `sendAttackEnemies` skill-damage call — so it is the natural authoritative "cast happened" setter for `skillReadyAt`, but it currently does **zero** cooldown enforcement and trusts an arbitrary `skillId`.

**Primary recommendation:** Add a `CHARACTER_COMBAT` mirror to `damage.ts` (weapon + skill damage + skill cooldown per character, parity-tested); rework `attackEnemies`/`attackRay` to accept `isSkill`+`comboCount` (drop `damage`), computing base via `computeBaseDamage` from `activeCharacterId`+owned constellation/transcend and crit via `rollCrit(critRate, critDmg, ctx.random)`; gate the skill multiplier behind a server `skillReadyAt` set on a cooldown-validated `castSkill`, downgrading out-of-window `isSkill` hits to basic; broadcast every landed hit through a new `enemy_hit` event table (attacker + position + amount + isCrit); and drive own numbers by instant local prediction, others' + own-crit-upgrade from the event, removing the HP-delta number spawn.

## User Constraints (from CONTEXT.md)

### Locked Decisions (Phase-2-specific — D2-01..D2-04)

- **D2-01 — Client-side prediction for the attacker's OWN number.** The attacker computes a display-only base number locally and pops it instantly at 0 latency. The server event delivers the truthful amount/crit; on a crit the client upgrades to the big red crit number. HP and the crit roll are ALWAYS server-authoritative; the local number is cosmetic. Rejected: server-driven-only (waits ~1 RTT on your own hits = the jittery feel this milestone removes).
- **D2-02 — The new event table broadcasts EVERY landed hit** (amount + `isCrit` + target + attacker), not crit-only. All clients render numbers on shared enemies (Genshin co-op full shared visibility). Mirror the `skill_cast`/`ranged_attack` pattern (`onInsert`-only, never stored; all clients subscribe). The attacker MUST suppress double-drawing its own hits from the event (render event numbers for OTHER players; use the event only to confirm/upgrade the attacker's own crit). Cost accepted: an event per landed hit per player.
- **D2-03 — The server enforces the skill cooldown authoritatively.** A new `isSkill` intent flag picks `skillAttackMultiplier` (uncapped) vs `regularAttackMultiplier` (capped). Because the server enforces no skill cooldown today, a blindly-trusted flag = skill-tier damage on every basic (fails SC4). Add a per-player `skillReadyAt` (server-tracked, from the character's `skill.cooldownSeconds`), set on an authoritative skill cast. When a hit claims `isSkill`, grant the skill multiplier ONLY if off cooldown; otherwise treat as basic (or reject). The existing `sendCastSkill` path is the natural authoritative "cast happened" signal — planner verifies whether to gate `skillReadyAt` off it or off the `isSkill` hit.
- **D2-04 — Client-sent `comboCount` stays, server clamps it to `MAX_COMBO_FOR_GEMS` (100)** in the damage path before it feeds the multipliers — the same clamp gem payout uses (`index.ts` ~1835). Rationale: `regularAttackMultiplier` is already capped (safe), but `skillAttackMultiplier` is UNCAPPED (`1 + combo × rate`), so an unclamped combo = unbounded skill inflation on a legit on-cooldown cast. Full server-authoritative combo is out of scope.

> Trilogy-wide decisions (LOCKED in `01-CONTEXT.md` D-01..D-08, NOT re-litigated): server owns crit roll via `ctx.random`; server owns base damage / drop `damage` arg (Option B); crit/hit event table added ("no new tables" waived); one `critRate` auto-covers skills; grep-gate exception for `ctx.random`.

### Claude's Discretion (answered by this research — see recommendations below)

- Exact new event-table name + columns → **§New Event Table**.
- Exact intent-arg shape for `attackEnemies`/`attackRay` → **§Intent-Arg Shape**.
- Out-of-cooldown `isSkill` hit **downgraded to basic** vs **rejected** → **recommend DOWNGRADE** (§Skill Cooldown Gate).
- Gate `skillReadyAt` off `castSkill` vs off the damage hit → **recommend off `castSkill`** (§Skill Cooldown Gate).
- Where `isCrit` is recorded for Phase 7 → **recommend event-carries-isCrit + no persistent field yet** (§isCrit Recording).

### Deferred Ideas (OUT OF SCOPE)

- **Full server-authoritative combo** (server tracks combo from resolved hits + window decay). Bounded-clamp (D2-04) is enough for enemies-only Phase 2; revisit with PVP combo (Phase 3+).
- **Weapon/constellation crit contributions (XCMB-02)** — crit stacking on top of base per-character crit.
- **Rejected-vs-downgraded out-of-cooldown skill hit** — an implementation nuance left to the planner, not a deferred capability.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CRIT-02 | Server rolls crit via `ctx.random` from acting character's `critRate`, applies `critDmg`; client no longer decides crit | `rollCrit(critRate, critDmg, ctx.random)` (crit.ts) wired into `attackEnemies`/`attackRay`; crit values already in `CHARACTER_STATS` (index.ts:46-66). §Intent-Arg Shape, §Reducer Composition |
| CRIT-04 | Crit hit floats `kind:'crit'` number driven by the real server roll (no visual regression) | New `enemy_hit` event carries `isCrit`; `DamageKind 'crit'` already renders (`damageKind.ts`, `createDamageNumbers.ts:53-58`). §New Event Table, §Damage-Number Reconciliation |
| CRIT-05 | `attackEnemies`/`attackRay` resolve crit server-side and record `isCrit` on the hit so poise can consume it | Event row carries authoritative `isCrit`; persistent poise field deferred to Phase 7's `unit_attack` table (doesn't exist yet). §isCrit Recording |
| CRIT-06 | Base damage computed server-side from mirrored WEAPONS + combo/skill/transcend; drop the client `damage` arg | Needs NEW `CHARACTER_COMBAT` mirror (weapon+skill damage) — server has no character→weapon map today. §CRITICAL GAP, §Standard Stack |

## Standard Stack

No external packages are introduced by this phase. All work is TypeScript edits inside the existing SpacetimeDB module (`spacetimedb/src/`) and the existing client (`src/`), plus a schema migrate-publish and `spacetime generate`. The "stack" is therefore the existing project toolchain and the Phase-1 helpers being wired in.

### Existing assets wired/extended (verified in codebase)

| Asset | Location | Role in Phase 2 |
|-------|----------|-----------------|
| `rollCrit(critRate, critDmg, rng)` | `spacetimedb/src/crit.ts:18` | Crit decision; inject `ctx.random` as `rng`. Returns `{isCrit, multiplier}`; `multiplier` is `critDmg` VERBATIM (full 1.9, not 1+bonus). [VERIFIED: codebase] |
| `computeBaseDamage({weaponId, skillDamage, combo, constellation, transcend})` | `spacetimedb/src/damage.ts:101` | Server base damage. `base = skillDamage ?? WEAPONS[weaponId].damage`; ramp = skill vs regular; × transcend mult. [VERIFIED: codebase] |
| `regularAttackMultiplier` (capped +0.75) / `skillAttackMultiplier` (uncapped) | `damage.ts:75,82` | Combo ramps; already parity-tested. [VERIFIED: codebase] |
| `transcendDamageMultiplier(constellation, transcend)` | `damage.ts:94` | Power-track scaling. [VERIFIED: codebase] |
| `WEAPONS` mirror | `damage.ts:22-68` | 5 weapon base damages; parity-locked in serverSync. [VERIFIED: codebase] |
| `resistedDamage(raw, profile, type)` + `GOLIATH_RESISTANCES {ranged:0.10}` | `spacetimedb/src/resistances.ts:25,39` | Applied AFTER base+crit for ranged goliath hits (as `attackRay` does today, index.ts:1976). [VERIFIED: codebase] |
| `castSkill` reducer + `skill_cast` event table | `index.ts:1647`, `index.ts:468` | Authoritative cast signal for `skillReadyAt`; event-table template. [VERIFIED: codebase] |
| `ranged_attack` / `pvp_hit` event tables | `index.ts:541,529` | Event-table + `onInsert` templates (`pvp_hit` already carries `{target, amount}`). [VERIFIED: codebase] |
| `activatedConstellationFor(ctx, owner, characterId, unlocked)` | `index.ts:2222` | Reads a player's ACTIVE constellation for `computeBaseDamage`'s `constellation` input. [VERIFIED: codebase] |
| `owned.transcendLevel` | `owned_character` table, `index.ts:446` | `transcend` input to `computeBaseDamage`. [VERIFIED: codebase] |
| `MAX_COMBO_FOR_GEMS = 100` | `index.ts:211` | The D2-04 combo clamp cap (already used for gems, index.ts:1835/1931). [VERIFIED: codebase] |
| `MAX_HIT_DAMAGE = 400` | `index.ts:155` | Defense-in-depth clamp; keep (see Pitfall 1). [VERIFIED: codebase] |

### Package Legitimacy Audit

**Not applicable** — this phase installs no external packages. All changes are edits to existing first-party source. No registry verification required.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Base-damage computation | Server module (reducer) | damage.ts pure helper | CRIT-06: client can no longer send a damage number; server owns truth |
| Crit roll decision | Server module (`ctx.random`) | crit.ts pure helper | CRIT-02 locked: only server RNG is un-spoofable for the poise interrupt |
| Skill-vs-basic authority | Server module (`skillReadyAt` state) | skillGate pure helper | D2-03/SC4: a trusted `isSkill` flag alone is spoofable → cooldown-gated |
| Combo bound | Server module (clamp) | — | D2-04: clamp before feeding uncapped skill multiplier |
| Per-hit truth broadcast | Server event table → all clients | — | D2-02: shared co-op visibility of numbers/crits |
| Own-number instant feedback | Client (local prediction) | — | D2-01: cosmetic 0-latency feel; server reconciles |
| Others'-number rendering | Client (`onInsert` on event) | — | D2-02: event-driven; mirrors `ranged_attack` |
| Enemy/goliath HP + payout | Server (already) | — | Unchanged; the reducers already own HP |

## CRITICAL GAP: Server has no skill/weapon data to compute base damage

`computeBaseDamage` needs `weaponId` and (for skills) `skillDamage`. **Neither exists server-side today:**

- **No character→weapon map.** `CHARACTER_STATS` (index.ts:45-67) has `stars/maxHealth/healthRegen/role/critRate/critDmg/heal*` — **no `weapon`**. The client keeps it at `CHARACTERS[id].weapon` (characters.ts:57). The `GACHA_WEAPONS` catalog (index.ts:99) is the pull-able named weapons (`debesu-zobens`…), NOT the combat weapon type (`sword/greatsword/bow/spear/book`). [VERIFIED: codebase]
- **No skill-damage mirror.** Skill base damage is `CHARACTERS[id].skill.damage` (characters.ts:43,112…) and final skill hit = `skill.damage * damageMultiplier` (`createEffectSystem.ts:35`). The server has nothing. [VERIFIED: codebase]
- **No skill-cooldown mirror.** `skill.cooldownSeconds` (characters.ts:44) lives only client-side; D2-03's `skillReadyAt` needs it server-side. [VERIFIED: codebase]

**Required (recommended):** add to `damage.ts` (stays zero-import; parity-locked) a per-character combat mirror:

```typescript
// damage.ts — mirror of the combat-relevant fields of src/game/data/characters.ts CHARACTERS.
// Parity-locked by serverSync.test.ts (import-and-compare, like WEAPONS).
export interface CharacterCombat {
  weaponId: WeaponId;
  skillDamage: number;        // CHARACTERS[id].skill.damage
  skillCooldownSeconds: number; // CHARACTERS[id].skill.cooldownSeconds
}
export const CHARACTER_COMBAT: Record<string, CharacterCombat> = {
  aeris: { weaponId: 'sword', skillDamage: 140, skillCooldownSeconds: 6 },
  // …all 17 ids…
};
```

Then `serverSync.test.ts` asserts, for every `CHARACTERS[id]`: `CHARACTER_COMBAT[id].weaponId === CHARACTERS[id].weapon`, `.skillDamage === CHARACTERS[id].skill.damage`, `.skillCooldownSeconds === CHARACTERS[id].skill.cooldownSeconds` (INV-5, CRIT-03 discipline). This mirror is a **new test-first parity target** and belongs in the plan as an early task before the reducer wiring. [ASSUMED: recommendation — planner may instead place it in a new `characterCombat.ts` sibling; damage.ts is only 111 LOC, well under the 300-LOC cap, so co-locating with WEAPONS keeps the mirror together.]

## Intent-Arg Shape (D-05 / D2-03)

The server already knows the acting character via `player.activeCharacterId` (index.ts:315). So the client sends **intent, not a damage number**:

**`attackEnemies` — new signature (drop `damage`, add `isSkill`):**
```typescript
{ centerX: t.f32(), centerZ: t.f32(), radius: t.f32(), isSkill: t.bool(), comboCount: t.u32() }
```
**`attackRay` — new signature (drop `damage`, add `isSkill` for symmetry/future):**
```typescript
{ originX, originZ, dirX, dirZ, range, hitRadius, isSkill: t.bool(), comboCount: t.u32() }
```

Server derives per hit: `weaponId`/`skillDamage`/`skillCooldownSeconds` from `CHARACTER_COMBAT[activeCharacterId]`; `constellation` from `activatedConstellationFor(ctx, owner, activeCharacterId, owned.constellation)`; `transcend` from `owned.transcendLevel`; `critRate`/`critDmg` from `CHARACTER_STATS[activeCharacterId]`; `combo = min(comboCount, MAX_COMBO_FOR_GEMS)`.

**Current-wiring note (verified):** all client SKILL damage routes through `sendAttackEnemies` (via `applySkillDamage = dealDamage`, createGame.ts:392,379); basic melee → `sendAttackEnemies`; basic bow → `sendAttackRay` at launch (createGame.ts:520). The basic bow projectile does NOT re-send enemy damage (`applyRangedProjectileHit`, createGame.ts:398). **So in the current wiring `attackRay` is basic-only (`isSkill` effectively always false).** Adding `isSkill` there is harmless future-proofing; the server still drops `damage` and computes the basic bow base. [VERIFIED: codebase]

## Reducer Composition (intent → damage)

Because the composition needs `ctx.db` lookups (owned row, activation, `skillReadyAt`), keep the glue as an `index.ts` helper near `attackEnemies`, calling the PURE helpers. Recommended shape:

```typescript
// index.ts helper (NOT zero-import — it reads ctx; the pure parts it calls ARE tested)
function resolvePlayerHit(ctx, player, isSkill: boolean, combo: number, dmgType: DamageType) {
  const cc = CHARACTER_COMBAT[player.activeCharacterId];
  const owned = findOwnedRow(ctx, player, player.activeCharacterId);
  const constellation = activatedConstellationFor(ctx, player.identity, player.activeCharacterId, owned ? owned.constellation : 0);
  const grantSkill = isSkill && skillIsActive(ctx, player, ctx.timestamp.microsSinceUnixEpoch); // §Skill Cooldown Gate
  const base = computeBaseDamage({
    weaponId: cc.weaponId,
    skillDamage: grantSkill ? cc.skillDamage : null,   // null → basic ramp
    combo,
    constellation,
    transcend: owned ? owned.transcendLevel : 0,
  });
  const stat = CHARACTER_STATS[player.activeCharacterId];
  const { isCrit, multiplier } = rollCrit(stat.critRate, stat.critDmg, () => ctx.random());
  const raw = base * multiplier;
  const resisted = resistedDamage(raw, /* target profile */ profile, dmgType); // goliath ranged etc.
  const amount = Math.min(resisted, MAX_HIT_DAMAGE); // defense-in-depth clamp (SC4)
  return { amount, isCrit };
}
```

Verify `ctx.random` is a `() => number` in `[0,1)` (per CLAUDE.md TS SDK reference: `const f: number = ctx.random()`). Inject it as the `rng` thunk exactly as the Phase-1 injected-rng seam intends. [CITED: CLAUDE.md SpacetimeDB TS SDK reference]

**Apply order matters:** base → crit multiplier → resistance → `MAX_HIT_DAMAGE` clamp. `attackEnemies` melee uses melee/skill channel (no goliath ranged resist); `attackRay` uses the `'ranged'` channel and MUST keep `resistedDamage(_, GOLIATH_RESISTANCES, 'ranged')` for goliaths (index.ts:1976) so ranged goliath damage stays 10%. [VERIFIED: codebase]

## Skill Cooldown Gate (D2-03) — recommend gate off `castSkill`, DOWNGRADE out-of-window

Two questions the CONTEXT left open, with recommendations:

**Gate off `castSkill` (not the hit).** `castSkill` (index.ts:1647) already fires on every skill (createGame.ts:580, alongside the `sendAttackEnemies` skill hit). Make it the authoritative rate-limiter:
- Add per-player state (a new `player` column `skillWindowEndsAtMicros: t.u64().default(0n)` — additive, needs `.default(0n)` per the SpacetimeDB-migrate rule, or a small dedicated table). Also track the cooldown gate itself.
- In `castSkill`: read `cc = CHARACTER_COMBAT[activeCharacterId]`; if `now < skillReadyAt` → **reject** (return, emit no `skill_cast`); else set `skillReadyAt = now + cc.skillCooldownSeconds*1_000_000` and `skillWindowEndsAt = now + SKILL_HIT_WINDOW_MICROS`.
- In `attackEnemies`/`attackRay`: `isSkill` grants the skill multiplier ONLY while `now <= skillWindowEndsAt`; otherwise **downgrade to basic** (compute basic ramp, still land the hit).

**Why gate off the cast, not the hit:** a skill's damage hit is delayed by effect/projectile travel (`spawnSkillEffect` → `applyDamage` when the visual reaches a target; ring/nova skills deal damage over `durationSeconds` up to 4s). If the hit itself both checked AND started the cooldown, a projectile that arrives after the cast would already read "on cooldown," and multi-hit skills would only scale their first hit. Gating at the cast (rate-limited) + a generous hit window covers the whole skill lifetime and still caps skill-tier scaling to one cooldown-gated cast (SC4). [VERIFIED: codebase — skill damage path + castSkill both fire]

**Why DOWNGRADE, not reject, the out-of-window hit:** the client already popped a local predicted number (D2-01). Rejecting the hit would show a number with no HP drop (visible desync). Downgrading keeps HP moving (basic scaling) and the event reconciles the true amount. Cleaner feel. [ASSUMED: recommendation]

**Window sizing is an open question** (see Open Questions): `SKILL_HIT_WINDOW_MICROS` must cover the longest skill lifetime (ring/nova `durationSeconds` ≤ 4s + projectile travel). Too short clips legit late skill hits to basic; too long lets a client fire a few basics at skill scaling after one cast. Recommend ≈ 4.5–5s and note that full server-authoritative skill tracking is the Deferred path.

**Pure helper (test-first, zero-import):** `skillGate.ts`
```typescript
// zero-import, deterministic
export function skillGrantActive(isSkill: boolean, nowMicros: bigint, windowEndsAtMicros: bigint): boolean {
  return isSkill && nowMicros <= windowEndsAtMicros;
}
export function nextSkillReadyAt(nowMicros: bigint, cooldownSeconds: number): bigint {
  return nowMicros + BigInt(Math.round(cooldownSeconds * 1_000_000));
}
```

## New Event Table (D2-02) — recommend `enemy_hit`

Mirror `ranged_attack`/`pvp_hit` (`{ name, public:true, event:true }`, `onInsert`-only, never stored). Recommended columns carry attacker + hit location + truth:

```typescript
const enemyHit = table(
  { name: 'enemy_hit', public: true, event: true },
  {
    attacker: t.identity(),
    positionX: t.f32(),   // where to float the number (mirrors skill_cast carrying coords)
    positionZ: t.f32(),
    amount: t.u32(),      // POST-clamp, POST-resist truth = the real HP drop
    isCrit: t.bool(),     // CRIT-04 crit visual + CRIT-05 authoritative flag
  }
);
```

Insert one row per landed hit inside the enemy/goliath loops of `attackEnemies` and at the strike in `attackRay`, at the entity's position, with the resolved `{amount, isCrit}`. Position-based rendering is simplest for `createDamageNumbers` and avoids a target-kind enum; if Phase 7 later needs a target id, add `targetId: t.u64()` + `targetKind: t.string()` then (additive). **Emit the POST-clamp amount** so the floated number equals the actual HP drop (no mismatch through the 400 clamp). Add `tables.enemyHit` to the `App.tsx` subscription list (index.ts adds it to `schema({...})` and the reducer file's exports). [VERIFIED: event-table pattern at index.ts:468-561, App.tsx:112-136]

## Damage-Number Reconciliation (D2-01 / D2-02) — the real refactor

**Current reality (verified):** enemy/goliath numbers pop from the server HP delta in `createEntityRenderer.ts:175-181` (`existing.lastHealth - nextHealth`), always `'normal'`, for ANY HP drop, via the `onHealthDrop` callback wired in createGame.ts:238-243. The same block also sets `existing.lastDamagedAt` which reveals the health-bar overlay. The client `rollDamage` crit result never reaches the enemy number today. [VERIFIED: codebase]

**Recommended target design:**
1. **Own hits (attacker):** in the client attack path, pop an instant local predicted `'normal'` number at the hit location (NEW — reuse the client's still-present `WEAPONS` + `regularAttackMultiplier`/`skillAttackMultiplier`/`transcendDamageMultiplier` for a display-only base; D2-01 says these funcs stay client-side). This is cosmetic.
2. **`enemy_hit` `onInsert`:** `if (attacker === me)` → render ONLY when `isCrit` (upgrade to the big red crit number); else skip (local prediction already drew it). `else` → render the number (`amount`, `isCrit ? 'crit' : 'normal'`). This is exactly the `ranged_attack` self-skip idiom (App.tsx:170-175).
3. **Remove the HP-delta NUMBER spawn** for enemies/goliaths (createGame.ts:238-243) to avoid double/triple-draw, BUT keep `onHealthDrop`'s health-bar reveal (`lastDamagedAt`) — only the `damageNumbers.spawn(...)` call is removed; consider keeping the callback and dropping only its number emission, or repurpose it purely for the overlay reveal. [VERIFIED: onHealthDrop dual role, createEntityRenderer.ts:176-180]

**Behavior change to call out:** driving numbers only from player-attributed events means enemy-vs-enemy / worldTick HP drops no longer float a player-facing number (they do today). This is arguably less clutter and more correct, but it IS a change — flag for the verify step / UAT. [VERIFIED: HP-delta fires for any drop]

## isCrit Recording for Phase 7 (CRIT-05)

CONTEXT: "server-side field, NOT necessarily the broadcast payload." There is **no persistent per-hit row today** and the poise `unit_attack` table is introduced in Phase 4/7 (FSM-01). The enemy/goliath tables (index.ts:368,397) have no `isCrit` field and adding a transient combat-flag column there is awkward. **Recommendation:** for Phase 2, satisfy CRIT-05 by (a) computing `isCrit` authoritatively in the reducer and (b) emitting it on the `enemy_hit` event. The persistent "crit during windup accrues poise" storage is genuinely Phase 7's job (POISE-01/03) and depends on the `unit_attack` row that doesn't exist yet. Do NOT invent a persistent field now that Phase 7 would rework. Note this explicitly so the verifier does not false-positive a missing persistent field. [ASSUMED: recommendation grounded in requirement sequencing]

## Pure-Helper Extraction Targets (test-first, zero-import, ≤300 LOC)

| Concern | Where | Signature | Testable? |
|---------|-------|-----------|-----------|
| Skill-window gate | NEW `spacetimedb/src/skillGate.ts` (zero-import) | `skillGrantActive(isSkill, now, windowEnd) → boolean`; `nextSkillReadyAt(now, cooldownSec) → bigint` | Yes — pure, vitest across boundary |
| Combo clamp | inline in reducer OR a one-liner in an existing sibling | `Math.min(comboCount, MAX_COMBO_FOR_GEMS)` | Trivial; covered by the parity/clamp test |
| Per-character combat data | `damage.ts` `CHARACTER_COMBAT` (zero-import data) | data map + `CharacterCombat` interface | Yes — import-and-compare parity |
| Base+crit+resist glue | `index.ts` helper `resolvePlayerHit(ctx, …)` | reads ctx; composes the pure helpers | No (needs ctx) — its PARTS are tested |

The zero-import discipline (LEARNINGS: the grep gate matches `import`/`Math.random`/`Date.now`/`ctx` even in comments) means new pure files must have zero import lines and comments phrased to avoid the literal tokens. `skillGate.ts` and the `CHARACTER_COMBAT` addition to `damage.ts` both satisfy this. Keep the ctx-dependent composition OUT of the pure files. [VERIFIED: crit.ts/damage.ts have zero imports; LEARNINGS confirms gate behavior]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Crit decision | A new `Math.random()<rate` in the reducer | `rollCrit(critRate, critDmg, () => ctx.random())` | Grep-gate forbids `Math.random`; Phase-1 helper is parity-pinned with strict `<` boundary and full-multiplier semantics |
| Base damage | Re-deriving weapon×combo×transcend math in-reducer | `computeBaseDamage({...})` | Already mirrors client verbatim + parity-tested; re-deriving risks silent drift |
| Skill cooldown timer | A wall-clock timer | `ctx.timestamp.microsSinceUnixEpoch` + stored `skillReadyAt` | Reducers must be deterministic (no clock); grep-gate forbids `Date.now` |
| Event broadcast | A polled/stored table | `event: true` table + `onInsert` | Matches `skill_cast`/`ranged_attack`/`pvp_hit`; event rows never stored, zero cache cost |
| Resistance application | Inline multipliers | `resistedDamage(raw, profile, type)` | Existing data-driven layer; goliath ranged 0.10 already lives there |
| Active constellation read | Reading `owned.constellation` directly | `activatedConstellationFor(...)` | Players tune ACTIVE stars below the unlocked ceiling; using the ceiling over-scales |

**Key insight:** every combat number in this phase already has a canonical, parity-tested owner. The phase is composition + intent-plumbing, not new math. The one genuinely new thing is the `CHARACTER_COMBAT` mirror — and even that is data that already exists on the client.

## Common Pitfalls

### Pitfall 1: `MAX_HIT_DAMAGE = 400` clips legitimate server crits
**What goes wrong:** Today the client sends damage and the server clamps to 400; enemy HP drops (and thus the floated number) are already ≤400 per hit. After the switch, the server computes real base×crit — a high-combo skill crit vastly exceeds 400 and gets clamped, so the "big red crit" caps at 400.
**Why it happens:** `MAX_HIT_DAMAGE` was a client-spoof ceiling; now it also bounds honest server math.
**How to avoid:** Keep `MAX_HIT_DAMAGE` as defense-in-depth (SC4 requires it) BUT recognize it now bounds legit crits. Decide deliberately: keep 400 (matches current enemy behavior exactly — safest for "no regression") OR raise it now that damage is trustworthy (a balance/feel change, arguably out of scope). Recommend keep 400 for Phase 2, flag raising it as a tuning follow-up. Emit the POST-clamp amount in the event so number == HP drop. [VERIFIED: index.ts:155,1834,1842]
**Warning signs:** Crit numbers on enemies visually identical to non-crit (both hit 400).

### Pitfall 2: SpacetimeDB refuses a non-defaulted new column on a populated table
**What goes wrong:** Adding `skillWindowEndsAtMicros`/`skillReadyAt` to `player` without `.default(0n)` fails the migrate-publish to maincloud (real accounts). 
**How to avoid:** Every new column gets `.default(0n)` and is appended (never mid-table), exactly as `transcendShards`/`engageEndsAtMicros` did (index.ts:328,419). A dedicated new table also works and sidesteps column ordering. [VERIFIED: codebase pattern + SpacetimeDB-migrate-gotchas memory]
**Warning signs:** `spacetime publish` migrate error on the populated DB but green on a fresh local DB.

### Pitfall 3: `serverSync.test.ts` regex depends on single-line flat literals
**What goes wrong:** Adding `CHARACTER_COMBAT` (or extending `CHARACTER_STATS`) with nested/multi-line braces breaks the `(\w+):\s*\{([^}]*)\}` extractor (non-greedy, no nested braces).
**How to avoid:** If the new mirror is compared via string-scrape, keep entries single-line flat. Better: compare via **import-and-compare** (like the `damage.ts` mirror block, serverSync.test.ts:286-315) — robust to formatting and the established pattern for imported server data. Recommend import-and-compare for `CHARACTER_COMBAT`. [VERIFIED: LEARNINGS + serverSync.test.ts]
**Warning signs:** `NaN` or a missing id in the parity assertion.

### Pitfall 4: Half-migrated reducer signature
**What goes wrong:** Changing `attackEnemies`/`attackRay` args server-side without updating the client callers (App.tsx:613-616 `sendAttackEnemies`/`sendAttackRay`, createGame.ts:379,520, and the `Network` interface createGame.ts:84-105) yields "no such reducer" / arg-shape errors, or the client keeps sending `damage`.
**How to avoid:** Change the reducer, `spacetime generate`, and the client callers in the SAME slice (CONTEXT integration point). Drop `damage` from the `Network` interface, `App.tsx` wiring, and both call sites; add `isSkill`. [VERIFIED: App.tsx:613-616, createGame.ts:84-105,379,520]
**Warning signs:** Client console "no such reducer" or a TypeScript error on the generated binding arg shape.

### Pitfall 5: `castSkill` trusts an arbitrary `skillId`
**What goes wrong:** `castSkill` takes `skillId: t.string()` and never checks it belongs to the active character (index.ts:1648-1665). If `skillReadyAt` keys off a client-sent `skillId` or cooldown, a client spoofs a short-cooldown skill.
**How to avoid:** Derive the cooldown from the SERVER's `CHARACTER_COMBAT[activeCharacterId].skillCooldownSeconds`, never from anything the client sends. Ignore/validate the incoming `skillId` for gating purposes. [VERIFIED: index.ts:1648]

### Pitfall 6: Grep-gate false trip / `ctx.random` exception
**What goes wrong:** The `spacetimedb/src` grep-gate forbids `Math.random`/`Date.now`; `ctx.random` is the sole crit exception. A stray `Math.random` in the reducer (or the literal token in a comment of a zero-import helper) fails the gate.
**How to avoid:** Use `ctx.random` only, and only inside the reducer (passed as the `rng` thunk). Keep pure helpers free of the literal tokens. [VERIFIED: CLAUDE.md grep-gate rule + LEARNINGS comment-token lesson]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 |
| Config file | (vitest via `pnpm test` → `vitest run`; existing 28 test files) |
| Quick run command | `pnpm exec vitest run <path>` (note: `pnpm test -- <filter>` runs the FULL suite — LEARNINGS) |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CRIT-06 | `CHARACTER_COMBAT` mirror equals client weapon+skill damage+cooldown for all 17 ids | unit (import-and-compare) | `pnpm exec vitest run src/game/data/__tests__/serverSync.test.ts` | ⚠️ extend existing |
| CRIT-02 | `rollCrit` boundary + full-multiplier already pinned; add: crit-frequency divergence between characters (e.g. glacia 0.10 vs vesper 0.36 over N seeded rolls) | unit | `pnpm exec vitest run spacetimedb/src/__tests__/crit*.ts` (Phase-1 test exists) + NEW | ⚠️ add divergence case |
| CRIT-06 | Skill window gate: `isSkill` in-window → skill ramp; out-of-window → basic ramp | unit | `pnpm exec vitest run` NEW `skillGate` test | ❌ Wave 0 |
| CRIT-06 | Combo clamp: `combo>100` feeds `skillAttackMultiplier(100)` not unbounded | unit | NEW clamp test | ❌ Wave 0 |
| CRIT-04/05 | `isCrit`/`amount` resolution composition | integration (manual/two-client) | migrated-DB human playtest | manual |

### Sampling Rate
- **Per task commit:** `pnpm exec vitest run <touched test path>` (TDD RED→GREEN per Phase-1 pattern).
- **Per wave merge:** `pnpm test` (full suite; keep 450+ green).
- **Phase gate:** full suite green + grep-gate (no `Math.random` in `spacetimedb/src`) + a **two-client migrated-DB playtest**: (a) different characters land visibly different crit frequency/magnitude on a goliath; (b) a modified client sending `isSkill` spam gets basic scaling (SC4); (c) the `enemy_hit` event + `skillReadyAt` state exist on a MIGRATED (not fresh-seeded) DB after a real engage.

### Wave 0 Gaps
- [ ] `spacetimedb/src/skillGate.ts` + its cross-boundary test — covers CRIT-06 skill gate.
- [ ] Extend `src/game/data/__tests__/serverSync.test.ts` — `CHARACTER_COMBAT` parity (weapon/skillDamage/skillCooldown) for all 17 ids.
- [ ] Crit-frequency divergence assertion (seeded rng, two characters, distinct crit counts) — the automatable proxy for SC2 "visibly different crit frequency."
- [ ] Combo-clamp test (feeds clamped combo to `skillAttackMultiplier`).
- Framework install: none — vitest already present.

## Security Domain

`security_enforcement: true`, ASVS L1. This phase IS a security phase — its purpose is closing the client-side damage/crit spoof (STRIDE **Tampering** + **Spoofing** of the combat channel; the PVP shard-theft loop makes it exploitable).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | Server-authoritative combat truth; client sends intent only |
| V4 Access Control | yes | `ctx.sender`/`requirePlayer(ctx)` is the sole identity; never trust client-passed identity/character |
| V5 Input Validation | yes | Reject non-finite coords (already, index.ts:1830); clamp `radius`/`range`/`combo`/final damage; validate `isSkill` against server `skillReadyAt` |
| V6 Cryptography | no (crit RNG) | `ctx.random` is SpacetimeDB deterministic server RNG — NOT hand-rolled, NOT `Math.random` |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client inflates damage (sends huge `damage`) | Tampering | Drop the `damage` arg entirely (CRIT-06); server computes from mirror |
| Client forces crit every hit | Spoofing/Tampering | Crit decided by `ctx.random` server-side (CRIT-02); client sends no crit bit |
| Client sends `isSkill` on every basic for uncapped skill scaling | Tampering | Server `skillReadyAt` cooldown gate + downgrade (D2-03/SC4) |
| Client sends unbounded `comboCount` | Tampering | Clamp to `MAX_COMBO_FOR_GEMS` before it feeds the uncapped skill ramp (D2-04) |
| Client sweeps the whole map / fires from safe zone | Tampering | Existing range/radius clamps (`MAX_HIT_RANGE`/`MAX_ATTACK_RADIUS`/`MAX_RANGED_HIT_RADIUS`) kept (index.ts:1831-1832,1926-1929) |
| Mirror drift (server damage diverges from client feel) | — (integrity) | INV-5 parity tests (`serverSync.test.ts`) block merge on any drift |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| pnpm | build/test/install | ✓ (repo standard) | — | none (npm crashes on symlink layout — memory) |
| Vitest | parity + pure-helper tests | ✓ | 3.2.4 | none |
| spacetime CLI | publish + `spacetime generate` | assumed (dev machine) | — | none — required to deploy schema/reducer change |
| local SpacetimeDB (`spacetimedb-standalone`) | LAN dev + migrated-DB verify | assumed running | — | `spacetime start` |
| maincloud | prod deploy of additive schema | assumed (login) | — | deploy local first; maincloud when validated |

**Deploy note (CLAUDE.md):** module lives in `./spacetimedb` (NOT `./server`). Publish additive (NO `--delete-data` on maincloud): `spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb --server local|maincloud --yes`, then `pnpm run spacetime:generate`, then `pnpm build`. Deploy to BOTH local and maincloud. `init` only runs on fresh DBs — the new `enemy_hit` table + `skillReadyAt` state must be verified on a MIGRATED DB after a real engage (CONTEXT §Specifics), not a fresh seed.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `CHARACTER_COMBAT` mirror belongs in `damage.ts` (vs a new sibling) | CRITICAL GAP | Low — either location works; damage.ts is 111 LOC, well under cap |
| A2 | DOWNGRADE (not reject) out-of-window `isSkill` hits gives cleaner feel | Skill Cooldown Gate | Medium — reject may be preferred if downgrade lets a spoofer land basic-scaled skill spam; both satisfy SC4, feel differs |
| A3 | Gate `skillReadyAt` off `castSkill` with a ~4.5–5s hit window covers all skill lifetimes | Skill Cooldown Gate | Medium — window too short clips legit late skill hits to basic; needs playtest tuning |
| A4 | `enemy_hit` event should carry position (not target id) for rendering | New Event Table | Low — additive to add `targetId` later for Phase 7 |
| A5 | Keep `MAX_HIT_DAMAGE=400` (matches current enemy behavior) rather than raise it | Pitfall 1 | Medium — 400 now clips legit server crits; user may want bigger crit numbers (balance decision) |
| A6 | For CRIT-05, event-carries-isCrit suffices for Phase 2; persistent poise field is Phase 7 | isCrit Recording | Low — grounded in requirement sequencing (POISE-01/03 are Phase 7) |
| A7 | Removing the HP-delta enemy-number spawn (keeping the health-bar reveal) is acceptable | Damage-Number Reconciliation | Medium — changes enemy-vs-enemy number behavior; confirm at UAT |

## Open Questions

1. **Skill hit-window size.** What `SKILL_HIT_WINDOW_MICROS` covers every skill's damage lifetime (ring/nova `durationSeconds` ≤ 4s + projectile travel) without giving a spoofer a long basic-at-skill-scaling window? Recommendation: ≈4.5–5s; validate against the longest-lived skill in playtest. Full server-authoritative skill tracking is the Deferred path.
2. **Reject vs downgrade** the out-of-window `isSkill` hit (A2). Recommend downgrade; user may prefer reject for strictness.
3. **Raise `MAX_HIT_DAMAGE`?** (A5) Now that damage is trustworthy, 400 clips legit skill crits. Keep for Phase 2 (no-regression) or raise as a tuning follow-up.
4. **`skillReadyAt` storage:** new `.default(0n)` columns on `player` vs a dedicated `skill_cooldown` table. Column is simplest; a table avoids `player`-row churn. Either is additive-safe.

## State of the Art

| Old Approach | Current Approach (this phase) | When Changed | Impact |
|--------------|-------------------------------|--------------|--------|
| Client `rollDamage` (`Math.random()<0.22 → ×1.9`) decides crit | Server `rollCrit(critRate, critDmg, ctx.random)` per character | Phase 2 | Per-character crit; un-spoofable; deletes createGame.ts:478-489 |
| Client sends `damage` number; server clamps to 400 | Server computes base from mirror; client sends intent | Phase 2 | Closes damage-spoof hole (CRIT-06) |
| Enemy numbers = server HP-delta, always `'normal'`, ~1 RTT | Own = instant local prediction; others + own-crit = `enemy_hit` event | Phase 2 | Smooth own-hit feel + shared crit spectacle |
| No server skill cooldown (client-only `skillReadyAtByCharacter`) | Server `skillReadyAt` gate on `castSkill` | Phase 2 | Skill-tier damage un-spoofable (SC4) |

**Deprecated/deleted by this phase:** `createGame.ts` `CRIT_CHANCE`/`CRIT_MULTIPLIER`/`rollDamage` (478-489); the `damage` arg on `attackEnemies`/`attackRay`, the `Network.sendAttackEnemies`/`sendAttackRay` `damage` param (createGame.ts:84-105), and the `App.tsx` binding args (613-616); the HP-delta `damageNumbers.spawn` for enemies/goliaths (createGame.ts:238-243, number emission only). Per CLAUDE.md "no legacy code," delete these in the same slice.

## Sources

### Primary (HIGH confidence — direct codebase read this session)
- `spacetimedb/src/index.ts` — `attackEnemies` (1816-1893), `attackRay` (1901-2024), `castSkill` (1647-1667), `CHARACTER_STATS` (45-67), event tables (468-561), `player`/`enemy`/`goliath`/`owned_character`/`character_activation` tables (305-466), `activatedConstellationFor` (2222), clamps (155,203-211), `takeDamage` resist (1669-1715)
- `spacetimedb/src/crit.ts`, `damage.ts`, `resistances.ts` — Phase-1 helpers + mirrors
- `src/game/createGame.ts` — `rollDamage`/`performAttack`/`performSkill`/`dealDamage`/`applyAttackDamage`/`applySkillDamage` (370-586), `Network` interface (84-105), game handle (1030-1170)
- `src/App.tsx` — subscriptions (109-136) + `onInsert` event wiring (162-222), reducer bindings (613-616)
- `src/game/systems/createEntityRenderer.ts` (168-186), `createEnemyRenderer.ts`, `createDamageNumbers.ts`, `createEffectSystem.ts:35`
- `src/game/data/characters.ts` (40-113), `src/game/data/__tests__/serverSync.test.ts` (whole)
- `.planning/config.json` (nyquist_validation + security_enforcement true), `package.json` (vitest 3.2.4, pnpm scripts)

### Secondary (project canon)
- `CLAUDE.md` (SpacetimeDB rules, deploy workflow, grep-gate, ≤300 LOC/no-legacy)
- `01-CONTEXT.md` D-01..D-08, `01-LEARNINGS.md` (full-multiplier critDmg, strict `<`, zero-import gate, import-and-compare parity, single-line flat literals)
- Memory: `spacetimedb-migrate-gotchas`, `pnpm-package-manager`, `goliath-raiders`, `pure-helper-testing-discipline`

## Metadata

**Confidence breakdown:**
- Standard stack / existing assets: HIGH — read every referenced file directly.
- Critical gap (no server skill/weapon mirror): HIGH — verified `CHARACTER_STATS` fields and absence of a character→weapon/skill map.
- Damage-number reconciliation: HIGH on current mechanism (verified); recommendation MEDIUM (a design choice with tradeoffs).
- Skill cooldown gate design: MEDIUM — mechanism verified; exact gating (cast-vs-hit, window size, reject-vs-downgrade) is a recommended design needing playtest confirmation.

**Research date:** 2026-07-08
**Valid until:** ~2026-08-07 (stable internal codebase; re-verify line numbers if `index.ts` is refactored, since it is the flagged monolith).
