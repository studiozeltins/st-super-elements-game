---
phase: 11
slug: lived-in-props-wear
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-18
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.4 (present) |
| **Config file** | `vitest.config.ts` (existing) |
| **Quick run command** | `pnpm exec vitest run src/game/systems/__tests__/groundInfluenceMath.test.ts src/game/systems/__tests__/surfaceAt.test.ts src/game/world/__tests__/grassPlacement.test.ts` |
| **Full suite command** | `pnpm exec vitest run` |
| **Estimated runtime** | ~15–40 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick run command
- **After every plan wave:** Run the full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~40 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-*-* | bend-retune | 1 | WEAR-04 | — | N/A (client cosmetic) | unit | `pnpm exec vitest run src/game/systems/__tests__/groundInfluenceMath.test.ts` | ✅ (update) | ⬜ pending |
| 11-*-* | scorch-retune | 1 | WEAR-03 | — | N/A | unit | `pnpm exec vitest run src/game/systems/__tests__/groundInfluenceMath.test.ts` | ✅ (update) | ⬜ pending |
| 11-*-* | surface-classifier | 1 | WEAR-05 | — | N/A | unit | `pnpm exec vitest run src/game/systems/__tests__/surfaceAt.test.ts` | ❌ W0 | ⬜ pending |
| 11-*-* | footpath-thinning | 1 | WEAR-01 | — | N/A | unit | `pnpm exec vitest run src/game/world/__tests__/grassPlacement.test.ts` | ✅ (recheck) | ⬜ pending |
| 11-*-* | footpaths bake | 2 | WEAR-01 | — | N/A | manual | perceptual UAT | — | ⬜ pending |
| 11-*-* | plaza props | 2 | WEAR-02 | — | N/A | manual | perceptual UAT | — | ⬜ pending |
| 11-*-* | dust puffs | 2 | WEAR-05 | — | N/A | manual | perceptual UAT + `?nodust` bisect | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/game/systems/__tests__/surfaceAt.test.ts` — NEW: pins `surfaceAt(x,z)` classifier (grass/dirt/town) against roadFactor + footpath factor + isInTown, exhaustive + mutually-exclusive.
- [ ] `src/game/systems/__tests__/groundInfluenceMath.test.ts` — UPDATE: stale assertion at ~L81-85 (`<0.1 @60s`) fails after `WEAR_REGROW_TIME_CONSTANT_SECONDS 25→75`; new contracts — bend `decayForDelta(2) < 0.10` after `DECAY_PER_FRAME_AT_60 0.985→0.980`, wear reads ~0.45 @60s and <0.10 by ~2.9min.
- [ ] `src/game/world/__tests__/grassPlacement.test.ts` — RECHECK: meadow-cluster/count assertions after worn-path grass thinning (mirrors the d643c24 stale-assertion fix pattern).

*Framework already installed (vitest 3.2.4) — no install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Worn footpaths read as trampled routes on real camp↔camp / plaza↔bridge lines, blades still poke through, never fade | WEAR-01 | Visual bake — no test can assert "reads as a worn path" | Load LAN page, walk the camp↔plaza↔bridge routes; confirm lighter-than-road tint, thinned-not-cleared grass, permanence |
| Plaza reads lived-in ("who put this here") | WEAR-02 | Perceptual arrangement judgment | Load, inspect plaza — crates/barrels stacked at market edge, fences at path/plaza gaps; deliberate not random |
| Scorch heals over minutes; ~2s bend trail behind player | WEAR-03/04 | Live timing feel over a real cycle | Fight to scorch ground, leave, return after ~1–3 min; run and watch own grass-bend trail fade in ~2s |
| Sprint dust puffs on dirt/path only, ground-hugging, subtle | WEAR-05 | Perceptual + surface-gating by eye | Run over grass (no dust) vs dirt/path/town (puffs); toggle `?nodust` to confirm bisect flag zeroes them |
| Frame rate holds with all ambiance enabled | (milestone SC) | Perf gate | `scripts/fps_playtest.py` golem fight with wind+daynight+audio+wear on |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (visual bakes are manual-only by nature — documented above)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (surfaceAt.test.ts)
- [ ] No watch-mode flags
- [ ] Feedback latency < 40s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-18 (plan-checker verified: each requirement's test created test-first within its own plan; no unresolved automated:MISSING references)
