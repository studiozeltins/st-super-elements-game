# Roadmap: super-elements

## Milestones

- 🚧 **v0.2.0-alpha Combat Depth** — Phases 1–5 (active, started 2026-07-08)
- ✅ **v0.1.0-alpha Transcendence** — Phases A, 0–5 (shipped 2026-07-08)
- 🔒 **Reserved for a later milestone** — Raid boss + role enforcement/balance (deferred out of alpha; carries INV-4). NOT part of Combat Depth.

---

## 🚧 v0.2.0-alpha Combat Depth (active)

**Milestone goal:** Replace the undodgeable per-tick goliath contact drain with discrete,
telegraphed, DODGEABLE attacks (windup → strike → recovery) driven by ONE unit-agnostic,
server-authoritative attack FSM — plus a real per-character server-rolled crit system and a
crit-driven poise interrupt. Enemies only; the FSM is built so heroes reuse it later with zero
schema change.

**Granularity:** Standard (5 phases — forced, dependency-ordered: the interrupt cannot precede
crit, and one attack shape is proven before the rest multiply).

**Coverage:** 25/25 v1 requirements mapped, 0 unmapped.

### Cross-Cutting Constraints (apply to EVERY phase)

- **Additive schema only.** New columns/tables; migrate-publish, never `--delete-data` on a DB
  with real accounts. New tables start EMPTY on a live (migrated) DB — so each phase's
  done-criteria needs a **migrated-DB (not fresh-seed) verification**, and the FSM must lazily
  create attack state by iterating the *unit* tables, never the empty attack table.
- **Server-authoritative.** The server owns all combat truth (crit roll via `ctx.random`, FSM
  phases, strike resolution, knockback, poise). Clients render only — telegraph timing is
  re-derived from the server row (`(now − startedAt)/duration`), never a client-local timer.
- **INV-5 mirror parity.** `serverSync.test.ts` stays green; extended to assert `ATTACKS`
  duration/shape parity in Phase 2 and kept green through every later shape.
- **Test-first pure helpers.** Extract reducer logic into zero-import, vitest-able siblings
  (`spacetimedb/src/attacks.ts`, `unitAttackFsm.ts`, `attackHitbox.ts`) before wiring reducers.
- **No monolith.** ≤300 LOC/file; carve server logic into siblings, never grow `index.ts`.
  `index.ts` gains only table defs, additive reducer args, and one `runUnitAttacks` pass call.
- **One atomic commit per phase.**
- **Deploy per phase:** `spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb
  --server local --yes` → `pnpm run spacetime:generate` → `pnpm build`. Maincloud deferred to a
  user-facing prod point (never `--delete-data` on real accounts).

### Phases

- [ ] **Phase 1: Crit foundation** - Per-character, server-rolled crit replaces the global client roll; `isCrit` recorded for the interrupt to consume.
- [ ] **Phase 2: FSM + leapSlam end-to-end + delete goliath drain** - The risky vertical slice: unit-agnostic attack FSM proven on ONE circle attack, contact drain deleted.
- [ ] **Phase 3: swordSwing → swordSwirl combo** - Cone shape + immediate chaining on the proven spine.
- [ ] **Phase 4: shieldDash lane** - The travelling-hitbox lane gap-closer — the hardest shape, done last.
- [ ] **Phase 5: Crit poise interrupt** - A crit during a windup accrues poise → cancel + visible stagger; the un-spoofable differentiator.

### Phase Details

#### Phase 1: Crit foundation
**Goal**: A character's crit is a real per-character stat that the SERVER rolls and owns, so
crit visuals become truthful and the `isCrit` signal the poise interrupt later consumes exists.
**Depends on**: Nothing (first phase; the dependency root the interrupt needs)
**Requirements**: CRIT-01, CRIT-02, CRIT-03, CRIT-04, CRIT-05
**Success Criteria** (what must be TRUE):
  1. Different characters land visibly different crit frequency/magnitude in play (each has its
     own `critRate`/`critDmg`), and the old global `Math.random()<0.22 → ×1.9` roll is gone.
  2. A hit that crits shows the `kind:'crit'` floating damage number driven by the real
     server roll — no visual regression versus before.
  3. `serverSync.test.ts` passes asserting every character's client crit values equal the
     server `CHARACTER_STATS` mirror (INV-5).
  4. `attackEnemies`/`attackRay` resolve crit server-side (via `ctx.random`) and record `isCrit`
     on the hit; a modified client can no longer decide whether a hit crit.
**Plans**: TBD
**Notes**: Ships alone, no FSM and no new tables. Locked decision (b): crit roll is SERVER-SIDE
via `ctx.random` — the only option that makes the Phase-5 interrupt un-spoofable — so this phase
mirrors crit stats into the server `CHARACTER_STATS`. Add a server-side `damage` sanity clamp as
defense-in-depth. Grep-gate: no `Math.random`/`Date.now` in `spacetimedb/src`.

