# Roadmap: super-elements — Transcendence

## Overview

One milestone, **Transcendence**, layered onto the live game. Phase A (the primogems→gems
rename) already shipped. The remaining work runs on two spines that converge: the
**transcendence spine** (0 → 1 → 2 → 3) mints scarce shards, spends them for real power past
C6, then puts that power at risk on death and PVP; the **co-op spine** (4 → 5) tags roles and
forms parties. They meet at the **raid boss** (6) — the party-gated shard faucet that lets a
ganked player recover — and finish with **role enforcement + a full balance/validation pass**
(7). The result is a retained PVPvE loop with no progress-wipe churn: installed C0–C6 is a
protected floor.

## Phases

**Phase Numbering:**
Human-facing labels are A and 0–7 (matching the ingested build plan). Phase A is complete.
`/gsd-plan-phase 0` resolves to "Lock transcendence constants". Phases execute along two
parallel spines that converge at Phase 6.

- [x] **Phase A: Gem naming unification** - Rename primogems→gems (SHIPPED, commit `8236de4`)
- [x] **Phase 0: Lock transcendence constants** - Add + mirror all `SHARD_*` / `TRANSCEND_*` constants, no logic (completed 2026-07-06)
- [x] **Phase 1: Constellation shard currency** - Mint 1 shard per C6-overflow dupe (replaces 800-gem refund) (completed 2026-07-06)
- [x] **Phase 2: Transcendence install** - Spend shards to transcend a C6 character past C6 for real power (completed 2026-07-06)
- [x] **Phase 3: Shards at risk** - Death loss + PVP steal + erosion order (transcend-- then C--) (completed 2026-07-07)
- [x] **Phase 4: Formalize character roles** - Tag every character tank/dps/healer/support (completed 2026-07-07)
- [ ] **Phase 5: Multiplayer party** - Create/join/leave parties with a live role roster
- [ ] **Phase 6: Raid boss** - Party-summoned boss that drops shards (the recoverable faucet)
- [ ] **Phase 7: Role enforcement + balance** - Raid role mechanics + balance pass + full-loop validation

## Phase Details

### Phase A: Gem naming unification

**Status**: COMPLETE (shipped — commit `8236de4`)
**Goal**: The whole codebase speaks one currency name — `gems` — so every later phase builds
on clean naming.
**Depends on**: Nothing (first phase)
**Requirements**: REQ-gem-rename
**Success Criteria** (what must be TRUE):

  1. Repo-wide grep for `primogem` (case-insensitive) returns zero hits.
  2. A player is granted `STARTING_GEMS`; kills/collections add gems; gacha spends gems.
  3. No "Primogem" appears anywhere in the UI — only "Gems".
  4. `serverSync.test.ts` + gacha/economy tests are green with the new names.

**Plans**: Complete

### Phase 0: Lock transcendence constants

**Goal**: Every transcendence tunable exists, is name-locked, and is mirrored identically on
client and server — ready to wire into logic later.
**Depends on**: Phase A (clean naming)
**Requirements**: REQ-lock-constants
**Success Criteria** (what must be TRUE):

  1. All `SHARD_*` / `TRANSCEND_*` constants exist server-side with their locked values
     (`MAX_TRANSCEND_LEVEL=10`, `TRANSCEND_DAMAGE_STEP=0.05`, etc.).

  2. `serverSync.test.ts` asserts every new constant matches its client mirror.
  3. A unit test confirms constants are present and within valid ranges.
  4. `pnpm test` and `pnpm build` are green; no publish is needed (no schema/logic change).

**Plans**: 1/1 plans complete

- [x] 00-01-PLAN.md — Add + mirror all SHARD_*/TRANSCEND_* constants + TRANSCEND_SHARD_COST helper, sync test, range unit test

### Phase 1: Constellation shard currency

**Goal**: A dupe of an already-C6 character mints a scarce shard instead of a gem refund, and
the player can see their shard balance.
**Depends on**: Phase 0
**Requirements**: REQ-shard-currency-mint
**Success Criteria** (what must be TRUE):

  1. Pulling a dupe of an already-C6 character raises `transcendShards` by 1 and leaves gems
     unchanged (no 800-gem refund).

  2. Pulling a dupe of a non-C6 character still raises its constellation and mints no shard.
  3. The player's shard balance is visible in the Character and Gacha screens.
  4. Existing gacha/pity tests remain green; the overflow logic has a pure-helper unit test.

**Plans**: 4/4 plans complete

- [x] 01-04-PLAN.md

**UI hint**: yes

