---
phase: 03-pvp-crit
reviewed: 2026-07-09T07:01:40Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - spacetimedb/src/index.ts
  - src/module_bindings/attack_player_reducer.ts
  - src/module_bindings/pvp_hit_table.ts
  - src/module_bindings/types.ts
  - src/game/createGame.ts
  - src/game/combat/damageKind.ts
  - src/game/systems/createDamageNumbers.ts
  - src/App.tsx
findings:
  critical: 0
  warning: 2
  info: 1
  total: 3
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-07-09T07:01:40Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Reviewed the Phase-3 diff (`54ee14a..HEAD`, commits 67bbfaa / db31ddf / 4d48373): server-authoritative `attackPlayer` (intent args, `resolvePlayerHit`, `ctx.random` crit), the additively extended `pvp_hit` event table, regenerated bindings, and the 3-role client rendering rework.

**The core authority change is correct.** Traced end-to-end:

- `attackPlayer` drops the client `damage` arg; `resolvePlayerHit` composes `computeBaseDamage` → `rollCrit(ctx.random)` → (inert resist, D3-03) → `MAX_HIT_DAMAGE` clamp. The D2-03 skill window (`skillGrantActive` off `skillWindowEndsAtMicros`) and D2-04 combo clamp (`MAX_COMBO_FOR_GEMS`) carry automatically — a modified client can no longer inflate per-hit PVP damage or fake a crit.
- The kill path (gem spill, shard-theft `applyDeathShardPenalty`, killer credit, respawn) is untouched logic; only the damage input changed source (SC3 holds).
- `pvp_hit` extension is additive with `.default(Identity.zero())` / `.default(false)` — `Identity.zero()` verified present in the installed SDK (`node_modules/spacetimedb/src/lib/identity.ts:76`).
- All three generated bindings match the schema exactly (`targetIdentity/isSkill/comboCount`; `attacker` + `is_crit` on the row type); every `sendAttackPlayer` call site was migrated in the same slice; no stragglers found by grep.
- Determinism grep-gate clean: no `Math.random`/`Date.now` in `spacetimedb/src`.
- `CHARACTER_COMBAT` covers all 17 `CHARACTER_STATS` ids, so `resolvePlayerHit`'s `amount: 0` fallback is unreachable for a legal `activeCharacterId`.
- Victim overkill accounting is safe: `pvpDamageSinceSync` absorbs the full D3-02 amount; a killing blow produces an HP up-jump (`wasRespawned`) which skips the taken-number branch and resets the accumulator (`createGame.ts:1037-1056`).
- Locked decisions D3-01..D3-06 respected and not re-litigated here (no PVP resistances, no server rate-limit, client combo clamp trust, full-amount broadcast).

Two warnings remain, both in the client event-consumption layer the phase reworked — one an inconsistency with the phase's own newly documented subscription invariant, one a data-coupling defect in the hit-rate gate that PVP broadcasts now exercise on every hit.

## Warnings

### WR-01: Sibling event tables still double-subscribed — the exact defect this phase fixed for `pvp_hit`

**File:** `src/App.tsx:118-123` (manual subscription list) vs `src/App.tsx:161` (`skillCast` useTable), `src/App.tsx:169` (`rangedAttack` useTable), `src/App.tsx:248` (`healEvent` useTable)
**Issue:** This phase removed `tables.pvpHit` from the manual subscription list because — per the new comment at App.tsx:200-202 and the Phase-2 comment at App.tsx:233-236 — `useTable` opens its own subscription and an overlapping manual subscription delivers each event row twice, firing `onInsert` twice ("double delivery = double numbers"; `pullResult` carries an explicit slot-dedup workaround for the same reason, App.tsx:180-182). But three sibling event tables are left in exactly that double-subscribed state: `skill_cast` (list line 118 + useTable line 161 → remote skill effect spawned twice), `ranged_attack` (line 122 + line 169 → each remote shot renders two projectiles), and `heal_event` (line 123 + line 248 → every heal floats two green numbers). Pre-existing, but the file now documents the invariant in two places while violating it three lines above.
**Fix:** Remove `tables.skillCast`, `tables.rangedAttack`, and `tables.healEvent` from the manual `.subscribe([...])` list (their `useTable` hooks are the sole consumers), mirroring the `pvp_hit` fix:
```tsx
.subscribe([
  tables.accountLink.where(row => row.identity.eq(identity)),
  tables.player,
  tables.ownedCharacter,
  tables.characterActivation,
  // skillCast / rangedAttack / healEvent removed — event tables, useTable subscribes
  tables.bannerPity,
  tables.weaponItem,
  tables.pullResult, // kept only if the slot-dedup is retired with it
  ...
])
```
Verify `pullResult` the same way and retire its slot-dedup workaround if the second subscription was its only duplicate source.

