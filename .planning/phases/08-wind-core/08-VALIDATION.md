---
phase: 8
slug: wind-core
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-14
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.4 |
| **Config file** | vitest picks up tests via package.json / default config |
| **Quick run command** | `pnpm vitest run src/game/systems/__tests__/windMath.test.ts` |
| **Full suite command** | `pnpm vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run src/game/systems/__tests__/windMath.test.ts`
- **After every plan wave:** Run `pnpm vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| *(filled by planner)* | | | WIND-01..03 | — | N/A | unit | `pnpm vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/game/systems/__tests__/windMath.test.ts` — stubs for WIND-01, WIND-02, WIND-03 (peak cadence, rigid wave translation, wander-rate bound)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual sway coherence (grass/flags/canopy/smoke on one phase) | WIND-01 | Rendering output, human judgment | Load game, observe all consumers gust together |
| Gust fronts travel across field | WIND-02 | Visual spatial effect | Watch field during gust; wave should sweep, not bow uniformly |
| Grass looks unchanged post-extraction; `?nowind` kills sway | WIND-03 | Visual regression | Compare before/after; load with `?nowind`, confirm zero sway |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