- [x] 01-01-PLAN.md — Pure `resolveDupeGrant` overflow helper + unit test (Nyquist wave 0)
- [x] 01-02-PLAN.md — Server: `transcendShards` column (4 mirror sites), wire helper into grantCharacter/pullBanner, remove 800-gem refund, snapshot keep-list
- [x] 01-03-PLAN.md — Deploy: additive-migrate publish to local + regenerate bindings (gates client)
- [~] 01-04-PLAN.md — Client: shard `◈` chip in Gacha + Character screens + prop threading (done, build green); verify playtest PENDING

### Phase 2: Transcendence install

**Goal**: A player can spend shards to transcend a C6 character past C6, gaining real,
observable power (damage; heal for healers).
**Depends on**: Phase 1
**Requirements**: REQ-transcend-install
**Success Criteria** (what must be TRUE):

  1. Installing a transcend level on a C6 character deducts `TRANSCEND_SHARD_COST(n)` shards
     and raises its `transcendLevel`.

  2. Install is rejected when the character is below C6, at `MAX_TRANSCEND_LEVEL`, or the
     player is short on shards.

  3. A transcended character deals more damage (and heals more, for healers) in play.
  4. The UI shows "C6 + T{n}" and an Install button gated by shard balance and the cap.

**Plans**: 5/5 plans complete
**UI hint**: yes

- [x] 02-01-PLAN.md — Pure helpers test-first: `resolveTranscendInstall` + `transcendDamageMultiplier` + units (Wave 0)
- [x] 02-02-PLAN.md — Server: additive `owned_character.transcendLevel` column + `transcendCharacter` reducer + `healParty` transcend scaling
- [x] 02-03-PLAN.md — [BLOCKING] Additive publish to local + regenerate bindings (gates client)
- [x] 02-04-PLAN.md — Client bridge: damage multiplier + `setActiveTranscend` (createGame) + `transcendById`/feed/callback/props (App.tsx)
- [x] 02-05-PLAN.md — UI: gated Install control + `C6 · T{n}` badge on CharacterScreen + install playtest

### Phase 3: Shards at risk

**Goal**: Carried shards become a real stake — death drops them, a PVP killer steals them,
and with no shards the active character erodes in the locked order.
**Depends on**: Phase 2
**Requirements**: REQ-shard-risk
**Success Criteria** (what must be TRUE):

  1. On PVE death the shard spills as a ground collectible (gem-spill path + 1.2s grace) that
     anyone — including the recovering owner — can grab.

  2. On PVP death the killer receives exactly 1 shard (theft), and the victim loses it.
  3. With 0 shards, death erodes the active character in order: transcend level first, then a
     constellation level (C6→C5) — the C0–C6 floor is never breached below that.

  4. The player sees a shard lost/stolen toast, an updated counter, and a steal-feed hint.

**Plans**: 5/5 plans complete
**UI hint**: yes

- [x] 03-01-PLAN.md — Pure `applyDeathShardPenalty` helper + cross-import unit test (Nyquist Wave 0)
- [x] 03-02-PLAN.md — Server: `shard_drop` table + `spillShards` + `collectShard`, wire penalty into 3 death paths (keep gem spill, PVP credits `shardsLost`)
- [x] 03-03-PLAN.md — [BLOCKING] Additive migrate-publish to local + regenerate bindings (gates client)
- [x] 03-04-PLAN.md — Client: purple shard-drop renderer + subscribe/bridge + lost/stolen toast + counter loss/gain flash
- [x] 03-05-PLAN.md — Validation: suite + build green, two-client playtest, PROGRESS.md tracker update

### Phase 4: Formalize character roles

**Goal**: Every character carries a server-visible combat role (tank/dps/healer/support) that
the raid can later enforce.
**Depends on**: Phase 0 (merges after 0; runs parallel to 1–3)
**Requirements**: REQ-combat-roles
**Success Criteria** (what must be TRUE):

  1. Every character has exactly one valid role, seeded per the plan (healers, tanks,
     supports, dps).

  2. The role is stored server-side (mirrored in `CHARACTER_STATS`) and covered by
     `serverSync.test.ts`.

  3. A role badge is visible on the character sheet / character screen.
  4. `pnpm test` and `pnpm build` are green.

**Plans**: 2/2 plans complete

- [x] 04-01-PLAN.md — Role data mirror (client + server CHARACTER_STATS) + serverSync parity tests + additive local publish (Wave 1)
- [x] 04-02-PLAN.md — Role badge UI: --role-* tokens + badge on CharacterScreen/CharacterSheet (Wave 2)

**UI hint**: yes

### Phase 5: Multiplayer party

