# Phase 6: shieldDash lane - Context

**Gathered:** 2026-07-11
**Status:** Ready for planning
**Mode:** --all --auto (all gray areas auto-selected; recommended defaults; audit trail in 06-DISCUSSION-LOG.md)

<domain>
## Phase Boundary

The goliath gains `shieldDash` (ATK-04) — a lane/capsule gap-closer that telegraphs a lane,
then commits its BODY along the charge path (`move:'charge'`), resolving EVERY player within
the lane width at strike. The hardest shape (a travelling hitbox), added last, on the proven
Phase-4/5 spine with **zero schema change**:

- Server: one new `ATTACKS` entry (`shieldDash`) + `resolveLane` in `attackHitbox.ts`
  (clamp-to-[0,1] segment projection — the `bridges.ts` math pattern, ATK-06 geometry reuse) +
  a `move:'charge'` body-commit branch in the transition walk/glue (relocate to the lane end at
  strike, layered on the computed `goliathPosition` map before the single apply — the exact
  seam `teleportToLanding` already proves).
- Client render-only: a lane RECTANGLE telegraph branch in `createTelegraphSystem` (same
  fill-is-countdown language, `#86e2ff`), a shield-brace → grounded-lunge → skid procedural
  clip on `animateAttack`, per-attack strike juice, `ATTACK_RENDER` gains `shape:'lane'`.
- The row's existing fields carry the whole shape: `castX/Z` = lane start, `landingX/Z` =
  lane END (computed with overshoot at windup entry), `radius` = lane half-width. **No new
  columns, no new tables** — the simplest deploy of the milestone (module republish only;
  still verified on the populated local DB).
- Deploy: local publish → `pnpm run spacetime:generate` → `pnpm build` → migrated-DB
  playtest. Self-hosted target — NO maincloud publish (self-host pivot, 04-07).

**Out of scope:** poise accrual/interrupt (Phase 7 — `poise` stays reset-on-windup-entry
only), hero FSM (XCMB-04), camp-enemy conversion (XCMB-01), miss/evasion RNG (pending user
decision — separate todo), reposition/strafe AI between attacks (revisit only after the full
3-attack kit is playtested), multi-tick per-tick-collision charge (rejected — see D6-01).
</domain>

<decisions>
## Implementation Decisions

> Cross-cutting constraints (server-authoritative, additive schema, INV-5 `ATTACKS` parity,
> test-first pure helpers, ≤300 LOC/file, tick-multiple windups ≥2 ticks, resolve-never-drop,
> migrated-DB verification, zero new deps, icy-cyan `#86e2ff`) are LOCKED in
> ROADMAP.md/REQUIREMENTS.md. Phase-4/5 decisions carry verbatim: D4-02 grace, D4-03
> bystanders, D4-09 per-attack reaction DATA, D4-11 no knockback safety rails, D4-12 rooted
> windup, D4-14 telegraph language, D5-08 per-role cooldown split, monotonic-stun guard (WR-01).

### Charge motion model (SC2 — the body commits)
- **D6-01 — charge = relocate-at-strike, resolve-once:** `move:'charge'` reuses the PROVEN
  leap seam — at the STRIKE transition the goliath's position is set to the lane END
  (`landingX/Z`), layered on the `goliathPosition` map before the single apply; damage
  resolves ONCE at strike+grace vs LIVE positions along the whole segment (D4-02 verbatim).
  No multi-tick server travel, no per-tick collision, zero new FSM states. The client renders
  the travel (D6-12). Rejected: per-tick travelling collision (per-tick damage is the drain
  anti-pattern this milestone deletes; violates resolve-once determinism) and a multi-tick
  active window (new timing semantics for zero player-facing gain at 150ms ticks).
- **D6-02 — lane end = fixed length with OVERSHOOT, aim locked at windup entry:** aim =
  normalize(target − cast) sampled ONCE at cast (D5-05 pattern); the GLUE computes
  `laneEnd = cast + aim × laneLength[size]` (clamped to world) and passes it to `enterWindup`
  as the target — so `landingX/Z` stores the lane end and `enterWindup` stays UNCHANGED.
  The goliath charges past where you stood (classic dodge-sideways design). Rejected:
  stop-at-target (reads as homing; sidestep near the target becomes undodgeable) and new
  geometry columns (the segment is fully encoded by cast→landing).
