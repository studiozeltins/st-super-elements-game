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

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v0.1.0-alpha | multi | 6 | Established pure-helper-first + additive-migrate discipline |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v0.1.0-alpha | 384 | — | resolveDupeGrant, resolveTranscendInstall, transcendDamageMultiplier, applyDeathShardPenalty, partyRules |

### Top Lessons (Verified Across Milestones)

1. Extract pure decision logic before wiring reducers — testable, and it catches edge cases early.
