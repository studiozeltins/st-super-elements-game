import { createSeededRandom } from './rng';
import { SAFE_ZONE_RADIUS, WORLD_BOUND } from '../data/constants';

export interface CampSite {
  x: number;
  z: number;
}

const CAMP_SEED = 0x5eed5;
const CAMP_COUNT = 5;
const MIN_CAMP_SPACING = 24;
const MIN_CAMP_RADIUS = SAFE_ZONE_RADIUS + 16;
const MAX_CAMP_RADIUS = WORLD_BOUND - 12;

/**
 * Deterministic enemy camp locations — shared by world props and the enemy
 * system so tents/totems and slime packs land in the same spots on every client.
 */
export function getCampSites(): CampSite[] {
  const random = createSeededRandom(CAMP_SEED);
  const campSites: CampSite[] = [];
  let attempts = 0;
  while (campSites.length < CAMP_COUNT && attempts < 200) {
    attempts++;
    const angle = random() * Math.PI * 2;
    const distance = MIN_CAMP_RADIUS + random() * (MAX_CAMP_RADIUS - MIN_CAMP_RADIUS);
    const candidate = { x: Math.cos(angle) * distance, z: Math.sin(angle) * distance };
    const tooClose = campSites.some(
      existing => Math.hypot(existing.x - candidate.x, existing.z - candidate.z) < MIN_CAMP_SPACING
    );
    if (!tooClose) campSites.push(candidate);
  }
  return campSites;
}
