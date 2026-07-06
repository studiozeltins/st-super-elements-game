# Phase 3 — Shards at risk: death loss, PVP steal, erosion

> Part of Transcendence. Contracts + tracker: [PROGRESS.md](./PROGRESS.md) · Full plan:
> [../../docs/TRANSCENDENCE_PLAN.md](../../docs/TRANSCENDENCE_PLAN.md)

**Status:** ⬜ TODO · **Depends on:** Phase 2

Read the **Shared contracts** in PROGRESS.md. Honor invariant 1 (C0–C6 protected floor).

## Goal
Make shards the stake: death drops one, PVP kill steals it, and with no shards the active
character erodes (transcend level first, then a C-level as last resort).

## Server (`spacetimedb/src/index.ts`)
- Pure helper `applyDeathShardPenalty(player, activeOwnedChar)` →
  `{ shardsLost, erodedTranscend, erodedConstellation }`. Order:
  1. `transcendShards > 0` → `transcendShards -= SHARD_DEATH_LOSS`.
  2. else `activeChar.transcendLevel > 0` → `transcendLevel--`.
  3. else `activeChar.constellation > 0` → `constellation--` (floor erosion).
- Wire into death paths (keep existing 1/3-gem spill):
  - **PVE**: `takeDamage` (~1042) and worldTick player death (~2230-2248). The dropped
    shard spills as a **ground collectible** — new `shard_drop` table, reuse the gem-spill
    scatter + 1.2s pickup grace so a camp can't instantly vacuum it. Anyone can grab it
    (add a `collectShard` reducer mirroring `collectGem`).
  - **PVP**: `attackPlayer` (~933-944). Apply penalty AND credit the shard to the killer
    (`killer.transcendShards += 1`) — direct transfer, no ground drop.

## Client
- Regenerate bindings; render `shard_drop` pickups (reuse gem-drop renderer, distinct
  visual). Toast on shard lost / stolen; update shard counter.

## Tests
- Pure unit for `applyDeathShardPenalty` across all branches (has shards / only transcend
  / only constellation / nothing).
- Server logic: PVP kill transfers exactly 1 shard to killer; PVE death creates a
  `shard_drop`, not a killer credit; erosion order respected.

## Validation
- Publish local (additive: new table + reducer) → regenerate → build.
- Two-client playtest: PVP-kill a carrier → shard moves to killer; PVE-die with 0 shards →
  active char erodes transcend then a C-level; PVE shard drop is collectible after 1.2s.

## Commit
`feat(transcend): shards drop on death and transfer to PVP killer`

## Definition of done
- [ ] `applyDeathShardPenalty` wired into all death paths
- [ ] `shard_drop` table + `collectShard` reducer; PVE drop collectible
- [ ] PVP kill steals shard
- [ ] pure + server tests green; build green
- [ ] two-client playtest passes
- [ ] committed; PROGRESS.md updated
