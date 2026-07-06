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
- [ ] **Phase 1: Constellation shard currency** - Mint 1 shard per C6-overflow dupe (replaces 800-gem refund)
- [ ] **Phase 2: Transcendence install** - Spend shards to transcend a C6 character past C6 for real power
- [ ] **Phase 3: Shards at risk** - Death loss + PVP steal + erosion order (transcend-- then C--)
- [ ] **Phase 4: Formalize character roles** - Tag every character tank/dps/healer/support
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

**Plans**: 2/4 plans executed
**UI hint**: yes

- [x] 01-01-PLAN.md — Pure `resolveDupeGrant` overflow helper + unit test (Nyquist wave 0)
- [x] 01-02-PLAN.md — Server: `transcendShards` column (4 mirror sites), wire helper into grantCharacter/pullBanner, remove 800-gem refund, snapshot keep-list
- [ ] 01-03-PLAN.md — Deploy: additive-migrate publish to local + regenerate bindings (gates client)
- [ ] 01-04-PLAN.md — Client: shard `◈` chip in Gacha + Character screens + prop threading + verify playtest

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

**Plans**: TBD
**UI hint**: yes

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

**Plans**: TBD
**UI hint**: yes

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

**Plans**: TBD
**UI hint**: yes

### Phase 5: Multiplayer party

**Goal**: Players can form a party of up to four, join by code, and see a live roster of each
member's active character and role.
**Depends on**: Phase 4
**Requirements**: REQ-multiplayer-party
**Success Criteria** (what must be TRUE):

  1. A player can create a party, share the join code (= party id), and others can join by
     code up to `RAID_PARTY_SIZE = 4`.

  2. Leaving empties membership cleanly and the party auto-disbands when the last member
     leaves; a disconnect cleans up membership.

  3. One identity cannot be in two parties or double-join.
  4. Two clients in a party both see the roster with each member's active character + role.

**Plans**: TBD
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
| 1. Constellation shard currency | 2/4 | In Progress|  |
| 2. Transcendence install | 0/TBD | Not started | - |
| 3. Shards at risk | 0/TBD | Not started | - |
| 4. Formalize character roles | 0/TBD | Not started | - |
| 5. Multiplayer party | 0/TBD | Not started | - |
| 6. Raid boss | 0/TBD | Not started | - |
| 7. Role enforcement + balance | 0/TBD | Not started | - |