#### Phase 2: FSM + leapSlam end-to-end + delete goliath drain
**Goal**: Goliaths stop draining on contact and instead commit one telegraphed, dodgeable
`leapSlam` — the full server FSM spine (schema → tick pass-ordering → subscription → telegraph →
animation → knockback → drain deletion) proven end-to-end on a SINGLE attack.
**Depends on**: Phase 1 (shares the combat path; the poise column established here consumes
Phase 1's `isCrit` in Phase 5)
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
map (reuses resistance/death/shard-spill/respawn). FSM is row-optional (iterate unit tables,
lazily insert the `unit_attack` row by index — never iterate the empty attack table). Windups
authored as exact tick multiples (≥0.35s / ≥2 ticks); a passed strike deadline is resolved, never
dropped (test a "jumped two intervals" input). Establish the `poise` column +
reset-on-windup-entry here (accrual ships Phase 5). Choose the active-window + dodge-grace latency
model here and validate on maincloud RTT. Extend `serverSync.test.ts` to assert `ATTACKS`
duration/shape parity and keep it green.

#### Phase 3: swordSwing → swordSwirl combo
**Goal**: The goliath gains a close-range cone poke that chains immediately into a 360° circle,
proving attack chaining and a second/third hitbox shape on the validated spine.
**Depends on**: Phase 2 (the proven FSM spine, telegraph renderer, and `ATTACKS` parity test)
**Requirements**: ATK-02, ATK-03
**Success Criteria** (what must be TRUE):
  1. A player standing in front of a goliath at close range gets hit by `swordSwing` (frontal
     cone resolved vs live positions), and stepping to its side/back avoids it.
  2. `swordSwirl` fires immediately after `swordSwing` as a 360° circle — the player must move OUT,
     not just around, to survive the chain.
  3. Each attack shows its own filling ground telegraph (cone, then circle) and its own goliath
     animation clip; `serverSync.test.ts` `ATTACKS` parity stays green.
**Plans**: TBD
**Notes**: Mechanical repeat of the Phase 2 pattern — add two `ATTACKS` entries + `resolveCone`
(reuse `isWithinForwardArc`), chain selection (swirl after swing), a client cone telegraph branch,
and a sword-swing clip. Author real cooldowns so the `swing`+`swirl` chain cannot one-shot a
max-HP player (model worst case before shipping).

#### Phase 4: shieldDash lane
**Goal**: The goliath gains a lane/capsule gap-closer that commits its body along a charge path —
the hardest shape (a travelling hitbox), added last of the shapes.
**Depends on**: Phase 3 (all static shapes proven; lane is the moving-hitbox extension)
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

#### Phase 5: Crit poise interrupt
**Goal**: A crit landing during a goliath's windup can CANCEL the attack and stagger the goliath —
the signature, un-spoofable differentiator that makes crit investment buy tempo, not just damage.
**Depends on**: Phase 2 (a windup FSM to cancel + the poise column lifecycle) AND Phase 1 (the
server-owned `isCrit` signal) — this is why it is last.
**Requirements**: POISE-01, POISE-02, POISE-03
**Success Criteria** (what must be TRUE):
  1. Landing crits on a goliath DURING its windup accrues poise; enough crit-in-windup cancels the
     attack (no strike fires) and the goliath enters a brief, VISIBLE stagger before it can attack
     again.
  2. Non-crit hits never accrue poise, crits outside a windup are a poise no-op, and `poise` resets
     to 0 on every windup entry — so a player cannot perma-stun by chipping between windups.
  3. The interrupt consumes the server-owned `isCrit` from Phase 1 (not a client-sent bool), so a
     modified client cannot spoof a perma-stun on every nearby goliath.
**Plans**: TBD
**Notes**: Small once the poise column exists — a pure `applyPoiseHit` in `unitAttackFsm.ts` called
from `attackEnemies`/`attackRay`, with explicit boundary tests (same-tick strike/interrupt race,
post-interrupt re-attack, crit-outside-windup no-op). Honors the Phase-1 server-side trust decision;
do NOT elevate an untrusted bool to a state trigger.

### Progress — v0.2.0-alpha Combat Depth

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Crit foundation | 0/TBD | Not started | - |
| 2. FSM + leapSlam + delete drain | 0/TBD | Not started | - |
| 3. swordSwing → swordSwirl combo | 0/TBD | Not started | - |
| 4. shieldDash lane | 0/TBD | Not started | - |
| 5. Crit poise interrupt | 0/TBD | Not started | - |

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
