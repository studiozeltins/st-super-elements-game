---
phase: 12
slug: wildlife
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-18
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.4 (present) |
| **Config file** | `vitest.config.ts` (existing) |
| **Quick run command** | `pnpm exec vitest run src/game/systems/__tests__/wildlifeMath.test.ts` |
| **Full suite command** | `pnpm exec vitest run` |
| **Estimated runtime** | ~15–40 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick run command
- **After every plan wave:** Run the full suite command
- **Before `/gsd-verify-work`:** Full suite green + `scripts/fps_playtest.py` FPS gate
- **Max feedback latency:** ~40 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 12-*-* | wildlifeMath pure twin | 0 | WILD-01/02/03 | unit | `pnpm exec vitest run src/game/systems/__tests__/wildlifeMath.test.ts` | ❌ W0 | ⬜ pending |
| 12-*-* | butterflies pool | 1 | WILD-01 | unit (pool cap/cull) + manual | `pnpm exec vitest run` | ❌ W0 | ⬜ pending |
| 12-*-* | flush birds pool + wing sfx | 1 | WILD-02 | unit (arc/debounce) + manual | `pnpm exec vitest run` | ❌ W0 | ⬜ pending |
| 12-*-* | fireflies pool | 1 | WILD-03 | unit (pulse/gate) + manual | `pnpm exec vitest run` | ❌ W0 | ⬜ pending |
| 12-*-* | createGame wiring + ?no* flags | 2 | WILD-01/02/03 | manual + FPS gate | perceptual + fps_playtest.py | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red*

---

## Wave 0 Requirements

- [ ] `src/game/systems/__tests__/wildlifeMath.test.ts` — NEW: pins the pure THREE-free twin `wildlifeMath.ts` — summed-sine/noise wander position, firefly pulse phase, bird rising-arc, day/dusk/night gate thresholds, spawn/despawn ring gating, flush debounce. Deterministic, no allocations (windMath/dayNightMath pattern).

*Framework already installed (vitest 3.2.4) — no install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Butterflies read as a sparse "event", wander naturally over grass by day, spawn/despawn near player | WILD-01 | Perceptual density + motion feel | Roam grass by day; confirm rare, natural drift, none at night; `?nobugs` removes them |
| Sprinting through grass flushes 2–4 birds on a rising arc + wing one-shot, then despawn; no retrigger spam | WILD-02 | Timing/feel + audio | Sprint through grass; confirm burst + wing sound once, arc up, despawn; `?nobirds` off |
| Fireflies pulse at dusk/night as emissive quads, randomized phase; none by day; no new lights | WILD-03 | Perceptual glow + day/night gate | Advance to dusk/night; confirm glowing pulses, none by day; `?nofireflies` off |
| FPS holds with ALL ambiance enabled | SC4 (milestone gate) | Perf | `scripts/fps_playtest.py` golem fight, wind+daynight+audio+wear+wildlife on; toggle `?no*` to isolate cost |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (visual/FPS are manual by nature)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (Wave 0 twin covers the math)
- [x] Wave 0 covers all MISSING references (wildlifeMath.test.ts)
- [x] No watch-mode flags
- [x] Feedback latency < 40s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-18
