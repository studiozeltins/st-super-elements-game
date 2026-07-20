# Phase 13: Camera Feel - Research

**Researched:** 2026-07-20
**Domain:** Client-only Three.js motion micro-polish (character-model lean, idle breathing, FOV kick, reduce-motion toggle) grafted onto an existing pixel-filter 3D game
**Confidence:** HIGH on integration seams (every line cited was read from the live code this session); MEDIUM on exact tuning constants (playtest-tuned by design — the requirements give ranges, not fixed values)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** In pixelated mode, camera-feel effects are **kept at reduced magnitude** (playtest-tuned), NOT disabled and NOT texel-snapped.
- **D-02:** Texel-snapping is **rejected** — lean and breathing are model *rotations*, which cannot be cleanly quantized to integer texels; snapping would only fix camera translation and leave the two worst crawl sources (idle breathing, model lean) untouched.
- **D-03:** Idle breathing is the **worst pixel-crawl offender** (constant motion on a stationary character). Tune its pixel-mode magnitude **most conservatively**; playtest a standing character in pixel mode specifically.
- **D-04:** Lean lives on the character **MODEL, not the camera** (CAM-01 explicit). This **OVERRIDES** research `ARCHITECTURE.md` Pattern 6 (camera roll / lookAt offset). Follow the requirement; the conflict is noted below.
- **D-05:** Default lean = **forward pitch into run direction**, spring-damped, ~2–4°, **local player only** (not remote). Optional small lateral bank on hard turns if it reads well. Err small.
- **D-06:** FOV kick fires on the player landing **their own crit hits** (`kind === 'crit'` / `'pvpCrit'`), NOT every hit, NOT on damage taken. Add a rate/cooldown gate so back-to-back crits don't strobe.
- **D-07:** `camera.updateProjectionMatrix()` MUST be gated — only on frames where the FOV spring is active (`|fov − base| ≥ ε`).
- **D-08:** The persisted toggle zeroes **all three new effects (lean, breathing, FOV kick) AND the existing combat camera shake**.
- **D-09:** Toggle default = follow OS `prefers-reduced-motion` on first load (already read at `createGame.ts:364`), then persist the explicit user choice. **Unify** the new persisted toggle with that existing media-query read — do not keep two independent signals.
- **D-10:** The existing OS-media-query sun-pin stays; the toggle *may* additionally pin the moving sun, but that is **optional polish**, not required by CAM-04.

### Claude's Discretion
- Exact spring constants, magnitudes, pixel-mode reduction factors (playtest-tuned).
- Whether to add a lateral bank component to lean (D-05).
- Whether the toggle also pins the moving sun (D-10).
- Whether breathing applies to remote players (default: local only).

### Deferred Ideas (OUT OF SCOPE)
- Lateral bank on hard turns (optional, planner discretion within CAM-01).
- Breathing on remote players (cheap extension, default off).
- Toggle pinning the moving sun (optional polish, D-10).
- Any continuous camera motion, camera-follow/orbit changes, new combat mechanics, server changes.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CAM-01 | Character (not camera) leans into run direction with a spring (~2–4°) | Lean rides `bodyPivot.rotation.x` inside the already-yawed `group` (a free channel — swings only touch `bodyPivot.rotation.y`); driven by `isMoving` in `createCharacterModel.animate`; exponential-smoothing spring. See Pattern 2. |
| CAM-02 | Idle characters have a subtle breathing sway on the model, never continuous camera motion | Extend the existing idle head-bob (`createCharacterModel.ts:250`, `sin(t*3)*0.02`) into a whole-body breathing sway; positional y-bob + optional torso scale pulse; gated on `!isMoving`. See Pattern 3. |
| CAM-03 | Burst damage triggers a brief FOV kick (+2–5°, ~60ms in / ~300ms back), rare events only | New `createCameraFeel.ts` owns a two-phase FOV spring + rate gate; triggered from the two "my crit landed" handlers (`spawnWorldNumber` / `spawnPlayerNumber`, `isMine && kind∈{crit,pvpCrit}`). See Pattern 4. |
| CAM-04 | "Reduce camera motion" toggle zeroes lean/roll/FOV kick + shake, persisted locally | New `Game.setReduceMotion(enabled)` fanned to cameraFeel (FOV+shake) and the local model (lean+breathing); App-side settings toggle mirrors the `pixelFilter` wiring; default from `prefers-reduced-motion`. See Pattern 5. |
</phase_requirements>

## Summary

This is a **client-only, zero-server, zero-new-dependency** micro-polish phase. Every API needed is already in `three@0.185.1` and the existing code: a `PerspectiveCamera` (FOV 45) whose `fov`/`updateProjectionMatrix()` drive the kick, a `bodyPivot` group inside each character model whose `.rotation.x/.z` are free channels for lean/breathing, an existing exponential-smoothing idiom used for shake decay and camera lerp, and a well-established settings-persistence pattern (`pixelFilter`) to clone for the reduce-motion toggle.

