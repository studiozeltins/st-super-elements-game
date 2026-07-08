// Server-side base-damage math, kept dependency-free so it can be unit-tested
// directly under the client's vitest runner (same discipline as combatMath.ts).
// Zero dependencies, no global randomness, no wall-clock time — every input is a
// plain argument, so the calling reducer stays deterministic (CLAUDE.md rule 2).
// This module MIRRORS the client originals VERBATIM; plan 03 pins the parity by
// comparing these exports against src/game/data/weapons.ts and
// src/game/combat/{comboSystem,transcendScaling}.ts.

export type WeaponId = 'sword' | 'greatsword' | 'bow' | 'spear' | 'book';

export interface WeaponDefinition {
  id: WeaponId;
  displayName: string;
  damage: number;
  cooldownSeconds: number;
  range: number;
  isRanged: boolean;
  projectileSpeed: number;
}

// Mirror of src/game/data/weapons.ts WEAPONS — values must match exactly.
export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  sword: {
    id: 'sword',
    displayName: 'Zobens',
    damage: 60,
    cooldownSeconds: 0.45,
    range: 2.4,
    isRanged: false,
    projectileSpeed: 0,
  },
  greatsword: {
    id: 'greatsword',
    displayName: 'Lielais zobens',
    damage: 110,
    cooldownSeconds: 0.9,
    range: 3.0,
    isRanged: false,
    projectileSpeed: 0,
  },
  spear: {
    id: 'spear',
    displayName: 'Šķēps',
    damage: 70,
    cooldownSeconds: 0.55,
    range: 3.4,
    isRanged: false,
    projectileSpeed: 0,
  },
  bow: {
    id: 'bow',
    displayName: 'Loks',
    damage: 55,
    cooldownSeconds: 0.6,
    range: 16,
    isRanged: true,
    projectileSpeed: 24,
  },
  book: {
    id: 'book',
    displayName: 'Grāmata',
    damage: 65,
    cooldownSeconds: 0.7,
    range: 14,
    isRanged: true,
    projectileSpeed: 16,
  },
};

// Mirror of src/game/combat/comboSystem.ts ramp constants + functions.
const REGULAR_RAMP_PER_COMBO = 0.02;
const REGULAR_RAMP_CAP = 0.75;

// Regular attacks get a small, capped boost from the combo.
export function regularAttackMultiplier(combo: number): number {
  return 1 + Math.min(REGULAR_RAMP_CAP, Math.max(0, combo) * REGULAR_RAMP_PER_COMBO);
}

const SKILL_RAMP_PER_COMBO = 0.12;

// The skill (Q) is the combo payoff — it scales strongly and uncapped.
export function skillAttackMultiplier(combo: number): number {
  return 1 + Math.max(0, combo) * SKILL_RAMP_PER_COMBO;
}

// Inlined mirrors of the two power-track steps (kept local to stay dependency-free):
//   CONSTELLATION_DAMAGE_STEP mirrors src/game/data/constellations.ts (0.08)
//   TRANSCEND_DAMAGE_STEP     mirrors src/game/data/constants.ts       (0.05)
const CONSTELLATION_DAMAGE_STEP = 0.08;
const TRANSCEND_DAMAGE_STEP = 0.05;

// Mirror of src/game/combat/transcendScaling.ts — constellation stars (+8% each)
// plus transcend levels past C6 (+5% each).
export function transcendDamageMultiplier(constellation: number, transcend: number): number {
  return 1 + constellation * CONSTELLATION_DAMAGE_STEP + transcend * TRANSCEND_DAMAGE_STEP;
}

// The server-authoritative base damage for one hit. `skillDamage` (when non-null)
// overrides the weapon's base and swaps in the skill ramp; otherwise the weapon's
// base rides the regular ramp. Both are then scaled by the power-track multiplier.
export function computeBaseDamage(input: {
  weaponId: keyof typeof WEAPONS;
  skillDamage: number | null;
  combo: number;
  constellation: number;
  transcend: number;
}): number {
  const base = input.skillDamage ?? WEAPONS[input.weaponId].damage;
  const ramp = input.skillDamage != null ? skillAttackMultiplier(input.combo) : regularAttackMultiplier(input.combo);
  return base * ramp * transcendDamageMultiplier(input.constellation, input.transcend);
}
