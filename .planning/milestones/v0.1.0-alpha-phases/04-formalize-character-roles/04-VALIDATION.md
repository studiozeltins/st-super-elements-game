---
phase: 4
slug: formalize-character-roles
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-07
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | existing repo vitest config (no Wave 0 install needed) |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test && pnpm build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test`
- **After every plan wave:** Run `pnpm test && pnpm build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | REQ-combat-roles | — | N/A (compile-time union data) | build | `pnpm build` | ✅ | ⬜ pending |
| 4-01-02 | 01 | 1 | REQ-combat-roles | — | N/A (parity assertion, no input) | unit | `pnpm test` | ✅ | ⬜ pending |
| 4-01-03 | 01 | 1 | REQ-combat-roles | — | N/A (additive local publish) | manual | `spacetime publish … --server local` | ✅ | ⬜ pending |
| 4-02-01 | 02 | 2 | REQ-combat-roles | — | N/A (static CSS tokens) | build | `pnpm build` | ✅ | ⬜ pending |
| 4-02-02 | 02 | 2 | REQ-combat-roles | — | N/A (read-only display span) | build | `pnpm build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Sampling continuity: no window of 3 consecutive tasks lacks an automated gate — 4-01-03 (manual publish) sits between test-covered 4-01-02 and build-covered 4-02-01. Badge visual placement is the sole manual verify (see below).*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.* `serverSync.test.ts` and its `extractServerStats`/`readField` plumbing already exist; the role-coverage tests extend it. No new framework install.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Role badge renders on CharacterScreen / CharacterSheet | REQ-combat-roles | Visual placement + color parity with sibling tags not asserted by unit tests | Open character screen, confirm role pill visible in `.cchar__id` stack and `.sheet__meta` row, correct color+Latvian label per role |

*Server-side role storage and client↔server equality ARE automated via serverSync.test.ts.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none — existing infra covers all)
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-07
