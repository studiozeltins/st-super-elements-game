# Phase 3: PVP crit - Context

**Gathered:** 2026-07-09
**Status:** Ready for planning
**Mode:** --auto (recommended defaults selected; audit trail in 03-DISCUSSION-LOG.md)

<domain>
## Phase Boundary

Extend the Phase-2 server-authoritative damage + crit path to PVP (`attackPlayer`) — CRIT-07,
the deploy/verify capstone of the crit trilogy:

- `attackPlayer` **drops the `damage: t.u32()` arg** → receives *intent* (`isSkill`, `comboCount`);
  the server computes base damage via the existing `resolvePlayerHit` composition
  (`computeBaseDamage` → `rollCrit(ctx.random)` → clamp) — a modified client can no longer
  inflate PVP damage or fake a PVP crit.
- The existing `pvp_hit` event table is **extended additively** with `attacker` + `isCrit` so the
  truthful `kind:'crit'` number floats over the victim on every subscribed client.
- Client `applyPvpDamage` / `network.sendAttackPlayer` updated in the SAME slice (no
  half-migrated reducer); the D2-01 prediction + D2-02 suppression pattern carries to PVP.
- The kill path (gem spill + shard theft + respawn, `index.ts` ~1124–1162) is **untouched logic** —
  only its damage input changes source; SC3 requires the shard-theft loop still resolves on a
  killing blow.
- Deploy capstone: local publish → `pnpm run spacetime:generate` → `pnpm build` → two-client
  migrated-DB playtest.

**Out of scope:** attack FSM/telegraphs/poise (Phases 4–7), PVP balance changes (resistances,
rate limits), miss/evasion RNG (pending user decision — todo), full server-authoritative combo.
</domain>

<decisions>
## Implementation Decisions

> Trilogy-wide decisions (D-01..D-08, `01-CONTEXT.md`) and Phase-2 decisions (D2-01..D2-04,
> `02-CONTEXT.md`) remain LOCKED and are NOT re-litigated. D-06 ("include PVP") is what this
> phase implements. Phase-3-specific decisions (auto-selected recommended defaults):