The work splits cleanly along the tier boundary: **the FOV kick + camera shake are camera concerns** → new `createCameraFeel.ts` absorbing the existing shake block; **the lean + breathing are model concerns** → extend `createCharacterModel.animate`. This matches ARCHITECTURE Pattern 6's own note that breathing "belongs in `createCharacterModel.animate`, not the camera." The one architectural conflict — Pattern 6 prescribed lean as *camera roll*, CAM-01 mandates it on the *model* — is resolved in favor of the requirement (D-04). A key upside of that override: **moving lean off the camera removes the "broken-horizon" nausea constraint** that limited camera roll to ~1.5°, because the world horizon never tilts. The model can safely take the full 2–4° the requirement asks for; err small only for pixel-crawl reasons, not nausea.

**Primary recommendation:** Build one new `createCameraFeel.ts` (FOV kick spring + rate gate + absorbed shake), extend `createCharacterModel.animate` with a spring-damped forward lean and a breathing sway (both fed a reused, zero-alloc motion-config scratch object), and add a `reduceMotion` setting that clones the `pixelFilter` App→Game→system wiring and unifies with the existing `prefers-reduced-motion` read. Extract the spring step and the toggle-zeroing rules into a pure `cameraFeelMath.ts` twin for vitest, following this repo's pure-helper discipline. All magnitudes/springs are playtest-tuned; concrete starting values are given below.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Character run lean | Character model (`createCharacterModel`) | — | CAM-01/D-04: lean is on the MODEL, not the camera. `bodyPivot.rotation.x` inside the yawed `group` pitches in the facing frame. |
| Idle breathing sway | Character model (`createCharacterModel`) | — | CAM-02 + ARCHITECTURE Pattern 6: breathing is model animation, extends the existing head-bob. |
| FOV kick | Camera (`createCameraFeel` → `pixelRenderer.camera`) | Crit handlers (createGame) | CAM-03: projection-matrix mutation is a camera concern; trigger taps the client-side crit signal. |
| Combat shake | Camera (`createCameraFeel`) | Strike handlers (createGame) | Existing shake block refactors INTO cameraFeel (no-legacy rule); shake() impulse from the 5 existing juice sites. |
| Reduce-motion toggle | Settings (App.tsx) → Game facade → both systems | localStorage | CAM-04: one persisted signal, fanned to camera + model; unified with the OS media query (D-09). |
| Pixel-mode magnitude scale | createGame (tracks pixel state) → both systems | pixelRenderer | D-01: effects kept but scaled; createGame is the only place that already knows the pixel-filter boolean. |

## Standard Stack

### Core (all already installed — nothing to add)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| three | 0.185.1 | `PerspectiveCamera.fov` + `updateProjectionMatrix()`; `Group.rotation` for model lean/breathing | Already the renderer; `updateProjectionMatrix()` is still the required call in r185 (one 4×4 rebuild — trivial when gated). [VERIFIED: node_modules read in milestone STACK.md; camera at createPixelRenderer.ts:54] |
| @types/three | 0.185.0 | Types | Already matched. [VERIFIED: package.json] |
| vitest | 3.2.4 | Unit-test the pure spring/zeroing helper | Existing harness (`npm test` → `vitest run`); 58 test files already, incl. `windMath.test.ts`, `dayNightMath.test.ts` — same pure-helper-twin pattern. [VERIFIED: Glob of src/**/*.test.ts] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled exponential smoothing | GSAP / tween.js / `maath` | A tween lib for two scalars (fov, lean angle) violates the zero-dep rule held across three milestones. STACK.md §"What NOT to Use" rejects this explicitly. |
| Camera roll for lean | Model pitch (chosen) | CAM-01/D-04 mandate model. Model lean also dodges the broken-horizon nausea cap. |

**Installation:**
```bash
# Nothing. Zero new dependencies. No server publish. No spacetime generate.
# Client build only:  npm run build   (laragon serves fresh dist/)
```

## Package Legitimacy Audit

**Not applicable — this phase installs zero external packages.** All APIs are `three@0.185.1` built-ins (already in the lockfile) and browser primitives (`window.matchMedia`, `localStorage`). No `pnpm add`, no registry lookups, no supply-chain surface introduced.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                         ┌──────────────────────────────────────────┐
  User settings ─────────▶ App.tsx  reduceMotion state              │
  OS prefers-reduced-     │  (default = matchMedia on first load,   │
  motion (default)        │   then persisted localStorage choice)   │
                          └───────────────┬──────────────────────────┘
                                          │ gameRef.setReduceMotion(bool)   (imperative, like setPixelFilter)
                                          ▼
        ┌──────────────────────── createGame (Game facade) ──────────────────────────┐
        │  holds: reduceMotion:boolean, pixelated:boolean                             │
        │  frame(dt):                                                                 │
        │    updateLocalPlayer(dt) ── isMoving, playerRotationY ──┐                    │
        │                                                        ▼                    │
        │    playerModel.animate(elapsed, dt, isMoving, MOTION_CFG_SCRATCH) ──────────┼──▶ createCharacterModel.animate
        │        MOTION_CFG_SCRATCH = { lean:on, breathe:on,      (LEAN + BREATHING)  │      • bodyPivot.rotation.x  = spring→(isMoving?leanMax:0)*scale
        │                              reduceMotion, pixelScale }  (local only, D-05) │      • bodyPivot.rotation.z / y-bob = breathing sway (idle)
        │                                                                             │
        │    crit handlers (spawnWorldNumber / spawnPlayerNumber, isMine && crit) ────┼──▶ cameraFeel.kickFov()   (rate-gated, D-06)
        │    strike juice (5 sites: slam/swing/swirl/dash/basic) ─────────────────────┼──▶ cameraFeel.shake(mag)  (absorbed from old block)
        │    updateCamera(dt):                                                        │
        │        desired = playerPos + CAMERA_OFFSET                                  │
        │        cameraFeel.apply(desired, dt) ──────────────────────────────────────┼──▶ createCameraFeel
        │        camera.position.lerp(desired, …); camera.lookAt(playerPos+1)         │      • shake offset (Math.exp decay)   → mutates `desired`
        │                                                                             │      • FOV spring → camera.fov + GATED updateProjectionMatrix (D-07)
        └─────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| File | New/Mod | Responsibility |
