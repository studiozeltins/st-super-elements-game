---
gsd_state_version: 1.0
milestone: v0.4.0-alpha
milestone_name: WebGPU Sky & Water
current_phase: 01
current_phase_name: feasibility-spike
status: executing
stopped_at: Completed 01-03-PLAN.md
last_updated: "2026-07-28T14:40:40.716Z"
last_activity: 2026-07-28
last_activity_desc: Phase 01 execution started
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 4
  completed_plans: 3
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-28)

**Core value:** A retained PVPvE loop — chase endless Transcendence power, contest it via PVP
theft + co-op raids, no progress-wipe churn (C0–C6 is a protected floor). This milestone
re-platforms the renderer (WebGL→WebGPU/TSL) so the sea and sky become commercial-grade and
reactive **without losing the sacred pixel-art identity**.
**Current focus:** Phase 01 — feasibility-spike

## Current Position

Phase: 01 (feasibility-spike) — EXECUTING
Plan: 4 of 4
Status: Ready to execute
Last activity: 2026-07-28 — Phase 01 execution started

Progress: [████████░░] 75%

## Roadmap Summary

| Phase | Goal | Requirements |
|-------|------|--------------|
| 1. Feasibility Spike | Prove the pixel filter survives on WebGPU + measure perf + de-risk both no-API asks; recorded go/no-go sign-off with STOP escape hatch | STCK-01..03, SPIKE-01..04 |
| 2. Renderer + Pixel-Filter Port | WebGL→WebGPU async bootstrap; pixel filter + depth-outline ported to TSL pixel-correct; custom shaders flat-shaded | RNDR-01..05 |
| 3. Shader Ports to TSL | 17 GLSL surfaces → node materials, one subsystem per commit, screenshot-gated | SHDR-01..07 |
| 4. Water Pro | Retire createSeaWater → WaterSystem at SEA_LEVEL + player wake; anti-features off; FPS-holding tier | WATR-01..05 |
| 5. Sky Pro | Retire sky dome + day/night path → SkySystem server-clock-driven, coupled to water once, starfield night | SKY-01..05 |
| 6. Reactive & Lit Water + Ship | Pooled projectile wake + spray, lit sea, glow overlays, combat FPS gate, secure-context deploy decision | REAC-01..05, DPLY-01 |

Order is DEPENDENCY-FORCED (spike → renderer → shaders → water → sky → reactive); all four
research streams converged on it independently. Water needs the node graph; Sky feeds Water's
provider; reactive needs Water's wake. Do NOT re-order. Each phase is screenshot-gated; ports
land one subsystem per commit; old sea/sky deleted in the same commit that replaces them.

## Performance Metrics

**Velocity (this milestone):**

- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

*Updated after each plan completion.*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 9 | 2 tasks | 6 files |
| Phase 01 P02 | 22 | 2 tasks | 5 files |
| Phase 01 P03 | 11 | 3 tasks | 3 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Locked for this milestone (from research):

- **Zero new runtime dependencies**: three@0.185.1 already ships `three/webgpu` + `three/tsl`;
  Water Pro + Sky Pro are **vendored** (prebuilt `build/` copied into `src/vendor/`, not aliased
  to their `src/`). Sky Pro's peer floor is exactly 0.185.0 — three must never be downgraded.

- **Client-only milestone**: zero SpacetimeDB publishes. Day/night stays server-anchored via the
  SDK reducer-event timestamp (`Date.now()` fallback); Sky Pro's `autoAdvanceSecondsPerDay = 0`
  (never self-advance — that desyncs LAN players).

- **Pixel-art identity is sacred** (P0 make-or-break): if the pixel filter can't be reproduced on
  WebGPU/TSL, STOP and keep WebGL. Recorded user go/no-go sign-off gates Phase 2.

- **"Emissive water" has no native API**: re-scoped as sparkle/SSS/lifted-waterColor/bloom +
  additive transparent overlays for localized glow (REAC-03/04), never a water-material emissive.

- **Wake ≤16 generators/frame, horizontal-motion only**: pooled + reused (`updateGenerator`),
  never add/remove per projectile; vertical impacts = spray, not wake. Spray is null on WebGL2 —
  optional-chain every call, degrade silently.

