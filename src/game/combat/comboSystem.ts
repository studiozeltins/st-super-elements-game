/** Minimum time between registered swings — rapid clicks still pace out. */
export const COMBO_INPUT_COOLDOWN_SECONDS = 0.16;

// The combo is unbounded and only climbs when an attack actually lands.
export const COMBO_BASE_WINDOW_SECONDS = 2.2;
export const COMBO_MIN_WINDOW_SECONDS = 0.55;
const WINDOW_DECAY_PER_HIT = 0.06;

/**
 * How long you have to land the next hit before the combo drops. Starts
 * generous and decays toward a floor as the combo climbs, so a high combo
 * demands faster follow-ups.
 */
export function comboWindowSeconds(combo: number): number {
  const span = COMBO_BASE_WINDOW_SECONDS - COMBO_MIN_WINDOW_SECONDS;
  return COMBO_MIN_WINDOW_SECONDS + span * Math.exp(-WINDOW_DECAY_PER_HIT * Math.max(0, combo));
}

const REGULAR_RAMP_PER_COMBO = 0.02;
const REGULAR_RAMP_CAP = 0.75;

/** Regular attacks get a small, capped boost from the combo. */
export function regularAttackMultiplier(combo: number): number {
  return 1 + Math.min(REGULAR_RAMP_CAP, Math.max(0, combo) * REGULAR_RAMP_PER_COMBO);
}

const SKILL_RAMP_PER_COMBO = 0.12;

/** The skill (Q) is the combo payoff — it scales strongly and uncapped. */
export function skillAttackMultiplier(combo: number): number {
  return 1 + Math.max(0, combo) * SKILL_RAMP_PER_COMBO;
}

export type SwingKind = 'slashLeft' | 'slashRight' | 'thrust' | 'spin';

export interface SwingProfile {
  swingKind: SwingKind;
  /** Swing arc in radians — grows a little with combo depth. */
  swingArc: number;
  swingDurationSeconds: number;
  /** Every few swings does a spin flourish for flavor. */
  isFlourish: boolean;
}

const SWING_CYCLE: SwingKind[] = ['slashLeft', 'slashRight', 'thrust', 'slashRight', 'slashLeft', 'thrust'];
const FLOURISH_EVERY = 6;

/** Visual swing shape for the Nth swing; independent of whether it lands. */
export function swingProfile(swingIndex: number, combo: number): SwingProfile {
  const isFlourish = swingIndex > 0 && swingIndex % FLOURISH_EVERY === 0;
  const comboArcBoost = Math.min(1.2, Math.max(0, combo) * 0.03);
  return {
    swingKind: isFlourish ? 'spin' : SWING_CYCLE[swingIndex % SWING_CYCLE.length],
    swingArc: isFlourish ? Math.PI * 2 : 1.5 + comboArcBoost,
    swingDurationSeconds: isFlourish ? 0.55 : Math.max(0.18, 0.3 - Math.max(0, combo) * 0.003),
    isFlourish,
  };
}
