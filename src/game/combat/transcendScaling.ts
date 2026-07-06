import { CONSTELLATION_DAMAGE_STEP } from '../data/constellations';
import { TRANSCEND_DAMAGE_STEP } from '../data/constants';

/**
 * Active character's damage multiplier from its power tracks: constellation stars
 * (+8% each, C6 = +48%) plus transcend levels past C6 (+5% each). Pure sibling-data
 * math only — no three.js/DB. Subsumes the local constellationDamageMultiplier in
 * createGame.ts (swapped at its call sites in plan 04).
 */
export function transcendDamageMultiplier(constellation: number, transcend: number): number {
  return 1 + constellation * CONSTELLATION_DAMAGE_STEP + transcend * TRANSCEND_DAMAGE_STEP;
}