|------|---------|----------------|
| `src/game/systems/createCameraFeel.ts` | **NEW** ~100 LOC | Owns FOV kick spring (two-phase attack/release) + rate gate + absorbed camera-shake state. Exposes `apply(desiredPos, dt)`, `kickFov()`, `shake(mag)`, `setReduceMotion(b)`, `setPixelScale(n)`. |
| `src/game/systems/cameraFeelMath.ts` | **NEW** ~40 LOC pure | Zero-import spring step `smooth(v,target,k,dt)`, FOV two-phase update, lean target from move state, breathing offset — the vitest twin. |
| `src/game/entities/createCharacterModel.ts` | **MOD** ~25 LOC | Add lean spring on `bodyPivot.rotation.x` + breathing sway on idle; extend `animate()` signature with an optional motion-config object; reduce-motion + pixel-scale gate. |
| `src/game/createGame.ts` | **MOD** ~25 LOC | Construct `createCameraFeel`; rewrite `updateCamera` to call it; replace the 5 `shakeMagnitude =` sites with `cameraFeel.shake(...)`; add `kickFov` taps in the 2 crit handlers; track `pixelated`; add `setReduceMotion` to the `Game` interface; hold + mutate the zero-alloc `MOTION_CFG_SCRATCH`. |
| `src/App.tsx` | **MOD** ~10 LOC | `reduceMotion` state (default = `prefers-reduced-motion`), persist effect + `gameRef.current?.setReduceMotion(...)` — clone the `pixelFilter` block at :93-95 / :925-928. |
| `src/ui/SettingsScreen.tsx` | **MOD** ~4 LOC | One more `<Toggle>` under §ATTĒLOŠANA + two props on `SettingsScreenProps` — clone `pixelFilter`/`onTogglePixelFilter` at :22-23 / :160. |

### Pattern 1: Springs are inline exponential smoothing (no shared util today)
**What:** `v += (target − v) * (1 − exp(−k·dt))`. Frame-rate independent (unlike raw `lerp(v,t,α)` with a constant α). `k` is responsiveness in 1/s; ~90% of the gap is closed in `ln(10)/k ≈ 2.303/k` seconds.
**When:** lean angle, breathing (breathing itself is a sine, but its enable/disable can be spring-ramped), FOV offset.
**Existing idioms to match (do not invent a new style):**
- Shake decay: `shakeMagnitude *= Math.exp(-SHAKE_DECAY_RATE * dt)` (`createGame.ts:1403`, rate `7`).
- Camera follow: `camera.position.lerp(target, Math.min(1, dt*6))` (`createGame.ts:1406`).
- Idle head-bob: `head.position.y = 1.75 + Math.sin(elapsed*3)*0.02` (`createCharacterModel.ts:250`).

**Concrete starting constants (playtest-tune):**
| Effect | Constant | Start value | Derivation |
|--------|----------|-------------|------------|
| Lean spring | `k` | ~8 /s | ~90% settle in ~0.29s — responsive but smooth. |
| Lean max forward pitch | angle | ~3° (0.052 rad) native | Mid of the 2–4° req; ×`pixelScale` in pixel mode. |
| Lean lateral bank (optional) | angle | ~1.5° from turn rate | Only if it reads well (D-05). |
| Breathing y-bob | amplitude | ~0.015 units | Just under the existing 0.02 head-bob; ×0.5 in pixel mode (D-03). |
| Breathing frequency | ω | ~2.2 rad/s | Slower than the head-bob's 3 rad/s reads as calm breathing. |
| FOV base | `BASE_FOV` | 45 | `createPixelRenderer.ts:54`. |
| FOV peak kick | offset | ~+3° | Mid of the +2–5° req. |
| FOV attack | `kAttack` | ~38 /s | ~90% in 60ms: `ln(10)/0.06`. |
| FOV release | `kRelease` | ~8 /s | ~90% back in ~290ms: `ln(10)/0.30`. |
| FOV epsilon (D-07 gate) | ε | ~0.02° | Below this, stop rebuilding the projection. |
| FOV kick cooldown | `KICK_COOLDOWN` | ~0.35s | Rare-event guarantee (D-06); prevents strobe when one swirl crits N enemies in one frame. |

