# Project: super-elements

## Core Value

Turn the endless Genshin-style sandbox into a **retained PVPvE loop** with a real chase:
players pursue endless **Transcendence** power (installing scarce **Constellation Shards**
past C6), contest shards through **PVP theft** and **co-op raids**, with **no progress-wipe
churn** — the installed C0–C6 constellation base is a protected floor.

**One-liner:** A power chase where scarce shards buy real, permanent-floor power, PVP makes
that power worth stealing, and a co-op raid faucet lets any ganked player recover.

## Current State

**Shipped: v0.2.0-alpha Combat Depth (2026-07-13)** — goliath combat is now fully dodgeable
and cheat-proof:

- ONE unit-agnostic server attack FSM (windup → strike → recovery, `unit_attack`/`attack_strike`
  tables) drives the full goliath roster: `leapSlam` (circle), `swordSwing` → `swordSwirl`
  (cone chaining into 360°), `shieldDash` (travelling lane with body commit). The old per-tick
  contact drain is DELETED — every point of goliath damage is a telegraphed, dodgeable strike.
- Damage + crit are SERVER-authoritative end-to-end: reducers take intent (isSkill/combo), the
  server computes base damage from mirrored `WEAPONS` math and rolls per-character crit via
  `ctx.random` — PVE and PVP damage/crit spoof holes closed.
- Clients render only: Frost terrain-draped telegraphs (circle/sector/lane) fill on
  server-derived timing; per-attack procedural clips + strike juice; server knockback + stun.
- Test suite 384 → 582 (serverSync parity extended to crit, ATTACKS, ATTACK_RENDER); every
  schema change was an additive migrate-publish (zero data wipes).

**Deferred at close (user ruling):** Phase 7 crit poise interrupt (POISE-01..03) — all its
dependencies shipped (poise column + server `isCrit`), a small pure-helper slice for a later
milestone. Spec: `.planning/todos/pending/2026-07-13-phase-7-crit-poise-interrupt-DEFERRED.md`.

**Also still deferred (from v0.1.0-alpha):** raid boss + role enforcement/balance — INV-4
(ganked non-payer recovery) remains unsatisfied until the raid faucet ships.

## Previous State

**Shipped: v0.1.0-alpha (2026-07-08)** — the transcendence economy live end-to-end:
scarce-shard mint → install (BŪSTS) for real power → shards at risk on death/PVP → character
roles → invite-only parties. Merged to `master`, tagged `v0.1.0-alpha`.

## Next Milestone Goals

Candidates (decide at `/gsd-new-milestone`):

- **Raid recovery loop** — the raid boss shard faucet + role enforcement (closes INV-4, the
  biggest open invariant; specs preserved).
- **Crit poise interrupt** — the deferred Phase 7 slice (small, all deps shipped).
- **World ambiance / polish** — the voxel-ambiance branch experiment (ambient audio bed, fog,
  coherent wind, wildlife, day/night lite) if feel > systems is the next priority.
- Backlog: camp-enemy FSM conversion (XCMB-01), miss/evasion decision, boost-orbit v2,
  transcend scaling expansion, CIEŅA star restyle.

## Target Runtime

- **Client:** Browser (TypeScript + Vite + Three.js, pixel-filter 3D top-down).
- **Server:** SpacetimeDB TypeScript module (database `2d-impact-game-fr9ti`), real-time
  server-authoritative multiplayer over LAN and maincloud.
- **Package manager:** `pnpm` only (never `npm` — the symlink layout breaks `npm i`).
- **Server module path:** `./spacetimedb` (NOT `./server`).

## Developer-Facing Success Metric

A retained PVPvE loop where:
- Players chase endless Transcendence power (installing scarce shards past C6),
- Contest shards via PVP theft and co-op raids,
- With NO progress-wipe churn — installed C0–C6 is a protected floor.

## The Core Loop This Builds

1. Pull gacha → build roster → grind each character to C6 (early game).
2. C6 reached → every further dupe mints 1 shard (rare) (mid game).
3. Install shard → Transcend past C6 (C7+, real power) (endless chase).
4. Open-world PVP-on → carried shards ride at risk.
5. Death (PVE/PVP) → lose 1/3 gems + drop 1 shard; no shards → erode active char
   (transcend--, then C6→C5); a PVP killer STEALS the dropped shard.
6. Party up → RAID BOSS (needs tank + healer + dps) → big shard payout (PVE faucet).
7. Parties gang the whale → drain shards → whale must defend.