### WR-02: `lastPvpHitAt` conflates health-bar display with the client hit-rate gate — rival attackers' `pvp_hit` broadcasts suppress your own hits

**File:** `src/game/createGame.ts:436` (rate gate), `src/game/createGame.ts:1078-1081` (`flashRemoteHealth` stamps the same field), `src/App.tsx:215` (called for every non-self `pvp_hit`)
**Issue:** `applyPvpDamage` refuses to hit a remote player until `elapsedSeconds >= lastPvpHitAt + PVP_HIT_COOLDOWN_SECONDS` (0.3s). But `flashRemoteHealth` — whose job is only to show the victim's health bar — writes that same `lastPvpHitAt` field, and the reworked `pvp_hit` handler calls it for **every** hit on every non-self target (App.tsx:215), including hits landed by *other* attackers and the network echo of your own hit. Consequences: (a) in a multi-attacker fight, a rival landing ~2 hits/sec on the shared victim re-arms a 0.3s lockout on your client each time, silently swallowing a large fraction of your contact swings on that victim — damage you visibly swing for never gets sent; (b) your own hit's echo re-stamps the field ~RTT later, stretching your effective per-target cooldown beyond 0.3s. The coupling predates this phase, but the phase's handler rework is what now routes every broadcast hit through it, so the reviewed code path owns the defect.
**Fix:** Split the two concerns on the remote-player view:
```ts
// remotePlayer view state
lastPvpHitShownAt: number; // drives the health-bar flash
lastPvpSentAt: number;     // drives the local send-rate gate

// createGame.ts:436
if (elapsedSeconds < remotePlayer.lastPvpSentAt + PVP_HIT_COOLDOWN_SECONDS) continue;
// createGame.ts:441
remotePlayer.lastPvpSentAt = elapsedSeconds;
remotePlayer.lastPvpHitShownAt = elapsedSeconds;

// flashRemoteHealth — display only:
flashRemoteHealth(identityHex) {
  const view = remotePlayers.get(identityHex);
  if (view) view.lastPvpHitShownAt = elapsedSeconds;
},
```
(and point the health-bar visibility check at `lastPvpHitShownAt`).

## Info

### IN-01: Attacker sees two conflicting numbers for one hit on a PVP crit

**File:** `src/game/createGame.ts:445-447` (instant local echo), `src/App.tsx:216-220` (crit upgrade)
**Issue:** D3-05's "upgrade" is implemented additively: the attacker's instant local echo (non-crit base amount, e.g. `66`) is drawn in `applyPvpDamage`, and when the server rolls a crit, `spawnPlayerNumber` draws the authoritative crit number (e.g. `126!`) ~RTT later while the local echo (0.95s lifetime) is still rising — two different values float over the same victim for the same hit. The local echo can also drift from the server truth on non-crit ranged hits (projectile `damage` is computed with combo-at-launch, the reducer with combo-at-hit), and since the attacker's server non-crit echo is suppressed, that slightly-off local number is the one the attacker keeps. Both are consequences of the locked D3-05 prediction pattern, so this is informational — but the double-number-on-crit is the visible artifact worth watching in UAT.
**Fix:** If the artifact bothers playtest: have `spawnPlayerNumber` (crit path) first expire the attacker's most recent local PVP echo for that victim (e.g. track the `FloatingNumber` handle per victim and set `active = false` before spawning the crit), turning the additive draw into a true replace.

---

_Reviewed: 2026-07-09T07:01:40Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
