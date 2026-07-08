---
phase: 02
phase_name: "server-authoritative-damage-crit-on-enemies"
project: "super-elements"
generated: "2026-07-08"
counts:
  decisions: 7
  lessons: 5
  patterns: 6
  surprises: 4
missing_artifacts: []
---

# Phase 02 Learnings: server-authoritative-damage-crit-on-enemies

## Decisions

### Event-only rendering replaced predict-then-promote
The plan's predict-then-promote damage-number design (instant local number, promoted on server confirm) was abandoned mid-checkpoint. Every `enemy_hit` — own and others' — renders from the server event at the enemy's exact position.

**Rationale:** Predicted numbers anchored to the PLAYER, not the enemy hit — unusable UX. Event-only puts numbers on the correct enemy, LAN round-trip is imperceptible, and one codepath replaces three (predict/promote/fallback).
**Source:** 02-03-SUMMARY.md

### Fatal hits show full computed damage (ARPG standard)
Killing blows emit `enemy_hit` with the full computed hit amount (MAX_HIT_DAMAGE-clamped), not the sliver of remaining HP.

**Rationale:** Shows true hit strength — the ARPG convention players expect.
**Source:** 02-03-SUMMARY.md

### SKILL_HIT_WINDOW_MICROS = 5s
Server skill-hit window fixed at `5_000_000n` micros.

**Rationale:** RESEARCH Open Q1 recommended range — spans the longest skill animation + projectile travel, so late DoT/ring ticks still earn skill scaling.
**Source:** 02-02-SUMMARY.md

### MAX_HIT_DAMAGE stays 400 — now also bounds legit crits
The defense-in-depth clamp was kept unchanged even though it can now clip legitimate server-rolled crits.

**Rationale:** No regression this slice; raising it is a deferred balance-tuning follow-up (RESEARCH Pitfall 1/A5).
**Source:** 02-02-SUMMARY.md

### Per-target crit roll
Each enemy inside a radius hit gets its own crit roll (not one roll per swing).

**Rationale:** Correct per plan; every target's outcome is independent — matches how `resolvePlayerHit` composes per target.
**Source:** 02-02-SUMMARY.md

### Crit color vivid magenta #ff2bd6
Crit numbers restyled from yellow `#ffcc33` to magenta `#ff2bd6`.

**Rationale:** User-requested at checkpoint — readability/pop against the frost UI. Color-only; crit condition stays server `isCrit`.
**Source:** 02-03-SUMMARY.md

### Maincloud publish deferred
Only LOCAL received the additive migrate; maincloud deliberately untouched.

**Rationale:** STATE ops invariant — maincloud deploys happen at user-facing prod points; additive migrate (never `--delete-data`) still outstanding before prod.
**Source:** 02-03-SUMMARY.md

---

## Lessons

### Event tables obey a one-subscription rule
An event table listed in BOTH the manual `.subscribe([...])` list AND its own `useTable` gets delivered once per subscription — `onInsert` fires twice, drawing two numbers ~0.16u apart. Cached tables dedupe in the client cache; event tables have no cache, so they don't.

**Context:** Root cause of the "two numbers per hit" playtest bug; matches the `pull_result` double-delivery behavior already documented in App.tsx.
**Source:** 02-03-SUMMARY.md

### `.default(0n)` does NOT make a column optional in the insert type
Additive columns with defaults still must be backfilled at EVERY `insert` call site — the SpacetimeDB TS insert type requires them. The third insert site (`restorePlayers`) surfaced only at module compile time.

**Context:** Blocking auto-fix during 02-02; the plan covered seedPlayer + debugSpawnBots but missed the restore path.
**Source:** 02-02-SUMMARY.md

### Live playtest catches what 475 green tests cannot
Three real bugs (number anchored to wrong entity, event-table double-draw, missing fatal-hit emission) all shipped past a fully green build+test suite and were only caught by the human two-client playtest checkpoint.

**Context:** All three are frame-level/visual or event-delivery properties no unit test asserted. Confirms the server-authoritative-UX-needs-human-playtest discipline.
**Source:** 02-03-SUMMARY.md

### Guarded event emission silently drops edge cases
All four `enemy_hit` inserts originally sat inside the `remaining > 0` survivor branch — fatal hits never emitted, so killing blows showed no number. Pre-existing, invisible until a player watched a kill.

