import { describe, expect, it } from 'vitest';
import {
  COMBO_CONTINUE_WINDOW_SECONDS,
  MAX_COMBO_STEP,
  type SwingKind,
  comboProfile,
  nextComboStep,
} from '../comboSystem';

const KNOWN_SWING_KINDS: readonly SwingKind[] = [
  'slashLeft',
  'slashRight',
  'thrust',
  'spin',
  'finisher',
];

describe('nextComboStep', () => {
  it('starts a fresh combo from idle (0)', () => {
    expect(nextComboStep(0, 0)).toBe(1);
  });

  it('climbs step by step within the continue window', () => {
    let step = 0;
    for (let expected = 1; expected < MAX_COMBO_STEP; expected += 1) {
      step = nextComboStep(step, 0);
      expect(step).toBe(expected);
    }
  });

  it('wraps back to 1 after reaching MAX_COMBO_STEP', () => {
    expect(nextComboStep(MAX_COMBO_STEP, 0)).toBe(1);
  });

  it('resets to 1 when the continue window has expired', () => {
    expect(nextComboStep(3, COMBO_CONTINUE_WINDOW_SECONDS + 0.01)).toBe(1);
  });

  it('still climbs when exactly at the continue window boundary', () => {
    expect(nextComboStep(3, COMBO_CONTINUE_WINDOW_SECONDS)).toBe(4);
  });

  it('treats a negative previous step as a fresh combo', () => {
    expect(nextComboStep(-5, 0)).toBe(1);
  });

  it('treats an out-of-range large previous step as a wrap', () => {
    expect(nextComboStep(999, 0)).toBe(1);
  });
});

describe('comboProfile', () => {
  it('clamps step below 1 up to 1', () => {
    expect(comboProfile(0).step).toBe(1);
    expect(comboProfile(-4).step).toBe(1);
  });

  it('clamps step above MAX down to MAX', () => {
    expect(comboProfile(MAX_COMBO_STEP + 20).step).toBe(MAX_COMBO_STEP);
  });

  it('increases damageMultiplier strictly for non-finisher steps', () => {
    for (let step = 1; step < MAX_COMBO_STEP - 1; step += 1) {
      expect(comboProfile(step + 1).damageMultiplier).toBeGreaterThan(
        comboProfile(step).damageMultiplier,
      );
    }
  });

  it('makes the finisher (step 10) the biggest multiplier and marks isFinisher', () => {
    const finisher = comboProfile(MAX_COMBO_STEP);
    expect(finisher.isFinisher).toBe(true);
    for (let step = 1; step < MAX_COMBO_STEP; step += 1) {
      expect(comboProfile(step).isFinisher).toBe(false);
      expect(finisher.damageMultiplier).toBeGreaterThan(comboProfile(step).damageMultiplier);
    }
  });

  it('grows swingArc with step depth', () => {
    for (let step = 1; step < MAX_COMBO_STEP; step += 1) {
      expect(comboProfile(step + 1).swingArc).toBeGreaterThan(comboProfile(step).swingArc);
    }
  });

  it('keeps swingDurationSeconds within (0, 1] for every step', () => {
    for (let step = 1; step <= MAX_COMBO_STEP; step += 1) {
      const { swingDurationSeconds } = comboProfile(step);
      expect(swingDurationSeconds).toBeGreaterThan(0);
      expect(swingDurationSeconds).toBeLessThanOrEqual(1);
    }
  });

  it('returns a valid swingKind from the known set for every step', () => {
    for (let step = 1; step <= MAX_COMBO_STEP; step += 1) {
      expect(KNOWN_SWING_KINDS).toContain(comboProfile(step).swingKind);
    }
  });

  it('uses the finisher swingKind at step 10', () => {
    expect(comboProfile(MAX_COMBO_STEP).swingKind).toBe('finisher');
  });
});
