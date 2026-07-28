---
phase: 01
slug: feasibility-spike
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-28
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — spike phase; validation is on-device manual (perceptual sign-off + headed-Chrome FPS capture) |
| **Config file** | none |
| **Quick run command** | `pnpm build` (must succeed with `src/vendor/` bundles + Sky `data/` resolving in `dist/`) |
| **Full suite command** | headed Chrome at `elements.kingdom.lv/waterpro-spike.html` — visual + FPS capture |
| **Estimated runtime** | ~manual |

---

## Sampling Rate

- **After every task commit:** Run `pnpm build` (spike must still build; game untouched)
- **After every plan wave:** Load the spike in headed Chrome, confirm it renders without console errors
- **Before `/gsd-verify-work`:** Recorded go/no-go artifact set (spike-vs-master screenshots through the filter + both-backend FPS) captured
- **Max feedback latency:** manual

---

## Per-Task Verification Map

*Seeded by the planner from PLAN.md task IDs. This is a spike — most tasks verify by producing an on-device artifact (screenshot, FPS number, port-surface table) rather than an automated test.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | 01 | 1 | SPIKE-01 | — | N/A | manual | `pnpm build` | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements — this is an isolated spike with no test framework to install. Wave 0 = vendored-bundle wiring (`src/vendor/` submodule imports cleanly, Sky `data/` resolves in a built `dist/`).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pixel-art identity reproduced in TSL | SPIKE-02 | Perceptual sign-off, not a strict pixel-diff (D-02) | Open spike vs `master` side-by-side through the pixel filter; eyeball "same pixel-art identity" |
| WebGPU compute confirmed + WebGL2 fallback FPS | SPIKE-03 | Headless can't run WebGPU compute | Headed Chrome; read `renderer.backend.isWebGPUBackend`; measure FPS at candidate tier for both backends |
| Lit water + projectile reactivity de-risked | SPIKE-04 | Visual technique proof | Confirm emissive-overlay lit water + pooled-wake/spray on-screen |
| Vendored bundles + Sky `data/` resolve in `dist/` | STCK-01, STCK-02 | Build-output check | `pnpm build`; confirm Sky cloud-noise `data/` present and resolving in `dist/` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (spike: manual artifact per task acceptable)
- [ ] Sampling continuity: no 3 consecutive tasks without a verification artifact
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Recorded go/no-go artifact set captured before verify
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
