# Phase 13: Camera Feel - Pattern Map

**Mapped:** 2026-07-20
**Files analyzed:** 6 (2 new, 4 modified)
**Analogs found:** 6 / 6 (every new/modified file has a strong in-repo analog)

> **Path correction (verified against live tree):** There is **no `src/game/math/` directory**. The established math-twin convention lives entirely in `src/game/systems/` — pure `*Math.ts` beside its `create*.ts` consumer, test in `src/game/systems/__tests__/*Math.test.ts` (6 existing pairs: `windMath`, `dayNightMath`, `debrisMath`, `groundInfluenceMath`, `wildlifeMath`, plus `audio/ambienceMath`). The `engine/` dir holds only low-level render infra (`createPixelRenderer`, `deviceProfile`, `disposeObject`) with no math twins and no runtime game-state setters. **Recommend placing BOTH new files in `src/game/systems/`** (`createCameraFeel.ts` + `cameraFeelMath.ts` + `__tests__/cameraFeelMath.test.ts`) to match the convention — this matches the RESEARCH.md paths, NOT the `engine/` + `math/` paths named in the orchestrator prompt. Flagging the discrepancy for the planner to lock.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/game/systems/createCameraFeel.ts` (NEW) | system (per-frame, stateful) | transform / event-driven (impulse `kickFov`/`shake` + per-frame `apply`) | `src/game/systems/createWind.ts` | role-match (factory + `update`-style per-frame + math-twin delegate) |
| `src/game/systems/cameraFeelMath.ts` (NEW) | utility (pure, zero-import) | transform | `src/game/systems/windMath.ts` | exact (pure math twin, const block + fns) |
| `src/game/systems/__tests__/cameraFeelMath.test.ts` (NEW) | test | — | `src/game/systems/__tests__/windMath.test.ts` | exact (vitest twin) |
| `src/game/entities/createCharacterModel.ts` (MOD) | entity/model | transform (per-frame `animate`) | itself (`animate` at :235, head-bob :250) | self / exact |
| `src/game/createGame.ts` (MOD) | orchestrator / Game facade | request-response (setters) + event-driven (frame loop) | itself (`setPixelFilter` :157/:1731, `updateCamera` :1397) | self / exact |
| `src/App.tsx` (MOD) | UI / settings host | request-response (persist → imperative setter) | itself (`pixelFilter` block :93/:826/:926) | self / exact |
| `src/ui/SettingsScreen.tsx` (MOD) | UI component | request-response (props) | itself (`pixelFilter` prop + Toggle :22/:160) | self / exact |

---

## Pattern Assignments

### `src/game/systems/cameraFeelMath.ts` (NEW — pure utility)

**Analog:** `src/game/systems/windMath.ts` (exact convention match).

**Convention to copy from `windMath.ts`:**
- Top-of-file block comment stating "ZERO imports (not even three)" and why it's testable in isolation.
- One frozen `const … as const` config object holding every tunable number (mirror `SWAY`/`GUST`/`FLAG`), so the system file and the test read the same source of truth.
- Small named pure functions returning scalars; no allocations, no RNG.

**windMath.ts skeleton (lines 11–48, 126–163):**
```typescript
const TAU = Math.PI * 2;

export const SWAY = { f1: 1.7, x1: 0.35, /* … */ scale: 0.09 } as const;
export const GUST = { w1: TAU / 9.0, sharpness: 3.0, gain: 1.6, /* … */ } as const;

export function sampleWind(t: number, x: number, z: number): number {
  return Math.sin(t * SWAY.f1 + x * SWAY.x1 + z * SWAY.z1) + SWAY.amp2 * Math.sin(t * SWAY.f2 + z * SWAY.z2);
}
export function gustGainFactor(strength: number, gust: number): number {
  return 1 + strength * GUST.gain * gust;
}
```

**What goes in `cameraFeelMath.ts`** (per RESEARCH Code Examples §, verified against the spring idioms in-repo): `smooth(current,target,k,dt)`, `CAMERA_FEEL` const block, `leanTarget(isMoving,reduceMotion,pixelScale)`, `breatheOffset(t,isMoving,reduceMotion,pixelScale)`, plus the FOV-phase advance + projection-gate predicate as pure fns so CAM-03's timing is unit-testable. The exponential-smoothing form must match the three existing idioms (see Shared Patterns → Spring idiom).

---

### `src/game/systems/__tests__/cameraFeelMath.test.ts` (NEW — test)

**Analog:** `src/game/systems/__tests__/windMath.test.ts`.

**Imports + structure to copy (lines 1–36):**
```typescript
import { describe, expect, it } from 'vitest';
import { CAMERA_FEEL, smooth, leanTarget, breatheOffset /* … */ } from '../cameraFeelMath';

