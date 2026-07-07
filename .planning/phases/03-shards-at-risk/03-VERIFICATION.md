---
phase: 03-shards-at-risk
verified: 2026-07-07T08:52:12Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 3: Shards at Risk — Verification Report

**Phase Goal:** Carried shards become a real stake — death drops them, a PVP killer steals them, and with no shards the active character erodes in the locked order (transcend-- then C--), never breaching the C0-C6 floor.
**Verified:** 2026-07-07T08:52:12Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | On PVE death the shard spills as a ground collectible (gem-spill path + 1.2s grace) that anyone — including the recovering owner — can grab. | ✓ VERIFIED | `spillShards` (index.ts:820) inserts one `shard_drop` row stamped `droppedAtMicros`; called in BOTH PVE paths (`takeDamage` :1184, `worldTick` :2444) only when `result.shardsLost > 0`, no killer credit. `collectShard` (:1622) reuses `gemIsCollectible(...GEM_PICKUP_DELAY_MICROS)` grace. Client renders + magnet-collects (createGame.ts:694-742). Approved playtest scenario 2. |
| 2 | On PVP death the killer receives exactly 1 shard (theft), and the victim loses it. | ✓ VERIFIED | `attackPlayer` (:1024-1035): killer credited `attacker.transcendShards + result.shardsLost` (never a hardcoded 1), victim gets `transcendShards: result.nextShards`, NO ground drop. A1 gate is `stolen > 0 || result.shardsLost > 0` (not nested in the gem `if (stolen>0)`), so a 0-gem shard carrier still transfers. Empty-victim credits 0 (`shardsLost===0` unit test). Approved playtest scenarios 1, 4, 5. |
| 3 | With 0 shards, death erodes the active character in order: transcend level first, then a constellation level (C6→C5) — the C0-C6 floor is never breached below that. | ✓ VERIFIED | `applyDeathShardPenalty` (deathPenalty.ts) three priority gates: shards → transcendLevel-- → constellation-- (C6→C5), each decrement only inside the branch that proved `>0`; nothing-branch returns all 0 (no negatives / C0 floor). 6/6 unit tests green incl. branch-order + no-negative cases. Wired into all 3 death paths (owned-row update before respawn). Approved playtest scenario 3. |
| 4 | The player sees a shard lost/stolen toast, an updated counter, and a steal-feed hint. | ✓ VERIFIED | App.tsx:412-438 diffs reactive `myPlayer.transcendShards`: gain→`--pulse`, loss→`--drain`; three distinct Latvian strings (`Nozagi zvaigžņu šķembu!` / `Zvaigžņu šķemba nozagta!` / `Zvaigžņu šķemba nokrita`) disambiguated via pickup + pvpHit timing refs; a plain pickup is pulse-only. `.wallet-chip--drain` + `.shard-toast` in index.css:1141/1155. `shardFlashClass` threaded to Character/Gacha chips. Approved playtest. |

**Score:** 4/4 truths verified (0 present, behavior-unverified)

Plan-01 helper carries 6 sub-invariants (has-shards / only-transcend / only-constellation / nothing / branch-order / empty-victim-credit), all independently proven by `deathPenalty.test.ts` (6/6 green).

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `spacetimedb/src/deathPenalty.ts` | Pure `applyDeathShardPenalty` + `DeathShardPenalty`, zero imports | ✓ VERIFIED | 73 lines, zero import statements, 3 gates + no-op fallthrough; imported by index.ts:23. |
| `src/game/data/__tests__/deathPenalty.test.ts` | Cross-import spec, all branches + order + empty-victim | ✓ VERIFIED | Imports real helper across boundary + `SHARD_DEATH_LOSS` mirror; 6 tests green. |
| `shard_drop` table + `shardDrop` accessor | Public gem_drop mirror, additive | ✓ VERIFIED | Defined index.ts:317, registered in `schema({...})` :588, `droppedAtMicros: t.u64().default(0n)`. |
| `spillShards` helper | Single count-1 piece, scatter + clamp + stamp | ✓ VERIFIED | index.ts:820, `if (amount<=0) return`, one insert, no denomination. |
| `collectShard` reducer | Reuse grace, credit grabber | ✓ VERIFIED | index.ts:1622, `requirePlayer` + `gemIsCollectible` + delete + credit. |
| Regenerated `src/module_bindings/` | shardDrop table + collectShard reducer | ✓ VERIFIED | `shard_drop_table.ts`, `collect_shard_reducer.ts` present; `index.ts:220/262` register both. |
| Client shard renderer | createShardMesh/updateShardDrops/syncShardDrops | ✓ VERIFIED | createGame.ts:694/713/1052; `OctahedronGeometry(0.42)` + `0x9333ea` + emissive 0.6. |
| `sendCollectShard` bridge + subscribe/sync | App.tsx | ✓ VERIFIED | subscribe :101, useTable :120, sync effect :401, bridge :367 → `reducers.collectShard`. |
| `.wallet-chip--drain` + `.shard-toast` | index.css | ✓ VERIFIED | index.css:1141 / :1155 (no `--danger`). |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| index.ts | deathPenalty.ts | `import { applyDeathShardPenalty }` (:23), called in 3 death paths | ✓ WIRED |
| PVP credit | helper result | `attacker.transcendShards + result.shardsLost`, gate `stolen>0 \|\| shardsLost>0` | ✓ WIRED (A1 honored) |
| collectShard | gem grace | `gemIsCollectible(...GEM_PICKUP_DELAY_MICROS)` reused, not forked | ✓ WIRED |
| App.tsx | shardDrop renderer | `syncShardDrops(shardDropRows)` useEffect on `[shardDropRows]` | ✓ WIRED |
| test | client mirror | `SHARD_DEATH_LOSS` from `../constants` (asserted by serverSync.test.ts:136) | ✓ WIRED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Pure penalty helper (all branches + order + empty-victim) | `vitest run deathPenalty.test.ts` | 6/6 passed | ✓ PASS |
| Constant mirror server↔client | `vitest run serverSync.test.ts` | 57/57 passed | ✓ PASS |
| Server module wiring compiles | `tsc --noEmit -p spacetimedb/tsconfig.json` | exit 0 | ✓ PASS |