- **D6-03 — lane dimensions (SNAP_DISTANCE ceiling):** `laneLength` per size = **6.5 / 7.25 /
  8.0** — hard ceiling 8u because `SNAP_DISTANCE = 8` (`createEntityRenderer.ts:96`): a mesh
  gap > 8u SNAPS instead of animating, which would render the charge as a teleport and kill
  SC2. `radiusBySize` is reused as lane HALF-WIDTH (distance from centerline, matching the
  field's distance-from-center semantics): seed **1.6 / 1.8 / 2.0**. Seeds; user tunes in
  playtest (D-02 pattern).

### Resolver & knockback semantics (ATK-06, SC3)
- **D6-04 — `resolveLane` = segment-distance test, ALL victims:** point-to-segment distance
  via the standard clamp-to-[0,1] projection (the `bridges.ts:78-96` math pattern — ATK-06
  geometry reuse honored) ≤ half-width, INCLUSIVE edges like `resolveCircleHit`/`resolveCone`.
  Every live player in the lane is resolved (D4-03 bystanders; SC3 "not just the first").
  Rejected `pickRayHit` (nearest-only — a projectile picks ONE target; the lane hits all).
  Zero-length segment degrades to the circle test (same degenerate-semantics style as
  `resolveCone`).
- **D6-05 — knockback = perpendicular bulldoze:** knockback center per victim = the CLOSEST
  POINT on the lane centerline → victims shove sideways OUT of the path (reads as being
  bulldozed aside by the shield). A victim exactly on the centerline falls back to the
  supplied heading (existing `knockbackDisplacement` fallback branch). Rejected
  push-along-charge (carries the victim with the goliath — re-tag weirdness, reads as sticky).

### Kit numbers & selection rhythm (D4-08 fulfillment)
- **D6-06 — role 'skill', SHARED skill cooldown (no new column):** `shieldDash` writes the
  existing `cooldownUntilMicros` at IDLE — slam and dash gate each other, enforcing kit
  variety (slam → swing chain → dash → chain → slam…). Rejected per-attack cooldown columns
  (schema churn with no design need; the shared gate IS the rhythm).
- **D6-07 — band 3.5..8.0, listed AFTER leapSlam — the after-whiff preference EMERGES:**
  `UNIT_ATTACKS[goliath].default = ['leapSlam', 'swordSwing', 'shieldDash']`. minBand 3.5
  (point-blank belongs to the swing's melee band — no zero-distance body slam), maxBand 8.0
  (≈ lane reach). With list order deciding skill ties, the deferred
  "shieldDash-after-whiffed-slam" preference (04/05-CONTEXT) falls out of PLAIN band
  selection: slam whiffs → slam on 5.5s cooldown → target flees past 3.5u → dash is the only
  in-band off-cooldown skill → gap-closer fires. NO special weighting code; verify the
  emergence in playtest.
- **D6-08 — timing seeds (exact tick multiples):** windup **6 ticks (0.9s)** — the sideways
  escape distance is only ~half-width + ε ≈ 2u (~0.3s of run), so 0.9s is a generous read
  while still aggressive vs the slam's 1.2s; active 1, grace 1 (D4-02), recovery **8 ticks
  (1.2s)** — the classic whiffed-charge punish window at the lane end. Cooldown seed **6.0s**.
- **D6-09 — damage seed 2.5× contactDamage** (→ 225/325/425 per size) — between the swing
  chain hits and the slam; lands in the SAME shared `playerDamage` map → 'contact' resistance
  channel. Adds no new one-shot path (2.5× alone ≪ the 900 minimum squishy pool; the
  slam+chain worst case was already modeled in D5-10).
- **D6-10 — reaction = D4-10 recorded intent verbatim (knockback + stun):** seeds knockback
  **3.5** (perpendicular, D6-05) + stunTicks **3 (0.45s)** — enough to feel the bash, shorter
  than the swing's escape-race tag since the victim was just displaced OUT of the path.
  Monotonic-stun guard (WR-01) already covers concurrent attackers. Seeds; user tunes.

### Telegraph & charge animation (SC2 rendering, ANIM-01/02)
- **D6-11 — lane telegraph = rectangle variant of the D4-14 language:** instant full-lane
  outline + fill sweeping from the cast end toward the lane end over the windup + rim flash
  at strike — `#86e2ff`, additive blending, depth-test off, timing re-derived from the server
  row (ANIM-01). Oriented by the cast→landing yaw — reuse the cone `anchorGroup` yaw seam
  INCLUDING the 05-04 shape-aware re-anchor rule (a re-cast lane must re-anchor at the new
  cast with fresh yaw). Length derives from the row (|landing − cast|); only the half-width
  needs the client mirror (D6-13).
- **D6-12 — charge clip rides travelFraction:** windup = shield-raised braced crouch leaning
  into the aim (rooted, D4-12); strike→arrival = rapid GROUNDED lunge riding the actual mesh
  travel toward the locked landing (the 04-05 leap-arc precedent minus the parabola — this is
  what keeps sub-8u charges animating instead of snapping); recovery = heavy skid/settle.
  Neutral-restore via the shared `resetAttackPose` contract (05-02) carries.
- **D6-13 — client mirror gains `shape:'lane'` + `laneHalfWidth`:** `ATTACK_RENDER.shieldDash`
  carries the rectangle's half-width (parity-locked to server `radiusBySize` the way
  `coneHalfAngleDegrees` locks to `coneMinDot`) + `stunSeconds: 0.45` (parity-locked to
  stunTicks × 150ms). `juiceColor` = Claude's discretion (shield reads physical/cryo —
  icy-white pops without stealing the telegraph cyan; telegraphs stay Frost cyan regardless).

