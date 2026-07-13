# Phase 2: Server-authoritative damage + crit on enemies - Context

**Gathered:** 2026-07-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the Phase-1 pure helpers (`spacetimedb/src/crit.ts`, `damage.ts`) into the enemy/goliath
combat reducers so the SERVER owns base damage + crit:

- `attackEnemies` / `attackRay` **drop the `damage` arg** → receive *intent* instead; the server
  computes base damage via `damage.ts` and rolls crit via `ctx.random` from the mirrored
  `CHARACTER_STATS` crit values (CRIT-02, CRIT-06).
- The old client crit roll (`createGame.ts` ~478 `rollDamage` / `CRIT_CHANCE 0.22` / `CRIT_MULTIPLIER 1.9`)
  is **DELETED** (CRIT-05, SC2).
- A new **event table** broadcasts the truthful per-hit result (amount + `isCrit` + target + attacker)
  to all clients → `createDamageNumbers` pops the number (CRIT-04). `isCrit` is also recorded on the
  hit server-side for Phase 7's poise interrupt to consume (CRIT-05).
- `MAX_HIT_DAMAGE` clamp kept as defense-in-depth (SC4).

**Enemies/goliaths ONLY.** PVP (`attackPlayer`) is Phase 3. The attack state machine / telegraphs /
poise are Phases 4 & 7. This CONTEXT complements the trilogy-wide `01-CONTEXT.md` (D-01..D-08) —
those decisions still hold; the decisions below are the Phase-2-specific *feel + residual-trust*
choices gathered in this discuss.
</domain>

<decisions>
## Implementation Decisions

> Trilogy-wide decisions (server owns crit roll `ctx.random`; server owns base damage / drop
> `damage` arg — Option B; crit/hit event table added, "no new tables" waived; one `critRate`
> auto-covers skills; grep-gate exception for `ctx.random`) are LOCKED in `01-CONTEXT.md`
> D-01..D-08 and are NOT re-litigated here. Phase-2-specific decisions:

### Damage-number feel — client-side prediction (CRIT-04, SC3 "no visual regression")
- **D2-01:** The attacker's OWN floating number uses **client-side prediction** (industry standard).
  The client computes a **display-only** base number locally (it still has `WEAPONS` + the multiplier
  funcs) and pops it **instantly at 0 latency** for smooth feel. The server event then delivers the
  truthful amount/crit; on a crit the client upgrades to the big red crit number. HP and the crit
  roll are ALWAYS server-authoritative — the local number is cosmetic only, so this does not reopen
  any spoof. Rejected: server-driven-only (waits ~1 RTT on your own hits = the jittery/sluggish feel
  the milestone exists to remove).

