---
phase: 03-shards-at-risk
plan: 02
subsystem: transcendence-economy
tags: [death-penalty, shard-drop, pvp-steal, economy-safety, reducer-wiring]
requires:
  - applyDeathShardPenalty
provides:
  - shard_drop
  - spillShards
  - collectShard
  - death-shard-penalty-wiring
affects:
  - spacetimedb/src/index.ts
tech-stack:
  added: []
  patterns:
    - "In-file mirror of the gem-drop machinery (gem_drop / spillDenominations / collectGem) for a single-piece scarce shard"
    - "A1 economy invariant: PVP killer credit folded into a single attacker update gated on (stolen>0 || shardsLost>0) so a 0-gem shard carrier still transfers its shard"
key-files:
  created: []
  modified:
    - spacetimedb/src/index.ts
decisions:
  - "shard_drop is a NEW public table mirroring gem_drop; droppedAtMicros t.u64().default(0n) keeps it additive and reuses gemIsCollectible for the pickup grace."
  - "spillShards inserts exactly ONE count-1 piece (no GEM_DENOMINATIONS shower), reusing GEM_SPILL_SCATTER + clampToWorld + ctx.random + ctx.timestamp stamp."
  - "PVP killer shard credit folded with the gem credit into one attacker update gated on (stolen>0 || result.shardsLost>0) — NOT nested in the gem-only 'if (stolen>0)' block — so a shard carrier with 0 gems still transfers the shard (A1 conservation)."
  - "Erosion order relies on the Plan 01 helper's next*; owned row updated (transcendLevel/constellation) BEFORE respawnPlayerAtSpawn so its fresh re-read preserves the eroded values."
  - "D3: no un-clamped activatedConstellation consumer exists server-side — no extra activation-row write needed (see D3 Finding)."
metrics:
  duration: ~6m
  completed: 2026-07-07
  tasks: 2
  files: 1
status: complete
---

# Phase 3 Plan 02: Shard-Drop Economy + Death-Path Wiring Summary

Added the server-authoritative shard-drop economy to `spacetimedb/src/index.ts` — a `shard_drop` table + `spillShards` helper + `collectShard` reducer, all faithful single-piece mirrors of the gem-drop machinery — and wired the Plan 01 `applyDeathShardPenalty` helper into all three death paths (PVE `takeDamage`, the PVE `worldTick` loop, and PVP `attackPlayer`) additively, keeping every existing gem spill. The highest-risk edit — the PVP killer shard credit — is deliberately decoupled from the gem-spill `if (stolen > 0)` guard so a shard carrier holding 0 gems still transfers its shard to the killer (the A1 conservation invariant).

## What Was Built

- **`shard_drop` table + `shardDrop` accessor** — public, columns identical to `gem_drop` (id u64 pk autoInc, positionX/Z f32, amount u32, droppedBy identity, `droppedAtMicros: t.u64().default(0n)`). Registered in the `schema({...})` object alongside `gemDrop`. The whole new table is an additive migration (publish with NO `--delete-data`).
- **`spillShards(ctx, positionX, positionZ, amount, droppedBy)`** — early-returns on `amount <= 0`, computes ONE deterministically scattered position (`GEM_SPILL_SCATTER` + `clampToWorld` + `ctx.random()`), inserts exactly one `shardDrop` row stamped `droppedAtMicros = ctx.timestamp.microsSinceUnixEpoch`. Never denominates.
- **`collectShard({ dropId })` reducer** — mirrors `collectGem`: `requirePlayer(ctx)`, `ctx.db.shardDrop.id.find(dropId)`, early-return if absent, gates on the REUSED `gemIsCollectible(drop.droppedAtMicros, now, GEM_PICKUP_DELAY_MICROS)` (no forked grace), deletes the drop, credits `transcendShards: currentPlayer.transcendShards + drop.amount`.
- **Three wired death paths** — each keeps its `spillGems` call and additively:
  - resolves `activeOwned = findOwnedRow(ctx, <player>, <player>.activeCharacterId)`,
  - calls `applyDeathShardPenalty(<player>.transcendShards, activeOwned?.transcendLevel ?? 0, activeOwned?.constellation ?? 0, SHARD_DEATH_LOSS)`,
  - writes the victim's `transcendShards: result.nextShards` into the respawn spread,
  - updates the owned row's `transcendLevel`/`constellation` from `result.next*` when eroded (BEFORE respawn, so respawnPlayerAtSpawn's fresh re-read preserves it).
  - **PVE (`takeDamage`, `worldTick`):** `spillShards` at the death spot only when `result.shardsLost > 0`; no killer credit.
  - **PVP (`attackPlayer`):** no ground drop; killer credited `attacker.transcendShards + result.shardsLost` in a single attacker update gated on `stolen > 0 || result.shardsLost > 0`.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | shard_drop table + spillShards + collectShard (gem-drop mirror) | d453820 | spacetimedb/src/index.ts |
| 2 | Wire applyDeathShardPenalty into the 3 death paths (keep gem spill) | 156d77e | spacetimedb/src/index.ts |

## Verification

- `npx tsc --noEmit -p spacetimedb/tsconfig.json` — green (server module typechecks).
- `pnpm build` (`tsc -b && vite build`) — green (client + module).
- `npx vitest run src/game/data/__tests__/deathPenalty.test.ts src/game/data/__tests__/serverSync.test.ts src/game/data/__tests__/serverWorldSim.test.ts` — 6 + 57 + 29 = all passed.
- Grep confirms: 3 `spillGems` call sites intact; PVP credit is `attacker.transcendShards + result.shardsLost`; no hardcoded `+1`/`+= 1` shard credit; `vacuumGems` still iterates `gemDrop` only; `fallToDeath` unchanged.

## D3 Finding (activatedConstellation consumers)

**No extra activation-row write was required.** The only server-side reads of `activatedConstellation` flow through `activatedConstellationFor` (index.ts ~1599), which clamps `Math.min(row.activatedConstellation, unlocked)` with `unlocked` = the CURRENT `owned.constellation`. Since a constellation erosion updates `owned.constellation` in place, every subsequent scaling read (e.g. `healParty` at ~1550 passing `healer.constellation`) is automatically clamped down to the eroded ceiling. There is no un-clamped consumer that reads a stale `activatedConstellation` above the eroded constellation, so the read-time clamp fully covers erosion and no `characterActivation` row write was added. (Client-side reads are out of scope for this in-file plan.)

## Deviations from Plan

**[Rule 2 - Missing null check] Defensive `activeOwned` guard in all three death paths.** `findOwnedRow` returns `Array.find(...)` which can be `undefined`. The plan's action assumed the active character is always owned (true in practice — the starter is granted at `register`), but reading `activeOwned.transcendLevel` on an undefined row would throw and abort the death reducer. To match the existing defensive `if (activeOwned)` idiom in `respawnPlayerAtSpawn`/`setActiveHealth`, the penalty call passes `activeOwned ? activeOwned.transcendLevel : 0` (and same for `constellation`), and the owned-row erosion update is additionally gated on `activeOwned && ...`. Shard loss (a player-row field) still applies even in the impossible missing-owned case; only erosion is skipped. No behavior change on the normal path.

## Self-Check: PASSED

- FOUND: spacetimedb/src/index.ts (shard_drop table, spillShards, collectShard, 3 wired paths)
- FOUND: commit d453820
- FOUND: commit 156d77e
