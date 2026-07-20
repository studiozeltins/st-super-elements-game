import { describe, expect, it } from 'vitest';
import {
  CAMERA_FEEL,
  breatheOffset,
  canKick,
  leanTarget,
  projectionActive,
  smooth,
  startKick,
  stepFovKick,
  type FovKickState,
} from '../cameraFeelMath';

// Discipline (windMath.test.ts): pin BEHAVIOR and RELATIONSHIPS, not the
// playtest-tunable magnitudes. The only raw-constant pin is BASE_FOV === 45,
// which is an exact extracted value from the live camera.

describe('smooth spring (CAM-01 frame-rate independence + monotonicity)', () => {
  it('moves strictly toward the target and never overshoots', () => {
    const samples: Array<[number, number, number, number]> = [
      [0, 1, 8, 1 / 60],
      [1, 0, 8, 1 / 60],
      [-2, 3, 38, 0.02],
      [10, -5, 4, 0.5],
      [0.5, 0.5, 8, 0.1],
    ];
    for (const [current, target, k, dt] of samples) {
      const next = smooth(current, target, k, dt);
      if (current < target) {
        expect(next).toBeGreaterThan(current);
        expect(next).toBeLessThanOrEqual(target);
      } else if (current > target) {
        expect(next).toBeLessThan(current);
        expect(next).toBeGreaterThanOrEqual(target);
      } else {
        expect(next).toBe(target);
      }
    }
  });

  it('is frame-rate independent: one dt step ~= two half-dt steps', () => {
    const cases: Array<[number, number, number, number]> = [
      [0, 3, 38, 1 / 60],
      [1, 0, 8, 1 / 30],
      [-2, 5, 12, 0.1],
      [10, -4, 6, 0.25],
    ];
    for (const [current, target, k, dt] of cases) {
      const oneStep = smooth(current, target, k, dt);
      const half = smooth(current, target, k, dt / 2);
      const twoHalfSteps = smooth(half, target, k, dt / 2);
      expect(twoHalfSteps).toBeCloseTo(oneStep, 6);
    }
  });
});

describe('leanTarget (CAM-01 run lean + CAM-04 reduce-motion)', () => {
  it('is 0 when stopped', () => {
    expect(leanTarget(false, false, 1)).toBe(0);
  });

  it('is positive and exactly LEAN_MAX_RAD*pixelScale when moving', () => {
    expect(leanTarget(true, false, 1)).toBe(CAMERA_FEEL.LEAN_MAX_RAD);
    expect(leanTarget(true, false, 1)).toBeGreaterThan(0);
    expect(leanTarget(true, false, CAMERA_FEEL.PIXEL_SCALE)).toBe(
      CAMERA_FEEL.LEAN_MAX_RAD * CAMERA_FEEL.PIXEL_SCALE,
    );
  });

  it('scales with pixelScale', () => {
    expect(leanTarget(true, false, 0.5)).toBeCloseTo(leanTarget(true, false, 1) * 0.5, 12);
  });

  it('is 0 when reduced regardless of moving (CAM-04)', () => {
    expect(leanTarget(true, true, 1)).toBe(0);
    expect(leanTarget(false, true, 1)).toBe(0);
  });
});

describe('breatheOffset (CAM-02 idle breathing + CAM-04 reduce-motion)', () => {
  it('is 0 while moving', () => {
    for (const t of [0, 0.37, 1.9, 12.4]) {
      expect(breatheOffset(t, true, false, 1)).toBe(0);
    }
  });

  it('is 0 while reduced, moving or not (CAM-04)', () => {
    for (const t of [0, 0.37, 1.9, 12.4]) {
      expect(breatheOffset(t, false, true, 1)).toBe(0);
      expect(breatheOffset(t, true, true, 1)).toBe(0);
    }
  });

  it('never exceeds ±(BREATHE_AMP*pixelScale) across a sweep of t', () => {
    const bound = CAMERA_FEEL.BREATHE_AMP * CAMERA_FEEL.PIXEL_SCALE;
    for (let t = 0; t <= 60; t += 0.05) {
      const v = breatheOffset(t, false, false, CAMERA_FEEL.PIXEL_SCALE);
      expect(Math.abs(v)).toBeLessThanOrEqual(bound + 1e-12);
    }
  });

  it('is non-zero at some t when idle and unreduced', () => {
    let sawNonZero = false;
    for (let t = 0; t <= 10; t += 0.05) {
      if (Math.abs(breatheOffset(t, false, false, 1)) > 1e-6) {
        sawNonZero = true;
        break;
      }
    }
    expect(sawNonZero).toBe(true);
  });
});