## Locked Decisions

These are LOCKED (from the ingested Transcendence PRD) and MUST NOT be silently reversed
downstream.

### Naming contract (use identifiers verbatim)

| Concern | Identifier |
|---|---|
| Common wallet balance (player column) | `gems` (u32) — renamed from `primogems` |
| Common ground drop | `gem_drop` / accessor `gemDrop`; spill helper `spillGems` |
| Common constants | `STARTING_GEMS`, `KILL_REWARD_GEMS`, `GEM_*` |
| Transcendence balance (player column) | `transcendShards` (u32) |
| Shard ground drop (PVE death) | `shard_drop` / accessor `shardDrop`; spill helper `spillShards` |
| Per-character transcend level | `ownedCharacter.transcendLevel` (u32) |
| Transcendence constants | `SHARD_*`, `TRANSCEND_*` |
| Client mirror | `src/game/data/shardDrops.ts` |

- Code root is `shard` / `Shard` / `SHARD` everywhere — **never** "fragment" / "crystal".
- User-facing nouns: **"Gems"** (common) and **"Constellation Shards"** (rare).
- Shards are NOT vacuumable by camps (no `carriedShards` field).
- Characters shown in Latvian as "Varoņi" — display copy only; code stays `character`.

### Design invariants (do not violate)

1. **INV-1 — Protected floor.** Installed C0–C6 is the protected PVE floor. Only the
   transcendence layer (and, as last-resort erosion, one C-level) is ever lost.
2. **INV-2 — Shards are scarce.** Shards come ONLY from C6-overflow dupes, PVP theft, and
   raid-boss payout. Never a cheap/infinite faucet.
3. **INV-3 — Shards buy real power** (transcendence), not pure insurance — this is what
   makes theft worth a fight.
4. **INV-4 — A ganked non-payer must recover** shards via the raid faucet, or the loop
   becomes a churn machine.
5. **INV-5 — Keep client/server number mirrors in sync** — `serverSync.test.ts` guards
   this; every data change touches both sides + the test.

### Locked tunables (finalized in Phase 0, referenced verbatim thereafter)

