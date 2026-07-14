import { describe, expect, it } from 'vitest';
import {
  CANOPY,
  FLAG,
  GUST,
  SWAY,
  WANDER,
  flagDrape,
  flagDrapeGlsl,
  flagSwing,
  flagSwingGlsl,
  gustAt,
  gustEnvelope,
  gustGainFactor,
  gustGlsl,
  sampleWind,
  swayGlsl,
  windAngle,
} from '../windMath';

describe('SWAY constants (WIND-01, D-01 verbatim extraction)', () => {
  // Exact-value pins are correct HERE: these nine literals must be byte-identical
  // to the ones hard-coded in the grass shader today. Everywhere else in this
  // suite we pin behavior, not numbers.
  it('pins the nine grass shader literals exactly', () => {
    expect(SWAY.f1).toBe(1.7);
    expect(SWAY.x1).toBe(0.35);
    expect(SWAY.z1).toBe(0.25);
    expect(SWAY.f2).toBe(3.3);
    expect(SWAY.z2).toBe(0.7);
    expect(SWAY.amp2).toBe(0.4);
    expect(SWAY.ampX).toBe(0.85);
    expect(SWAY.ampZ).toBe(0.55);
    expect(SWAY.scale).toBe(0.09);
  });
});

describe('sampleWind (WIND-01 JS mirror of the grass GLSL)', () => {
  it('matches the two-octave grass formula at assorted sample points', () => {
    const samples: Array<[number, number, number]> = [
      [0, 0, 0],
      [1.25, 3.5, -2.75],
      [17.3, -40.2, 12.9],
      [123.456, 8.8, 8.8],
      [999.9, -0.01, 55.5],
    ];
    for (const [t, x, z] of samples) {
      const expected =
        Math.sin(t * 1.7 + x * 0.35 + z * 0.25) + 0.4 * Math.sin(t * 3.3 + z * 0.7);
      expect(sampleWind(t, x, z)).toBeCloseTo(expected, 12);
    }
  });
});

describe('gustEnvelope bounds and rest state (D-01, D-02)', () => {
  it('stays within [0, 1] and rests near 0 most of the time over a simulated hour', () => {
    const step = 0.1;
    let total = 0;
    let nearStill = 0;
    for (let t = 0; t <= 3600; t += step) {
      const value = gustEnvelope(t);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      total += 1;
      if (value < 0.05) nearStill += 1;
    }
    // Gusts are EVENTS: the field is near-still at least 60% of the time.
    expect(nearStill / total).toBeGreaterThanOrEqual(0.6);
  });
});

describe('gust peak cadence (WIND-02, D-02 non-metronomic)', () => {
  it('peaks land roughly every 30-60s with non-uniform gaps over a simulated hour', () => {
    const step = 0.1;
    const values: number[] = [];
    for (let t = 0; t <= 3600; t += step) values.push(gustEnvelope(t));

    const peakTimes: number[] = [];
    for (let i = 1; i < values.length - 1; i += 1) {
      if (values[i] > 0.5 && values[i] >= values[i - 1] && values[i] > values[i + 1]) {
        peakTimes.push(i * step);
      }
    }
    expect(peakTimes.length).toBeGreaterThanOrEqual(3);

    const gaps: number[] = [];
    for (let i = 1; i < peakTimes.length; i += 1) gaps.push(peakTimes[i] - peakTimes[i - 1]);

    let sum = 0;
    let minGap = Infinity;
    let maxGap = -Infinity;
    for (const gap of gaps) {
      // Every individual inter-peak gap is plausible weather, never back-to-back
      // spam and never a dead half hour.
      expect(gap).toBeGreaterThanOrEqual(20);
      expect(gap).toBeLessThanOrEqual(90);
      sum += gap;
      if (gap < minGap) minGap = gap;
      if (gap > maxGap) maxGap = gap;
    }
    const meanGap = sum / gaps.length;
    expect(meanGap).toBeGreaterThanOrEqual(30);
    expect(meanGap).toBeLessThanOrEqual(60);
    // Non-metronomic: perfectly uniform gaps must fail.
    expect(maxGap - minGap).toBeGreaterThan(5);
  });
});

