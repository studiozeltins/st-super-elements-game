# Requirements: super-elements — v0.2.0-alpha "Combat Depth"

**Defined:** 2026-07-08
**Core Value:** A retained PVPvE loop — chase endless Transcendence power, contest it via PVP theft + co-op raids, with no progress-wipe churn. This milestone deepens *combat feel*: enemy attacks become dodgeable and crit becomes a real per-character stat, so power investment (crit) buys tempo, not just damage.

**Scope:** ENEMIES ONLY (goliaths). The attack FSM is built unit-agnostic (`unit_attack` keyed by `unitKind`) so camp enemies and heroes reuse it later with ZERO schema change, but only goliaths are converted this milestone. Heroes keep the current client swing. All schema additive (new `unit_attack` + `attack_strike` tables + server-side crit) — safe migrate-publish, never `--delete-data` on a DB with real accounts.

**Locked decisions (this milestone):**

- **Crit roll is SERVER-SIDE** — the server decides whether a hit crit, using SpacetimeDB's deterministic server-side randomness (`ctx.random`; `ctx` is the reducer context — the server-function argument that exposes `sender`/`db`/`timestamp`/`random`). The server owns the `isCrit` flag, computed from the mirrored per-character `critRate`/`critDmg`; cheat-proof, the only option that makes the poise interrupt un-spoofable.
- **Goliaths only** — camp-enemy conversion deferred (SPEC non-goal); FSM proven reusable.
- **Knockback/stun on strike hit IS in scope** — landed strikes have weight.

## v1 Requirements

Requirements for this milestone. Each maps to exactly one roadmap phase.

### Crit (CRIT) — per-character, server-authoritative

- [x] **CRIT-01**: Each character has distinct `critRate`/`critDmg` stats, replacing the global `Math.random()<0.22 → ×1.9` roll.
- [x] **CRIT-02**: The server rolls crit using SpacetimeDB's deterministic server randomness (`ctx.random`) from the acting character's `critRate` and applies `critDmg` — the client no longer decides whether a hit crit.
- [x] **CRIT-03**: Per-character crit stats are mirrored into the server `CHARACTER_STATS`, and `serverSync.test.ts` asserts client/server crit-value parity (INV-5).
- [x] **CRIT-04**: A crit hit floats the `kind:'crit'` damage number, driven by the real server roll (no visual regression).
- [x] **CRIT-05**: `attackEnemies`/`attackRay` resolve crit server-side and record `isCrit` on the hit so the poise system can consume it.
- [x] **CRIT-06**: Base damage is computed SERVER-SIDE from mirrored `WEAPONS` + combo/skill/transcend math — `attackEnemies`/`attackRay` drop the client `damage` arg and receive intent instead, so a modified client can no longer inflate damage (closes the PVP damage-spoof hole; chosen over client-sends-damage in discuss-phase). Promoted from decision D-05.
- [x] **CRIT-07**: PVP hits (`attackPlayer`) resolve base damage + crit server-side via the same path and emit the crit event, so PVP crit numbers are truthful and un-spoofable. Promoted from decision D-06.

### Attack State Machine (FSM) — unit-agnostic core

- [x] **FSM-01**: Every attacking unit runs a `windup → strike → recovery` state machine on the server world tick, stored in a public unit-agnostic `unit_attack` table (`unitKind`/`unitId`).
- [x] **FSM-02**: Strike damage resolves once at the strike frame against LIVE player positions — a player who leaves the hitbox during windup takes no damage.
- [x] **FSM-03**: An idle unit with a target in engage range and off cooldown selects an attack via one range/cooldown selection fn (`(distance, cooldownUntil, available[]) → attackId`).
- [x] **FSM-04**: Attacks are data-driven — an `ATTACKS` registry (shape, windup/active/recovery/cooldown, hitbox, damage, `move`, `poiseThreshold`) + per-archetype `UNIT_ATTACKS[unitKind][archetype]` lists; a new attack is one entry, a new unit is one list.
- [x] **FSM-05**: The FSM is deterministic — keyed on the server clock (`ctx.timestamp`, deterministic server time in microseconds) sampled once per tick, windups authored as exact tick multiples, and a strike whose deadline a late/coalesced tick already passed is resolved (never dropped).
- [x] **FSM-06**: The `unit_attack` + `attack_strike` tables are additive and deploy to a live (migrated, not freshly-seeded) DB; the FSM lazily creates attack state by iterating the unit tables, never the empty attack table.

