# Transcendence Loop — Phased Build Plan

Goal: turn the endless sandbox into a PVPvE loop with a real chase (power past C6),
scarce stakes (constellation shards), meaningful PVP (steal shards), co-op content
(party + raid boss), and roles that matter.

Each phase is agent-sized: one vertical slice, server + client + tests + validation,
ends in one atomic commit. Phases are ordered by dependency — do not start a phase
until its `Depends on` phases are merged.

---

## The loop this builds

```
pull gacha -> build roster -> grind each char to C6           (early game)
C6 reached -> every further dupe mints 1 SHARD (rare)         (mid game)
install shard -> Transcend past C6 (C7+, real power)          (endless chase)
open world PVP-on -> your carried shards ride at risk
death (PVE/PVP) -> lose 1/3 gems + drop 1 shard;
    no shards -> erode active char (transcend--, then C6->C5)
    PVP killer STEALS the dropped shard
party up -> RAID BOSS (needs tank+healer+dps) -> big shard payout (PVE faucet)
parties gang the whale -> drain shards -> whale must defend
```

## Design invariants (do not violate)

1. **Installed base constellation C0–C6 is the protected floor in normal PVE.** Only
   the transcendence layer (and, as last-resort erosion, one C-level) is ever lost.
2. **Shards must be scarce.** They come only from: dupes of an already-C6 character,
   PVP theft, and raid-boss payout. Never a cheap/infinite faucet.
3. **Shards must buy real power (transcendence).** If they were pure insurance the loop
   is hollow. Power is what makes theft worth a fight.
4. **A ganked non-payer must be able to recover** shards via the raid faucet, or the
   loop becomes a churn machine.
5. **Keep client/server number mirrors in sync.** `serverSync.test.ts` guards this;
   every data change touches both sides + the test.

## Locked decisions

- **PVE death shard → ground collectible.** On PVE death the dropped shard spills as a
  ground pickup (reuse the gem-drop spill + the 1.2s pickup grace so a nearby camp cannot
  instantly vacuum it). Anyone can grab it — including the dying player on recovery. PVP
  death still transfers the shard directly to the killer.
- **Branch:** all transcendence work lands on `feat/transcendence`, cut from `master`
  (the real trunk that holds the game; `main` is a stale Initial-commit branch).
- **Naming unification:** rename every `primogem` → `gem` (Phase A). Two-tier economy:
  `gems` = common/trivial currency (gacha fuel), `shards` = rare transcendence currency.
- **Wipe, don't migrate.** The `primogems`→`gems` column rename is a destructive schema
  op. We accept a full data wipe on BOTH local and maincloud (`--delete-data always`).
  No migration reducer. Do this once in Phase A before any real players matter.

## Naming conventions (use verbatim — this is the consistency contract)

Common currency (renamed from primogem):

| Concept | Identifier |
|---|---|
| Wallet balance (player column) | `gems` (u32) |
| Ground drop table | `gem_drop` / accessor `gemDrop` |
| Starting grant | `STARTING_GEMS` |
| Kill reward base | `KILL_REWARD_GEMS` |
| Spill helper | `spillGems` |
| Death spill fractions | `PVE_DEATH_SPILL`, `PVP_DEATH_SPILL` (unchanged) |
| Constants / mirrors | `GEM_*`, `gemsFromKills`, `gemsCollected`, `src/game/data/gem*.ts` (unchanged) |

Transcendence currency (new):

| Concept | Identifier |
|---|---|
| Shard balance (player column) | `transcendShards` (u32) |
| Ground drop table (PVE death drop) | `shard_drop` / accessor `shardDrop` |
| Spill helper | `spillShards` |
| Collectible check | reuse `gemIsCollectible` (already generic: droppedAt/now/delay) |
| Per-character transcend level | `ownedCharacter.transcendLevel` (u32) |
| Constants | `SHARD_*`, `TRANSCEND_*` (see tunables) |
| Client mirror | `src/game/data/shardDrops.ts` |

