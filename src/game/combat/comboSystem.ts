export const MAX_COMBO_STEP = 10;
/** Click again within this window to extend the combo; otherwise it resets. */
export const COMBO_CONTINUE_WINDOW_SECONDS = 1.2;
/** Minimum time between registered swings — rapid clicks still pace out. */
export const COMBO_INPUT_COOLDOWN_SECONDS = 0.16;

export type SwingKind = 'slashLeft' | 'slashRight' | 'thrust' | 'spin' | 'finisher';

export interface ComboProfile {
  step: number;
  damageMultiplier: number;
  swingKind: SwingKind;
  /** Swing arc in radians — grows with combo depth (the "deeper" animation). */
  swingArc: number;
  swingDurationSeconds: number;
  isFinisher: boolean;
}

// Non-finisher swings cycle through these; the 10th step is always the finisher.
const SWING_CYCLE: SwingKind[] = [
  'slashLeft',
  'slashRight',
  'thrust',
  'slashRight',
  'slashLeft',
  'spin',
  'slashLeft',
  'slashRight',
  'thrust',
];

/**
 * Advances the combo counter. A fresh combo (idle, expired window, or just
 * past the finisher) starts at 1; otherwise it climbs toward MAX_COMBO_STEP.
 */
export function nextComboStep(previousStep: number, secondsSinceLastSwing: number): number {
  if (previousStep <= 0 || previousStep >= MAX_COMBO_STEP) return 1;
  if (secondsSinceLastSwing > COMBO_CONTINUE_WINDOW_SECONDS) return 1;
  return previousStep + 1;
}

/** Damage, swing shape, and timing for a given combo step (deeper = bigger). */
export function comboProfile(step: number): ComboProfile {
  const clampedStep = Math.max(1, Math.min(MAX_COMBO_STEP, step));
  const isFinisher = clampedStep === MAX_COMBO_STEP;
  return {
    step: clampedStep,
    damageMultiplier: isFinisher ? 2.8 : 1 + (clampedStep - 1) * 0.12,
    swingKind: isFinisher ? 'finisher' : SWING_CYCLE[(clampedStep - 1) % SWING_CYCLE.length],
    swingArc: isFinisher ? Math.PI * 2 : 1.4 + clampedStep * 0.16,
    swingDurationSeconds: isFinisher ? 0.7 : Math.max(0.18, 0.34 - clampedStep * 0.012),
    isFinisher,
  };
}
