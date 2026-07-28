# Phase 1 Feasibility Spike — GO / NO-GO Decision Record

**Requirement:** SPIKE-02 (make-or-break perceptual sign-off)
**Decision bar:** D-02 — a **perceptual** sign-off. The user eyeballs the spike vs the
`master` game **side-by-side through the pixel filter**. "Same pixel-art identity" = GO.
The screenshot-diff is a visual **aid only**, NOT the gate (TSL node math is not bit-identical
to the old GLSL, so a strict pixel-diff would false-STOP on harmless float noise).
**STOP escape hatch (sanctioned):** if the pixel-art look cannot be reproduced acceptably,
choosing STOP is a first-class outcome — the milestone halts and the existing WebGL renderer
is kept. The pixel-art identity is sacred and not worth losing.

> This artifact consolidates all Phase 1 evidence into one reviewable record and ends with an
> **unfilled VERDICT section** for the human checkpoint. The executor did NOT decide the verdict —
> it only assembled the evidence. The FPS numbers and screenshots below are **captured by the
> user in headed Chrome** during the go/no-go run (headless/SwiftShader cannot run WebGPU
> compute — RESEARCH Pitfall 2 — so no automated capture is possible or trustworthy).

---

## 0. What was built (the spike under judgment)

A standalone, never-shipped `waterpro-spike.html` (2nd Vite entry) that boots
`WebGPURenderer → Water Pro v3.2.1 → Sky Pro v2.0.0 → TSL pixel filter` over a real
`getTerrainHeight`-sampled beach slice (sand + shoreline + rocks + inland grass, straddling
`SEA_LEVEL = -0.8`) at the game's 45° tilted top-down camera. The game's signature pixel-art
identity — low-res nearest upscale + the **one-sided sun-facing depth-outline rim** — is
reproduced in TSL in **both resolution shapes**. Zero game code is touched (D-04: the salvage
TSL module under `src/game/engine/tsl/` is unwired; the game imports neither it nor `src/spike/`).

Provenance (per-plan commits):
- Plan 01 (vendoring + tracer): `5a20d3c`, `d6d9e63`
- Plan 02 (beach slice + both pixel shapes + sun rim): `d1c4e7b`, `cd0388b`, `b2f556d`
- Plan 03 (perf HUD + de-risk + STCK-02 flag + 17-shader estimate): `974464a`, `16e121c`, `c8249db`

---

## 1. Capture procedure (run this in HEADED Chrome, then fill the tables below)

**Where:** `elements.kingdom.lv/waterpro-spike.html` (vite `allowedHosts` already includes the
host). Open in **headed Chrome** — not headless, not SwiftShader. Keep the `master` game
(WebGL build) open beside it for the side-by-side.

**URL knobs the spike honors** (confirmed in source):

| Knob | Values | Effect | Default |
|------|--------|--------|---------|
| `?shape=` | `whole` \| `final` | Resolution shape: `whole` = pixelate the whole composited chain first, then rim on the low-res grid (chunky pixel-aligned outline); `final` = rim at full-res, pixelate last | `final` |
| `?tone=` | `neutral` \| `none` \| `off` (else ACES) | Swaps ACES filmic tone-mapping for neutral (`NoToneMapping`) — brightness/contrast parity check | ACES filmic |
| `?forceWebGL=1` | present/absent | Constructs `WebGPURenderer({ forceWebGL: true })` → measures the WebGL2 fallback tier with the identical instrument | WebGPU |
| `?derisk=1` | present/absent | Enables the SPIKE-04 section: lit water (sparkle/SSS/lifted color + bloom + additive glow overlay) + pooled wake (≤16 generators) + optional-chained spray | off |

The on-screen **perf HUD** self-documents every screenshot: it prints the rolling-average FPS
plus `renderer.backend.isWebGPUBackend`, `water.backend`, and `water.spray !== null`, so each
number is self-attributing to its backend.

**Runs to perform (5 URLs):**

1. `…/waterpro-spike.html` — WebGPU, `?shape=final` (default), medium tier
2. `…/waterpro-spike.html?shape=whole` — WebGPU, whole shape, medium tier
3. `…/waterpro-spike.html?forceWebGL=1` — WebGL2 fallback, medium tier (FPS + confirms no crash on null spray)
4. `…/waterpro-spike.html?derisk=1` — WebGPU, lit-water + wake/spray de-risk visual
5. (optional) `…/waterpro-spike.html?tone=neutral` — brightness/contrast parity check vs `master`

