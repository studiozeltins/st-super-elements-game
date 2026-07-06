# Constraints

Technical constraints, naming/schema contracts, and tunable numbers extracted from the
ingested PRD. These bind implementation across every phase.

---

## CON-naming-contract — Verbatim identifier contract (schema)

- source: docs/TRANSCENDENCE_PLAN.md ("Naming conventions — use verbatim")
- type: schema
- content:
  Common currency (renamed from primogem):
  - Wallet balance (player column): `gems` (u32)
  - Ground drop table: `gem_drop` / accessor `gemDrop`
  - Starting grant: `STARTING_GEMS`
  - Kill reward base: `KILL_REWARD_GEMS`
  - Spill helper: `spillGems`
  - Death spill fractions: `PVE_DEATH_SPILL`, `PVP_DEATH_SPILL` (unchanged)
  - Constants / mirrors: `GEM_*`, `gemsFromKills`, `gemsCollected`,
    `src/game/data/gem*.ts` (unchanged)

  Transcendence currency (new):
  - Shard balance (player column): `transcendShards` (u32)
  - Ground drop table (PVE death drop): `shard_drop` / accessor `shardDrop`
  - Spill helper: `spillShards`
  - Collectible check: reuse `gemIsCollectible` (already generic: droppedAt/now/delay)
  - Per-character transcend level: `ownedCharacter.transcendLevel` (u32)
  - Constants: `SHARD_*`, `TRANSCEND_*`
  - Client mirror: `src/game/data/shardDrops.ts`

  Code root `shard`/`Shard`/`SHARD` everywhere — never "fragment"/"crystal". Shards are
  NOT vacuumable by camps (no `carriedShards` field). User-facing nouns: "Gems" (common)
  and "Constellation Shards" (rare).

## CON-tunables — Tunable numbers (LOCKED in Phase 0)

- source: docs/TRANSCENDENCE_PLAN.md ("Tunable numbers")
- type: nfr
- note: Proposed values; Phase 0 agent finalizes and writes them into
  `spacetimedb/src/*.ts` + client `src/game/data/constants.ts`. Once locked in Phase 0
  they are referenced verbatim everywhere after.
- content:
  - `MAX_TRANSCEND_LEVEL` = 10 (levels available past C6)
  - `TRANSCEND_DAMAGE_STEP` = 0.05 (+5% dmg per transcend level; smaller than C's 8%)
  - `TRANSCEND_HEAL_STEP` = 0.08 (+8% heal per transcend level; healers)
  - `TRANSCEND_SHARD_COST(n)` = `n` (installing level n costs n shards → deep transcend
    expensive)
  - `SHARD_PER_OVERFLOW_DUPE` = 1 (shards minted per dupe of a C6 char; replaces 800
    refund)
  - `SHARD_DEATH_LOSS` = 1 (shards dropped on any death)
  - `RAID_SHARD_PAYOUT` = 6 (shards a raid boss drops, split among party)
  - erosion order = transcend-- then C-- (at 0 shards, active char loses transcend level
    first, then a constellation level)

## CON-additive-schema — Additive schema migration (all phases except A)

- source: docs/TRANSCENDENCE_PLAN.md ("Cross-cutting rules")
- type: protocol
- content: Schema changes are additive (new columns/tables) so migrate-publish keeps
  data. Never drop a table with rows without clearing it first. EXCEPTION: Phase A is a
  deliberate full wipe (`--delete-data always`) on both envs for the column rename.

## CON-deploy-procedure — Per-phase deploy procedure

- source: docs/TRANSCENDENCE_PLAN.md ("Cross-cutting rules")
- type: protocol
- content: Per phase:
  `spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb --server local --yes`
  → `pnpm run spacetime:generate` → `pnpm build`. Push to `maincloud` only at Phase 7 (or
  when a phase is user-facing on prod), never `--delete-data` on a DB with real accounts.

## CON-package-manager — pnpm only

- source: docs/TRANSCENDENCE_PLAN.md ("Cross-cutting rules")
- type: protocol
- content: Package manager is `pnpm`, never `npm`.

## CON-test-discipline — Pure-helper + serverSync test discipline

- source: docs/TRANSCENDENCE_PLAN.md ("Cross-cutting rules")
- type: nfr
- content: Pure math → dependency-free modules under `src/game/combat/` or
  `src/game/data/` (vitest). Reducer logic → extract pure helpers where possible so they
  unit-test without a running DB. Always keep `serverSync.test.ts` green. Every phase ends
  with a real Playwright playtest of the new slice, not just green tests.
