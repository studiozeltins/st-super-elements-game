import { describe, expect, it } from 'vitest';
import { acquireScorchSlot, scorchOpacity, type ScorchSlot } from '../scorchMath';

describe('acquireScorchSlot', () => {
  it('returns the first free slot', () => {
    const slots: (ScorchSlot | null)[] = [
      { activeSince: 1, life: 25, radius: 2 },
      null,
      { activeSince: 2, life: 25, radius: 2 },
    ];
    expect(acquireScorchSlot(slots, 10)).toBe(1);
  });

  it('steals the oldest when full', () => {
    const slots: (ScorchSlot | null)[] = [
      { activeSince: 5, life: 25, radius: 2 },
      { activeSince: 1, life: 25, radius: 2 },
      { activeSince: 9, life: 25, radius: 2 },
    ];
    expect(acquireScorchSlot(slots, 10)).toBe(1);
  });
});

describe('scorchOpacity', () => {
  it('holds at 1 early, reaches 0 at end of life, never increases', () => {
    expect(scorchOpacity(0, 25)).toBe(1);
    expect(scorchOpacity(10, 25)).toBe(1);
    expect(scorchOpacity(25, 25)).toBe(0);
    let previous = 1;
    for (let age = 0; age <= 25; age += 0.5) {
      const value = scorchOpacity(age, 25);
      expect(value).toBeLessThanOrEqual(previous + 1e-9);
      previous = value;
    }
  });
});