For each: screenshot the spike, screenshot `master` at a comparable framing, and read the HUD.

---

## 2. Perceptual evidence — spike vs `master` THROUGH the pixel filter (D-02)

Record the side-by-side judgment for **each shape**. Paste/link the captured screenshots.
(Empty until the on-device run — this is the primary go/no-go input.)

| Shape | Spike screenshot | `master` screenshot | Same pixel-art identity? (perceptual) | Notes |
|-------|------------------|---------------------|----------------------------------------|-------|
| `?shape=whole` | _(paste/link)_ | _(paste/link)_ | ☐ yes ☐ no | |
| `?shape=final` (default) | _(paste/link)_ | _(paste/link)_ | ☐ yes ☐ no | |

**Sun-facing rim check:** do rock/shoreline edges show a **one-sided** lighter rim on the sun
side only (not a symmetric white outline)? ☐ yes ☐ no — _notes:_

**Tone/brightness parity (`?tone=`):** does ACES (default) or `?tone=neutral` better match
`master`? ☐ ACES ☐ neutral — _notes:_

---

## 3. Perf evidence — both backends at the medium tier (SPIKE-03)

Read the HUD; record the FPS and the backend proof line. (Empty until the on-device run.)

| Run | URL | HUD backend line (expected) | FPS (fill in) | Acceptable? |
|-----|-----|------------------------------|---------------|-------------|
| WebGPU, medium | `/waterpro-spike.html` | `renderer WebGPU` / `water webgpu` / `spray available` | ______ | ☐ yes ☐ no |
| WebGL2 fallback, medium | `/waterpro-spike.html?forceWebGL=1` | `renderer WebGL2 (forced)` / `water webgl` / `spray null (webgl2)` | ______ | ☐ yes ☐ no |

**Backend confirmation (one-line, SPIKE-03):** the WebGPU run must show
`renderer.backend.isWebGPUBackend = true` and `water.backend = webgpu`; the forced run must
show WebGL2 with `water.spray = null` and must NOT crash. ☐ confirmed on device

---

## 4. De-risk viability — the two no-native-API asks (SPIKE-04, `?derisk=1`)

| Ask | Technique proven in the spike | Reads viable? |
|-----|-------------------------------|---------------|
| Lit water (no `emissiveNode` in Water Pro) | `sparkle`/`sss`/lifted `waterColor` + `bloom()` in the post chain + an ADDITIVE transparent glow overlay mesh (`depthWrite:false`) riding the surface | ☐ yes ☐ no |
| Projectile reactivity | FIXED pool of ≤16 wake generators registered once, proxies skimmed HORIZONTALLY each frame (vertical-only injects nothing); vertical impacts via `water.spray?.addEmitter(...)` optional-chained | ☐ yes ☐ no |

Confirm `?forceWebGL=1&derisk=1` does not crash on the null spray path. ☐ confirmed

---

## 5. Camera far + tone-mapping notes

- **Chosen camera `far`:** `20000` (`CAMERA_FAR` in `waterpro-spike.ts`) — extended from the
  game default to satisfy Water Pro's horizon ring (`infinityRingExtent = camera.far * 0.95`);
  RESEARCH Pitfall 1.
- **Tone-mapping:** ACES filmic by default; `?tone=neutral|none|off` → `NoToneMapping`. Which one
  Phase 2 should adopt is part of the perceptual sign-off (§2).

---

## 6. Sky Pro `data/` dist outcome (STCK-02) — FLAG, not a spike blocker

**Result: FLAG (deferred to Phase 5).** The built `dist/` does NOT ship Sky Pro's cloud-noise
`data/*.bin`. Root cause: the vendored bundle loads volumes with a **runtime-concatenated** URL
(`new URL("./data/" + s + ".bin", import.meta.url)`), which Vite's static asset analyzer cannot
track, so `data/{baseShape16,baseShape32,baseShape64}.bin` are never copied. In the built page
they resolve to `/assets/data/baseShape{16,32,64}.bin` → **404** (clouds break / sky goes black).
**Dev works** (served from `src/vendor/`), which is where the go/no-go capture runs.
**Fix (Phase 5 hardening):** an inline Vite copy plugin `src/vendor/threejs-sky-pro/data/*.bin`
→ `dist/assets/data/`. Recorded here as a known carry, not a Phase-1 blocker.

---

## 7. 17-shader port-surface estimate (SPIKE-04 sign-off input)

