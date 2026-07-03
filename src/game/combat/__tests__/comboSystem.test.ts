import { describe, expect, it } from 'vitest';
import {
  comboWindowSeconds,
  regularAttackMultiplier,
  skillAttackMultiplier,
  swingProfile,
  COMBO_BASE_WINDOW_SECONDS,
  COMBO_MIN_WINDOW_SECONDS,
} from '../comboSystem';

describe('comboWindowSeconds', () => {
  it('starts at the base window with no combo', () => {
    expect(comboWindowSeconds(0)).toBeCloseTo(COMBO_BASE_WINDOW_SECONDS, 5);
  });

  it('shrinks monotonically as the combo climbs', () => {
    let previous = comboWindowSeconds(0);
    for (let combo = 1; combo <= 200; combo += 5) {
      const current = comboWindowSeconds(combo);
      expect(current).toBeLessThan(previous);
      previous = current;
    }
  });

  it('never drops below the floor and stays within the band', () => {
    for (let combo = 0; combo <= 5000; combo += 250) {
      const window = comboWindowSeconds(combo);
      expect(window).toBeGreaterThanOrEqual(COMBO_MIN_WINDOW_SECONDS - 1e-9);
      expect(window).toBeLessThanOrEqual(COMBO_BASE_WINDOW_SECONDS + 1e-9);
    }
  });

  it('clamps a negative combo to the base window', () => {
    expect(comboWindowSeconds(-10)).toBeCloseTo(COMBO_BASE_WINDOW_SECONDS, 5);
  });
});

describe('attack multipliers', () => {
  it('regular multiplier is 1 at zero combo and rises slowly', () => {
    expect(regularAttackMultiplier(0)).toBe(1);
    expect(regularAttackMultiplier(10)).toBeGreaterThan(1);
    expect(regularAttackMultiplier(10)).toBeLessThan(1.3);
  });

  it('regular multiplier is capped', () => {
    expect(regularAttackMultiplier(100000)).toBeLessThanOrEqual(1.75 + 1e-9);
  });

  it('skill multiplier is 1 at zero combo and grows uncapped, far above regular', () => {
    expect(skillAttackMultiplier(0)).toBe(1);
    expect(skillAttackMultiplier(50)).toBeGreaterThan(regularAttackMultiplier(50) * 3);
    expect(skillAttackMultiplier(1000)).toBeGreaterThan(skillAttackMultiplier(100));
  });

  it('clamps negative combos to the base multiplier', () => {
    expect(regularAttackMultiplier(-5)).toBe(1);
    expect(skillAttackMultiplier(-5)).toBe(1);
  });
});

describe('swingProfile', () => {
  const VALID_KINDS = new Set(['slashLeft', 'slashRight', 'thrust', 'spin']);

  it('returns a valid swing kind and sane timing for every swing', () => {
    for (let swingIndex = 1; swingIndex <= 40; swingIndex += 1) {
      const profile = swingProfile(swingIndex, swingIndex);
      expect(VALID_KINDS.has(profile.swingKind)).toBe(true);
      expect(profile.swingDurationSeconds).toBeGreaterThan(0);
      expect(profile.swingDurationSeconds).toBeLessThanOrEqual(1);
      expect(profile.swingArc).toBeGreaterThan(0);
    }
  });

  it('does a spin flourish every sixth swing', () => {
    expect(swingProfile(6, 0).swingKind).toBe('spin');
    expect(swingProfile(6, 0).isFlourish).toBe(true);
    expect(swingProfile(12, 0).isFlourish).toBe(true);
    expect(swingProfile(5, 0).isFlourish).toBe(false);
  });

  it('grows the swing arc a little with combo depth (non-flourish)', () => {
    expect(swingProfile(1, 40).swingArc).toBeGreaterThan(swingProfile(1, 0).swingArc);
  });
});
