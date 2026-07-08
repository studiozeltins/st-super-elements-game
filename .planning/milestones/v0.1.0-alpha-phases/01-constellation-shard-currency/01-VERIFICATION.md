---
phase: 01-constellation-shard-currency
verified: 2026-07-06T18:30:00Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 1: Constellation Shard Currency Verification Report

**Phase Goal:** A dupe of an already-C6 character mints a scarce shard instead of a gem refund, and the player can see their shard balance.
**Verified:** 2026-07-06T18:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | C6-dupe → transcendShards +1, gems unchanged, no 800-gem refund | ✓ VERIFIED | `resolveDupeGrant` returns `{constellation: max, shardMinted: shardPerOverflow}` at cap (gachaOverflow.ts:20-23); `pullBanner` accumulates `shardsMinted += result.shardMinted` (index.ts:1648,1664) and writes `transcendShards: currentPlayer.transcendShards + shardsMinted` with `gems: currentPlayer.gems - totalCost` (no `+ refund`) (index.ts:1697-1698). `DUPLICATE_REFUND` grep = 0 across repo. Pure-helper unit test asserts C6 case mints exactly `SHARD_PER_OVERFLOW_DUPE` (test passes). |
| 2 | sub-C6 dupe → constellation++, no shard | ✓ VERIFIED | `resolveDupeGrant` returns `{constellation: current+1, shardMinted: 0}` below cap (gachaOverflow.ts:20-21); `grantCharacter` updates ownedCharacter + activation only when constellation changes (index.ts:1575-1580). Unit test `it.each([0,1,2,5])` asserts `constellation === current+1` and `shardMinted === 0` (green). |
| 3 | Shard balance visible in CharacterScreen + GachaScreen (◈ chip, threaded from player row) | ✓ VERIFIED | `App.tsx` threads `transcendShards={myPlayer?.transcendShards ?? 0}` into both screens (App.tsx:452,476) from `useTable(tables.player)` filtered to caller identity (App.tsx:93,167-169). Chip renders `<span className="wallet-chip"><span className="gacha__gem">◈</span> {transcendShards}</span>` with `aria-label="Zvaigžņu šķembas: {n}"` in GachaScreen wallet (GachaScreen.tsx:223-224) and CharacterScreen topbar before close button (CharacterScreen.tsx:171-172). CSS `.wallet-chip` = `color: var(--gold)` (#f2c14e), 15px, letter-spacing 0.04em (index.css:1100-1104). Visual render + live playtest human-verified & approved per orchestrator. |
| 4 | Existing gacha/pity tests green + pure-helper unit test exists | ✓ VERIFIED | `src/game/data/__tests__/gachaOverflow.test.ts` exists, imports real helper cross-package, uses `SHARD_PER_OVERFLOW_DUPE` mirror — ran green (5 tests passed). Full suite `pnpm test` = 318 passed (orchestrator note). |

**Score:** 4/4 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `spacetimedb/src/gachaOverflow.ts` | Pure `resolveDupeGrant` + `DupeGrantOutcome` | ✓ VERIFIED | Dependency-free (no import/ctx/db), exports both symbols (gachaOverflow.ts:7-24). |
| `src/game/data/__tests__/gachaOverflow.test.ts` | Both overflow branches | ✓ VERIFIED | 5 tests green; cross-import + shared constant. |
| `player.transcendShards` u32 column | Table + seed + restore | ✓ VERIFIED | Table def `transcendShards: t.u32().default(0)` (index.ts:290), seed `transcendShards: 0` (index.ts:665), RestorePlayerRow `transcendShards: t.u32()` (index.ts:1392). |
| `transcend_shards` in snapshot keep-list | Backup carries column | ✓ VERIFIED | scripts/snapshot.mjs:27. |
| Regenerated `player_table.ts` | Binding carries transcend_shards | ✓ VERIFIED | `transcendShards: __t.u32().name("transcend_shards")` (player_table.ts:28). |
| Shard chip render in both screens | ◈ gold chip | ✓ VERIFIED | GachaScreen.tsx:223, CharacterScreen.tsx:171; `.wallet-chip` CSS present. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `index.ts` | `gachaOverflow.ts` | `import { resolveDupeGrant }` | ✓ WIRED | index.ts:21; called in grantCharacter (index.ts:1570). |
| `grantCharacter` (3 return sites) | `pullBanner` accumulator | `shardMinted` on every return | ✓ WIRED | new-char returns `shardMinted: 0` (1566); both dupe branches carry helper's `shardMinted` (1581). No return omits it; no `maxed` remains. |
| `pullBanner` | `player` row | `transcendShards + shardsMinted` | ✓ WIRED | index.ts:1698; `gems` write drops `+ refund` (1697). |
| `App.tsx` | GachaScreen + CharacterScreen | `transcendShards={myPlayer?.transcendShards ?? 0}` | ✓ WIRED | App.tsx:452,476 from subscribed player row. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| GachaScreen / CharacterScreen chip | `transcendShards` prop | `myPlayer.transcendShards` from `useTable(tables.player)` (subscribed row) | ✓ (server-owned durable u32) | ✓ FLOWING — read-only; client never computes/mutates. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Pure-helper mint decision | `pnpm vitest run gachaOverflow.test.ts` | 5 passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| REQ-shard-currency-mint | 01-01/02/03/04 | Shard currency column + mint on C6-overflow dupe; balance shown in Character/Gacha screens | ✓ SATISFIED | All four ROADMAP criteria verified above. REQUIREMENTS.md maps only this ID to Phase 1 — no orphans. Traceability table marks it Complete. |

### Anti-Patterns Found

None. No TODO/FIXME/XXX/TBD/HACK/PLACEHOLDER markers in any modified file; `DUPLICATE_REFUND` fully removed (repo grep = 0, no leftover comment).

### Human Verification Required

None outstanding. The two inherently human-gated items — visual identity of the ◈ chip and the live C6-dupe mint playtest (running server + gameplay) — were reported human-verified and approved (chip renders on all tabs; C6-dupe mints exactly 1 shard, gems flat; sub-C6 dupe constellation only). Note: SUMMARY 01-04 still records Task 3 as PENDING (written at the checkpoint pause before approval) — recommend reconciling that stale marker, but it does not block goal achievement.

### Gaps Summary

No gaps. Every ROADMAP success criterion is satisfied by present, substantive, wired code with real server-authoritative data flow. The mint semantics are proven by a passing pure-helper unit test and fully-traced reducer wiring; the removal of the 800-gem refund is confirmed repo-wide; the shard chip is threaded read-only from the subscribed player row into both screens with spec-matching styling.

---

_Verified: 2026-07-06T18:30:00Z_
_Verifier: Claude (gsd-verifier)_
