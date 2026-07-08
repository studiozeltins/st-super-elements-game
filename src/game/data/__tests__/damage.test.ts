import { describe, expect, it } from 'vitest';

// Import the real server exports across the package boundary (server module → client
// vitest runner), same mechanism as deathPenalty.test.ts — not a re-implementation.
import {
  computeBaseDamage,
  WEAPONS,
  regularAttackMultiplier,
  skillAttackMultiplier,
  transcendDamageMultiplier,
} from '../../../../spacetimedb/src/damage';

// Client originals — the server copies must equal these VERBATIM (parity pinned here
// and again by plan 03).
import { WEAPONS as CLIENT_WEAPONS } from '../weapons';
import {
  regularAttackMultiplier as clientRegular,
  skillAttackMultiplier as clientSkill,
} from '../../combat/comboSystem';
import { transcendDamageMultiplier as clientTranscend } from '../../combat/transcendScaling';

const SAMPLE_COMBOS = [0, 1, 3, 7, 12, 25, 50, 100];

describe('WEAPONS mirror', () => {
  it('deep-equals the client weapons record (every field, including displayName)', () => {
    expect(WEAPONS).toEqual(CLIENT_WEAPONS);
  });

  it('preserves the load-bearing base damage values', () => {
    expect(WEAPONS.sword.damage).toBe(60);
    expect(WEAPONS.greatsword.damage).toBe(110);
    expect(WEAPONS.spear.damage).toBe(70);
    expect(WEAPONS.bow.damage).toBe(55);
    expect(WEAPONS.book.damage).toBe(65);
  });
});

describe('regularAttackMultiplier', () => {
  it('is 1 at combo 0 and caps at 1.75 for large combos', () => {
    expect(regularAttackMultiplier(0)).toBe(1);
    expect(regularAttackMultiplier(100)).toBe(1.75); // capped, not 3.0
  });

  it('equals the client function across sampled combos', () => {
    for (const combo of SAMPLE_COMBOS) {
      expect(regularAttackMultiplier(combo)).toBe(clientRegular(combo));
    }
  });
});

describe('skillAttackMultiplier', () => {
  it('is 1 at combo 0 and scales uncapped', () => {
    expect(skillAttackMultiplier(0)).toBe(1);
    expect(skillAttackMultiplier(10)).toBe(1 + 10 * 0.12);
  });

  it('equals the client function across sampled combos', () => {
    for (const combo of SAMPLE_COMBOS) {
      expect(skillAttackMultiplier(combo)).toBe(clientSkill(combo));
    }
  });
});

describe('transcendDamageMultiplier', () => {
  it('applies +8% per constellation and +5% per transcend level', () => {
    expect(transcendDamageMultiplier(0, 0)).toBe(1);
    expect(transcendDamageMultiplier(1, 0)).toBe(1.08);
    expect(transcendDamageMultiplier(0, 1)).toBe(1.05);
  });

  it('equals the client function across sampled power tracks', () => {
    for (const c of [0, 1, 3, 6]) {
      for (const t of [0, 1, 5, 10]) {
        expect(transcendDamageMultiplier(c, t)).toBe(clientTranscend(c, t));
      }
    }
  });
});

describe('computeBaseDamage', () => {
  it('basic attack with no combo/power === the weapon damage', () => {
    expect(
      computeBaseDamage({ weaponId: 'sword', skillDamage: null, combo: 0, constellation: 0, transcend: 0 })
    ).toBe(60);
  });

  it('skill damage overrides weapon damage and uses the skill ramp', () => {
    expect(
      computeBaseDamage({ weaponId: 'sword', skillDamage: 220, combo: 0, constellation: 0, transcend: 0 })
    ).toBe(220);
  });

  it('applies the SKILL ramp when skillDamage != null', () => {
    const combo = 7;
    const expected = 220 * clientSkill(combo) * clientTranscend(0, 0);
    expect(
      computeBaseDamage({ weaponId: 'sword', skillDamage: 220, combo, constellation: 0, transcend: 0 })
    ).toBe(expected);
  });

  it('applies the REGULAR ramp when skillDamage === null', () => {
    const combo = 7;
    const expected = 60 * clientRegular(combo) * clientTranscend(0, 0);
    expect(
      computeBaseDamage({ weaponId: 'sword', skillDamage: null, combo, constellation: 0, transcend: 0 })
    ).toBe(expected);
  });

  it('scales both basic and skill damage by constellation/transcend', () => {
    const basic = computeBaseDamage({ weaponId: 'greatsword', skillDamage: null, combo: 3, constellation: 2, transcend: 4 });
    expect(basic).toBe(110 * clientRegular(3) * clientTranscend(2, 4));

    const skill = computeBaseDamage({ weaponId: 'greatsword', skillDamage: 300, combo: 3, constellation: 2, transcend: 4 });
    expect(skill).toBe(300 * clientSkill(3) * clientTranscend(2, 4));
  });
});
