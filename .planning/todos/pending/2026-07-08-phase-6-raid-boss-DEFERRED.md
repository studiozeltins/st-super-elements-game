# TODO — Phase 6: Raid boss (party-gated shard faucet)

**Deferred out of the Transcendence milestone on 2026-07-08** (milestone shipped at Phase 5).
Not built. Full spec preserved — pick up in a future milestone.

- **Spec:** [`../../transcendence/phase-6-raid.md`](../../transcendence/phase-6-raid.md)
- **Contracts + tracker:** [`../../transcendence/PROGRESS.md`](../../transcendence/PROGRESS.md)
- **Depends on:** Phase 2 (shards) ✅, Phase 5 (party) ✅ — both already shipped.

## Gist
Party leader summons a raid boss no solo player can beat; on kill, `RAID_SHARD_PAYOUT` (=6)
shards split among party members who dealt damage. This is invariant-4's recoverable faucet
(a ganked, shard-poor player rejoins a party and recovers shards via a raid).

## To resume
`/gsd-phase` to re-add it to an active milestone's ROADMAP, then `/gsd-plan-phase 6`.
