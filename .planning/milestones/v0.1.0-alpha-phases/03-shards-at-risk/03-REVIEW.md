---
phase: 03-shards-at-risk
reviewed: 2026-07-07T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - spacetimedb/src/deathPenalty.ts
  - spacetimedb/src/index.ts
  - src/App.tsx
  - src/game/createGame.ts
  - src/index.css
  - src/ui/CharacterScreen.tsx
  - src/ui/GachaScreen.tsx
findings:
  critical: 0
  warning: 1
  info: 3
  total: 4
status: issues
---

# Phase 3: Code Review Report

**Reviewed:** 2026-07-07
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Reviewed the shards-at-risk phase: the pure `applyDeathShardPenalty` helper, the server-side
shard-drop economy (`shard_drop` table + `spillShards` + `collectShard`), the three wired death
paths, and the client feedback surface (renderer, toast, counter flash).

The security- and correctness-critical surface is genuinely well-guarded and the phase's stated
invariants hold in the shipped configuration:

- **A1 PVP credit is correct.** `attackPlayer` credits `attacker.transcendShards + result.shardsLost`
  (index.ts:1028), never a hardcoded 1, and the credit is gated on `stolen > 0 || result.shardsLost > 0`
  (index.ts:1024) so a 0-gem shard carrier still transfers its shard — the credit is *not* nested in
  the gem-only `if (stolen > 0)` block. A 0-shard victim yields `shardsLost === 0` and mints nothing (T-03-02).
- **u32 underflow safe.** All victim mutation flows through the helper's `next*`; the shards branch
  uses `Math.max(0, …)` and every decrement is inside a branch that proved the value `> 0` (T-03-01).
- **Erosion order + floor.** transcend-- then C-- only, each guarded by `> 0`, so C0 is never breached.
- **Determinism + auth.** `spillShards`/`collectShard` use only `ctx.random`/`ctx.timestamp`; `collectShard`
  resolves identity via `requirePlayer(ctx)` (→ `ctx.sender`), gates on the reused `gemIsCollectible`
  grace, and `shard_drop` is excluded from `vacuumGems` (T-03-03/T-03-04/T-03-05).

No Critical issues. One latent-conservation Warning (a mint risk that is currently masked only by the
`SHARD_DEATH_LOSS = 1` value) and three cosmetic Info items on the client-side toast heuristic.

## Warnings

### WR-01: `shardsLost` overstates the loss when `loss > transcendShards` — latent shard-mint

**File:** `spacetimedb/src/deathPenalty.ts:35` (and `nextShards` at :39)
**Issue:** In the has-shards branch the helper returns `shardsLost: loss` unconditionally, while the
victim only loses `transcendShards - Math.max(0, transcendShards - loss)`. These are equal *only when
`transcendShards >= loss`*. If `loss > transcendShards` (e.g. a victim holding 2 shards with a tuned
`loss` of 3), `nextShards` clamps to 0 (victim loses 2) but `shardsLost` reports 3 — so the PVE
`spillShards` drops 3 and the PVP killer is credited 3, minting a shard out of nothing and breaking the
A1 conservation invariant the whole phase is built around. This is currently harmless because
`SHARD_DEATH_LOSS = 1` (index.ts:84) and the branch already proved `transcendShards > 0` (i.e. `>= 1 = loss`),
so `shardsLost` always equals the real loss today. It is a silent trap: any future balance change that
raises `SHARD_DEATH_LOSS` above 1 (the summaries explicitly flag a Phase 7 balance pass) reintroduces a
mint with no failing test, since the existing specs only exercise `loss = 1`. The helper's own comment
says "spend **up to** `loss` shards", which the code does not honor.
**Fix:** Report the actually-removed amount, not the nominal `loss`:
```typescript
if (transcendShards > 0) {
  const nextShards = Math.max(0, transcendShards - loss);
  return {
    shardsLost: transcendShards - nextShards, // == min(loss, transcendShards)
    erodedTranscend: false,
    erodedConstellation: false,
    nextShards,
    nextTranscendLevel: transcendLevel,
    nextConstellation: constellation,
  };
}
```
Also add a `loss = 2, transcendShards = 1` case to `deathPenalty.test.ts` asserting `shardsLost === 1`.

## Info

### IN-01: PVE death mislabeled as "stolen" after a recent non-fatal PVP hit

**File:** `src/App.tsx:432-436` (context: pvpHit tracking at :171-178)
**Issue:** The loss toast picks "Zvaigžņu šķemba nozagta!" vs "…nokrita" purely from
`now - lastPvpHitOnMeAtRef.current < 2500ms`. `lastPvpHitOnMeAtRef` is set on *every* incoming
pvpHit including non-fatal ones (:178). If a player takes a non-fatal PVP hit and then dies to a PVE
enemy within 2.5 s, the shard drop is mislabeled "stolen" even though no one stole it. The comment at
:175-177 assumes a non-fatal hit "produces no shard diff, so no false toast fires" — but a *subsequent
PVE death* does produce the diff while the stale PVP timestamp is still fresh. Cosmetic only (the shard
genuinely moved; only the label is wrong).
**Fix:** Narrow the window (e.g. ~800 ms), or only stamp `lastPvpHitOnMeAtRef` on a hit whose `amount`
would be fatal, so a non-fatal poke does not arm the "stolen" branch.

### IN-02: Self-pickup can render as a kill-steal toast under high latency

**File:** `src/App.tsx:426-427`
**Issue:** A ground pickup is distinguished from a kill-steal by `now - lastShardPickupAtRef.current < 2500ms`,
where the timestamp is recorded at request time (:371). If the `transcendShards` up-diff round-trips
slower than 2.5 s, `wasPickup` is false and the player's own pickup shows the killer toast
"Nozagi zvaigžņu šķembu!". Cosmetic, rare, and self-correcting; noted for completeness.
**Fix:** Widen the window or clear/consume `lastShardPickupAtRef` when the matching up-diff arrives.

### IN-03: Inconsistent `droppedBy` for the worldTick shard vs gem spill

**File:** `spacetimedb/src/index.ts:2433` vs `:2444`
**Issue:** In the worldTick PVE death loop the gem spill uses `droppedBy = ctx.sender` (the scheduler
identity) while the shard spill uses `droppedBy = targetPlayer.identity`. The `takeDamage` path uses
the player's identity for both. `droppedBy` is never read for collection gating (grace uses
`droppedAtMicros`) and shards are not on the leaderboard, so this is dead-metadata inconsistency with
no behavioral effect — but it is a latent footgun if `droppedBy` ever becomes a self-collect guard.
**Fix:** Use `targetPlayer.identity` for the worldTick gem `droppedBy` too (or document why the
scheduler identity is intentional there).

---

_Reviewed: 2026-07-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
