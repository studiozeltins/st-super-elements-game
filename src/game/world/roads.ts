import { ISLANDS } from './terrain';
import { getBridges } from './bridges';
import { getCampSites } from './camps';
import type { CampSite } from './camps';

/**
 * Pixel-art roads baked into the terrain (NOT a separate mesh — a road mask the
 * terrain color, the grass placement, and the lantern placement all read, so
 * they can never disagree: the road is dirt-tinted ground, grass never grows on
 * it, and lanterns line it). THREE-free and lazily memoized so it can be shared
 * by the pure terrain/grass math without a render dependency or an import cycle
 * (terrain imports roadFactor; this reads ISLANDS lazily inside functions only,
 * never at module top-level).
 */
export interface RoadPoint {
  x: number;
  z: number;
}

/** Half-width of the walked road surface, plus the soft dirt→grass blend band. */
export const ROAD_HALF_WIDTH = 2.5;
const ROAD_BLEND = 1.2;
/** Where the road leaves the plaza — just outside the stone plaza ring. */
const PLAZA_EXIT_RADIUS = 16;
/** The outer island the road leads to: ISLANDS[4], the NE (top-right) island. */
const DESTINATION_ISLAND_INDEX = 4;

/**
 * Half-width of a worn footpath — narrower than the cart road (people-worn, not
 * cart-worn) — and the maximum mask value a footpath ever reaches. Unlike a road
 * (which fully clears the ground to dirt at factor 1), a footpath only PARTIALLY
 * wears the ground: `footpathFactor` is capped at FOOTPATH_MAX so the tint/grass
 * thinning it drives stays a hint of use, never a bare track. Discretion values,
 * tuned in UAT.
 */
export const FOOTPATH_HALF_WIDTH = 1.1;
export const FOOTPATH_MAX = 0.6;

let cachedRoads: RoadPoint[][] | null = null;
let cachedFootpaths: RoadPoint[][] | null = null;

/**
 * The road polylines that make a continuous dirt path from the CITY out to the
 * northeast island (the "road to the island" the town leads to). Two land
 * segments bracket the wooden bridge crossing (which is its own path already):
 *   1. City side  — plaza edge → the bridge's city-island landing.
 *   2. Island side — the bridge's outer landing → the island center.
 * Deterministic; derived from the same ISLANDS + bridge geometry the world uses,
 * so the road always meets the actual bridge ends.
 */
export function getRoads(): RoadPoint[][] {
  if (cachedRoads) return cachedRoads;
  const roads: RoadPoint[][] = [];

  const island = ISLANDS[DESTINATION_ISLAND_INDEX];
  // ISLANDS.slice(1) drives getBridges(), so ISLANDS[4] is bridge index 3.
  const bridge = getBridges()[DESTINATION_ISLAND_INDEX - 1];

  // Bearing from the city center out toward the destination island.
  const bearingLength = Math.hypot(island.centerX, island.centerZ) || 1;
  const bearingX = island.centerX / bearingLength;
  const bearingZ = island.centerZ / bearingLength;

  // City side: emerge from the plaza edge, run to the bridge's city landing.
  roads.push([
    { x: bearingX * PLAZA_EXIT_RADIUS, z: bearingZ * PLAZA_EXIT_RADIUS },
    { x: bridge.startX, z: bridge.startZ },
  ]);

  // Island side: from the bridge's outer landing in to the island center.
  roads.push([
    { x: bridge.endX, z: bridge.endZ },
    { x: island.centerX, z: island.centerZ },
  ]);

  cachedRoads = roads;
  return roads;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Shortest distance from (px,pz) to the segment (ax,az)→(bx,bz). */
function distanceToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz || 1;
  let t = ((px - ax) * abx + (pz - az) * abz) / lengthSq;
  t = Math.min(1, Math.max(0, t));
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}

/**
 * Road mask at a world point, 0..1: 1 on the road surface, smoothly to 0 past the
 * half-width. The ONE source of truth for "is this a road here" — terrain tints
 * the ground toward dirt by it, grass placement rejects blades above it, and the
 * lantern placement follows the centerline it defines.
 */
export function roadFactor(x: number, z: number): number {
  let best = 0;
  for (const road of getRoads()) {
    for (let i = 0; i < road.length - 1; i += 1) {
      const distance = distanceToSegment(x, z, road[i].x, road[i].z, road[i + 1].x, road[i + 1].z);
      const factor = smoothstep(ROAD_HALF_WIDTH + ROAD_BLEND, ROAD_HALF_WIDTH, distance);
      if (factor > best) best = factor;
    }
  }
  return best;
}

/**
 * The footpath polylines — worn desire-lines along the REAL traffic the world
 * already has, built from the same data-driven anchors as everything else (camps,
 * bridges, plaza), never magic coordinates. Every segment joins two endpoints on
 * the SAME island so `distanceToSegment` can never bake a path across the water
 * gap — the wooden bridge already carries each crossing, and outer islands are
 * reached plaza → bridge → camp, one same-island segment at a time:
 *   - City side of each bridge  — plaza edge → the bridge's city landing.
 *   - Outer side of each bridge — the bridge's outer landing → that island's camp.
 *   - Plaza origin → each city-island camp.
 *   - City camp ↔ city camp (the trodden line between neighbouring outskirts camps).
 * Lazily memoized like `getRoads`; reads camp/bridge geometry inside the function
 * only (no module-top-level world read, so no import cycle).
 */
