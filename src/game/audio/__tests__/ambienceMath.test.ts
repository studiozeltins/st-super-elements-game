import { describe, expect, it } from 'vitest';
import {
  BED_BASE_GAIN,
  BED_CUTOFF_CALM_HZ,
  BED_CUTOFF_GUST_HZ,
  BED_SWELL_GAIN,
  BIRD_MAX_S,
  BIRD_MIN_S,
  DAY_START_PHASE,
  GRUNT_FAR_RADIUS,
  GRUNT_MAX_S,
  GRUNT_MIN_S,
  GRUNT_NEAR_RADIUS,
  NIGHT_START_PHASE,
  NIGHT_MIN_S,
  NIGHT_MAX_S,
  NIGHT_BACKOFF_STEP,
  NIGHT_BACKOFF_CAP,
  bedCutoff,
  bedGainTarget,
  gruntProximityGain,
  isBirdTime,
  isNightCreatureTime,
  jitterFactor,
  nextBackoffDelay,
  nextOneShotDelay,
} from '../ambienceMath';

// Pure ambience math (D-05/D-10/D-11, AMBI-02/03/05/07). We pin BEHAVIOR — the
// bounds, monotonicity, non-metronomic variation, and day/night partition — not
// the playtest-tunable magic numbers, mirroring the windMath.ts twin discipline.

describe('nextBackoffDelay: night chirps thin out (progressive backoff)', () => {
  const mid = 0.5;
  it('equals the plain delay on the first fire (streak 0)', () => {
    expect(nextBackoffDelay(NIGHT_MIN_S, NIGHT_MAX_S, 0, NIGHT_BACKOFF_STEP, NIGHT_BACKOFF_CAP, mid)).toBe(
      nextOneShotDelay(NIGHT_MIN_S, NIGHT_MAX_S, mid)
    );
  });

  it('grows monotonically with the streak', () => {
    const d0 = nextBackoffDelay(NIGHT_MIN_S, NIGHT_MAX_S, 0, NIGHT_BACKOFF_STEP, NIGHT_BACKOFF_CAP, mid);
    const d1 = nextBackoffDelay(NIGHT_MIN_S, NIGHT_MAX_S, 1, NIGHT_BACKOFF_STEP, NIGHT_BACKOFF_CAP, mid);
    const d3 = nextBackoffDelay(NIGHT_MIN_S, NIGHT_MAX_S, 3, NIGHT_BACKOFF_STEP, NIGHT_BACKOFF_CAP, mid);
    expect(d1).toBeGreaterThan(d0);
    expect(d3).toBeGreaterThan(d1);
  });

  it('saturates at the cap multiplier for a large streak', () => {
    const base = nextOneShotDelay(NIGHT_MIN_S, NIGHT_MAX_S, mid);
    const huge = nextBackoffDelay(NIGHT_MIN_S, NIGHT_MAX_S, 999, NIGHT_BACKOFF_STEP, NIGHT_BACKOFF_CAP, mid);
    expect(huge).toBeCloseTo(base * NIGHT_BACKOFF_CAP, 9);
  });
});

describe('nextOneShotDelay window + non-metronomic cadence (AMBI-03, D-10)', () => {
  it('lands strictly inside [min,max]: min at rand=0, approaches max at rand→1', () => {
    expect(nextOneShotDelay(BIRD_MIN_S, BIRD_MAX_S, 0)).toBe(BIRD_MIN_S);
    expect(nextOneShotDelay(BIRD_MIN_S, BIRD_MAX_S, 0.999)).toBeGreaterThan(BIRD_MIN_S);
    expect(nextOneShotDelay(BIRD_MIN_S, BIRD_MAX_S, 0.999)).toBeLessThan(BIRD_MAX_S);
    for (const rand of [0, 0.5, 0.999]) {
      const delay = nextOneShotDelay(BIRD_MIN_S, BIRD_MAX_S, rand);
      expect(delay).toBeGreaterThanOrEqual(BIRD_MIN_S);
      expect(delay).toBeLessThan(BIRD_MAX_S);
    }
  });

  it('varies with rand — never a fixed interval (the metronome anti-pattern)', () => {
    const a = nextOneShotDelay(BIRD_MIN_S, BIRD_MAX_S, 0.2);
    const b = nextOneShotDelay(BIRD_MIN_S, BIRD_MAX_S, 0.8);
    expect(a).not.toBe(b);
    // Grunts use their own (longer) window but the same never-metronomic map.
    expect(nextOneShotDelay(GRUNT_MIN_S, GRUNT_MAX_S, 0.1)).not.toBe(
      nextOneShotDelay(GRUNT_MIN_S, GRUNT_MAX_S, 0.9)
    );
  });

  it('grunt intervals are longer than bird intervals (distant, occasional)', () => {
    expect(GRUNT_MIN_S).toBeGreaterThan(BIRD_MAX_S);
    expect(GRUNT_MAX_S).toBeGreaterThan(GRUNT_MIN_S);
  });
});

