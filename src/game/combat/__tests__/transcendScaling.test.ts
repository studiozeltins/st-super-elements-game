import { describe, expect, it } from 'vitest';
import { transcendDamageMultiplier } from '../transcendScaling';
import { TRANSCEND_DAMAGE_STEP } from '../../data/constants';

describe('transcendDamageMultiplier', () => {
  it('is 1 with no constellation and no transcend', () => {
    expect(transcendDamageMultiplier(0, 0)).toBeCloseTo(1, 5);
  });

  it('is 1.48 at C6 with no transcend (constellation only)', () => {
    expect(transcendDamageMultiplier(6, 0)).toBeCloseTo(1.48, 5);
  });

  it('adds one transcend step at C6 T1', () => {
    expect(transcendDamageMultiplier(6, 1)).toBeCloseTo(1.53, 5);
  });

  it('is 1.98 at C6 T10 (transcend cap)', () => {
    expect(transcendDamageMultiplier(6, 10)).toBeCloseTo(1.98, 5);
  });

  it('each transcend level adds exactly TRANSCEND_DAMAGE_STEP', () => {
    const delta = transcendDamageMultiplier(6, 4) - transcendDamageMultiplier(6, 3);
    expect(delta).toBeCloseTo(TRANSCEND_DAMAGE_STEP, 5);
  });
});
