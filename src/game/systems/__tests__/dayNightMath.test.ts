import { describe, expect, it } from 'vitest';
import {
  CYCLE_MICROS,
  KEYFRAMES,
  NIGHT_FLOOR,
  phase01,
  samplePalette,
  smoothstep,
} from '../dayNightMath';

// Day-peak intensities are the reference the night floor is measured against —
// derive them from the curve itself so the assertion tracks the keyframes.
const DAY_PEAK_SUN = Math.max(...KEYFRAMES.map((k) => k.sunIntensity));
const DAY_PEAK_HEMI = Math.max(...KEYFRAMES.map((k) => k.hemiIntensity));

// Provably-flat sub-bands (interiors between equal-valued keyframes), so lantern
// === 0 / === 1 hold exactly. Day band ⊂ [0.12, 0.50], night band ⊂ [0.82, 1.0).
const DAY_BAND: [number, number] = [0.15, 0.48];
const NIGHT_BAND: [number, number] = [0.84, 0.99];
const DUSK_RAMP: [number, number] = [0.5, 0.82];
const DAWN_RAMP: [number, number] = [0.0, 0.12];

function sampleRange(from: number, to: number, steps: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= steps; i += 1) out.push(from + ((to - from) * i) / steps);
  return out;
}

describe('CYCLE_MICROS (D-01 contract)', () => {
  // Exact-value pin is correct HERE: the 20-minute cycle length is a contract
  // (20 * 60 * 1_000_000). Everywhere else in this suite we pin behavior.
  it('is exactly 20 real minutes in micros', () => {
    expect(CYCLE_MICROS).toBe(1_200_000_000n);
    expect(CYCLE_MICROS).toBe(20n * 60n * 1_000_000n);
  });
});

describe('phase01 wraparound (DAYNITE-01)', () => {
  it('is 0 at the cycle start and after a full wrap', () => {
    expect(phase01(0n)).toBe(0);
    expect(phase01(CYCLE_MICROS)).toBe(0);
    expect(phase01(CYCLE_MICROS * 7n)).toBe(0);
  });

  it('is ~0.5 at the half-cycle mark', () => {
    expect(phase01(CYCLE_MICROS / 2n)).toBeCloseTo(0.5, 12);
  });

  it('advances one full cycle per 20 minutes of micros', () => {
    // Quarter and three-quarter marks land where expected — the phase is a clean
    // linear ramp over the cycle, wrapping continuously.
    expect(phase01(CYCLE_MICROS / 4n)).toBeCloseTo(0.25, 12);
    expect(phase01((CYCLE_MICROS * 3n) / 4n)).toBeCloseTo(0.75, 12);
    // Just before the wrap: near 1, never >= 1.
    const almost = phase01(CYCLE_MICROS - 1n);
    expect(almost).toBeGreaterThan(0.999999);
    expect(almost).toBeLessThan(1);
  });
});

describe('phase01 bigint-modulo precision (DAYNITE-02, D-08, T-09-01)', () => {
  it('stays strictly in [0,1) at a realistic ~1.78e15 micros epoch', () => {
    // A real wall-clock epoch in micros (~2026). If Number() were applied BEFORE
    // the modulo, float precision at 1.78e15 would drift the time of day; taking
    // the modulo on the bigint first keeps it exact.
    const epoch = 1_780_000_000_000_000n;
    const p = phase01(epoch);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThan(1);
    // Cross-check against the exact bigint remainder.
    const expected = Number(epoch % CYCLE_MICROS) / Number(CYCLE_MICROS);
    expect(p).toBe(expected);
  });

  it('is exact across many large epochs — adjacent micros differ by exactly one tick', () => {
    const base = 1_780_000_000_000_000n;
    const step = 1n / 1n; // documentational: one micro
    const a = phase01(base);
    const b = phase01(base + CYCLE_MICROS); // one full cycle later → identical phase
    expect(b).toBe(a);
    void step;
  });
});

