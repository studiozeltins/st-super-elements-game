---
phase: 13
slug: camera-feel
status: verified
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-20
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.4 |
| **Config file** | `vitest.config.ts` (repo root, present) |
| **Quick run command** | `npx vitest run src/game/systems/__tests__/cameraFeelMath.test.ts` |
| **Full suite command** | `npm test` (`vitest run`) |
| **Compile gate** | `npx tsc -b` (typecheck) / `npm run build` (tsc -b + vite build) |
| **Estimated runtime** | quick ~2s · full suite ~15s · build ~30s |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/game/systems/__tests__/cameraFeelMath.test.ts` (+ `npx tsc -b` on the MOD/system tasks)
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** `npm run build` + `npm test` green, then the manual playtest checklist
- **Max feedback latency:** ~30 seconds (build)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | CAM-01/02/03/04 | T-13-01a / — | N/A (pure math, no input) | unit | `npx tsc -b` | ✅ | ✅ green |
| 13-01-02 | 01 | 1 | CAM-01/02/03/04 | T-13-01a / — | N/A | unit | `npx vitest run src/game/systems/__tests__/cameraFeelMath.test.ts` | ✅ (18 tests) | ✅ green |
| 13-02-01 | 02 | 2 | CAM-03, CAM-04 | T-13-02a / mitigate | Gated projection rebuild + rate gate (perf DoS) | unit (delegated) + compile | `npx tsc -b` | ✅ (twin) | ✅ green |
| 13-03-01 | 03 | 2 | CAM-01, CAM-02, CAM-04 | T-13-03a / mitigate | Positional breathing + conservative pixelScale (no crawl) | unit (delegated) + compile | `npx tsc -b` | ✅ (twin) | ✅ green |
| 13-04-01 | 04 | 3 | CAM-01/02/03/04 | T-13-04b / mitigate | Cooldown rate gate wired to crit handlers | compile + grep | `npm run build` | ✅ | ✅ green |
| 13-04-02 | 04 | 3 | CAM-04 | T-13-04a / mitigate | `=== '1'` coercion; absent key -> OS default; garbage -> off | compile | `npm run build` | ✅ | ✅ green |
| 13-04-03 | 04 | 3 | CAM-01/02/03/04 | T-13-04a/b | Perceptual acceptance | **manual** | human playtest (see below) | manual | ✅ UAT passed |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Wave 0 (the pure-helper testable seam) is **Plan 13-01**:

- [x] `src/game/systems/cameraFeelMath.ts` — pure helpers (`smooth`, `leanTarget`, `breatheOffset`, `startKick`/`stepFovKick`, `projectionActive`, `canKick`, `CAMERA_FEEL`) covering CAM-01..04.
- [x] `src/game/systems/__tests__/cameraFeelMath.test.ts` — the vitest twin (behavior-pinned), 18 tests green.
- No framework install needed (vitest 3.2.4 already configured; 58 test files exist, incl. `windMath.test.ts`).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Run-lean reads right in every direction, no horizon tilt | CAM-01 | "feels right" + directional correctness is perceptual | Run N/S/E/W; body pitches INTO the run direction; world horizon never tilts (Pitfall 1). |
| Idle breathing is calm, not distracting | CAM-02 | Perceptual amplitude/frequency judgement | Stand still; sway is subtle, on the model, never while moving, never on the camera. |
| FOV kick is noticeable-but-rare, never strobes | CAM-03 | Rarity/strobe is perceptual over live combat | Land own crits (kick); AoE/swirl crit-many-in-one-frame must not strobe; damage taken never kicks. |
| No pixel-crawl on a standing character in pixel mode | CAM-04 / D-03 | Crawl on the pixel grid is a perceptual artifact | Pixel filter ON, stand still, inspect the silhouette for shimmer; if present, reduce breathing amplitude before frequency. |
| Toggle zeroes all four motions instantly + persists + OS default | CAM-04 / D-08/D-09 | End-to-end perceptual + reload behavior | Enable toggle mid-combat → lean/breathing/FOV/shake all stop; reload persists; absent key + OS reduce-motion → defaults ON. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (13-04-03 is an irreducible manual gate with a `<human-check>`)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (cameraFeelMath twin, plan 13-01)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-20 · verified 2026-07-21

---

## Validation Audit 2026-07-21

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

All 6 automated tasks COVERED and green: `cameraFeelMath.test.ts` 18/18 pass, `npx tsc -b` exit 0. The single irreducible manual gate (13-04-03 perceptual acceptance) satisfied by UAT (5 passed, 0 issues — commit `5e58ccb`). No auditor spawn required — no gaps.
