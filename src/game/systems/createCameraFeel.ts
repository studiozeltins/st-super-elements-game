import * as THREE from 'three';
import {
  CAMERA_FEEL,
  type FovKickState,
  canKick,
  projectionActive,
  startKick,
  stepFovKick,
} from './cameraFeelMath';

/**
 * The single owner of all discretionary CAMERA motion: the two-phase FOV kick
 * (CAM-03) and the combat camera shake (absorbed wholesale from createGame's
 * former block — no-legacy rule; the local `shakeMagnitude`/`SHAKE_DECAY_RATE`/
 * `SHAKE_FLOOR` state moves here and is deleted from createGame in 13-04).
 *
 * Every spring/gate decision delegates to the pure `cameraFeelMath` twin, so the
 * FOV shape, cooldown, and projection gate stay unit-tested without a renderer.
 * State is held in preallocated fields and `apply()` mutates the passed-in
 * `desiredPosition` in place — zero per-frame allocation (D-05/Pitfall 5).
 *
 * The `camera.updateProjectionMatrix()` rebuild is gated in ONE auditable spot
 * (the `projectionActive` path in `apply` + the `setReduceMotion` restore), never
 * per frame (D-07 / RESEARCH Pattern 4). Reduce-motion (CAM-04) has a single
 * home here: it no-ops future kicks/shakes AND snaps in-flight motion to 0.
 */
export interface CameraFeel {
  /**
   * Advance one frame: step the FOV kick (rebuilding the projection ONLY when
   * gated) and add the decaying shake offset to `desiredPosition` in place.
   * Called once per frame by createGame's updateCamera (wired in 13-04).
   */
  apply(desiredPosition: THREE.Vector3, dt: number): void;
  /** Fire a two-phase FOV punch, rate-gated by KICK_COOLDOWN_S (CAM-03). */
  kickFov(now: number): void;
  /** Trigger combat shake; accumulates via Math.max, decays in apply(). */
  shake(mag: number): void;
  /**
   * Set reduce-motion (CAM-04): no-ops future kicks/shakes and instantly snaps
   * any in-flight FOV offset + shake to 0 with one final projection rebuild.
   */
  setReduceMotion(enabled: boolean): void;
  /**
   * Push the pixel-mode magnitude factor in (createPixelRenderer has no getter —
   * RESEARCH A5). Stored forward-compatibly for any future camera effect.
   */
  setPixelScale(n: number): void;
}

/** Shake decay rate, 1/s — e^-7 ≈ 5% left after ~0.43s (absorbed :1364). */
const SHAKE_DECAY_RATE = 7;
/** Below this magnitude the shake snaps off (absorbed :1365). */
const SHAKE_FLOOR = 0.005;

export function createCameraFeel(opts: {
  camera: THREE.PerspectiveCamera;
  reduceMotion: boolean;
}): CameraFeel {
  const { camera } = opts;

  // Preallocated state — constructed ONCE, mutated in place every frame.
  const fovState: FovKickState = { offset: 0, phase: 'idle', attackRemaining: 0 };
  let lastKickAt = -Infinity;
  let wasActive = false;
  let shakeMagnitude = 0;
  let reduceMotion = opts.reduceMotion;
  let pixelScale = 1;

  return {
    apply(desiredPosition, dt) {
      // --- FOV kick: advance the spring, rebuild projection ONLY when gated ---
      stepFovKick(fovState, dt);
      if (projectionActive(fovState.offset, wasActive)) {
        camera.fov = CAMERA_FEEL.BASE_FOV + fovState.offset;
        camera.updateProjectionMatrix();
      }
      // Track the live flag for next frame's single settle rebuild (D-07).
      wasActive = Math.abs(fovState.offset) >= CAMERA_FEEL.FOV_EPS_DEG;

      // --- Shake: absorbed block — add jitter in place, decay, snap off ---
      if (shakeMagnitude > 0) {
        desiredPosition.x += (Math.random() - 0.5) * 2 * shakeMagnitude;
        desiredPosition.y += (Math.random() - 0.5) * 2 * shakeMagnitude;
        desiredPosition.z += (Math.random() - 0.5) * 2 * shakeMagnitude;
        shakeMagnitude *= Math.exp(-SHAKE_DECAY_RATE * dt);
        if (shakeMagnitude < SHAKE_FLOOR) shakeMagnitude = 0;
      }
    },

    kickFov(now) {
      if (reduceMotion) return; // CAM-04: no discretionary motion when reduced.
      if (!canKick(now, lastKickAt)) return; // CAM-03/D-06 rate gate (anti-strobe).
      lastKickAt = now;
      startKick(fovState);
    },

    shake(mag) {
      if (reduceMotion) return; // CAM-04.
      shakeMagnitude = Math.max(shakeMagnitude, mag);
    },

    setReduceMotion(enabled) {
      reduceMotion = enabled;
      if (!enabled) return;
      // Pitfall 6: snap all in-flight motion to 0 and restore base FOV with ONE
      // final projection rebuild.
      fovState.offset = 0;
      fovState.phase = 'idle';
      fovState.attackRemaining = 0;
      shakeMagnitude = 0;
      wasActive = false;
      camera.fov = CAMERA_FEEL.BASE_FOV;
      camera.updateProjectionMatrix();
    },

    setPixelScale(n) {
      pixelScale = n;
      void pixelScale; // stored; consumed by the 13-03 model + future camera FX.
    },
  };
}