describe('gustAt rigid front translation (WIND-02, D-03)', () => {
  it('the gust front translates rigidly at GUST.speed along the wind direction', () => {
    // Varied deterministic samples (t, x, z, angle, dt) — no RNG in tests either.
    const samples: Array<[number, number, number, number, number]> = [
      [12.5, 3.0, -7.5, 0.3, 0.7],
      [95.2, -22.4, 41.0, 2.1, 1.9],
      [301.7, 55.5, 55.5, 4.6, 0.05],
      [1000.1, -0.5, 0.5, 5.9, 3.3],
      [47.0, 18.0, -33.3, 1.0, 2.5],
    ];
    for (const [t, x, z, angle, dt] of samples) {
      const dirX = Math.cos(angle);
      const dirZ = Math.sin(angle);
      const before = gustAt(t, x, z, dirX, dirZ);
      const after = gustAt(
        t + dt,
        x + dirX * GUST.speed * dt,
        z + dirZ * GUST.speed * dt,
        dirX,
        dirZ
      );
      expect(Math.abs(after - before)).toBeLessThan(1e-9);
    }
  });
});

describe('windAngle wander (D-05, D-06)', () => {
  it('is deterministic — same clock, same angle', () => {
    for (const t of [0, 13.7, 512.4, 3599.9]) {
      expect(windAngle(t)).toBe(windAngle(t));
    }
  });

  it('wanders within a bounded rate of a few degrees per minute', () => {
    const step = 0.5;
    const angles: number[] = [];
    for (let t = 0; t <= 3600; t += step) angles.push(windAngle(t));

    let maxRate = 0;
    for (let i = 1; i < angles.length; i += 1) {
      const rate = Math.abs(angles[i] - angles[i - 1]) / step;
      if (rate > maxRate) maxRate = rate;
    }
    // ≈12°/min upper bound — "a few degrees per minute".
    expect(maxRate).toBeLessThanOrEqual(0.0035);
  });

  it('actually wanders — at least ~2 degrees of range in any 10-minute window', () => {
    const step = 0.5;
    const angles: number[] = [];
    for (let t = 0; t <= 3600; t += step) angles.push(windAngle(t));

    const windowSamples = Math.round(600 / step);
    const stride = Math.round(30 / step);
    let minRange = Infinity;
    for (let start = 0; start + windowSamples < angles.length; start += stride) {
      let low = Infinity;
      let high = -Infinity;
      for (let i = start; i <= start + windowSamples; i += 1) {
        if (angles[i] < low) low = angles[i];
        if (angles[i] > high) high = angles[i];
      }
      if (high - low < minRange) minRange = high - low;
    }
    expect(minRange).toBeGreaterThanOrEqual(0.035);
  });
});

describe('gustGainFactor (D-04, D-12)', () => {
  it('strength 0 restores the exact base formula for any gust value', () => {
    for (const gust of [0, 0.25, 0.5, 1]) {
      expect(gustGainFactor(0, gust)).toBe(1);
    }
  });

  it('full-strength peak gust is a pronounced lean, not a cartoon flattening', () => {
    const peak = gustGainFactor(1, 1);
    expect(peak).toBeGreaterThanOrEqual(2.0);
    expect(peak).toBeLessThanOrEqual(3.5);
  });
});

describe('flagSwing downwind alignment (WIND-01/WIND-03, UAT tests 4/5)', () => {
  it('strength 0 never yaws the cloth off its baked heading, for any gust', () => {
    for (const gust of [0, 0.5, 1]) {
      expect(flagSwing(0, gust)).toBe(0);
    }
  });

  it('is monotonic non-decreasing in strength and in gust', () => {
    const steps = [0, 0.25, 0.5, 0.75, 1];
    for (const gust of steps) {
      let prev = -Infinity;
      for (const strength of steps) {
        const value = flagSwing(strength, gust);
        expect(value).toBeGreaterThanOrEqual(prev);
        prev = value;
      }
    }
    for (const strength of steps) {
      let prev = -Infinity;
      for (const gust of steps) {
        const value = flagSwing(strength, gust);
        expect(value).toBeGreaterThanOrEqual(prev);
        prev = value;
      }
    }
  });

  it('is clamped to at most 1 and gusts visibly increase downwind alignment', () => {
    expect(flagSwing(1, 1)).toBeLessThanOrEqual(1);
    expect(flagSwing(1, 1)).toBeGreaterThan(flagSwing(1, 0));
  });
});

