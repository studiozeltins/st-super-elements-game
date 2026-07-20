/**
 * Pure camera-feel math — the single source of truth for every camera-feel
 * consumer (createCameraFeel in 13-02 owns the FOV kick + projection gate;
 * createCharacterModel in 13-03 owns the run lean + idle breathing). ZERO
 * imports (not even three) so the tuning-independent LOGIC — spring
 * monotonicity, frame-rate independence, two-phase FOV shape, cooldown
 * rejection, projection-gate predicate, and reduce-motion zeroing — is
 * unit-testable without a renderer.
 *
 * Every magnitude below is playtest-tunable (CAM-01..04 give ranges, not fixed
 * values); the BEHAVIOR (bounds, monotonicity, gating, zeroing) is what the
 * vitest twin pins. Deterministic by construction: no RNG, no allocations
 * (stepFovKick mutates its state in place per D-05/Pitfall 5).
 */

/**
 * Frozen config block — every tunable in one place, derivations from
 * 13-RESEARCH Pattern 1 as short line comments. Starting values only; all
 * marked playtest-tunable, so tests must not pin these magnitudes except where
 * an exact extracted value is the point (e.g. BASE_FOV === 45).
 */
export const CAMERA_FEEL = {
  /** PerspectiveCamera FOV at rest (createPixelRenderer.ts:54). */
  BASE_FOV: 45,
  /** Peak FOV kick offset in degrees — mid of the +2–5° CAM-03 range. */
  FOV_PEAK_DEG: 3,
  /** Attack window in seconds — ~60ms punch-in (CAM-03). */
  FOV_ATTACK_S: 0.06,
  /** Attack spring rate, 1/s — ~90% of the gap in 60ms: ln(10)/0.06 ≈ 38. */
  FOV_K_ATTACK: 38,
  /** Release spring rate, 1/s — ~90% back in ~290ms: ln(10)/0.30 ≈ 8. */
  FOV_K_RELEASE: 8,
  /** Projection-gate epsilon in degrees — below this the kick is done (D-07). */
  FOV_EPS_DEG: 0.02,
  /** Rate gate in seconds — one AoE crit hitting N enemies must not strobe (D-06). */
  KICK_COOLDOWN_S: 0.35,
  /** Lean spring rate, 1/s — ~90% settle in ~0.29s, responsive but smooth. */
  LEAN_K: 8,
  /** Max forward pitch in radians — ~3°, mid of the 2–4° CAM-01 range. */
  LEAN_MAX_RAD: 0.052,
  /** Breathing vertical amplitude in world units — just under the 0.02 head-bob. */
  BREATHE_AMP: 0.015,
  /** Breathing angular frequency, rad/s — slower than the 3 rad/s head-bob reads as calm. */
  BREATHE_OMEGA: 2.2,
  /** Magnitude multiplier in pixel-filter mode (D-01/D-03: kept but conservative). */
  PIXEL_SCALE: 0.5,
} as const;

/**
 * The ONE spring step: frame-rate-independent exponential smoothing.
 * `current + (target - current) * (1 - exp(-k*dt))`. Monotonic toward target,
 * never overshoots, and one dt step equals two half-dt steps within numeric
 * epsilon (unlike a constant-α lerp). When current == target returns target.
 */
export function smooth(current: number, target: number, k: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-k * dt));
}

/**
 * Forward-lean target in radians for the current move/reduce state (CAM-01).
 * reduce-motion zeroes it (CAM-04); otherwise it is LEAN_MAX_RAD·pixelScale
 * while moving, 0 while stopped.
 */
export function leanTarget(isMoving: boolean, reduceMotion: boolean, pixelScale: number): number {
  if (reduceMotion) return 0;
  return (isMoving ? CAMERA_FEEL.LEAN_MAX_RAD : 0) * pixelScale;
}

/**
 * Breathing vertical offset (CAM-02). Zero while moving OR while reduced
 * (CAM-04); otherwise a slow sine bounded by ±(BREATHE_AMP·pixelScale).
 */
export function breatheOffset(
  t: number,
  isMoving: boolean,
  reduceMotion: boolean,
  pixelScale: number,
): number {
  if (reduceMotion || isMoving) return 0;
  return Math.sin(t * CAMERA_FEEL.BREATHE_OMEGA) * CAMERA_FEEL.BREATHE_AMP * pixelScale;
}

/**
 * Mutable two-phase FOV kick state (zero per-frame alloc — reused in place).
 * `offset` is the current FOV delta above BASE_FOV; `phase` drives the spring;
 * `attackRemaining` counts the attack window down.
 */
export type FovKickState = {
  offset: number;
  phase: 'idle' | 'attack' | 'release';
  attackRemaining: number;
};

/**
 * Begin a kick: enter the attack phase for FOV_ATTACK_S. The caller (13-02)
 * gates this on `!reduceMotion` (CAM-04) and `canKick` (CAM-03 rate gate); this
 * function itself is the pure state transition.
 */
export function startKick(state: FovKickState): void {
  state.phase = 'attack';
  state.attackRemaining = CAMERA_FEEL.FOV_ATTACK_S;
}

/**
 * Advance the kick one dt in place (CAM-03 two-phase spring, ONE spring idiom):
 * attack springs `offset` toward FOV_PEAK_DEG at FOV_K_ATTACK and decrements
 * the window; when it elapses, switch to release. Release springs `offset`
 * toward 0 at FOV_K_RELEASE; once |offset| < FOV_EPS_DEG it snaps to exactly 0
 * and phase to 'idle'.
 */
export function stepFovKick(state: FovKickState, dt: number): void {
  if (state.phase === 'attack') {
    state.offset = smooth(state.offset, CAMERA_FEEL.FOV_PEAK_DEG, CAMERA_FEEL.FOV_K_ATTACK, dt);
    state.attackRemaining -= dt;
    if (state.attackRemaining <= 0) state.phase = 'release';
  } else if (state.phase === 'release') {
    state.offset = smooth(state.offset, 0, CAMERA_FEEL.FOV_K_RELEASE, dt);
    if (Math.abs(state.offset) < CAMERA_FEEL.FOV_EPS_DEG) {
      state.offset = 0;
      state.phase = 'idle';
    }
  }
}

/**
 * Projection-rebuild gate predicate (CAM-03/D-07): true when the kick is live
 * (|offset| ≥ ε) OR on the single settle frame (`wasActive` from the prior
 * frame with offset now 0) that snaps fov exactly to BASE_FOV. When idle and
 * already settled, false — zero updateProjectionMatrix calls.
 */
export function projectionActive(offset: number, wasActive: boolean): boolean {
  return Math.abs(offset) >= CAMERA_FEEL.FOV_EPS_DEG || wasActive;
}

/**
 * Rate gate (CAM-03/D-06): a second kick is allowed only once KICK_COOLDOWN_S
 * has passed since the last one — an AoE crit hitting many enemies in one frame
 * must not strobe the FOV.
 */
export function canKick(now: number, lastKickAt: number): boolean {
  return now - lastKickAt >= CAMERA_FEEL.KICK_COOLDOWN_S;
}
