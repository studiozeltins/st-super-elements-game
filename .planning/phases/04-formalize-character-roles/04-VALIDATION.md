---
phase: 4
slug: formalize-character-roles
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| 4-01-01 | 01 | 1 | REQ-combat-roles | — | N/A (read-only role data) | unit | `pnpm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*The planner owns the authoritative per-task map. Row above is a seed; planner expands it against the final task breakdown (role enum, per-character seeding, CHARACTER_STATS mirror, serverSync coverage, badge render).*

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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
