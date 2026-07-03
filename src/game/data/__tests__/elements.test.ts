import { describe, expect, it } from 'vitest';
import {
  ELEMENTS,
  mixElementColors,
  resolveReaction,
  type ElementId,
} from '../elements';

const ELEMENT_IDS = Object.keys(ELEMENTS) as ElementId[];

const REACTING_PAIRS = ELEMENT_IDS.flatMap(a =>
  ELEMENT_IDS.filter(b => b !== a).map(b => [a, b] as const)
);

describe('resolveReaction', () => {
  it.each(ELEMENT_IDS)('returns null when %s meets itself', element => {
    expect(resolveReaction(element, element)).toBeNull();
  });

  it('resolves hydro + pyro to Tvaiks with x1.6 damage', () => {
    expect(resolveReaction('hydro', 'pyro')).toMatchObject({
      name: 'Tvaiks',
      damageMultiplier: 1.6,
      freezes: false,
    });
  });

  it('resolves cryo + pyro to a x2.0 damage reaction', () => {
    expect(resolveReaction('cryo', 'pyro')).toMatchObject({ damageMultiplier: 2.0 });
  });

  it('marks cryo + hydro as the only freezing reaction', () => {
    expect(resolveReaction('cryo', 'hydro')).toMatchObject({
      name: 'Sasalums',
      freezes: true,
    });
    const otherFreezers = REACTING_PAIRS.filter(([a, b]) => {
      const pair = [a, b].sort().join('+');
      return pair !== 'cryo+hydro' && resolveReaction(a, b)?.freezes;
    });
    expect(otherFreezers).toEqual([]);
  });

  it.each(ELEMENT_IDS.filter(id => id !== 'anemo'))(
    'falls back to Izkliede for anemo + %s',
    other => {
      expect(resolveReaction('anemo', other)?.name).toBe('Izkliede');
    }
  );

  it.each(ELEMENT_IDS.filter(id => id !== 'geo' && id !== 'anemo'))(
    'falls back to Kristalizācija for geo + %s',
    other => {
      expect(resolveReaction('geo', other)?.name).toBe('Kristalizācija');
    }
  );

  it('is symmetric: swapping aura and incoming element yields the same reaction', () => {
    for (const [a, b] of REACTING_PAIRS) {
      expect(resolveReaction(a, b)).toEqual(resolveReaction(b, a));
    }
  });

  it('produces a color that differs from both source element colors', () => {
    for (const [a, b] of REACTING_PAIRS) {
      const reaction = resolveReaction(a, b);
      expect(reaction).not.toBeNull();
      expect(reaction!.color).not.toBe(ELEMENTS[a].color);
      expect(reaction!.color).not.toBe(ELEMENTS[b].color);
    }
  });
});

describe('mixElementColors', () => {
  it('produces a valid integer in 0x000000..0xffffff for every element pair', () => {
    for (const [a, b] of REACTING_PAIRS) {
      const mixed = mixElementColors(ELEMENTS[a].color, ELEMENTS[b].color);
      expect(Number.isInteger(mixed)).toBe(true);
      expect(mixed).toBeGreaterThanOrEqual(0x000000);
      expect(mixed).toBeLessThanOrEqual(0xffffff);
    }
  });

  it('clamps each channel to 255 when the blend overflows', () => {
    expect(mixElementColors(0xffffff, 0xffffff)).toBe(0xffffff);
  });

  it('mixes black with black into black', () => {
    expect(mixElementColors(0x000000, 0x000000)).toBe(0x000000);
  });

  it('is commutative', () => {
    expect(mixElementColors(0x3aa0ff, 0xff5c3c)).toBe(mixElementColors(0xff5c3c, 0x3aa0ff));
  });
});