### Pattern 2: Lean rides `bodyPivot.rotation.x` — a free channel in the facing frame
**What:** `createCharacterModel` structure is `group → bodyPivot → {torso, head, legs, arms, …}`. `updateLocalPlayer` sets `group.rotation.y = playerRotationY` (facing) and `group.position` only (`createGame.ts:1106-1107`). Because `bodyPivot` is a child of the already-yawed `group`, `bodyPivot.rotation.x` pitches the whole body **forward/back in the facing frame** — exactly "lean into run direction."
**Why not `group.rotation.x`:** with Euler order `XYZ`, an `x` set on the same object as the facing `y` rotates about the *world* X axis, so the lean would always point along world ±Z regardless of facing. Using the child `bodyPivot` avoids this — its local X is already rotated by the parent yaw.
**Why `bodyPivot` is safe:** swings only ever write `bodyPivot.rotation.y` (`applySwing` spin at :211; `resetSwingPose` at :228 zeroes `.y` only). `.x` and `.z` are untouched — no conflict. Lean persists harmlessly across a brief spin.
**Trigger:** the model is already yaw-facing the move direction, so a forward lean is simply proportional to "am I running" — no move-vector needed for the base case. Drive `leanTarget = isMoving ? LEAN_MAX : 0`, spring `bodyPivot.rotation.x` toward it. Lateral bank (optional) needs turn rate → pass it in the motion-config object.
**Local-only (D-05):** `animate` is called for both local and remote models. Only the local call passes a lean-enabled motion config; remote calls pass none → no lean.

### Pattern 3: Breathing extends the existing idle head-bob (worst crawl offender — D-03)
**What:** The idle bob at `:250` already runs in pixel mode without complaint at 0.02 amplitude — that is the empirical safe ceiling. Extend it to a subtle whole-body breathing sway **only when `!isMoving`**: a small `bodyPivot.position.y` rise/fall and/or a ±1% `torso.scale.y` pulse. Keep it positional (translation/scale) rather than rotational where possible — a slow rotation sweeps silhouette edges across texels (crawl); a sub-texel vertical bob does not.
**Pixel-mode rule (D-03):** scale breathing by the **most conservative** factor (~0.5×) and playtest a *standing* character in pixel mode. If any crawl is visible on the stationary silhouette, reduce amplitude before frequency.
**Never:** a continuous sway that also runs while moving, or any sway routed to the camera (that is the CAM-02 forbidden case + motion-sickness trigger).

### Pattern 4: FOV kick — two-phase spring, gated projection rebuild, rate-gated trigger
**What:** `createCameraFeel` holds `fovOffset` and a small phase state. On `kickFov()` (rate-gated): enter a fast attack toward `PEAK` (~60ms), then release toward 0 (~300ms). Each frame, apply to the camera **only when active**:
```
if (Math.abs(fovOffset) >= EPS || wasActiveLastFrame) {
  camera.fov = BASE_FOV + fovOffset;
  camera.updateProjectionMatrix();     // D-07: the ONLY place this is called per-frame
}
```
Track `wasActiveLastFrame` so the frame the spring settles below ε does one final rebuild that snaps `fov` exactly to `BASE_FOV` (otherwise it rests a hair off). When idle, zero calls — free.
**Trigger sites (D-06 — my crit landed, not damage taken):**
- `spawnWorldNumber(...)` (`createGame.ts:1925`): `if (isMine && kind === 'crit') cameraFeel.kickFov();`
- `spawnPlayerNumber(...)` (`createGame.ts:1943`): `if (isMine && (kind === 'crit' || kind === 'pvpCrit')) cameraFeel.kickFov();`
- Do **NOT** tap `spawnSelfNumber` (`:1911`) — that is damage *taken*. (ARCHITECTURE Pattern 6 suggested it; D-06 overrides.)
**Rate gate:** inside `kickFov`, `if (elapsedNow - lastKickAt < KICK_COOLDOWN) return;`. Necessary because an AoE swirl can crit several enemies in a single frame → several `spawnWorldNumber` calls; without the gate they'd stack into a strobe.

### Pattern 5: Reduce-motion toggle — clone the `pixelFilter` wiring, unify the OS read (D-08/D-09)
**What:** One persisted boolean fanned to both systems.
- **App.tsx state (default from OS):**
  ```ts
  const [reduceMotion, setReduceMotion] = useState(() => {
    const saved = localStorage.getItem('settings.reduceMotion');
    if (saved === null) return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return saved === '1';
  });
  ```
  Persist + apply effect (clone of :925-928):
  ```ts
  useEffect(() => {
    localStorage.setItem('settings.reduceMotion', reduceMotion ? '1' : '0');
    gameRef.current?.setReduceMotion(reduceMotion);
  }, [reduceMotion]);
  ```
- **Game facade:** add `setReduceMotion(enabled: boolean): void` to the `Game` interface (near `setPixelFilter` at :157). Implementation fans out: `cameraFeel.setReduceMotion(enabled)` (zeroes FOV + shake) and sets the `MOTION_CFG_SCRATCH.reduceMotion` flag read by the model each frame (zeroes lean + breathing).
- **SettingsScreen:** one `<Toggle label="Samazināt kustību" checked={reduceMotion} onChange={onToggleReduceMotion} />` under §ATTĒLOŠANA (:157-165), plus the two props on `SettingsScreenProps` — exact clone of `pixelFilter` / `onTogglePixelFilter`.
- **Unify the existing read (D-09):** `createGame.ts:364` already reads `prefers-reduced-motion` for `movingSunEnabled`. Feed the initial `reduceMotion` from the same query (or accept it as a construct-time option from App) so camera-feel/model start correct on frame 1 before App's effect fires — do not keep a second independent media-query read.