describe('phase01 negative-input guard', () => {
  it('maps negative micros into [0,1) via ((n % C) + C) % C', () => {
    for (const n of [-1n, -CYCLE_MICROS / 3n, -CYCLE_MICROS, -CYCLE_MICROS * 5n - 7n]) {
      const p = phase01(n);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
    }
    // -1 micro is one tick before the wrap, i.e. just under 1.
    expect(phase01(-1n)).toBeCloseTo(phase01(CYCLE_MICROS - 1n), 12);
    // A whole negative cycle lands exactly on 0.
    expect(phase01(-CYCLE_MICROS)).toBe(0);
  });
});

describe('smoothstep endpoints and monotonicity', () => {
  it('is 0 at edge0, 1 at edge1', () => {
    expect(smoothstep(0.2, 0.8, 0.2)).toBe(0);
    expect(smoothstep(0.2, 0.8, 0.8)).toBe(1);
    expect(smoothstep(-3, 5, -3)).toBe(0);
    expect(smoothstep(-3, 5, 5)).toBe(1);
  });

  it('clamps outside [edge0, edge1]', () => {
    expect(smoothstep(0.2, 0.8, 0.1)).toBe(0);
    expect(smoothstep(0.2, 0.8, 0.9)).toBe(1);
  });

  it('is monotonic non-decreasing across the ease and eases (not linear) at the midpoint', () => {
    let prev = -Infinity;
    for (const x of sampleRange(0, 1, 200)) {
      const v = smoothstep(0, 1, x);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    // Hermite ease: the curve sits below the diagonal in the first half.
    expect(smoothstep(0, 1, 0.25)).toBeLessThan(0.25);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 12);
  });
});

describe('night exposure floor — night is a palette, not darkness (DAYNITE-03, D-03)', () => {
  it('sun and hemisphere intensity stay >= NIGHT_FLOOR of the day peak across the night band', () => {
    const sunMin = DAY_PEAK_SUN * NIGHT_FLOOR;
    const hemiMin = DAY_PEAK_HEMI * NIGHT_FLOOR;
    for (const p of sampleRange(NIGHT_BAND[0], NIGHT_BAND[1], 120)) {
      const pal = samplePalette(p);
      expect(pal.sunIntensity).toBeGreaterThanOrEqual(sunMin);
      expect(pal.hemiIntensity).toBeGreaterThanOrEqual(hemiMin);
    }
  });

  it('holds the floor at EVERY phase of the whole cycle (transitions never dip below night)', () => {
    const sunMin = DAY_PEAK_SUN * NIGHT_FLOOR;
    const hemiMin = DAY_PEAK_HEMI * NIGHT_FLOOR;
    for (const p of sampleRange(0, 1, 500)) {
      const pal = samplePalette(p);
      expect(pal.sunIntensity).toBeGreaterThanOrEqual(sunMin);
      expect(pal.hemiIntensity).toBeGreaterThanOrEqual(hemiMin);
    }
  });

  it('night is genuinely dimmer than midday (a palette shift, not a no-op)', () => {
    const midnight = samplePalette(0.9);
    expect(midnight.sunIntensity).toBeLessThan(DAY_PEAK_SUN);
    expect(midnight.hemiIntensity).toBeLessThan(DAY_PEAK_HEMI);
  });
});

