import { describe, expect, it } from 'vitest';
import {
  MAX_TRANSCEND_LEVEL,
  RAID_SHARD_PAYOUT,
  SHARD_DEATH_LOSS,
  SHARD_PER_OVERFLOW_DUPE,
  TRANSCEND_DAMAGE_STEP,
  TRANSCEND_HEAL_STEP,
  TRANSCEND_SHARD_COST,
} from '../constants';

describe('transcendence tunables', () => {
  it('every constant is a defined number in a valid range', () => {
    for (const value of [
      MAX_TRANSCEND_LEVEL,
      TRANSCEND_DAMAGE_STEP,
      TRANSCEND_HEAL_STEP,
      SHARD_PER_OVERFLOW_DUPE,
      SHARD_DEATH_LOSS,
      RAID_SHARD_PAYOUT,
    ]) {
      expect(typeof value).toBe('number');
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
  });

  it.each([0, 1, 2, 5, 10])('TRANSCEND_SHARD_COST(%i) === %i', n => {
    expect(TRANSCEND_SHARD_COST(n)).toBe(n);
  });
});
