# Roadmap: super-elements

## Milestones

- 🚧 **v0.2.0-alpha Combat Depth** — Phases 1–7 (active, started 2026-07-08)
- ✅ **v0.1.0-alpha Transcendence** — Phases A, 0–5 (shipped 2026-07-08)
- 🔒 **Reserved for a later milestone** — Raid boss + role enforcement/balance (deferred out of alpha; carries INV-4). NOT part of Combat Depth.

---

## 🚧 v0.2.0-alpha Combat Depth (active)

**Milestone goal:** Replace the undodgeable per-tick goliath contact drain with discrete,
telegraphed, DODGEABLE attacks (windup → strike → recovery) driven by ONE unit-agnostic,
server-authoritative attack FSM — plus a real per-character server-rolled crit system and a
crit-driven poise interrupt. Enemies only; the FSM is built so heroes reuse it later with zero
schema change.

**Granularity:** Standard (7 phases — forced, dependency-ordered: the interrupt cannot precede
crit, and one attack shape is proven before the rest multiply). The crit work is split across
Phases 1–3 (stats/foundation → server-authoritative resolution on enemies → PVP) because the
discuss-phase chose full server-authoritative base damage (Option B), which grew it past a single
phase; the four attack shapes + interrupt follow in Phases 4–7.

**Coverage:** 27/27 v1 requirements mapped, 0 unmapped.

### Cross-Cutting Constraints (apply to EVERY phase)

- **Additive schema only.** New columns/tables; migrate-publish, never `--delete-data` on a DB
  with real accounts. New tables start EMPTY on a live (migrated) DB — so each phase's
  done-criteria needs a **migrated-DB (not fresh-seed) verification**, and the FSM must lazily
  create attack state by iterating the *unit* tables, never the empty attack table.
- **Server-authoritative.** The server owns all combat truth (crit roll via `ctx.random`, FSM
  phases, strike resolution, knockback, poise). Clients render only — telegraph timing is
  re-derived from the server row (`(now − startedAt)/duration`), never a client-local timer.
- **INV-5 mirror parity.** `serverSync.test.ts` stays green; extended to assert crit + weapon
  parity in Phase 1 and `ATTACKS` duration/shape parity in Phase 4, kept green through every later shape.
- **Test-first pure helpers.** Extract reducer logic into zero-import, vitest-able siblings
  (`spacetimedb/src/crit.ts`, `damage.ts`, `attacks.ts`, `unitAttackFsm.ts`, `attackHitbox.ts`)
  before wiring reducers.
- **No monolith.** ≤300 LOC/file; carve server logic into siblings, never grow `index.ts`.
  `index.ts` gains only table defs, additive reducer args, and one `runUnitAttacks` pass call.
- **One atomic commit per phase.**
- **Deploy per phase:** `spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb
  --server local --yes` → `pnpm run spacetime:generate` → `pnpm build`. Maincloud deferred to a
  user-facing prod point (never `--delete-data` on real accounts).

### Phases

- [ ] **Phase 1: Crit stats + server damage foundation** - Distinct per-character crit stats mirrored server-side + tested pure helpers (base damage + crit roll); no wiring yet.
- [ ] **Phase 2: Server-authoritative damage + crit on enemies** - Server computes base damage + rolls crit via `ctx.random`; client sends intent; old client roll deleted; crit event table feeds truthful crit numbers.
- [ ] **Phase 3: PVP crit** - Same server damage/crit path extended to `attackPlayer`; truthful, un-spoofable PVP crit numbers.
- [ ] **Phase 4: Attack state machine + leapSlam end-to-end + delete goliath drain** - The risky vertical slice: unit-agnostic attack state machine (windup → strike → recovery) proven on ONE circle attack, contact drain deleted.
- [ ] **Phase 5: swordSwing → swordSwirl combo** - Cone shape + immediate chaining on the proven spine.
- [ ] **Phase 6: shieldDash lane** - The travelling-hitbox lane gap-closer — the hardest shape, done last.
- [ ] **Phase 7: Crit poise interrupt** - A crit during a windup accrues poise → cancel + visible stagger; the un-spoofable differentiator.

