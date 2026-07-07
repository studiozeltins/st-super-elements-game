# TODO — Phase 7: Role enforcement in raid + balance + full validation

**Deferred out of the Transcendence milestone on 2026-07-08** (milestone shipped at Phase 5).
Not built. Full spec preserved — pick up in a future milestone.

- **Spec:** [`../../transcendence/phase-7-balance.md`](../../transcendence/phase-7-balance.md)
- **Contracts + tracker:** [`../../transcendence/PROGRESS.md`](../../transcendence/PROGRESS.md)
- **Depends on:** Phase 3 (shards at risk) ✅, **Phase 6 (raid boss)** — DEFERRED, do 6 first.

## Gist
Make roles matter in the raid (aggro→tank, enrage→healer, AoE→positioning), tune the shard
economy so an active player nets neutral-to-slightly-positive and no whale death-spirals a
fresh player, then validate the full loop end-to-end and deploy to both local + maincloud
via migrate (no `--delete-data`).

## To resume
Requires Phase 6 first. `/gsd-phase` to re-add both, then `/gsd-plan-phase 6` → `7`.
