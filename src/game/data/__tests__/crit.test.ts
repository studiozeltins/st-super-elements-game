import { describe, expect, it } from 'vitest';

// Import the real helper across the package boundary (server module → client vitest
// runner), same mechanism as deathPenalty.test.ts — not a local re-implementation.
import { rollCrit } from '../../../../spacetimedb/src/crit';
import { CHARACTERS } from '../characters';

// A tiny deterministic seeded PRNG (mulberry32), local to this test so the
// divergence assertion is a stable regression — never Math.random.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('rollCrit', () => {
  it('crits when rng() < critRate: returns critDmg as the multiplier', () => {
    // rng 0.1 < critRate 0.34 → crit; critDmg 1.9 is echoed verbatim as the multiplier.
    expect(rollCrit(0.34, 1.9, () => 0.1)).toEqual({ isCrit: true, multiplier: 1.9 });
  });

  it('does not crit when rng() >= critRate: multiplier is 1', () => {
    expect(rollCrit(0.34, 1.9, () => 0.99)).toEqual({ isCrit: false, multiplier: 1 });
  });

  it('boundary: rng() exactly equal to critRate does NOT crit (strict <, not <=)', () => {
    expect(rollCrit(0.34, 1.9, () => 0.34)).toEqual({ isCrit: false, multiplier: 1 });
  });

  it('critDmg is stored as a FULL multiplier — echoed verbatim on a crit', () => {
    // critDmg 2.1 comes straight back as multiplier 2.1 (not 1 + 2.1).
    expect(rollCrit(1.0, 2.1, () => 0.0)).toEqual({ isCrit: true, multiplier: 2.1 });
  });
});

// SC2 / CRIT-02: a high-critRate character must visibly crit more often than a
// low-critRate one. This is the automated regression that replaces playtest-only
// coverage — two SEPARATE PRNGs seeded IDENTICALLY consume the same random
// sequence, so the ONLY difference is each character's critRate threshold.
describe('per-character crit frequency divergence (SC2)', () => {
  it('vesper (0.36) crits meaningfully more than glacia (0.10) over shared rolls', () => {
    const N = 2000;
    const SEED = 0x9e3779b9;
    const vesper = CHARACTERS['vesper'];
    const glacia = CHARACTERS['glacia'];

    const rngA = mulberry32(SEED);
    const rngB = mulberry32(SEED);

    let vesperCount = 0;
    let glaciaCount = 0;
    for (let i = 0; i < N; i++) {
      if (rollCrit(vesper.critRate, vesper.critDmg, rngA).isCrit) vesperCount++;
      if (rollCrit(glacia.critRate, glacia.critDmg, rngB).isCrit) glaciaCount++;
    }

    // Same seeded sequence, so divergence is purely the critRate threshold.
    expect(vesperCount).toBeGreaterThan(glaciaCount);
    expect(vesperCount).toBeGreaterThan(glaciaCount * 2);
  });
});