describe('flagDrape limp-hang weight (D-12 ?nowind contract, D-04 gust taut)', () => {
  it('zero strength means full limp hang — exactly 1, for any gust', () => {
    for (const gust of [0, 0.5, 1]) {
      expect(flagDrape(0, gust)).toBe(1);
    }
  });

  it('is monotonic non-increasing in strength and in gust', () => {
    const steps = [0, 0.25, 0.5, 0.75, 1];
    for (const gust of steps) {
      let prev = Infinity;
      for (const strength of steps) {
        const value = flagDrape(strength, gust);
        expect(value).toBeLessThanOrEqual(prev);
        prev = value;
      }
    }
    for (const strength of steps) {
      let prev = Infinity;
      for (const gust of steps) {
        const value = flagDrape(strength, gust);
        expect(value).toBeLessThanOrEqual(prev);
        prev = value;
      }
    }
  });

  it('a full gust at full strength lifts the cloth essentially taut', () => {
    expect(flagDrape(1, 1)).toBeGreaterThanOrEqual(0);
    expect(flagDrape(1, 1)).toBeLessThanOrEqual(0.15);
  });

  it('droops in the lull and lifts under a gust at full strength', () => {
    // Gap 1 (UAT round 2, test 3): in normal play uWindStrength is pinned at 1,
    // so the lull state (gust ~0) MUST be the droop — the continuous in-shader
    // gust envelope, not a constant baseline, drives the lift. A dead-calm full
    // strength cloth is a strong droop, at least 0.6 (was a near-horizontal 0.30).
    expect(flagDrape(1, 0)).toBeGreaterThanOrEqual(0.6);
    // The lull-to-full-gust swing is large: calm droops, a passing gust lifts it
    // toward taut. Big span = the gust envelope owns the pose, not a baseline.
    expect(flagDrape(1, 0) - flagDrape(1, 1)).toBeGreaterThanOrEqual(0.6);
  });
});

describe('per-consumer character ordering (WIND-03)', () => {
  it('flags flap faster than grass; canopies sway slower than grass', () => {
    expect(FLAG.freq).toBeGreaterThan(SWAY.f1);
    expect(SWAY.f1).toBeGreaterThan(CANOPY.freq);
  });
});

describe('GLSL generators (WIND-01 single source of truth)', () => {
  it('swayGlsl renders the SWAY constants as 4-decimal float literals', () => {
    const glsl = swayGlsl('uTime', 'ox', 'oz');
    expect(glsl).toContain('1.7000');
    expect(glsl).toContain('0.3500');
    expect(glsl).toContain('3.3000');
    expect(glsl).toContain('uTime');
    expect(glsl).toContain('ox');
    expect(glsl).toContain('oz');
  });

  it('gustGlsl renders sharpness as a float literal and retards time by the projection', () => {
    const glsl = gustGlsl('uTime', 'proj');
    expect(glsl).toContain(GUST.sharpness.toFixed(4));
    // Retarded time: the projection expression is SUBTRACTED from the time expression.
    expect(glsl).toContain('uTime - proj /');
  });

  it('flagSwingGlsl renders the exact flagSwing closed form from the FLAG constants', () => {
    const glsl = flagSwingGlsl('uWindStrength', 'gustV');
    // Pin the full expression: same constants, 4-decimal literals, injected
    // expressions verbatim — no raw GLSL ints possible by construction.
    expect(glsl).toBe(
      `min(1.0, uWindStrength * (${FLAG.swingBase.toFixed(4)} + ${FLAG.swingGust.toFixed(4)} * gustV))`
    );
  });

  it('flagDrapeGlsl renders the exact flagDrape closed form from the FLAG constants', () => {
    const glsl = flagDrapeGlsl('uWindStrength', 'gustV');
    expect(glsl).toBe(
      `(1.0 - min(1.0, uWindStrength * (${FLAG.drapeLift.toFixed(4)} + ${FLAG.drapeLiftGust.toFixed(4)} * gustV)))`
    );
  });
});
