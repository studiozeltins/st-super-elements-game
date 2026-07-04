// Deterministic world generation ported from the client so the server spawns
// camps at the EXACT positions the client draws camp props (tents/totems). The
// camp algorithm is a verbatim port of getCampSites() in src/game/world/camps.ts;
// determinism comes from the shared mulberry32 PRNG and identical constants.
// src/game/world/__tests__/serverCampParity.test.ts asserts both sides agree.
import { createSeededRandom } from './rng';

export interface IslandDefinition {
  centerX: number;
  centerZ: number;
  radius: number;
}

// Centre + radius of every island, mirroring ISLANDS in
// src/game/world/terrain.ts. Camp placement never reads terrain height, so the
// height/hilliness fields are omitted. Order MUST match the client: the index of
// an island (and therefore of its camp) is part of every enemy's stable id.
export const ISLANDS: IslandDefinition[] = [
  { centerX: 0, centerZ: 0, radius: 46 },
  { centerX: 95, centerZ: 20, radius: 26 },
  { centerX: -80, centerZ: -60, radius: 24 },
  { centerX: -20, centerZ: 100, radius: 22 },
  { centerX: 60, centerZ: -85, radius: 24 },
];

// Solid-ground test by island footprint, mirroring isOnLand() in terrain.ts.
export function isOnLand(positionX: number, positionZ: number): boolean {
  return ISLANDS.some(
    island => Math.hypot(positionX - island.centerX, positionZ - island.centerZ) <= island.radius
  );
}

export type CampArchetypeId = 'slime' | 'spikySlime' | 'windWisp' | 'stoneGolem';

export interface CampSite {
  x: number;
  z: number;
  archetypeId: CampArchetypeId;
}

// All four values mirror src/game/world/camps.ts. SAFE_ZONE_RADIUS mirrors
// src/game/data/constants.ts (18); the parity test guards against drift.
const SAFE_ZONE_RADIUS = 18;
const CAMP_SEED = 0x5eed5;
const CITY_ISLAND_CAMP_COUNT = 2;
const CITY_CAMP_MIN_RADIUS = SAFE_ZONE_RADIUS + 14;
const OUTER_ISLAND_ARCHETYPES: CampArchetypeId[] = [
  'spikySlime',
  'windWisp',
  'stoneGolem',
  'spikySlime',
];

// One camp per outer island plus two on the city-island outskirts, in the exact
// order and at the exact positions getCampSites() produces on the client.
export function generateCampSites(): CampSite[] {
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