Live two-client behaviors (PVE-drop-not-credit, PVP-transfer-exactly-shardsLost, erosion order+floor, empty-victim no-mint, 0-gem carrier still-transfers) are not in-process automatable — no reducer/DB harness (03-VALIDATION.md). They were verified by an approved human two-client playtest (03-05-SUMMARY.md, all 5 scenarios ✅, tester "approved") and treated as evidence per verification scope; not re-run in-process.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| REQ-shard-risk | 03-01…03-05 (all) | Death loss, PVP steal, erosion order | ✓ SATISFIED | Pure helper + spec, `shard_drop`/`spillShards`/`collectShard`, 3 wired death paths with A1 credit, additive publish + bindings, client surfaces — all present and verified above. |

Single phase requirement; declared in every plan's frontmatter and mapped to Phase 3 (Complete) in REQUIREMENTS.md:185. No orphaned requirements for this phase.

### Anti-Patterns Found

None. Debt-marker scan (TODO/FIXME/XXX/HACK/PLACEHOLDER) across `deathPenalty.ts`, `createGame.ts`, `App.tsx`, `index.css` returned zero hits. No stubs — all client surfaces wired to live data (`tables.shardDrop`, `myPlayer.transcendShards`, `pvpHit`). No `--danger` misuse on the loss flash. `vacuumGems` (index.ts:2021) iterates `gemDrop` only — a camp cannot eat a shard. `fallToDeath` (index.ts:1201) carries no shard logic (void death costs no shard, per [D1]).

### Prohibitions (must-NOT) — all satisfied

| Prohibition | Status | Evidence |
| ----------- | ------ | -------- |
| Never credit PVP killer a hardcoded 1 | ✓ | Credit is `result.shardsLost`; grep finds no `+= 1`/`+ 1` shard credit. |
| Never nest shard credit in gem `if (stolen>0)` block | ✓ | Gate is `stolen > 0 \|\| result.shardsLost > 0` (index.ts:1024). |
| Never add shard_drop to vacuumGems | ✓ | vacuumGems iterates `gemDrop` only. |
| Never wire fallToDeath | ✓ | No penalty call in fallToDeath. |
| Never decrement outside the proven branch (u32 safety) | ✓ | Helper decrements only inside `>0` gates; Math.max on shards branch. |
| Never color the shard gold / reuse GEM_RADIUS | ✓ | `0x9333ea`, `OctahedronGeometry(0.42)`. |
| Never use --danger/red for the loss flash | ✓ | `.wallet-chip--drain` shrink, `--shard` purple, no `--danger`. |

### Human Verification Required

None outstanding. The behavior-dependent live invariants (SC #1–#3) were already verified by an approved human two-client playtest recorded in 03-05-SUMMARY.md (all 5 scenarios passed, tester approved). Per verification scope this approved playtest is the accepted evidence and was not re-run in-process.

### Gaps Summary

No gaps. Every layer of the phase goal is present and wired: the pure branch-ordered penalty helper (unit-proven, incl. the u32-underflow and empty-victim-mint safety invariants), the server-authoritative `shard_drop` economy (table + `spillShards` + `collectShard` reusing the gem grace), the A1-correct PVP killer credit decoupled from the gem-spill guard, all three death paths keeping the gem spill, the additive publish + regenerated bindings, and the client purple-drop renderer + diff-driven toast/counter-flash. Automated evidence (63 tests green + server typecheck) covers the pure math, the constant mirror, and compilation; the not-automatable live invariants rest on the approved 03-05 two-client playtest.

## Notable (informational, not a gap)

03-05-SUMMARY flags an emergent, tester-approved behavior: enemies can magnet-pick a `shard_drop` and re-drop it on their own death (distinct from the camp-vacuum path, which correctly excludes shards). It breaks none of the five gated invariants and is explicitly deferred to a future balance phase (candidate Phase 7). No action required this phase.

---

_Verified: 2026-07-07T08:52:12Z_
_Verifier: Claude (gsd-verifier)_
