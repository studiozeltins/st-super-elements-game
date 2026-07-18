import { describe, expect, it } from 'vitest';
import {
  BIRD,
  PECK,
  peckDip,
  FLUSH_COOLDOWN_SEC,
  PULSE,
  SPAWN,
  WANDER,
  beyondCull,
  birdFlight,
  butterflyBob,
  butterflyWander,
  fireflyLevelAt,
  fireflyPulse,
  flushReady,
  inSpawnRing,
  isDayTime,
} from '../wildlifeMath';

// Discipline mirror of windMath.test.ts:22-24 — exact-value pins are correct ONLY for
// the verbatim researcher tunables; everywhere else we pin BEHAVIOUR (bounds, continuity,
// monotonicity, periodicity, boundary correctness), never a fragile magic number.

describe('tunable bundles (verbatim researcher values, single-sourced)', () => {
  it('pins the WANDER / PULSE / SPAWN / BIRD constants and the flush cooldown', () => {
    expect(WANDER.a1).toBe(0.6);
    expect(WANDER.f1).toBe(0.9);
    expect(WANDER.a2).toBe(0.25);
    expect(WANDER.f2).toBe(2.3);
    expect(WANDER.bobAmp).toBe(0.35);
    expect(WANDER.bobFreq).toBe(1.1);
    expect(PULSE.rate).toBe(1.6);
    expect(PULSE.floor).toBe(0.15);
    expect(SPAWN.inner).toBe(8);
    expect(SPAWN.outer).toBe(22);
    expect(SPAWN.cull).toBe(30);
    expect(BIRD.climb).toBe(5.5);
    expect(BIRD.life).toBe(3.2);
    expect(BIRD.fadeStart).toBe(0.9);
    expect(PECK.depth).toBeGreaterThan(0);
    expect(PECK.rate).toBeGreaterThan(0);
    expect(FLUSH_COOLDOWN_SEC).toBe(6);
  });
});

describe('butterflyWander (WILD-01 bounded, continuous, non-repeating flutter)', () => {
  it('never leaves the |x|,|z| <= a1 + a2 flutter box over a simulated minute', () => {
    const bound = WANDER.a1 + WANDER.a2;
    const out = { x: 0, z: 0 };
    for (const seed of [0, 1.3, 4.7, 12.9]) {
      for (let t = 0; t <= 60; t += 0.05) {
        butterflyWander(t, seed, out);
        expect(Math.abs(out.x)).toBeLessThanOrEqual(bound);
        expect(Math.abs(out.z)).toBeLessThanOrEqual(bound);
      }
    }
  });

  it('is an out-param mutator — writes into the caller scratch, allocates nothing fresh', () => {
    const out = { x: 999, z: 999 };
    const ret = butterflyWander(3.14, 2.0, out) as unknown;
    expect(ret).toBeUndefined();
    expect(out.x).not.toBe(999);
    expect(out.z).not.toBe(999);
  });

  it('is continuous — tiny time steps produce tiny position deltas (no jumps)', () => {
    const a = { x: 0, z: 0 };
    const b = { x: 0, z: 0 };
    const seed = 3.3;
    for (let t = 0; t <= 60; t += 0.1) {
      butterflyWander(t, seed, a);
      butterflyWander(t + 0.01, seed, b);
      expect(Math.abs(b.x - a.x)).toBeLessThan(0.05);
      expect(Math.abs(b.z - a.z)).toBeLessThan(0.05);
    }
  });

  it('does not repeat within the minute — two distant instants differ', () => {
    const early = { x: 0, z: 0 };
    const late = { x: 0, z: 0 };
    butterflyWander(2, 1.0, early);
    butterflyWander(47, 1.0, late);
    expect(Math.hypot(late.x - early.x, late.z - early.z)).toBeGreaterThan(0.1);
  });
});

describe('butterflyBob (WILD-01 vertical bob)', () => {
  it('is bounded by WANDER.bobAmp and continuous', () => {
    let prev = butterflyBob(0, 1.0);
    for (let t = 0; t <= 60; t += 0.05) {
      const v = butterflyBob(t, 1.0);
      expect(Math.abs(v)).toBeLessThanOrEqual(WANDER.bobAmp);
      expect(Math.abs(v - prev)).toBeLessThan(0.05);
      prev = v;
    }
  });

  it('decorrelates by seed — different seeds bob differently at the same instant', () => {
    expect(butterflyBob(1.0, 0)).not.toBe(butterflyBob(1.0, 2.5));
  });
});

describe('isDayTime / fireflyLevelAt (WILD-01/WILD-03 day-vs-dusk gate)', () => {
  it('isDayTime is true across the day band, false at dusk/night', () => {
    expect(isDayTime(0.3)).toBe(true);
    expect(isDayTime(0.5)).toBe(true);
    expect(isDayTime(0.66)).toBe(false);
    expect(isDayTime(0.82)).toBe(false);
    expect(isDayTime(0.0)).toBe(false);
  });

  it('fireflyLevelAt is ~0 by day and > 0 at dusk and night', () => {
    expect(fireflyLevelAt(0.3)).toBeLessThan(0.01);
    expect(fireflyLevelAt(0.5)).toBeLessThan(0.01);
    expect(fireflyLevelAt(0.66)).toBeGreaterThan(0);
    expect(fireflyLevelAt(0.82)).toBeGreaterThan(0);
  });

  it('isDayTime is the strict inverse of a lit firefly gate', () => {
    for (const p of [0.0, 0.12, 0.3, 0.5, 0.66, 0.82, 0.95]) {
      expect(isDayTime(p)).toBe(fireflyLevelAt(p) < 0.01);
    }
  });
});

