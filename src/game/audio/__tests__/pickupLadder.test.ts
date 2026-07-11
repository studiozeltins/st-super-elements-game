import { describe, expect, it } from 'vitest';

// Pure ladder math only — no AudioContext, no DOM. The play functions are
// gesture-gated WebAudio and stay untested here by design.
import {
  GEM_BURST_MAX_CHIMES,
  GEM_CHIME_PER_AMOUNT,
  GEM_CHIME_PER_BIG_AMOUNT,
  GEM_LADDER_MAX_STEPS,
  GEM_STREAK_WINDOW_SECONDS,
  gemChimeCount,
  gemLadderRatio,
  nextGemStep,
} from '../createPickupAudio';

describe('gemLadderRatio (gem pickup streak ladder)', () => {
  it('starts at the base chime (ratio 1) for step 0', () => {
    expect(gemLadderRatio(0)).toBe(1);
  });

  it('rises strictly monotonically up to the cap', () => {
    for (let step = 0; step < GEM_LADDER_MAX_STEPS; step++) {
      expect(gemLadderRatio(step + 1)).toBeGreaterThan(gemLadderRatio(step));
    }
  });

  it('caps: steps past GEM_LADDER_MAX_STEPS all land the top rung', () => {
    const top = gemLadderRatio(GEM_LADDER_MAX_STEPS);
    expect(gemLadderRatio(GEM_LADDER_MAX_STEPS + 1)).toBe(top);
    expect(gemLadderRatio(1000)).toBe(top);
  });

  it('re-enters the pentatonic table an octave up past the table length', () => {
    // Step 5 = first rung of the second octave = 2× the base.
    expect(gemLadderRatio(5)).toBe(2);
    expect(gemLadderRatio(6)).toBe(2 * gemLadderRatio(1));
  });

  it('clamps junk input (negative / fractional) into the ladder', () => {
    expect(gemLadderRatio(-3)).toBe(1);
    expect(gemLadderRatio(2.9)).toBe(gemLadderRatio(2));
  });
});

describe('nextGemStep (streak advance/reset)', () => {
  it('climbs one rung per pickup inside the streak window', () => {
    expect(nextGemStep(0, 0.3)).toBe(1);
    expect(nextGemStep(3, GEM_STREAK_WINDOW_SECONDS)).toBe(4);
  });

  it('caps at GEM_LADDER_MAX_STEPS', () => {
    expect(nextGemStep(GEM_LADDER_MAX_STEPS, 0.1)).toBe(GEM_LADDER_MAX_STEPS);
    expect(nextGemStep(GEM_LADDER_MAX_STEPS + 5, 0.1)).toBe(GEM_LADDER_MAX_STEPS);
  });

  it('resets to the base after a gap past the window', () => {
    expect(nextGemStep(5, GEM_STREAK_WINDOW_SECONDS + 0.01)).toBe(0);
  });

  it('the very first pickup (infinite gap) starts at the base', () => {
    expect(nextGemStep(0, Infinity)).toBe(0);
  });
});

describe('gemChimeCount (big-pickup chime burst)', () => {
  it('small amounts (below one full hundred) play exactly one chime', () => {
    expect(gemChimeCount(0)).toBe(1);
    expect(gemChimeCount(1)).toBe(1);
    expect(gemChimeCount(GEM_CHIME_PER_AMOUNT - 1)).toBe(1);
  });

  it('adds one chime per full hundred gems up to a thousand', () => {
    expect(gemChimeCount(GEM_CHIME_PER_AMOUNT)).toBe(1);
    expect(gemChimeCount(GEM_CHIME_PER_AMOUNT * 2)).toBe(2);
    expect(gemChimeCount(250)).toBe(2);
    expect(gemChimeCount(500)).toBe(5);
    expect(gemChimeCount(GEM_CHIME_PER_BIG_AMOUNT)).toBe(10);
  });

  it('adds one chime per additional full thousand beyond the first', () => {
    expect(gemChimeCount(GEM_CHIME_PER_BIG_AMOUNT * 2)).toBe(11);
    expect(gemChimeCount(GEM_CHIME_PER_BIG_AMOUNT * 5)).toBe(14);
  });

  it('caps at GEM_BURST_MAX_CHIMES for jackpot amounts', () => {
    expect(gemChimeCount(GEM_CHIME_PER_BIG_AMOUNT * 7)).toBe(GEM_BURST_MAX_CHIMES);
    expect(gemChimeCount(1_000_000)).toBe(GEM_BURST_MAX_CHIMES);
  });

  it('clamps junk input (negative / non-finite) to a single chime', () => {
    expect(gemChimeCount(-500)).toBe(1);
    expect(gemChimeCount(NaN)).toBe(1);
    expect(gemChimeCount(Infinity)).toBe(1);
  });
});