describe('FOV two-phase kick (CAM-03)', () => {
  it('exposes BASE_FOV === 45 (exact extracted camera value)', () => {
    expect(CAMERA_FEEL.BASE_FOV).toBe(45);
  });

  it('rises during the attack window then returns to an exact-0 idle settle', () => {
    const dt = 1 / 60;
    const state: FovKickState = { offset: 0, phase: 'idle', attackRemaining: 0 };

    startKick(state);
    expect(state.phase).toBe('attack');

    // Drive the attack window; offset climbs toward the peak and rises each step.
    let prev = state.offset;
    let steps = 0;
    while (state.phase === 'attack' && steps < 100) {
      stepFovKick(state, dt);
      expect(state.offset).toBeGreaterThan(prev);
      prev = state.offset;
      steps += 1;
    }
    // Attack ends after ~FOV_ATTACK_S and reaches near the peak (>50% of it).
    expect(state.phase).toBe('release');
    expect(state.offset).toBeGreaterThan(CAMERA_FEEL.FOV_PEAK_DEG * 0.5);
    expect(state.offset).toBeLessThanOrEqual(CAMERA_FEEL.FOV_PEAK_DEG);

    // Release returns TOWARD 0: within ~300ms (the ln(10)/k 90%-back figure) the
    // offset has dropped to near baseline (< 10% of the peak). We assert the
    // 90%-back timing, not below-epsilon — epsilon (0.02°) is the tunable settle
    // floor and the spring's tail to it runs longer than the 90% mark.
    const peakOffset = state.offset;
    let backSteps = 0;
    while (state.offset > CAMERA_FEEL.FOV_PEAK_DEG * 0.1 && backSteps < 100) {
      stepFovKick(state, dt);
      backSteps += 1;
    }
    expect(state.offset).toBeLessThanOrEqual(CAMERA_FEEL.FOV_PEAK_DEG * 0.1);
    expect(state.offset).toBeLessThan(peakOffset);
    // 90%-back within ~300ms of release start (18 frames @60fps + a little slack).
    expect(backSteps).toBeLessThanOrEqual(Math.ceil(0.32 / dt));

    // The tail eventually snaps to an EXACT-0 idle settle within a bounded window.
    let settleSteps = 0;
    const maxSettleSteps = Math.ceil(1.0 / dt); // generous 1s budget for the epsilon tail
    while (state.phase === 'release' && settleSteps < maxSettleSteps) {
      stepFovKick(state, dt);
      settleSteps += 1;
    }
    expect(state.phase).toBe('idle');
    expect(state.offset).toBe(0);
  });

  it('a settled idle state is a no-op under further steps', () => {
    const state: FovKickState = { offset: 0, phase: 'idle', attackRemaining: 0 };
    stepFovKick(state, 1 / 60);
    expect(state.offset).toBe(0);
    expect(state.phase).toBe('idle');
  });
});

describe('canKick cooldown rejection (CAM-03/D-06)', () => {
  it('rejects a second kick inside KICK_COOLDOWN_S', () => {
    const lastKickAt = 10;
    expect(canKick(lastKickAt, lastKickAt)).toBe(false);
    expect(canKick(lastKickAt + CAMERA_FEEL.KICK_COOLDOWN_S * 0.5, lastKickAt)).toBe(false);
  });

  it('allows a kick at or after the cooldown', () => {
    // lastKickAt = 0 keeps the at-boundary case exact (0 + 0.35 - 0 === 0.35);
    // a nonzero base would surface a floating-point sub-ULP artifact, not behavior.
    expect(canKick(CAMERA_FEEL.KICK_COOLDOWN_S, 0)).toBe(true);
    expect(canKick(10 + CAMERA_FEEL.KICK_COOLDOWN_S * 2, 10)).toBe(true);
  });
});

describe('projectionActive gate predicate (CAM-03/D-07)', () => {
  it('is false when offset is 0 and it was not active last frame', () => {
    expect(projectionActive(0, false)).toBe(false);
  });

  it('is true whenever |offset| >= FOV_EPS_DEG', () => {
    expect(projectionActive(CAMERA_FEEL.FOV_EPS_DEG, false)).toBe(true);
    expect(projectionActive(CAMERA_FEEL.FOV_PEAK_DEG, false)).toBe(true);
    expect(projectionActive(-CAMERA_FEEL.FOV_PEAK_DEG, false)).toBe(true);
  });

  it('is true for the single settle frame (offset 0 but wasActive)', () => {
    expect(projectionActive(0, true)).toBe(true);
  });
});