| Constant | Value | Meaning |
|---|---|---|
| `MAX_TRANSCEND_LEVEL` | 10 | levels available past C6 |
| `TRANSCEND_DAMAGE_STEP` | 0.05 | +5% dmg per transcend level (smaller than C's 8%) |
| `TRANSCEND_HEAL_STEP` | 0.08 | +8% heal per transcend level (healers) |
| `TRANSCEND_SHARD_COST(n)` | `n` | installing level n costs n shards |
| `SHARD_PER_OVERFLOW_DUPE` | 1 | shards minted per C6-overflow dupe (replaces 800-gem refund) |
| `SHARD_DEATH_LOSS` | 1 | shards dropped on any death |
| `RAID_SHARD_PAYOUT` | 6 | shards a raid boss drops, split among the party |
| erosion order | transcend-- then C-- | at 0 shards, active char loses a transcend level first, then a constellation level |

### Process decisions

- **DEC-wipe-not-migrate:** the `primogems→gems` rename was a destructive schema op —
  accepted as a full data wipe (`--delete-data always`) on both envs, done ONCE in Phase A
  before real players mattered. Every OTHER phase is additive schema (migrate-publish,
  never `--delete-data` on a DB with real accounts).
- **DEC-pve-death-shard-ground-collectible:** on PVE death the dropped shard spills as a
  ground pickup (gem-spill path + 1.2s pickup grace so a camp cannot vacuum it); anyone can
  grab it. PVP death instead transfers the shard directly to the killer.
- **DEC-branch-feat-transcendence:** all transcendence work lands on `feat/transcendence`,
  cut from `master` (the real trunk; `main` is a stale Initial-commit branch).

## Cross-Cutting Constraints

- **Additive schema:** new columns/tables only; migrate-publish keeps data. Never drop a
  table with rows without clearing it first. Phase A was the sole deliberate wipe.
- **Deploy procedure (per phase):**
  `spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb --server local --yes`
  → `pnpm run spacetime:generate` → `pnpm build`. Push to `maincloud` only at Phase 7 (or
  a user-facing prod point), never `--delete-data` on a DB with real accounts.
- **Test discipline:** pure math → dependency-free modules under `src/game/combat/` or
  `src/game/data/` (vitest). Extract pure helpers from reducer logic so they unit-test
  without a running DB. Keep `serverSync.test.ts` green. Every phase ends with a real
  Playwright playtest of the new slice, not just green tests.
- **One atomic commit per phase.**

## Implementation Surface

- Server: `spacetimedb/src/index.ts`, `spacetimedb/src/enemyStats.ts`
- Client data: `src/game/data/constants.ts`, `constellations.ts`, `characters.ts`,
  `gem*.ts`, `shardDrops.ts`, `__tests__/serverSync.test.ts`
- Client combat/game: `src/game/combat/comboSystem.ts`, `src/game/createGame.ts`
- UI: `src/ui/CharacterScreen.tsx`, `src/ui/GachaScreen.tsx`, `CharacterSheet.tsx`,
  `ConstellationRing.tsx`, `App.tsx`
- Ops: `scripts/*.mjs`, `CLAUDE.md`

## Key Decisions

| Date | Decision | Rationale | Outcome |
|------|----------|-----------|---------|
| 2026-07 | Two-tier gem/shard economy naming (verbatim contract) | One consistency contract across client+server prevents drift | ✓ Good |
| 2026-07 | Wipe (not migrate) for the primogems→gems rename | Destructive column rename, done once before real players mattered | ✓ Good |
| 2026-07 | PVE-death shard = ground collectible; PVP-death = steal to killer | Makes PVP theft the meaningful risk; PVE loss is recoverable | ✓ Good |
| 2026-07 | All work on `feat/transcendence` off `master` | `master` is the real trunk; `main` is stale | ✓ Good |
| 2026-07-08 | Ship alpha at Phase 5; defer raid (6) + balance (7) to next milestone | Get the economy + PVP loop in players' hands sooner; raid is a self-contained slice | ⚠️ Revisit — INV-4 unmet until raid ships |
| 2026-07-08 | Merged `feat/transcendence` → `master`, tagged `v0.1.0-alpha` | Mark the shipped alpha; `master` is trunk | ✓ Good |
| 2026-07-08 | Start v0.2.0-alpha Combat Depth on branch `alpha-v0.2.0` (cut from `master`) | Trunk-based; keep combat work isolated from trunk until shippable | ✓ Good |
| 2026-07-08 | Combat FSM built unit-agnostic but scoped enemies-only this milestone (heroes stay on client swing) | Ship the dodgeable-attack loop faster; heroes reuse the same table/registry later with zero schema change | ✓ Good — FSM proven across 4 attacks / 3 shapes with zero schema change between them |
| 2026-07-08 | Base damage computed SERVER-side (Option B, CRIT-06) — reducers take intent, not a damage number | Closes the PVP damage-spoof hole; only choice that makes the poise interrupt un-spoofable | ✓ Good — landed atomically in Phase 2, extended to PVP in Phase 3 |
| 2026-07-09 | Self-host pivot: maincloud DROPPED, deploy target = self-hosted standalone | Maincloud DB paused; user chose self-host | ✓ Good — SC5 RTT check carried to prod-deploy gate |
| 2026-07-10 | Contact drain deleted in the same slice that guarantees no facetank dead zone (Phase 4) | Keeping drain + strikes double-dips and re-introduces undodgeable damage | ✓ Good |
| 2026-07-13 | leapSlam maxBand 8→5.5 + size-2 laneLength 7.95 (seed deviations, user-accepted at close) | Without band fix shieldDash was dead code; 8.0 sat on the strict-> SNAP_DISTANCE float hazard | ✓ Good |
| 2026-07-13 | Close v0.2.0-alpha at Phase 6; defer crit poise interrupt (Phase 7) | User ruling — playtests approved phases 4/6; interrupt is a small standalone slice with all deps shipped | — Pending (POISE-01..03 open) |

## Out of Scope

- Raid boss + role enforcement/balance — **deferred since v0.1.0-alpha**, full specs preserved
  (`.planning/todos/pending/*-DEFERRED.md`). These carry INV-4.
- Crit poise interrupt (POISE-01..03) — **deferred at v0.2.0-alpha close**, spec preserved.
- Camp-enemy FSM conversion, hero attack FSM / i-frames / parry, weapon/constellation crit,
  tiered poise, elemental telegraphs — v2 combat expansion (XCMB-01..06).
- Elemental resistance system (future).
- XP/levelling for players and enemies (future).
- Email password reset (needs external service).
- Maincloud — DROPPED 2026-07-09 (self-host pivot); prod deploy = self-hosted standalone.

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-13 after v0.2.0-alpha Combat Depth milestone close*