describe('inSpawnRing / beyondCull (WILD-01 spawn-cull annulus)', () => {
  it('inSpawnRing is false inside the inner radius', () => {
    expect(inSpawnRing(SPAWN.inner - 1, 0)).toBe(false);
    expect(inSpawnRing(0, 0)).toBe(false);
  });

  it('inSpawnRing is true between inner and outer radii', () => {
    const mid = (SPAWN.inner + SPAWN.outer) / 2;
    expect(inSpawnRing(mid, 0)).toBe(true);
    expect(inSpawnRing(SPAWN.inner, 0)).toBe(true);
    expect(inSpawnRing(SPAWN.outer, 0)).toBe(true);
  });

  it('inSpawnRing is false beyond the outer radius', () => {
    expect(inSpawnRing(SPAWN.outer + 1, 0)).toBe(false);
  });

  it('beyondCull is false at the cull radius and true just beyond it', () => {
    expect(beyondCull(SPAWN.cull, 0)).toBe(false);
    expect(beyondCull(SPAWN.cull + 0.5, 0)).toBe(true);
    expect(beyondCull(0, 0)).toBe(false);
  });
});

describe('birdFlight (WILD-02 fly-to-a-different-spot takeoff + landing)', () => {
  it('starts grounded (height 0, travel 0) and lands grounded (height ~0, travel 1)', () => {
    const start = { travel: -1, height: -1, visible: -1 };
    const end = { travel: -1, height: -1, visible: -1 };
    birdFlight(0, start);
    birdFlight(1, end);
    expect(start.height).toBeCloseTo(0);
    expect(start.travel).toBe(0);
    expect(end.height).toBeCloseTo(0);
    expect(end.travel).toBeCloseTo(1);
  });

  it('travel advances monotonically 0→1 (fast take-off, gliding arrival)', () => {
    const out = { travel: 0, height: 0, visible: 0 };
    let prev = -Infinity;
    for (let t = 0; t <= 1; t += 0.02) {
      birdFlight(t, out);
      expect(out.travel).toBeGreaterThan(prev - 1e-9);
      expect(out.travel).toBeGreaterThanOrEqual(-1e-9);
      expect(out.travel).toBeLessThanOrEqual(1 + 1e-9);
      prev = out.travel;
    }
  });

  it('height is a takeoff-and-land arch that peaks in the air mid-flight', () => {
    const mid = { travel: 0, height: 0, visible: 0 };
    birdFlight(0.5, mid);
    expect(mid.height).toBeGreaterThan(1); // well off the ground at mid-flight
    expect(mid.height).toBeCloseTo(BIRD.climb); // sin(pi/2) peak
  });

  it('holds visible then fades to 0 by the destination', () => {
    const early = { travel: 0, height: 0, visible: 0 };
    const end = { travel: 0, height: 0, visible: 0 };
    birdFlight(0.2, early);
    birdFlight(1.0, end);
    expect(early.visible).toBe(1);
    expect(end.visible).toBe(0);
  });
});

describe('peckDip (WILD-02 grounded pecking rhythm)', () => {
  it('stays within [0,1] across a long window and any seed', () => {
    for (const seed of [0, 0.3, 1.7, 4.2]) {
      for (let t = 0; t < 20; t += 0.03) {
        const d = peckDip(t, seed);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(1);
      }
    }
  });

  it('rests at 0 for most of each cycle and jabs down within it', () => {
    // Over one full cycle at seed 0: a peak jab early, rest (0) in the back 75%.
    let sawJab = false;
    let sawRest = false;
    const period = 1 / PECK.rate;
    for (let t = 0; t < period; t += period / 200) {
      const d = peckDip(t, 0);
      if (d > 0.9) sawJab = true;
      if (t > period * 0.4 && d === 0) sawRest = true;
    }
    expect(sawJab).toBe(true);
    expect(sawRest).toBe(true);
  });
});

describe('fireflyPulse (WILD-03 shimmer, floored, periodic, decorrelated)', () => {
  it('stays within [floor, 1] across many instants and offsets', () => {
    for (const off of [0, 1.1, 2.7, 5.5]) {
      for (let t = 0; t <= 30; t += 0.05) {
        const v = fireflyPulse(t, off);
        expect(v).toBeGreaterThanOrEqual(PULSE.floor);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is periodic with period 2*PI / rate', () => {
    const period = (2 * Math.PI) / PULSE.rate;
    for (const t of [0, 1.3, 4.6, 9.9]) {
      expect(fireflyPulse(t + period, 0.5)).toBeCloseTo(fireflyPulse(t, 0.5), 10);
    }
  });

  it('decorrelates two instances — different phase offsets differ at the same instant', () => {
    expect(fireflyPulse(1.0, 0)).not.toBeCloseTo(fireflyPulse(1.0, Math.PI), 6);
  });
});

describe('flushReady (WILD-02 flush debounce)', () => {
  it('is false within the cooldown window', () => {
    expect(flushReady(0, FLUSH_COOLDOWN_SEC - 0.1)).toBe(false);
    expect(flushReady(10, 10)).toBe(false);
  });

  it('is true at and after exactly FLUSH_COOLDOWN_SEC', () => {
    expect(flushReady(0, FLUSH_COOLDOWN_SEC)).toBe(true);
    expect(flushReady(0, FLUSH_COOLDOWN_SEC + 5)).toBe(true);
  });
});
