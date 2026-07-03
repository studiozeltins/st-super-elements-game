import { describe, expect, it } from 'vitest';
import { getBridges } from '../bridges';
import type { BridgeSpec } from '../bridges';
import { getTerrainHeight, ISLANDS } from '../terrain';

/** Matches player movement MAX_STEP_UP: a walkable surface never steps more than this. */
const MAX_STEP_UP = 0.9;

describe('getBridges', () => {
  it('is deterministic: two calls return identical specs', () => {
    expect(getBridges()).toEqual(getBridges());
  });

  it('builds exactly one bridge per outer island', () => {
    expect(getBridges()).toHaveLength(ISLANDS.length - 1);
  });

  it('anchors every start on city-island land at terrain height', () => {
    for (const bridge of getBridges()) {
      const terrainHeight = getTerrainHeight(bridge.startX, bridge.startZ);
      expect(terrainHeight).toBeGreaterThan(-1);
      expect(bridge.startY).toBe(terrainHeight);
    }
  });

  it('anchors every end on its outer island land at terrain height', () => {
    const bridges = getBridges();
    bridges.forEach((bridge: BridgeSpec, bridgeIndex: number) => {
      const outerIsland = ISLANDS[bridgeIndex + 1];
      expect(getTerrainHeight(bridge.endX, bridge.endZ)).toBe(bridge.endY);
      expect(bridge.endY).toBeGreaterThanOrEqual(outerIsland.baseHeight - 0.01);
    });
  });

  it('reports length equal to the horizontal distance between endpoints', () => {
    for (const bridge of getBridges()) {
      const expectedLength = Math.hypot(
        bridge.endX - bridge.startX,
        bridge.endZ - bridge.startZ
      );
      expect(Math.abs(bridge.length - expectedLength)).toBeLessThanOrEqual(1e-6);
    }
  });

  it('spans a gap: terrain below every bridge midpoint drops into the void', () => {
    for (const bridge of getBridges()) {
      const midX = (bridge.startX + bridge.endX) / 2;
      const midZ = (bridge.startZ + bridge.endZ) / 2;
      const midTerrainHeight = getTerrainHeight(midX, midZ);
      expect(midTerrainHeight).toBeLessThan(0);
      expect(midTerrainHeight).toBeLessThan(bridge.startY);
    }
  });

  it('keeps the arched deck walkable: consecutive deck steps stay within MAX_STEP_UP', () => {
    for (const bridge of getBridges()) {
      const segments = Math.max(2, Math.ceil(bridge.length / 2));
      let previousDeckY = bridge.startY;
      for (let segment = 1; segment <= segments; segment += 1) {
        const t = segment / segments;
        const deckY =
          bridge.startY +
          (bridge.endY - bridge.startY) * t +
          Math.sin(Math.PI * t) * 1.2;
        expect(Math.abs(deckY - previousDeckY)).toBeLessThanOrEqual(MAX_STEP_UP);
        previousDeckY = deckY;
      }
    }
  });
});