**Shake zeroing (D-08):** when `reduceMotion` is on, `cameraFeel.shake()` becomes a no-op and any in-flight `fovOffset`/`shakeMagnitude` is snapped to 0. This is why the shake block must move *into* cameraFeel — the toggle needs one owner for all discretionary camera motion.

### Pattern 6: Sun-pin under the toggle is CONSTRUCTION-TIME only today (D-10 caveat)
**What:** `movingSunEnabled` is computed once at `createGame.ts:365` and never re-read. Making the toggle *re-pin the sun at runtime* (D-10) would require a new runtime setter into the day/night system — it is **not** a free wire. Since D-10 is explicitly optional polish, the **required** CAM-04 scope (camera-feel + model zeroing, both runtime-controllable) is achievable without touching the sun. Recommend: ship the required runtime zeroing; treat sun re-pin as a stretch only if a runtime `setMovingSun(enabled)` is cheap to add.

### Anti-Patterns to Avoid
- **Per-frame allocation:** do NOT build a `{ lean, breathe, reduceMotion, pixelScale }` object literal each frame to pass into `animate` — allocate ONE `MOTION_CFG_SCRATCH` in `createGame` and mutate its fields. (The 144→20fps regression memory + the frozen-matrix/no-alloc rule.)
- **Ungated `updateProjectionMatrix()`:** calling it every frame regardless of FOV state defeats D-07 — gate on `|fov−base| ≥ ε` (+ one settle frame).
- **Lean/breathing on the camera:** forbidden by CAM-01/CAM-02 and the motion-sickness/pixel-crawl bans in REQUIREMENTS.md "Out of Scope."
- **Texel-snapping model rotations (D-02):** rejected — rotations can't be quantized to integer texels; wastes effort and misses the real crawl sources.
- **Leaving the old shake block beside a new system:** the no-legacy rule requires the shake state to *move into* cameraFeel, not be duplicated.
- **A rotation-based breathing sway in pixel mode:** slow rotation sweeps edges across texels (crawl); prefer positional/scale breathing (D-03).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Scalar interpolation over time | A custom tween/easing engine | `v += (target−v)*(1−exp(−k·dt))` inline | Two scalars don't justify a lib; matches the three existing idioms. |
| Projection update | Manually editing the projection matrix | `camera.fov = …; camera.updateProjectionMatrix()` | Still the correct r185 call; one cheap 4×4 rebuild when gated. |
| Facing-frame lean math | Reprojecting the move vector into the model's local space | `bodyPivot.rotation.x` (child of the yawed group) | The parent yaw already rotates the pivot's local axes into the facing frame. |
| OS motion preference | A custom accessibility detector | `window.matchMedia('(prefers-reduced-motion: reduce)')` | Already used at `createGame.ts:364`; unify with it. |
| Settings persistence | A new storage scheme | Clone the `settings.pixelFilter` localStorage + effect pattern | Six settings already use it; consistency + tested shape. |

**Key insight:** the entire phase is composition of existing idioms — the risk is not "which API," it's tuning magnitudes so nothing crawls in pixel mode and nothing induces nausea. Budget playtest time, not research time.

## Common Pitfalls

### Pitfall 1: Lean applied to `group.rotation.x` leans in world space
**What goes wrong:** the character leans toward world ±Z regardless of which way it's running.
**Why:** Euler order `XYZ` on the same object rotates X about the parent (world) frame after the facing Y.
**How to avoid:** apply lean to the child `bodyPivot.rotation.x` (its local axes are already yawed by the parent). Verified: `bodyPivot` is a child of `group` (`createCharacterModel.ts:139`).
**Warning sign:** lean direction looks correct running north/south but wrong running east/west.

### Pitfall 2: FOV strobe from one AoE crit hitting many enemies
**What goes wrong:** a swirl/AoE crits N enemies in one frame → N `spawnWorldNumber` calls → N `kickFov` → violent strobe.
**Why:** crit is a per-hit event; multi-hit attacks fire the handler repeatedly per frame.
**How to avoid:** the `KICK_COOLDOWN` rate gate (~0.35s) inside `kickFov`.
**Warning sign:** FOV visibly pumps during swirl on a mob cluster.

### Pitfall 3: Projection matrix rebuilt every frame (perf) OR fov resting off-base (visual)
**What goes wrong:** either ungated `updateProjectionMatrix()` every frame, or gating so aggressively the fov settles at 45.02 forever.
**How to avoid:** gate on `|offset| ≥ ε` **plus one settle frame** that snaps to exactly `BASE_FOV`. (Pattern 4.)
**Warning sign:** profiler shows constant projection rebuilds, or the view is subtly zoomed after combat.

### Pitfall 4: Breathing crawl on a standing character in pixel mode (D-03)
**What goes wrong:** the constant idle motion crawls across the nearest-filtered pixel grid — the most visible crawl source because the silhouette is otherwise static.
**How to avoid:** most-conservative pixel-mode scale (~0.5×), positional not rotational, playtest a stationary character in pixel mode specifically before sign-off.
**Warning sign:** shimmering edges on a character standing still with the pixel filter on.

