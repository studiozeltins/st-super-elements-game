# Phase 5: swordSwing → swordSwirl combo - Context

**Gathered:** 2026-07-10
**Status:** Ready for planning
**Mode:** --all --auto (all gray areas auto-selected; recommended defaults; audit trail in 05-DISCUSSION-LOG.md)

<domain>
## Phase Boundary

The goliath gains a close-range frontal cone poke (`swordSwing`, ATK-02) that chains
immediately into a self-centered 360° circle (`swordSwirl`, ATK-03) — proving attack
CHAINING and the cone hitbox shape on the Phase-4 spine, with zero FSM-architecture change:

- Server: two new `ATTACKS` entries + `resolveCone` in `attackHitbox.ts` (reuses
  `isWithinForwardArc`) + a data-driven chain mechanism (`chainsInto` on `AttackSpec`) in the
  existing `unitAttacks.ts` glue + per-role cooldown split (`basicCooldownUntilMicros`,
  additive `.default()` column) so the D4-08 basic-basic-skill rhythm becomes real.
- Client render-only: a cone SECTOR telegraph branch in `createTelegraphSystem` (same
  fill-is-countdown language, `#86e2ff`), swirl reuses the existing circle telegraph; two
  procedural clips on the goliath `animateAttack` hook (slash lunge, 360° spin); per-attack
  strike juice keyed by `attack_strike.attackId`.
- `leapSlam` cooldown retuned 3.5s → 5.5s (the explicit D4-07 Phase-5 retune) now that
  `swordSwing` is the basic filler.
- Chain worst-case damage modeled BEFORE shipping: swing+swirl cannot one-shot a max-HP
  squishy (roadmap Phase-5 note).
- Deploy: additive local publish → `pnpm run spacetime:generate` → `pnpm build` → migrated-DB
  playtest. Self-hosted target — NO maincloud publish (self-host pivot, 04-07).

**Out of scope:** `shieldDash` lane + `move:'charge'` (Phase 6), poise accrual/interrupt
(Phase 7 — the `poise` field lifecycle stays reset-on-windup-entry only), hero FSM (XCMB-04),
camp-enemy conversion (XCMB-01), miss/evasion RNG (pending user decision — separate todo),
reposition/strafe AI between attacks (rejected in Phase 4; revisit only if the Phase-5 kit
still feels static).
</domain>

<decisions>
## Implementation Decisions

> Cross-cutting constraints (server-authoritative, additive schema + `.default()` on new
> columns, INV-5 `ATTACKS` parity, test-first pure helpers, ≤300 LOC/file, tick-multiple
> windups ≥2 ticks, resolve-never-drop, migrated-DB verification, zero new deps, icy-cyan
> `#86e2ff`) are LOCKED in ROADMAP.md/REQUIREMENTS.md. Phase-4 decisions D4-01..D4-17 remain
> binding — D4-02 grace, D4-03 bystanders, D4-09 per-attack reaction DATA, D4-12 rooted
> windup, D4-14 telegraph language all carry to the new attacks verbatim.

### Chain mechanics (ATK-03)
- **D5-01 — chain is DATA:** `AttackSpec` gains `chainsInto?: string`. At the chaining
  attack's strike-resolution transition (STRIKE→RECOVERY in `dueAttackTransitions` output),
  the glue enters the chained attack's windup via `enterWindup` INSTEAD of entering recovery —
  only the FINAL attack of a chain has a recovery window and writes a cooldown. Zero new FSM
  states, zero new tables; a future 3-hit chain is pure data. Rejected: a special CHAIN state
  (new state = schema+client churn) and selection-fn forcing (racy, not atomic with the swing).
- **D5-02 — chain is UNCONDITIONAL:** swirl always follows swing, hit or whiff — the
  telegraph never lies, the combo is learnable, and determinism is trivial. Rejected
  chain-on-hit (punishes the player for dodging the swing: dodge → no swirl warning habit).
