import { describe, expect, it } from 'vitest';
import {
  comboWindowSeconds,
  regularAttackMultiplier,
  skillAttackMultiplier,
  swingProfile,
  COMBO_BASE_WINDOW_SECONDS,
  COMBO_MIN_WINDOW_SECONDS,
} from '../comboSystem';

// These fill gaps left by comboSystem.test.ts: exhaustive range checks,
// asymptotic behavior, the skill-vs-regular growth relationship, and
// swingProfile determinism. No overlap with the spot-checks there.

describe('comboWindowSeconds — bounds and shape', () => {
  it('equals the base window exactly at combo 0', () => {
    expect(comboWindowSeconds(0)).toBe(COMBO_BASE_WINDOW_SECONDS);
  });

  it('approaches the floor for a large combo', () => {
    // exp(-0.06 * 1000) is astronomically small, so this is essentially the floor.
    expect(comboWindowSeconds(1000)).toBeGreaterThanOrEqual(COMBO_MIN_WINDOW_SECONDS);
    expect(comboWindowSeconds(1000) - COMBO_MIN_WINDOW_SECONDS).toBeLessThan(0.02);
  });

  it('is strictly decreasing across the whole practical range', () => {
    let previous = comboWindowSeconds(0);
    for (let combo = 1; combo <= 300; combo += 1) {
      const current = comboWindowSeconds(combo);
      expect(current).toBeLessThan(previous);
      previous = current;
    }
  });
});

describe('regular vs skill multiplier relationship', () => {
  it('skill is never below regular at any combo in 0..200', () => {
    for (let combo = 0; combo <= 200; combo += 1) {
      expect(skillAttackMultiplier(combo)).toBeGreaterThanOrEqual(regularAttackMultiplier(combo));
    }
  });

  it('skill grows faster than regular per 10-combo step', () => {
    for (let combo = 0; combo <= 200; combo += 1) {
      const skillStep = skillAttackMultiplier(combo + 10) - skillAttackMultiplier(combo);
      const regularStep = regularAttackMultiplier(combo + 10) - regularAttackMultiplier(combo);
      expect(skillStep).toBeGreaterThan(regularStep);
    }
  });
});

describe('swingProfile — determinism and flourish predicate', () => {
  it('is a pure function: same inputs deep-equal the same output', () => {
    for (let swingIndex = 0; swingIndex <= 30; swingIndex += 1) {
      for (const combo of [0, 7, 40, 200]) {
        expect(swingProfile(swingIndex, combo)).toEqual(swingProfile(swingIndex, combo));
      }
    }
  });

  it('flags a flourish exactly when swingIndex % 6 === 0 and swingIndex > 0', () => {
    for (let swingIndex = 0; swingIndex <= 60; swingIndex += 1) {
      const expected = swingIndex > 0 && swingIndex % 6 === 0;
      expect(swingProfile(swingIndex, 0).isFlourish).toBe(expected);
    }
  });
});