describe('leanTarget (CAM-01)', () => {
  it('is 0 when stopped, LEAN_MAX·pixelScale when moving, 0 when reduced', () => {
    expect(leanTarget(false, false, 1)).toBe(0);
    // …
  });
});
```
Note the analog's discipline (line 22-24 comment): pin exact numbers ONLY for byte-identical-extraction constants; everywhere else **pin behavior, not magic numbers** (monotonicity, bounds, frame-rate independence for `smooth`, cooldown rejection for `kickFov`). Follow that split — the tuning constants are playtest-mutable, so tests must not hard-code 3° etc.

---

### `src/game/systems/createCameraFeel.ts` (NEW — system)

**Analog:** `src/game/systems/createWind.ts` (factory that takes a construct-time flag, delegates all math to the twin, exposes a per-frame method + a stable interface; zero per-frame allocs).

**Factory + interface + delegation pattern (createWind.ts lines 17–68):**
```typescript
export interface Wind extends WindUniforms {
  update(deltaSeconds: number): void;      // called ONCE per frame by createGame
  sampleWind(x: number, z: number): number;
  // …
}

export function createWind(enabled: boolean): Wind {
  const timeUniform = { value: 0 };
  const strengthUniform = { value: enabled ? 1 : 0 };
  return {
    update(deltaSeconds) { timeUniform.value += deltaSeconds; /* … */ },
    sampleWind(x, z) { return sampleWind(timeUniform.value, x, z); },  // delegate to windMath
  };
}
```
Note lines 43 + 11-15: "Constructed ONCE — update() mutates via .set(), zero per-frame allocs" and the "hold the OBJECTS, never cache `.value`" rule. `createCameraFeel` must follow the same no-alloc discipline (preallocate any scratch `Vector3` for the shake offset; mutate the passed-in `desiredPosition` in place).

**Camera handle to receive** — the `PerspectiveCamera` created at `createPixelRenderer.ts:54`:
```typescript
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);  // BASE_FOV = 45
```
`createCameraFeel({ camera })` mutates `camera.fov` + calls `camera.updateProjectionMatrix()` GATED (D-07). `pixelRenderer` exposes `.camera` and has **no pixel-state getter** (`setPixelated` is write-only, see :56 `let pixelated = true`) — so pixel-scale must be pushed in from createGame, not read back (RESEARCH A5).

**Shake state to ABSORB from createGame.ts** (lines 1359–1404 — move wholesale, no-legacy rule):
```typescript
const SHAKE_DECAY_RATE = 7;   // :1364  e^-3 ≈ 5% left after ~0.43s
const SHAKE_FLOOR = 0.005;    // :1365  below this the shake snaps off
let shakeMagnitude = 0;       // :1394
// inside updateCamera :1399-1404 — the block that moves in:
if (shakeMagnitude > 0) {
  desiredPosition.x += (Math.random() - 0.5) * 2 * shakeMagnitude;
  desiredPosition.y += (Math.random() - 0.5) * 2 * shakeMagnitude;
  desiredPosition.z += (Math.random() - 0.5) * 2 * shakeMagnitude;
  shakeMagnitude *= Math.exp(-SHAKE_DECAY_RATE * deltaSeconds);
  if (shakeMagnitude < SHAKE_FLOOR) shakeMagnitude = 0;
}
```
Expose `shake(mag)` (does the `Math.max(shakeMagnitude, mag)` internally — see the 5 call sites in Shared Patterns), `apply(desiredPosition, dt)` (adds the shake offset above + advances the FOV spring), `kickFov(now)` (rate-gated), `setReduceMotion(b)` (no-ops future impulses AND snaps in-flight `shakeMagnitude`/`fovOffset` to 0 + one final `updateProjectionMatrix()` — Pitfall 6), `setPixelScale(n)`.

---

### `src/game/entities/createCharacterModel.ts` (MOD — lean + breathing)

**Analog:** itself. `animate()` signature is declared on the `CharacterModel` interface at **line 11** and implemented at **line 235**:
```typescript
// :11  interface — EXTEND this signature with an optional motion arg
animate(elapsedSeconds: number, deltaSeconds: number, isMoving: boolean): void;
```

**Model structure — the free channels (lines 137–139):**
```typescript
const group = new THREE.Group();
const bodyPivot = new THREE.Group(); // spun independently of the facing direction
group.add(bodyPivot);
```
Lean rides `bodyPivot.rotation.x` (child of the yaw-facing `group` set at `createGame.ts:1107`, so `.x` pitches in the facing frame — Pitfall 1).

**Swing-conflict proof — swings write `bodyPivot.rotation.y` ONLY (lines 210–231):**
```typescript
if (activeProfile.swingKind === 'spin') {
  bodyPivot.rotation.y = progress * Math.PI * 2;   // :211  .y only
  // …
}
function resetSwingPose() {
  bodyPivot.rotation.y = 0;                          // :228  zeroes .y only
  // …
}
```
So `bodyPivot.rotation.x` (lean) and `.z` / `bodyPivot.position.y` (breathing) are untouched by combat — conflict-free (RESEARCH A2).

**Idle-bob idiom to extend (line 250) — the empirical pixel-safe ceiling (0.02):**
```typescript
head.position.y = 1.75 + Math.sin(elapsedSeconds * 3) * 0.02;
```
Breathing extends this pattern to a whole-body sway on `bodyPivot`, gated on `!isMoving`, amplitude ≤ 0.02 and ×pixelScale (D-03 — breathing is the worst crawl offender; keep positional/scale, not rotational).

**The MOD (from RESEARCH Code Examples, using the pure helpers):**
```typescript
animate(elapsedSeconds, deltaSeconds, isMoving, motion?) {  // motion undefined for remote (D-05)
  // …existing swing / walk-cycle / head-bob unchanged…
  if (motion) {
    const target = leanTarget(isMoving, motion.reduceMotion, motion.pixelScale);
    leanX = smooth(leanX, target, CAMERA_FEEL.LEAN_K, deltaSeconds);
    bodyPivot.rotation.x = leanX;
    bodyPivot.position.y = breatheOffset(elapsedSeconds, isMoving, motion.reduceMotion, motion.pixelScale);
  }
}
```
`leanX` is per-model spring state (a `let` in the closure beside `swingRemaining` at :201) — NOT a shared scratch, so if breathing is later extended to remote models each keeps its own state (Open Q2).

---

### `src/game/createGame.ts` (MOD — wire it all)

**Analog:** itself. Five concrete edit clusters, each with an in-file pattern to copy:

**1. Game-interface setter — clone `setPixelFilter` shape (interface :157, impl :1731):**
```typescript
// :157 interface
setPixelFilter(enabled: boolean): void;
// :1731 impl
setPixelFilter(enabled) {
  pixelRenderer.setPixelated(enabled);
},
```
Add `setReduceMotion(enabled: boolean): void` beside it; impl fans out to `cameraFeel.setReduceMotion(enabled)` + writes `MOTION_CFG_SCRATCH.reduceMotion`.

**2. Construct-time reduce-motion read — UNIFY with the existing OS query (:364, D-09):**
```typescript
// :364 — ALREADY reads the media query (currently only pins the sun)
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const movingSunEnabled = dayNightEnabled && !perfFlags.has('nomovingsun') && !reduceMotion;
```
Feed this same `reduceMotion` (or an App-passed construct option) into `createCameraFeel` + the initial `MOTION_CFG_SCRATCH` so frame 1 is correct before App's effect fires. Do NOT add a second `matchMedia` read.

**3. `updateCamera` shrinks to delegate (current :1397–1408 → RESEARCH target):**
```typescript
function updateCamera(deltaSeconds) {
  desiredPosition.copy(playerPosition).add(CAMERA_OFFSET);   // CAMERA_OFFSET :284
  cameraFeel.apply(desiredPosition, deltaSeconds);            // shake offset + FOV spring
  pixelRenderer.camera.position.lerp(desiredPosition, Math.min(1, deltaSeconds * 6));
  pixelRenderer.camera.lookAt(playerPosition.x, playerPosition.y + 1, playerPosition.z);
}
```
`SHAKE_DECAY_RATE`/`SHAKE_FLOOR`/`shakeMagnitude` (:1364/:1365/:1394) DELETE from here — they moved into cameraFeel.

**4. Local-model animate call — pass the scratch (current :1108):**
```typescript
// :1108 today:
playerModel.animate(elapsedSeconds, deltaSeconds, isMoving);
// becomes (mutate the ONE preallocated MOTION_CFG_SCRATCH — never a fresh literal, Pitfall 5):
MOTION_CFG_SCRATCH.reduceMotion = reduceMotion; MOTION_CFG_SCRATCH.pixelScale = pixelScale;
playerModel.animate(elapsedSeconds, deltaSeconds, isMoving, MOTION_CFG_SCRATCH);
```
`isMoving` + facing already computed at :1027/:1037; remote `.animate(...)` calls stay 3-arg (no motion → no lean, D-05).

**5. FOV-kick taps in the crit handlers — `isMine && crit` (D-06):**
```typescript
// spawnWorldNumber :1925 — add:
if (isMine && kind === 'crit') cameraFeel.kickFov(elapsedSeconds);
// spawnPlayerNumber :1943 — add:
if (isMine && (kind === 'crit' || kind === 'pvpCrit')) cameraFeel.kickFov(elapsedSeconds);
// spawnSelfNumber :1911 — do NOT tap (that is damage TAKEN, D-06 overrides ARCHITECTURE Pattern 6)
```
Valid kinds confirmed in `damageKind.ts:2-11` (`'crit'`, `'pvpCrit'` exist). The rate gate lives inside `kickFov` (Pitfall 2 — one AoE swirl crits N enemies in one frame → N calls).

---

### `src/App.tsx` (MOD — settings state + persist + construct-time seed)

**Analog:** itself, the `pixelFilter` block (three touch points — copy all three shapes):

**State init (:93–95):**
```typescript
const [pixelFilter, setPixelFilter] = useState(
  () => localStorage.getItem('settings.pixelFilter') !== '0'
);
```
Reduce-motion default differs (OS query when key absent, D-09) — use the RESEARCH form:
```typescript
const [reduceMotion, setReduceMotion] = useState(() => {
  const saved = localStorage.getItem('settings.reduceMotion');
  if (saved === null) return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return saved === '1';
});
```

**Persist + live-apply effect (:925–928):**
```typescript
useEffect(() => {
  localStorage.setItem('settings.pixelFilter', pixelFilter ? '1' : '0');
  gameRef.current?.setPixelFilter(pixelFilter);
}, [pixelFilter]);
```
Clone verbatim for `reduceMotion` → `gameRef.current?.setReduceMotion(reduceMotion)`.

**Construct-time seed on new game / reconnect (:826–828) — the effect only fires on CHANGE:**
```typescript
game.setPixelFilter(localStorage.getItem('settings.pixelFilter') !== '0');
```
Add the matching seed so a fresh game starts correct:
`game.setReduceMotion(localStorage.getItem('settings.reduceMotion') === '1' /* or OS default when null */);`
(Reconcile with D-09's "OS default when absent" — same predicate as the state init.)

**Prop wiring to SettingsScreen (:1117–1118):**
```typescript
pixelFilter={pixelFilter}
onTogglePixelFilter={setPixelFilter}
```
Add `reduceMotion={reduceMotion} onToggleReduceMotion={setReduceMotion}`.

---

### `src/ui/SettingsScreen.tsx` (MOD — one Toggle)

**Analog:** itself, the `pixelFilter` prop + Toggle (exact clone):

**Props interface (:22–23):**
```typescript
pixelFilter: boolean;
onTogglePixelFilter(next: boolean): void;
```
Add `reduceMotion: boolean;` + `onToggleReduceMotion(next: boolean): void;`.

**Toggle under §ATTĒLOŠANA (:157–160):**
```typescript
<p className="settings__section">ATTĒLOŠANA</p>
<Toggle label="Rādīt FPS" checked={showFps} onChange={onToggleFps} />
<Toggle label="Rādīt ping" checked={showPing} onChange={onTogglePing} />
<Toggle label="Pikseļu filtrs" checked={pixelFilter} onChange={onTogglePixelFilter} />
```
Add: `<Toggle label="Samazināt kustību" checked={reduceMotion} onChange={onToggleReduceMotion} />`.

---

## Shared Patterns

### Spring / damping idiom (frame-rate-independent exponential smoothing)
**Sources:** `createGame.ts:1403` (shake decay `*= Math.exp(-k*dt)`), `createGame.ts:1406` (camera `position.lerp(t, min(1,dt*6))`), `createCharacterModel.ts:250` (`Math.sin` bob).
**Apply to:** `cameraFeelMath.ts` (`smooth`), FOV spring, lean spring, breathing sine.
```typescript
shakeMagnitude *= Math.exp(-SHAKE_DECAY_RATE * deltaSeconds);   // :1403 — the decay idiom
camera.position.lerp(target, Math.min(1, deltaSeconds * 6));    // :1406 — the follow idiom
```
The canonical spring step (RESEARCH): `v += (target − v) * (1 − Math.exp(−k·dt))`. Match this style — do NOT introduce a tween library (zero-dep rule held across three milestones).

### Zero-per-frame-allocation discipline
**Source:** `createWind.ts:43-47` ("Constructed ONCE … zero per-frame allocs"), plus the 144→20fps regression memory.
**Apply to:** cameraFeel scratch `Vector3` (shake offset), the single reused `MOTION_CFG_SCRATCH` object in createGame (mutate fields; never a fresh `{ … }` literal per frame — Pitfall 5), per-model `leanX` closure state.

### Imperative Game-facade setter (never React-derived)
**Source:** `createGame.ts:157`/`:1731` (`setPixelFilter`) + the whole audio-bus setter family (:159-169/:1736-1744) + App effect+seed (:826-828/:925-928).
**Apply to:** `setReduceMotion` — same interface-declare → impl-fan-out → App-effect → App-construct-seed shape. Six existing settings already use it (`pixelFilter`, 3 volumes, 3 mutes) — consistency is the pattern.

### Gated `updateProjectionMatrix()` (D-07 perf)
**Source:** `createPixelRenderer.ts:54` (the FOV-45 camera; projection otherwise rebuilt only in `resize()`).
**Apply to:** cameraFeel FOV spring — call `updateProjectionMatrix()` only when `|fovOffset| ≥ ε` (+ one settle frame), never every frame (Pitfall 3, Anti-Pattern).

### Shake trigger sites — 5 assignment sites become `cameraFeel.shake(...)` impulses
**Source:** `createGame.ts:2092, 2102, 2111, 2141, 2151` — all identical shape:
```typescript
shakeMagnitude = Math.max(shakeMagnitude, SWING_SHAKE_MAGNITUDE * juiceFalloff);  // :2102
```
**Apply to:** each becomes `cameraFeel.shake(SWING_SHAKE_MAGNITUDE * juiceFalloff);` — the `Math.max` folds into `shake()`. All 5 (slimeSlam, swordSwing, swordSwirl, shieldDash, default-slam) verified present. No-legacy rule: the local `shakeMagnitude` state must be GONE from createGame after the move, not duplicated.

### Pure-helper-twin test discipline
**Source:** `__tests__/windMath.test.ts:1-36` (+ 5 sibling `*Math.test.ts`).
**Apply to:** `cameraFeelMath.test.ts` — pin BEHAVIOR (monotonicity, bounds, frame-rate independence, cooldown rejection, reduce-motion zeroing), not the playtest-tunable magnitude numbers (windMath.test.ts:22-24 makes this split explicit).

---

## No Analog Found

None. Every file maps to an in-repo analog. The only genuinely new mechanism — the two-phase FOV attack/release spring with a rate gate — has no exact prior, but its building blocks (exponential smoothing, a factory system, a math twin) are all established; RESEARCH.md §Pattern 4 + Code Examples give the concrete shape and starting constants.

## Metadata

**Analog search scope:** `src/game/systems/`, `src/game/engine/`, `src/game/entities/`, `src/game/combat/`, `src/App.tsx`, `src/ui/`.
**Files scanned (read this session):** `createGame.ts` (7 targeted ranges), `createCharacterModel.ts`, `createPixelRenderer.ts`, `createWind.ts`, `windMath.ts`, `windMath.test.ts`, `App.tsx` (3 ranges), `SettingsScreen.tsx` (2 ranges), `Toggle.tsx`, `damageKind.ts`; dir listings of `systems/`, `engine/`, `math/` (absent).
**Pattern extraction date:** 2026-07-20
</content>
</invoke>
