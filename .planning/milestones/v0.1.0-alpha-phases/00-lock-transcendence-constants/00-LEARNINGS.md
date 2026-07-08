---
phase: 0
phase_name: "Lock transcendence constants"
project: "super-elements"
generated: "2026-07-08"
counts:
  decisions: 4
  lessons: 3
  patterns: 3
  surprises: 1
missing_artifacts:
  - "UAT.md"
---

# Phase 0 Learnings: Lock transcendence constants

## Decisions

### Constants live inline in constants.ts, not a separate transcendence.ts
The six client mirror constants were added inline to `src/game/data/constants.ts` (matching the existing `SAFE_ZONE_RADIUS` / `GACHA_PULL_COST` `// server` pattern) rather than a dedicated `transcendence.ts` re-export.

**Rationale:** Keeping them in the existing mirror file means the sync test's `../constants` import surface needs no new module, and the pattern already used for other server-mirrored constants stays uniform.
**Source:** 00-01-SUMMARY.md, 00-CONTEXT.md

### TRANSCEND_SHARD_COST is an arrow function, not a numeric const
The per-level cost was implemented as `const TRANSCEND_SHARD_COST = (n: number): number => n;` on both server and client instead of a plain numeric constant.

**Rationale:** A named function gives one editable place for the cost curve in later phases even though it is trivially `n` today; crucially, being a function it never matches the numeric `extractServerConstant` regex, so it is excluded from the drift-sync assertions by design.
**Source:** 00-01-SUMMARY.md, 00-01-PLAN.md

### Declaration-only scope — zero logic wiring this phase
All six constants plus the helper are declared and left intentionally unreferenced by any reducer, lifecycle hook, table, or UI; no schema column, no publish.

**Rationale:** Freezing the numbers in one authority up front lets phases 1–7 each reference a single locked source, while the atomic declaration-only commit keeps the diff to +9 lines with no runtime attack surface or economy math change yet.
**Source:** 00-CONTEXT.md, 00-01-PLAN.md, 00-VERIFICATION.md

### Verbatim SHARD_*/TRANSCEND_* naming, never primogem/fragment/crystal
Constant names use the locked `SHARD_*` and `TRANSCEND_*` prefixes exactly; the user-facing currency noun is "Constellation Shards".

**Rationale:** Naming is non-negotiable per the shared transcendence contract to avoid drift across the multi-phase plan and prevent reintroducing the renamed `primogem` term.
**Source:** 00-CONTEXT.md, 00-VERIFICATION.md

---

## Lessons

### Git-Bash on Windows collapses \\d regex escapes in node -e snippets
The plan's inline `node -e` verification snippets could not run through the Bash heredoc/`-e` path because Git-Bash on Windows collapsed the `\\d` regex escapes; verification had to be done with equivalent scripts written via the Write tool, which preserve the backslashes.

**Context:** Discovered during Task verification on this Windows environment; the TypeScript source regex inside `serverSync.test.ts` was unaffected and passed normally.
**Source:** 00-01-SUMMARY.md

### The existing extractServerConstant regex already handles decimal steps
No test-helper change was needed for the decimal-valued constants (`0.05`, `0.08`) because the existing `const ${name} = (\d+(?:\.\d+)?);` regex already matched decimals.

**Context:** Confirmed before implementation via the CONTEXT spec and validated at test time — the sync assertions passed for the decimal steps with only new `it.each` rows added.
**Source:** 00-CONTEXT.md, 00-VERIFICATION.md

### Server constants must be plain single-line const declarations to stay extractable
Each numeric constant had to be a plain `const NAME = value;` on one line (a trailing `// comment` is fine) so the grep-based sync test could extract it; deviating from that exact style would silently break the drift guard.

**Context:** Enforced by matching the existing economy/constellation constant block style, which the module's tsconfig/lint does not flag despite the symbols being intentionally unused.
**Source:** 00-01-PLAN.md, 00-CONTEXT.md

---

## Patterns

### Server-const ↔ client-const mirror guarded by serverSync.test.ts
Each shared tunable is declared server-side as `const NAME = value;` and client-side as `export const NAME = value; // server`, with `serverSync.test.ts` asserting via `extractServerConstant` that the server literal equals the imported client value.

**When to use:** Any value that must stay identical across the hand-maintained server module and client mirror, where silent drift would corrupt game/economy math once wired.
**Source:** 00-01-SUMMARY.md, 00-VERIFICATION.md

### Function-shaped helper to opt out of the numeric sync regex
Implementing a tunable as an arrow function rather than a numeric const deliberately excludes it from the numeric `extractServerConstant` regex while still mirroring it on both sides.

**When to use:** When you want a named, later-editable tunable (e.g. a cost curve) mirrored client/server but not subject to (or not expressible by) the literal-value drift assertion.
**Source:** 00-01-PLAN.md, 00-01-SUMMARY.md

### Lock-constants-first phase ahead of feature wiring
Freeze all tunables for a multi-phase feature as declaration-only constants in one atomic commit before any reducer/schema/UI work references them.

**When to use:** At the start of a large multi-phase feature where several downstream phases need a single authoritative, name-locked source of numbers and you want to avoid mid-build value drift.
**Source:** 00-CONTEXT.md, 00-01-PLAN.md

---

## Surprises

### Full suite ran 313 tests green off a +9-line declaration-only change
Adding six constants plus a helper produced only a +9-insertion server diff yet the targeted run added meaningful coverage (63 passing) and the full suite held at 313 passing across 21 files with no regressions and a green build.

**Impact:** Confirms the phase was genuinely non-invasive — no schema/reducer diff, no publish — while still expanding the drift-guard safety net, validating the declaration-only approach.
**Source:** 00-01-SUMMARY.md, 00-VERIFICATION.md
