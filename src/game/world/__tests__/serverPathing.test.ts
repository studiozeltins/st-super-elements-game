// Tests for the server-authoritative goliath pathing (spacetimedb/src/bridges.ts).
// Goliaths must stay on walkable ground (island footprints + bridge decks) and
// cross between islands ONLY over bridges, routing through the city hub. This
// suite also asserts the server bridge geometry stays byte-for-byte (X/Z) in step
// with the client bridges it was ported from.
import { describe, expect, it } from 'vitest';

// Client (source of truth) bridge geometry.
import { getBridges as clientGetBridges } from '../bridges';
import { ISLANDS } from '../terrain';

// Server ports under test.
import {
  BRIDGE_CORRIDOR_HALF_WIDTH,
  bridgeIndexAt,
  distanceToSegment,
  getBridges as serverGetBridges,
  islandIndexAt,
  isWalkable,
  nextGoliathWaypoint,
} from '../../../../spacetimedb/src/bridges';


// Midpoint of a bridge segment (guaranteed on the deck centerline, over the void).
function bridgeMidpoint(bridgeIndex: number) {
  const bridge = serverGetBridges()[bridgeIndex];
  return { x: (bridge.startX + bridge.endX) / 2, z: (bridge.startZ + bridge.endZ) / 2 };
}

describe('server getBridges', () => {
  it('is deterministic: two calls return identical segments', () => {
    expect(serverGetBridges()).toEqual(serverGetBridges());
  });

  it('X/Z matches the client bridges start/end (ignoring the client Y)', () => {
    const server = serverGetBridges();
    const client = clientGetBridges();
    expect(server).toHaveLength(client.length);
    server.forEach((bridge, index) => {
      expect(bridge.startX).toBeCloseTo(client[index].startX, 9);
      expect(bridge.startZ).toBeCloseTo(client[index].startZ, 9);
      expect(bridge.endX).toBeCloseTo(client[index].endX, 9);
      expect(bridge.endZ).toBeCloseTo(client[index].endZ, 9);
    });
  });
});

describe('islandIndexAt', () => {
  it('returns each island index for a point at its center', () => {
    ISLANDS.forEach((island, index) => {
      expect(islandIndexAt(island.centerX, island.centerZ)).toBe(index);
    });
  });

  it('returns -1 for a point in the void between islands', () => {
    // Far outside every footprint (well beyond the archipelago extent).
    expect(islandIndexAt(200, 200)).toBe(-1);
    // Between the city and an outer island but off the bridge line.
    expect(islandIndexAt(48, 40)).toBe(-1);
  });
});

describe('distanceToSegment', () => {
  it('is zero on the segment and the perpendicular distance beside it', () => {
    expect(distanceToSegment(5, 0, 0, 0, 10, 0)).toBeCloseTo(0, 9);
    expect(distanceToSegment(5, 3, 0, 0, 10, 0)).toBeCloseTo(3, 9);
  });

  it('clamps to the nearer endpoint past the segment ends', () => {
    expect(distanceToSegment(-4, 0, 0, 0, 10, 0)).toBeCloseTo(4, 9);
    expect(distanceToSegment(13, 0, 0, 0, 10, 0)).toBeCloseTo(3, 9);
  });
});

describe('bridgeIndexAt / isWalkable', () => {
  it('reports a point on a bridge centerline as on that bridge and walkable', () => {
    serverGetBridges().forEach((_bridge, index) => {
      const mid = bridgeMidpoint(index);
      expect(bridgeIndexAt(mid.x, mid.z)).toBe(index);
      expect(isWalkable(mid.x, mid.z)).toBe(true);
    });
  });

  it('reports a point just off the corridor over the void as not walkable', () => {
    const bridge = serverGetBridges()[0];
    const mid = bridgeMidpoint(0);
    // Perpendicular offset from the deck line, just past the corridor half-width.
    const alongX = bridge.endX - bridge.startX;
    const alongZ = bridge.endZ - bridge.startZ;
    const length = Math.hypot(alongX, alongZ);
    const perpendicularX = -alongZ / length;
    const perpendicularZ = alongX / length;
    const offset = BRIDGE_CORRIDOR_HALF_WIDTH + 0.5;
    const x = mid.x + perpendicularX * offset;
    const z = mid.z + perpendicularZ * offset;
    expect(bridgeIndexAt(x, z)).toBe(-1);
    expect(isWalkable(x, z)).toBe(false);
  });
});