### PVP event payload — extend `pvp_hit`, don't add a table (CRIT-07, SC2)
- **D3-01:** Extend the existing `pvp_hit` event table **additively** with `attacker: t.identity()`
  and `isCrit: t.bool()` (keep `target`, `amount`). Rejected: reusing `enemy_hit` (it is
  world-position-anchored — wrong anchor for a moving player victim; `pvp_hit` is
  identity-anchored, the client already resolves the victim's live position) and a third new
  table (needless; `pvp_hit` already exists for exactly this event). Event tables never store
  rows, but verify the additive-migrate column rules (`.default()`) still hold on publish.

### Broadcast amount semantics — full computed hit (Phase-2 convention)
- **D3-02:** The event carries the **full computed amount** (base × crit × clamp), not the
  HP-capped `dealt` — killing blows float the full hit strength, ARPG-style, exactly as Phase 2
  settled for `enemy_hit` (commit `e368fda`). HP application stays
  `Math.min(amount, target.currentHealth)` internally.

### PVP resistance — none this phase (status-quo balance)
- **D3-03:** `resolvePlayerHit` is called for PVP **without a resistance profile** (like enemy
  melee hits). PVP has never applied `PLAYER_RESISTANCES` (they cover the 'contact'/'ranged'
  channels vs enemies/goliaths, tuned for PVE); silently adding them here would be a balance
  rework beyond CRIT-07. Deferred: PVP resist tuning (see Deferred Ideas).

### Intent-arg shape — mirror `attackEnemies` (CRIT-07, SC1)
- **D3-04:** `attackPlayer` intent = `{ targetIdentity: t.identity(), isSkill: t.bool(),
  comboCount: t.u32() }` — drop `damage`. The D2-04 combo clamp (`MAX_COMBO_FOR_GEMS`) and the
  D2-03 authoritative skill window (`skillGrantActive` off `skillWindowEndsAtMicros`) carry
  automatically because they live inside `resolvePlayerHit`. `dmgType` passed as `'melee'`
  (with no profile the channel is inert — planner may simplify).

### Damage-number feel — D2-01/D2-02 carried verbatim to PVP
- **D3-05:** The attacker keeps its instant **local display-only** number in `applyPvpDamage`
  (0-latency feel); the extended `pvp_hit` event is the truth — the attacker **suppresses
  double-drawing its own hits** (now possible: the event carries `attacker`) and upgrades to the
  big red crit number on `isCrit`; the victim and spectators render event-driven numbers
  (full shared visibility, D2-02). Victim's purple number stays; crit styling from
  `DAMAGE_KIND_STYLES`.

### Residual trust — no new enforcement this phase
- **D3-06:** No server-side per-target hit-rate cooldown (client `PVP_HIT_COOLDOWN_SECONDS`
  stays client-only) and no full server-authoritative combo. Both are pre-existing,
  rate-shaped holes orthogonal to CRIT-07 (per-hit amount + crit are now un-spoofable; call
  spam inflates DPS, not per-hit damage). Roadmap sizes this phase "small"; keep it the
  capstone slice. Both recorded in Deferred Ideas — combo authority was already flagged in
  02-CONTEXT for "revisit at Phase 3+": revisited, still deferred (a full subsystem, not a
  capstone add-on).

### Claude's Discretion
- Exact new-column order/names on `pvp_hit` and whether `.default()` is required on the
  additive event-table columns for migrate-publish.
- How the ranged-PVP path (`applyRangedProjectileHit` → `applyPvpDamage`) reports intent —
  same `sendAttackPlayer` call is expected; verify `PVP_MAX_HIT_RANGE` (client, ranged) vs the
  server `MAX_HIT_RANGE` guard in `attackPlayer` doesn't reject legitimate long-range bow PVP
  (pre-existing behavior — do not silently change the envelope, but surface it if they conflict).
- Where the own-hit suppression lives (network `pvp_hit` callback vs `createDamageNumbers`).
- Whether the victim's damage flash/purple number needs a distinct crit variant or reuses the
  standard crit style.
- Whether `isCrit` needs recording server-side beyond the event for Phase 7 (poise targets
  goliath windups, so PVP likely needs event-only — verify against POISE-01..03).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & milestone constraints
- `.planning/REQUIREMENTS.md` — CRIT-07 (the single requirement), Locked decisions
  (server-side `ctx.random` crit), Out of Scope table.
- `.planning/ROADMAP.md` §"Phase 3: PVP crit" (Goal + 3 Success Criteria + Notes) and
  §"Cross-Cutting Constraints" (additive schema, server-authoritative, INV-5, ≤300 LOC/file,
  one atomic commit, deploy steps, migrated-DB verification).
- `.planning/PROJECT.md` — PVP shard-theft loop (the live cheat incentive CRIT-07 closes).

### Prior-phase context (trilogy decisions — still binding)
- `.planning/phases/01-crit-foundation/01-CONTEXT.md` — D-01..D-08 (esp. D-05 Option B, D-06 PVP).
- `.planning/phases/02-server-authoritative-damage-crit-on-enemies/02-CONTEXT.md` — D2-01..D2-04
  (prediction, every-hit broadcast, skill window, combo clamp) — this phase extends them to PVP.
- `.planning/phases/02-server-authoritative-damage-crit-on-enemies/02-LEARNINGS.md` — Phase-2
  extraction (patterns that worked, gotchas).
- `.planning/phases/02-server-authoritative-damage-crit-on-enemies/02-PATTERNS.md` — codebase
  pattern map from Phase 2 (analog files for this same combat path).

### Server PVP path (to rework)
- `spacetimedb/src/index.ts` — `attackPlayer` (~1092: drop `damage`, wire `resolvePlayerHit`;
  kill path ~1124–1162 must stay intact), `pvp_hit` table (~542: extend), `resolvePlayerHit`
  (~1862: the composition to reuse as-is), `enemy_hit` (~569: the payload/convention analog),
  `MAX_HIT_RANGE`/`MAX_HIT_DAMAGE` clamps, `skillWindowEndsAtMicros`/`skillGrantActive`.
- `spacetimedb/src/damage.ts`, `spacetimedb/src/crit.ts` — pure helpers (already wired; no change
  expected).
- `spacetimedb/src/resistances.ts` — `PLAYER_RESISTANCES` NOT applied to PVP (D3-03).

### Client PVP path (to rework)
- `src/game/createGame.ts` — `applyPvpDamage` (~415: stop sending `damage`, keep local
  display number per D3-05), `sendAttackPlayer` signature (~74), `dealDamage`/
  `applyRangedProjectileHit` (the two PVP call sites), pvp_hit consumption (victim number).
- `src/game/combat/damageKind.ts` — `DamageKind 'crit'` styles.
- `src/game/systems/createDamageNumbers.ts` — event-driven numbers + suppression (D3-05).
- `src/game/data/__tests__/serverSync.test.ts` — INV-5 parity gate; must stay green (no new
  mirrored constants expected this phase).

### Test-first pure helpers
- Any new glue (e.g. PVP intent validation) extracted into zero-import vitest siblings before
  wiring; `resolvePlayerHit` already encapsulates the roll — expect little to no new pure logic.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `resolvePlayerHit(ctx, hitter, isSkill, combo, dmgType, profile?)` (`index.ts` ~1862) — the
  ENTIRE Phase-2 server damage/crit composition, directly callable from `attackPlayer`; apply
  order (base → × crit → resist → clamp) already load-bearing and tested.
- `pvp_hit` event table + victim purple-number client wiring — extend, don't replace (D3-01).
- `enemy_hit` insert sites (~1929, 1955, 2080, 2112) — the exact per-hit event pattern to mirror.
- D2-01 prediction + suppression machinery from Phase 2 (`createGame.ts` own-number comments
  ~498–500, `createDamageNumbers`) — same reconciliation, new event source.
- Existing `attackPlayer` guards (self-attack, party friendly-fire, safe zones, `MAX_HIT_RANGE`)
  — all stay; only the damage computation swaps.

### Established Patterns
- Server-authoritative combat truth; clients render only (Phase 2 proved it on enemies).
- Event tables `{ public: true, event: true }`, `onInsert`-only, never stored.
- Additive schema only; migrate-publish; migrated-DB (not fresh-seed) verification per phase.
- Grep-gate: no `Math.random`/`Date.now` in `spacetimedb/src` (`ctx.random` sole exception).
- ≤300 LOC/file; `index.ts` gains only reducer-arg + table-column changes.

### Integration Points
- `attackPlayer` signature change ↔ client `sendAttackPlayer` callers change in the same slice.
- Extended `pvp_hit` → regenerated bindings (`pnpm run spacetime:generate`) → client event
  consumers (victim number, attacker crit upgrade, spectator numbers).
- Kill path consumes the server-computed amount — shard-theft/gem-spill logic untouched (SC3).
</code_context>

<specifics>
## Specific Ideas

- "Smooth, not jittery" bar carries from Phase 2: attacker's own PVP number stays instant
  (local prediction), server event reconciles/upgrades (D3-05).
- Crits stay the shared spectacle: PVP crit pops the big red number for attacker, victim, and
  spectators (D2-02 full visibility extended to PVP).
- Two-client migrated-DB playtest is the phase's UAT: distinct per-character crit visible in
  PVP, no visual regression, shard theft resolves on a killing blow (SC3).
</specifics>

<deferred>
## Deferred Ideas

- **PVP resistance tuning** — applying (or designing separate) target resistances for PVP
  hits; a balance capability, not an authority fix (D3-03).
- **Server-side PVP hit-rate cooldown** — server mirror of `PVP_HIT_COOLDOWN_SECONDS` so a
  modified client can't spam `attackPlayer` for DPS inflation; pre-existing hole, orthogonal
  to CRIT-07 (D3-06).
- **Full server-authoritative combo** — revisited per 02-CONTEXT's "revisit at Phase 3+";
  still deferred: a real subsystem (server hit-window tracking, decay, feel reconciliation),
  bounded today by the D2-04 clamp.

### Reviewed Todos (not folded)
All 5 score-matched pending todos were reviewed; none folded — each is a new capability
outside the PVP-crit domain (scope guardrail overrides the mechanical ≥0.4 fold threshold):

- **Miss/evasion system decision** (`2026-07-08-miss-evasion-...md`, score 0.4) — touches the
  same crit/hit path but is an explicit pending USER decision (accuracy vs evasion vs none);
  Phase 3 must NOT introduce miss RNG. Closest-related todo — planner should not pre-empt it.
- **BŪSTS orbit v2** (score 0.6) — visual effect work; keyword match (`random`, `shard`) spurious.
- **Phase 6 raid boss DEFERRED** (score 0.6) — explicitly reserved for a later milestone
  (ROADMAP §Reserved); folding would violate the milestone boundary.
- **Phase 7 role enforcement/balance DEFERRED** (score 0.4) — same; depends on raid boss.
- **Expand transcend scaling** (score 0.4) — balance design question needing user pros/cons
  decision; unrelated to PVP crit authority.
</deferred>

---

*Phase: 3-pvp-crit*
*Context gathered: 2026-07-09 (auto mode)*
