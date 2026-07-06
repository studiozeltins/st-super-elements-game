# Phase 6 — Raid boss (PVE shard faucet, party-gated)

> Part of Transcendence. Contracts + tracker: [PROGRESS.md](./PROGRESS.md) · Full plan:
> [../../docs/TRANSCENDENCE_PLAN.md](../../docs/TRANSCENDENCE_PLAN.md)

**Status:** ⬜ TODO · **Depends on:** Phase 2 (shards), Phase 5 (party)

Read the **Shared contracts** in PROGRESS.md. This is the recoverable faucet (invariant 4).

## Goal
A party-summoned boss no solo player can beat, dropping shards split among contributors.

## Server (`spacetimedb/src/index.ts`)
- Raid boss entity — simplest path: a dedicated size tier / variant reusing the goliath
  movement + combat passes in `worldTick`, or a `raid_boss` row rendered like a goliath.
  Tune HP + damage so solo is not viable within a timeout (e.g. HP ~120k, contact ~250/s —
  confirm against a fully-transcended solo in the sanity test).
- `summonRaid` reducer: callable by a party leader at an altar location (reuse safe-zone /
  altar coords); spawns one boss near the altar; despawn on kill or timeout.
- Payout on death: mint `RAID_SHARD_PAYOUT` shards split among party members who dealt
  damage (track contributors like the existing goliath damage tracking). Deterministic split.

## Client
- Render the raid boss (reuse goliath renderer/scale), HP bar, a summon button for the
  party leader, payout feedback.

## Tests
- Boss HP/damage tuning constants present.
- Payout splits `RAID_SHARD_PAYOUT` across N contributors deterministically.
- Sanity math: solo damage cannot kill within the timeout.

## Validation
- Publish local (additive) → regenerate → build.
- Party playtest: summon, kill together, each contributor receives shards. Confirm a solo
  player cannot solo it in the timeout.

## Commit
`feat(raid): party-summoned raid boss that drops constellation shards`

## Definition of done
- [ ] raid boss entity + `summonRaid`, party-gated, despawn logic
- [ ] shard payout split among contributors
- [ ] tests green (incl. solo-not-viable sanity); build green
- [ ] party playtest passes; solo cannot win
- [ ] committed; PROGRESS.md updated