### Attack Roster & Hitboxes (ATK) — goliath v1

- [x] **ATK-01**: `leapSlam` — a circle AOE at a LOCKED landing (position sampled at cast; dodge by not being there when it lands).
- [x] **ATK-02**: `swordSwing` — a frontal cone resolved vs live positions (close-range poke).
- [x] **ATK-03**: `swordSwirl` — a 360° circle that chains immediately after `swordSwing`.
- [x] **ATK-04**: `shieldDash` — a lane/capsule moving hitbox gap-closer (`move:'charge'` body commit) resolved along the charge path.
- [x] **ATK-05**: The goliath→player contact drain is removed (goliaths damage ONLY via telegraphed strikes), deleted in the same slice that guarantees the selection fn returns an attack in every distance band (no facetank dead zone). Camp and goliath→enemy drains are untouched.
- [x] **ATK-06**: Three pure hitbox resolvers (circle / cone / lane) resolve a shape vs live positions, reusing existing geometry helpers (`distanceBetween`, `isWithinForwardArc`, ray/segment projection). *Spans Phases 4–6: circle lands in Phase 4 (leapSlam); cone lands in Phase 5 with ATK-02/03; lane lands in Phase 6 with ATK-04. No dead stubs earlier (CLAUDE.md no-dead-code) — Phase 4 verification scopes to the circle resolver + geometry-reuse pattern only.*

### Telegraphs & Animation (ANIM) — client render-only

- [x] **ANIM-01**: The client renders a ground telegraph per attack (circle / cone / lane) that fills over the windup, with timing re-derived from the server row (`(now − startedAt)/duration`) — never a client-local timer.
- [x] **ANIM-02**: Telegraphs are legible through the pixel filter at target resolution (high-contrast cue, e.g. icy-cyan `#86e2ff`), verified through the filter, not raw Three.js.
- [x] **ANIM-03**: A shared procedural animation state machine (idle/move/windup/strike/recovery) drives both enemy and goliath meshes per attack phase via an `animateAttack` hook on `EntityAnimation`, built so heroes reuse it later with zero schema change.
- [x] **ANIM-04**: Per-attack strike VFX/SFX fire once on the `attack_strike` event (`onInsert` only), mirroring the existing `skill_cast`/`ranged_attack` pattern.

### Hit Reaction (HIT)

- [x] **HIT-01**: A landed strike knocks back and/or briefly stuns the hit player (weight feedback), server-authoritative and rendered client-side.

### Poise Interrupt (POISE) — the differentiator

- [ ] **POISE-01**: A crit landing during a unit's windup accrues its damage into the attack's `poise`; non-crit hits never accrue, and `poise` resets on every windup entry.
- [ ] **POISE-02**: When `poise >= poiseThreshold` the attack is cancelled (no strike fires) and the unit enters a brief, visible stagger before it can attack again.
- [ ] **POISE-03**: The interrupt consumes the server-owned `isCrit` from CRIT-02, so it cannot be spoofed by a modified client into a perma-stun.

## v2 Requirements

Deferred to a future milestone. Tracked, not in this roadmap.

### Combat expansion

- **XCMB-01**: Convert camp enemies to the same `unit_attack` FSM (zero schema change) once goliath feel is dialed in.
- **XCMB-02**: Weapon/constellation crit contributions on top of base per-character crit.
- **XCMB-03**: Per-archetype attack silhouettes (distinct small vs big goliath attack lists) beyond the v1 roster.
- **XCMB-04**: Hero attack FSM + i-frame / parry dodge (heroes gain telegraphed attacks and active-defense).
- **XCMB-05**: Tiered poise / hyperarmor / break animations (beyond the binary interrupt).
- **XCMB-06**: Elemental-reactive telegraphs (ties into the deferred elemental resistance system).