### Event table scope — every-hit broadcast (CRIT-04, CRIT-05)
- **D2-02:** The new event table broadcasts **every landed hit** (amount + `isCrit` + target +
  attacker), not crit-only. All clients render numbers on shared enemies (Genshin co-op style — full
  shared visibility). Mirror the `skill_cast` / `ranged_attack` event-table pattern (`onInsert`-only,
  never stored; all clients subscribe).
  - **Interaction with D2-01:** the attacker already drew its own number via local prediction, so the
    client MUST **suppress double-drawing its own hits** from the event (render event-driven numbers
    for OTHER players + use the event only to confirm/upgrade the attacker's own crit). Avoid the
    attacker seeing two numbers per hit.
  - **Cost accepted:** an event per landed hit per player = more maincloud traffic than crit-only, and
    potential number clutter through the pixel filter. User chose full visibility over leanness.

### Skill-multiplier trust — server-enforce skill cooldown (CRIT-06, SC4)
- **D2-03:** The server needs a new **`isSkill` intent flag** on `attackEnemies`/`attackRay` to pick
  `skillAttackMultiplier` (uncapped) vs `regularAttackMultiplier` (capped). Because the server enforces
  **no** skill cooldown today (cooldown is client-side in `skillReadyAtByCharacter`), a blindly-trusted
  flag = skill-tier damage on every basic → **fails SC4**. Decision: **server enforces the skill
  cooldown authoritatively.**
  - Add a per-player `skillReadyAt` (server-tracked, using the character's `skill.cooldownSeconds` which
    the server can already know from mirrored data). Set it on an authoritative skill cast.
  - When a hit claims `isSkill`, the server grants the skill multiplier ONLY if the player is off
    cooldown; otherwise treat the hit as a basic (or reject). This makes skill damage un-spoofable and
    satisfies SC4.
  - The existing `sendCastSkill` path is the natural authoritative "cast happened" signal — planner
    verifies whether to gate `skillReadyAt` off it or off the `isSkill` hit itself.

### Combo trust — clamp to the existing cap (CRIT-06, SC4)
- **D2-04:** Client-sent `comboCount` stays (combo is a client-timing concept), but the server
  **clamps it to `MAX_COMBO_FOR_GEMS` (100)** in the damage path before it feeds the multipliers —
  the same clamp the gem payout already uses (`index.ts` ~1835). Rationale: `regularAttackMultiplier`
  is already CAPPED (safe), but `skillAttackMultiplier` is **UNCAPPED** (`1 + combo × rate`), so an
  unclamped combo = unbounded skill inflation on a legit on-cooldown cast. Clamping bounds it and keeps
  SC4 honest. Full server-authoritative combo is out of scope (see Deferred).

### Claude's Discretion
- Exact new event-table name + columns (follow `skill_cast` / `ranged_attack`; carry amount, `isCrit`,
  target ref, attacker ref).
- Exact **intent-arg shape** for the reworked `attackEnemies` / `attackRay` (D-05 + D2-03): confirm what
  the server already knows (`activeCharacterId` IS server-tracked — `index.ts:315`; transcend/
  constellation level — check `owned_character`/transcend tables) vs what must be passed. Minimum new
  intent appears to be `isSkill` + the already-sent `comboCount`; drop `damage`.
- Whether an out-of-cooldown `isSkill` hit is **downgraded to basic** vs **rejected** (D2-03) — pick the
  one with cleaner feel.
- Whether to gate `skillReadyAt` off the existing `sendCastSkill` cast or off the damage hit.
- Where `isCrit` is recorded on the enemy/goliath hit for Phase 7 (server-side field, NOT necessarily
  the broadcast payload).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & milestone constraints
- `.planning/REQUIREMENTS.md` — CRIT-02, CRIT-04, CRIT-05, CRIT-06 (+ locked "crit roll SERVER-SIDE via
  `ctx.random`" decision, Out-of-scope table, XCMB-02 deferred weapon/constellation crit).
- `.planning/ROADMAP.md` §"Phase 2: Server-authoritative damage + crit on enemies" (Goal + 4 Success
  Criteria + Notes) and §"Cross-Cutting Constraints" (additive schema, server-authoritative, INV-5
  mirror parity, test-first pure helpers, ≤300 LOC/file, one atomic commit, deploy steps, migrated-DB
  verification).
- `.planning/PROJECT.md` — the PVP shard-theft loop (why closing damage spoofs matters).

### Prior-phase context (trilogy-wide decisions — still binding)
- `.planning/phases/01-crit-foundation/01-CONTEXT.md` — D-01..D-08 (Option B server base damage, event
  table waiver, `ctx.random`, skill-covered-by-one-critRate). Phase 2 IMPLEMENTS the wiring these set up.
- `.planning/phases/01-crit-foundation/01-LEARNINGS.md` — critDmg is the FULL multiplier (1.9, not
  1+bonus); strict `<` crit boundary; zero-import rule; single-line flat `CHARACTER_STATS` for the
  serverSync regex; import-and-compare parity for inlined constants.

### Server combat path (to rework)
- `spacetimedb/src/index.ts` — `attackEnemies` (~1816), `attackRay` (~1901), `CHARACTER_STATS` (~43,
  crit + weapon/multiplier mirror from Phase 1), `MAX_HIT_DAMAGE`/`MAX_HIT_RANGE` clamps,
  `MAX_COMBO_FOR_GEMS` (211) + the gem combo clamp (~1835), `activeCharacterId` on `player` (315),
  `sendCastSkill`/`skill_cast` path.
- `spacetimedb/src/crit.ts` — `rollCrit(critRate, critDmg, rng)` (inject `ctx.random`).
- `spacetimedb/src/damage.ts` — `computeBaseDamage`, `regularAttackMultiplier` (capped),
  `skillAttackMultiplier` (uncapped), mirrored `WEAPONS` + transcend/combo math.
- `spacetimedb/src/resistances.ts` — basic + skill both arrive via `attackEnemies` (indistinguishable
  without the new `isSkill` flag).

### Client crit + damage path (to rework)
- `src/game/createGame.ts` — DELETE `rollDamage`/`CRIT_CHANCE`/`CRIT_MULTIPLIER` (~478); `performAttack`
  (~491), `performSkill` (~552), `dealDamage`/`applyAttackDamage`/`applySkillDamage` (~370-392, the
  `sendAttackEnemies` callers), `network.sendAttackEnemies`/`sendAttackRay` signatures (drop `damage`,
  add `isSkill`); local damage-number prediction lives here (D2-01).
- `src/game/combat/damageKind.ts` — `DamageKind 'crit'` + styles (crit number style).
- `src/game/systems/createDamageNumbers.ts` — floating-number renderer; drive OTHER players' numbers +
  crit confirmation from the new event, own numbers from local prediction (D2-01/D2-02).
- `src/game/data/__tests__/serverSync.test.ts` — INV-5 parity gate; keep green (crit + weapon/multiplier
  parity landed Phase 1).

### Test-first pure helpers (per roadmap)
- Any new reducer logic extracted into zero-import vitest-able siblings before wiring (skill-cooldown
  gate, combo clamp, intent→damage glue) — extend `damage.ts`/`crit.ts` or add a sibling; never grow
  `index.ts`.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `skill_cast` / `ranged_attack` event tables + their `onInsert` client wiring — the proven pattern
  for the new per-hit event table (D2-02).
- `crit.ts` `rollCrit` + `damage.ts` `computeBaseDamage`/multipliers — Phase-1 pure helpers, ready to
  wire; inject `ctx.random` as the `rng` thunk (Phase-1 "injected-rng seam" pattern).
- `MAX_COMBO_FOR_GEMS` (100) + the `Math.min(comboCount, MAX_COMBO_FOR_GEMS)` gem clamp — reuse the
  same cap for the damage combo clamp (D2-04).
- `MAX_HIT_DAMAGE`/`MAX_HIT_RANGE`/`MAX_ATTACK_RADIUS` clamps in `attackEnemies` — keep as
  defense-in-depth (SC4).
- `player.activeCharacterId` (server-tracked) — the server already knows the acting character, so
  intent need not send it.
- `DamageKind 'crit'` + `createDamageNumbers` — the crit number already renders; re-source its trigger.

### Established Patterns
- Server-authoritative combat truth; clients render only. Base damage + crit now follow it; the
  displayed own-number is an optimistic local prediction reconciled by the server event.
- Client `CharacterDefinition` ↔ server `CHARACTER_STATS` lockstep (INV-5); `serverSync.test.ts` stays green.
- Test-first zero-import pure helpers, ≤300 LOC/file — carve new glue into siblings, never grow `index.ts`.
- Grep-gate: no `Math.random`/`Date.now` in `spacetimedb/src` (`ctx.random` is the sole crit exception).

### Integration Points
- `attackEnemies` / `attackRay` arg signatures change (drop `damage`, add `isSkill`); the client
  `network.send*` callers in `createGame.ts` change in the SAME slice (no half-migrated reducer).
- New per-hit event table: server roll → all subscribed clients → `createDamageNumbers` (others' numbers
  + own crit confirmation); own non-crit numbers stay local (D2-01/D2-02 double-draw suppression).
- New per-player `skillReadyAt` server state + the `sendCastSkill` cast as its authoritative setter (D2-03).
</code_context>

<specifics>
## Specific Ideas

- "Smooth, not jittery" is the explicit bar (user): instant local hit feedback via client-side
  prediction (D2-01) — the standard action-game approach (Genshin/Diablo/PoE), server reconciles.
- Crits are the shared spectacle — the big red number pops for everyone via the event (D2-02).
- Migrated-DB (not fresh-seed) verification for the new event table + `skillReadyAt`: rows/state exist
  after a real engage on a live migrated DB (`init` only runs on fresh).
</specifics>

<deferred>
## Deferred Ideas

- **Full server-authoritative combo** — server tracks combo from resolved hits + window decay so the
  client sends no combo at all. A meaningful new subsystem (timers, decay, feel reconciliation);
  bounded-clamp (D2-04) is enough for enemies-only Phase 2. Matters more once PVP combo (Phase 3+) is
  in play — revisit then.
- **Weapon/constellation crit contributions (XCMB-02)** — crit stacking on top of base per-character
  crit; already tracked in REQUIREMENTS v2, pairs with the server weapon mirror.
- **Rejected vs downgraded out-of-cooldown skill hit** left to planner discretion (D2-03) — not a
  deferred capability, just an implementation nuance.

*Discussion otherwise stayed within phase scope — all four areas clarify HOW to implement the
already-scoped server-authoritative damage/crit wiring, not new capabilities.*
</deferred>

---

*Phase: 2-server-authoritative-damage-crit-on-enemies*
*Context gathered: 2026-07-08*
