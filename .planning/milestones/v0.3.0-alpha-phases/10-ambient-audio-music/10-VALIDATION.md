---
phase: 10
slug: ambient-audio-music
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-18
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (already in repo — see `src/game/systems/__tests__/*.test.ts`) |
| **Config file** | existing vitest config (project root) |
| **Quick run command** | `npx vitest run src/game/audio` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5–20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/game/audio`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01 | 01 | 0 | AMBI-02/03/05/06/07, MUSIC-02 | — | N/A (pure fns) | unit | `npx vitest run src/game/audio/__tests__/combatState.test.ts src/game/audio/__tests__/ambienceMath.test.ts` | ❌ W0 | ⬜ pending |
| 10-02 | 02 | 1 | AMBI-01, MUSIC-03 (backend setters) | localStorage clamp | dense fights never clip (compressor on master); volume×duck compose on series nodes | unit+manual | `npx vitest run src/game/audio` | ❌ W0 | ⬜ pending |
| 10-03 | 03 | 2 | AMBI-02/03/05/06/07 | — | N/A | unit+manual | `npx vitest run src/game/audio` + golem/day-night playtest | ❌ W0 | ⬜ pending |
| 10-04 | 04 | 3 | AMBI-04 | — | N/A | unit+manual | `npx vitest run src/game/audio` + sprint-rustle playtest | ❌ W0 | ⬜ pending |
| 10-05 | 05 | 3 | MUSIC-03 (settings UI) | localStorage clamp | corrupt persisted value falls back to default (music 0.7 / sfx 1.0) | manual | slider persist + reload + independent-mute playtest | — | ⬜ pending |
| 10-06 | 06 | 4 | AMBI-06, MUSIC-01/02 | — | N/A | unit+manual | `npx vitest run src/game/audio` + combat crossfade/duck + FPS gate (`scripts/fps_playtest.py`) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · one row per plan; the planner's per-task IDs live in each PLAN.md.*

---

## Wave 0 Requirements

- [ ] `src/game/audio/__tests__/combatState.test.ts` — pure `isInCombat` hysteresis twin (enter-now / exit-after-cooldown) for AMBI-06 + MUSIC-02.
- [ ] `src/game/audio/__tests__/ambienceMath.test.ts` — pure one-shot scheduler math twin (next-interval + pitch/pan/vol jitter bounds, never fixed-interval) for AMBI-03/05/07.

*The two pure helpers are extracted test-first, mirroring the `windMath` / `dayNightMath` discipline. All other audio behavior (bus routing, decode/loop, duck ramps, gust→bed) is verified by build + human playtest.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| No clipping in dense fights | AMBI-01 | Perceptual / compressor tuning | Trigger a golem-class fight with many SFX; confirm no audible clipping. |
| Bed swells with visible gusts | AMBI-02 | Audio-visual sync perception | Watch flags/grass gust and confirm the wind bed gain rises with them. |
| Randomized one-shots (not a metronome) | AMBI-03/05 | Perceptual randomness | Listen ≥60s; confirm bird/grunt intervals + pitch vary, never fixed. |
| Day birds / night crickets+owl | AMBI-07 | Time-of-day perception | Observe across a day/night cycle (or `?` time override). |
| Combat duck + music crossfade | AMBI-06/MUSIC-02 | Perceptual, no hard cut | Enter/leave combat; confirm ~1s duck-down, ~2–3s restore, birds stop, music crossfades. |
| Music/SFX volume persist independently | MUSIC-03 | localStorage + reload | Set sliders, reload, confirm persisted; muting music keeps SFX. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (combatState + ambienceMath twins in 10-01)
- [x] No watch-mode flags
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-18
