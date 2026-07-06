# Decisions

Synthesized decisions extracted from ingested planning docs. LOCKED decisions cannot
be auto-overridden downstream.

Provenance note: the source is classified as a PRD (`locked: false` at the doc level),
but the document carries an explicit "Locked decisions", "Design invariants (do not
violate)", and "Naming conventions (use verbatim — this is the consistency contract)"
section. Per ingest direction these in-doc locked commitments are preserved here as
LOCKED decisions so downstream planning cannot silently reverse them.

---

## DEC-naming-unification — Two-tier economy naming (gems / shards)

- source: docs/TRANSCENDENCE_PLAN.md
- status: LOCKED
- scope: currency naming contract
- decision: Rename every `primogem` → `gem`. Establish a two-tier economy:
  `gems` = common/trivial currency (gacha fuel); `shards` (constellation shards) = rare
  transcendence currency. Code root is `shard`/`Shard`/`SHARD` everywhere — never
  "fragment"/"crystal". User-facing nouns are "Gems" (common) and "Constellation Shards"
  (rare). Shards are NOT vacuumable by camps (no `carriedShards` field).
- binding identifiers (verbatim contract): `gems` (u32 player column), `gem_drop` /
  accessor `gemDrop`, `STARTING_GEMS`, `KILL_REWARD_GEMS`, `spillGems`; `transcendShards`
  (u32 player column), `shard_drop` / accessor `shardDrop`, `spillShards`,
  `ownedCharacter.transcendLevel` (u32), client mirror `src/game/data/shardDrops.ts`.

## DEC-wipe-not-migrate — Destructive rename accepted as full wipe

- source: docs/TRANSCENDENCE_PLAN.md
- status: LOCKED
- scope: schema migration strategy for the primogems→gems rename (Phase A only)
- decision: The `primogems`→`gems` column rename is a destructive schema op. Accept a
  full data wipe on BOTH local and maincloud via `--delete-data always`. No migration
  reducer. Done once in Phase A before real players matter. (All OTHER phases are additive
  schema — migrate-publish, never `--delete-data`.)

## DEC-pve-death-shard-ground-collectible — PVE death shard spills to ground

- source: docs/TRANSCENDENCE_PLAN.md
- status: LOCKED
- scope: death penalty / shard drop mechanics
- decision: On PVE death the dropped shard spills as a ground pickup (reuse the gem-drop
  spill + the 1.2s pickup grace so a nearby camp cannot instantly vacuum it). Anyone can
  grab it — including the dying player on recovery. PVP death instead transfers the shard
  directly to the killer (theft).

## DEC-branch-feat-transcendence — All work lands on feat/transcendence

- source: docs/TRANSCENDENCE_PLAN.md
- status: LOCKED
- scope: version control workflow
- decision: All transcendence work lands on `feat/transcendence`, cut from `master`
  (the real trunk that holds the game; `main` is a stale Initial-commit branch).

---

## Design invariants (LOCKED — do not violate)

Source: docs/TRANSCENDENCE_PLAN.md, "Design invariants (do not violate)".

## INV-1 — Protected constellation floor

- status: LOCKED
- Installed base constellation C0–C6 is the protected floor in normal PVE. Only the
  transcendence layer (and, as last-resort erosion, one C-level) is ever lost.

## INV-2 — Shards must be scarce

- status: LOCKED
- Shards come ONLY from: dupes of an already-C6 character, PVP theft, and raid-boss
  payout. Never a cheap/infinite faucet.

## INV-3 — Shards must buy real power (transcendence)

- status: LOCKED
- If shards were pure insurance the loop is hollow. Power is what makes theft worth a
  fight.

## INV-4 — A ganked non-payer must be able to recover

- status: LOCKED
- Recovery via the raid faucet is required, or the loop becomes a churn machine.

## INV-5 — Keep client/server number mirrors in sync

- status: LOCKED
- `serverSync.test.ts` guards this; every data change touches both sides + the test.
