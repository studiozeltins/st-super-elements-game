import { getTerrainHeight, ISLANDS } from './terrain';

export interface BridgeSpec {
  startX: number;
  startY: number;
  startZ: number;
  endX: number;
  endY: number;
  endZ: number;
  length: number;
}

const BRIDGE_LANDING_INSET = 4;

function bridgeEndpoint(
  fromX: number,
  fromZ: number,
  towardX: number,
  towardZ: number,
  distanceFromCenter: number
): { x: number; y: number; z: number } {
  const directionLength = Math.hypot(towardX - fromX, towardZ - fromZ);
  const directionX = (towardX - fromX) / directionLength;
  const directionZ = (towardZ - fromZ) / directionLength;
  const x = fromX + directionX * distanceFromCenter;
  const z = fromZ + directionZ * distanceFromCenter;
  return { x, y: getTerrainHeight(x, z), z };
}

/** One bridge from the city island to every outer island. Deterministic. */
export function getBridges(): BridgeSpec[] {
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
    return {
      startX: start.x,
      startY: start.y,
      startZ: start.z,
      endX: end.x,
      endY: end.y,
      endZ: end.z,
      length: Math.hypot(end.x - start.x, end.z - start.z),
    };
  });
}