### Pitfall 5: Per-frame object allocation for the motion config
**What goes wrong:** passing `animate(…, { lean, breathe, … })` allocates every frame per player → GC churn → the documented frame-cost cliff.
**How to avoid:** one reused `MOTION_CFG_SCRATCH`, mutate fields, pass the reference.
**Warning sign:** rising minor-GC frequency in a profile during movement.

### Pitfall 6: Reduce-motion leaves in-flight motion mid-animation
**What goes wrong:** toggling reduce-motion ON while a FOV kick or shake is decaying leaves the residual until it naturally settles.
**How to avoid:** `setReduceMotion(true)` snaps `fovOffset`/`shakeMagnitude`/lean/breathing to 0 immediately (and does one final `updateProjectionMatrix()` to restore base fov), not just gates future impulses.
**Warning sign:** flipping the toggle mid-combat still shows a fading kick.

## Code Examples

### Pure spring helper (the vitest twin — zero THREE imports)
```typescript
// src/game/systems/cameraFeelMath.ts
// Frame-rate-independent exponential smoothing — the ONE spring step.
export function smooth(current: number, target: number, k: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-k * dt));
}

export const CAMERA_FEEL = {
  BASE_FOV: 45,
  FOV_PEAK_DEG: 3,
  FOV_K_ATTACK: 38,   // ~90% in 60ms
  FOV_K_RELEASE: 8,   // ~90% back in ~300ms
  FOV_EPS_DEG: 0.02,
  KICK_COOLDOWN_S: 0.35,
  LEAN_K: 8,
  LEAN_MAX_RAD: 0.052, // ~3°
  BREATHE_AMP: 0.015,
  BREATHE_OMEGA: 2.2,
  PIXEL_SCALE: 0.5,    // magnitude multiplier in pixel-filter mode (D-01/D-03)
} as const;

/** Forward-lean target in radians for the current move/reduce state. */
export function leanTarget(isMoving: boolean, reduceMotion: boolean, pixelScale: number): number {
  if (reduceMotion) return 0;
  return (isMoving ? CAMERA_FEEL.LEAN_MAX_RAD : 0) * pixelScale;
}

/** Breathing vertical offset; zero while moving or reduced. */
export function breatheOffset(t: number, isMoving: boolean, reduceMotion: boolean, pixelScale: number): number {
  if (reduceMotion || isMoving) return 0;
  return Math.sin(t * CAMERA_FEEL.BREATHE_OMEGA) * CAMERA_FEEL.BREATHE_AMP * pixelScale;
}
```

### FOV kick with gated projection rebuild (inside createCameraFeel)
```typescript
// Source: pattern derived from createPixelRenderer.ts:54 (camera) + createGame.ts:1403 (exp decay idiom)
let fovOffset = 0, kickPhase: 'idle' | 'attack' | 'release' = 'idle';
let attackRemaining = 0, lastKickAt = -Infinity, wasActive = false;

function kickFov(now: number) {
  if (reduceMotion) return;
  if (now - lastKickAt < CAMERA_FEEL.KICK_COOLDOWN_S) return; // D-06 rate gate
  lastKickAt = now; kickPhase = 'attack'; attackRemaining = 0.06;
}

function applyFov(dt: number) {
  if (kickPhase === 'attack') {
    fovOffset = smooth(fovOffset, CAMERA_FEEL.FOV_PEAK_DEG, CAMERA_FEEL.FOV_K_ATTACK, dt);
    attackRemaining -= dt;
    if (attackRemaining <= 0) kickPhase = 'release';
  } else if (kickPhase === 'release') {
    fovOffset = smooth(fovOffset, 0, CAMERA_FEEL.FOV_K_RELEASE, dt);
    if (Math.abs(fovOffset) < CAMERA_FEEL.FOV_EPS_DEG) { fovOffset = 0; kickPhase = 'idle'; }
  }
  const active = Math.abs(fovOffset) >= CAMERA_FEEL.FOV_EPS_DEG;
  if (active || wasActive) {                         // D-07: gate + one settle frame
    camera.fov = CAMERA_FEEL.BASE_FOV + fovOffset;
    camera.updateProjectionMatrix();
  }
  wasActive = active;
}
```

### Lean + breathing inside createCharacterModel.animate (the MOD)
```typescript
// createCharacterModel.ts — extend the signature; `motion` is undefined for remote models.
animate(elapsedSeconds, deltaSeconds, isMoving, motion?) {
  // …existing swing / walk-cycle / head-bob code unchanged…
  if (motion) {                                       // local player only (D-05)
    const target = leanTarget(isMoving, motion.reduceMotion, motion.pixelScale);
    leanX = smooth(leanX, target, CAMERA_FEEL.LEAN_K, deltaSeconds);
    bodyPivot.rotation.x = leanX;                     // free channel (swings use .y only)
    bodyPivot.position.y = breatheOffset(elapsedSeconds, isMoving, motion.reduceMotion, motion.pixelScale);
  }
}
```

