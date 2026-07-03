import { describe, expect, it } from 'vitest';
import { CHARACTERS, CHARACTER_LIST, STARTER_CHARACTER_ID } from '../characters';
import { ELEMENTS, type ElementId } from '../elements';
import { WEAPONS } from '../weapons';

const ELEMENT_IDS = Object.keys(ELEMENTS) as ElementId[];

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

  it('has exactly 7 five-star and 7 four-star characters (14 total)', () => {
    expect(CHARACTER_LIST).toHaveLength(14);
    expect(CHARACTER_LIST.filter(character => character.stars === 5)).toHaveLength(7);
    expect(CHARACTER_LIST.filter(character => character.stars === 4)).toHaveLength(7);
  });
});

describe('STARTER_CHARACTER_ID', () => {
  it('refers to an existing character', () => {
    expect(CHARACTERS[STARTER_CHARACTER_ID]).toBeDefined();
  });
});