**Context:** Emission guards written for one purpose (survivor bookkeeping) accidentally scoped the broadcast too.
**Source:** 02-03-SUMMARY.md

### `spacetime build` rejects `--project-path` on this machine
Build the module via `cd spacetimedb && spacetime build`; the `spacetime:generate` npm script already compiles the module during codegen.

**Context:** CLI flag incompatibility, no functional impact.
**Source:** 02-02-SUMMARY.md

---

## Patterns

### ctx-injected determinism
Pure helpers take an RNG thunk; the reducer injects `() => ctx.random()`. Time enters as `ctx.timestamp` micros arguments. `spacetimedb/src` stays free of `Math.random`/`Date.now` (grep-gated) while all math stays unit-testable with seeded PRNGs.

**When to use:** Any server logic needing randomness or time — keep the reducer thin, the math pure.
**Source:** 02-02-SUMMARY.md

### Intent-not-value reducer signatures
Client sends `isSkill + comboCount` (intent); server computes the damage number. Closes the spoof surface entirely — there is no client-authored value to trust.

**When to use:** Every combat-adjacent reducer (Phase 3 PVP extends this to `attackPlayer`).
**Source:** 02-02-SUMMARY.md

### Single damage-resolution seam
`resolvePlayerHit(ctx, hitter, isSkill, combo, dmgType, profile?)` composes base → crit → resist → clamp; both melee (`attackEnemies`) and ranged (`attackRay`) route through it.

**When to use:** Adding any new hit path (PVP, raid boss) — route through the seam, never re-compose inline.
**Source:** 02-02-SUMMARY.md

### Emit event rows BEFORE the fatal/survivor branch
Broadcast events unconditionally right after resolution; only bookkeeping (HP write, loot, despawn) branches on survival.

**When to use:** Any server event that clients render — kills must broadcast like any other outcome.
**Source:** 02-03-SUMMARY.md

### Import-and-compare cross-boundary parity test
Client vitest imports the server module's mirror constants across the package boundary and asserts key-set + per-field equality against the client originals (`serverSync.test.ts`, 139 tests).

**When to use:** Every client/server mirrored constant (INV-5); a parity failure is release-blocking drift.
**Source:** 02-01-SUMMARY.md

### Seeded-PRNG statistical divergence regression
Two identically-seeded `mulberry32` instances drive the real `rollCrit` 2000× so ONLY the tested stat differs (vesper 0.36 vs glacia 0.10 → assert >2× crits). Automates a "visibly different frequency" requirement without flakiness.

**When to use:** Any probabilistic behavior needing an automated proxy for a visual/statistical acceptance criterion.
**Source:** 02-01-SUMMARY.md

---

## Surprises

### The plan's core rendering design didn't survive first contact
Predict-then-promote was fully designed, implemented, and committed (`95a7cf7`) — then deleted the same day after one playtest round showed numbers rising from the player.

**Impact:** ~1 wasted implementation round, but the replacement is simpler (net −105 LOC). Reinforces: gate UX designs on a live playtest before polishing them.
**Source:** 02-03-SUMMARY.md

### Event-table delivery semantics differ from cached tables
Double-subscribing a normal table is harmless (cache dedupes); double-subscribing an event table double-fires callbacks. The SDK behavior is by-design but easy to trip.

**Impact:** One full debug iteration; now codified as the one-subscription rule with an App.tsx comment.
**Source:** 02-03-SUMMARY.md

### A compile-time-only insert site
`restorePlayers` (backup/restore path) failed the module build for the new columns even though no test touches it — the plan's audit of insert sites missed the restore reducers.

**Impact:** Blocking but instantly fixable; future additive-column plans should grep ALL `.insert(` sites including restore/seed/debug paths.
**Source:** 02-02-SUMMARY.md

### Checkpoint plan took 6× longer than autonomous plans
02-01 ≈10min, 02-02 ≈20min, 02-03 ≈2h — the human-verify checkpoint drove 3 fix iterations (anchor, double-draw, fatal-hit) plus a restyle.

**Impact:** The time went to finding REAL bugs, not overhead — budget checkpoint plans accordingly and treat playtest iterations as expected, not overrun.
**Source:** 02-03-SUMMARY.md
