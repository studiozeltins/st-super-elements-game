import { describe, expect, it } from 'vitest';
import { CHARACTERS, CHARACTER_LIST, STARTER_CHARACTER_ID, type Role } from '../characters';
import { ELEMENTS, type ElementId } from '../elements';
import { WEAPONS } from '../weapons';

const ELEMENT_IDS = Object.keys(ELEMENTS) as ElementId[];

// Role-coherent crit bands (mirror the Crit Value Table in 01-02-PLAN.md):
// dps hits hard/often, tanks rarely crit, healer/support sit mid.
const CRIT_BANDS: Record<Role, { critRate: [number, number]; critDmg: [number, number] }> = {
  dps: { critRate: [0.28, 0.4], critDmg: [1.8, 2.3] },
  tank: { critRate: [0.08, 0.16], critDmg: [1.4, 1.6] },
  healer: { critRate: [0.15, 0.22], critDmg: [1.45, 1.75] },
  support: { critRate: [0.15, 0.25], critDmg: [1.45, 1.75] },
};

describe('CHARACTERS roster integrity', () => {
  it.each(CHARACTER_LIST.map(character => [character.id, character] as const))(
    '%s has a valid element, weapon, star tier, and skill numbers',
    (_id, character) => {
      expect(ELEMENT_IDS).toContain(character.element);
      expect(Object.keys(WEAPONS)).toContain(character.weapon);
      expect([4, 5]).toContain(character.stars);
      expect(character.skill.cooldownSeconds).toBeGreaterThan(0);
      expect(character.skill.damage).toBeGreaterThan(0);
    }
  );

  it('uses each record key as the character id (unique ids)', () => {
    for (const [key, character] of Object.entries(CHARACTERS)) {
      expect(character.id).toBe(key);
    }
    const ids = CHARACTER_LIST.map(character => character.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('roster balance across elements', () => {
  it.each(ELEMENT_IDS)('%s has at least 2 characters with both star tiers', element => {
    const ofElement = CHARACTER_LIST.filter(character => character.element === element);
    expect(ofElement.length).toBeGreaterThanOrEqual(2);
    expect(ofElement.some(character => character.stars === 5)).toBe(true);
    expect(ofElement.some(character => character.stars === 4)).toBe(true);
  });

  it('has exactly 10 five-star and 7 four-star characters (17 total)', () => {
    expect(CHARACTER_LIST).toHaveLength(17);
    expect(CHARACTER_LIST.filter(character => character.stars === 5)).toHaveLength(10);
    expect(CHARACTER_LIST.filter(character => character.stars === 4)).toHaveLength(7);
  });
});

describe('per-character crit stats', () => {
  it.each(CHARACTER_LIST.map(character => [character.id, character] as const))(
    '%s has a valid crit rate/damage inside its role band',
    (_id, character) => {
      expect(character.critRate).toBeGreaterThan(0);
      expect(character.critRate).toBeLessThan(1);
      expect(character.critDmg).toBeGreaterThanOrEqual(1);

      const band = CRIT_BANDS[character.role];
      expect(character.critRate).toBeGreaterThanOrEqual(band.critRate[0]);
      expect(character.critRate).toBeLessThanOrEqual(band.critRate[1]);
      expect(character.critDmg).toBeGreaterThanOrEqual(band.critDmg[0]);
      expect(character.critDmg).toBeLessThanOrEqual(band.critDmg[1]);
    }
  );

  it('gives all 17 characters a distinct crit rate (CRIT-01)', () => {
    const critRates = CHARACTER_LIST.map(character => character.critRate);
    expect(critRates).toHaveLength(17);
    expect(new Set(critRates).size).toBe(17);
  });
});

describe('STARTER_CHARACTER_ID', () => {
  it('refers to an existing character', () => {
    expect(CHARACTERS[STARTER_CHARACTER_ID]).toBeDefined();
  });
});