describe('nextGoliathWaypoint routing', () => {
  const cityCenter = { x: ISLANDS[0].centerX, z: ISLANDS[0].centerZ };
  const outerCenter = (islandIndex: number) => ({
    x: ISLANDS[islandIndex].centerX,
    z: ISLANDS[islandIndex].centerZ,
  });

  it('same island → returns the target directly', () => {
    const target = { x: cityCenter.x + 5, z: cityCenter.z + 5 };
    expect(nextGoliathWaypoint(cityCenter.x, cityCenter.z, target.x, target.z)).toEqual(target);
  });

  it('target off every island → returns the target (best effort)', () => {
    const waypoint = nextGoliathWaypoint(cityCenter.x, cityCenter.z, 300, 300);
    expect(waypoint).toEqual({ x: 300, z: 300 });
  });

  it('city → outer island returns that bridge`s city start', () => {
    const bridges = serverGetBridges();
    for (let outer = 1; outer < ISLANDS.length; outer++) {
      const target = outerCenter(outer);
      const waypoint = nextGoliathWaypoint(cityCenter.x, cityCenter.z, target.x, target.z);
      expect(waypoint.x).toBeCloseTo(bridges[outer - 1].startX, 9);
      expect(waypoint.z).toBeCloseTo(bridges[outer - 1].startZ, 9);
    }
  });

  it('outer island → city returns that outer island`s bridge end', () => {
    const bridges = serverGetBridges();
    for (let outer = 1; outer < ISLANDS.length; outer++) {
      const from = outerCenter(outer);
      const waypoint = nextGoliathWaypoint(from.x, from.z, cityCenter.x, cityCenter.z);
      expect(waypoint.x).toBeCloseTo(bridges[outer - 1].endX, 9);
      expect(waypoint.z).toBeCloseTo(bridges[outer - 1].endZ, 9);
    }
  });

  it('outer-A → outer-B first heads to A`s bridge end (toward the hub)', () => {
    const bridges = serverGetBridges();
    const fromA = outerCenter(1);
    const targetB = outerCenter(2);
    const waypoint = nextGoliathWaypoint(fromA.x, fromA.z, targetB.x, targetB.z);
    expect(waypoint.x).toBeCloseTo(bridges[0].endX, 9);
    expect(waypoint.z).toBeCloseTo(bridges[0].endZ, 9);
  });

  it('on bridge A with a B target heads back to A`s city start (not A`s outer end)', () => {
    const bridges = serverGetBridges();
    const midA = bridgeMidpoint(0);
    const targetB = outerCenter(2);
    const waypoint = nextGoliathWaypoint(midA.x, midA.z, targetB.x, targetB.z);
    expect(waypoint.x).toBeCloseTo(bridges[0].startX, 9);
    expect(waypoint.z).toBeCloseTo(bridges[0].startZ, 9);
  });

  it('at a city-side bridge mouth, crosses to the far end (no stuck-at-mouth)', () => {
    // Regression: the mouth sits inside island 0, so islandIndexAt still reports 0
    // there. The waypoint must advance to the outer end instead of re-returning the
    // mouth (which froze the goliath at the bridge entrance).
    const bridges = serverGetBridges();
    for (let outer = 1; outer < ISLANDS.length; outer++) {
      const bridge = bridges[outer - 1];
      const target = outerCenter(outer);
      const waypoint = nextGoliathWaypoint(bridge.startX, bridge.startZ, target.x, target.z);
      expect(waypoint.x).toBeCloseTo(bridge.endX, 9);
      expect(waypoint.z).toBeCloseTo(bridge.endZ, 9);
    }
  });

  it('at an outer bridge mouth, crosses back toward the city (no stuck-at-mouth)', () => {
    const bridges = serverGetBridges();
    for (let outer = 1; outer < ISLANDS.length; outer++) {
      const bridge = bridges[outer - 1];
      const waypoint = nextGoliathWaypoint(bridge.endX, bridge.endZ, cityCenter.x, cityCenter.z);
      expect(waypoint.x).toBeCloseTo(bridge.startX, 9);
      expect(waypoint.z).toBeCloseTo(bridge.startZ, 9);
    }
  });

  it('on bridge B with a B target heads to B`s outer end', () => {
    const bridges = serverGetBridges();
    const midB = bridgeMidpoint(1);
    const targetB = outerCenter(2);
    const waypoint = nextGoliathWaypoint(midB.x, midB.z, targetB.x, targetB.z);
    expect(waypoint.x).toBeCloseTo(bridges[1].endX, 9);
    expect(waypoint.z).toBeCloseTo(bridges[1].endZ, 9);
  });

  it('is deterministic: same inputs → same output', () => {
    const a = nextGoliathWaypoint(outerCenter(1).x, outerCenter(1).z, outerCenter(3).x, outerCenter(3).z);
    const b = nextGoliathWaypoint(outerCenter(1).x, outerCenter(1).z, outerCenter(3).x, outerCenter(3).z);
    expect(a).toEqual(b);
  });
});