### World-edge cases
- **D6-14 — bounds policy: clamp the goliath, not the victims:** the computed lane end is
  clamped via the existing `clampToWorld` at the glue (the goliath never relocates out of
  bounds — same guarantee leap has today); victim knockback keeps D4-11 verbatim (edge/bridge
  deaths are a feature, no safety rails). Safe-zone victims are skipped by the existing
  `resolveStrike` guard; a mid-windup goliath death drops the lane telegraph via the existing
  dead-row hygiene + alive-map re-gate (04-04).

### Claude's Discretion
- Exact `resolveLane` signature + where the segment-projection helper lives (inline in
  `attackHitbox.ts` vs importing from `bridges.ts` — prefer a pure local implementation over
  coupling combat to the bridges module; both are ~10 lines).
- Whether `teleportToLanding` generalizes (`move !== 'none'`) or a sibling `chargeToLanding`
  flag is added to `TransitionPlan` — pick whichever keeps `walkAttackTransitions` tests
  cleanest; either way the swing's `move:'none'` stays planted (Pitfall-1 gate holds).
- Lane rectangle mesh construction (PlaneGeometry strips vs shaped ring reuse) + the
  fill-sweep technique so the rectangle reads through the pixel filter at max pixelation
  (ANIM-02) — verify through the filter like 04-04/05-04 did.
