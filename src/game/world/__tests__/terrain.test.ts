import { describe, expect, it } from 'vitest';
import { getTerrainHeight, terrainColorAt, ISLANDS, VOID_DEPTH } from '../terrain';
import { footpathFactor, roadFactor } from '../roads';
import { createSeededRandom } from '../rng';

describe('getTerrainHeight', () => {
  it('is deterministic: two calls with the same coordinates match', () => {
    const random = createSeededRandom(11);
    for (let sample = 0; sample < 25; sample += 1) {
      const x = (random() - 0.5) * 260;
      const z = (random() - 0.5) * 260;
      expect(getTerrainHeight(x, z)).toBe(getTerrainHeight(x, z));
    }
  });

  it('is perfectly flat inside the city center (radius < 20)', () => {
    const random = createSeededRandom(22);
    for (let sample = 0; sample < 25; sample += 1) {
      const angle = random() * Math.PI * 2;
      const distance = random() * 19.9;
      expect(getTerrainHeight(Math.cos(angle) * distance, Math.sin(angle) * distance)).toBe(0);
    }
  });

  it('every island stands on solid ground near its center', () => {
    for (const island of ISLANDS) {
      const height = getTerrainHeight(island.centerX, island.centerZ);
      expect(height).toBeGreaterThanOrEqual(island.baseHeight);
      expect(height).toBeLessThanOrEqual(island.baseHeight + 11);
    }
  });

  it('plunges toward the void away from every island', () => {
    const random = createSeededRandom(33);
    for (let sample = 0; sample < 40; sample += 1) {
      const x = (random() - 0.5) * 260;
      const z = (random() - 0.5) * 260;
      // Beach arcs now carry a shallow sand shelf ~14u past the radius, so only
      // points well beyond that (open ocean) are guaranteed void.
      const isNearAnyIsland = ISLANDS.some(
        island => Math.hypot(x - island.centerX, z - island.centerZ) < island.radius + 15
      );
      if (isNearAnyIsland) continue;
      const height = getTerrainHeight(x, z);
      expect(height).toBeLessThan(-30);
      expect(height).toBeGreaterThanOrEqual(VOID_DEPTH);
    }
  });

  it('keeps land heights within sane bounds on every island interior', () => {
    for (const island of ISLANDS) {
      for (let step = 0; step < 40; step += 1) {
        const angle = (step / 40) * Math.PI * 2;
        const distance = (step % 5) * island.radius * 0.15;
        const x = island.centerX + Math.cos(angle) * distance;
        const z = island.centerZ + Math.sin(angle) * distance;
        const height = getTerrainHeight(x, z);
        expect(height).toBeGreaterThanOrEqual(0);
        expect(height).toBeLessThanOrEqual(island.baseHeight + 12);
      }
    }
  });

  it('has no teleport cliffs on the city island: 0.5-apart samples differ < 2.0', () => {
    const random = createSeededRandom(44);
    for (let sample = 0; sample < 50; sample += 1) {
      const angle = random() * Math.PI * 2;
      const distance = random() * 40;
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      const here = getTerrainHeight(x, z);
      expect(Math.abs(getTerrainHeight(x + 0.5, z) - here)).toBeLessThan(2.0);
      expect(Math.abs(getTerrainHeight(x, z + 0.5) - here)).toBeLessThan(2.0);
    }
  });
});

describe('terrainColorAt footpath tint', () => {
  const colorAt = (x: number, z: number) => terrainColorAt(x, z, getTerrainHeight(x, z));

  /** Grid-scan the city island for a point on a footpath spine that is off any road. */
  const findFootpathOnlyPoint = (): { x: number; z: number } => {
    let best: { x: number; z: number; foot: number } | null = null;
    for (let x = -120; x <= 120; x += 1) {
      for (let z = -120; z <= 120; z += 1) {
        if (roadFactor(x, z) > 0) continue; // must be OFF every road
        const foot = footpathFactor(x, z);
        if (foot > 0 && (!best || foot > best.foot)) best = { x, z, foot };
      }
    }
    if (!best) throw new Error('no footpath-only sample point found');
    return { x: best.x, z: best.z };
  };

  /** Grid-scan for a strong road-centerline point (roadFactor high). */
  const findRoadPoint = (): { x: number; z: number } => {
    let best: { x: number; z: number; road: number } | null = null;
    for (let x = -120; x <= 120; x += 1) {
      for (let z = -120; z <= 120; z += 1) {
        const road = roadFactor(x, z);
        if (road > 0 && (!best || road > best.road)) best = { x, z, road };
      }
    }
    if (!best) throw new Error('no road sample point found');
    return { x: best.x, z: best.z };
  };

  it('shifts the ground color toward the footpath tint on a footpath spine', () => {
    const foot = findFootpathOnlyPoint();
    const footColor = colorAt(foot.x, foot.z);
    // A far-off open-sea point is pure meadow/abyss with no footpath influence.
    // Pick a nearby meadow point off every path so the base color is comparable.
    let meadowColor = colorAt(0, 0);
    for (let r = 3; r < 60; r += 1) {
      const mx = foot.x + r;
      const mz = foot.z + r;
      if (footpathFactor(mx, mz) === 0 && roadFactor(mx, mz) === 0) {
        meadowColor = colorAt(mx, mz);
        break;
      }
    }
    // The footpath tint must actually move the color away from the pure meadow.
    const delta =
      Math.abs(footColor.r - meadowColor.r) +
      Math.abs(footColor.g - meadowColor.g) +
      Math.abs(footColor.b - meadowColor.b);
    expect(delta).toBeGreaterThan(0.005);
  });

  it('reads greener/lighter than the packed-dirt road (footpath is not a road)', () => {
    const foot = findFootpathOnlyPoint();
    const road = findRoadPoint();
    const footColor = colorAt(foot.x, foot.z);
    const roadColor = colorAt(road.x, road.z);
    // FOOTPATH_TINT (0x7d8a54) is green-dominant; ROAD_DIRT (0x9a7a4e) is red-dominant.
    // The footpath must be greener relative to red than the road, and distinctly colored.
    expect(footColor.g - footColor.r).toBeGreaterThan(roadColor.g - roadColor.r);
    const distinct =
      Math.abs(footColor.r - roadColor.r) +
      Math.abs(footColor.g - roadColor.g) +
      Math.abs(footColor.b - roadColor.b);
    expect(distinct).toBeGreaterThan(0.05);
  });

  it('leaves the footpath color green (grass poking through, not bare dirt)', () => {
    const foot = findFootpathOnlyPoint();
    const footColor = colorAt(foot.x, foot.z);
    // Trampled-but-not-bare: green channel still dominates on the footpath spine.
    expect(footColor.g).toBeGreaterThan(footColor.r);
    expect(footColor.g).toBeGreaterThan(footColor.b);
  });
});
