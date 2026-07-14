import { describe, expect, it } from 'vitest';
import {
  FLAG_IMPULSE_DECAY_SECONDS,
  decayFlagImpulse,
  withinDisturbRadius,
} from '../flagImpulse';

/**
 * Pure projectile-impulse math (plan 08-11 Gap 2). The shader displacement and
 * the world's disturb/decay loop both route through these — pinning the decay
 * window and the distance gate keeps the visible kick honest without a renderer.
 */

describe('decayFlagImpulse', () => {
  it('a magnitude-1 kick decays to 0 within the ~0.45s window and never goes negative', () => {
    let mag = 1;
    // March 60fps ticks across one full decay window.
    for (let elapsed = 0; elapsed < FLAG_IMPULSE_DECAY_SECONDS; elapsed += 1 / 60) {
      mag = decayFlagImpulse(mag, 1 / 60, FLAG_IMPULSE_DECAY_SECONDS);
      expect(mag).toBeGreaterThanOrEqual(0);
    }
    expect(mag).toBe(0);
  });

  it('a frame longer than the window clamps to 0, not negative', () => {
    expect(decayFlagImpulse(1, FLAG_IMPULSE_DECAY_SECONDS + 0.1, FLAG_IMPULSE_DECAY_SECONDS)).toBe(0);
  });

  it('a zero impulse stays zero (idle no-op)', () => {
    expect(decayFlagImpulse(0, 1 / 60, FLAG_IMPULSE_DECAY_SECONDS)).toBe(0);
  });
});

describe('withinDisturbRadius', () => {
  it('a point inside the radius returns true (kick)', () => {
    expect(withinDisturbRadius(1, 1, 3)).toBe(true); // dist ~1.41 < 3
  });

  it('a point outside the radius returns false (no work)', () => {
    expect(withinDisturbRadius(4, 3, 3)).toBe(false); // dist 5 > 3
  });

  it('exactly on the radius counts as inside', () => {
    expect(withinDisturbRadius(3, 0, 3)).toBe(true);
  });
});
