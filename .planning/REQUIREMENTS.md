# Requirements: super-elements — Transcendence

One requirement per build phase. Each is an agent-sized vertical slice (server + client +
tests + validation) ending in one atomic commit. Ordered by dependency. All requirements
are v1 (this milestone).

Suggested execution order (from source): `A → 0 → (1 → 2 → 3)` and in parallel `4 → 5`,
then `6 → 7`.

---

## Economy Rename (ECON)

### REQ-gem-rename — Gem naming unification

- **Phase:** A (DONE)
- **Depends on:** none (first phase)
- **Scope:** currency rename, mechanical only, no behavior change.
- **Description:** Rename every `primogem` → `gem` across server (`spacetimedb/src/index.ts`:
  column, `STARTING_PRIMOGEMS`→`STARTING_GEMS`, `KILL_REWARD_PRIMOGEMS`→`KILL_REWARD_GEMS`,
  all reducer bodies + comments), backup/restore scripts (`scripts/*.mjs` field key,
  `restorePlayers` reducer field), and client (regenerate bindings, all `.primogems` reads +
  UI labels "Primogems"→"Gems", `constants.ts` mirrors).

- **Acceptance:** repo-wide grep for `primogem` (case-insensitive) returns ZERO hits;
  `serverSync.test.ts` + gacha/economy tests updated and green; wipe validation on both envs
  (`--delete-data always`), regenerate bindings, build, playtest confirms `STARTING_GEMS`
  granted, kill/collect adds gems, gacha spends gems, no "primogem" in UI.

## Transcendence Spine (TRANS)

### REQ-lock-constants — Design lock + constants

