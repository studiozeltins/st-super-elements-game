# Milestones

## v0.1.0-alpha Transcendence (Shipped: 2026-07-08)

**Phases completed:** A + 0–5 (6 GSD phases, 23 plans, 28 tasks)
**Closeout:** override closeout — Phases 6 & 7 deferred out of scope (see Known Gaps).
**Git:** ~102 `feat(` commits, Phase A → alpha; 350 files, +49k LOC over the pre-Transcendence base.

**Key accomplishments:**

- **Two-tier economy** — renamed `primogems`→`gems` and added a scarce `transcendShards`
  currency minted 1-per-C6-overflow dupe (replacing the old 800-gem refund).
- **Transcendence install** — `owned_character.transcendLevel` + the `transcendCharacter`
  reducer (sole server-side gate for C6/cap/cost/ownership); transcend levels scale client
  damage and healer output. Rebranded in-game to **BŪSTS** (transcend) / **CIEŅA**
  (constellations) with a B1→B10 install tab, stat preview, two-step confirm, and star VFX.
- **Shards at risk** — `shard_drop` table + `applyDeathShardPenalty`: PVE death spills the
  shard as a grabbable ground collectible (1.2s grace), PVP death steals it to the killer,
  and at 0 shards the active character erodes (transcend-- then one C-level) with the C0–C6
  floor held. Verified end-to-end via two-client playtest.
- **Character roles** — intrinsic tank/dps/healer/support on all 17 characters (client +
  server `CHARACTER_STATS` mirror, INV-5 parity tests) with a Latvian role badge.
- **Multiplayer party** — `party`/`party_member`/`party_invite` tables + 5 invite-only
  reducers (invite/request/accept/decline/leave) with authz, cap 4 (`RAID_PARTY_SIZE`),
  oldest-joined leader succession, disband-when-empty, disconnect-persistent membership;
  live roster UI. Full suite 384 tests + build green.
- **Design discipline** — pure dependency-free helpers extracted test-first before every
  reducer wiring; all schema changes additive migrate-publishes (zero data loss on local).

### Known Gaps (deferred, override closeout)

- **REQ-raid-boss** (Phase 6) — party-summoned raid boss + `RAID_SHARD_PAYOUT` split. Not
  built. INV-4 (a ganked non-payer recovers via the raid faucet) is therefore **not yet
  satisfied** — the recovery half of the loop ships in the next milestone.
- **REQ-raid-roles-balance** (Phase 7) — raid role soft-gates, balance pass, full end-to-end
  loop validation, maincloud deploy. Not built.
- Specs preserved under `.planning/todos/pending/*-DEFERRED.md`.

### Deferred backlog items (acknowledged at close 2026-07-08)

| Category | Item | Status |
|----------|------|--------|
| phase | phase-6-raid-boss | deferred to next milestone |
| phase | phase-7-role-enforcement-balance | deferred to next milestone |
| game | boost-orbit-v2-paths-shapes | pending backlog |
| ui | ciena-star-restyle | pending backlog |
| game | expand-transcend-scaling | pending backlog |

---