User-facing nouns: **"Gems"** (common) and **"Constellation Shards"** (rare). Code root
`shard`/`Shard`/`SHARD` everywhere — never "fragment"/"crystal". Shards are NOT vacuumable
by camps (no `carriedShards` field).

## Tunable numbers (LOCKED in Phase 0, referenced everywhere after)

| Constant | Proposed | Meaning |
|---|---|---|
| `MAX_TRANSCEND_LEVEL` | 10 | levels available past C6 |
| `TRANSCEND_DAMAGE_STEP` | 0.05 | +5% dmg per transcend level (endless, smaller than C's 8%) |
| `TRANSCEND_HEAL_STEP` | 0.08 | +8% heal per transcend level (healers) |
| `TRANSCEND_SHARD_COST(n)` | `n` | installing level n costs n shards (1,2,3… → deep transcend expensive) |
| `SHARD_PER_OVERFLOW_DUPE` | 1 | shards minted per dupe of a C6 char (replaces 800 refund) |
| `SHARD_DEATH_LOSS` | 1 | shards dropped on any death |
| `RAID_SHARD_PAYOUT` | 6 | shards a raid boss drops, split among party |
| erosion order | transcend-- then C-- | when 0 shards, active char loses transcend level first, then a constellation level |

All numbers are proposals — the Phase 0 agent finalizes and writes them into
`spacetimedb/src/*.ts` + client `src/game/data/constants.ts` and NOTHING else changes
behavior in Phase 0.

---

## Phase A — Gem naming unification (rename primogem → gem, wipe both envs)

**Depends on:** none. This is the FIRST phase — do it before Phase 0 so all later work
builds on clean naming.

Pure mechanical rename, no behavior change. One atomic commit.

**Server (`spacetimedb/src/index.ts`):**
- `player.primogems` column → `gems`.
- `STARTING_PRIMOGEMS` → `STARTING_GEMS`; `KILL_REWARD_PRIMOGEMS` → `KILL_REWARD_GEMS`.
- All `primogems` in reducer bodies (`spillGems`, `attackPlayer`, `takeDamage`,
  `fallToDeath`, `pullBanner`, `collectGem`, `seedPlayer`, worldTick death, restore
  reducers) → `gems`.
- Comments mentioning "primogems" → "gems".

**Backup/restore + scripts (do NOT miss these — they key on the column name):**
- `scripts/*.mjs` (backup/restore): field key `primogems` → `gems`.
- `restorePlayers` reducer field → `gems`.

**Client:**
- Regenerate bindings (`pnpm run spacetime:generate`) — the `player` type field becomes
  `gems`.
- Update every `.primogems` read and UI label ("Primogems" → "Gems") in
  `CharacterScreen.tsx`, `GachaScreen.tsx`, `App.tsx`, and any HUD/wallet component.
- `src/game/data/constants.ts` — rename any `*_PRIMOGEMS` mirror constants.

**Tests:** update `serverSync.test.ts` and gacha/economy tests to the new names; all green.
Grep the whole repo for `primogem` (case-insensitive) — must return ZERO hits after.

**Validation (this is the wipe):**
1. `spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb --server local --delete-data always --yes`
2. `spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb --server maincloud --delete-data always --yes`
3. `pnpm run spacetime:generate` → `pnpm build`
4. Playtest: create account, confirm `STARTING_GEMS` granted, kill/collect adds gems,
   gacha spends gems. No "primogem" anywhere in UI.

**Commit:** `refactor(economy): rename primogems to gems`

---

## Phase 0 — Design lock + constants (no behavior change)

**Depends on:** none.

**Server:** add the constants above to `spacetimedb/src/index.ts` (near existing
constellation constants ~line 61-73) and any that belong in `enemyStats.ts`. Do NOT
wire them into logic yet.

**Client:** mirror the same constants in `src/game/data/constants.ts` /
`src/game/data/constellations.ts`.

**Tests:**
- extend `src/game/data/__tests__/serverSync.test.ts` to assert every new constant
  matches server-side (add a small exported map on the server for the test to import,
  matching the existing sync pattern).
- a trivial unit test asserting the constants are present and in valid ranges.

**Validation:** `pnpm test` green; `pnpm build` green. No publish needed (no schema/logic).

**Commit:** `feat(transcend): lock constants for transcendence system`

---

## Phase 1 — Constellation Shard currency + mint on overflow dupe

**Depends on:** Phase 0.

**Server (`index.ts`):**
- Add `transcendShards: t.u32()` to the `player` table (default 0). Additive column →
  plain migrate publish, no data wipe.
- In `grantCharacter` (~1545-1561): when a dupe would exceed C6, instead of the 800-gem
  refund (currently at ~1628/1644/1677), increment `player.transcendShards +=
  SHARD_PER_OVERFLOW_DUPE`. Remove/replace the `DUPLICATE_REFUND` path (keep the constant
  if referenced elsewhere; otherwise delete).

**Client:**
- Regenerate bindings (`pnpm run spacetime:generate`).
- Show shard balance somewhere in `CharacterScreen.tsx` / gacha result
  (`GachaScreen.tsx`) — a small "Shards: N" readout.

**Tests:**
- server-side unit (or a `combatMath`-style pure helper extracted from the overflow
  logic) proving: pulling a dupe of a C6 char → shards += 1, gems unchanged; pulling a
  non-C6 char → constellation++ as before, no shard.
- keep existing gacha/pity tests green.

**Validation:**
1. `spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb --server local --yes`
2. regenerate bindings, `pnpm build`
3. Playtest (webapp-testing skill): pull dupes of an already-C6 char, confirm shard
   count rises and no 800-gem refund occurs.

**Commit:** `feat(transcend): mint constellation shards from C6 overflow dupes`

---

## Phase 2 — Transcendence install + power scaling

**Depends on:** Phase 1.

**Server (`index.ts`):**
- Add `transcendLevel: t.u32()` to `ownedCharacter` (default 0, cap `MAX_TRANSCEND_LEVEL`).
- New reducer `transcendCharacter({ characterId })`: require char is C6, require
  `player.transcendShards >= TRANSCEND_SHARD_COST(nextLevel)`, deduct shards, increment
  `transcendLevel`. Reject past cap.
- Extend healer scaling in `healParty` (~1490-1492): heal multiplier adds
  `transcendLevel * TRANSCEND_HEAL_STEP`.

**Client:**
- Regenerate bindings.
- Extend damage multiplier in `createGame.ts` (~391-393, used at 417 & 485):
  `constellationDamageMultiplier = 1 + activeConstellation*0.08 + transcendLevel*TRANSCEND_DAMAGE_STEP`.
- UI: in `CharacterSheet.tsx` / `ConstellationRing.tsx` show C6 + "T{n}" and an Install
  button that calls `transcendCharacter`, gated by shard balance + cap.

**Tests:**
- pure-math unit: `transcendDamageMultiplier(constellation, transcend)` extends correctly
  (extract to `src/game/combat/` so it is dependency-free like `comboSystem.ts`).
- server logic unit: install deducts `TRANSCEND_SHARD_COST(n)` shards, raises level,
  rejects when short on shards or at cap, rejects if char < C6.
- `serverSync.test.ts` still green.

**Validation:** publish local, regenerate, build, playtest: earn shards, install a
transcend level, confirm damage numbers rise and shard balance drops by the cost curve.

**Commit:** `feat(transcend): install shards to transcend characters past C6`

---

## Phase 3 — Shards at risk: death loss, PVP steal, erosion

**Depends on:** Phase 2.

**Server (`index.ts`):**
- Extract a pure helper `applyDeathShardPenalty(player, activeOwnedChar)` →
  `{ shardsLost, erodedTranscend, erodedConstellation }` for testability. Rules:
  - if `transcendShards > 0`: `transcendShards -= SHARD_DEATH_LOSS`.
  - else if active char `transcendLevel > 0`: `transcendLevel--`.
  - else if active char `constellation > 0`: `constellation--` (the C6→C5 floor erosion).
- Wire into the three death paths, keeping the existing 1/3-gem spill:
  - PVE death in `takeDamage` (~1042) and worldTick player death (~2230-2248): apply
    penalty; the dropped shard spills as a ground collectible (reuse the gem-spill path +
    1.2s pickup grace) so a nearby camp cannot instantly vacuum it. Anyone can grab it.
  - PVP death in `attackPlayer` (~933-944): apply penalty AND credit the dropped shard to
    the killer (`killer.transcendShards += 1`). This is the theft.

**Client:** regenerate bindings; surface a "shard lost / stolen" toast + shard counter
update; damage-number/feed hint on steal.

**Tests:**
- pure unit for `applyDeathShardPenalty` across all branches (has shards / only transcend
  / only constellation / nothing).
- server logic: PVP kill transfers exactly 1 shard to killer; PVE death does not create a
  shard for anyone; erosion order respected.

**Validation:** publish local, build, playtest two clients: kill a carrier in PVP →
confirm shard moves to killer; die to PVE with 0 shards → confirm active char erodes
transcend then a C-level.

**Commit:** `feat(transcend): shards drop on death and transfer to PVP killer`

---

## Phase 4 — Formalize roles

**Depends on:** none (can run parallel with 1-3, but merge after 0).

**Data:** add `role: 'tank' | 'dps' | 'healer' | 'support'` to every character in
`src/game/data/characters.ts` and mirror in server `CHARACTER_STATS` (`index.ts:38-60`).
Seed from current design: healers (Marina, Nereida, Lapa, Rasa) = healer; high-HP
non-healers (Glacia, Terron, Ignis, Petra) = tank; anemo utility (Aeris, Zefs) = support;
rest = dps.

**Client:** show role badge in `CharacterSheet.tsx` / `CharacterScreen.tsx`.

**Tests:** unit — every character has a valid role; `serverSync.test.ts` covers the new
field.

**Validation:** `pnpm test` + `pnpm build`; publish (schema touched if role stored server
side — if role is data-only client-side, no publish). Prefer server-side role so the raid
(Phase 6) can enforce it.

**Commit:** `feat(roles): tag every character with a combat role`

---

## Phase 5 — Multiplayer party

**Depends on:** Phase 4 (roles used by raid; party itself only needs 0).

**Server (`index.ts`):**
- New tables `party` (id, leaderIdentity, createdAt) and `partyMember`
  (partyId, identity, joinedAt), public.
- Reducers: `createParty` (→ returns via table row), `joinParty({ partyId })`,
  `leaveParty`, auto-disband when empty. Cap `PARTY_SIZE = 4` players (distinct from the
  existing 4-character personal party — rename carefully to avoid collision; call this
  `RAID_PARTY_SIZE`). Enforce one party per identity.
- Clean up membership on disconnect (`clientDisconnected`).

**Client:** party panel — create, show a join code (= party id), join by code, roster with
each member's active character + role.

**Tests:** create/join/leave/disband; cap enforcement; no double-join; disconnect cleanup.

**Validation:** two clients form a party, both see the roster; publish local + build +
playtest.

**Commit:** `feat(party): player parties with create/join/leave`

---

## Phase 6 — Raid boss (PVE shard faucet, party-gated)

**Depends on:** Phase 2 (shards), Phase 5 (party).

**Server:**
- New raid boss entity — simplest path is a super-goliath size tier or a dedicated
  `raidBoss` row reusing the goliath movement/combat passes in `worldTick`. HP + damage
  tuned so a solo player cannot win (needs a party): e.g. HP ~120k, contact ~250/s.
- Summon flow: a `summonRaid` reducer callable by a party leader at an altar location
  (reuse safe-zone/altar coords), spawns one boss near the altar; despawn on kill or
  timeout.
- Payout: on death, mint `RAID_SHARD_PAYOUT` shards split among participating party
  members who dealt damage (track contributors like existing goliath damage tracking).
  This is the recoverable faucet from invariant #4.

**Client:** render the raid boss (reuse goliath renderer/scale), a summon button for party
leader, HP bar, payout feedback.

**Tests:** boss HP/damage tuning constants present; payout splits `RAID_SHARD_PAYOUT`
across N contributors deterministically; solo damage cannot realistically kill within
timeout (sanity math test).

**Validation:** publish local, build, playtest: party summons, kills boss together, each
contributor receives shards. Confirm a solo player cannot solo it in the timeout.

**Commit:** `feat(raid): party-summoned raid boss that drops constellation shards`

---

## Phase 7 — Role enforcement in raid + balance + full validation

**Depends on:** Phases 3, 6.

**Server:** give the raid boss role-rewarding mechanics (soft-gate, not hard-lock):
- aggro locks to the highest-HP/tank contributor when present (tank matters);
- an enrage/ramp that outpaces a party with no healer (healer matters);
- heavy AoE that punishes stacking (positioning matters).

**Balance pass (the make-or-break tuning):**
- shard scarcity vs loss rate: a normal session should net roughly neutral-to-slightly-
  positive shards for an active player; a ganked player recovers via ~1 raid.
- transcendence power vs enemy HP: ensure C6+T10 does not trivialize camps into
  zero-threat; consider mild camp scaling if needed (optional counterweight).
- verify no death-spiral: simulate a whale vs a fresh player and confirm the fresh player
  is not permanently locked out.

**Tests:** enrage/aggro logic units; a "balance guard" test asserting key ratios
(shard gain rate ≤ some bound, transcend multiplier caps at a sane value).

**Validation:** full multi-client playtest via webapp-testing: run the whole loop end to
end (pull → C6 → shard → transcend → carry → PVP steal → raid recover). Deploy to
BOTH local and maincloud per the CLAUDE.md migrate procedure (publish without
`--delete-data`, then `spacetime call ... seed_world` if new spawns are seeded on init).

**Commit:** `feat(raid): role-driven raid mechanics + transcendence balance pass`

---

## Cross-cutting rules for every phase

- **Package manager:** `pnpm`, never `npm`.
- **Deploy per phase:** `spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb
  --server local --yes` → `pnpm run spacetime:generate` → `pnpm build`. Push to
  `maincloud` only at Phase 7 (or when a phase is user-facing on prod), never
  `--delete-data` on a DB with real accounts.
- **Schema changes are additive** (new columns/tables) so migrate-publish keeps data.
  Never drop a table with rows without clearing it first. EXCEPTION: Phase A is a
  deliberate full wipe (`--delete-data always`) on both envs for the column rename.
- **Tests:** pure math → dependency-free modules under `src/game/combat/` or
  `src/game/data/` (vitest). Reducer logic → extract pure helpers where possible so they
  unit-test without a running DB. Always keep `serverSync.test.ts` green.
- **Validation:** every phase ends with a real playtest of the new slice, not just green
  tests. Use the webapp-testing (Playwright) skill.
- **Commits:** one atomic commit per phase, on the `feat/transcendence` branch (cut from
  `master`, the real trunk).

## Suggested execution order

`A → 0 → (1 → 2 → 3)  and in parallel  4 → 5`, then `6 → 7`.
Phase A (rename + wipe) goes first so everything after builds on clean naming.
Phases 1-3 are the transcendence spine; 4-5 are the co-op spine; they converge at 6.
