# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v0.1.0-alpha — Transcendence

**Shipped:** 2026-07-08
**Phases:** A + 0–5 (6) | **Plans:** 23 | **Tasks:** 28

### What Was Built
- Two-tier `gems` / `transcendShards` economy; shard minted on C6-overflow dupe.
- Transcendence install (BŪSTS) — server-gated `transcendCharacter` reducer scaling damage + heal.
- Shards at risk — PVE ground drop, PVP steal, 0-shard erosion with the C0–C6 floor held.
- Character roles (tank/dps/healer/support) on all 17 characters, client+server mirrored.
- Invite-only parties (cap 4) with succession, disband, disconnect-persistence, live roster.

### What Worked
- **Pure-helper-first discipline.** Every reducer's decision logic (`resolveDupeGrant`,
  `resolveTranscendInstall`, `applyDeathShardPenalty`, `partyRules`) was extracted as a
  dependency-free, test-first module before wiring — caught branch/underflow bugs at unit level.
- **Additive migrate-publishes** kept local data intact across all schema changes (no wipes after Phase A).
- **`serverSync.test.ts` parity gate (INV-5)** made client/server number drift a compile/test failure, not a runtime surprise.

### What Was Inefficient
- **STATE.md decision log accumulated `[Phase ?]` entries** — phase attribution was lost on many decisions; a tighter capture step would keep provenance.
- **Maincloud deploy stalled** on a paused DB early (Phase 2) and never caught up — deferred to a manual action, leaving prod behind local for the whole milestone.
- **Two parallel trackers** (GSD `.planning/` + hand-rolled `transcendence/PROGRESS.md`) drifted and had to be reconciled at close.

### Patterns Established
- Extract-pure-then-wire, test-first, one atomic commit per phase.
- Latvian display copy over stable code identifiers (BŪSTS/CIEŅA/SARGS…) — UI-only, code stays English.
- Ship an alpha at a natural slice boundary (Phase 5) and defer a self-contained slice (raid) rather than block the release.

### Key Lessons
1. A milestone can ship short of its full plan — but a deferred phase can carry a core invariant (here INV-4/raid recovery); flag that explicitly so the gap is a decision, not an accident.
2. Pick ONE tracker. The GSD `.planning/` state is canonical; don't maintain a second progress file.
3. Deploy to every target environment each phase, or prod silently rots behind local.

### Cost Observations
- Model mix: predominantly opus (no per-model telemetry captured this milestone).
- Sessions: multiple over 2026-07-03 → 2026-07-08.
- Notable: ~102 `feat(` commits; +49k LOC over the pre-Transcendence base.

---

## Milestone: v0.2.0-alpha — Combat Depth

**Shipped:** 2026-07-13
**Phases:** 1–6 (Phase 7 deferred) | **Plans:** 25 | **Tasks:** 44

### What Was Built
- Server-authoritative damage + crit: reducers take intent, server computes base damage from
  mirrored `WEAPONS` math + rolls per-character crit via `ctx.random` (PVE + PVP spoof holes closed).
- Unit-agnostic attack FSM (windup → strike → recovery) on the 150ms worldTick, additive
  `unit_attack`/`attack_strike` tables, deterministic resolve-never-drop transitions.
- Full goliath roster on 3 hitbox shapes: leapSlam (circle), swordSwing → swordSwirl chain
  (cone → 360°), shieldDash (travelling lane + body commit). Contact drain deleted.
- Frost terrain-draped telegraphs (circle/sector/lane) on server-derived timing; per-attack
  procedural clips, strike juice, server knockback + per-attack stun.

### What Worked
- **Prove-one-shape-then-multiply phasing.** Phase 4 carried ALL integration risk on one circle
  attack; Phases 5–6 were mechanical repeats (5 plans each vs 7) with near-zero rework.
- **Pure-helper-first held again** — lane geometry trio, walkAttackTransitions, dueAttackTransitions
  all vitest-pinned before glue; suite grew 384 → 582 green.
- **Parity gates scale.** serverSync extended to ATTACKS durations/shapes + ATTACK_RENDER;
  client/server drift stayed a test failure, never a playtest surprise.
- **Blocking human-playtest capstones** caught real feel bugs (strike clips never playing at ~11%
  progress, blanket 1.05s stun eating the escape race) that green tests could not.

### What Was Inefficient
- **Capstone plans stalled at close** — both 04-07 and 06-05 sat unexecuted until the user ruled
  them complete at milestone close; verification debt should be burned down when the phase feel
  is fresh, not batched to the end.
- **Maincloud steps went stale mid-milestone** — the self-host pivot (2026-07-09) obsoleted
  SC5/maincloud steps written into Phase-4 plans; environment pivots should trigger a plan sweep.
- **`[Phase ?]` decision provenance** — still leaking unattributed decision entries into STATE.md
  (flagged in v0.1.0 retro, not fixed).

### Patterns Established
- Risky vertical slice first, then data-driven repeats (FSM spine → attack entries).
- Zero-storage derived values (grace deadline computed per call, never stored).
- Registry + per-archetype list data model — a new attack is one entry, a new unit is one list.
- STDB module entry file exports tables/reducers only; shared helpers live in pure siblings
  (module-hooks validator rejects plain function exports at publish, not at tsc).

### Key Lessons
1. Deterministic FSMs on a coarse tick need explicit coalesced-tick contracts (cascade transitions,
   resolve passed deadlines) — authored as pure functions they are provable in vitest.
2. Feel bugs live in denominators and anchors (clip windows, stun freezes) — only blocking human
   playtests find them; keep capstones blocking AND execute them promptly.
3. When the deploy target pivots (maincloud → self-host), sweep every open plan for
   environment-specific steps the same day.

### Cost Observations
- Model mix: predominantly opus (no per-model telemetry).
- Sessions: multiple over 2026-07-08 → 2026-07-13 (~172 commits, +28k/−1.5k LOC).
- Notable: fastest plans ~5 min; capstones dominated wall-clock (05-05: 13h elapsed, 1h active).

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v0.1.0-alpha | multi | 6 | Established pure-helper-first + additive-migrate discipline |
| v0.2.0-alpha | multi | 6 (+1 deferred) | Risky-slice-first phasing; blocking human-playtest capstones; parity gates extended to behavior data (ATTACKS) |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v0.1.0-alpha | 384 | — | resolveDupeGrant, resolveTranscendInstall, transcendDamageMultiplier, applyDeathShardPenalty, partyRules |
| v0.2.0-alpha | 582 | — | rollCrit, computeBaseDamage, attacks.ts registry, unitAttackFsm (dueAttackTransitions/graceDeadline/walkAttackTransitions), attackHitbox (resolveCircle/resolveCone/resolveLane), worldRules |

### Top Lessons (Verified Across Milestones)

1. Extract pure decision logic before wiring reducers — testable, and it catches edge cases early. (v0.1.0, v0.2.0)
2. Prove the risky vertical slice on ONE instance, then multiply via data entries — repeats get cheaper, not costlier. (v0.2.0)
3. Green tests don't cover feel — blocking human playtests are release gates, and their debt must not batch to milestone close. (v0.2.0)
