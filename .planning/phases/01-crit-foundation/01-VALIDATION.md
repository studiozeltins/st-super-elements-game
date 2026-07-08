---
phase: 1
slug: crit-foundation
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-08
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` (repo root) |
| **Quick run command** | `pnpm test -- <name>` (targeted, e.g. `pnpm test -- crit`) |
| **Full suite command** | `pnpm test` (= `vitest run`) |
| **Estimated runtime** | ~5 seconds (targeted) / ~15 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run the task's targeted `pnpm test -- <name>`
- **After every plan wave:** Run `pnpm test` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01-01 | 1 | CRIT-01, CRIT-03 | T-01-02 | `rollCrit` deterministic, injected rng, no `Math.random`/`Date.now`/`ctx` | unit (tdd) | `pnpm test -- crit` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01-01 | 1 | CRIT-03 | T-01-01 | `computeBaseDamage`/`WEAPONS` mirror pure, zero-import | unit (tdd) | `pnpm test -- damage` | ❌ W0 | ⬜ pending |
| 1-02-01 | 01-02 | 1 | CRIT-01 | — | 17 distinct client `critRate`/`critDmg` on `CharacterDefinition` | unit | `pnpm test -- characters` | ✅ | ⬜ pending |
| 1-02-02 | 01-02 | 1 | CRIT-03 | — | `CHARACTER_STATS` crit mirror (flat single-line, INV-5) | unit | `pnpm test -- serverSync` | ✅ | ⬜ pending |
| 1-02-03 | 01-02 | 1 | CRIT-01 | — | crit distinctness (set size 17) + role-coherent bands | unit | `pnpm test -- characters` | ✅ | ⬜ pending |
| 1-03-01 | 01-03 | 2 | CRIT-03 | — | client↔server crit-value parity (regex path) | parity | `pnpm test -- serverSync` | ✅ | ⬜ pending |
| 1-03-02 | 01-03 | 2 | CRIT-03 | — | weapon/multiplier/`CONSTELLATION_DAMAGE_STEP` parity (import-and-compare) | parity | `pnpm test -- serverSync` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · File Exists ❌ W0 = test file created RED in this phase (tdd task)*

---

## Wave 0 Requirements

- [ ] `src/game/data/__tests__/crit.test.ts` — new, RED-first for `rollCrit` (task 1-01-01)
- [ ] `src/game/data/__tests__/damage.test.ts` — new, RED-first for `computeBaseDamage` + mirror (task 1-01-02)

*`serverSync.test.ts` and `characters.test.ts` already exist — Phase 1 extends them in-place (no new fixture files).*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.* Phase 1 is data + pure logic wired to nothing — no runtime behavior to exercise by hand. Crit value tuning (D-02) is a later playtest concern, not a Phase-1 verification.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (`crit.test.ts`, `damage.test.ts`)
- [x] No watch-mode flags (all commands are `vitest run` via `pnpm test`)
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-08
