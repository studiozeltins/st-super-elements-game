import { describe, expect, it } from 'vitest';

// Pure ladder math only — no AudioContext, no DOM. The play functions are
// gesture-gated WebAudio and stay untested here by design.
import {
  GEM_BURST_MAX_CHIMES,
  GEM_BURST_SPACING_SECONDS,
  GEM_LADDER_MAX_STEPS,
  GEM_STREAK_WINDOW_SECONDS,
  gemBurstSeconds,
  gemChimeCount,
  nextGemStep,
} from '../createPickupAudio';

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

describe('gemChimeCount (big-pickup chime burst, tiered)', () => {
  it('small amounts (below one full hundred) play exactly one chime', () => {
    expect(gemChimeCount(0)).toBe(1);
    expect(gemChimeCount(1)).toBe(1);
    expect(gemChimeCount(99)).toBe(1);
  });

  it('tier 1: one chime per full hundred gems up to 1k', () => {
    expect(gemChimeCount(100)).toBe(1);
    expect(gemChimeCount(250)).toBe(2);
    expect(gemChimeCount(1000)).toBe(10);
  });

  it('tier 2: one chime per 500 from 1k to 11k', () => {
    expect(gemChimeCount(1500)).toBe(11);
    expect(gemChimeCount(11_000)).toBe(30);
  });

  it('tier 3: one chime per 1000 beyond 11k — a 21k golem jackpot lands ~5s', () => {
    expect(gemChimeCount(21_000)).toBe(40);
    expect(gemBurstSeconds(21_000)).toBeCloseTo(39 * GEM_BURST_SPACING_SECONDS);
  });

  it('caps at GEM_BURST_MAX_CHIMES (~10s) for beyond-jackpot amounts', () => {
    expect(gemChimeCount(58_000)).toBe(GEM_BURST_MAX_CHIMES);
    expect(gemChimeCount(1_000_000)).toBe(GEM_BURST_MAX_CHIMES);
    expect(gemBurstSeconds(1_000_000)).toBeCloseTo(
      (GEM_BURST_MAX_CHIMES - 1) * GEM_BURST_SPACING_SECONDS
    );
  });

  it('gemBurstSeconds is 0 for a single-chime pickup', () => {
    expect(gemBurstSeconds(50)).toBe(0);
  });

  it('clamps junk input (negative / non-finite) to a single chime', () => {
    expect(gemChimeCount(-500)).toBe(1);
    expect(gemChimeCount(NaN)).toBe(1);
    expect(gemChimeCount(Infinity)).toBe(1);
  });
});