## Out of Scope

Explicitly excluded. Anti-features from research documented to prevent scope creep and re-litigation.

| Feature | Reason |
|---------|--------|
| Real rigid-body / continuous-collision physics engine | SPEC non-goal; "physics feel" = a discrete overlap test at the strike instant, not a sim. Massive determinism/perf cost on a 150ms tick. |
| Keeping per-tick contact drain alongside strikes (on goliaths) | Double-dips with strikes and re-introduces the exact undodgeable drain this milestone removes. |
| Perfect-homing windups (re-aim on the strike frame) | Undodgeable in practice — same feel as the old drain. Attacks either lock at a moment or resolve vs live pos with a leaveable window. |
| Undodgeable "true damage" telegraphs | Violates the readability contract; every attack must have counterplay (move out, or crit-interrupt). |
| Sub-0.3s "gotcha" windups | Unreactable at a 150ms tick; reads as random damage. Windups ≥ ~0.35s (≥2 ticks). |
| Client-authored crit roll | Rejected this milestone — server-side `ctx.random` chosen so the poise interrupt is un-spoofable (see Locked decisions). |
| Deep poise meters with tiers / hyperarmor / break states | Scope explosion + needs animation depth; binary interrupt first (see XCMB-05). |
| Hero attack FSM / i-frame / parry this milestone | Heroes stay on the client swing; FSM built reusable but heroes not wired (see XCMB-04). |
| Camp-enemy conversion this milestone | Goliaths first; FSM proven reusable at zero schema change (see XCMB-01). |
| Raid boss (was Phase 6) + role enforcement/balance (was Phase 7) | Reserved as deferred phases for a LATER milestone; carries INV-4. Specs at `.planning/todos/pending/*-DEFERRED.md`. |

## Traceability

Which phases cover which requirements. v0.2.0-alpha Combat Depth, forced dependency-ordered 7-phase
sequence (crit split across Phases 1–3 after discuss-phase chose full server-authoritative base
damage; attack shapes + interrupt in Phases 4–7).

| Requirement | Phase | Status |
|-------------|-------|--------|
| CRIT-01 | Phase 1 | Complete |
| CRIT-03 | Phase 1 | Complete |
| CRIT-02 | Phase 2 | Complete |
| CRIT-04 | Phase 2 | Complete |
| CRIT-05 | Phase 2 | Complete |
| CRIT-06 | Phase 2 | Complete |
| CRIT-07 | Phase 3 | Complete |
| FSM-01 | Phase 4 | Complete |
| FSM-02 | Phase 4 | Complete |
| FSM-03 | Phase 4 | Complete |
| FSM-04 | Phase 4 | Complete |
| FSM-05 | Phase 4 | Complete |
| FSM-06 | Phase 4 | Complete |
| ATK-01 | Phase 4 | Complete |
| ATK-05 | Phase 4 | Complete |
| ATK-06 | Phases 4–6 (circle: P4, cone: P5, lane: P6) | Complete |
| ANIM-01 | Phase 4 | Complete |
| ANIM-02 | Phase 4 | Complete |
| ANIM-03 | Phase 4 | Complete |
| ANIM-04 | Phase 4 | Complete |
| HIT-01 | Phase 4 | Complete |
| ATK-02 | Phase 5 | Complete |
| ATK-03 | Phase 5 | Complete |
| ATK-04 | Phase 6 | Complete |
| POISE-01 | Phase 7 | Pending |
| POISE-02 | Phase 7 | Pending |
| POISE-03 | Phase 7 | Pending |

**Coverage:**

- v1 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0 ✓

---
*Requirements defined: 2026-07-08*
*Last updated: 2026-07-08 — added CRIT-06 (server-authoritative base damage) + CRIT-07 (PVP crit) from Phase-1 discuss-phase; crit work split into Phases 1–3, milestone now 7 phases (27/27 mapped)*
