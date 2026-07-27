# Phase 13: Camera Feel - Context

**Gathered:** 2026-07-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Motion micro-polish that rewards movement and combat — and can be fully disabled.
Three effects, all client-only (zero server publish):

1. **Character lean** — the character MODEL (not the camera) leans slightly into
   run direction, spring-damped (~2–4°, CAM-01).
2. **Idle breathing sway** — subtle sway on the character MODEL when idle, never
   continuous camera motion (CAM-02).
3. **FOV kick** — brief FOV punch on rare high-tier combat events only (+2–5°,
   ~60ms in / ~300ms spring-back, CAM-03).

Plus a persisted **"reduce camera motion" toggle** (CAM-04) that zeroes the above,
and pixel-filter-mode tuning so no camera-feel effect produces pixel-crawl.

**Ordered LAST by design** (accessibility risk; PROJECT.md ruling). Not structurally
blocked on anything.

**Out of scope:** any continuous camera motion, camera-following/orbit changes,
new combat mechanics, server changes.

</domain>

<decisions>
## Implementation Decisions

### Pixel-mode handling (locked by user)
- **D-01:** In pixelated mode, camera-feel effects are **kept but at reduced
  magnitude** (playtest-tuned), NOT disabled and NOT texel-snapped. Matches
  CAM-04's "tuned in pixel-filter mode" wording.
- **D-02:** Snapping-to-whole-texels was explicitly rejected: lean and breathing
  are model *rotations*, which cannot be cleanly quantized to integer texels, so
  snapping would only fix camera translation while leaving the two worst crawl
  sources (idle breathing on a standing character, model lean) untouched.
- **D-03:** Idle breathing is the worst pixel-crawl offender (constant motion on
  a stationary character). Planner should tune its pixel-mode magnitude most
  conservatively; playtest specifically for a standing character in pixel mode.

### Character lean (default — planner discretion to tune)
- **D-04:** Lean lives on the character MODEL, not the camera (CAM-01 is explicit;
  this OVERRIDES research `ARCHITECTURE.md` Pattern 6, which suggested a camera
  roll/lookAt-offset — see canonical refs conflict note). Rationale: avoid
  continuous camera motion → pixel-crawl + nausea.
- **D-05:** Default form = **forward pitch into run direction**, spring-damped,
  ~2–4°. Applied to the **local player only** (not remote players). Planner may
  add a small lateral bank on hard turns if it reads well in playtest, but keep
  total tilt under the "broken horizon" threshold (~1.5° per research caveat —
  reconcile with the 2–4° req during tuning; err small).

### FOV-kick trigger (default — planner discretion)
- **D-06:** Fires on the player landing their **own crit hits** (`kind === 'crit'`
  / `'pvpCrit'`), the existing rare high-tier client-side signal. NOT every hit,
  NOT on damage taken. Add a rate/cooldown gate so back-to-back crits don't stack
  into a strobe (rare-event guarantee, CAM-03).
- **D-07:** `camera.updateProjectionMatrix()` MUST be gated — only call it on
  frames where the FOV spring is active (`|fov − base| ≥ ε`), per research
  (`STACK.md`, `ARCHITECTURE.md` Pattern 6).

### Reduce-motion toggle scope (default — planner discretion)
- **D-08:** The persisted toggle zeroes **all three new effects** (lean, breathing,
  FOV kick) AND the **existing combat camera shake** (`createGame.ts` shake block).
  Rationale: "reduce camera motion" must mean *all* discretionary motion, not just
  the Phase-13 additions.
- **D-09:** Default state = **follow the OS `prefers-reduced-motion` media query**
  on first load (already read once at `createGame.ts:364`), then persist the user's
  explicit choice locally thereafter. Unify the new persisted toggle with that
  existing media-query read rather than keeping two independent signals.
- **D-10:** The existing OS-media-query gate on the moving sun stays as-is; the new
  toggle may additionally pin the sun when reduce-motion is on, but that's optional
  polish, not required by CAM-04.

### Claude's Discretion
- Exact spring constants, magnitudes, and pixel-mode reduction factors — all
  playtest-tuned (requirements give ranges, not fixed values).
