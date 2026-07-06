---
phase: 01-constellation-shard-currency
plan: 02
subsystem: gacha / transcendence economy
tags: [spacetimedb, shard-currency, reducer-wiring, backup]
requires: [REQ-shard-currency-mint]
provides:
  - player.transcendShards
  - shard-mint-on-overflow-dupe
affects:
  - spacetimedb/src/index.ts
  - scripts/snapshot.mjs
tech-stack:
  added: []
  patterns:
    - "Additive currency column mirrored at four sites (table def, seed insert, restore row, snapshot keep-list)"
    - "Reducer wiring delegates the dupe decision to the pure resolveDupeGrant helper for determinism"
key-files:
  created: []
  modified:
    - spacetimedb/src/index.ts
    - scripts/snapshot.mjs
decisions:
  - "grantCharacter's two owned-dupe branches collapse into a single resolveDupeGrant call + one return, per the plan action step; every grantCharacter return now carries shardMinted so pullBanner's unconditional accumulation never adds undefined."
  - "MAX_CONSTELLATION and grantCharacter doc comments updated from 'refund gems' to 'mint transcend shards' to keep intent accurate after removing DUPLICATE_REFUND."
metrics:
  duration: ~4 min
  completed: 2026-07-06
  tasks: 2
  files: 2
status: complete
---

# Phase 01 Plan 02: Wire transcendShards currency into the live economy Summary

Added the durable `transcendShards` u32 currency to the `player` table at all four mirror sites and wired `grantCharacter`/`pullBanner` through the wave-1 `resolveDupeGrant` helper, so a C6-overflow dupe now mints exactly one scarce shard while gems stay unchanged — replacing the old 800-gem `DUPLICATE_REFUND` path — server-authoritatively and deterministically. No deploy this plan (that is 01-03); code + typecheck + full suite only.

## What Was Built

- `transcendShards: t.u32()` column on the `player` table, seeded to `0` in `seedPlayer`, present on `RestorePlayerRow` (carried into the `restorePlayers` insert via `{ ...row }`), and `'transcend_shards'` added to the `player` keep-list in `scripts/snapshot.mjs` so backups no longer drop the column.
- `import { resolveDupeGrant } from './gachaOverflow'` and its use inside `grantCharacter`: the two owned-dupe branches now delegate to the pure helper, updating `ownedCharacter` + `setActivation` only when the returned constellation actually changes. All `grantCharacter` returns carry a uniform `{ isNew, constellation, shardMinted }` shape (new-character branch returns `shardMinted: 0`).
- `pullBanner` renames the `refund` accumulator to `shardsMinted`, accumulates `result.shardMinted` unconditionally at both grant call sites, and the final wallet write drops `+ refund` (gems = `gems - totalCost`) and credits `transcendShards: currentPlayer.transcendShards + shardsMinted`.
- Removed the `DUPLICATE_REFUND` constant and every reference; updated the `MAX_CONSTELLATION` and `grantCharacter` doc comments so no stale "refund" wording remains.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Add transcendShards column at all four mirror sites | 894feae | spacetimedb/src/index.ts, scripts/snapshot.mjs |
| 2 | Route grantCharacter through resolveDupeGrant, mint shards in pullBanner, remove DUPLICATE_REFUND | 523a31c | spacetimedb/src/index.ts |

## Verification

- `grep -c "transcendShards" spacetimedb/src/index.ts` → 3+ (table def, seed, restore, wiring); `grep -c "transcend_shards" scripts/snapshot.mjs` → 1.
- `grep -c 'DUPLICATE_REFUND' spacetimedb/src/index.ts` → 0 (constant + all references + stale comments removed).
- `grep -c "resolveDupeGrant" spacetimedb/src/index.ts` → 3 (import + two-arg helper spans); `grep -c "transcendShards: currentPlayer.transcendShards + shardsMinted"` → 1.
- No `maxed` and no `refund` variable remain in the file; both `grantCharacter` returns carry `shardMinted`.
- `./node_modules/.bin/tsc --noEmit -p spacetimedb` → exit 0.
- `pnpm test` → 22 files, 318 tests passed.

## Threat Mitigations Applied

- T-1-01 (Tampering/Elevation): the shard credit derives only from `resolveDupeGrant` (server `SHARD_PER_OVERFLOW_DUPE` constant + owned-constellation state); the client sends no shard amount.
- T-1-03 (cross-player mutation): `pullBanner` resolves the caller via `requirePlayer`/`ctx.sender` and updates only `currentPlayer.identity`'s row.
- T-1-02 (determinism): the mint path uses the pure helper (no random/time/I-O), preserving reducer determinism (CLAUDE.md rule 2).

## Deviations from Plan

None affecting behavior. The plan's critical_reminders describe "THREE return sites"; the plan's own action step (b) collapses the two owned-dupe branches into a single `resolveDupeGrant` call with one return, so `grantCharacter` now has two returns total (new-character + owned), both carrying `shardMinted` and neither omitting it. This matches the prescribed implementation and satisfies the invariant that no `grantCharacter` return can feed `undefined` into `shardsMinted += result.shardMinted`.

Additionally updated the `MAX_CONSTELLATION` inline comment and the `grantCharacter` doc comment from "refund gems"/"refund at max" to shard-mint wording — a documentation correction, not a behavior change (they did not name `DUPLICATE_REFUND`, so they did not affect the removal grep).

## Known Stubs

None. Regenerated client bindings, the React shard prop, and the shard UI chip belong to later plans (01-03+) per this plan's success criteria — deliberately out of scope, not stubs.

## Self-Check: PASSED

- FOUND: spacetimedb/src/index.ts (transcendShards column + resolveDupeGrant wiring)
- FOUND: scripts/snapshot.mjs (transcend_shards keep-list entry)
- FOUND commit: 894feae
- FOUND commit: 523a31c
