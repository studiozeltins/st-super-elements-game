# Phase 1: Feasibility Spike - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-28
**Phase:** 1-Feasibility Spike
**Areas discussed:** Vendored-bundle git policy, Pixel-filter go/no-go bar, Spike beach fidelity, Spike code fate

---

## Vendored-bundle git policy (STCK-03)

First pass (before repo visibility was checked):

| Option | Description | Selected |
|--------|-------------|----------|
| Commit src/vendor/ | Track vendored build/ bundles in git; .31 git-pull→build just works. Fine IF repo is private. | (initially chosen) |
| Gitignore + deploy copy step | Keep bundles out of git; deploy.ps1 copies from local path before build. | |

**Blocker surfaced:** repo `studiozeltins/st-super-elements-game` is **PUBLIC** — committing paid
Water Pro + Sky Pro bundles would publicly redistribute licensed code (a violation). Re-asked:

| Option | Description | Selected |
|--------|-------------|----------|
| Gitignore + deploy copy step | License-clean, no visibility change; deploy gains a manual dependency. | |
| Make the repo private | Simplest build story; repo no longer public. | |
| Private vendor submodule | src/vendor/ in a separate PRIVATE repo as a submodule; main repo stays public + clean; .31 pulls --recurse-submodules with private auth. | ✓ |

**User's choice:** Private vendor submodule.
**Notes:** Keeps the main repo public while keeping licensed bundles out of public history. `.31`
deploy must add `--recurse-submodules` + private-repo auth.

---

## Pixel-filter go/no-go bar (SPIKE-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Perceptual sign-off | Eyeball spike vs master through the filter; "same identity" = pass. Diff is an aid, not the gate. | ✓ |
| Strict pixel-diff threshold | Numeric bar (e.g. <2% diff) as the hard gate; objective but false-STOPs on float noise. | |

**User's choice:** Perceptual sign-off.
**Notes:** TSL won't be bit-identical to GLSL; a strict diff would false-STOP a look that's fine.

---

## Spike beach fidelity (SPIKE-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Representative slice | Sand + sea at real getTerrainHeight + rocks/props + grass patch; gives the outline pass real edges. | ✓ |
| Bare sand + sea only | Fastest, but a flat plane has no depth discontinuities → outline draws nothing → incomplete gate. | |

**User's choice:** Representative slice.
**Notes:** Needed so the make-or-break depth-outline test is actually valid.

---

## Spike code fate

| Option | Description | Selected |
|--------|-------------|----------|
| Salvage-structured | TSL pixel-filter + outline as an isolated module the spike imports but the game does not; Phase 2 reuses it. | ✓ |
| Pure throwaway | All inline in waterpro-spike.html, deleted after sign-off; Phase 2 re-derives from scratch. | |

**User's choice:** Salvage-structured.
**Notes:** Respects "zero game code touched" (module stays unwired) while saving the hardest 90%.

---

## Claude's Discretion

- Exact spike file layout, TSL node structure, prop placement in the representative slice.
- Perf-capture mechanism (headed Chrome vs user screenshot) and which quality tiers to bracket.
- Where the isolated TSL salvage module lives (constraint: game must not import it in Phase 1).

## Deferred Ideas

None — discussion stayed within phase scope. (Secure-context deploy DPLY-01 and the medium-tier
FPS gate are already scoped to later phases, not deferred here.)

## Note

User asked for a plain-language explanation of "spike" mid-discussion — clarified as a throwaway
experiment (isolated `waterpro-spike.html`) that answers the make-or-break WebGPU/pixel-filter
question before any real game-code change, then is discarded (or partly salvaged, per D-04).