### Phase Details

#### Phase 1: Crit stats + server damage foundation
**Goal**: Every character has a distinct, server-mirrored `critRate`/`critDmg`, and the server
owns tested pure helpers to compute base damage (from mirrored `WEAPONS`/combo/transcend math) and
roll crit — the data + logic foundation, wired to nothing yet.
**Depends on**: Nothing (first phase; the dependency root the crit resolution needs)
**Requirements**: CRIT-01, CRIT-03
**Success Criteria** (what must be TRUE):
  1. Every character has its own `critRate`/`critDmg` on `CharacterDefinition`, distinct and
     role-coherent (dps high, tank low, healer/support mid).
  2. Those crit values are mirrored into the server `CHARACTER_STATS`, and `serverSync.test.ts`
     asserts client/server crit-value parity (INV-5) AND weapon-damage/multiplier parity.
  3. Zero-import vitest helpers exist and pass: `crit.ts` (`rollCrit(critRate,critDmg,rng)`) and
     `damage.ts` (`computeBaseDamage` from mirrored `WEAPONS` + combo/skill/transcend multipliers).
  4. No runtime behavior change yet (client still rolls its old crit) — this phase is data + tested
     logic only; grep-gate stays green (no `Math.random`/`Date.now` in `spacetimedb/src`).
**Plans**: 3 plans
- [ ] 01-01-PLAN.md — zero-import pure helpers `crit.ts` (`rollCrit`) + `damage.ts` (`computeBaseDamage`, `WEAPONS`/multiplier mirror) with cross-boundary vitest (wave 1)
- [ ] 01-02-PLAN.md — distinct role-coherent `critRate`/`critDmg` on all 17 characters + `CHARACTER_STATS` mirror + `characters.test.ts` distinctness (wave 1)
- [ ] 01-03-PLAN.md — extend `serverSync.test.ts`: crit parity (regex) + weapon/multiplier/CONSTELLATION_DAMAGE_STEP parity (import-and-compare) (wave 2)
**Notes**: Pure foundation, ships alone. Mirroring `WEAPONS` + the multiplier funcs
(`regularAttackMultiplier`, `skillAttackMultiplier`, combo scale, `transcendDamageMultiplier`,
`skill.damage`) server-side is the bulk of Option B's cost, landed here as tested pure code before
any reducer is touched. Pre-check: verify what the server already knows (`activeCharacterId`,
transcend/constellation level — check `owned_character`/transcend tables) vs what Phase 2 must pass
(combo is client-side today, already bounded). Full context:
`phases/01-crit-foundation/01-CONTEXT.md`.

#### Phase 2: Server-authoritative damage + crit on enemies
**Goal**: The server computes base damage and rolls crit for hits on enemies/goliaths — the client
sends intent (not a damage number), the old client crit roll is deleted, and the truthful crit
number reaches every client via a new crit event table.
**Depends on**: Phase 1 (the mirrored stats + `crit.ts`/`damage.ts` helpers this phase wires in)
**Requirements**: CRIT-02, CRIT-04, CRIT-05, CRIT-06
**Success Criteria** (what must be TRUE):
  1. `attackEnemies`/`attackRay` drop the `damage` arg → accept intent (characterId/combo/basic-vs-
     skill); the server computes base via `damage.ts` and rolls crit via `ctx.random` from the
     mirrored stats (CRIT-06: client no longer sends a damage number, closing the spoof).
  2. Different characters land visibly different crit frequency/magnitude in play, and the old global
     `Math.random()<0.22 → ×1.9` client roll is deleted.
  3. A crit floats the `kind:'crit'` number driven by the real server roll, delivered through a new
     crit event table all clients subscribe to (mirrors `skill_cast`/`ranged_attack`) — no visual
     regression; `isCrit` is recorded on the hit for the Phase-7 interrupt to consume.
  4. A modified client can no longer decide whether a hit crit, nor inflate base damage;
     `MAX_HIT_DAMAGE` clamp kept as defense-in-depth. Grep-gate: no `Math.random` in `spacetimedb/src`.
