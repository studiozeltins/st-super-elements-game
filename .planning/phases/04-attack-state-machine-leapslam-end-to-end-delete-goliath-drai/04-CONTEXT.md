# Phase 4: Attack state machine + leapSlam end-to-end + delete goliath drain - Context

**Gathered:** 2026-07-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Goliaths stop draining on contact and instead commit ONE telegraphed, dodgeable `leapSlam` —
the full server attack-FSM spine proven end-to-end on a single attack:

- Server: `unit_attack` (+ `attack_strike` event) additive tables; windup → strike → recovery
  FSM run inside `worldTick`; `runUnitAttacks` between the position-build pass and the single
  `playerDamage` apply; row-optional state (iterate unit tables, lazily insert attack rows);
  data-driven `ATTACKS` registry + selection fn; `poise` column established (reset-on-windup-entry;
  accrual is Phase 7).
- Attack: `leapSlam` — circle AOE at a landing LOCKED at cast (ATK-01); dodge by leaving.
- Client render-only: filling ground telegraph re-derived from the server row, procedural
  goliath windup/leap/slam animation, strike VFX/SFX on `attack_strike` onInsert, knockback/stun
  rendered.
- The goliath→player per-tick contact drain is DELETED in this same slice; selection fn returns
  an attack in every distance band (no facetank dead zone). Camp and goliath→enemy drains untouched.
- Verified on a MIGRATED (not fresh-seeded) DB and over real maincloud RTT (two-client).

**Out of scope:** swordSwing/swordSwirl (Phase 5 — user re-confirmed), shieldDash (Phase 6),
poise accrual/interrupt (Phase 7), hero FSM (XCMB-04), camp-enemy conversion (XCMB-01),
miss/evasion RNG (pending user decision, separate todo).
</domain>

<decisions>
## Implementation Decisions

> Cross-cutting constraints (server-authoritative, additive schema, INV-5 `ATTACKS` parity,
> test-first pure helpers, ≤300 LOC/file, tick-multiple windups, resolve-never-drop late strikes,
> migrated-DB verification, zero new deps, icy-cyan `#86e2ff`) are LOCKED in ROADMAP.md and
> REQUIREMENTS.md — not re-litigated here. Phase-4 decisions from this discussion:

### Dodge timing & fairness (FSM-02, FSM-05)
- **D4-01:** leapSlam windup = **1.2s (8 ticks @150ms)** — Hades/Genshin boss-AOE budget;
  reactable over maincloud RTT. Rejected 0.9s (RTT eats the budget) and 1.5s (sluggish).
