---
phase: 01
phase_name: "crit-foundation"
project: "super-elements"
generated: "2026-07-08"
counts:
  decisions: 6
  lessons: 4
  patterns: 5
  surprises: 3
missing_artifacts:
  - "01-UAT.md"
---

# Phase 01 Learnings: crit-foundation

## Decisions

### critDmg is the FULL multiplier, not 1 + bonus
`rollCrit` returns `critDmg` verbatim (e.g. `1.9`), not `1 + critDmg`. Chosen to match the client `CRIT_MULTIPLIER = 1.9` value Phase 2 replaces, so the swap is a straight substitution with no arithmetic re-derivation. Pinned by an explicit test case.

**Rationale:** Zero conversion at the Phase-2 wiring seam = no silent x2-vs-x1.9 drift when the old roll is deleted.
**Source:** 01-01-SUMMARY.md, 01-01-PLAN.md

### Strict `<` crit boundary
Crit decision is `rng() < critRate`; `rng() === critRate` does NOT crit. Boundary asserted directly in a test.

**Rationale:** Removes ambiguity at the exact-equality edge so client/server rolls can never disagree on the boundary case once `ctx.random` slots in.
**Source:** 01-01-SUMMARY.md

### Inline the power-track step constants in damage.ts
`CONSTELLATION_DAMAGE_STEP` (0.08) and `TRANSCEND_DAMAGE_STEP` (0.05) are local consts inside `damage.ts`, not imports — importing them would break the zero-import rule. Each is comment-tagged to its client source.

**Rationale:** Zero-import determinism discipline (D-08) outranks DRY here; parity is recovered by test (plan 03) instead of by shared module.
**Source:** 01-01-SUMMARY.md

### Two parity strategies, picked by whether a regex path exists
Crit-value parity uses the existing `readField`/`extractServerStats` regex scrape (already captures decimals). Weapon/multiplier/constellation-step parity uses import-and-compare across the package boundary, because the inlined server constants have NO `index.ts` regex path to scrape.

**Rationale:** Reuse the cheap regex path where it works; escalate to import-and-compare only for constants that live nowhere regex can reach.
**Source:** 01-03-SUMMARY.md, 01-03-PLAN.md

### CHARACTER_STATS entries stay single-line flat literals
Server crit mirror added as flat single-line literals (no nested braces) so the serverSync extractor regex `(\w+):\s*\{([^}]*)\}` keeps parsing every entry.

**Rationale:** The parity gate depends on a non-greedy `[^}]*` that breaks on nested braces — the data format is load-bearing for the test, not cosmetic.
**Source:** 01-02-SUMMARY.md

### Crit numbers are a role-seeded first pass, tuned later
17 distinct role-coherent critRate values (dps 0.30–0.36, tank 0.10–0.14, healer 0.16–0.19, support 0.20–0.22) set as a first pass (D-01/D-02); user tunes in playtest.

**Rationale:** Land distinctness + role-coherence now (testable), defer feel-tuning to human playtest (not automatable).
**Source:** 01-02-SUMMARY.md, 01-VERIFICATION.md

## Lessons

### Zero-import grep gate also matches comments
The acceptance grep for `import`/`Math.random`/`Date.now`/`ctx` matches prose in header comments, not just code. Header comments had to be phrased to avoid the literal forbidden tokens while still explaining WHY the file is dependency-free.

**Context:** A naive "explain the determinism rule" comment would fail its own gate. Gate greps are token-level, not syntax-aware.
**Source:** 01-01-SUMMARY.md

### `pnpm test -- <filter>` runs the full suite anyway
Per-task verify commands like `pnpm test -- characters` ignore the positional filter under this vitest config and run all 28 files. Harmless (superset of intended check) but means per-task timing ≈ full-suite timing.

**Context:** Don't trust a positional filter to scope a fast check here; use `pnpm exec vitest run <path>` if real scoping is needed.
**Source:** 01-02-SUMMARY.md, 01-03-SUMMARY.md

### `state.record-metric` needs named flags
The metric-recording tool requires `--phase/--plan/--duration/...` named flags, not positional args.

**Context:** Positional invocation silently fails; surfaced during 01-03 close-out.
**Source:** 01-03-SUMMARY.md

### Phase-scope requirement ≠ full requirement wording
CRIT-01's wording includes "replacing" the global roll, but this phase's contract (SC4) is data + tested logic ONLY. The old client roll surviving in `createGame.ts` is correct, not a miss — the verifier flagged this framing explicitly.

**Context:** A verifier reading the raw requirement could false-positive a gap; the ROADMAP success criteria are the actual per-phase contract.
**Source:** 01-VERIFICATION.md

## Patterns

### Zero-import server sibling
Pure logic in a dependency-free server file (`crit.ts`, `damage.ts`) so client vitest imports it across the package boundary AND reducers stay deterministic.

**When to use:** Any server logic that must be both unit-tested from the client package and provably deterministic (no ctx/random/clock).
**Source:** 01-01-SUMMARY.md

### Injected-rng seam
Randomness passed as a `() => number` thunk parameter (`ctx.random` slots in at Phase 2 wiring), never a global random source.

**When to use:** Deterministic modules that need randomness — inject it so the pure core is testable and the reducer supplies the real source.
**Source:** 01-01-SUMMARY.md

### Import-and-compare parity (over regex-scrape)
Import both server and client modules, compare OUTPUTS across sampled inputs, rather than regex-matching source text. Robust to formatting; the only path for inlined constants with no scrape target.

**When to use:** Parity-locking mirrored logic/constants where the value has no stable regex anchor, or where output equality matters more than textual equality.
**Source:** 01-03-SUMMARY.md, 01-03-PLAN.md

### TDD RED→GREEN atomic commits
Per task: failing cross-boundary `test(...)` commit first, then the `feat(...)` implementation. Gate satisfied by commit ordering.

**When to use:** Any pure-helper work where the test can be written before the implementation exists.
**Source:** 01-01-SUMMARY.md

### Role-seeded stat bands
Seed per-character stats from their Role (dps/tank/healer/support) into distinct non-overlapping bands, locked by a `CRIT_BANDS` test.

**When to use:** Bulk per-entity stat authoring where values must be distinct AND role-coherent AND testable before human tuning.
**Source:** 01-02-SUMMARY.md

## Surprises

### Whole trilogy landed with zero deviations
All 3 plans executed exactly as written — no auto-fixes, no architectural decisions mid-flight, both helpers went RED→GREEN on first implementation.

**Impact:** Plan quality was high enough that execution was mechanical; +64 tests (386→450) with zero regressions.
**Source:** 01-01/01-02/01-03-SUMMARY.md

### First executor died on account weekly limit mid-dispatch
The initial 01-01 executor terminated on "weekly limit" after printing only its intro, before any file write. Re-login + re-dispatch on a clean tree recovered with no partial state.

**Impact:** Confirmed the resume-gate value — a clean-tree check before re-dispatch prevented duplicate work. Cost: one wasted dispatch.
**Source:** execution log (orchestrator)

### Worktree isolation auto-degraded to sequential
`worktree base-check` returned `fork-ref-unknown` (origin/HEAD unresolved on `alpha-v0.2.0`), so the phase ran sequentially on the main tree instead of parallel worktrees.

**Impact:** No parallelism for Wave 1's two independent plans; correctness unaffected. To restore parallel worktrees: set `worktree.baseRef:"head"` in `.claude/settings.local.json`.
**Source:** execution log (orchestrator, #683 degrade path)