**Plans**: TBD
**Notes**: The wiring slice. Roadmap's original "no new tables" note is **waived** (user) — one crit
event table is added so the server-owned `isCrit` reaches clients truthfully. Skills and basic
attacks are indistinguishable server-side (both via `attackEnemies`, see `resistances.ts`), so a
single per-character `critRate` auto-covers skills — the server must also compute skill base damage.
CRIT-06 = full server-authoritative base damage (Option B, chosen in discuss-phase over client-sends-
damage). Update client `network.send*` callers + delete client `rollDamage`/`CRIT_CHANCE`.

#### Phase 3: PVP crit
**Goal**: PVP hits (`attackPlayer`) get the same server-authoritative base damage + `ctx.random`
crit + crit event as enemy hits, so crit is consistent and PVP damage numbers stay truthful.
**Depends on**: Phase 2 (the server damage/crit path + crit event table it extends to PVP)
**Requirements**: CRIT-07
**Success Criteria** (what must be TRUE):
  1. `attackPlayer` computes base damage server-side, rolls crit via `ctx.random`, and emits the crit
     event — the client sends intent, not a damage number, for PVP too.
  2. A PVP crit floats the truthful `kind:'crit'` number over the victim on every subscribed client;
     a modified client cannot fake a PVP crit or inflate PVP damage.
  3. Two-client playtest on a migrated DB confirms distinct per-character crit in PVP with no visual
     regression, and the shard-theft loop still resolves correctly on a killing blow.
**Plans**: TBD
**Notes**: Small once Phase 2's server roll + base-damage helper exists — extend the same path to
`attackPlayer` and update client `applyPvpDamage`/`sendAttackPlayer`. CRIT-07 was promoted from a
discuss-phase decision (D-06) to a first-class requirement so this phase maps cleanly. This is the
deploy/verify capstone for the crit trilogy (local publish → generate → build → two-client verify).