- **D5-03 — swirl is NOT directly selectable:** `UNIT_ATTACKS[goliath].default =
  ['leapSlam', 'swordSwing']`; `swordSwirl` exists in `ATTACKS` but is reachable ONLY via
  `chainsInto`. Its band fields are inert (author them to swing's values for parity sanity).
- **D5-04 — swirl center = the goliath's planted position:** swirl's `enterWindup` locks
  landing = cast (`castX/Z`) — a self-centered 360° circle. The existing circle telegraph and
  `resolveCircleHit` work UNCHANGED for swirl (it is literally a circle at the goliath's feet).
  Player must move OUT (radius), not around (SC2).

### Cone geometry & client shape data (ATK-02)
- **D5-05 — cone aim locked at windup entry, resolved vs LIVE positions:** aim direction =
  normalize(target sample − cast), stored via the EXISTING `landingX/Z` (aim point) with apex
  = `castX/Z`. Zero new geometry columns. At strike, every live player inside the cone is hit
  (D4-03 bystanders); stepping to side/back during the windup escapes (SC1). Grace (D4-02)
  applies as on leapSlam: resolve at strike+grace vs live rows.
- **D5-06 — cone shape numbers:** full angle **120°** (`minDot = cos(60°) = 0.5` — reuse
  `isWithinForwardArc` verbatim for the arc test + a range check for distance; that pair IS
  `resolveCone`, ATK-06 geometry-reuse honored). Range per size via `radiusBySize` semantics
  (field reused as "cone range"): seed **3.0 / 3.5 / 4.0**. Seeds; user tunes in playtest.
- **D5-07 — client shape data via a small mirror:** static per-attack render data (shape kind,
  cone half-angle, juice hints) lives in a client mirror `src/game/data/attacks.ts` keyed by
  `attackId`, guarded by `serverSync.test.ts` parity (the established INV-5 pattern — the test
  already imports the server `ATTACKS` cross-boundary). Rejected: bundling
  `spacetimedb/src/attacks.ts` into the client at runtime (the server file can later gain
  server-only imports and break the client build at a distance) and new row columns (static
  registry data does not belong per-row).

### Kit numbers & cooldown pacing (D4-07/D4-08 fulfillment)
- **D5-08 — per-role cooldown split (additive column):** `unit_attack` gains
  `basicCooldownUntilMicros: t.u64().default(0)` (additive, migrate-safe per the
  spacetimedb-migrate-gotchas rule). `cooldownUntilMicros` stays the SKILL cooldown.
  `selectAttack` gains the basic-cooldown parameter and now gates basics too:
  `(distance, nowMicros, skillCooldownUntil, basicCooldownUntil, available)`. The IDLE
  transition writes the field matching the finished attack's `role`. Rejected: one shared
  cooldown for all attacks (slam's 5.5s would block swing → 5.5s of dead facetank air, the
  exact ATK-05 anti-pattern).
- **D5-09 — slam retune + band split (D4-07 honored):** `leapSlam.cooldownMicros` 3.5s →
  **5.5s**. Bands: slam stays 0..8 (skill), swing = basic band **0..3.5** (melee poke). Beyond
  3.5u with slam on cooldown → selection returns null → existing chase closes distance (D4-13).
- **D5-10 — damage seeds (chain cannot one-shot):** swing `damageMultiplier` **1.5×**
  contactDamage (→ 135/195/255 raw), swirl **2.5×** (→ 225/325/425 raw). Chain worst case =
  4.0× = **680 raw on the big goliath < 950 minimum squishy HP pool** — the swing+swirl chain
  alone cannot one-shot even before 'contact' resistance (roadmap note satisfied; slam stays
  the big hit at 4.5×). Damage lands in the SAME shared `playerDamage` map → same 'contact'
  resistance channel as the slam.
- **D5-11 — timing seeds (exact tick multiples):** swing windup **4 ticks (0.6s)** — faster
  than slam's 1.2s (it's the cheap poke) but reactable over real RTT; active 1, grace 1;
  recovery UNUSED (chains into swirl). Swirl windup **5 ticks (0.75s)** — the chain warning
  window; active 1, grace 1, recovery **8 ticks (1.2s)** = the chain's single punish window.
- **D5-12 — reactions (D4-10 recorded intents, verbatim):** swing = **stun-only**
  (stunTicks 4 ≈ 0.6s, knockback 0 — Phase-4 playtest showed 0.3s reads as stutter); swirl =
  **knockback** (~4.5u, stunTicks 0 — the spin throws you clear, movement stays yours).
  Seeds; user tunes in playtest (D-02 pattern).
- **D5-13 — chain pacing:** basic (chain) cooldown seed **2.5s**, written at swirl's IDLE
  transition. Resulting rhythm at melee ≈ slam → chain → short gap → chain → slam off
  cooldown — the D4-08 basic-basic-skill feel.

### Telegraph & animation readability (SC3)
- **D5-14 — cone telegraph = sector variant of the D4-14 language:** instant full-sector
  outline + progress sector expanding from the apex over the windup + rim flash at strike —
  `THREE.RingGeometry`'s `thetaStart/thetaLength` gives the sector slice; positioned at
  `castX/Z`, oriented from the cast→landing aim vector; same `#86e2ff`, additive blending,
  depth-test off, timing re-derived from the server row (ANIM-01). Swirl reuses the EXISTING
  circle telegraph path untouched (D5-04).
- **D5-15 — chain readability = sequencing, not pre-showing:** the swirl telegraph appears at
  swirl's own windup entry (0.75s warning). No double-telegraph during the swing — the chain
  teaches itself through repetition; SC2's "move OUT" is enforced by swirl's radius vs its
  windup escape distance.
- **D5-16 — two distinct procedural clips** on the existing `animateAttack` hook (ANIM-03):
  swing = arm/torso wind-back during windup → forward slash lunge at strike; swirl = torso
  coil → full 360° spin through strike, recovery settles heavy. Neutral-restore contract from
  04-05 (animateMovement re-poses first) carries.

### Claude's Discretion
- Exact `chainsInto` glue shape in `unitAttacks.ts` (how the STRIKE→RECOVERY branch swaps to
  `enterWindup(swirl)`; whether swing's `recoveryEndsAtMicros` is written-but-unused) and the
  coalesced-tick test for "swing strike + chain windup entry in one pass".
- `resolveCone` exact signature/edge semantics (inclusive edges like `resolveCircleHit`;
  zero-length aim fallback mirroring `knockbackDisplacement`).
- Cone sector mesh construction + progress-fill technique so the sector reads through the
  pixel filter at max pixelation (ANIM-02) — verify like 04-04 did.
- Per-attack strike juice variants (shake magnitude, WebAudio whoosh/thud composition) keyed
  by `attack_strike.attackId` — both SMALLER than the slam's full juice; swing lightest.
- Exact client-mirror module shape (`src/game/data/attacks.ts`) + which fields serverSync
  asserts (at minimum: windup/active/grace/recovery ticks, cooldowns, ranges, multipliers,
  chainsInto, cone angle).
- Whether the goliath stays rooted through BOTH windups (expected: yes — D4-12 applies per
  windup; the swirl cast root = wherever the swing left it).
- Inert band values authored on `swordSwirl` for parity sanity.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & milestone constraints
- `.planning/REQUIREMENTS.md` — ATK-02, ATK-03 (this phase's requirements), ATK-06 cone note
  (reuse `isWithinForwardArc`, no dead stubs), Locked decisions, Out of Scope table (no
  homing windups, no sub-0.3s windups, no drain+strikes).
- `.planning/ROADMAP.md` §"Phase 5" (Goal + 3 Success Criteria + Notes — cooldown/one-shot
  modeling mandate) and §"Cross-Cutting Constraints".
- `.planning/PROJECT.md` — milestone goal (dodgeable attacks; why the chain must be honest).

### Prior-phase context (binding)
- `.planning/phases/04-attack-state-machine-leapslam-end-to-end-delete-goliath-drai/04-CONTEXT.md`
  — D4-01..D4-17 (grace, bystanders, per-attack reaction data, rooted windup, telegraph
  language, D4-07 retune mandate, D4-08 rhythm — all consumed here).
- `.planning/phases/04-attack-state-machine-leapslam-end-to-end-delete-goliath-drai/04-RESEARCH.md`
  + `04-PATTERNS.md` + `04-VALIDATION.md` — spine research, pattern map, what playtest tuning
  changed (knockback 3→6, stun 2→7 ticks — precedent for seed-then-tune).
- `.planning/phases/02-server-authoritative-damage-crit-on-enemies/02-LEARNINGS.md` — event
  emission + migrate lessons the strike path already follows.

### Server seams (to extend)
- `spacetimedb/src/attacks.ts` — `ATTACKS`/`UNIT_ATTACKS`/`selectAttack` (add 2 entries +
  `chainsInto` field + basic-cooldown param + slam 5.5s retune; bands split per D5-09).
- `spacetimedb/src/unitAttackFsm.ts` — `enterWindup`/`dueAttackTransitions` (chain entry
  reuses these; likely unchanged or minimally extended).
- `spacetimedb/src/attackHitbox.ts` — add `resolveCone` (reuse `isWithinForwardArc` from
  `goliathAI.ts` + range check); `resolveCircleHit` serves swirl unchanged.
- `spacetimedb/src/unitAttacks.ts` — the glue: chain branch at STRIKE→RECOVERY, per-role
  cooldown writes, cone strike resolution (aim from castX/Z→landingX/Z).
- `spacetimedb/src/goliathAI.ts` — `isWithinForwardArc` (~line 69; the cone arc test).
- `spacetimedb/src/index.ts` — `unit_attack` table (~456: add `basicCooldownUntilMicros`
  additive `.default()`), `attack_strike` (~638: carries attackId — no change expected),
  `runUnitAttacks` call site in `worldTick`.

### Client seams (to extend)
- `src/game/systems/createTelegraphSystem.ts` — shape branch: cone sector (new) vs circle
  (existing); needs attackId→shape lookup from the new client mirror.
- `src/game/systems/createGoliathRenderer.ts` — `animateAttack` (~100): branch per attackId
  for the two new clips; neutral-restore contract at ~82.
- `src/game/systems/createEntityRenderer.ts` — `AttackAnimationView` (whether it needs the
  attackId — it must, for per-attack clips).
- `src/game/createGame.ts` — attack_strike juice handler (~153, ~1402): per-attack variants.
- `src/App.tsx` — `attackStrike` useTable (~292): no change expected (event already carries
  attackId).
- `src/game/data/attacks.ts` — NEW client mirror (shape/angle/juice hints, D5-07).
- `src/game/data/__tests__/serverSync.test.ts` — `ATTACKS` parity block (~346–369): extend to
  the two new entries + chain/cone fields; MUST stay green (SC3).

### Design language & ops
- Frost design language (memory): icy-cyan `#86e2ff` telegraphs, minimal footprint.
- Self-hosted SpacetimeDB (memory): NO maincloud publish — local publish + migrated-DB
  playtest only; prod deploy is a separate self-host gate.
- spacetimedb-migrate-gotchas (memory): the new column MUST have `.default()`; verify on the
  populated local DB, not a fresh seed.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- The ENTIRE Phase-4 spine: `unit_attack` schema (landing/cast fields already encode a cone's
  apex + aim point), `enterWindup` (locks any target sample), `dueAttackTransitions`
  (resolve-never-drop), `resolveStrike` loop (live-position resolution + shared playerDamage +
  knockback/stun writes), telegraph sync/fill/flash machinery, `animateAttack` hook,
  attack_strike juice pipeline. Phase 5 is data + two branches, not new architecture.
- `isWithinForwardArc(headingX, headingZ, fromX, fromZ, targetX, targetZ, minDot)` — the cone
  test exists; `resolveCone` = this + a `distanceBetween` range check.
- `resolveCircleHit` + circle telegraph — serve `swordSwirl` with ZERO changes (D5-04).
- `THREE.RingGeometry(inner, outer, segments, 1, thetaStart, thetaLength)` — sector slice for
  the cone telegraph; same material/renderOrder recipe as the circle rings.
- serverSync `ATTACKS` parity block (`it.each(Object.entries(ATTACKS))`) — new entries are
  asserted automatically; extend field coverage for chain/cone.

### Established Patterns
- Registry-as-data (FSM-04): a new attack is ONE `ATTACKS` entry — this phase proves it twice.
- Seed-then-tune (D-02/04-07 precedent): author numbers as seeds, user retunes in playtest.
- Test-first pure helpers; grep-gate (no `Math.random`/`Date.now` in `spacetimedb/src`).
- Event emission UNCONDITIONAL at the transition, before victim branching (Phase-2 lesson —
  applies to swing's strike event even when it whiffs into the chain).
- ONE subscription per table; telegraph timing re-derived from the row (ANIM-01).

### Integration Points
- `selectAttack` signature change ↔ its call site in `unitAttacks.ts` + pure tests — same
  slice.
- New column → publish (additive) → `pnpm run spacetime:generate` → client bindings pick up
  `basicCooldownUntilMicros` (client ignores it; render-only).
- Chain branch sits INSIDE the existing transition walk — the coalesced-tick cascade must
  still terminate (swirl deadlines are now-relative, so a single pass cannot loop).
- `AttackAnimationView` gains attackId (or equivalent) so `animateAttack` can branch clips —
  camp enemies unaffected (hook stays optional, ANIM-03).
</code_context>

<specifics>
## Specific Ideas

- D4-08 verbatim: the goliath should feel like a FIGHTER — "basic-basic-skill rhythm, never
  skill-skill-skill". This phase is where that rhythm becomes real (swing chain = the basics).
- The chain teaches by repetition: swing's cone pushes you sideways/back, swirl then punishes
  standing back in — you must commit OUT. Sequenced telegraphs, no double-warning (D5-15).
- Phase-4 playtest precedent: reactions were doubled/tripled after feel testing — expect the
  same tuning pass on swing stun + swirl knockback; author them as easy-to-edit `ATTACKS` data.
</specifics>

<deferred>
## Deferred Ideas

- **shieldDash-after-whiff selection preference** — Phase 6 discuss (selection weighting after
  a whiffed chain; carried from 04-CONTEXT).
- **shieldDash reaction assignment** (knockback+stun intent recorded in D4-10) — Phase 6.
- **Reposition/strafe AI between attacks** — revisit ONLY if the Phase-5 kit still feels
  static (carried from 04-CONTEXT).
- **3-hit+ chains / per-archetype attack lists (XCMB-03)** — v2; `chainsInto` makes them pure
  data when wanted.

### Reviewed Todos (not folded)
5 keyword matches reviewed, 0 folded (auto mode; scope guardrail overrides the mechanical
≥0.4 threshold — same ruling as Phases 3/4):
- **Phase 6 raid boss DEFERRED** (0.6) + **Phase 7 role enforcement DEFERRED** (0.6) —
  explicitly reserved for a LATER milestone (ROADMAP §Reserved); spurious "phase" keyword.
- **BŪSTS orbit v2** (0.4) — VFX work unrelated to the attack FSM.
- **CIEŅA star restyle** (0.3) — UI restyle, different domain.
- **Miss/evasion decision** (0.2) — pending USER pros/cons decision; Phase 5 must NOT
  introduce miss RNG.
</deferred>

---

*Phase: 5-swordswing-swordswirl-combo*
*Context gathered: 2026-07-10 (auto mode)*
