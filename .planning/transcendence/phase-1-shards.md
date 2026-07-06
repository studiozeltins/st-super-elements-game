# Phase 1 — Constellation Shard currency + mint on overflow dupe

> Part of Transcendence. Contracts + tracker: [PROGRESS.md](./PROGRESS.md) · Full plan:
> [../../docs/TRANSCENDENCE_PLAN.md](../../docs/TRANSCENDENCE_PLAN.md)

**Status:** ⬜ TODO · **Depends on:** Phase 0

Read the **Shared contracts** in PROGRESS.md before starting.

## Goal
Introduce the scarce transcendence currency and its only new faucet: dupes of an
already-C6 character mint a shard instead of the old 800-gem refund.

## Server (`spacetimedb/src/index.ts`)
- Add `transcendShards: t.u32()` to the `player` table (default 0). Additive column →
  plain migrate publish (NO `-c`), no data wipe.
- In `grantCharacter` (~1545-1561): when a dupe would exceed C6, instead of the gem refund
  path (currently `DUPLICATE_REFUND` at ~1628/1644/1677), do
  `transcendShards += SHARD_PER_OVERFLOW_DUPE`. Remove the refund gem credit; keep the
  `DUPLICATE_REFUND` const only if still referenced (else delete).
- Extract the overflow decision into a pure helper (e.g. `applyDupe(owned, shards)` →
  `{ constellation, shards }`) so it unit-tests without a DB.

## Client
- Regenerate bindings: `pnpm run spacetime:generate` (player type gains `transcendShards`).
- Show shard balance: a small "Shards: N" readout in `CharacterScreen.tsx` and/or the
  gacha result in `GachaScreen.tsx`. Reuse existing wallet styling.

## Tests
- Unit on the pure helper: dupe of a C6 char → shards +1, constellation unchanged, gems
  unchanged; dupe of a non-C6 char → constellation +1, no shard.
- Existing gacha/pity tests stay green.

## Validation
1. `spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb --server local -y`
   (migrate, no wipe — additive column).
2. `pnpm run spacetime:generate` → `pnpm build`.
3. Playtest (webapp-testing): pull dupes of an already-C6 character → shard count rises,
   no gem refund.

## Commit
`feat(transcend): mint constellation shards from C6 overflow dupes`

## Definition of done
- [ ] `player.transcendShards` column live; dupes mint shards
- [ ] shard balance visible in UI
- [ ] unit + existing tests green; build green
- [ ] published local; playtested
- [ ] committed; PROGRESS.md updated