- **D4-02:** Latency model = **favor-the-dodger grace**: strike resolves vs live positions, but a
  player who LEFT the circle within the final grace tick (~150ms / 1 tick) counts as OUT
  (defender-bias, Overwatch/Destiny standard). Needs one tick of position history (or
  prev-tick position snapshot) per attack resolution. Rejected exact-deadline resolve ("I dodged
  that!" over RTT is the feeling this milestone exists to kill).
- **D4-03:** AOE scope = **everyone inside the circle** is hit (shared co-op danger; the telegraph
  never lies to bystanders). Rejected aggro-target-only.

### Damage & pacing (ATK-01, ATK-05)
- **D4-04:** Slam damage = **~4.5× contactDamage per size → 405/585/765** (user chose the
  Souls-tier option over the recommended 3×; ~40–65% of a squishy's 950–1400 HP pool).
  Values seeded in `ATTACKS`; user tunes in playtest (D-02 pattern).
- **D4-05:** Circle radius **scales per goliath size: 4.0 / 4.75 / 5.5 units** — fixes
  center-escape fairness at 1.2s windup (player moveSpeed 6–7.5 → 5.5u escape ≈ 0.75–0.9s);
  the big goliath earns the monster moment. Matches the existing per-size stat pattern
  (`GOLIATH_SIZE_STATS`).
- **D4-06:** Recovery (punish window) = **1.2s / 8 ticks**.
- **D4-07:** leapSlam cooldown = **3.5s in Phase 4** (it is the ONLY attack — avoids dead-air
  walking) with an **explicit Phase-5 retune to ~5.5s** when `swordSwing` lands as the basic
  filler. Full Phase-4 cycle ≈ 6s.
- **D4-08 (kit rhythm — binding on selection-fn design):** the user wants
  **basic-basic-skill rhythm, never skill-skill-skill**. Selection rule: *skill off cooldown +
  target in band → use the skill (maximize DPS); else basic attack (Phase 5+); else chase.* The
  FSM-03 selection fn signature and `UNIT_ATTACKS` data must support filler-vs-skill weighting
  from day one so Phases 5–6 slot in with zero schema change.

### Hit reaction & movement (HIT-01)
- **D4-09:** Hit reaction is **per-attack DATA**: knockback distance + stun duration are fields
  in the `ATTACKS` registry, assigned per attack by animation logic + power (user). Server
  applies displacement/stun authoritatively; client renders.
- **D4-10:** leapSlam reaction = **knockback ~3u + micro-stun 0.3s (2 ticks)**. Recorded intents
  for later phases (assigned in THEIR discusses, fields exist now): swordSwing = stun-only,
  swordSwirl = knockback, shieldDash = knockback+stun.
- **D4-11:** **Edge-of-map/bridge knockback deaths are a feature** — positioning awareness is
  fun (user). No knockback safety rails.
- **D4-12:** Goliath is **ROOTED at the cast point during windup** (crouch in place), then leaps
  to the LOCKED landing at strike. Rejected creep-forward (desyncs body from the locked circle).
- **D4-13:** Between attacks: **existing chase AI unchanged**; body collision still shoves but
  deals ZERO damage; no new reposition/strafe AI this phase.

### Telegraph & strike visuals (ANIM-01..04)
- **D4-14:** Telegraph = **instant full-radius outline + inner disc that fills outward over the
  windup + rim flash at strike** (FFXIV/WoW style — fill % IS the countdown), icy-cyan `#86e2ff`,
  timing re-derived from the server row. Rejected clock-sweep (aliases through the pixel filter)
  and pulse-ring (vibe, not countdown).
- **D4-15:** Strike moment = **full juice**: impact flash + dust/shard burst + SMALL short camera
  shake + slam SFX, fired ONCE on `attack_strike` onInsert. Camera shake needs a taste pass
  (keep small/short).
- **D4-16:** Animation = **crouch (silhouette compress during windup) → leap arc to the locked
  landing → slam impact**, procedural on the existing mesh rig via the `animateAttack` hook; the
  arc interpolates to the landing position already stored on the attack row.

### Scope confirmations
- **D4-17:** `swordSwing` **stays Phase 5** (user confirmed over pulling it forward) — Phase 4
  isolates integration risk on one attack. "Shield rush during recovery" is reframed: NOT a
  recovery-cancel (breaks FSM determinism); Phase 6's selection may PREFER shieldDash right
  after a whiffed slam when the target fled — noted for the Phase 6 discuss.

### Claude's Discretion
- Exact `unit_attack` / `attack_strike` column shapes and the `ATTACKS` /
  `UNIT_ATTACKS[unitKind][archetype]` data layout (within the registry fields decided above:
  shape, windup/active/recovery/cooldown ticks, radius per size, damage multiplier, knockback,
  stunSeconds, `move`, `poiseThreshold`).
- Grace-tick implementation (prev-tick position snapshot vs 1-deep history) — pick the cheaper
  deterministic one.
- Telegraph mesh/shader implementation (ring + disc geometry vs shader fill) and exact
  strike-flash composition; small-camera-shake magnitude.
- Whether the slam's aggro interaction changes (goliath already has aggroPlayer) — keep existing
  aggro semantics unless the selection fn needs a target handle.
- Engage-range band values for the selection fn (must return an attack in every band per ATK-05;
  with one attack this phase, leapSlam covers all bands — design the bands so Phase 5/6 split them).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & milestone constraints
- `.planning/REQUIREMENTS.md` — FSM-01..06, ATK-01/05/06, ANIM-01..04, HIT-01 (this phase's 14
  requirement IDs), Locked decisions, Out of Scope table (no physics engine, no homing windups,
  no sub-0.3s windups, no drain+strikes double-dip).
- `.planning/ROADMAP.md` §"Phase 4" (Goal + 5 Success Criteria + Notes — pass ordering, lazy row
  creation, tick-multiple windups, poise column, latency-model mandate) and §"Cross-Cutting
  Constraints".
- `.planning/PROJECT.md` — core loop (why dodgeable attacks are the milestone).

### Prior-phase context (binding)
- `.planning/phases/01-crit-foundation/01-CONTEXT.md` — trilogy decisions D-01..D-08.
- `.planning/phases/02-server-authoritative-damage-crit-on-enemies/02-CONTEXT.md` +
  `02-LEARNINGS.md` + `02-PATTERNS.md` — event-table pattern, prediction/suppression, pure-helper
  discipline, migrate gotchas.
- `.planning/phases/03-pvp-crit/03-RESEARCH.md` — additive event-table migrate answer
  (`.default()` columns accepted on populated DB — directly applicable to the new tables here).

### Server combat/world seams (to extend)
- `spacetimedb/src/index.ts` — `worldTick` (position-build passes ~3140-3330, the single
  `playerDamage` apply ~3331+, goliath chase/aggro), `GOLIATH_SIZE_STATS` import,
  `goliath` table (~419), contact-drain line to DELETE (~3189, `playerDamage.set(...
  damagePerTick(goliathRow.contactDamage...)`), `enemy_hit`/`attack_strike` event-table analog
  (~569), `resolvePlayerHit` (~1862, crit path the poise interrupt later consumes).
- `spacetimedb/src/enemyStats.ts` — `GOLIATH_SIZE_STATS` (90/130/170 contactDamage — the 4.5×
  base; per-size pattern the radius scaling follows).
- `spacetimedb/src/combatMath.ts` — `damagePerTick`, `distanceBetween`, `stepToward` (pure-helper
  home; new siblings `attacks.ts`, `unitAttackFsm.ts`, `attackHitbox.ts` per roadmap).
- `spacetimedb/src/goliathAI.ts` — `chooseGoliathTargetCamp`, `isWithinForwardArc`, heading
  helpers (selection fn integrates with existing AI).
- `spacetimedb/src/resistances.ts` — `PLAYER_RESISTANCES` 'contact' channel (slam damage channel
  choice: planner verifies whether slam uses 'contact' resistances like the old drain — default
  YES to keep tank identity).

### Client render seams (to extend)
- `src/game/systems/createEntityRenderer.ts` / goliath renderer + `EntityAnimation` — the
  `animateAttack` hook (ANIM-03) and procedural rig.
- `src/game/systems/createEffectSystem.ts` — burst/projectile helpers (strike VFX reuse).
- `src/game/createGame.ts` — world loop, ground height (telegraph must sit on terrain),
  camera (small shake), damage flash seams (`lastPvpHitShownAt` split from Phase-3 fix).
- `src/App.tsx` — subscription list (ONE subscription per table — Phase 2/3 invariant; new
  `unit_attack` subscribe + `attack_strike` useTable/onInsert).
- `src/game/data/__tests__/serverSync.test.ts` — EXTEND to `ATTACKS` duration/shape parity
  (INV-5); keep green.

### Design language
- Frost design language (memory): icy-cyan `#86e2ff`, minimal frostglass UI — telegraph +
  strike VFX must fit it.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GOLIATH_SIZE_STATS` per-size stat rows — radius/damage scaling extends this exact pattern.
- `worldTick` pass structure with the single `playerDamage` map apply — `runUnitAttacks` writes
  strike damage into that map (reuses resistance/death/shard-spill/respawn for free).
- `skill_cast`/`ranged_attack`/`enemy_hit`/`pvp_hit` event tables — proven `attack_strike` pattern
  (`{public: true, event: true}`, onInsert-only, ONE subscription).
- Phase-3 research answer: additive `.default()` columns/tables migrate cleanly on a populated DB.
- `createEffectSystem` bursts + `createDamageNumbers` — strike VFX + damage feedback reuse.
- Deterministic seeded RNG (`createSeededRandom`) + `ctx.timestamp` tick sampling — FSM clock.

### Established Patterns
- Test-first zero-import pure helpers (`attacks.ts`, `unitAttackFsm.ts`, `attackHitbox.ts`
  siblings) before reducer wiring.
- Grep-gate: no `Math.random`/`Date.now` in `spacetimedb/src`.
- Client renders only; timing re-derived `(now − startedAt)/duration` from the server row.
- ≤300 LOC/file; `index.ts` gains only table defs + one `runUnitAttacks` call.

### Integration Points
- `runUnitAttacks(ctx, tick, positions, playerDamage)` between position-build and damage apply.
- Contact-drain deletion at the goliath→player `playerDamage.set` site (~3189) — same slice as
  the selection fn guaranteeing an attack in every band.
- `poise` column on `unit_attack` (or unit row — planner picks) + reset-on-windup-entry, consumed
  by Phase 7.
- New bindings after publish → `pnpm run spacetime:generate` → client telegraph/animation consume
  `unit_attack` rows + `attack_strike` events.
</code_context>

<specifics>
## Specific Ideas

- "Not skills-skills-skills": goliath should feel like a fighter — basics between skills, skills
  on cooldown for max DPS (D4-08). Phase 4 is the spine; the rhythm completes in Phase 5.
- Knockback near edges/bridges killing you is FUN — keep it (D4-11).
- The big goliath's slam is allowed to be terrifying (765 dmg, 5.5u circle) — it's the boss
  moment; small goliaths stay honest (4.0u).
- Fill % = countdown: the player should be able to read "how long until it lands" from the disc.
</specifics>

<deferred>
## Deferred Ideas

- **shieldDash-after-whiff selection preference** — Phase 6 discuss (selection weighting, not a
  recovery-cancel).
- **Per-attack reaction assignments for swing/swirl/dash** — their phases (fields exist now, D4-10).
- **Slam cooldown retune 3.5s → ~5.5s** — Phase 5, when swordSwing lands (D4-07).
- **Reposition/strafe AI between attacks** — rejected this phase; revisit only if the Phase-5 kit
  still feels static.

### Reviewed Todos (not folded)
6 keyword matches reviewed, 0 folded (user confirmed "fold none") — all outside the FSM domain:
CIEŅA star restyle (UI), BŪSTS orbit v2 (VFX), transcend scaling (balance decision), raid-boss +
role-enforcement DEFERRED specs (later milestone), miss/evasion decision (pending user pros/cons —
Phase 4 must NOT introduce miss RNG).
</deferred>

---

*Phase: 4-attack-state-machine-leapslam-end-to-end-delete-goliath-drain*
*Context gathered: 2026-07-09 (interactive)*