#### Phase 4: Attack state machine + leapSlam end-to-end + delete goliath drain
**Goal**: Goliaths stop draining on contact and instead commit one telegraphed, dodgeable
`leapSlam` — the full server attack-state-machine (FSM = finite state machine: windup → strike →
recovery) spine (schema → tick pass-ordering → subscription → telegraph → animation → knockback →
drain deletion) proven end-to-end on a SINGLE attack.
**Depends on**: Phase 2 (shares the combat path; the poise column established here consumes
Phase 2's server-owned `isCrit` in Phase 7)
**Requirements**: FSM-01, FSM-02, FSM-03, FSM-04, FSM-05, FSM-06, ATK-01, ATK-05, ATK-06,
ANIM-01, ANIM-02, ANIM-03, ANIM-04, HIT-01
**Success Criteria** (what must be TRUE):
  1. A player who stands in a goliath's `leapSlam` telegraph and leaves before it lands takes NO
     damage; a player who stays gets hit — dodge works because damage resolves once at the strike
     frame vs LIVE positions.
  2. The goliath NEVER damages on contact — its only damage source is a landed strike (old
     per-tick contact drain deleted in this same slice), and the selection fn returns an attack
     in every distance band (no facetank dead zone).
  3. During windup the client shows a ground telegraph (circle) that fills over the windup with
     timing re-derived from the server row, legible through the pixel filter (icy-cyan `#86e2ff`);
     the goliath mesh visibly winds up, strikes, and recovers; strike VFX/SFX fire once on the
     `attack_strike` event.
  4. A landed strike knocks back and/or briefly stuns the hit player (weight feedback),
     server-authoritative and rendered client-side.
  5. On a MIGRATED (not freshly-seeded) DB over maincloud RTT, a real two-client engage creates
     `unit_attack` rows and the dodge stays fair — verified remotely, not just on LAN.
**Plans**: TBD
**Notes**: Carries all integration risk. `runUnitAttacks` sits BETWEEN `worldTick`'s
position-build pass and the single `playerDamage` apply, writing strike damage into that shared
map (reuses resistance/death/shard-spill/respawn). The state machine is row-optional (iterate unit
tables, lazily insert the `unit_attack` row by index — never iterate the empty attack table). Windups
authored as exact tick multiples (≥0.35s / ≥2 ticks); a passed strike deadline is resolved, never
dropped (test a "jumped two intervals" input). Establish the `poise` column +
reset-on-windup-entry here (accrual ships Phase 7). Choose the active-window + dodge-grace latency
model here and validate on maincloud RTT. Extend `serverSync.test.ts` to assert `ATTACKS`
duration/shape parity and keep it green.

#### Phase 5: swordSwing → swordSwirl combo
**Goal**: The goliath gains a close-range cone poke that chains immediately into a 360° circle,
proving attack chaining and a second/third hitbox shape on the validated spine.
**Depends on**: Phase 4 (the proven attack-state-machine spine, telegraph renderer, and `ATTACKS` parity test)
**Requirements**: ATK-02, ATK-03
**Success Criteria** (what must be TRUE):
  1. A player standing in front of a goliath at close range gets hit by `swordSwing` (frontal
     cone resolved vs live positions), and stepping to its side/back avoids it.
  2. `swordSwirl` fires immediately after `swordSwing` as a 360° circle — the player must move OUT,
     not just around, to survive the chain.
  3. Each attack shows its own filling ground telegraph (cone, then circle) and its own goliath
     animation clip; `serverSync.test.ts` `ATTACKS` parity stays green.
**Plans**: TBD
**Notes**: Mechanical repeat of the Phase 4 pattern — add two `ATTACKS` entries + `resolveCone`
(reuse `isWithinForwardArc`), chain selection (swirl after swing), a client cone telegraph branch,
and a sword-swing clip. Author real cooldowns so the `swing`+`swirl` chain cannot one-shot a
max-HP player (model worst case before shipping).

#### Phase 6: shieldDash lane
**Goal**: The goliath gains a lane/capsule gap-closer that commits its body along a charge path —
the hardest shape (a travelling hitbox), added last of the shapes.
**Depends on**: Phase 5 (all static shapes proven; lane is the moving-hitbox extension)
**Requirements**: ATK-04
**Success Criteria** (what must be TRUE):
  1. The goliath telegraphs a lane, then charges along it; a player standing in the lane when the
     charge resolves is hit, and a player who steps out of the lane during windup is not.
  2. The goliath's body actually commits down the charge path (`move:'charge'`) — it relocates, not
     just swings — and the lane telegraph + charge animation render the travel.
  3. Every player within `laneWidth` along the charge path is resolved (not just the first), and
     `serverSync.test.ts` `ATTACKS` parity stays green.
**Plans**: TBD
**Notes**: Add one `ATTACKS` entry + `resolveLane` (reuse `pickRayHit`/segment projection, collect
ALL within `laneWidth`), the `move:'charge'` body commit layered as an override on the computed
`goliathPosition` map before the single apply, and a client lane telegraph + charge animation.

#### Phase 7: Crit poise interrupt
**Goal**: A crit landing during a goliath's windup can CANCEL the attack and stagger the goliath —
the signature, un-spoofable differentiator that makes crit investment buy tempo, not just damage.
**Depends on**: Phase 4 (a windup state machine to cancel + the poise column lifecycle) AND Phase 2
(the server-owned `isCrit` signal) — this is why it is last.
**Requirements**: POISE-01, POISE-02, POISE-03
**Success Criteria** (what must be TRUE):
  1. Landing crits on a goliath DURING its windup accrues poise; enough crit-in-windup cancels the
     attack (no strike fires) and the goliath enters a brief, VISIBLE stagger before it can attack
     again.
  2. Non-crit hits never accrue poise, crits outside a windup are a poise no-op, and `poise` resets
     to 0 on every windup entry — so a player cannot perma-stun by chipping between windups.
  3. The interrupt consumes the server-owned `isCrit` from Phase 2 (not a client-sent bool), so a
     modified client cannot spoof a perma-stun on every nearby goliath.
**Plans**: TBD
**Notes**: Small once the poise column exists — a pure `applyPoiseHit` in `unitAttackFsm.ts` called
from `attackEnemies`/`attackRay`, with explicit boundary tests (same-tick strike/interrupt race,
post-interrupt re-attack, crit-outside-windup no-op). Honors the Phase-2 server-side trust decision;
do NOT elevate an untrusted bool to a state trigger.

### Progress — v0.2.0-alpha Combat Depth

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Crit stats + server damage foundation | 0/3 | Not started | - |
| 2. Server-authoritative damage + crit on enemies | 0/TBD | Not started | - |
| 3. PVP crit | 0/TBD | Not started | - |
| 4. Attack state machine + leapSlam + delete drain | 0/TBD | Not started | - |
| 5. swordSwing → swordSwirl combo | 0/TBD | Not started | - |
| 6. shieldDash lane | 0/TBD | Not started | - |
| 7. Crit poise interrupt | 0/TBD | Not started | - |

---

## ✅ v0.1.0-alpha Transcendence (shipped 2026-07-08)

<details>
<summary>Phases A, 0–5 — SHIPPED 2026-07-08</summary>

- [x] Phase A: Gem naming unification — primogems→gems (commit `8236de4`)
- [x] Phase 0: Lock transcendence constants (1/1 plans) — 2026-07-06
- [x] Phase 1: Constellation shard currency (4/4 plans) — 2026-07-06
- [x] Phase 2: Transcendence install (5/5 plans) — 2026-07-06
- [x] Phase 3: Shards at risk (5/5 plans) — 2026-07-07
- [x] Phase 4: Formalize character roles (2/2 plans) — 2026-07-07
- [x] Phase 5: Multiplayer party (6/6 plans) — 2026-07-07

Full detail archived: [`milestones/v0.1.0-alpha-ROADMAP.md`](./milestones/v0.1.0-alpha-ROADMAP.md)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| A. Gem naming unification | 1/1 | Complete | 2026-07 (`8236de4`) |
| 0. Lock transcendence constants | 1/1 | Complete | 2026-07-06 |
| 1. Constellation shard currency | 4/4 | Complete | 2026-07-06 |
| 2. Transcendence install | 5/5 | Complete | 2026-07-06 |
| 3. Shards at risk | 5/5 | Complete | 2026-07-07 |
| 4. Formalize character roles | 2/2 | Complete | 2026-07-07 |
| 5. Multiplayer party | 6/6 | Complete | 2026-07-07 |

</details>

## 🔒 Reserved for a later milestone (NOT Combat Depth)

- [→] **Raid boss** — party-gated shard faucet (the recoverable faucet, INV-4).
  Spec: `.planning/todos/pending/2026-07-08-phase-6-raid-boss-DEFERRED.md`
- [→] **Role enforcement + balance** — raid role mechanics + balance pass + full-loop
  validation. Spec: `.planning/todos/pending/2026-07-08-phase-7-role-enforcement-balance-DEFERRED.md`

> Deferred out of the v0.1.0-alpha ship at Phase 5. Explicitly OUT OF SCOPE for v0.2.0-alpha
> Combat Depth. Re-add with `/gsd-phase` when a raid-recovery milestone opens.
