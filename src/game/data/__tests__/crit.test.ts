import { describe, expect, it } from 'vitest';

// Import the real helper across the package boundary (server module → client vitest
// runner), same mechanism as deathPenalty.test.ts — not a local re-implementation.
import { rollCrit } from '../../../../spacetimedb/src/crit';

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