**Goal**: Players can form a party of up to four by invite / ask-to-join (invite-only, no join
codes — CONTEXT D-01), and see a live roster of each member's active character and role.
**Depends on**: Phase 4
**Requirements**: REQ-multiplayer-party
**Success Criteria** (what must be TRUE):

  1. A player can invite another player (or ask to join theirs) by tapping them in the
     online-players list; the recipient accepts, forming a party up to `RAID_PARTY_SIZE = 4`
     (CONTEXT D-01/D-02/D-03).

  2. Leaving promotes the oldest-joined member when the leader leaves and disbands (party +
     pending invites) only when the last member leaves; a disconnect PERSISTS membership and
     shows the member offline (CONTEXT D-04/D-05).

  3. One identity cannot be in two parties or double-join (enforced at accept time — D-06).
  4. Two clients in a party both see the roster with each member's active character + role.

**Plans**: 5/6 plans executed
**Wave 1**

- [x] 05-01-PLAN.md — Wave 0: RAID_PARTY_SIZE constant + parity + pure partyRules.ts helpers (nextLeader, canAccept) + tests
- [x] 05-02-PLAN.md — Server: party/party_member/party_invite tables + 5 reducers (invite/request/accept/decline/leave) with authz, cap, promotion, disband, state-based invalidation

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 05-03-PLAN.md — [BLOCKING] Additive migrate-publish to local + regenerate bindings

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 05-04-PLAN.md — Client: subscribe + reducer wiring + online-players list + slide-out PlayerSheet + HUD party chip

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 05-05-PLAN.md — Client: invite toast (10s) + missed-invites (Settings) + party roster (role/crown/online)

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 05-06-PLAN.md — Validation: full suite + build + two-client playtest + PROGRESS.md update

**UI hint**: yes

### Phase 6: Raid boss

**Goal**: A party leader can summon a raid boss that no solo player can beat, and killing it
splits a shard payout among contributors — the recoverable faucet (INV-4).
**Depends on**: Phase 2, Phase 5
**Requirements**: REQ-raid-boss
**Success Criteria** (what must be TRUE):

  1. A party leader can summon a raid boss at the altar; it renders with an HP bar and
     despawns on kill or timeout.

  2. The boss is tuned so a solo player cannot kill it within the timeout.
  3. On death, `RAID_SHARD_PAYOUT` shards are split deterministically among party members who
     dealt damage; each contributor receives shards.

  4. A ganked, shard-poor player can rejoin a party and recover shards through a raid.

**Plans**: TBD
**UI hint**: yes

### Phase 7: Role enforcement + balance

**Goal**: The raid rewards proper roles, the whole economy is balanced against churn, and the
full loop is validated end-to-end on both environments.
**Depends on**: Phase 3, Phase 6
**Requirements**: REQ-raid-roles-balance
**Success Criteria** (what must be TRUE):

  1. The raid boss soft-gates roles: aggro locks to the highest-HP/tank contributor, enrage
     outpaces a healer-less party, and heavy AoE punishes stacking.

  2. A balance-guard test asserts key ratios (shard gain rate ≤ a bound; transcend multiplier
     caps at a sane value); C6+T10 does not trivialize camps.

  3. A ganked player recovers to roughly neutral via ~1 raid; a fresh player is never
     permanently locked out by a whale (no death spiral).

  4. A full multi-client playtest completes the whole loop (pull → C6 → shard → transcend →
     carry → PVP steal → raid recover), deployed to both local and maincloud via the migrate
     procedure (no `--delete-data`).
**Plans**: TBD

## Progress

**Execution Order:**

```
A ─► 0 ─► 1 ─► 2 ─► 3 ─┐
         └► 4 ─► 5 ────┴► 6 ─► 7
```

Phase A shipped first. The transcendence spine (0→1→2→3) and the co-op spine (4→5) run in
parallel after Phase 0; they converge at Phase 6 and finish at Phase 7.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| A. Gem naming unification | 1/1 | Complete | 2026-07 (commit `8236de4`) |
| 0. Lock transcendence constants | 1/1 | Complete   | 2026-07-06 |
| 1. Constellation shard currency | 4/4 | Complete    | 2026-07-06 |
| 2. Transcendence install | 5/5 | Complete    | 2026-07-06 |
| 3. Shards at risk | 5/5 | Complete    | 2026-07-07 |
| 4. Formalize character roles | 2/2 | Complete   | 2026-07-07 |
| 5. Multiplayer party | 5/6 | In Progress|  |
| 6. Raid boss | 0/TBD | Not started | - |
| 7. Role enforcement + balance | 0/TBD | Not started | - |
