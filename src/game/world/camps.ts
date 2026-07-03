import { createSeededRandom } from './rng';
import { isOnLand, ISLANDS } from './terrain';
import { SAFE_ZONE_RADIUS } from '../data/constants';

export interface CampSite {
  x: number;
  z: number;
}

const CAMP_SEED = 0x5eed5;
const CITY_ISLAND_CAMP_COUNT = 2;
const CITY_CAMP_MIN_RADIUS = SAFE_ZONE_RADIUS + 14;

/**
 * Deterministic enemy camp locations — one per outer island plus a couple on
 * the city island outskirts. Shared by world props and the enemy system so
 * tents/totems and slime packs land in the same spots on every client.
 */
export function getCampSites(): CampSite[] {
  const random = createSeededRandom(CAMP_SEED);
  const campSites: CampSite[] = [];

  for (const outerIsland of ISLANDS.slice(1)) {
    const angle = random() * Math.PI * 2;
    const distance = random() * outerIsland.radius * 0.4;
    campSites.push({
      x: outerIsland.centerX + Math.cos(angle) * distance,
      z: outerIsland.centerZ + Math.sin(angle) * distance,
    });
  }

  const cityIsland = ISLANDS[0];
  let placedOnCity = 0;
  let attempts = 0;
  while (placedOnCity < CITY_ISLAND_CAMP_COUNT && attempts < 200) {
    attempts++;
    const angle = random() * Math.PI * 2;
    const distance =
      CITY_CAMP_MIN_RADIUS + random() * (cityIsland.radius - 8 - CITY_CAMP_MIN_RADIUS);
    const candidate = { x: Math.cos(angle) * distance, z: Math.sin(angle) * distance };
    if (!isOnLand(candidate.x, candidate.z)) continue;
    campSites.push(candidate);
    placedOnCity++;
  }
  return campSites;
}
