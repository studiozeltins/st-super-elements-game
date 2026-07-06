# Phase 7 — Role enforcement in raid + balance + full validation

> Part of Transcendence. Contracts + tracker: [PROGRESS.md](./PROGRESS.md) · Full plan:
> [../../docs/TRANSCENDENCE_PLAN.md](../../docs/TRANSCENDENCE_PLAN.md)

**Status:** ⬜ TODO · **Depends on:** Phase 3, Phase 6

Read the **Shared contracts** in PROGRESS.md. Final phase — the make-or-break tuning.

## Goal
Make roles matter in the raid, tune the shard economy so the loop holds, and validate the
whole thing end to end. Deploy to prod.

## Server — role-rewarding raid mechanics (soft-gate, not hard-lock)
- Aggro locks to the highest-HP / tank contributor when present (tank matters).
- An enrage / ramp that outpaces a party with no healer (healer matters).
- Heavy AoE that punishes stacking (positioning matters).

## Balance pass (tune, don't guess — verify with tests + playtest)
- Shard scarcity vs loss rate: an active player nets roughly neutral-to-slightly-positive
  shards per session; a ganked player recovers via ~1 raid.
- Transcendence power vs enemy HP: `C6 + T10` must NOT trivialize camps to zero threat;
  add mild camp scaling if needed (optional counterweight).
- No death-spiral: simulate a whale vs a fresh player — the fresh player is never
  permanently locked out.

## Tests
- Enrage / aggro logic units.
- A "balance guard" test asserting key ratios (shard gain rate ≤ bound; transcend
  multiplier caps at a sane value at `MAX_TRANSCEND_LEVEL`).

## Validation (full loop, both envs)
- Full multi-client playtest (webapp-testing): pull → C6 → shard → transcend → carry →
  PVP steal → raid recover.
- Deploy to BOTH local and maincloud per CLAUDE.md migrate procedure (publish WITHOUT
  `-c`, then `spacetime call ... seed_world` if new spawns seed on init).

## Commit
`feat(raid): role-driven raid mechanics + transcendence balance pass`

## Definition of done
- [ ] raid rewards tank + healer + positioning
- [ ] balance ratios verified (tests + playtest); no death-spiral
- [ ] full-loop multi-client playtest passes
- [ ] deployed to local + maincloud
- [ ] committed; PROGRESS.md updated → milestone complete