- **Phase:** 0
- **Depends on:** none (builds on A's clean naming)
- **Scope:** constants only, no behavior change.
- **Description:** Add transcendence constants to `spacetimedb/src/index.ts` (near existing
  constellation constants) and any belonging in `enemyStats.ts`; mirror in client
  `src/game/data/constants.ts` / `constellations.ts`. Do NOT wire into logic yet. Finalize
  the locked tunables (see PROJECT.md).

- **Acceptance:** `serverSync.test.ts` extended to assert every new constant matches
  server-side; trivial unit test asserts constants present and in valid ranges; `pnpm test`

  + `pnpm build` green; no publish (no schema/logic change).

### REQ-shard-currency-mint — Constellation shard currency + mint on C6-overflow dupe

- **Phase:** 1
- **Depends on:** Phase 0
- **Scope:** shard currency, mint path.
- **Description:** Add `transcendShards: t.u32()` to `player` (default 0, additive migrate).
  In `grantCharacter`: when a dupe would exceed C6, increment
  `transcendShards += SHARD_PER_OVERFLOW_DUPE` instead of the 800-gem refund
  (remove/replace the `DUPLICATE_REFUND` path). Client: regenerate bindings; show shard
  balance in `CharacterScreen.tsx` / `GachaScreen.tsx`.

- **Acceptance:** pure-helper unit (extracted overflow logic): dupe of C6 char → shards += 1,
  gems unchanged; non-C6 char → constellation++ as before, no shard. Existing gacha/pity
  tests green. Publish local, regenerate, build; playtest: dupes of an already-C6 char raise
  shard count, no 800-gem refund occurs.

### REQ-transcend-install — Transcendence install + power scaling

- **Phase:** 2
- **Depends on:** Phase 1
- **Scope:** transcend levels, power scaling.
- **Description:** Add `transcendLevel: t.u32()` to `ownedCharacter` (default 0, cap
  `MAX_TRANSCEND_LEVEL`). New reducer `transcendCharacter({ characterId })`: require char is
  C6, require `transcendShards >= TRANSCEND_SHARD_COST(nextLevel)`, deduct shards, increment
  level, reject past cap. Extend healer scaling in `healParty`
  (`+transcendLevel * TRANSCEND_HEAL_STEP`). Client: extend damage multiplier in
  `createGame.ts` (`1 + activeConstellation*0.08 + transcendLevel*TRANSCEND_DAMAGE_STEP`);
  UI shows C6 + "T{n}" and an Install button gated by shard balance + cap.

- **Acceptance:** pure-math unit `transcendDamageMultiplier(constellation, transcend)`
  extends correctly (in `src/game/combat/`); server logic unit: install deducts
  `TRANSCEND_SHARD_COST(n)`, raises level, rejects when short on shards / at cap / char < C6;
  `serverSync.test.ts` green; playtest: install a level, damage rises, shard balance drops
  per cost curve.

### REQ-shard-risk — Shards at risk: death loss, PVP steal, erosion

- **Phase:** 3
- **Depends on:** Phase 2
- **Scope:** death penalty, PVP theft, erosion order.
- **Description:** Extract pure helper `applyDeathShardPenalty(player, activeOwnedChar)` →
  `{ shardsLost, erodedTranscend, erodedConstellation }`. Rules: if `transcendShards > 0` →
  `-= SHARD_DEATH_LOSS`; else if `transcendLevel > 0` → `transcendLevel--`; else if
  `constellation > 0` → `constellation--` (C6→C5 floor erosion). Wire into three death paths
  keeping the 1/3-gem spill: PVE death (`takeDamage`, worldTick player death) spills the
  shard as a ground collectible (gem-spill path + 1.2s grace, anyone can grab); PVP death
  (`attackPlayer`) applies penalty AND credits the shard to the killer
  (`killer.transcendShards += 1`). Client: shard lost/stolen toast + counter + steal-feed
  hint.

- **Acceptance:** pure unit for `applyDeathShardPenalty` across all branches (has shards /
  only transcend / only constellation / nothing); server logic: PVP kill transfers exactly 1
  shard to killer, PVE death creates no shard for anyone, erosion order respected; two-client
  playtest: PVP kill moves shard to killer; PVE death with 0 shards erodes transcend then a
  C-level.

## Co-op Spine (COOP)

### REQ-combat-roles — Formalize character roles

- **Phase:** 4
- **Depends on:** none (parallel with 1–3; merges after Phase 0)
- **Scope:** character role tagging.
- **Description:** Add `role: 'tank' | 'dps' | 'healer' | 'support'` to every character in
  `src/game/data/characters.ts` and mirror in server `CHARACTER_STATS`. Seed: healers
  (Marina, Nereida, Lapa, Rasa) = healer; high-HP non-healers (Glacia, Terron, Ignis, Petra)
  = tank; anemo utility (Aeris, Zefs) = support; rest = dps. Client: role badge in
  `CharacterSheet.tsx` / `CharacterScreen.tsx`. Store role server-side so the raid (Phase 6)
  can enforce it.

- **Acceptance:** unit: every character has a valid role; `serverSync.test.ts` covers the new
  field; `pnpm test` + `pnpm build`; publish if role stored server-side.

### REQ-multiplayer-party — Multiplayer party

- **Phase:** 5
- **Depends on:** Phase 4 (roles used in roster; party mechanics themselves only need Phase 0)
- **Scope:** party tables + reducers.
- **Description:** New public tables `party` (id, leaderIdentity, createdAt) and `partyMember`
  (partyId, identity, joinedAt). Reducers: `createParty`, `joinParty({ partyId })`,
  `leaveParty`, auto-disband when empty. Cap `RAID_PARTY_SIZE = 4` (name carefully to avoid
  collision with the existing 4-character personal party). Enforce one party per identity.
  Clean up membership on `clientDisconnected`. Client: party panel — create, show join code
  (= party id), join by code, roster with each member's active character + role.

- **Acceptance:** tests: create/join/leave/disband, cap enforcement, no double-join,
  disconnect cleanup; two clients form a party and both see the roster; publish local + build

  + playtest.

## Convergence: Raid (RAID)

### REQ-raid-boss — Raid boss PVE shard faucet, party-gated

- **Phase:** 6
- **Depends on:** Phase 2 (shards), Phase 5 (party)
- **Scope:** raid boss entity, summon, payout.
- **Description:** New raid boss entity (super-goliath tier or a dedicated `raidBoss` row
  reusing goliath movement/combat in `worldTick`), HP/damage tuned so a solo player cannot
  win (e.g. HP ~120k, contact ~250/s). `summonRaid` reducer callable by a party leader at an
  altar location; spawns one boss near the altar; despawn on kill or timeout. On death, mint
  `RAID_SHARD_PAYOUT` shards split among participating party members who dealt damage (track
  contributors like goliath damage tracking) — the recoverable faucet (INV-4). Client: render
  raid boss, summon button for leader, HP bar, payout feedback.

- **Acceptance:** tests: boss HP/damage constants present; payout splits `RAID_SHARD_PAYOUT`
  across N contributors deterministically; solo damage cannot kill within timeout (sanity
  math); playtest: party summons + kills boss together, each contributor receives shards;
  solo player cannot solo it in the timeout.

### REQ-raid-roles-balance — Role enforcement + balance + full validation

- **Phase:** 7
- **Depends on:** Phase 3, Phase 6
- **Scope:** raid role mechanics, balance pass, full-loop validation.
- **Description:** Give the raid boss role-rewarding mechanics (soft-gate): aggro locks to
  the highest-HP/tank contributor; enrage/ramp outpaces a party with no healer; heavy AoE
  punishes stacking. Balance pass: shard scarcity vs loss rate (active session nets roughly
  neutral-to-slightly-positive; ganked player recovers via ~1 raid); transcendence power vs
  enemy HP (C6+T10 must not trivialize camps; optional mild camp scaling); no death-spiral
  (whale vs fresh player — fresh player not permanently locked out).

- **Acceptance:** tests: enrage/aggro logic units; a "balance guard" test asserting key
  ratios (shard gain rate ≤ bound, transcend multiplier caps at a sane value); full
  multi-client playtest of the whole loop end to end (pull → C6 → shard → transcend → carry →
  PVP steal → raid recover); deploy to BOTH local and maincloud per migrate procedure (no
  `--delete-data`, then `seed_world` if needed).

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| REQ-gem-rename | Phase A | Done |
| REQ-lock-constants | Phase 0 | Pending |
| REQ-shard-currency-mint | Phase 1 | Complete |
| REQ-transcend-install | Phase 2 | Complete |
| REQ-shard-risk | Phase 3 | Complete |
| REQ-combat-roles | Phase 4 | Pending |
| REQ-multiplayer-party | Phase 5 | Pending |
| REQ-raid-boss | Phase 6 | Pending |
| REQ-raid-roles-balance | Phase 7 | Pending |

**Coverage:** 9/9 requirements mapped — no orphans, no duplicates.
