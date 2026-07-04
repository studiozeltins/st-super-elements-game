// Server-side bridge topology + goliath pathing. A verbatim X/Z port of the
// client's src/game/world/bridges.ts (the client also computes a Y from terrain
// height, which the server neither has nor needs for pathing). The terrain is a
// STAR graph: island 0 is the central city hub; islands 1..4 are outer islands,
// each joined to the city by exactly ONE bridge. bridges[k] connects the city
// (start, on the city edge) to outer island k+1 (end, on the outer island edge).
// serverPathing.test.ts asserts the X/Z stay in step with the client bridges.
import { ISLANDS } from './worldGen';

export interface BridgeSegment {
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
}

// How far inside each island's radius a bridge lands, mirroring the client
// BRIDGE_LANDING_INSET so both sides put the bridge mouths at identical points.
const BRIDGE_LANDING_INSET = 4;

// Walkable half-width of a bridge deck, mirroring the client BRIDGE_WALK_RADIUS.
// A point within this distance of a bridge centerline segment is on the deck.
export const BRIDGE_CORRIDOR_HALF_WIDTH = 1.85;

// A point on the line from (fromX,fromZ) toward (towardX,towardZ), placed
// distanceFromCenter away from the from-point. X/Z only (no terrain height).
function bridgeEndpoint(
  fromX: number,
  fromZ: number,
  towardX: number,
  towardZ: number,
  distanceFromCenter: number
): { x: number; z: number } {
  const directionLength = Math.hypot(towardX - fromX, towardZ - fromZ);
  const directionX = (towardX - fromX) / directionLength;
  const directionZ = (towardZ - fromZ) / directionLength;
  return {
    x: fromX + directionX * distanceFromCenter,
    z: fromZ + directionZ * distanceFromCenter,
  };
}

// One bridge from the city island to every outer island. Deterministic: derived
// purely from ISLANDS geometry, no PRNG. bridges[k] ↔ outer island k+1.
export function getBridges(): BridgeSegment[] {
  const cityIsland = ISLANDS[0];
  return ISLANDS.slice(1).map(outerIsland => {
    const start = bridgeEndpoint(
      cityIsland.centerX,
      cityIsland.centerZ,
      outerIsland.centerX,
      outerIsland.centerZ,
      cityIsland.radius - BRIDGE_LANDING_INSET
    );
    const end = bridgeEndpoint(
      outerIsland.centerX,
      outerIsland.centerZ,
      cityIsland.centerX,
      cityIsland.centerZ,
      outerIsland.radius - BRIDGE_LANDING_INSET
    );
    return { startX: start.x, startZ: start.z, endX: end.x, endZ: end.z };
  });
}

const BRIDGES = getBridges();

// Index of the island whose footprint contains the point, else -1. Islands do
// not overlap, so the first containing island is the only one.
export function islandIndexAt(x: number, z: number): number {
  for (let index = 0; index < ISLANDS.length; index++) {
    const island = ISLANDS[index];
    if (Math.hypot(x - island.centerX, z - island.centerZ) <= island.radius) return index;
  }
  return -1;
}

// Shortest distance from point (px,pz) to segment (ax,az)-(bx,bz). Standard
// clamp-to-[0,1] projection onto the segment.
export function distanceToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  const segmentX = bx - ax;
  const segmentZ = bz - az;
  const segmentLengthSquared = segmentX * segmentX + segmentZ * segmentZ;
  if (segmentLengthSquared === 0) return Math.hypot(px - ax, pz - az);
  const projection = ((px - ax) * segmentX + (pz - az) * segmentZ) / segmentLengthSquared;
  const clamped = Math.max(0, Math.min(1, projection));
  const closestX = ax + clamped * segmentX;
  const closestZ = az + clamped * segmentZ;
  return Math.hypot(px - closestX, pz - closestZ);
}

// Index of a bridge whose deck the point stands on (within the corridor half
// width of its centerline segment), else -1.
export function bridgeIndexAt(x: number, z: number): number {
  for (let index = 0; index < BRIDGES.length; index++) {
    const bridge = BRIDGES[index];
    const distance = distanceToSegment(x, z, bridge.startX, bridge.startZ, bridge.endX, bridge.endZ);
    if (distance <= BRIDGE_CORRIDOR_HALF_WIDTH) return index;
  }
  return -1;
}

// True when the point stands on solid ground: any island footprint or any bridge deck.
export function isWalkable(x: number, z: number): boolean {
  return islandIndexAt(x, z) >= 0 || bridgeIndexAt(x, z) >= 0;
}

// Center of the island nearest the point (used to recover a stranded goliath).
function nearestIslandCenter(x: number, z: number): { x: number; z: number } {
  let nearest = ISLANDS[0];
  let nearestDistance = Infinity;
  for (const island of ISLANDS) {
    const distance = Math.hypot(x - island.centerX, z - island.centerZ);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = island;
    }
  }
  return { x: nearest.centerX, z: nearest.centerZ };
}

// The next point a goliath at (px,pz) heading to (targetX,targetZ) should step
// toward so it always travels along walkable ground, crossing between islands
// ONLY via bridges through the city hub (island 0). Each returned waypoint is
// joined to the goliath's position by a single walkable straight segment
// (convex island interiors + straight bridge corridors), so stepping toward it
// never crosses open void.
export function nextGoliathWaypoint(
  px: number,
  pz: number,
  targetX: number,
  targetZ: number
): { x: number; z: number } {
  const targetIsland = islandIndexAt(targetX, targetZ);
  if (targetIsland < 0) return { x: targetX, z: targetZ }; // target off-island → best effort

  const currentIsland = islandIndexAt(px, pz);
  if (currentIsland === targetIsland) return { x: targetX, z: targetZ }; // same island → direct

  // On the city hub → head to the mouth of the target island's bridge.
  if (currentIsland === 0) {
    const bridge = BRIDGES[targetIsland - 1];
    return { x: bridge.startX, z: bridge.startZ };
  }

  // On an outer island (not the target's) → head down its own bridge toward the city.
  if (currentIsland > 0) {
    const bridge = BRIDGES[currentIsland - 1];
    return { x: bridge.endX, z: bridge.endZ };
  }

  // Over the void: if on a bridge corridor, walk to the far end that advances the
  // trip (toward the target island if this is its bridge, else back to the city).
  const onBridge = bridgeIndexAt(px, pz);
  if (onBridge >= 0) {
    const bridge = BRIDGES[onBridge];
    return targetIsland === onBridge + 1
      ? { x: bridge.endX, z: bridge.endZ }
      : { x: bridge.startX, z: bridge.startZ };
  }

  // Stranded off any bridge over the void → recover to the nearest island center.
  return nearestIslandCenter(px, pz);
}