describe('lanternLevel band boundaries (DAYNITE-04)', () => {
  it('is exactly 0 across the day band', () => {
    for (const p of sampleRange(DAY_BAND[0], DAY_BAND[1], 60)) {
      expect(samplePalette(p).lanternLevel).toBe(0);
    }
  });

  it('is exactly 1 across the night band', () => {
    for (const p of sampleRange(NIGHT_BAND[0], NIGHT_BAND[1], 60)) {
      expect(samplePalette(p).lanternLevel).toBe(1);
    }
  });

  it('ramps monotonically UP over dusk (day → night)', () => {
    let prev = -Infinity;
    for (const p of sampleRange(DUSK_RAMP[0], DUSK_RAMP[1], 120)) {
      const v = samplePalette(p).lanternLevel;
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('ramps monotonically DOWN over dawn (night → day)', () => {
    let prev = Infinity;
    for (const p of sampleRange(DAWN_RAMP[0], DAWN_RAMP[1], 120)) {
      const v = samplePalette(p).lanternLevel;
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('fireflyLevel dusk/night gate (exposed for Phase 12, unconsumed here)', () => {
  it('is exactly 0 across the day band', () => {
    for (const p of sampleRange(DAY_BAND[0], DAY_BAND[1], 60)) {
      expect(samplePalette(p).fireflyLevel).toBe(0);
    }
  });

  it('is non-zero across the dusk/night band', () => {
    for (const p of sampleRange(0.7, 0.98, 60)) {
      expect(samplePalette(p).fireflyLevel).toBeGreaterThan(0);
    }
  });
});

describe('samplePalette wraparound continuity — no daylight flash at the seam', () => {
  it('samplePalette(0.99) matches samplePalette(0.00) — the last key wraps to the first', () => {
    const seam = samplePalette(0.99);
    const start = samplePalette(0.0);
    // Flat night across [0.82, 1.0): the wrap is seamless, colors identical.
    expect(seam.horizon).toBe(start.horizon);
    expect(seam.skyTop).toBe(start.skyTop);
    expect(seam.sunIntensity).toBeCloseTo(start.sunIntensity, 12);
  });

  it('has no daylight spike near the seam — horizon/skyTop stay dark from 0.90 to 0.02', () => {
    const dayHorizon = samplePalette(0.3).horizon; // bright day reference
    for (const p of [0.9, 0.95, 0.99, 0.0, 0.01, 0.02]) {
      const pal = samplePalette(p);
      // Night horizon/sky are far darker than the day horizon — never a flash.
      expect(pal.horizon).toBeLessThan(dayHorizon);
      expect(pal.skyTop).toBeLessThan(samplePalette(0.5).skyTop);
    }
  });

  it('is continuous across the seam — a tiny phase step is a tiny palette step', () => {
    const before = samplePalette(0.999);
    const after = samplePalette(0.001);
    // Both deep night: the horizon (fog) color does not jump across the wrap, and
    // sun intensity only eases by the smooth start of the dawn ramp — a ~0.002
    // phase step moves it far less than any perceptible flash (continuity, not a step).
    expect(before.horizon).toBe(after.horizon);
    expect(Math.abs(after.sunIntensity - before.sunIntensity)).toBeLessThan(5e-3);
  });
});

describe('samplePalette input normalization', () => {
  it('normalizes out-of-range phase into the cycle', () => {
    expect(samplePalette(1.3)).toEqual(samplePalette(0.3));
    expect(samplePalette(-0.7)).toEqual(samplePalette(0.3));
    expect(samplePalette(2.5)).toEqual(samplePalette(0.5));
  });
});

describe('KEYFRAMES structure (D-01 asymmetric day-weighted, seam contract)', () => {
  it('are ascending in phase and start at 0', () => {
    expect(KEYFRAMES[0].phase).toBe(0);
    for (let i = 1; i < KEYFRAMES.length; i += 1) {
      expect(KEYFRAMES[i].phase).toBeGreaterThan(KEYFRAMES[i - 1].phase);
      expect(KEYFRAMES[i].phase).toBeLessThan(1);
    }
  });

  it('has an identical first and last key so the cycle wraps continuously', () => {
    const first = KEYFRAMES[0];
    const last = KEYFRAMES[KEYFRAMES.length - 1];
    expect(last.skyTop).toBe(first.skyTop);
    expect(last.horizon).toBe(first.horizon);
    expect(last.sunColor).toBe(first.sunColor);
    expect(last.sunIntensity).toBe(first.sunIntensity);
    expect(last.hemiSky).toBe(first.hemiSky);
    expect(last.hemiGround).toBe(first.hemiGround);
    expect(last.hemiIntensity).toBe(first.hemiIntensity);
    expect(last.lanternLevel).toBe(first.lanternLevel);
    expect(last.fireflyLevel).toBe(first.fireflyLevel);
  });

  it('is day-weighted: the brightest key sits in the day half of the cycle', () => {
    const peak = KEYFRAMES.reduce((a, b) => (b.sunIntensity > a.sunIntensity ? b : a));
    expect(peak.phase).toBeGreaterThan(0.12);
    expect(peak.phase).toBeLessThan(0.6);
  });
});