- [Phase ?]: Vendor repo owner = logingrupa (Option B): studiozeltins is a separate user account the CLI (roulendz) cannot create repos under; used logingrupa org instead. Private repo logingrupa/st-super-elements-vendor as src/vendor submodule.
- [Phase ?]: Vendored the EXISTING prebuilt build/ output (Jul 21) instead of re-running npm build:lib; copied the FULL build/ tree (not just index.js/d.ts) so tsc -b resolves the bundle's 152 sibling .d.ts re-exports.
- [Phase ?]: Spike TSL pixel filter: both shapes as post nodes (whole=pixelate-then-chunky-rim, final=rim-then-pixelate-last); true low-res scene pass deferred to Phase 2 if perceptual sign-off favors 'whole'
- [Phase ?]: Spike props use plain MeshStandardMaterial, not the game's onBeforeCompile GLSL rock/terrain shaders (those cannot compile on WebGPURenderer)
- [Phase ?]: [Phase 1]: FPS numbers captured on-device (headed Chrome, plan 04), NOT headless — SwiftShader can't run WebGPU compute; plan 03 delivers the HUD + ?forceWebGL=1 capture mechanism only
- [Phase ?]: [Phase 1]: STCK-02 is a FLAG — built dist/ omits Sky data/*.bin (dynamic new URL Vite can't track); inline Vite copy plugin deferred to Phase 5

### Pending Todos

10 pending (see `.planning/todos/pending/`) — all carried from prior milestones (raid boss,
role enforcement/balance, crit poise interrupt, boost-orbit-v2, ciena-star-restyle,
expand-transcend-scaling, miss/evasion decision). None block this milestone.

### Blockers/Concerns

- **Pixel-filter reproduction on WebGPU is the make-or-break unknown** (MEDIUM confidence) —
  resolved only by the Phase 1 spike: prototype BOTH resolution shapes, screenshot-diff vs
  `master`. If neither works, halt (sanctioned escape hatch, keep WebGL).

- **On-device WebGPU + WebGL2 FPS unmeasured** — Phase 1 must produce headed-Chrome profiles for
  both backends (headless Playwright + SwiftShader can't run WebGPU compute).

- **Secure-context deploy decision** — plain-http LAN players silently fall back to WebGL2
  (slower FFT/wake, spray null). Force-https requires confirming the cloudflared `.31→.32:3000`
  routing survives (remote-domain-topology memory). Resolved at the ship gate (DPLY-01, Phase 6).

- **Sky Pro `data/` + starmap must survive the Vite build** — verify `data/` resolves in the
  laragon-served `dist/` at `elements.kingdom.lv`, not just dev; ship a PD starmap or night is
  black. First checked in Phase 1, wired in Phase 5.

- **Perf rules are the real risk** (past 144→20 and 24fps regressions): start `medium` tier,
  profile every step, preserve frozen-matrix/gated-shadow throttles through the shader port,
  pool everything, no per-frame allocs.

## Deferred Items

Items acknowledged and carried forward from previous milestone closes:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Feature | Elemental resistance system | Deferred to future milestone | 2026-07-06 |
| Feature | XP/levelling for players + enemies | Deferred to future milestone | 2026-07-06 |
| Feature | Email password reset (needs external service) | Deferred | 2026-07-06 |
| Phase | Raid boss (party-gated shard faucet, INV-4) | Reserved milestone | 2026-07-08 |
| Phase | Role enforcement + balance + full validation | Reserved milestone | 2026-07-08 |
| Combat | Camp-enemy FSM + hero FSM + tiered poise + weapon crit (XCMB-01..05) | v2 combat expansion | 2026-07-08 |
| Phase | Crit poise interrupt (POISE-01..03) | Reserved milestone | 2026-07-13 |
| Feature | Weather (rain, puddles) — WTHR-01 | Deferred (expensive) | 2026-07-13 |
| Feature | Time-of-day gameplay hooks (TODG-01) | Needs server work | 2026-07-13 |
| Verification | Phase 9.1 dynamic-sun FPS/human gate | Superseded by v0.4.0 Sky Pro | 2026-07-28 |
| Verification | Phase 10 ambient-audio human gate | Backlog | 2026-07-28 |
| Feature (v2) | Water buoyancy / floating objects (WDEP-01) | Deferred this milestone (YAGNI) | 2026-07-28 |
| Feature (v2) | Underwater camera mode (WDEP-02) | Deferred (camera never submerges) | 2026-07-28 |

## Session Continuity

Last session: 2026-07-28T14:40:28.269Z
Stopped at: Completed 01-03-PLAN.md
Resume file: None

Next: `/gsd-plan-phase 1` (Feasibility Spike) — the highest-uncertainty phase; flagged for
`--research-phase` (pixel-filter TSL reproduction, WebGPU/WebGL2 on-device perf, both no-API asks).
</content>