### Shake refactor — the 5 assignment sites become impulses
```typescript
// createGame.ts: each of :2092 :2102 :2111 :2141 :2151 changes from
//   shakeMagnitude = Math.max(shakeMagnitude, SWING_SHAKE_MAGNITUDE * juiceFalloff);
// to
   cameraFeel.shake(SWING_SHAKE_MAGNITUDE * juiceFalloff);   // Math.max lives inside cameraFeel
// and updateCamera (:1397-1408) shrinks to:
function updateCamera(dt) {
  desiredPosition.copy(playerPosition).add(CAMERA_OFFSET);
  cameraFeel.apply(desiredPosition, dt);              // adds shake offset + advances FOV spring
  pixelRenderer.camera.position.lerp(desiredPosition, Math.min(1, dt * 6));
  pixelRenderer.camera.lookAt(playerPosition.x, playerPosition.y + 1, playerPosition.z);
}
// SHAKE_DECAY_RATE (:1364) + SHAKE_FLOOR (:1365) + `shakeMagnitude` state (:1394) move into createCameraFeel.
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.2.4 |
| Config file | `vitest.config.ts` (present at repo root) |
| Quick run command | `npx vitest run src/game/systems/__tests__/cameraFeelMath.test.ts` |
| Full suite command | `npm test` (`vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAM-01 | `leanTarget` returns 0 when stopped, `LEAN_MAX·pixelScale` when moving, 0 when reduced | unit | `npx vitest run src/game/systems/__tests__/cameraFeelMath.test.ts` | ❌ Wave 0 |
| CAM-01 | `smooth` is monotonic toward target + frame-rate independent (same result for 1×dt vs 2×½dt within ε) | unit | same | ❌ Wave 0 |
| CAM-02 | `breatheOffset` is 0 while moving AND while reduced; bounded by `±BREATHE_AMP·pixelScale` | unit | same | ❌ Wave 0 |
| CAM-03 | FOV two-phase reaches ~peak within ~60ms, returns within ~300ms; kick rejected inside cooldown | unit (drive the pure phase-update with fixed dt steps) | same | ❌ Wave 0 |
| CAM-03 | Projection-gate predicate true only when `|offset| ≥ ε` or settle frame | unit | same | ❌ Wave 0 |
| CAM-04 | reduce-motion zeroes lean, breathing, and FOV target (all helpers return 0 / no-op) | unit | same | ❌ Wave 0 |
| CAM-01/02/03/04 | Feel + no pixel-crawl (standing char in pixel mode); toggle zeroes all + shake live | **manual** | two-client / single-client playtest, pixel filter on | manual-only (irreducible: "reads well," crawl, nausea are perceptual) |

