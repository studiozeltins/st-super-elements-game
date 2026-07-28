# Phase 1: Feasibility Spike - Context

**Gathered:** 2026-07-28
**Status:** Ready for planning

<domain>
## Phase Boundary

An **isolated** `waterpro-spike.html` (repo root, vite-served, never shipped) that proves the
game's sacred pixel-art identity is reproducible on `WebGPURenderer` + TSL, measures on-device
perf (WebGPU compute + WebGL2 fallback), and de-risks both no-native-API asks (lit water,
projectile reactivity) — ending in a **recorded user go/no-go sign-off** with a sanctioned STOP
escape hatch (if the pixel look can't be reproduced, work halts and keeps the WebGL renderer).

**Zero game code touched.** The spike stands entirely beside the game; it does not import from
or modify `createGame.ts` or any game system. Requirements: STCK-01..03, SPIKE-01..04.

Discussion clarified HOW to run the spike so its go/no-go is trustworthy — not WHAT to build
(that is locked by REQUIREMENTS.md + the milestone handoff).

</domain>

<decisions>
## Implementation Decisions

### Vendored-bundle git policy (STCK-03)
- **D-01:** `src/vendor/` (the paid Water Pro + Sky Pro prebuilt `build/` bundles) lives in a
  **separate PRIVATE git repo, added to the main repo as a submodule.** The main repo
  `studiozeltins/st-super-elements-game` **stays PUBLIC** and license-clean (no commercial code
  in its public history); `.31` deploy pulls with `--recurse-submodules` (needs private-repo
  auth on `.31`). — **Reversibility:** costly — undoing means rewriting `.gitignore`, the
  submodule wiring, and the `.31` deploy pull/auth; a wrong first choice here (committing paid
  code to the public repo) is a license violation that also lives in public git history.
  - **Context:** the repo is PUBLIC — the originally-recommended "commit `src/vendor/`" would
    have publicly redistributed licensed paid code (the reason `./pro/` is already gitignored).
    Submodule keeps the repo public AND the bundles out of public history.
  - **Deploy impact:** `deploy-pipeline-31` (git-pull→build on `.31`) must gain
    `--recurse-submodules` and private-repo credentials on `.31`; verify the build succeeds
    end-to-end before relying on it.

### Pixel-filter go/no-go bar (SPIKE-02)
- **D-02:** The make-or-break verdict is a **perceptual sign-off**, not a strict numeric
  pixel-diff. User eyeballs spike vs `master` side-by-side **through the pixel filter**; "same
  pixel-art identity" = pass. Screenshot-diff is a visual aid, NOT the gate. — Rationale: TSL
  node math won't be bit-identical to the old GLSL, so a strict diff threshold would false-STOP
  on harmless float/rounding noise on a look that is actually fine.

### Spike beach fidelity (SPIKE-01)
- **D-03:** Build a **representative slice**, not a bare plane: sand + sea at real
  `getTerrainHeight` (`SEA_LEVEL = -0.8`) + a handful of rocks/props + a small grass patch, at
  the game's tilted top-down camera. — Rationale: the depth-outline pass draws on depth
  discontinuities; a flat sand plane has none, so the outline would render nothing and the
  go/no-go would be signed off on an incomplete test. The slice gives the outline real edges and
  the pixel filter something to bite on.

### Spike code fate
- **D-04:** **Salvage-structured.** Write the TSL pixel-filter + depth-outline as an **isolated
  module** (e.g. `src/game/engine/tsl/`) that the spike html imports but the **game does not**
  (respects "zero game code touched"). Phase 2 reuses this module directly instead of rewriting
  the hardest 90%. — **Reversibility:** reversible — it is a new, unwired module; if the spike
  STOPs, the module is deleted with no game impact.

### Claude's Discretion
- Exact spike file layout, TSL node structure, and how the representative props are placed.
- Perf-capture mechanism (headed Chrome vs user screenshot) and which quality tiers to bracket
  when measuring — left to research/planning (headless can't run WebGPU compute; start `medium`
  per the locked tier decision, measure the WebGL2 fallback too per SPIKE-03).
- Whether the isolated TSL module lives under `src/game/engine/tsl/` or a spike-local dir —
  constraint is only that the game must not import it during Phase 1.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone spec & handoff (read first)
- `.planning/v0.4.0-alpha-WEBGPU-WATERPRO-HANDOFF.md` — the full implementation brief: real Water
  Pro / Sky Pro APIs, the "engine migration not a water swap" framing, phased plan, escape hatches.
- `.planning/REQUIREMENTS.md` §Feasibility Spike (SPIKE) + §Vendoring & Stack (STCK) — the locked
  requirement IDs this phase satisfies.
- `.planning/ROADMAP.md` §"Phase 1: Feasibility Spike" — goal + 5 success criteria.
- `.planning/PROJECT.md` §Current Milestone + §Locked Decisions — milestone framing + naming/invariants.
- `.planning/STATE.md` §Accumulated Context — locked milestone decisions (zero new deps, client-only,
  pixel-art sacred, emissive=overlay, wake ≤16 pooled) + Blockers/Concerns.

### Purchased asset docs (vendored under ./pro/, read before writing integration code)
- `./pro/Three.js Water Pro v3.2.1/threejs-water-pro/docs/guide/*.md` — installation, basic-example,
  wake, water-masking, quality-levels, post-processing, sky-pro-integration, spray, wave-tuning.
- `./pro/Three.js Water Pro v3.2.1/threejs-water-pro/docs/api/*` + `demo/` — real end-to-end wiring.
- `./pro/Three.js Sky Pro v2.0.0/threejs-sky-pro/docs/guide/*.md` + `docs/api/*` + `demo/`.
- `./pro/Three.js Sky Pro v2.0.0/threejs-sky-pro/build/data/` — cloud-noise data that MUST ship
  alongside the Sky bundle (STCK-02: verify it resolves in a built `dist/`, not just dev).

### Project memories (context the agents should honor)
- `webgpu-waterpro-pivot`, `deploy-pipeline-31`, `remote-domain-topology`, `ssh-database-pc`,
  `always-analyze-performance`, `threejs-cpu-overhead-traps`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/game/engine/createPixelRenderer.ts` (~10.5KB) — the pixel-filter pipeline to reproduce in
  TSL: `PerspectiveCamera(45)` game camera, low-res render target + nearest upscale via an
  `OrthographicCamera` blit, depth-discontinuity outline pass. This is the exact thing the spike
  must prove reproducible (D-02) and the salvage module ports (D-04).
- `src/game/world/terrain.ts` — `getTerrainHeight(x,z)` and `SEA_LEVEL = -0.8`; the spike beach
  samples these for a faithful archipelago slice (D-03).
- `src/game/world/createSeaWater.ts` (~10.5KB) — the custom sea being replaced by Water Pro
  later; the spike renders Water Pro beside/over the sampled beach, not this. Kept as the WebGL
  fallback until Water Pro renders correctly (per handoff).
- `src/game/systems/createDayNightCycle.ts` — the day/night path Sky Pro replaces in Phase 5;
  spike only needs Sky Pro rendering, not this.

### Established Patterns
- 17 custom `ShaderMaterial`/`onBeforeCompile` shaders live under `src/game`
  (`grep -rlE "ShaderMaterial|onBeforeCompile" src/game`) — the spike produces a realistic
  port-surface estimate (SPIKE-04) but ports NONE of them (that is Phase 3).
- `three@^0.185.1` already ships `three/webgpu` + `three/tsl` — zero new runtime deps; Water/Sky
  Pro are vendored, never added as npm deps.

### Integration Points
- None into the running game this phase — the spike is standalone (SPIKE-01: zero game code
  touched). The only new tree artifacts are `waterpro-spike.html`, the `src/vendor/` submodule,
  and the isolated `src/game/engine/tsl/` salvage module (unwired).

</code_context>

<specifics>
## Specific Ideas

- Spike served at `elements.kingdom.lv/waterpro-spike.html` (vite `allowedHosts` already includes
  the host); open in **headed Chrome** for the perf capture — headless + swiftshader can't run
  WebGPU compute.
- Go/no-go is recorded as an artifact set (spike-vs-master screenshots through the filter + the
  FPS numbers for both backends) that the user signs off on before Phase 2 is planned.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Secure-context deploy decision DPLY-01 and the
`medium`-tier FPS gate are already scoped to later phases in REQUIREMENTS.md, not deferred here.)

</deferred>

---

*Phase: 1-Feasibility Spike*
*Context gathered: 2026-07-28*
