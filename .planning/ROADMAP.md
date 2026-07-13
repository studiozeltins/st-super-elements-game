# Roadmap: super-elements

## Milestones

- ✅ **v0.2.0-alpha Combat Depth** — Phases 1–6 (shipped 2026-07-13; Phase 7 crit poise interrupt deferred)
- ✅ **v0.1.0-alpha Transcendence** — Phases A, 0–5 (shipped 2026-07-08)
- 🔒 **Reserved for a later milestone** — Raid boss + role enforcement/balance (carries INV-4) · Crit poise interrupt (POISE-01..03)

---

## ✅ v0.2.0-alpha Combat Depth (shipped 2026-07-13)

<details>
<summary>Phases 1–6 — SHIPPED 2026-07-13 (Phase 7 deferred)</summary>

**Delivered:** Undodgeable goliath contact drain replaced with discrete, telegraphed, DODGEABLE
attacks (windup → strike → recovery) on ONE unit-agnostic server-authoritative attack FSM, plus
per-character server-rolled crit and full server-authoritative base damage (PVE + PVP spoof holes
closed).

- [x] Phase 1: Crit stats + server damage foundation (3/3 plans) — 2026-07-08
- [x] Phase 2: Server-authoritative damage + crit on enemies (3/3 plans) — 2026-07-09
- [x] Phase 3: PVP crit (2/2 plans) — 2026-07-09
- [x] Phase 4: Attack state machine + leapSlam end-to-end + delete goliath drain (7/7 plans) — 2026-07-13
- [x] Phase 5: swordSwing → swordSwirl combo (5/5 plans) — 2026-07-11
- [x] Phase 6: shieldDash lane (5/5 plans) — 2026-07-13
- [→] Phase 7: Crit poise interrupt — DEFERRED at close (spec: `todos/pending/2026-07-13-phase-7-crit-poise-interrupt-DEFERRED.md`)

Full detail archived: [`milestones/v0.2.0-alpha-ROADMAP.md`](./milestones/v0.2.0-alpha-ROADMAP.md)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Crit stats + server damage foundation | 3/3 | Complete | 2026-07-08 |
| 2. Server-authoritative damage + crit on enemies | 3/3 | Complete | 2026-07-09 |
| 3. PVP crit | 2/2 | Complete | 2026-07-09 |
| 4. Attack state machine + leapSlam + delete drain | 7/7 | Complete | 2026-07-13 |
| 5. swordSwing → swordSwirl combo | 5/5 | Complete | 2026-07-11 |
| 6. shieldDash lane | 5/5 | Complete | 2026-07-13 |
| 7. Crit poise interrupt | — | Deferred | - |

</details>

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

## 🔒 Reserved for a later milestone

- [→] **Raid boss** — party-gated shard faucet (the recoverable faucet, INV-4).
  Spec: `.planning/todos/pending/2026-07-08-phase-6-raid-boss-DEFERRED.md`

- [→] **Role enforcement + balance** — raid role mechanics + balance pass + full-loop
  validation. Spec: `.planning/todos/pending/2026-07-08-phase-7-role-enforcement-balance-DEFERRED.md`

- [→] **Crit poise interrupt** — crit-in-windup poise accrual → attack cancel + visible stagger
  (POISE-01..03). All dependencies shipped in v0.2.0-alpha (poise column, server `isCrit`); small
  pure-helper slice. Spec: `.planning/todos/pending/2026-07-13-phase-7-crit-poise-interrupt-DEFERRED.md`

> Raid items deferred out of the v0.1.0-alpha ship at Phase 5; poise interrupt deferred at the
> v0.2.0-alpha close. Re-add with `/gsd-phase` when the next milestone opens.
