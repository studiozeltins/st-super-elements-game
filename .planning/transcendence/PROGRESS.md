# Transcendence — Build Tracker

Split of [`docs/TRANSCENDENCE_PLAN.md`](../../docs/TRANSCENDENCE_PLAN.md) into one file per
phase, each self-contained for a separate agent. This file tracks progress — update the
status box and tick the boxes as phases land.

## Status

| Phase | File | Status | Depends on | Commit |
|---|---|---|---|---|
| A | [phase-A-rename.md](./phase-A-rename.md) | ✅ DONE | — | `8236de4` |
| 0 | [phase-0-constants.md](./phase-0-constants.md) | ✅ DONE | A | `10f3fa6` |
| 1 | [phase-1-shards.md](./phase-1-shards.md) | ⬜ TODO | 0 | — |
| 2 | [phase-2-transcendence.md](./phase-2-transcendence.md) | ⬜ TODO | 1 | — |
| 3 | [phase-3-shard-risk.md](./phase-3-shard-risk.md) | ✅ DONE | 2 | `93d071b` |
| 4 | [phase-4-roles.md](./phase-4-roles.md) | ⬜ TODO | 0 | — |
| 5 | [phase-5-party.md](./phase-5-party.md) | ✅ DONE | 4 | `feat/transcendence` |
| 6 | [phase-6-raid.md](./phase-6-raid.md) | ⬜ TODO | 2, 5 | — |
| 7 | [phase-7-balance.md](./phase-7-balance.md) | ⬜ TODO | 3, 6 | — |

Status legend: ⬜ TODO · 🟡 IN PROGRESS · ✅ DONE · ⛔ BLOCKED

## Execution order

```
A ─► 0 ─► 1 ─► 2 ─► 3 ─┐
         └► 4 ─► 5 ────┴► 6 ─► 7
```
Phase A (rename + wipe) first. Then transcendence spine (0→1→2→3) and co-op spine
(4→5) run in parallel; they converge at 6, finish at 7.

## Checklist

- [x] **A** — rename primogems → gems (shipped, both envs wiped + published)
- [x] **0** — lock transcendence constants (no behavior change)
- [ ] **1** — constellation shard currency + mint on C6-overflow dupe
- [ ] **2** — transcendence install + power scaling past C6
- [x] **3** — shards at risk on death + PVP steal + erosion
- [ ] **4** — formalize character roles (tank/dps/healer/support)
- [x] **5** — multiplayer party (invite-only, cap 4, roster/frames, promote/disband, persists across disconnect)
- [ ] **6** — raid boss (party-gated shard faucet)
- [ ] **7** — role enforcement in raid + balance + full validation

---

## Shared contracts (every phase agent MUST honor)

### Naming (verbatim)
- Common currency: **`gems`** (u32 on `player`). Ground pieces: `gem_drop` / `gemDrop`.
- Transcendence currency: **`transcendShards`** (u32 on `player`).
- PVE-death shard pickup table: **`shard_drop`** / accessor `shardDrop`.
- Per-character transcend level: **`ownedCharacter.transcendLevel`** (u32).
- Helpers: `spillShards` (mirrors `spillGems`); reuse `gemIsCollectible` (generic).
- Constants: `SHARD_*`, `TRANSCEND_*`.
- NEVER `primogem` (renamed in Phase A). NEVER "fragment"/"crystal" — always `shard`.
- User-facing nouns: "Gems" (common) and "Constellation Shards" (rare). Characters shown
  in Latvian as "Varoņi" — display copy only, code stays `character`.

### Invariants (do not violate)
1. **C0–C6 is the protected PVE floor.** Only the transcend layer (and, as last-resort
   erosion, one C-level) is ever lost.
2. **Shards are scarce** — only from C6-overflow dupes, PVP theft, raid payout. No cheap faucet.
3. **Shards must buy real power** (transcendence), not be pure insurance.
4. **A ganked non-payer must recover** shards via the raid faucet.
5. **Keep client/server number mirrors in sync** — `serverSync.test.ts` guards this.

### Locked tunables (set in Phase 0, referenced after)
| Constant | Value | Meaning |
|---|---|---|
| `MAX_TRANSCEND_LEVEL` | 10 | levels past C6 |
| `TRANSCEND_DAMAGE_STEP` | 0.05 | +5% dmg / transcend level |
| `TRANSCEND_HEAL_STEP` | 0.08 | +8% heal / transcend level (healers) |
| `TRANSCEND_SHARD_COST(n)` | `n` | installing level n costs n shards |
| `SHARD_PER_OVERFLOW_DUPE` | 1 | shards per C6-dupe |
| `SHARD_DEATH_LOSS` | 1 | shards dropped on death |
| `RAID_SHARD_PAYOUT` | 6 | shards a raid boss drops, split among party |

### Locked decisions
- **PVE death shard → ground collectible** (spills via gem-spill path + 1.2s grace).
  PVP death transfers the shard directly to the killer.
- **Wipe, don't migrate** for destructive schema ops (done once in Phase A).
- All work on branch **`feat/transcendence`** (cut from `master`).

### Party contract (Phase 5 shipped → Phase 6 raid consumer MUST gate on this)
- **Tables:** `party` (accessor `party`, `leaderIdentity` = current leader) and `party_member`
  (accessor `partyMember`, `identity` **unique** — one party per player; carries `partyId`, join order).
- **Reducers (invite-only, no open join):** `invitePlayer`, `requestJoin`, `acceptInvite`,
  `leaveParty`. Pending invites live in `party_invite`. Every reducer authorizes via
  `requirePlayer(ctx)` on `ctx.sender` — never trust a passed identity.
- **Cap:** `RAID_PARTY_SIZE` = 4 (single source of truth; raid faucet split reuses it).
- **Leader succession:** on leader leave, `nextLeader` promotes oldest-joined member; last member
  leaving disbands the party. Membership persists across disconnect (`onDisconnect` does NOT drop members).
- **Phase 6 gate:** summon the raid boss only when `ctx.sender` is a `party_member`; the party-summoned
  shard faucet pays `RAID_SHARD_PAYOUT` split across live `party_member` rows of that `partyId`.

### Workflow per phase
- `pnpm`, never `npm`.
- Deploy: `spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb --server local -c -y`
  → `pnpm run spacetime:generate` → `pnpm build`. Push maincloud only at prod points.
- Additive schema (new columns/tables) → migrate-publish keeps data (drop `-c`).
- Tests: pure math → dependency-free modules under `src/game/combat/` or `src/game/data/`
  (vitest). Extract pure helpers from reducer logic so they unit-test without a DB.
- End every phase: real playtest of the new slice (webapp-testing skill), then ONE atomic
  commit. Update this tracker (status + commit hash + tick the box).
