---
phase: 05-multiplayer-party
plan: 02
subsystem: multiplayer-party
tags: [spacetimedb, party, reducers, authz, server-authoritative]
requires:
  - partyRules.nextLeader + canAccept (Plan 01 pure helpers)
  - RAID_PARTY_SIZE constant (Plan 01)
  - requirePlayer / accountIdentity actor resolution (existing module)
provides:
  - party / party_member / party_invite public tables
  - invitePlayer / requestJoin / acceptInvite / declineInvite / leaveParty reducers
  - server-authoritative grouping (cap, one-party-per-player, promotion, disband, invite invalidation)
affects:
  - Plan 03 (client bindings + subscription to party tables)
  - Plan 04 (party UI surfaces consuming these reducers)
  - Plan 06 (two-client playtest of the full invite/accept/leave loop)
tech-stack:
  added: []
  patterns:
    - Actor always requirePlayer(ctx); passed identity is a lookup target only (T-05-01)
    - Symmetric recipient-only authz guard shared across invite/request (never branches on kind)
    - Reducer maps STDB Identity/Timestamp rows into pure-helper primitives before deciding
    - DB .unique() constraint as the atomic race backstop behind the canAccept decision
key-files:
  created: []
  modified:
    - spacetimedb/src/index.ts
decisions:
  - "kind ('invite'/'request') is display copy only; accept/decline authz guards on recipientIdentity == actor, symmetric across both paths (T-05-02)."
  - "Pending invites are deduped per (partyId, joinerIdentity) — a repeat invite/request is a silent no-op, not an error (T-05-06 accepted residual)."
  - "acceptInvite full-party check uses the recomputed post-insert roster (>= cap) so the accepting join itself can trigger invite sweep (D-08)."
  - "leaveParty promotion maps remaining members to {identityHex, joinedAtMicros} and delegates ordering to nextLeader; no promotion logic reimplemented in the reducer."
metrics:
  duration: 5 min
  completed: 2026-07-07
status: complete
---

# Phase 05 Plan 02: Party Model + Reducers Summary

Added the server-authoritative multiplayer-party model to the SpacetimeDB module: three public tables (`party` / `party_member` / `party_invite`) and five reducers (`invitePlayer`, `requestJoin`, `acceptInvite`, `declineInvite`, `leaveParty`). All grouping authority — one-party-per-player uniqueness, the `RAID_PARTY_SIZE` cap, leader promotion (D-05), disband, and state-based invite invalidation (D-08) — lives in reducers, with the security-critical promotion and accept-eligibility decisions delegated to Plan 01's pure `partyRules` helpers. Invite-only entry is the sole membership path: there is deliberately no `joinParty(rawId)` reducer.

## What Was Built

### Task 1 — party / party_member / party_invite tables (commit `2557d4a`)
- Three public tables added near the `schema({...})` export and registered in the single schema object.
- `party`: autoInc `id` PK, `leaderIdentity`, `createdAt`.
- `party_member`: autoInc `id` PK, `partyId` btree, `identity` **UNIQUE** (atomic one-party-per-player backstop, D-06), `joinedAt`.
- `party_invite`: autoInc `id` PK, `partyId` / `joinerIdentity` / `recipientIdentity` all btree, `kind` string (display-only), `createdAt`. `joinerIdentity` = who is added on accept; `recipientIdentity` = who must accept.

### Task 2 — invitePlayer + requestJoin (commit `03c6dde`)
- Both take `{ targetIdentity }`; the actor is always `requirePlayer(ctx)` and `targetIdentity` is a lookup only (T-05-01 Spoofing).
- `invitePlayer` (D-02 invite): rejects self / missing target / already-partied target (Latvian copy), ensures **my** party with me as leader, cap-guards, dedupes, inserts a pending `invite`.
- `requestJoin` (D-02 mirror): rejects self / missing target / me-already-partied, ensures the **target's** party with the target as leader, cap-guards, dedupes, inserts a pending `request` (`joinerIdentity = me`, `recipientIdentity = target`).
- No `joinParty(rawId)` reducer (T-05-03 Tampering).

### Task 3 — acceptInvite + declineInvite + leaveParty (commit `1e6d45b`)
- Imports `nextLeader` + `canAccept` from `./partyRules`.
- `acceptInvite`: recipient-only authz guard (T-05-02); eligibility via `canAccept(rosterSize, joinerAlreadyPartied, RAID_PARTY_SIZE)` mapped to Latvian SenderError; inserts the member row (unique() backstop, T-05-04); D-08 invalidation drops the joiner's other invites and, when the roster is now full, the party's remaining invites; then consumes the accepted invite.
- `declineInvite`: same recipient guard, deletes the invite only.
- `leaveParty`: deletes my member row, then disbands (party + its invites) if I was the last, else promotes the oldest-joined remaining member via `nextLeader` when the leader leaves.
- `onDisconnect` left byte-for-byte unchanged (D-04) — verified absent from the diff.

## Verification

- `./node_modules/.bin/tsc -b --force spacetimedb` → clean (EXIT 0).
- `pnpm vitest run partyRules serverSync` → 2 files, 102 tests passed.
- `grep -E "export const joinParty" spacetimedb/src/index.ts` → none (invite-only entry).
- `grep -c "recipientIdentity.equals" spacetimedb/src/index.ts` → 2 (acceptInvite + declineInvite).
- `git diff` shows no change to the `onDisconnect` reducer.

## Deviations from Plan

None - plan executed exactly as written. (`pnpm exec tsc` printed a stale "Already up to date" pnpm-cache line, so type-checking was run via the tsc binary directly with `--force`; the module compiles clean either way.)

## Self-Check: PASSED
- FOUND: spacetimedb/src/index.ts (party tables + 5 reducers)
- FOUND commit 2557d4a, 03c6dde, 1e6d45b
