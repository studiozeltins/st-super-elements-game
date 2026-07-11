# Project: super-elements

## Core Value

Turn the endless Genshin-style sandbox into a **retained PVPvE loop** with a real chase:
players pursue endless **Transcendence** power (installing scarce **Constellation Shards**
past C6), contest shards through **PVP theft** and **co-op raids**, with **no progress-wipe
churn** — the installed C0–C6 constellation base is a protected floor.

**One-liner:** A power chase where scarce shards buy real, permanent-floor power, PVP makes
that power worth stealing, and a co-op raid faucet lets any ganked player recover.

## Milestone

**Transcendence (shipped)** — layered the transcendence economy, shard risk, character roles,
and parties onto the live game. **Now building: Combat Depth (v0.2.0-alpha).**

## Current Milestone: v0.2.0-alpha Combat Depth

**Goal:** Replace the undodgeable per-tick contact drain with discrete, telegraphed,
DODGEABLE attacks (windup → strike → recovery) driven by ONE unit-agnostic,
server-authoritative attack state machine, plus a real per-character crit system and a
custom animation state machine layered on the same FSM.

**Target features:**
- Unit-agnostic `unit_attack` FSM (windup/strike/recovery) on the world tick; damage resolves
  once at the strike frame vs LIVE positions so players can dash out.
- Data-driven `ATTACKS` registry + per-archetype `UNIT_ATTACKS` lists (new attack = one entry,
  new unit = one list); shared client + server.
- Real per-character crit: `critRate`/`critDmg` on `CharacterDefinition`, replacing the client
  global `Math.random()<0.22`; `isCrit` added to `attackEnemies`/`attackRay`.
- Crit poise interrupt: a crit landing during a unit's windup adds poise → cancel/stagger.
- Custom animation state machine (idle/move/windup/strike/recovery) shared by hero + enemy
  meshes, per-attack clips, strike VFX on an `attack_strike` event table.
- Goliath v1 roster: `shieldDash` (lane), `leapSlam` (circle), `swordSwing` (cone),
  `swordSwirl` (circle). Goliath **contact drain deleted** — goliaths damage only via strikes.
- Camp enemies reuse the SAME machine with zero schema change (proves unit-agnosticism).

**Scope:** Enemies only. Heroes stay on the current client swing (no hero attack FSM this
milestone); the FSM is built so heroes CAN reuse it later with zero schema change. Crit stats
on characters ARE in scope (they modify the existing hero→enemy attack, not a hero FSM).

## Previous State

**Shipped: v0.1.0-alpha (2026-07-08)** — the transcendence economy is live end-to-end:
scarce-shard mint → install (BŪSTS) for real power → shards at risk on death/PVP → character
roles → invite-only parties. Merged to `master`, tagged `v0.1.0-alpha`.

**Deferred to a LATER milestone (not this one):** the raid boss (was Phase 6) and its role
enforcement + balance pass (was Phase 7). Until the raid faucet ships, **INV-4 is unsatisfied** —
a ganked, shard-poor player has no PVE recovery path yet. Reserved as deferred phases 6/7.
Specs preserved under `.planning/todos/pending/*-DEFERRED.md`.

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
| 2026-07-08 | Combat FSM built unit-agnostic but scoped enemies-only this milestone (heroes stay on client swing) | Ship the dodgeable-attack loop faster; heroes reuse the same table/registry later with zero schema change | — new |

## Out of Scope (shipped alpha v0.1.0-alpha)

- Raid boss (Phase 6) + role enforcement/balance (Phase 7) — **deferred to next milestone**,
  full specs preserved (`.planning/todos/pending/*-DEFERRED.md`). These carry INV-4.
- Elemental resistance system (future).
- XP/levelling for players and enemies (future).
- Email password reset (needs external service).
- Maincloud deploy of the transcendence schema — alpha shipped to local + `master`; the
  paused maincloud DB republish is a pending human action.

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
*Last updated: 2026-07-11 — Phase 5 (swordSwing → swordSwirl combo) complete: attack chaining + cone hitbox proven on the FSM spine (ATK-02/ATK-03); playtest-approved after 2 fix rounds*