`grep -rlE "ShaderMaterial|onBeforeCompile" src/game` = **17 files**. T-shirt sizing = effort to
move each GLSL surface to a TSL node material (Phase 3, one subsystem per commit, screenshot-gated).
**3 retired** (replaced, not ported); **14 ported**.

| # | File | Subsystem / GLSL chunk | Fate | Size |
|---|------|------------------------|------|------|
| 1 | `world/terrainShader.ts` | terrain sand/swash/beach blend (highest GLSL density) | port | **L** |
| 2 | `world/town/buildingMaterials.ts` | town building facades | port | **L** |
| 3 | `world/createGrassField.ts` | grass wind (vertex animation) | port | **L** |
| 4 | `systems/createGroundInfluence.ts` | ground-influence RTT (footprint/decal field) | port | **L** |
| 5 | `world/assets/createRockMesh.ts` | rock mottle | port | **L** |
| 6 | `world/town/createTownGround.ts` | town ground | port | **M** |
| 7 | `world/town/createCobbleMaterial.ts` | cobble | port | **M** |
| 8 | `systems/createScorchMap.ts` | scorch decal map (RTT) | port | **M** |
| 9 | `world/assets/createCampFlag.ts` | flag wind (vertex) | port | **M** |
| 10 | `world/assets/createCanopyTree.ts` | canopy wind | port | **M** |
| 11 | `systems/wingedCreature.ts` | wildlife wing-flap (vertex) | port | **S** |
| 12 | `world/assets/createBeachProps.ts` | beach props (mostly MeshStandard + minor tweak) | port | **S** |
| 13 | `world/createPlazaStructures.ts` | plaza (glsl≈1, near-MeshStandard) | port | **S** |
| 14 | `world/createMondstadtWorld.ts` | world assembly — few shader hooks | port | **S** |
| 15 | `engine/createPixelRenderer.ts` | WebGL pixel renderer → TSL post chain | retire (≈90% salvaged into the spike's `pixelFilterNode`/`outlineNode`) | **L** |
| 16 | `world/createSeaWater.ts` | custom WebGL sea → Water Pro | retire | **N/A** |
| 17 | `world/createFountainWater.ts` | small fountain water → small Water Pro/node | retire/replace | **S** |

**Rollup (ports, Phase 3):** 5×L + 5×M + 4×S. The two make-or-break perf surfaces are
`terrainShader` and `createGrassField` (both L, both drive most of the frame's pixels).

---

## 8. Evidence-completeness checklist (T-04-Q: no premature GO on incomplete evidence)

- [x] Both resolution shapes exist and compile (`?shape=whole` / `?shape=final`) — §2 table ready
- [x] Both-backend FPS capture instrument + procedure ready (WebGPU + `?forceWebGL=1`) — §3
- [x] Chosen camera `far` recorded (20000) — §5
- [x] Sky `data/` dist outcome recorded (FLAG → Phase 5) — §6
- [x] 17-shader port estimate table — §7
- [x] Backend confirmation mechanism (HUD) — §3
- [ ] **On-device capture performed** (screenshots + FPS filled into §2–§4) — *user action*
- [ ] **VERDICT recorded** — §9 below

---

## 9. VERDICT — human sign-off (D-02) — TO BE FILLED BY THE USER

> Do NOT fill this until the on-device headed-Chrome capture (§1) is done and §2–§4 are recorded.
> This is a **perceptual** decision. GO only on an explicit "same pixel-art identity".

**Decision:** ☐ GO — `shape=whole`  ☐ GO — `shape=final`  ☐ STOP (keep WebGL renderer)

**Per-shape perceptual verdict:**
- `?shape=whole`: ☐ acceptable ☐ not acceptable — _rationale:_
- `?shape=final`: ☐ acceptable ☐ not acceptable — _rationale:_

**FPS acceptability:** WebGPU ☐ ok ☐ not ok · WebGL2 fallback ☐ tolerable ☐ not tolerable

**Rationale (one line):**

**If GO — resolution shape Phase 2 adopts:** __________

**If STOP — the milestone halts and the WebGL renderer is kept** (sanctioned escape hatch; the
salvage TSL module `src/game/engine/tsl/` can be deleted with zero game impact — it is unwired).

**Signed off by:** __________   **Date:** __________

---

*This record gates Phase 2 planning. A GO unblocks the renderer migration; a STOP halts the
milestone. The sign-off is perceptual (D-02); the screenshot-diff is an aid, not the gate.*
