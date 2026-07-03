import { createSeededRandom } from './rng';
import { isOnLand, ISLANDS } from './terrain';
import { SAFE_ZONE_RADIUS } from '../data/constants';
import type { EnemyArchetypeId } from '../data/enemyArchetypes';

export interface CampSite {
  x: number;
  z: number;
  /** Which enemy kind guards this camp — camps own their guards. */
  archetypeId: EnemyArchetypeId;
}

const CAMP_SEED = 0x5eed5;
const CITY_ISLAND_CAMP_COUNT = 2;
const CITY_CAMP_MIN_RADIUS = SAFE_ZONE_RADIUS + 14;
/** Guards per outer island, matching ISLANDS.slice(1) order (hardest = highest). */
const OUTER_ISLAND_ARCHETYPES: EnemyArchetypeId[] = [
  'spikySlime',
  'windWisp',
  'stoneGolem',
  'spikySlime',
];

/**
 * Deterministic enemy camp locations — one per outer island plus a couple on
 * the city island outskirts. Shared by world props and the enemy system so
 * tents/totems and slime packs land in the same spots on every client.
 */
export function getCampSites(): CampSite[] {
  const random = createSeededRandom(CAMP_SEED);
  const campSites: CampSite[] = [];

  ISLANDS.slice(1).forEach((outerIsland, outerIslandIndex) => {
    const angle = random() * Math.PI * 2;
    const distance = random() * outerIsland.radius * 0.4;
    campSites.push({
      x: outerIsland.centerX + Math.cos(angle) * distance,
      z: outerIsland.centerZ + Math.sin(angle) * distance,
      archetypeId: OUTER_ISLAND_ARCHETYPES[outerIslandIndex % OUTER_ISLAND_ARCHETYPES.length],
    });
  });

  const cityIsland = ISLANDS[0];
  let placedOnCity = 0;
  let attempts = 0;
  while (placedOnCity < CITY_ISLAND_CAMP_COUNT && attempts < 200) {
    attempts++;
    const angle = random() * Math.PI * 2;
    const distance =
      CITY_CAMP_MIN_RADIUS + random() * (cityIsland.radius - 8 - CITY_CAMP_MIN_RADIUS);
    const candidateX = Math.cos(angle) * distance;
    const candidateZ = Math.sin(angle) * distance;
    if (!isOnLand(candidateX, candidateZ)) continue;
    campSites.push({ x: candidateX, z: candidateZ, archetypeId: 'slime' });
    placedOnCity++;
  }
  return campSites;
}
