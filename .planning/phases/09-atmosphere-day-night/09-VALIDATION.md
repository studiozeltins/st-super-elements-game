---
phase: 9
slug: atmosphere-day-night
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-14
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.4 |
| **Config file** | vitest config (existing — `windMath.test.ts` precedent from Phase 8) |
| **Quick run command** | `pnpm vitest run src/game/systems/dayNightMath.test.ts` |
| **Full suite command** | `pnpm vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick command for the touched pure-helper test
- **After every plan wave:** Run `pnpm vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green + human two-client LAN playtest (night readability + LAN time-of-day sync — server-authoritative/visual behavior is not unit-testable)
- **Max feedback latency:** ~10 seconds (pure-helper), visual gates are manual

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _(planner + nyquist-auditor fill this map from PLAN.md tasks)_ | | | | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/game/systems/dayNightMath.test.ts` — pure-helper twin tests (phase math, keyframe smoothstep lerp, night exposure floor, bigint-modulo-before-Number) covering DAYNITE-01/03
- [ ] vitest already installed (Phase 8) — no framework install needed

*Pure math (dayNightMath) is unit-testable; THREE-wrapped rendering + LAN sync + readability are manual/visual.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Distant terrain dissolves into sky; edge hidden; in-radius combat contrast intact | ATMO-01, ATMO-03 | Visual/GPU render | Walk to world edge at day + night; confirm edge hidden and a golem telegraph stays crisp near player |
| Sky-bottom color == fog color from one source | ATMO-02 | Visual + shared-reference contract | Inspect horizon seam across full cycle; no visible fog/sky mismatch |
| ~20min day-weighted drift; sun direction frozen | DAYNITE-01 | Time-based visual | Observe cycle; confirm shadows never rotate |
| All LAN players see same time of day | DAYNITE-02 | Requires 2 clients | Two-client LAN session; compare time-of-day tint simultaneously |
| Night blue floor never below combat-readable | DAYNITE-03 | Visual readability | Fight at midnight; confirm ~40-50% exposure, palette not darkness |
| Plaza lanterns fade in dusk / out dawn, no light add/remove | DAYNITE-04 | Visual + no-recompile | Watch dusk/dawn transition; confirm intensity fade, no frame hitch |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (or a Manual-Only entry with justification)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
