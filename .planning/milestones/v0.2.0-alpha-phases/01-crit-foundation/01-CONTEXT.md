# Phase 1: Crit foundation - Context

**Gathered:** 2026-07-08
**Status:** Ready for planning

<domain>
## Phase Boundary

> **This CONTEXT covers the whole crit trilogy (Phases 1–3); it was gathered in one discuss-phase.**
> The crit work was split because the user chose full server-authoritative base damage (Option B),
> which grew it past a single phase. The decisions below span all three; each is tagged with its
> landing phase. **Phase 1 (this phase) is the FOUNDATION slice only** — see boundary below.

**Crit trilogy (why + split):** per-character crit becomes a real, **server-rolled, server-owned**
stat, and (Option B) the server owns base-damage computation too. Split:
- **Phase 1 — foundation (this phase):** add distinct per-character `critRate`/`critDmg` on
  `CharacterDefinition`, mirror into server `CHARACTER_STATS`, mirror `WEAPONS` + combo/skill/
  transcend multipliers server-side, and build zero-import tested pure helpers (`crit.ts` `rollCrit`,
  `damage.ts` `computeBaseDamage`). Extend `serverSync.test.ts` for crit + weapon parity (INV-5).
  **No reducer wiring, no runtime behavior change.** Covers **CRIT-01, CRIT-03**.
- **Phase 2 — resolution on enemies:** wire the helpers into `attackEnemies`/`attackRay` (drop the
  `damage` arg → intent; server rolls crit via `ctx.random`), delete the client roll
  (`createGame.ts:478` `Math.random()<0.22 → ×1.9`), add the crit event table + truthful crit number.
  Covers **CRIT-02, CRIT-04, CRIT-05, CRIT-06**.
- **Phase 3 — PVP:** extend the same path to `attackPlayer`. Covers **CRIT-07**.

**Phase 1 boundary (this phase):** data + tested pure logic ONLY. Out of scope for Phase 1:
reducer wiring, the crit event table, deleting the client roll (all Phase 2); PVP (Phase 3); the
attack state machine / telegraphs / poise (Phases 4 & 7); weapon/constellation crit *contributions*
(XCMB-02, v2).
</domain>

<decisions>
## Implementation Decisions

### Crit stat design (CRIT-01)
- **D-01:** `critRate`/`critDmg` are **role-seeded then hand-tuned per character**. Baseline by
  role (dps ~30–35% rate / high critDmg, tank ~12%, healer/support ~18%), then tune each of the
  17 characters for identity. Must be DISTINCT per character (CRIT-01) and coherent with the
  existing `Role` system. Values live on `CharacterDefinition` (client) and are mirrored into
  server `CHARACTER_STATS` (INV-5 parity).
- **D-02:** Executor may pick the concrete per-character numbers (role-seeded) as a first pass;
  user tunes in playtest. Keep them legibly different so crit frequency/magnitude reads
  differently between characters in play (Success Criterion 1).

### Crit feedback — the isCrit signal reaches clients (CRIT-04, CRIT-05)
- **D-03 [informational]:** _(lands Phase 2, not tracked in Phase 1)_ **Add a new crit/hit event table.** Roadmap's "no new tables" note is explicitly
  waived by the user for this phase. The server owns the roll (`ctx.random`, un-replicable by a
  client), so the client cannot know `isCrit` locally — it learns it from this server event.
- **D-04 [informational]:** _(lands Phase 2, not tracked in Phase 1)_ **Everyone subscribes** to the crit event so any client can pop the big red crit
  number over the right target — the local attacker, other players watching, and PVP victims.
  Mirror the existing `skill_cast` / `ranged_attack` event-table pattern (`onInsert`-only,
  never stored). The floating number is driven by the real server roll (no client-local crit
  decision) → truthful, no visual regression vs today. Accept ~1 RTT latency on the pop.