- Whether to add a small lateral bank component to lean (D-05).
- Whether the toggle also pins the moving sun (D-10).
- Whether breathing applies to remote players (default: local only, cheap to
  extend since remote uses the same `animate()`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` §CAM-01..CAM-04 — the four locked requirements with
  magnitudes/timings (~2–4° lean, breathing on model, +2–5°/60ms-in/300ms-back FOV,
  persisted toggle referencing XAG 117).
- `.planning/ROADMAP.md` §"Phase 13: Camera Feel" — goal, success criteria, "last by
  ruling" ordering.
- `.planning/PROJECT.md` — camera-feel described as micro-polish, "do last", client-only.

### Milestone research (v0.3.0 Living World — pre-dates the CAM req refinement)
- `.planning/research/STACK.md` §"Feature → Built-in API Map" (Camera lean / FOV kick
  row) — spring form `v += (target − v) * (1 − exp(−k*dt))`; gate
  `updateProjectionMatrix()` when `|fov − base| < ε`; lean > ~1.5° reads as broken
  horizon; top-down = low motion-sickness risk. Zero new dependencies.
- `.planning/research/ARCHITECTURE.md` §"Pattern 6: Camera feel is a system" — prescribes
  a new `createCameraFeel.ts` receiving `{ camera }` + per-frame inputs + `kickFov()` /
  `shake()` impulses; existing shake block refactors INTO it (no-legacy rule); breathing
  belongs in `createCharacterModel.animate`.
  **⚠ CONFLICT:** Pattern 6 says lean = *camera roll / lookAt offset*. CAM-01 overrides:
  lean is on the CHARACTER MODEL, not the camera (see D-04). Follow the requirement.
- `.planning/research/FEATURES.md` §Sources — Xbox Accessibility Guideline 117 (motion),
  FOV/motion-sickness references; note lean/FOV magnitudes there are LOW-confidence
  estimates, playtest-tune them.

### Accessibility
- Xbox Accessibility Guideline 117 (XAG 117) — referenced by CAM-04 for the reduce-motion
  toggle. External URL in `FEATURES.md` sources.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Camera + follow:** `src/game/engine/createPixelRenderer.ts:54` (PerspectiveCamera,
  FOV **45**, exposed as `.camera`; projection rebuilt only in `resize()`). Follow +
  existing shake in `createGame.ts:1397-1408` `updateCamera(dt)` — this is where
  `createCameraFeel` lands and where the shake block moves wholesale.
- **Character model:** `src/game/entities/createCharacterModel.ts` — `animate(elapsed,
  delta, isMoving)` is the insertion point for idle breathing (already bobs head y at
  `:250`). `bodyPivot.rotation` is used during attack swings (`:210-231`), so lean should
  ride `group` or a dedicated child to avoid conflict.
- **Local player per-frame:** `createGame.ts:1024-1109` `updateLocalPlayer(dt)` — sets
  `group.position`/`group.rotation.y`, computes facing `playerRotationY = atan2(...)` and
  `isMoving` (`:1027,:1037`). Derive lean amount from `moveVector` here.
- **Settings persistence:** `src/App.tsx:90-116` (localStorage `settings.<key>` init) +
  `:916-954` (persist effect → imperative `gameRef.current?.setX(...)`). Panel in
  `src/ui/SettingsScreen.tsx` §ATTĒLOŠANA (`:157-165`) using `src/ui/Toggle.tsx`. Mirror
  `setPixelFilter` shape (`createGame.ts:157,1731`) for a new `setReduceMotion` setter.
- **Existing OS reduce-motion read:** `createGame.ts:364`
  `window.matchMedia('(prefers-reduced-motion: reduce)').matches` — currently only pins the
  sun. Unify the persisted toggle with this (D-09).

### Established Patterns
- **Spring/damping is inline exponential smoothing**, no shared util yet: shake decay
  `x *= Math.exp(-k*dt)` (`createGame.ts:1403`), camera `position.lerp(target, min(1,dt*6))`
  (`:1406`), model bob `Math.sin` (`createCharacterModel.ts:250`). New lean/FOV springs
  follow the research form; add state near `updateCamera`.
- **Per-frame loop:** `createGame.ts:1464` `frame(frameTime)`, `deltaSeconds` clamped at
  `:1466`. Frozen-matrix / no-per-frame-alloc / pooled rules apply (PROJECT.md constraints,
  and the always-analyze-performance directive).
- **Crit tier signal:** `src/game/combat/damageKind.ts` (`'crit'`/`'pvpCrit'`); detected in
  `createGame.ts` `enemy_hit`/`spawnPlayerNumber` (~`:1929-1952`). FOV-kick trigger taps here.

### Integration Points
- New `createCameraFeel.ts` ↔ `updateCamera` in `createGame.ts` (absorbs existing shake).
- Breathing ↔ `createCharacterModel.animate`.
- FOV-kick impulse ↔ crit-hit handlers in `createGame.ts`.
- Toggle ↔ `App.tsx` settings effect + `SettingsScreen.tsx` + new `Game.setReduceMotion`.

</code_context>

<specifics>
## Specific Ideas

- Performance discipline is mandatory (always-analyze-performance memory): gate
  `updateProjectionMatrix()`, no per-frame allocs, preallocate any scratch vectors/colors,
  respect frozen-matrix world.
- Playtest the standing-character-in-pixel-mode case specifically (breathing crawl, D-03).
- Reconcile the two magnitude sources during tuning: CAM-01 says ~2–4° lean, research says
  >~1.5° reads as broken horizon. Err small; validate by feel.

</specifics>

<deferred>
## Deferred Ideas

- Lateral bank on hard turns (beyond forward-pitch lean) — optional, only if it reads well
  in playtest (D-05). Not a separate phase, just planner discretion within CAM-01.
- Breathing on remote players — cheap extension, default off; revisit if world feels static.
- Toggle pinning the moving sun — optional polish (D-10), not required by CAM-04.

</deferred>

---

*Phase: 13-Camera Feel*
*Context gathered: 2026-07-20*
