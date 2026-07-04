import { healSpecFor, type CharacterDefinition } from './characters';

// Keep the steps in sync with the damage/heal scaling in createGame.ts and
// spacetimedb/src/index.ts. Constellations are a generic power track here:
// every level adds damage, and healers also gain healing.
export const CONSTELLATION_DAMAGE_STEP = 0.08;
export const CONSTELLATION_HEAL_STEP = 0.15;
export const MAX_CONSTELLATION = 6;

export interface ConstellationBonus {
  level: number;
  title: string;
  effect: string;
}

const STAR_NAMES = [
  'Pirmā zvaigzne',
  'Otrā zvaigzne',
  'Trešā zvaigzne',
  'Ceturtā zvaigzne',
  'Piektā zvaigzne',
  'Sestā zvaigzne',
];

/** The cumulative bonus unlocked at each constellation level, 1..6. */
export function constellationBonuses(character: CharacterDefinition): ConstellationBonus[] {
  const heals = healSpecFor(character.id).type !== 'none';
  return Array.from({ length: MAX_CONSTELLATION }, (_, index) => {
    const level = index + 1;
    const damagePercent = Math.round(level * CONSTELLATION_DAMAGE_STEP * 100);
    const healPercent = Math.round(level * CONSTELLATION_HEAL_STEP * 100);
    const effect = heals
      ? `Bojājums +${damagePercent}% · Dziedināšana +${healPercent}%`
      : `Bojājums +${damagePercent}%`;
    return { level, title: STAR_NAMES[index], effect };
  });
}
