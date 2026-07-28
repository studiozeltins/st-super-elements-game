---
phase: 01-feasibility-spike
plan: 04
subsystem: rendering
tags: [webgpu, spike, go-no-go, sign-off, decision-record, spike-02]

# Dependency graph
requires:
  - phase: 01-01
    provides: "WebGPU + Water Pro + Sky Pro + pixel-node tracer, vendored bundles, spike entry"
  - phase: 01-02
    provides: "Beach slice + both pixel shapes (?shape=whole|final) + sun-facing rim"
  - phase: 01-03
    provides: "Perf HUD + both-backend FPS capture procedure + de-risk (?derisk=1) + STCK-02 flag + 17-shader estimate"
provides:
  - ".planning/phases/01-feasibility-spike/GO-NO-GO.md — consolidated evidence set + unfilled VERDICT (perceptual sign-off gate)"
affects: [phase-2-webgpu-migration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Make-or-break decision recorded as a committed artifact (verdict + rationale + chosen shape) so Phase 2 traces to an explicit sign-off (T-04-R mitigation)"
    - "Evidence-completeness checklist asserted before the human gate (T-04-Q mitigation): both shapes, both backends, camera far, Sky data/ outcome, 17-shader estimate"

key-files:
  created:
    - ".planning/phases/01-feasibility-spike/GO-NO-GO.md"
  modified: []

key-decisions:
  - "The verdict is a PERCEPTUAL sign-off (D-02): user eyeballs spike vs master through the pixel filter; screenshot-diff is an aid, not the gate. Executor assembled evidence only — did NOT decide the verdict."
  - "FPS numbers + screenshots are the headed-Chrome deliverable captured by the user at this gate (headless/SwiftShader has no WebGPU compute — Pitfall 2); GO-NO-GO.md ships the capture procedure + empty fields, not fabricated numbers."
  - "STOP is a first-class outcome: if the pixel-art look can't be reproduced, the milestone halts and the WebGL renderer is kept (sanctioned escape hatch)."

requirements-completed: []

coverage:
  - id: G1
    description: "GO-NO-GO.md assembled with the full evidence set + an unfilled VERDICT section (SPIKE-02, T-04-Q)"
    requirement: "SPIKE-02"
    verification:
      - kind: automated
        ref: "node -e check GO-NO-GO.md contains /VERDICT/ — exits 0"
        status: pass
    human_judgment: false
  - id: G2
    description: "The make-or-break verdict is a recorded human perceptual sign-off (GO+shape or STOP) on complete evidence (SPIKE-02, D-02)"
    requirement: "SPIKE-02"
    verification:
      - kind: manual_procedural
        ref: "headed Chrome: capture §1 runs, fill §2-§4, record §9 VERDICT in GO-NO-GO.md"
        status: unknown
    human_judgment: true
    rationale: "Perceptual sign-off is the locked go/no-go bar (D-02); it can only be judged by a human in headed Chrome and MUST NOT be self-signed by the executor."

# Metrics
duration: 8min
completed: 2026-07-28
status: awaiting-human-signoff
---

# Phase 1 Plan 04: Go/No-Go Sign-Off Summary

**The phase's terminal gate: `GO-NO-GO.md` consolidates every piece of Phase 1 evidence into
one reviewable record and ends with an unfilled VERDICT section. The perceptual sign-off (D-02)
is a human judgment in headed Chrome — the executor assembled the evidence and HALTED at the
blocking-human checkpoint. It did NOT fabricate a verdict.**

## What Was Built

**Task 1 — Assemble the go/no-go artifact set (commit `16feb83`)**

`GO-NO-GO.md` consolidates the phase evidence into one artifact for the human sign-off:

- **Perceptual evidence (§2):** side-by-side spike-vs-`master`-through-the-filter tables for
  BOTH `?shape=whole` and `?shape=final`, plus the one-sided sun-rim and tone/brightness parity
  checks — the primary D-02 input (empty fields for the on-device capture).
- **Capture procedure (§1):** the exact URL(s) at `elements.kingdom.lv/waterpro-spike.html` and
  the four honored knobs (`?shape=whole|final` default `final`, `?tone=neutral|none|off`,
  `?forceWebGL=1`, `?derisk=1`), verified against source, with the 5 runs to perform.
- **Perf evidence (§3):** WebGPU + WebGL2 (`?forceWebGL=1`) FPS table at the medium tier with the
  HUD backend-proof lines, and the one-line backend confirmation
  (`renderer.backend.isWebGPUBackend`, `water.backend`, `water.spray`).
- **De-risk viability (§4):** the two no-native-API asks (lit water via overlay+bloom; pooled
  ≤16 wake + optional-chained spray) behind `?derisk=1`.
- **Camera far + tone (§5):** chosen `far = 20000` (Water Pro horizon ring, Pitfall 1); ACES vs neutral.
- **Sky `data/` dist outcome (§6):** FLAG — runtime-concatenated URL invisible to Vite → 404 in
  built `dist/`; fix deferred to Phase 5 (dev works, which is where the capture runs).
- **17-shader estimate (§7):** 14 port (5×L + 5×M + 4×S) + 3 retire.
- **Evidence-completeness checklist (§8)** and the **unfilled VERDICT (§9)** — GO(shape)/STOP +
  rationale + chosen shape, with the sanctioned STOP escape hatch spelled out.

## Task Commits

1. **Task 1 — assemble go/no-go artifact set** — `16feb83` (docs)

## Checkpoint — PENDING HUMAN SIGN-OFF (blocking-human, by design)

Task 2 is a `checkpoint:human-verify gate="blocking-human"`. The executor HALTED here — it must
not self-sign the verdict. The user must:

1. Open `elements.kingdom.lv/waterpro-spike.html` in **headed Chrome** beside the `master` (WebGL) game.
2. Compare BOTH `?shape=whole` and `?shape=final` against `master` THROUGH the pixel filter — is
   it the "same pixel-art identity"? (perceptual, D-02; the screenshot-diff is an aid, not the gate).
3. Review WebGPU vs WebGL2 (`?forceWebGL=1`) FPS at the medium tier via the on-screen HUD.
4. Confirm the `?derisk=1` lit-water + pooled-wake/spray read as viable; glance at the 17-shader estimate.
5. Fill §2–§4 with screenshots + FPS, then record §9 VERDICT in `GO-NO-GO.md`.

**Resume signal:** `GO shape=whole`, `GO shape=final`, or `STOP` (with a one-line rationale).
GO unblocks Phase 2 planning; STOP halts the milestone and keeps WebGL.

## Deviations from Plan

None — plan executed exactly as written. Task 1 assembled the evidence; Task 2 is the
blocking-human gate, correctly halted rather than self-signed.

## Known Stubs

None. The empty VERDICT/capture fields in `GO-NO-GO.md` are the intended human-input surface, not stubs.

## Self-Check: PASSED

- File `.planning/phases/01-feasibility-spike/GO-NO-GO.md` — FOUND.
- Commit `16feb83` — FOUND.
- `node -e` VERDICT-presence check exits 0 ("artifact assembled").

---
*Phase: 01-feasibility-spike*
*Completed: 2026-07-28 (Task 1); Task 2 awaiting human sign-off)*
