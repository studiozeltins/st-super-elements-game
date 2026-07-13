# Phase 3: PVP crit - Research

**Researched:** 2026-07-09
**Domain:** SpacetimeDB TS server-authoritative combat — extending the Phase-2 damage/crit path to PVP (`attackPlayer`)
**Confidence:** HIGH (every load-bearing claim verified directly against the codebase this session; one MEDIUM item — event-table additive-migrate acceptance — verified against official docs but empirically confirmed only at publish time)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

> Trilogy-wide decisions (D-01..D-08, `01-CONTEXT.md`) and Phase-2 decisions (D2-01..D2-04,
> `02-CONTEXT.md`) remain LOCKED and are NOT re-litigated. D-06 ("include PVP") is what this
> phase implements. Phase-3-specific decisions (auto-selected recommended defaults):

- **D3-01:** Extend the existing `pvp_hit` event table **additively** with `attacker: t.identity()`
  and `isCrit: t.bool()` (keep `target`, `amount`). Rejected: reusing `enemy_hit` (it is
  world-position-anchored — wrong anchor for a moving player victim; `pvp_hit` is
  identity-anchored, the client already resolves the victim's live position) and a third new
  table (needless; `pvp_hit` already exists for exactly this event). Event tables never store
  rows, but verify the additive-migrate column rules (`.default()`) still hold on publish.
- **D3-02:** The event carries the **full computed amount** (base × crit × clamp), not the
  HP-capped `dealt` — killing blows float the full hit strength, ARPG-style, exactly as Phase 2
  settled for `enemy_hit` (commit `e368fda`). HP application stays
  `Math.min(amount, target.currentHealth)` internally.
- **D3-03:** `resolvePlayerHit` is called for PVP **without a resistance profile** (like enemy
  melee hits). PVP has never applied `PLAYER_RESISTANCES` (they cover the 'contact'/'ranged'
  channels vs enemies/goliaths, tuned for PVE); silently adding them here would be a balance
  rework beyond CRIT-07. Deferred: PVP resist tuning.
- **D3-04:** `attackPlayer` intent = `{ targetIdentity: t.identity(), isSkill: t.bool(),
  comboCount: t.u32() }` — drop `damage`. The D2-04 combo clamp (`MAX_COMBO_FOR_GEMS`) and the
  D2-03 authoritative skill window (`skillGrantActive` off `skillWindowEndsAtMicros`) carry
  automatically because they live inside `resolvePlayerHit`. `dmgType` passed as `'melee'`
  (with no profile the channel is inert — planner may simplify).
- **D3-05:** The attacker keeps its instant **local display-only** number in `applyPvpDamage`
  (0-latency feel); the extended `pvp_hit` event is the truth — the attacker **suppresses
  double-drawing its own hits** (now possible: the event carries `attacker`) and upgrades to the
  big red crit number on `isCrit`; the victim and spectators render event-driven numbers
  (full shared visibility, D2-02). Victim's purple number stays; crit styling from
  `DAMAGE_KIND_STYLES`.
- **D3-06:** No server-side per-target hit-rate cooldown (client `PVP_HIT_COOLDOWN_SECONDS`
  stays client-only) and no full server-authoritative combo. Both are pre-existing,
  rate-shaped holes orthogonal to CRIT-07 (per-hit amount + crit are now un-spoofable; call
  spam inflates DPS, not per-hit damage). Both recorded in Deferred Ideas.

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

### Deferred Ideas (OUT OF SCOPE)
- **PVP resistance tuning** — applying (or designing separate) target resistances for PVP
  hits; a balance capability, not an authority fix (D3-03).
- **Server-side PVP hit-rate cooldown** — server mirror of `PVP_HIT_COOLDOWN_SECONDS` so a
  modified client can't spam `attackPlayer` for DPS inflation; pre-existing hole, orthogonal
  to CRIT-07 (D3-06).
- **Full server-authoritative combo** — revisited per 02-CONTEXT's "revisit at Phase 3+";
  still deferred: a real subsystem (server hit-window tracking, decay, feel reconciliation),
  bounded today by the D2-04 clamp.
- **Miss/evasion system** — explicit pending USER decision; Phase 3 must NOT introduce miss RNG.
- BŪSTS orbit v2, Phase 6 raid boss, Phase 7 role enforcement, transcend scaling — all
  reviewed and NOT folded (milestone/scope boundaries).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CRIT-07 | PVP hits (`attackPlayer`) resolve base damage + crit server-side via the same path and emit the crit event, so PVP crit numbers are truthful and un-spoofable | `resolvePlayerHit` (index.ts:1862) is directly callable from `attackPlayer` with zero changes — the entire composition (base → × crit → resist → clamp, skill window, combo clamp) is already inside it. The `pvp_hit` event table (index.ts:542) has exactly one insert site (index.ts:1117) and one client consumer (App.tsx:201). All existing `attackPlayer` guards and the kill path (index.ts:1124–1162) survive the swap untouched. See §Architecture Patterns and §Code Examples. |
</phase_requirements>

## Summary

This is a small, fully-mapped wiring phase. Every asset it needs already exists and was verified at its exact location this session: `resolvePlayerHit(ctx, hitter, isSkill, combo, dmgType, profile?)` at `spacetimedb/src/index.ts:1862` is the complete Phase-2 damage/crit composition and takes an optional profile — calling it with `'melee'` and no profile (D3-03/D3-04) reproduces enemy-melee semantics for PVP. The `attackPlayer` reducer (index.ts:1092) currently trusts a client `damage: t.u32()`; the swap replaces exactly two lines of damage math (index.ts:1115–1116) while every guard (self-attack, party friendly-fire, safe zones, range) and the entire kill path (gem spill + shard theft + respawn, 1124–1162) consume the result unchanged.

Three non-obvious findings matter for planning. **First**, the additive-migrate question is settled: SpacetimeDB's automatic migration requires added columns to be appended at the END of the table definition WITH a `.default()` — the rule is stated unconditionally (no exemption for event tables), and both builders support it (`t.bool().default(false)` and `t.identity().default(Identity.zero())`; `Identity` is already imported at index.ts:2 and `Identity.zero()` exists in the SDK). **Second**, `tables.pvpHit` is currently subscribed TWICE (manual `.subscribe` list at App.tsx:122 AND `useTable` at App.tsx:201) — per the Phase-2 "one-subscription rule" learning this double-fires `onInsert` today, and it will double-draw the attacker's crit upgrade unless the manual-list entry is removed in the same slice. **Third**, the victim-side `pvpDamageSinceSync` netting in `spawnSelfNumber` keys on `kind === 'pvp'` (createGame.ts:1062) — if the victim's crit gets a new `DamageKind`, that check must match it too, or every PVP crit on you double-floats a phantom "taken" number.

The range-envelope question resolves cleanly: client `PVP_MAX_HIT_RANGE` (45, createGame.ts:206) exactly equals server `MAX_HIT_RANGE` (45, index.ts:206), and the client check is 3D (strictly tighter than the server's 2D XZ check) — no systematic conflict for legitimate bow PVP; only transient edge rejections when the attacker moves between projectile-hit and reducer execution (pre-existing, surfaced below, not changed).

**Primary recommendation:** Rework `attackPlayer` to the D3-04 intent signature calling `resolvePlayerHit(ctx, attacker, isSkill, clampedCombo, 'melee')`, extend `pvp_hit` with `attacker: t.identity().default(Identity.zero())` + `isCrit: t.bool().default(false)` appended after `amount`, remove `tables.pvpHit` from the manual subscribe list, and route all three client render roles (victim / attacker / spectator) through the existing `useTable(tables.pvpHit)` callback in App.tsx — one slice, one commit, then local publish → generate → build → two-client migrated-DB playtest.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| PVP base damage computation | SpacetimeDB module (reducer) | — | CRIT-07: client-authored damage is the spoof hole being closed; server mirrors all inputs (`CHARACTER_COMBAT`, `WEAPONS`, transcend/constellation) |
| Crit roll (`isCrit`) | SpacetimeDB module (`ctx.random`) | — | Locked milestone decision; deterministic server RNG is the only un-spoofable source |
| Skill-multiplier grant | SpacetimeDB module (`skillGrantActive` off `skillWindowEndsAtMicros`) | — | D2-03 carried automatically inside `resolvePlayerHit` |
| Hit intent (who/skill/combo) + hit detection | Browser client | Server validates (range, safe zone, party, clamps) | Client detects the swing/projectile contact and sends intent; server never trusts values, only validates plausibility |
| HP application + kill path (gem spill, shard theft, respawn) | SpacetimeDB module | — | Already server-owned; only its damage INPUT changes source (SC3: logic untouched) |
| Damage-number rendering (all viewers) | Browser client (`useTable(tables.pvpHit)` → `createDamageNumbers`) | — | Event-driven truth from `pvp_hit`; attacker keeps instant local display number (D3-05) |
| PVP hit-rate pacing | Browser client (`PVP_HIT_COOLDOWN_SECONDS`) | — | D3-06: stays client-only this phase (deferred hole, rate-shaped not value-shaped) |

## Standard Stack

### Core (all already installed — ZERO new dependencies, per milestone lock)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `spacetimedb` (TS SDK, server + client + react) | 2.6.1 (installed, verified `node_modules`) | Tables, reducers, event tables, `ctx.random`, subscriptions | The project's platform; `t.identity().default()` / `t.bool().default()` confirmed present in 2.6.1 typings `[VERIFIED: node_modules/spacetimedb/dist/lib/type_builders.d.ts:437,574]` |
| SpacetimeDB CLI | installed (`spacetimedb-cli.exe`, commit 052c83f) | publish / generate / sql / logs | Verified on PATH; `local` + `maincloud` servers configured `[VERIFIED: spacetime server list]` |
| `three` | ^0.185.1 | Damage-number sprites (existing `createDamageNumbers`) | No changes needed to the renderer |
| `vitest` | 3.2.4 | Test runner (`pnpm test` → `vitest run`) | Existing suite; INV-5 parity gate lives here |
| `pnpm` | 11.9.0 (verified) | Package manager | Repo rule: pnpm only (npm crashes on symlink layout) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `Identity` (from `'spacetimedb'`) | 2.6.1 | `Identity.zero()` as the `.default()` for the new `attacker` column | Already imported at index.ts:2 `[VERIFIED: codebase]`; `Identity.zero()` exists `[VERIFIED: node_modules/spacetimedb/dist/lib/identity.d.ts:51]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extending `pvp_hit` | New `pvp_hit_v2` table + deleting the old | Rejected by D3-01 (locked); also table removal is not auto-migratable per docs (though the project has removed EMPTY tables successfully — `enemy_carry` precedent) |
| `Identity.zero()` default | No default on `attacker` | Docs state added columns MUST have a default — no-default is expected to be rejected at publish `[CITED: spacetimedb.com/docs/databases/automatic-migrations/]` |

**Installation:** none — no new packages.

## Package Legitimacy Audit

No new packages are installed this phase (milestone "zero new deps" lock; all work composes existing in-repo seams). Audit not applicable.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 ATTACKER CLIENT                          SPACETIMEDB MODULE                         ALL SUBSCRIBED CLIENTS
 ───────────────                          ──────────────────                         ──────────────────────
 swing/projectile contact
 (dealDamage / applyRangedProjectileHit)
        │
        ├─ local display number (D3-05)             ┌──────────────────────────┐
        │  damageNumbers.spawn(victimPos,…)         │ attackPlayer reducer     │
        │                                           │  guards (UNCHANGED):     │
        └─ sendAttackPlayer(target,        ───────▶ │   self / party / safe    │
           isSkill, comboCount)   [INTENT]          │   zones / MAX_HIT_RANGE  │
                                                    │  combo = min(cc, 100)    │
                                                    │  resolvePlayerHit(ctx,   │
                                                    │   attacker, isSkill,     │
                                                    │   combo, 'melee')        │  ← base → ×crit → clamp
                                                    │   { amount, isCrit }     │    (ctx.random roll)
                                                    │  pvpHit.insert({target,  │
                                                    │   attacker, amount,      │ ──▶ pvp_hit EVENT row
                                                    │   isCrit})  [pre-branch] │      (never stored)
                                                    │  dealt=min(amount,curHP) │        │
                                                    │  survivor: setHealth ────┤        │
                                                    │  fatal: spill gems +     │        │
                                                    │   shard theft + respawn  │        │
                                                    │   (1124–1162 UNTOUCHED)  │        │
                                                    └──────────────────────────┘        │
                                                                                        ▼
                                                                       App.tsx useTable(tables.pvpHit).onInsert
                                                                       (ONE subscription — removed from manual list)
                                                                        ├─ target === me   → spawnSelfNumber(amount,
                                                                        │                     isCrit ? crit-variant : 'pvp')
                                                                        │                     + lastPvpHitOnMeAtRef mark
                                                                        ├─ attacker === me → suppress (already drew local);
                                                                        │                     if isCrit → upgrade at victim's
                                                                        │                     live position (remotePlayers map)
                                                                        └─ spectator       → number at victim's live position
                                                                                             + flashRemoteHealth(targetHex)
```

The victim's position for attacker/spectator rendering is resolved IDENTITY→live position via the `remotePlayers` map (D3-01's rationale for keeping `pvp_hit` identity-anchored rather than reusing world-anchored `enemy_hit`).

### Recommended Project Structure (no new files expected)

```
spacetimedb/src/
├── index.ts            # pvp_hit table +2 columns; attackPlayer body rework (only file with server changes)
├── damage.ts           # unchanged (already wired)
├── crit.ts             # unchanged
├── skillGate.ts        # unchanged
└── resistances.ts      # unchanged (NOT applied to PVP, D3-03)
src/
├── App.tsx             # remove tables.pvpHit from manual subscribe list; rework pvpHit onInsert 3-way branch; attackPlayer binding
├── game/createGame.ts  # Network.sendAttackPlayer signature; applyPvpDamage threads isSkill; new/extended game-handle method for remote-anchored numbers
├── game/combat/damageKind.ts        # (discretion) add 'pvpCrit' style
└── module_bindings/    # REGENERATED (pnpm run spacetime:generate) — never hand-edited
```

### Pattern 1: Intent-not-value reducer signature (Phase-2 pattern, extend verbatim)
**What:** Client sends `{ targetIdentity, isSkill, comboCount }`; server computes the number.
**When to use:** This is the exact D3-04 shape; mirror `attackEnemies` (index.ts:1899–1907).
**Example:**
```typescript
// Source: spacetimedb/src/index.ts:1899 (attackEnemies, Phase 2) — the proven analog
export const attackPlayer = spacetimedb.reducer(
  { targetIdentity: t.identity(), isSkill: t.bool(), comboCount: t.u32() },
  (ctx, { targetIdentity, isSkill, comboCount }) => { /* guards … then: */
    const combo = Math.min(comboCount, MAX_COMBO_FOR_GEMS);      // D2-04 clamp, index.ts:1917 idiom
    const { amount, isCrit } = resolvePlayerHit(ctx, attacker, isSkill, combo, 'melee'); // D3-03: no profile
    ctx.db.pvpHit.insert({ target: targetIdentity, attacker: attacker.identity, amount, isCrit }); // D3-02: FULL amount, pre-branch
    const dealt = Math.min(amount, target.currentHealth);
    // … existing survivor/fatal branch consumes `dealt` exactly as it consumed the old value
  }
);
```
Note: the old manual `Math.min(damage, MAX_HIT_DAMAGE)` (index.ts:1115) is DELETED — the clamp already lives inside `resolvePlayerHit` (index.ts:1891).

### Pattern 2: Additive event-table columns with `.default()` (migrate-safe)
**What:** Append new columns at the END of the column object, each with `.default()`.
**When to use:** The `pvp_hit` extension (D3-01).
**Example:**
```typescript
// Source: spacetimedb.com/docs/databases/automatic-migrations/ + docs/tables/default-values/
// + existing pvpHit at spacetimedb/src/index.ts:542
const pvpHit = table(
  { name: 'pvp_hit', public: true, event: true },
  {
    target: t.identity(),
    amount: t.u32(),
    attacker: t.identity().default(Identity.zero()),  // appended, defaulted
    isCrit: t.bool().default(false),                  // appended, defaulted
  }
);
```
Per the Phase-2 learning, `.default()` does NOT make the column optional in the insert type — the single insert site (index.ts:1117, verified the ONLY one via grep) must supply both values in the same change or the module fails to compile.

### Pattern 3: One-subscription rule for event tables (Phase-2 learning — apply to pvp_hit NOW)
**What:** An event table listed in BOTH the manual `.subscribe([...])` AND its own `useTable` delivers every row twice — `onInsert` fires twice.
**When to use:** `tables.pvpHit` is currently in both (App.tsx:122 manual list + App.tsx:201 useTable) `[VERIFIED: codebase]` — the victim's purple number likely double-draws TODAY (fanned 0.16u apart, subtle). Removing `tables.pvpHit` from the manual list is REQUIRED in this slice, or the new attacker crit upgrade and spectator numbers will all double-draw. The `enemy_hit` comment block (App.tsx:223–226) documents the rule; `pullResult` (App.tsx:181–183) dedupes for the same reason.

### Pattern 4: Event-driven 3-way render branch with self-skip (extend the existing idiom)
**What:** `onInsert` branches on `target`/`attacker` vs `myIdentityRef.current` hex.
**When to use:** The reworked `pvpHit` callback. The existing victim/bystander branch (App.tsx:201–215) grows an attacker branch.
**Example:**
```typescript
// Source: existing App.tsx:201-215 (pvpHit) + App.tsx:170-175 (rangedAttack self-skip)
useTable(tables.pvpHit, {
  onInsert: row => {
    const targetHex = row.target.toHexString();
    const attackerHex = row.attacker.toHexString();
    if (targetHex === myIdentityRef.current) {
      lastPvpHitOnMeAtRef.current = performance.now();   // keep: shard-theft toast disambiguation
      gameRef.current?.spawnSelfNumber(row.amount, row.isCrit ? 'pvpCrit' : 'pvp');
      return;
    }
    gameRef.current?.flashRemoteHealth(targetHex);        // keep: victim health-bar reveal
    if (attackerHex === myIdentityRef.current) {
      // D3-05: own non-crit already drawn locally in applyPvpDamage — suppress; upgrade crit only.
      if (row.isCrit) gameRef.current?.spawnPlayerNumber(targetHex, row.amount, 'crit');
      return;
    }
    gameRef.current?.spawnPlayerNumber(targetHex, row.amount, row.isCrit ? 'crit' : 'normal'); // spectator (D2-02)
  },
});
```
**Discretion answered — where suppression lives:** in this App.tsx `onInsert` callback, NOT `createDamageNumbers`. Rationale: it mirrors the established self-skip idiom (rangedAttack/enemyHit), keeps `createDamageNumbers` a dumb renderer, and the identity refs it needs (`myIdentityRef`) already live in App.tsx. `spawnPlayerNumber(identityHex, amount, kind)` is a new small game-handle method resolving the victim's live position from the `remotePlayers` map (same lookup as `flashRemoteHealth`, createGame.ts:1068–1071); skip silently if the view is missing.

### Anti-Patterns to Avoid
- **Re-composing damage inline in `attackPlayer`:** route through `resolvePlayerHit` — the Phase-2 "single damage-resolution seam" pattern exists precisely so PVP doesn't fork the math.
- **Emitting the event inside the survivor branch:** Phase-2 shipped a bug where fatal hits floated no number. `attackPlayer`'s existing insert already sits pre-branch (index.ts:1117) — keep it there.
- **Leaving the old `damage` arg or a half-migrated client:** reducer signature + bindings + client callers change in ONE slice (no-legacy rule; a stale client gets a reducer-arg mismatch, same failure class as "no such reducer").
- **Adding `PLAYER_RESISTANCES` to PVP "while we're here":** explicitly rejected (D3-03) — balance rework, not authority fix.
- **Inserting the new columns mid-table or unordered:** automatic migration requires appended-at-end `[CITED: spacetimedb.com/docs/databases/automatic-migrations/]`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PVP damage/crit composition | A PVP-specific damage formula in `attackPlayer` | `resolvePlayerHit` (index.ts:1862) as-is | Apply order (base → × crit → resist → clamp) is load-bearing and already tested; forking it reopens drift |
| Combo bounding | New PVP combo validation | `Math.min(comboCount, MAX_COMBO_FOR_GEMS)` (index.ts:1917 idiom) | Same clamp gems + enemies already use (D2-04) |
| Skill-tier trust | A PVP skill cooldown check | `skillGrantActive` via `resolvePlayerHit` (automatic) | D2-03 window (`skillWindowEndsAtMicros`, set by the gated `castSkill`) covers PVP with zero new code |
| Victim position for numbers | Position columns on `pvp_hit` | `remotePlayers` map lookup by identity hex | D3-01 rationale: identity-anchored; the client tracks the victim's live interpolated position already |
| Crit number styling | New sprite/text rendering | `DAMAGE_KIND_STYLES` + `createDamageNumbers.spawn` | Renderer is kind-driven; a style entry is one line |
| Event delivery | Any polling/state table for hits | `{ public: true, event: true }` table + `useTable` onInsert | Established pattern; rows never stored, zero cache cost |

**Key insight:** this phase should add almost no new logic — it re-points one reducer's damage input and one event's payload at machinery Phase 2 already built and playtested. Any plan that grows new subsystems (cooldowns, resist profiles, combo tracking) is out of scope by locked decision.

## Common Pitfalls

### Pitfall 1: `pvp_hit` double-subscription double-draws every event number
**What goes wrong:** Victim purple numbers (and, after this phase, attacker crit upgrades + spectator numbers) each draw twice, ~0.16u apart.
**Why it happens:** `tables.pvpHit` is in the manual `.subscribe` list (App.tsx:122) AND has its own `useTable` (App.tsx:201). Event tables have no client cache to dedupe, so each subscription delivers the row and `onInsert` fires per delivery — the exact Phase-2 `enemy_hit` bug, and the documented reason `pullResult` dedupes on `slot`.
**How to avoid:** Remove `tables.pvpHit` from the manual subscribe list in the same slice (the `useTable` opens its own subscription; events keep flowing).
**Warning signs:** Two overlapping purple numbers on the victim; two crit pops per PVP crit in the playtest. (Note: `skillCast`, `rangedAttack`, `healEvent` share this double-subscription today — OUT of scope to fix here, but don't be surprised by doubled remote skill VFX during the playtest; flag, don't fix.)

### Pitfall 2: victim crit kind breaks the `pvpDamageSinceSync` netting
**What goes wrong:** After giving the victim's number a crit variant, every PVP crit on you also floats a phantom red "taken" number a moment later.
**Why it happens:** `spawnSelfNumber` nets PVP damage out of the synced-HP-drop "taken" number via `if (kind === 'pvp') pvpDamageSinceSync += amount` (createGame.ts:1062). A new kind (e.g. `'pvpCrit'`) silently skips the netting, so `syncMyServerRow` (createGame.ts:1035–1043) re-floats the drop as enemy damage.
**How to avoid:** Whatever kind the victim's crit number uses, include it in the netting check (`kind === 'pvp' || kind === 'pvpCrit'`).
**Warning signs:** Victim sees purple crit + red taken number for one hit in the two-client playtest.

### Pitfall 3: full-amount event (D3-02) vs HP application
**What goes wrong:** Killing blows either float the sliver of remaining HP, or HP math double-applies the uncapped amount.
**Why it happens:** The event must carry `amount` (full computed), while HP/kill logic must keep consuming `dealt = Math.min(amount, target.currentHealth)`. The current code computes `dealt` FIRST and broadcasts it — the order of concerns flips.
**How to avoid:** Insert the event with `amount`; compute `dealt` after; leave `remainingHealth = target.currentHealth - dealt` and everything below (1119–1162) byte-for-byte. Non-fatal hits are unaffected (`amount === dealt` whenever the target survives), and the victim's netting (Pitfall 2) stays correct on fatal hits because `wasRespawned` skips the taken-number branch and `pvpDamageSinceSync` resets each sync (createGame.ts:1029–1046).
**Warning signs:** SC3 playtest — shard-theft toast/loop must still resolve on a killing blow; a wrong `dealt` breaks respawn or shard conservation.

### Pitfall 4: `.default()` compiles but the insert site still needs backfilling — and only one exists
**What goes wrong:** Assuming defaulted columns are optional at insert.
**Why it happens:** Phase-2 learning: the TS insert type requires every column regardless of `.default()`; the miss surfaced at module compile time in a path no test touched (`restorePlayers`).
**How to avoid:** Grep confirmed exactly ONE `pvpHit.insert` site (index.ts:1117) and `pvp_hit` is NOT in the backup/restore set (event tables aren't backed up) — update that one call with `attacker` + `isCrit` in the same edit. `cd spacetimedb && spacetime build` (NOT `--project-path`, which this machine's CLI rejects) or `pnpm run spacetime:generate` (which compiles the module) catches any miss.
**Warning signs:** Module compile error on publish/generate.

### Pitfall 5: deploy-order — reducer signature changes strand stale clients
**What goes wrong:** A built client calls `attackPlayer({ targetIdentity, damage })` against a module expecting the intent shape (or vice versa) → reducer arg mismatch, PVP silently dead.
**Why it happens:** Server signature + generated bindings + client callers are one atomic contract.
**How to avoid:** The capstone order is fixed: `spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb --server local --yes` (additive migrate, NO `--delete-data`) → `pnpm run spacetime:generate` → `pnpm build` → both playtest clients load the fresh `dist/`. Ignore the wrong-path `spacetime:publish*` npm scripts (they point at `server/`). Maincloud stays untouched (STATE ops invariant: deferred to prod point; when it happens, same additive publish — never `--delete-data` on real accounts).
**Warning signs:** "no such reducer" / arg-mismatch errors in `spacetime logs 2d-impact-game-fr9ti -f`; hashed `index-<hash>.js` errors meaning the browser is on stale `dist/`.

### Pitfall 6: expecting the migrate to be verifiable via rows
**What goes wrong:** A "verify pvp_hit has new columns" SQL check against a live DB finds nothing to inspect.
**Why it happens:** Event tables never store rows — `SELECT * FROM pvp_hit` is always empty.
**How to avoid:** Verify structurally (`spacetime describe 2d-impact-game-fr9ti table pvp_hit --json` shows the 4 columns post-publish) and behaviorally (two-client playtest sees attacker/isCrit-driven rendering). The publish succeeding on the MIGRATED local DB is itself the migrate-acceptance test for D3-01's open question.
**Warning signs:** Publish rejection mentioning the `pvp_hit` schema — see Open Question 1 fallbacks.

### Pitfall 7: local display number can lie on a server-rejected hit (pre-existing — do not fix silently)
**What goes wrong:** Attacker floats a local number but the server rejected the hit (range edge, target entered safe zone mid-flight) — no HP moved, no event.
**Why it happens:** `applyPvpDamage` draws before the reducer resolves (D3-05 keeps this by design); `attackPlayer` THROWS `SenderError` on its guards (unlike `attackEnemies` which returns silently), rolling back the transaction.
**How to avoid:** Nothing to change this phase — D3-05 locks the instant local number, and the guards predate this phase. Surface in VERIFICATION notes so a playtest observer doesn't misread it as a Phase-3 regression.
**Warning signs:** Occasional attacker-only numbers with no victim HP change at extreme range.

## Range Envelope Finding (CONTEXT discretion item — surfaced, no conflict)

- Client melee+ranged PVP application gate: `playerPosition.distanceTo(remotePosition) > PVP_MAX_HIT_RANGE` → skip (createGame.ts:429), `PVP_MAX_HIT_RANGE = 45` (createGame.ts:206, comment says it mirrors server). This is a **3D** distance.
- Server guard: `distanceBetweenPlayers(attacker, target) > MAX_HIT_RANGE` → `SenderError` (index.ts:1111), `MAX_HIT_RANGE = 45` (index.ts:206). This is **2D XZ** (`Math.hypot(dx, dz)`, index.ts:963).
- Bow projectile travel is `min(45, 2.5s × speed 24 = 60) = 45` (createGame.ts:515–516), so the projectile's PVP reach is already capped at the same 45.

**Verdict:** the client envelope (3D, 45) is a strict subset of the server envelope (2D, 45) at any given instant — legitimate long-range bow PVP is NOT systematically rejected. Residual mismatch is temporal only: the attacker can move away during projectile flight so the server-time distance exceeds 45 → rejected hit (Pitfall 7). Pre-existing; leave both constants and both checks untouched.

## Victim crit variant (CONTEXT discretion item — recommendation)

Add `pvpCrit: { cssColor: '#c07dff', fontScale: 1.7 }` to `DAMAGE_KIND_STYLES`, mirroring the existing `taken`/`takenCrit` precedent (damageKind.ts:25–26). Purple is the established "a player hit you" semantic — reusing magenta `'crit'` for the victim would blur attacker-crit vs being-crit. `drawNumber` already appends `!` for kinds ending in crit — extend its `kind === 'crit' || kind === 'takenCrit'` label check to include `'pvpCrit'` (createDamageNumbers.ts:53–58). Remember Pitfall 2's netting check. (Attacker + spectator use the standard `'crit'` magenta — D3-05's "big red crit number" is the existing `#ff2bd6` style, per Phase-2's user-chosen restyle.)

## isCrit beyond the event? (CONTEXT discretion item — verified against POISE-01..03)

POISE-01..03 (REQUIREMENTS.md) accrue crit damage into a **unit's windup** (`unit_attack.poise`) — units are goliaths (Phase 4+), not players. There is no requirement for PVP crit persistence; players have no windup/poise state this milestone. **Event-only is correct** — record nothing server-side beyond the `pvp_hit` row. `[VERIFIED: .planning/REQUIREMENTS.md POISE section]`

## Code Examples

### Reworked `attackPlayer` (server) — the full delta
```typescript
// Source: spacetimedb/src/index.ts:1092-1163 (current) + :1899 attackEnemies (Phase-2 analog)
export const attackPlayer = spacetimedb.reducer(
  { targetIdentity: t.identity(), isSkill: t.bool(), comboCount: t.u32() },   // D3-04
  (ctx, { targetIdentity, isSkill, comboCount }) => {
    const attacker = requirePlayer(ctx);
    const target = ctx.db.player.identity.find(targetIdentity);
    if (!target) throw new SenderError('Target not found');
    // … ALL existing guards 1098–1113 unchanged (self, party, safe zones, MAX_HIT_RANGE) …

    const combo = Math.min(comboCount, MAX_COMBO_FOR_GEMS);                    // D2-04
    const { amount, isCrit } = resolvePlayerHit(ctx, attacker, isSkill, combo, 'melee'); // D3-03/D3-04
    // D3-02: broadcast FULL computed amount, pre-branch (kills float full strength)
    ctx.db.pvpHit.insert({ target: targetIdentity, attacker: attacker.identity, amount, isCrit });

    const dealt = Math.min(amount, target.currentHealth);
    const remainingHealth = target.currentHealth - dealt;
    if (remainingHealth > 0) {
      setActiveHealth(ctx, target, remainingHealth);
      return;
    }
    // … kill path 1124–1162 byte-for-byte: spillGems → applyDeathShardPenalty →
    //   killer credit (the [A1] shard-conservation comment block) → respawnPlayerAtSpawn …
  }
);
```
Deleted: `damage: t.u32()` arg, `const clampedDamage = Math.min(damage, MAX_HIT_DAMAGE)` (clamp now inside `resolvePlayerHit`).

### Client intent send — thread `isSkill` through `applyPvpDamage`
```typescript
// Source: src/game/createGame.ts:372-440 (current dealDamage/applyPvpDamage)
function dealDamage(center, radius, damage, kind, isSkill) {
  network.sendAttackEnemies(center.x, center.z, radius, isSkill, combo);
  const hitEntity = anyEntityWithinRadius(center, radius);
  const hitPlayer = applyPvpDamage(center, radius, damage, kind, isSkill);   // + isSkill
  return hitEntity || hitPlayer;
}
// applyRangedProjectileHit → applyPvpDamage(center, radius, damage, kind, false)  // bow = basic
function applyPvpDamage(center, radius, damage, kind, isSkill) {
  // … all existing gates (safe zone, party, PVP_HIT_COOLDOWN_SECONDS, PVP_MAX_HIT_RANGE,
  //     VERTICAL_HIT_GATE, radius) unchanged …
  remotePlayer.lastPvpHitAt = elapsedSeconds;
  hitSomeone = true;
  network.sendAttackPlayer(remotePlayer.row, isSkill, combo);                // intent, no damage
  effectSystem.spawnBurst(remotePosition.clone().setY(1.2), 0xff4a4a, 14);
  damageNumbers.spawn(remotePosition.clone().setY(remotePosition.y + 1), damage, kind); // D3-05 local display, KEEP
}
```
`Network.sendAttackPlayer(target: Player, isSkill: boolean, comboCount: number)` (interface at createGame.ts:74); App.tsx binding (App.tsx:629–630) becomes `connection.reducers.attackPlayer({ targetIdentity: target.identity, isSkill, comboCount })`. `combo` is already in closure scope; the local `damage` param stays as the display-only number (computed at createGame.ts:501–504 / skill multiplier at 572–574).

### New game-handle method for identity-anchored numbers
```typescript
// Source: mirror of flashRemoteHealth (createGame.ts:1068-1071) + spawnWorldNumber (1065-1067)
spawnPlayerNumber(identityHex, amount, kind) {
  const view = remotePlayers.get(identityHex);
  if (!view) return;                                  // victim view gone (despawned) — drop silently
  const p = view.model.group.position;
  damageNumbers.spawn(p.clone().setY(p.y + 1), amount, kind);
},
```

## State of the Art

| Old Approach (current `attackPlayer`) | Current Approach (this phase) | When Changed | Impact |
|--------------------------------------|-------------------------------|--------------|--------|
| Client sends `damage: t.u32()`; server clamps + applies | Client sends intent; server composes via `resolvePlayerHit` | Phase 2 established on enemies (CRIT-06); Phase 3 extends (CRIT-07) | Per-hit PVP damage + crit un-spoofable; shard-theft cheat incentive closed |
| `pvp_hit { target, amount(dealt) }` | `pvp_hit { target, amount(full), attacker, isCrit }` | D3-01/D3-02 | Truthful shared crit spectacle; attacker self-suppression now possible |
| PVP crit: nonexistent (no crit ever applied to PVP hits — client `rollDamage` was deleted in Phase 2, PVP kept raw base) | Server `ctx.random` roll per PVP hit from per-character `critRate`/`critDmg` | This phase | Distinct per-character crit visible in PVP (SC of phase) |

**Deprecated/outdated (delete in-slice, no-legacy rule):** the `damage` reducer arg + its client plumbing (`sendAttackPlayer` damage param, `Math.round(damage)` at the call site), the manual `Math.min(damage, MAX_HIT_DAMAGE)` in `attackPlayer`, and the `tables.pvpHit` entry in the manual subscribe list.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Automatic migration's "added columns must have defaults, appended at end" applies identically to `event: true` tables (docs state the rule unconditionally; no event-table exemption documented) | Pattern 2 / Open Q1 | Publish rejection on the migrated local DB — fallbacks enumerated in Open Q1; caught at the first deploy step, zero blast radius |
| A2 | `Identity.zero()` is accepted by the publish-side schema as a column default value (SDK typings allow it; runtime acceptance unverified until publish) | Standard Stack | Same failure mode + same catch point as A1 |
| A3 | The current double-delivery of `pvp_hit` (two subscriptions) produces two victim numbers today that simply went unnoticed | Pitfall 1 | None — the fix (single subscription) is correct under either reading |

All other claims are `[VERIFIED: codebase]` (read directly this session) or `[CITED]` to official docs.

## Open Questions (RESOLVED)

1. **RESOLVED: acceptance-tested at first publish — Plan 03-02 Task 1 encodes the publish gate + this fallback ladder.** **Does migrate-publish accept the extended `pvp_hit` on the live local DB?** (D3-01's explicit "verify on publish")
   - What we know: docs require append-at-end + `.default()` for added columns `[CITED: spacetimedb.com/docs/databases/automatic-migrations/]`; both new columns can satisfy that; event tables hold zero rows so there is nothing to backfill.
   - What's unclear: whether the schema differ special-cases event tables at all (undocumented).
   - Recommendation: make the local publish the FIRST executed step of the implementation's deploy sequence (it is anyway). If rejected: (a) retry without `.default()` (in case event tables skip the default requirement), (b) empty-table drop+recreate — the project has removed an empty table before (`enemy_carry` precedent, CLAUDE.md), so publishing with `pvp_hit` renamed/replaced is a viable escape hatch since event tables never hold rows and are not in the backup set. Confirm post-publish with `spacetime describe 2d-impact-game-fr9ti table pvp_hit --json`.

2. **RESOLVED: playtest feel-check 5 in Plan 03-02 Task 2.** **Does `performSkill`'s effect pipeline pass a `kind` that keeps the attacker's local skill-hit number sensible?** Skill appliers pass `SKILL_DAMAGE_KIND` (`'skill'`, createEffectSystem.ts:289/332) into `applyPvpDamage`'s `kind` — unchanged behavior, but the playtest should confirm the attacker's local skill number + event-driven crit upgrade read well together (feel check, not correctness).

3. **RESOLVED: pre-existing, flagged not fixed — Plan 03-02 prohibition + playtest check 9.** **Doubled remote skill/projectile VFX during playtest** (skillCast/rangedAttack are also double-subscribed): pre-existing, out of scope — verify observers don't log it as a Phase-3 regression; consider capturing a cleanup todo.

## Project Constraints (from CLAUDE.md)

- Reducers: transactional, deterministic, no return data — clients read via subscriptions; `ctx.sender` is the only trusted identity (never `targetIdentity`-as-sender).
- Event tables: `{ public: true, event: true }`, rows never stored, `onInsert` only.
- **pnpm only** (`pnpm add` — npm crashes on the symlink layout). Zero new deps this milestone anyway.
- **Module path is `./spacetimedb`** — the `spacetime:publish*` npm scripts point at `server/` and FAIL; always publish with explicit `--module-path spacetimedb`.
- Additive schema only; **never `--delete-data`** on a DB with real accounts; maincloud publish deferred to prod point (STATE invariant).
- After schema/reducer changes: publish → `pnpm run spacetime:generate` → `pnpm build` (order fixed).
- ≤300 LOC functional per file; `index.ts` is the known monolith — this phase adds only table-column + reducer-body changes there (per trilogy decision), no new growth.
- No legacy/dead code: the `damage` arg and all its plumbing are deleted in the same slice.
- Grep-gate: no `Math.random`/`Date.now` in `spacetimedb/src` (`ctx.random` sole exception — already satisfied via `resolvePlayerHit`).
- No project skills directory exists (`.claude/skills/` absent — verified).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `spacetime` CLI | publish/generate/describe/logs | ✓ | current channel, commit 052c83f | — |
| Local server config (`local` @ 127.0.0.1:3000) | migrated-DB publish + playtest | ✓ (configured; `spacetimedb-standalone` must be RUNNING at execution — start if not) | — | `spacetime start` |
| `maincloud` server config | deferred prod publish (NOT this phase) | ✓ (configured, default) | — | — |
| pnpm | build/test | ✓ | 11.9.0 | — |
| Node | scripts/build | ✓ | v24.15.0 | — |
| `spacetimedb` npm pkg | SDK | ✓ | 2.6.1 | — |
| vitest | test suite | ✓ | 3.2.4 | — |
| Two browser clients on LAN | SC3 playtest (human) | assumed (established Phase-2 workflow: host + LAN device via laragon `dist/`) | — | two browser windows on host (weaker latency signal) |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none blocking; only the runtime state of `spacetimedb-standalone` needs checking at execution (`spacetime server ping local`).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.2.4 |
| Config file | `vitest.config.ts` (repo root) |
| Quick run command | `pnpm vitest run src/game/data/__tests__/serverSync.test.ts` |
| Full suite command | `pnpm test` (= `vitest run`; ~475+ tests, all green at phase start) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CRIT-07 | Server composes PVP damage/crit (base→crit→clamp order, skill window, combo clamp) | unit (pure parts, already covered) | `pnpm vitest run src/game/data/__tests__/crit.test.ts src/game/data/__tests__/damage.test.ts src/game/data/__tests__/skillGate.test.ts` | ✅ (Phase 1/2 suites — `resolvePlayerHit`'s pure inputs) |
| CRIT-07 | INV-5 mirror parity stays green (no new mirrored constants expected) | unit | `pnpm vitest run src/game/data/__tests__/serverSync.test.ts` | ✅ |
| CRIT-07 | Kill path conserves shards on a PVP killing blow | unit (pure helper) | `pnpm vitest run src/game/data/__tests__/deathPenalty.test.ts` | ✅ (unchanged logic — regression gate) |
| CRIT-07 | Module compiles with new signature/columns | build | `cd spacetimedb && spacetime build` (NO `--project-path` — CLI rejects it) | ✅ (command, not file) |
| CRIT-07 SC2/SC3 | Event-driven PVP numbers (victim purple, attacker crit upgrade, spectator), no double-draw, shard theft on kill | **manual-only** (two-client migrated-DB playtest) | — (Phase-2 learning: 3 real bugs shipped past 475 green tests; server-authoritative UX is gated on human playtest) | ❌ human checkpoint |

### Sampling Rate
- **Per task commit:** `pnpm vitest run src/game/data/__tests__/serverSync.test.ts` + `cd spacetimedb && spacetime build`
- **Per wave merge:** `pnpm test` + `pnpm build` (tsc catches client-side signature drift)
- **Phase gate:** full suite green + local publish/generate/build + two-client playtest before `/gsd-verify-work`

### Wave 0 Gaps
None — existing test infrastructure covers all automatable phase surfaces. No new pure helpers are expected (`resolvePlayerHit` already encapsulates the roll; the reducer delta is glue). If the planner does extract any new glue helper, it follows the zero-import test-first sibling discipline (crit.ts/skillGate.ts genre) — but the default plan should need zero new test files, with the human two-client playtest as the phase's real UAT (budget it like Phase 2's checkpoint plan: playtest fix iterations are expected, not overrun).

## Security Domain

This phase IS a security fix: it closes the last client-authored damage value in the game (PVP), the live cheat incentive on the shard-theft loop.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (existing account system untouched) | — |
| V3 Session Management | no | — |
| V4 Access Control | yes | `ctx.sender` via `requirePlayer` is the sole attacker identity; guards (self/party/safe-zone/range) all server-side — unchanged, keep |
| V5 Input Validation | yes | Intent args only: `comboCount` clamped to `MAX_COMBO_FOR_GEMS`; `isSkill` gated by the server cast window; `targetIdentity` existence-checked; no numeric damage input remains |
| V6 Cryptography | no | — |

### Known Threat Patterns for this change (STRIDE)

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client inflates PVP `damage` / fakes crit | Tampering | **Closed this phase**: server computes amount + rolls `ctx.random` crit; `MAX_HIT_DAMAGE` clamp retained as defense-in-depth inside `resolvePlayerHit` |
| `isSkill: true` spam for skill-tier damage | Tampering | `skillGrantActive` window (D2-03) — carried automatically; out-of-window skill claims downgrade to basic |
| Unbounded `comboCount` | Tampering | D2-04 clamp (100) before the uncapped skill multiplier |
| `attackPlayer` call spam (DPS inflation) | Tampering (rate) | ACCEPTED RESIDUAL per D3-06 (locked) — client cooldown only; deferred server rate-limit recorded |
| Spoofed attacker identity in the event | Spoofing | `attacker: attacker.identity` comes from `ctx.sender`-derived row, never an argument |
| Reading others' hits | Info disclosure | `pvp_hit` is public by design (D2-02 full shared visibility — user choice) |

## Sources

### Primary (HIGH confidence)
- Codebase, read directly this session: `spacetimedb/src/index.ts` (pvpHit :542, attackPlayer :1092–1164, distanceBetweenPlayers :963, resolvePlayerHit :1862–1893, attackEnemies :1899, constants :158/:206/:214/:218), `src/game/createGame.ts` (:74, :205–206, :372–440, :485–583, :1027–1071), `src/App.tsx` (:112–136, :162–243, :629–637), `src/game/systems/createDamageNumbers.ts`, `src/game/combat/damageKind.ts`, `node_modules/spacetimedb` 2.6.1 typings (`type_builders.d.ts`, `identity.d.ts`), `package.json`, `.planning/config.json`
- Phase artifacts: `03-CONTEXT.md`, `02-CONTEXT.md`, `02-LEARNINGS.md`, `02-PATTERNS.md`, `REQUIREMENTS.md`, `STATE.md`
- CLI probes: `spacetime --version`, `spacetime server list`, `pnpm --version`

### Secondary (MEDIUM confidence)
- [SpacetimeDB — Automatic Migrations](https://spacetimedb.com/docs/databases/automatic-migrations/) — added columns: end-of-table + default required; removals forbidden (project experience shows empty-table removal works in practice)
- [SpacetimeDB — Default Values](https://spacetimedb.com/docs/tables/default-values/) — defaults enable additive column migration

### Tertiary (LOW confidence)
- None used.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new deps; all versions read from lockfile/node_modules
- Architecture: HIGH — every file/line verified this session; the phase is composition over Phase-2 assets with exact in-repo analogs
- Pitfalls: HIGH — 5 of 7 are direct Phase-2 learnings re-instantiated on the PVP path; the migrate-acceptance pitfall is MEDIUM (docs-backed, empirically confirmed at first deploy step)

**Research date:** 2026-07-09
**Valid until:** 2026-08-08 (stable stack; re-verify only if `spacetimedb` SDK or CLI is upgraded)