describe('bedGainTarget continuous audible bed swelling with gust (AMBI-02, D-05)', () => {
  it('is > 0 at gust=0 — the base bed is audible between gusts', () => {
    expect(bedGainTarget(0)).toBeGreaterThan(0);
    expect(bedGainTarget(0)).toBe(BED_BASE_GAIN);
  });

  it('is monotonic non-decreasing across the gust envelope [0,1]', () => {
    let prev = -Infinity;
    for (const gust of [0, 0.25, 0.5, 0.75, 1]) {
      const value = bedGainTarget(gust);
      expect(value).toBeGreaterThanOrEqual(prev);
      prev = value;
    }
  });

  it('reaches base + swell at a full gust', () => {
    expect(bedGainTarget(1)).toBeCloseTo(BED_BASE_GAIN + BED_SWELL_GAIN, 12);
    // Swell is a real bonus on top of the continuous bed, not the whole bed.
    expect(BED_SWELL_GAIN).toBeGreaterThan(0);
  });

  it('base is a faint floor well under the swell — near-silent between gusts, not a constant hiss', () => {
    // The gust-gated redesign: quiet at rest, the swell dominates when a swirl passes.
    expect(BED_BASE_GAIN).toBeLessThan(BED_SWELL_GAIN);
    expect(bedGainTarget(0)).toBeLessThan(bedGainTarget(1) / 2);
  });
});

describe('bedCutoff brightens the bed with the gust (AMBI-02 — airy whoosh, not static hiss)', () => {
  it('is the calm cutoff at gust=0 and the gust cutoff at gust=1', () => {
    expect(bedCutoff(0)).toBeCloseTo(BED_CUTOFF_CALM_HZ, 9);
    expect(bedCutoff(1)).toBeCloseTo(BED_CUTOFF_GUST_HZ, 9);
  });

  it('opens the lowpass — gust cutoff is brighter than calm', () => {
    expect(BED_CUTOFF_GUST_HZ).toBeGreaterThan(BED_CUTOFF_CALM_HZ);
  });

  it('is monotonic non-decreasing across the gust envelope [0,1]', () => {
    let prev = -Infinity;
    for (const gust of [0, 0.25, 0.5, 0.75, 1]) {
      const value = bedCutoff(gust);
      expect(value).toBeGreaterThanOrEqual(prev);
      prev = value;
    }
  });
});

describe('jitterFactor per-shot pitch/pan/volume variation (AMBI-03)', () => {
  it('stays within [1-spread, 1+spread] and is exactly 1 at rand=0.5 (centered)', () => {
    for (const spread of [0.1, 0.15, 0.2]) {
      expect(jitterFactor(spread, 0.5)).toBeCloseTo(1, 12);
      for (const rand of [0, 0.25, 0.5, 0.75, 1]) {
        const factor = jitterFactor(spread, rand);
        expect(factor).toBeGreaterThanOrEqual(1 - spread - 1e-12);
        expect(factor).toBeLessThanOrEqual(1 + spread + 1e-12);
      }
    }
  });

  it('rand=0 is the low edge, rand=1 the high edge', () => {
    expect(jitterFactor(0.2, 0)).toBeCloseTo(0.8, 12);
    expect(jitterFactor(0.2, 1)).toBeCloseTo(1.2, 12);
  });
});

describe('gruntProximityGain nearest-camp falloff (AMBI-05)', () => {
  it('is 1 at/inside the near radius', () => {
    expect(gruntProximityGain(0)).toBe(1);
    expect(gruntProximityGain(GRUNT_NEAR_RADIUS)).toBe(1);
    expect(gruntProximityGain(GRUNT_NEAR_RADIUS - 3)).toBe(1);
  });

  it('is 0 at/beyond the far radius', () => {
    expect(gruntProximityGain(GRUNT_FAR_RADIUS)).toBe(0);
    expect(gruntProximityGain(GRUNT_FAR_RADIUS + 100)).toBe(0);
  });

  it('interpolates monotonically decreasing in (near, far) with a mid value in (0,1)', () => {
    const mid = (GRUNT_NEAR_RADIUS + GRUNT_FAR_RADIUS) / 2;
    const midGain = gruntProximityGain(mid);
    expect(midGain).toBeGreaterThan(0);
    expect(midGain).toBeLessThan(1);
    let prev = Infinity;
    const span = GRUNT_FAR_RADIUS - GRUNT_NEAR_RADIUS;
    for (let i = 0; i <= 10; i += 1) {
      const d = GRUNT_NEAR_RADIUS + (span * i) / 10;
      const value = gruntProximityGain(d);
      expect(value).toBeLessThanOrEqual(prev + 1e-12);
      prev = value;
    }
  });
});

describe('day/night creature gates partition the cycle (AMBI-07, D-11)', () => {
  it('birds by day and crickets/owl by night are mutually exclusive AND exhaustive over phase01', () => {
    for (let p = 0; p < 1; p += 0.001) {
      const day = isBirdTime(p);
      const night = isNightCreatureTime(p);
      // Exactly one is true at every phase — no overlap, no silent gap.
      expect(day).not.toBe(night);
    }
  });

  it('birds sing across the daytime band, night creatures across the night band', () => {
    // Midday is unambiguously bird time; deep night is unambiguously night time.
    expect(isBirdTime(0.5)).toBe(true);
    expect(isNightCreatureTime(0.5)).toBe(false);
    expect(isNightCreatureTime(0.0)).toBe(true);
    expect(isBirdTime(0.0)).toBe(false);
    // Day window opens at DAY_START_PHASE and closes at NIGHT_START_PHASE.
    expect(isBirdTime(DAY_START_PHASE)).toBe(true);
    expect(isBirdTime(NIGHT_START_PHASE - 0.001)).toBe(true);
    expect(isBirdTime(NIGHT_START_PHASE)).toBe(false);
    expect(isBirdTime(DAY_START_PHASE - 0.001)).toBe(false);
  });
});