- Strike-juice composition (shield clang WebAudio + dust wake along the lane; smaller than
  the slam's full juice) keyed by `attack_strike.attackId`.
- serverSync `ATTACKS` parity extension fields (at minimum: windup/active/grace/recovery
  ticks, cooldown, laneLength, half-width seeds, band, multiplier, knockback, stunTicks,
  `move:'charge'`) + the ATTACK_RENDER half-width parity assertion.
- Whether `attack_strike.radius` carries the half-width for the lane (it should — the juice
  needs the lane geometry; landing carries the end point, `castX/Z` is not on the event — 
  decide if the wake effect needs the cast point and derive from the unit_attack row if so).
- Inert band values / unused-field authoring on `shieldDash` for parity sanity.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & milestone constraints
- `.planning/REQUIREMENTS.md` — ATK-04 (this phase's requirement), ATK-06 lane note (reuse
  ray/segment projection, no dead stubs), Locked decisions, Out of Scope table.
- `.planning/ROADMAP.md` §"Phase 6" (Goal + 3 Success Criteria + Notes — `move:'charge'`
  override before the single apply, collect ALL within laneWidth) and §"Cross-Cutting
  Constraints".
- `.planning/PROJECT.md` — milestone goal (dodgeable attacks; the lane is the last shape).

### Prior-phase context (binding)
- `.planning/phases/04-attack-state-machine-leapslam-end-to-end-delete-goliath-drai/04-CONTEXT.md`
  — D4-01..D4-17 (grace, bystanders, reaction DATA, no safety rails, rooted windup, telegraph
  language, D4-08 rhythm; D4-10 records shieldDash = knockback+stun).
- `.planning/phases/05-swordswing-swordswirl-combo/05-CONTEXT.md` — D5-01..D5-16 (per-role
  cooldown split D5-08, client-mirror pattern D5-07, aim-lock pattern D5-05, seed-then-tune).
- `.planning/phases/04-attack-state-machine-leapslam-end-to-end-delete-goliath-drai/04-RESEARCH.md`
  + `04-PATTERNS.md` — spine research + pattern map (travelFraction leap animation, telegraph
  re-anchor rules).

### Server seams (to extend)
- `spacetimedb/src/attacks.ts` — `ATTACKS` (+1 `shieldDash` entry: shape 'lane', role 'skill',
  new `laneLengthBySize`-style data field), `UNIT_ATTACKS` (+'shieldDash'), `selectAttack`
  (unchanged — band selection covers the gap-closer, D6-07).
- `spacetimedb/src/attackHitbox.ts` — add `resolveLane` (segment projection, D6-04);
  `knockbackDisplacement` reused with per-victim closest-point center (D6-05).
- `spacetimedb/src/unitAttackFsm.ts` — `walkAttackTransitions` charge branch
  (relocate-at-strike flag, D6-01); `enterWindup` UNCHANGED (glue pre-computes the lane end,
  D6-02).
- `spacetimedb/src/unitAttacks.ts` — glue: lane-end computation at selection
  (`clampToWorld`), shape branch in `resolveStrike` (lane test + closest-point knockback
  center), charge position override.
- `spacetimedb/src/bridges.ts:78-96` — the clamp-to-[0,1] segment-projection math pattern
  `resolveLane` mirrors (read, likely don't import — see Discretion).
- `spacetimedb/src/worldRules.ts` — `clampToWorld` (lane-end clamp, D6-14).
- `spacetimedb/src/index.ts` — NO schema change expected; `runUnitAttacks` call site
  untouched.

### Client seams (to extend)
- `src/game/systems/createTelegraphSystem.ts` — shape branch: lane rectangle (new) vs cone
  sector vs circle; `anchorGroup` yaw + 05-04 re-anchor rule at ~92-132.
- `src/game/systems/createGoliathRenderer.ts` — `animateAttack` dispatch (~246-250): add the
  `shieldDash` clip; travelFraction seam documented at ~95 (`maxBand <= 8u keeps it under
  SNAP_DISTANCE`).
- `src/game/systems/createEntityRenderer.ts:96` — `SNAP_DISTANCE = 8` (the lane-length
  ceiling, D6-03; do not change it).
- `src/game/createGame.ts` — attack_strike juice handler: per-attack lane variant.
- `src/game/data/attacks.ts` — `ATTACK_RENDER`: add `shieldDash` (shape 'lane',
  laneHalfWidth, stunSeconds 0.45, juiceColor).
- `src/game/data/__tests__/serverSync.test.ts` — `ATTACKS` parity block: new entry asserted
  automatically; extend field coverage for lane length/half-width/`move:'charge'`; MUST stay
  green (SC3).

### Design language & ops
- Frost design language (memory): icy-cyan `#86e2ff` telegraphs, minimal footprint.
- Self-hosted SpacetimeDB (memory): NO maincloud publish — local publish + migrated-DB
  playtest only.
- spacetimedb-migrate-gotchas (memory): zero new columns this phase, but still verify the
  republished module against the POPULATED local DB, not a fresh seed.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- The ENTIRE Phase-4/5 spine: `unit_attack` row fields already encode a segment
  (`castX/Z` → `landingX/Z`) + a scalar (`radius` → half-width) — the lane needs ZERO new
  storage. `enterWindup`, `dueAttackTransitions`, `walkAttackTransitions`, `resolveStrike`
  loop, telegraph sync/fill/flash, `animateAttack` hook, attack_strike juice pipeline.
- `teleportToLanding` flag + goliath renderer travelFraction animation — the proven
  relocate-and-render pair `move:'charge'` rides (leap already relocates ≤8u and animates it).
- `bridges.ts:78-96` clamp-to-[0,1] point-to-segment projection — the exact math
  `resolveLane` needs (ATK-06 reuse); `pickRayHit` documented as REJECTED (nearest-only).
- `knockbackDisplacement` center-parameterized push + zero-length fallback — serves the
  perpendicular bulldoze with a per-victim closest-point center, no new helper.
- Cone `anchorGroup` yaw + shape-aware re-anchor (05-04) — the lane rectangle orients the
  same way.
- serverSync `ATTACKS` parity block (`it.each`) — the new entry is asserted automatically.

### Established Patterns
- Registry-as-data (FSM-04): the lane is ONE `ATTACKS` entry + one resolver + two branches.
- Seed-then-tune (D-02/D4-07/D5 precedent): all numbers authored as easy-to-edit seeds.
- Test-first pure helpers; grep-gate (no `Math.random`/`Date.now` in `spacetimedb/src`).
- Event emission UNCONDITIONAL at the transition, before victim branching (Phase-2 lesson).
- ONE subscription per table; telegraph timing re-derived from the row (ANIM-01).
- Glue contains ZERO decision arithmetic — deadlines/selection/hit tests live in the pure
  siblings (unitAttacks.ts header contract).

### Integration Points
- `walkAttackTransitions` charge flag ↔ glue position override ↔ pure tests — same slice.
- Lane-end computation sits at the IDLE→WINDUP selection site in `unitAttacks.ts` (before
  `enterWindup`), where target position + spec are both in hand.
- `resolveStrike` shape branch grows a third arm (lane) mirroring the cone branch shape —
  including the per-victim knockback-center variation.
- No publish-order hazard this phase (zero schema change) — but module republish + bindings
  regen + build still required before the client playtest.
</code_context>

<specifics>
## Specific Ideas

- SC2 verbatim: "the goliath's body actually commits down the charge path — it relocates,
  not just swings." The relocate-at-strike + travelFraction render is HOW that commitment
  stays honest at 150ms ticks.
- D4-08 rhythm completes: the full kit is now slam (big skill) / swing-chain (basic filler) /
  dash (gap-closing skill) — at melee the chain fills, at range the dash answers a fled
  target. The deferred after-whiff preference must EMERGE from band selection, not weighting
  code (D6-07); the playtest checks the feel.
- Phase-4/5 playtest precedent: reactions get retuned after feel testing (knockback 3→6,
  stun 2→7 there) — author dash numbers as `ATTACKS` data seeds and expect a tuning pass.
- The charge should read AGGRESSIVE: shorter windup than the slam (0.9s vs 1.2s) is
  deliberate — the dodge is a short sidestep, not an 8m sprint.
</specifics>

<deferred>
## Deferred Ideas

- **Reposition/strafe AI between attacks** — the full 3-attack kit ships this phase; revisit
  ONLY if the goliath still feels static in the Phase-6 playtest (carried from 04/05-CONTEXT).
- **Camp-enemy conversion to the FSM (XCMB-01)** — v2, after the goliath feel is dialed in.
- **3-hit+ chains / per-archetype attack lists (XCMB-03)** — v2; pure data when wanted.
- **Miss/evasion system** — pending USER pros/cons decision (todo); Phase 6 must NOT
  introduce miss RNG.

### Reviewed Todos (not folded)
6 keyword matches reviewed, 0 folded (auto mode; scope guardrail overrides the mechanical
≥0.4 threshold — same ruling as Phases 3/4/5):
- **BŪSTS orbit v2** (0.6) — VFX work unrelated to the attack FSM (spurious "shapes/path"
  keywords).
- **Phase 6 raid boss DEFERRED** (0.6) + **Phase 7 role enforcement DEFERRED** (0.6) —
  explicitly reserved for a LATER milestone (ROADMAP §Reserved); spurious "phase" keyword.
- **CIEŅA star restyle** (0.5) — UI restyle, different domain.
- **Transcend scaling decision** (0.2) — balance decision, different domain.
- **Miss/evasion decision** (0.2) — pending USER decision; explicitly out of scope here.
</deferred>

---

*Phase: 6-shielddash-lane*
*Context gathered: 2026-07-11 (auto mode)*