export function getFootpaths(): RoadPoint[][] {
  if (cachedFootpaths) return cachedFootpaths;
  const footpaths: RoadPoint[][] = [];

  const cityIsland = ISLANDS[0];
  const camps = getCampSites();
  // City-island camps sit within the city island's radius of its centre; the rest
  // are the outer-island camps. Data-driven split — no reliance on archetype ids.
  const isCityCamp = (camp: CampSite): boolean =>
    Math.hypot(camp.x - cityIsland.centerX, camp.z - cityIsland.centerZ) <= cityIsland.radius;
  const cityCamps = camps.filter(isCityCamp);
  const outerCamps = camps.filter(camp => !isCityCamp(camp));

  for (const bridge of getBridges()) {
    // City side: emerge from the plaza edge, run to the bridge's city landing
    // (both endpoints on the city island).
    const bearingLength = Math.hypot(bridge.startX, bridge.startZ) || 1;
    footpaths.push([
      { x: (bridge.startX / bearingLength) * PLAZA_EXIT_RADIUS, z: (bridge.startZ / bearingLength) * PLAZA_EXIT_RADIUS },
      { x: bridge.startX, z: bridge.startZ },
    ]);

    // Outer side: the bridge's outer landing in to that island's camp. The nearest
    // camp to the landing is that same island's camp, so both endpoints share it.
    let nearestOuterCamp: CampSite | null = null;
    let nearestDistance = Infinity;
    for (const camp of outerCamps) {
      const distance = Math.hypot(camp.x - bridge.endX, camp.z - bridge.endZ);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestOuterCamp = camp;
      }
    }
    if (nearestOuterCamp) {
      footpaths.push([
        { x: bridge.endX, z: bridge.endZ },
        { x: nearestOuterCamp.x, z: nearestOuterCamp.z },
      ]);
    }
  }

  // Plaza origin out to each city-island camp (both endpoints on the city island).
  for (const camp of cityCamps) {
    footpaths.push([
      { x: 0, z: 0 },
      { x: camp.x, z: camp.z },
    ]);
  }

  // The trodden line directly between neighbouring city-island camps.
  for (let i = 0; i < cityCamps.length; i += 1) {
    for (let j = i + 1; j < cityCamps.length; j += 1) {
      footpaths.push([
        { x: cityCamps[i].x, z: cityCamps[i].z },
        { x: cityCamps[j].x, z: cityCamps[j].z },
      ]);
    }
  }

  cachedFootpaths = footpaths;
  return footpaths;
}

/**
 * Footpath mask at a world point — a narrower, PARTIAL sibling of `roadFactor`.
 * Same spline machinery (reuses `smoothstep` + `distanceToSegment`, no duplication)
 * over `getFootpaths()`, but at `FOOTPATH_HALF_WIDTH` and scaled by `FOOTPATH_MAX`
 * so the result is capped in [0, FOOTPATH_MAX]: a worn hint, never a full clear
 * like a road. The single source the terrain tint, grass thinning, and surface
 * classifier all read for "is this trodden here". Deliberately kept off the
 * `roadAcross` cart-rut path — footpaths have no wheel ruts.
 */
export function footpathFactor(x: number, z: number): number {
  let best = 0;
  for (const footpath of getFootpaths()) {
    for (let i = 0; i < footpath.length - 1; i += 1) {
      const distance = distanceToSegment(x, z, footpath[i].x, footpath[i].z, footpath[i + 1].x, footpath[i + 1].z);
      const factor = smoothstep(FOOTPATH_HALF_WIDTH + ROAD_BLEND, FOOTPATH_HALF_WIDTH, distance);
      if (factor > best) best = factor;
    }
  }
  return best * FOOTPATH_MAX;
}

/**
 * Signed perpendicular offset (world units) from the nearest road centerline —
 * the cross-road coordinate the terrain shader needs to place two cart-wheel ruts
 * at a fixed gauge either side of centre. 0 off the road; only meaningful where
 * roadFactor > 0.
 */
export function roadAcross(x: number, z: number): number {
  let best = 0;
  let across = 0;
  for (const road of getRoads()) {
    for (let i = 0; i < road.length - 1; i += 1) {
      const ax = road[i].x;
      const az = road[i].z;
      const abx = road[i + 1].x - ax;
      const abz = road[i + 1].z - az;
      const distance = distanceToSegment(x, z, ax, az, road[i + 1].x, road[i + 1].z);
      const factor = smoothstep(ROAD_HALF_WIDTH + ROAD_BLEND, ROAD_HALF_WIDTH, distance);
      if (factor > best) {
        best = factor;
        const length = Math.hypot(abx, abz) || 1;
        // z-component of AB × AP = signed distance to the infinite centerline.
        across = (abx * (z - az) - abz * (x - ax)) / length;
      }
    }
  }
  return across;
}
