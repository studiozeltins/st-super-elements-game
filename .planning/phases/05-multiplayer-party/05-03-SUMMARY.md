---
phase: 05-multiplayer-party
plan: 03
subsystem: multiplayer-party
tags: [spacetimedb, deploy, bindings, party, codegen]
requires:
  - party / party_member / party_invite tables + 5 reducers (Plan 02, published here)
provides:
  - local 2d-impact-game-fr9ti carrying the additive party schema
  - regenerated src/module_bindings/ with party/partyMember/partyInvite tables typed
  - client-callable reducers invitePlayer/requestJoin/acceptInvite/declineInvite/leaveParty
affects:
  - Plan 04 (party UI can now reference tables.party* + reducers.*Invite/leaveParty)
  - Plan 05 (client subscription + surfaces)
  - Plan 06 (two-client playtest of the invite/accept/leave loop)
tech-stack:
  added: []
  patterns:
    - Additive migrate-publish (no --delete-data) to preserve account/account_link + player data
    - Regenerate bindings immediately after publish to prevent client/server schema drift (T-05-07)
key-files:
  created:
    - src/module_bindings/party_table.ts
    - src/module_bindings/party_member_table.ts
    - src/module_bindings/party_invite_table.ts
    - src/module_bindings/invite_player_reducer.ts
    - src/module_bindings/request_join_reducer.ts
    - src/module_bindings/accept_invite_reducer.ts
    - src/module_bindings/decline_invite_reducer.ts
    - src/module_bindings/leave_party_reducer.ts
  modified:
    - src/module_bindings/index.ts
    - src/module_bindings/types.ts
    - src/module_bindings/types/reducers.ts
decisions:
  - "Additive migrate only: `spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb --server local --yes` — no -c/--delete-data flag, so real accounts/players survived (T-05-SC)."
  - "Plan verify grep for the literal camelCase `invitePlayer` was based on a wrong codegen assumption; this SDK registers reducers by snake_case name (`invite_player`) and derives the camelCase `reducers.invitePlayer` accessor at the type level (identical mechanism to the working `collectShard`). Real gate = `tsc -b` clean + all 5 reducers/3 tables registered, which passes."
  - "maincloud publish deferred to Phase 7 per project deploy policy — only local touched."
metrics:
  duration: 4 min
  completed: 2026-07-07
status: complete
---

# Phase 05 Plan 03: Deploy Party Schema + Regenerate Bindings Summary

Published the Plan-02 party model to the LOCAL SpacetimeDB as an additive migrate and regenerated the TypeScript client bindings, unblocking all downstream client work. The local `2d-impact-game-fr9ti` database now carries the three new public tables (`party` / `party_member` / `party_invite`), and `src/module_bindings/` exposes them plus the five party reducers (`invitePlayer`, `requestJoin`, `acceptInvite`, `declineInvite`, `leaveParty`) in a type-clean form. No data wipe: the publish used no `--delete-data` / `-c` flag, so account/account_link logins and existing player rows were preserved. maincloud was not touched.

## What Was Built

### Task 1 — Additive migrate-publish to local + regenerate bindings (commit `480da6a`)
- **Preflight:** `spacetime server ping local` → `Server is online: http://127.0.0.1:3000`.
- **Publish:** `spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb --server local --yes` (the correct module path per CLAUDE.md; the `spacetime:publish` npm scripts point at the wrong `server` path and were ignored). Output: `Created user table` for `party`, `party_invite`, `party_member`, then `Updated database with name: 2d-impact-game-fr9ti` — an in-place migrate, not a fresh create. No wipe flag was present in the command.
- **Regenerate:** `pnpm run spacetime:generate` wrote the three party table files, five reducer files, and updated `index.ts` / `types.ts` / `types/reducers.ts`.

## Verification

- `./node_modules/.bin/tsc -b --pretty false` → **EXIT 0** (project type-checks against the regenerated bindings).
- Table registry in `src/module_bindings/index.ts`: `name: 'party'`, `name: 'party_invite'`, `name: 'party_member'` all present (with camelCase accessors `party` / `partyInvite` / `partyMember`).
- Reducer registry: `__reducerSchema("invite_player", …)`, `"request_join"`, `"accept_invite"`, `"decline_invite"`, `"leave_party"` all registered; matching `InvitePlayerParams` / `RequestJoinParams` / `AcceptInviteParams` / `DeclineInviteParams` / `LeavePartyParams` types exported from `types/reducers.ts`.
- Publish command contained no `--delete-data` / `-c` (self-check — data integrity, T-05-SC).
- maincloud untouched (only `--server local`).

## Deviations from Plan

**1. [Rule 1 — Verify-command correction] Plan's literal `grep -rl "invitePlayer"` does not match this SDK's codegen**
- **Found during:** Task 1 verification.
- **Issue:** The plan's `<automated>` verify chain greps `src/module_bindings/` for the literal camelCase string `invitePlayer`. This SDK generates the reducer registry using the module's snake_case reducer name (`invite_player`) and the client-callable `connection.reducers.invitePlayer(...)` accessor is a compile-time-derived camelCase mapping (the exact same mechanism that already powers the working `connection.reducers.collectShard(...)` call in `src/App.tsx:372`). The literal `invitePlayer` string therefore never appears in the emitted files, so the grep as written cannot pass regardless of correctness.
- **Fix:** Verified the plan's real intent — bindings expose the party reducers and are type-clean — via the accurate checks: `tsc -b` clean (EXIT 0) proving the derived camelCase accessors resolve, plus registry confirmation that all five reducers (`invite_player` … `leave_party`) and three tables are present. No source change; this is a verification-method correction, not a code fix.
- **Files modified:** none.
- **Commit:** n/a (documentation of a verify-step assumption mismatch).

## Threat Surface

- **T-05-SC (Tampering — publish/data integrity):** Mitigated. Command audited for absence of `--delete-data`/`-c`; migrate-only publish preserved account/account_link and player rows.
- **T-05-07 (Repudiation — stale bindings):** Mitigated. Bindings regenerated immediately after publish, so client and server schemas cannot silently drift.

No new security-relevant surface introduced (codegen artifacts only; no new endpoints/auth paths).

## Self-Check: PASSED
- FOUND: src/module_bindings/party_table.ts
- FOUND: src/module_bindings/party_member_table.ts
- FOUND: src/module_bindings/party_invite_table.ts
- FOUND: src/module_bindings/invite_player_reducer.ts (+ request_join / accept_invite / decline_invite / leave_party)
- FOUND commit 480da6a
