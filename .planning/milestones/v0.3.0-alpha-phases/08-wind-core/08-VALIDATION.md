---
phase: 8
slug: wind-core
status: approved
nyquist_compliant: true
wave_0_complete: true
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
| 08-01 T1 | 08-01 | 1 | WIND-01, WIND-02, WIND-03 | — | N/A | unit (TDD RED) | `pnpm vitest run src/game/systems/__tests__/windMath.test.ts` (MUST fail — Wave 0 gap closes here) | created by task | ⬜ pending |
| 08-01 T2 | 08-01 | 1 | WIND-01, WIND-02, WIND-03 | — | N/A | unit (TDD GREEN) | `pnpm vitest run src/game/systems/__tests__/windMath.test.ts` | ✅ (from T1) | ⬜ pending |
| 08-02 T1 | 08-02 | 2 | WIND-01 | — | N/A | unit + build | `pnpm vitest run src/game/systems/__tests__/createWind.test.ts && pnpm build` | created by task | ⬜ pending |
| 08-02 T2 | 08-02 | 2 | WIND-01, WIND-02 | T-08-01, T-08-03 | Constants-only GLSL interpolation; `?nowind` is a presence-only `URLSearchParams.has()` check | unit + build | `pnpm vitest run && pnpm build` | ✅ | ⬜ pending |
| 08-03 T1 | 08-03 | 3 | WIND-01 | — | N/A | suite + build | `pnpm vitest run && pnpm build` | ✅ | ⬜ pending |
| 08-03 T2 | 08-03 | 3 | WIND-01, WIND-03 | — | N/A | suite + build | `pnpm vitest run && pnpm build` | ✅ | ⬜ pending |
| 08-03 T3 | 08-03 | 3 | WIND-01, WIND-03 | — | N/A | suite + build | `pnpm vitest run && pnpm build` | ✅ | ⬜ pending |
| 08-04 T1 | 08-04 | 3 | WIND-01, WIND-03 | — | N/A | suite + build | `pnpm vitest run && pnpm build` | ✅ | ⬜ pending |
| 08-04 T2 | 08-04 | 3 | WIND-01, WIND-03 | — | N/A | suite + build | `pnpm vitest run && pnpm build` | ✅ | ⬜ pending |
| 08-05 T1 | 08-05 | 4 | WIND-01, WIND-02, WIND-03 | — | N/A | full gate | `pnpm vitest run && pnpm build` | ✅ | ⬜ pending |
| 08-05 T2 | 08-05 | 4 | WIND-01, WIND-02, WIND-03 | — | N/A | manual (checkpoint:human-verify) | MISSING — visual judgment only (see Manual-Only Verifications below); automated coverage lives in 08-05 T1 + windMath suite | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/game/systems/__tests__/windMath.test.ts` — stubs for WIND-01, WIND-02, WIND-03 (peak cadence, rigid wave translation, wander-rate bound) — covered by Plan 08-01 Task 1 (TDD RED, wave 1, first task executed)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual sway coherence (grass/flags/canopy/smoke on one phase) | WIND-01 | Rendering output, human judgment | Load game, observe all consumers gust together |
| Gust fronts travel across field | WIND-02 | Visual spatial effect | Watch field during gust; wave should sweep, not bow uniformly |
| Grass looks unchanged post-extraction; `?nowind` kills sway | WIND-03 | Visual regression | Compare before/after; load with `?nowind`, confirm zero sway |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (08-05 T2 is a justified manual checkpoint; its MISSING marker points to 08-05 T1 automated coverage)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every auto task carries its own `<automated>` command)
- [x] Wave 0 covers all MISSING references (windMath.test.ts created by 08-01 T1)
- [x] No watch-mode flags (all commands use `vitest run`)
- [x] Feedback latency < 30s (quick command ~10s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved by planner (revision pass, 2026-07-14)