### Sampling Rate
- **Per task commit:** `npx vitest run src/game/systems/__tests__/cameraFeelMath.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** full suite green + manual playtest checklist (running lean feels right, idle breathing calm, crit kick noticeable-but-rare, toggle kills all four motions incl. shake, no crawl on a standing pixel-mode character) before `/gsd-verify-work`. `scripts/fps_playtest.py` optional here — this phase adds negligible per-frame cost (a few scalar springs + one gated matrix rebuild), but run it if any doubt.

### Wave 0 Gaps
- [ ] `src/game/systems/cameraFeelMath.ts` — pure helpers (`smooth`, `leanTarget`, `breatheOffset`, FOV phase/gate predicate, constants) covering CAM-01..04.
- [ ] `src/game/systems/__tests__/cameraFeelMath.test.ts` — the vitest twin.
- No framework install needed (vitest already configured; 58 test files exist).

## Security Domain

**Minimal — no new attack surface.** This phase is purely cosmetic client-side rendering. It adds no auth, no network messages, no server reducers, no user-supplied data parsing. The only persisted value is a single boolean at `localStorage['settings.reduceMotion']`, read back as `=== '1'` (no injection vector, no deserialization). ASVS categories V2–V6 do not apply (no authn/z, sessions, crypto, or server-trust boundary touched). `security_enforcement` gate is satisfied by exclusion: verify only that the new setting is read defensively (absent key → OS default, any non-`'1'` value → treated as off), which the proposed code already does.

## State of the Art

| Old Approach (ARCHITECTURE Pattern 6) | Current Approach (this phase) | When Changed | Impact |
|--------------------------------------|-------------------------------|--------------|--------|
| Lean = camera roll / lookAt offset | Lean = model pitch on `bodyPivot.rotation.x` | CAM-01 refinement post-milestone-research (D-04) | Removes the ~1.5° broken-horizon nausea cap — model can take the full 2–4°; world horizon never tilts. |
| FOV kick on damage taken (`spawnSelfNumber`) | FOV kick on **my crit landed** (`spawnWorldNumber`/`spawnPlayerNumber`, `isMine && crit`) + rate gate | D-06 | Rewards offense, not punishment; rarer, avoids strobe. |

**Deprecated/outdated:**
- ARCHITECTURE Pattern 6's "camera roll for lean" and "FOV kick from `spawnSelfNumber`" are superseded by D-04/D-06. Do not implement them.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Spring/magnitude starting constants (LEAN_MAX 3°, FOV_PEAK 3°, k values, PIXEL_SCALE 0.5, cooldown 0.35s) | Pattern 1/4/Code | LOW — they are explicit ranges in CAM-01/03 and marked playtest-tuned; wrong values are corrected by feel, not a rework. |
| A2 | `bodyPivot.rotation.x` and `.z` are never written by swing code, so lean/breathing can ride them conflict-free | Pattern 2 | LOW — verified: swings write only `bodyPivot.rotation.y` (`:211`, `:228`). If a future swing adds `.x`, lean would fight it. |
| A3 | Positional/scale breathing avoids pixel-crawl better than rotational | Pattern 3 | MEDIUM — physically reasoned (rotation sweeps edges across texels) but not measured; D-03 mandates a standing-in-pixel-mode playtest that will confirm/deny. |
| A4 | Runtime sun re-pin (D-10) is construction-time only today and out of required scope | Pattern 6 | LOW — verified `movingSunEnabled` computed once at `:365`; D-10 is explicitly optional. |
| A5 | `createGame` can track the pixel-filter boolean to feed `pixelScale` (renderer has no getter) | Resp. map / D-01 | LOW — `setPixelFilter` already flows App→Game; store the boolean alongside. Initial default `true` matches renderer's `pixelated=true`. |

## Open Questions

1. **Does lean need a lateral bank, or is forward pitch enough? (D-05)**
   - Known: forward pitch into run direction is the required default; bank is optional.
   - Unclear: whether bank "reads well" — perceptual, resolvable only in playtest.
   - Recommendation: ship forward-pitch first; add bank behind the same spring only if the running character feels stiff. Bank needs turn-rate in the motion config (compute from frame-to-frame `playerRotationY` delta).

2. **Should breathing also apply to remote players?**
   - Known: default is local-only; cheap to extend since remote uses the same `animate()`.
   - Recommendation: local-only for v1; revisit if the world of standing remote players feels lifeless. (Would just pass a motion config to remote models too — but note the per-model spring state must then be per-model, not a shared scratch field.)

3. **Does the reduce-motion default need to react to live OS changes mid-session?**
   - Known: D-09 reads the media query as the *first-load* default, then persists explicit choice.
   - Recommendation: read-once default is sufficient (matches the existing `:364` behavior); no `matchMedia` change listener required. Flag only if a reviewer wants live OS reactivity.

## Sources

### Primary (HIGH confidence — read from live code this session)
- `src/game/createGame.ts` — `updateCamera` :1397-1408, shake constants :1364-1365 + state :1394, `frame()` :1464, `updateLocalPlayer` :1024-1109 (facing :1037, model apply :1106-1108), crit handlers `spawnWorldNumber` :1925 / `spawnPlayerNumber` :1943 / `spawnSelfNumber` :1911, `Game` interface :153-169, `setPixelFilter` :1731, reduce-motion read :364-365, shake trigger sites :2092/:2102/:2111/:2141/:2151, `CAMERA_OFFSET`/`CAMERA_YAW` :284-285.
- `src/game/entities/createCharacterModel.ts` — structure `group→bodyPivot` :137-139/:199, `animate` :235-252 (head-bob :250), `applySwing` :205-225 (bodyPivot.rotation.y only), `resetSwingPose` :227-231.
- `src/game/engine/createPixelRenderer.ts` — `PerspectiveCamera(45,…)` :54, `updateProjectionMatrix` in resize :159, `setPixelated` :219-225 (no state getter), pixel target internal resolution :145-150.
- `src/game/combat/damageKind.ts` — `crit`/`pvpCrit`/`takenCrit` kinds :2-11.
- `src/App.tsx` — settings state init `pixelFilter` :93-95, persist+apply effects :916-954 (`pixelFilter` :925-928).
- `src/ui/SettingsScreen.tsx` — `SettingsScreenProps` :15-23, §ATTĒLOŠANA toggles :157-165.
- `package.json` (`npm test` → `vitest run`), `vitest.config.ts` present, `src/**/*.test.ts` glob (58 files, incl. `windMath.test.ts`, `dayNightMath.test.ts`, `wildlifeMath.test.ts` — pure-helper-twin pattern).

### Secondary (MEDIUM — milestone research, verified against code)
- `.planning/research/STACK.md` §"Feature → Built-in API Map" (spring form, `updateProjectionMatrix` gate, broken-horizon caveat, zero-dep rule).
- `.planning/research/ARCHITECTURE.md` §"Pattern 6: Camera feel is a system" (createCameraFeel design, shake absorption, breathing in animate) — with the lean-on-model conflict noted (D-04 overrides).
- `.planning/phases/13-camera-feel/13-CONTEXT.md` (authoritative user decisions D-01..D-10).
- `.planning/REQUIREMENTS.md` §CAM-01..CAM-04 + "Out of Scope" (continuous camera motion, dynamic lights).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new deps; all APIs verified in-tree.
- Architecture / integration seams: HIGH — every insertion point read from live code this session.
- Tuning constants: MEDIUM by design — ranges are locked (CAM-01/03), exact values playtest-tuned.
- Pixel-crawl mitigation for rotations: MEDIUM — physically reasoned + D-03 playtest gate will confirm.

**Research date:** 2026-07-20
**Valid until:** ~2026-08-19 (stable — no external deps, no fast-moving APIs; only invalidated if the camera/model structure is refactored).
