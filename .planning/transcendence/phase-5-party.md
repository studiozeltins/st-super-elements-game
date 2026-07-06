# Phase 5 — Multiplayer party

> Part of Transcendence. Contracts + tracker: [PROGRESS.md](./PROGRESS.md) · Full plan:
> [../../docs/TRANSCENDENCE_PLAN.md](../../docs/TRANSCENDENCE_PLAN.md)

**Status:** ⬜ TODO · **Depends on:** Phase 4

Read the **Shared contracts** in PROGRESS.md.

## Goal
Let players group up. Foundation for the co-op raid (Phase 6) and for ganging a whale.

> NOTE: the existing `PARTY_SIZE = 4` is the player's personal 4-CHARACTER party. This is
> a different concept — a group of PLAYERS. Use `RAID_PARTY_SIZE = 4` and do NOT collide
> with the character-party naming.

## Server (`spacetimedb/src/index.ts`)
- New public tables:
  - `party` (id autoInc PK, leaderIdentity, createdAt).
  - `party_member` (partyId indexed, identity unique, joinedAt).
- Reducers: `createParty` (inserts party + leader member), `joinParty({ partyId })`,
  `leaveParty` (auto-disband party when last member leaves), enforce one party per
  identity and `RAID_PARTY_SIZE` cap.
- Clean up membership in `clientDisconnected`.

## Client
- Party panel: create (shows the party id as a join code), join by code, roster listing
  each member's active character + role (from Phase 4).

## Tests
- create / join / leave / disband; cap enforcement; no double-join; disconnect cleanup.

## Validation
- Publish local (additive tables + reducers) → regenerate → build.
- Two-client playtest: form a party, both see the roster; leave disbands correctly.

## Commit
`feat(party): player parties with create/join/leave`

## Definition of done
- [ ] `party` + `party_member` tables, all reducers, cap + one-party rules
- [ ] disconnect cleanup
- [ ] party panel UI (create/join/roster)
- [ ] tests green; build green
- [ ] two-client playtest passes
- [ ] committed; PROGRESS.md updated