### Damage authority (CRIT-02, CRIT-05) — FULL SERVER AUTHORITY (Option B)
- **D-05:** The **server computes base damage from stats**, not the client. `attackEnemies` /
  `attackRay` / `attackPlayer` **drop the `damage` arg** and instead receive *intent* (acting
  character, basic-vs-skill, combo, and whatever the server can't already derive). The server
  mirrors `WEAPONS` (damage/range/isRanged) + the multiplier funcs (`regularAttackMultiplier`,
  `skillAttackMultiplier`, combo scale, `transcendDamageMultiplier`) + skill damage into
  `spacetimedb/src`, computes base, then rolls+applies crit and keeps a sanity clamp
  (belt-and-suspenders). This kills the client-sent-damage spoof class (relevant because PVP
  shard theft is a live cheat incentive). **Cost accepted:** grew the crit work past one phase
  (→ split into Phases 1–3; the weapon/multiplier MIRROR lands in Phase 1, the reducer WIRING in
  Phase 2, PVP in Phase 3) + `serverSync.test.ts` parity extends to weapon damage + multiplier
  constants.
  - Planner MUST verify what the server already knows vs must be passed: `activeCharacterId`
    (known), transcend/constellation level (check `owned_character`/transcend tables — may be
    server-tracked already), combo (currently CLIENT-side → must be passed, already bounded by
    `MAX_COMBO_FOR_GEMS`), basic-vs-skill discriminator (skills and basics are indistinguishable
    server-side today — both arrive via `attackEnemies`; see `resistances.ts`).

### PVP crit scope
- **D-06 [informational]:** _(lands Phase 3, not tracked in Phase 1)_ **Include PVP.** The same server crit roll applies to `attackPlayer`, not just
  `attackEnemies`/`attackRay`. Crit is consistent everywhere and PVP damage numbers stay
  truthful. Cheap once the server roll + base-damage helper exists.

### Crit covers skills automatically
- **D-07:** Skill damage and basic-attack damage both flow through `attackEnemies` server-side
  (indistinguishable — `resistances.ts`). A single per-character `critRate` therefore auto-covers
  skills too (one crit stat, not per-source). With D-05 the server must also compute *skill* base
  damage (mirror `skill.damage` + `skillAttackMultiplier`).

### Determinism / grep-gate
- **D-08:** Crit roll uses `ctx.random` (deterministic server RNG) — the allowed exception to the
  no-`Math.random`/`Date.now` grep-gate on `spacetimedb/src`. Keep the gate green otherwise.

### Claude's Discretion
- Concrete per-character `critRate`/`critDmg` numbers (role-seeded first pass — D-02).
- Exact new event-table name/columns and subscription wiring (follow `skill_cast`/`ranged_attack`).
- Exact intent-arg shape for the reworked reducers (D-05), subject to the server-knows-vs-passed
  verification.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & milestone constraints
- `.planning/REQUIREMENTS.md` — CRIT-01..05, Locked decisions (crit roll SERVER-SIDE via
  `ctx.random`), Out-of-scope table, XCMB-02 (deferred weapon/constellation crit contributions).
- `.planning/ROADMAP.md` §"Phase 1: Crit stats + server damage foundation" (+ Phases 2–3 for the
  full crit trilogy) + §"Cross-Cutting Constraints" (additive
  schema, server-authoritative, INV-5 mirror parity, test-first pure helpers, ≤300 LOC/file,
  one atomic commit, deploy steps).
- `.planning/PROJECT.md` — PVP shard-theft loop (why full damage authority matters).

### Client crit + damage path (to rework)
- `src/game/createGame.ts` — `rollDamage`/`CRIT_CHANCE`/`CRIT_MULTIPLIER` (~478, DELETE the global
  roll), `performAttack` (~490), `performSkill` (~552), `dealDamage`/`applyAttackDamage`/
  `applySkillDamage` (~387), `applyPvpDamage` (~410, `sendAttackPlayer`).
- `src/game/data/characters.ts` — `CharacterDefinition` (add `critRate`/`critDmg`), 17-char roster,
  `Role` + `ROLE_META`.
- `src/game/data/weapons.ts` — `WEAPONS` registry (must mirror server-side for D-05).
- `src/game/combat/damageKind.ts` — `DamageKind 'crit'` + `DAMAGE_KIND_STYLES` (crit number style).
- `src/game/systems/createDamageNumbers.ts` — floating-number renderer (drive from crit event).

### Server combat + parity (to extend)
- `spacetimedb/src/index.ts` — `CHARACTER_STATS` (~43, add crit + mirror weapon/multipliers),
  `attackEnemies` (~1814), `attackRay` (~1899), `attackPlayer` (~1060), `MAX_HIT_DAMAGE` clamp.
- `spacetimedb/src/resistances.ts` — basic/skill both arrive via `attackEnemies` (indistinguishable);
  channel model the crit path coexists with.
- `src/game/data/__tests__/serverSync.test.ts` — INV-5 mirror parity; EXTEND to assert
  client↔server crit values AND (for D-05) weapon damage + multiplier constants.

### Test-first pure helpers (per roadmap)
- New zero-import vitest-able siblings in `spacetimedb/src/` for the crit roll + base-damage
  computation (extract before wiring reducers).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `skill_cast` / `ranged_attack` event tables + their `onInsert` client wiring — the proven
  pattern for the new crit event table (D-03/D-04).
- `CHARACTER_STATS` server mirror + `serverSync.test.ts` — the established INV-5 parity mechanism;
  extend, don't reinvent.
- `DamageKind 'crit'` + `createDamageNumbers` — the crit number already renders; just re-source
  the trigger from the server event.
- `MAX_HIT_DAMAGE` / `MAX_HIT_RANGE` / `MAX_ATTACK_RADIUS` clamps in `attackEnemies` — keep as
  defense-in-depth alongside server-computed damage.

### Established Patterns
- Server-authoritative combat truth; clients render only. Crit roll + base damage now follow it.
- Client `CharacterDefinition` ↔ server `CHARACTER_STATS` must stay in lockstep (INV-5).
- Test-first pure helpers, ≤300 LOC/file — carve crit/damage logic into `spacetimedb/src` siblings,
  never grow `index.ts`.

### Integration Points
- Reducers `attackEnemies` / `attackRay` / `attackPlayer` — arg signatures change (drop `damage`,
  add intent). Client `network.send*` callers in `createGame.ts` change in the same slice.
- The new crit event table connects server roll → all subscribed clients → `createDamageNumbers`.
</code_context>

<specifics>
## Specific Ideas

- Crit number is the "big red crit number" popped over the target for everyone watching (D-04).
- Role → crit intuition: dps = frequent/high crits, tanks = rare, healers/support = middling (D-01).
</specifics>

<deferred>
## Deferred Ideas

- **Weapon/constellation crit contributions (XCMB-02)** — crit stacking on top of base
  per-character crit. Pairs naturally with the server weapon-stat mirror built here; do it as a
  later phase once base crit + full damage authority are proven. Already tracked in REQUIREMENTS v2.
- **Camp-enemy / hero crit-into-FSM interactions** — not until the FSM exists (Phases 2/5).

*Discussion otherwise stayed within phase scope — the "full server base damage" choice (D-05) is
a deeper-authority HOW decision on the same feature, not a new capability.*
</deferred>

<phase_split>
## Crit trilogy — phase split (was one phase, now Phases 1–3)

Dependency-forced. Test-first pure helpers (Phase 1) precede all wiring; server authority + crit
resolution on enemies (Phase 2) lands before PVP (Phase 3). No-monolith holds throughout: server
logic lives in `crit.ts`/`damage.ts` siblings; `index.ts` gains only table defs + reducer-arg changes.

- **Phase 1 (this phase) — foundation.** Stats on `CharacterDefinition` (role-seeded, 17 chars) +
  mirror into `CHARACTER_STATS`; mirror `WEAPONS` + multiplier funcs (`regularAttackMultiplier`,
  `skillAttackMultiplier`, combo scale, `transcendDamageMultiplier`, `skill.damage`); zero-import
  vitest helpers `crit.ts` (`rollCrit`) + `damage.ts` (`computeBaseDamage`); extend
  `serverSync.test.ts` for crit + weapon/multiplier parity. **No wiring, no behavior change.**
  → CRIT-01, CRIT-03. Plans: TBD (set at `/gsd-plan-phase 1`).
  - **Handoff pre-check for Phase 2:** verify what the server already knows (`activeCharacterId`;
    transcend/constellation level — check `owned_character`/transcend tables) vs what Phase 2 must
    pass (combo is client-side today → pass, already bounded).

- **Phase 2 — server-authoritative resolution on enemies.** Wire helpers into
  `attackEnemies`/`attackRay`: drop `damage` arg → intent, server rolls crit via `ctx.random`,
  applies `critDmg`, records `isCrit`, keeps `MAX_HIT_DAMAGE` clamp; add the crit event table
  (`isCrit`/amount/target/attacker, `onInsert`-only, all clients subscribe) → `createDamageNumbers`
  pops the truthful red crit number; DELETE client `rollDamage`/`CRIT_CHANCE`/`CRIT_MULTIPLIER`.
  → CRIT-02, CRIT-04, CRIT-05, CRIT-06.

- **Phase 3 — PVP.** Extend the same server base-damage + crit + event path to `attackPlayer`;
  update client `applyPvpDamage`/`sendAttackPlayer`. Deploy + two-client verify capstone.
  → CRIT-07.

**Deploy per phase:** `spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb --server
local --yes` → `pnpm run spacetime:generate` → `pnpm build`; migrated-DB (not fresh-seed) check.
</phase_split>

---

*Phase: 1-crit-foundation*
*Context gathered: 2026-07-08*
